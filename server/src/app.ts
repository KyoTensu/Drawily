import { createHash, timingSafeEqual } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, readFile, rename, rm, rmdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import type { DatabaseSync, SQLOutputValue } from 'node:sqlite'
import { Hono } from 'hono'
import { getCookie, setCookie } from 'hono/cookie'
import { serveStatic } from '@hono/node-server/serve-static'
import { makeThumb, PREVIEW_FORMATS } from './thumbs.ts'

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

  const filePath = (drawingId: SQLOutputValue, fileId: SQLOutputValue, format: SQLOutputValue) =>
    join(dataDir, 'files', String(drawingId), `${fileId}.${format}`)

  // Moves files on disk into another drawing's folder, then updates the DB; undoes the moves if anything fails.
  // shortcut: two merges/splits of the same drawings at the same moment could interleave; fine for one user.
  async function moveFiles(files: Record<string, SQLOutputValue>[], to: number, updateDb: () => void) {
    const moved: typeof files = []
    try {
      await mkdir(join(dataDir, 'files', String(to)), { recursive: true })
      for (const f of files) {
        await rename(filePath(f.drawing_id, f.id, f.format), filePath(to, f.id, f.format))
        moved.push(f)
      }
      db.exec('BEGIN')
      try {
        updateDb()
        db.exec('COMMIT')
      } catch (err) {
        db.exec('ROLLBACK')
        throw err
      }
    } catch (err) {
      for (const f of moved) await rename(filePath(to, f.id, f.format), filePath(f.drawing_id, f.id, f.format)).catch(() => {})
      throw err
    }
    // Drop folders left empty; rmdir refuses non-empty ones.
    for (const d of new Set(files.map((f) => f.drawing_id))) await rmdir(join(dataDir, 'files', String(d))).catch(() => {})
  }

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

    const bytes = Buffer.from(await file.arrayBuffer())
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

    // The original is safe now; a broken preview only means the drawing shows without one.
    try {
      const thumb = await makeThumb(bytes, format)
      if (thumb) {
        await mkdir(join(dataDir, 'thumbs'), { recursive: true })
        await writeFile(join(dataDir, 'thumbs', `${fileId}.webp`), thumb)
      }
    } catch (err) {
      console.error(`No preview for file ${fileId} (${filename}):`, err)
    }
    return c.json({ drawingId, fileId }, 201)
  })

  app.get('/api/drawings/:id/preview', async (c) => {
    const files = db
      .prepare('SELECT id, format FROM file WHERE drawing_id = ?')
      .all(c.req.param('id'))
      .filter((f) => PREVIEW_FORMATS.includes(f.format as string))
      .sort((a, b) => PREVIEW_FORMATS.indexOf(a.format as string) - PREVIEW_FORMATS.indexOf(b.format as string))
    for (const f of files) {
      const thumb = await readFile(join(dataDir, 'thumbs', `${f.id}.webp`)).catch(() => null)
      if (thumb) return c.body(thumb, 200, { 'content-type': 'image/webp' })
    }
    return c.json({ error: 'no preview' }, 404)
  })

  app.get('/api/drawings', (c) => {
    const rows = db
      .prepare(
        `SELECT d.id, d.title, d.drawn_on AS drawnOn,
           json_group_array(json_object('id', f.id, 'format', f.format, 'filename', f.filename, 'size', f.size)) AS files
         FROM drawing d JOIN file f ON f.drawing_id = d.id
         GROUP BY d.id ORDER BY d.drawn_on DESC, d.id DESC`,
      )
      .all()
    return c.json(rows.map((r) => ({ ...r, files: JSON.parse(r.files as string) })))
  })

  app.get('/api/files/:id', (c) => {
    const f = db.prepare('SELECT drawing_id, format, filename, size FROM file WHERE id = ?').get(c.req.param('id'))
    if (!f) return c.json({ error: 'not found' }, 404)
    const stream = createReadStream(join(dataDir, 'files', String(f.drawing_id), `${c.req.param('id')}.${f.format}`))
    return c.body(Readable.toWeb(stream) as ReadableStream, 200, {
      'content-type': 'application/octet-stream',
      'content-length': String(f.size),
      'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(f.filename as string)}`,
    })
  })

  app.post('/api/drawings/:id/merge', async (c) => {
    const id = Number(c.req.param('id'))
    const { from } = await c.req.json().catch(() => ({}))
    if (!Number.isInteger(from) || from === id) return c.json({ error: 'expected "from": the id of another drawing' }, 400)
    if (!db.prepare('SELECT 1 FROM drawing WHERE id = ?').get(id)) return c.json({ error: 'drawing not found' }, 404)
    const files = db.prepare('SELECT id, drawing_id, format FROM file WHERE drawing_id = ?').all(from)
    if (!files.length) return c.json({ error: 'drawing not found' }, 404)
    await moveFiles(files, id, () => {
      db.prepare('UPDATE file SET drawing_id = ? WHERE drawing_id = ?').run(id, from)
      db.prepare('DELETE FROM drawing WHERE id = ?').run(from)
    })
    return c.json({ drawingId: id })
  })

  app.post('/api/files/:id/split', async (c) => {
    const f = db
      .prepare('SELECT f.id, f.drawing_id, f.format, f.filename, d.drawn_on FROM file f JOIN drawing d ON d.id = f.drawing_id WHERE f.id = ?')
      .get(c.req.param('id'))
    if (!f) return c.json({ error: 'file not found' }, 404)
    const siblings = db.prepare('SELECT count(*) AS n FROM file WHERE drawing_id = ?').get(f.drawing_id)!
    if (Number(siblings.n) < 2) return c.json({ error: 'this is the only file of its drawing' }, 400)

    const title = splitName(f.filename as string).stem
    const drawingId = Number(db.prepare('INSERT INTO drawing (title, drawn_on) VALUES (?, ?)').run(title, f.drawn_on).lastInsertRowid)
    try {
      await moveFiles([f], drawingId, () => db.prepare('UPDATE file SET drawing_id = ? WHERE id = ?').run(drawingId, f.id))
    } catch (err) {
      db.prepare('DELETE FROM drawing WHERE id = ?').run(drawingId)
      throw err
    }
    return c.json({ drawingId }, 201)
  })

  app.all('/api/*', (c) => c.json({ error: 'not found' }, 404))

  app.use('/*', serveStatic({ root: webDist }))
  // Client-side routes like /timeline load the app, which picks the view.
  app.get('*', serveStatic({ path: join(webDist, 'index.html') }))

  return app
}
