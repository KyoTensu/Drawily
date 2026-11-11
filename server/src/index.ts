import { serve } from '@hono/node-server'
import { createApp } from './app.ts'
import { openDb } from './db.ts'

const token = process.env.APP_TOKEN
if (!token) {
  console.error('APP_TOKEN is required (see .env.example)')
  process.exit(1)
}
const port = Number(process.env.PORT ?? 3000)

openDb(process.env.DATA_DIR ?? '/data')
const app = createApp(token)

serve({ fetch: app.fetch, port }, (info) => console.log(`Drawily listening on :${info.port}`))
