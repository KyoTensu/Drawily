import { Hono } from 'hono'
import { serveStatic } from '@hono/node-server/serve-static'

const webDist = new URL('../../web/dist/', import.meta.url).pathname

export const app = new Hono()

app.get('/api/health', (c) => c.json({ ok: true }))

app.use('/*', serveStatic({ root: webDist }))
