import { createHash, timingSafeEqual } from 'node:crypto'
import { Hono } from 'hono'
import { getCookie, setCookie } from 'hono/cookie'
import { serveStatic } from '@hono/node-server/serve-static'

const webDist = new URL('../../web/dist/', import.meta.url).pathname
const COOKIE = 'drawily_token'

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

export function createApp(token: string) {
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

  app.use('/*', serveStatic({ root: webDist }))

  return app
}
