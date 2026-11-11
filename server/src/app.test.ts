import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createApp } from './app.ts'
import { openDb } from './db.ts'

const app = createApp('secret')

test('API needs the token', async () => {
  assert.equal((await app.request('/api/health')).status, 401)
  const wrong = await app.request('/api/health', { headers: { authorization: 'Bearer nope' } })
  assert.equal(wrong.status, 401)
})

test('Bearer token opens the API', async () => {
  const res = await app.request('/api/health', { headers: { authorization: 'Bearer secret' } })
  assert.equal(res.status, 200)
  assert.deepEqual(await res.json(), { ok: true })
})

test('pages redirect to login when logged out', async () => {
  const res = await app.request('/')
  assert.equal(res.status, 302)
  assert.equal(res.headers.get('location'), '/api/login')
  assert.equal((await app.request('/api/login')).status, 200)
})

test('login sets a cookie that opens the API', async () => {
  const login = (token: string) => app.request('/api/login', { method: 'POST', body: new URLSearchParams({ token }) })
  assert.equal((await login('nope')).status, 401)

  const res = await login('secret')
  assert.equal(res.status, 302)
  const cookie = res.headers.get('set-cookie')!.split(';')[0]
  assert.match(res.headers.get('set-cookie')!, /HttpOnly/)
  assert.equal((await app.request('/api/health', { headers: { cookie } })).status, 200)
})

test('database rejects duplicate sha256', () => {
  const db = openDb(':memory:')
  const { lastInsertRowid } = db.prepare("INSERT INTO drawing (title, drawn_on) VALUES ('cat', '2026-11-11')").run()
  const addFile = db.prepare("INSERT INTO file (drawing_id, format, filename, size, sha256) VALUES (?, 'png', 'cat.png', 1, 'abc')")
  addFile.run(lastInsertRowid)
  assert.throws(() => addFile.run(lastInsertRowid), /UNIQUE/)
})
