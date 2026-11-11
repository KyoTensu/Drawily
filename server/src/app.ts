import { createHash, timingSafeEqual } from 'node:crypto'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { DatabaseSync } from 'node:sqlite'
import { Hono } from 'hono'
import { getCookie, setCookie } from 'hono/cookie'
import { serveStatic } from '@hono/node-server/serve-static'

const webDist = new URL('../../web/dist/', import.meta.url).pathname
const COOKIE = 'drawily_token'
const FORMATS = new Set(['procreate', 'png', 'jpg', 'jpeg', 'psd', 'pdf', 'tif', 'tiff', 'mp4'])

// Today's date (YYYY-MM-DD) in the process timezone, which Node takes from TZ.
const today = () => new Intl.DateTimeFormat('en-CA').format(new Date())
const splitName = (name: string) => {
  const dot = name.lastIndexOf('.')
  return dot > 0 ? { stem: name.slice(0, dot), format: name.slice(dot + 1).toLowerCase() } : { stem: name, format: '' }
}

const loginPage = (error = '') => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Drawily – log in</title></head>
<body style="font-family: system-ui; max-width: 20rem; margin: 4rem auto; padding: 0 1rem">
<h1>Drawily</h1>
<form method="post" action="/api/login">
  <label>Token <input type="password" name="token" autocomplete="current-password" required autofocus></label>
  <button>Log in</button>
</form>
${error && `<p role="alert">${error}</p>`}
</body></html>`

export function createApp(token: string, db: DatabaseSync, dataDir: string) {
  const digest = (s: string) => createHash('sha256').update(s).digest()
  const expected = digest(token)
  // Hashing first gives equal lengths, so the compare is constant-time.
  const isValid = (s: string | undefined) => s !== undefined && timingSafeEqual(digest(s), expected)

  const app = new Hono()

  app.get('/api/login', (c) => c.html(loginPage()))

  app.post('/api/login', async (c) => {
    const { token: given } = await c.req.parseBody()
    if (typeof given !== 'string' || !isValid(given)) return c.html(loginPage('Wrong token.'), 401)
    const https = new URL(c.req.url).protocol === 'https:' || c.req.header('x-forwarded-proto') === 'https'
    setCookie(c, COOKIE, given, {
      httpOnly: true,
      sameSite: 'Lax',
      secure: https,
      path: '/',
      maxAge: 400 * 24 * 3600, // browsers cap cookies at 400 days
    })
    return c.redirect('/')
  })

  // Everything else needs the token: Bearer header (iOS Shortcut) or the login cookie (browser).
  app.use('*', async (c, next) => {
    const bearer = c.req.header('authorization')?.match(/^Bearer (.+)$/)?.[1]
    if (isValid(bearer) || isValid(getCookie(c, COOKIE))) return next()
    if (c.req.path.startsWith('/api/')) return c.json({ error: 'unauthorized' }, 401)
    return c.redirect('/api/login')
  })

  app.get('/api/health', (c) => c.json({ ok: true }))

  app.post('/api/upload', async (c) => {
    // shortcut: the whole file is buffered in memory, fine for one user; stream to disk if uploads get huge.
    const { file } = await c.req.parseBody()
    if (!(file instanceof File) || !file.name) return c.json({ error: 'expected a file in field "file"' }, 400)
    const filename = file.name.split(/[\\/]/).pop()!
    const { stem, format } = splitName(filename)
    if (!FORMATS.has(format)) return c.json({ error: `unsupported format: ${format || 'none'}` }, 415)

    const bytes = new Uint8Array(await file.arrayBuffer())
    const sha256 = createHash('sha256').update(bytes).digest('hex')
    const dup = db.prepare('SELECT drawing_id FROM file WHERE sha256 = ?').get(sha256)
    if (dup) return c.json({ error: 'duplicate', drawingId: dup.drawing_id }, 409)

    // Join a drawing from today that already has a file with the same stem, else start a new one.
    const drawnOn = today()
    const sameDay = db
      .prepare('SELECT f.drawing_id, f.filename FROM file f JOIN drawing d ON d.id = f.drawing_id WHERE d.drawn_on = ?')
      .all(drawnOn)
    const match = sameDay.find((r) => splitName(r.filename as string).stem === stem)

    // DB calls are sync, so no other upload can slip in between the duplicate check and these inserts.
    const drawingId = match
      ? Number(match.drawing_id)
      : Number(db.prepare('INSERT INTO drawing (title, drawn_on) VALUES (?, ?)').run(stem, drawnOn).lastInsertRowid)
    const fileId = Number(
      db
        .prepare('INSERT INTO file (drawing_id, format, filename, size, sha256) VALUES (?, ?, ?, ?, ?)')
        .run(drawingId, format, filename, bytes.length, sha256).lastInsertRowid,
    )

    // Stored as <file-id>.<format>: no clash between same-named uploads, no path tricks from the filename.
    const dir = join(dataDir, 'files', String(drawingId))
    const path = join(dir, `${fileId}.${format}`)
    try {
      await mkdir(dir, { recursive: true })
      await writeFile(path, bytes)
    } catch (err) {
      await rm(path, { force: true })
      db.prepare('DELETE FROM file WHERE id = ?').run(fileId)
      if (!match) db.prepare('DELETE FROM drawing WHERE id = ?').run(drawingId)
      throw err
    }
    return c.json({ drawingId, fileId }, 201)
  })

  app.use('/*', serveStatic({ root: webDist }))

  return app
}
