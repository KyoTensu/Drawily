import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createApp } from './app.ts'
import { openDb } from './db.ts'

const dataDir = mkdtempSync(join(tmpdir(), 'drawily-'))
const db = openDb(':memory:')
const app = createApp('secret', db, dataDir)

const upload = (name: string, content: string | Buffer, token = 'secret') => {
  const body = new FormData()
  body.append('file', new File([content as BlobPart], name))
  return app.request('/api/upload', { method: 'POST', body, headers: { authorization: `Bearer ${token}` } })
}

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

test('upload groups formats of the same drawing and stores the original', async () => {
  const png = await upload('Cat.png', 'png bytes')
  assert.equal(png.status, 201)
  const { drawingId, fileId } = await png.json()
  assert.equal(readFileSync(join(dataDir, 'files', String(drawingId), `${fileId}.png`), 'utf8'), 'png bytes')

  const procreate = await (await upload('Cat.procreate', 'procreate bytes')).json()
  assert.equal(procreate.drawingId, drawingId)
  const dog = await (await upload('Dog.png', 'dog bytes')).json()
  assert.notEqual(dog.drawingId, drawingId)

  // The same name on another day is a new drawing.
  db.prepare("UPDATE drawing SET drawn_on = '2000-01-01' WHERE id = ?").run(drawingId)
  const tomorrow = await (await upload('Cat.psd', 'psd bytes')).json()
  assert.notEqual(tomorrow.drawingId, drawingId)
  assert.equal(db.prepare('SELECT title FROM drawing WHERE id = ?').get(tomorrow.drawingId)!.title, 'Cat')
})

test('upload rejects duplicates, unknown formats and missing auth', async () => {
  assert.equal((await upload('A.png', 'same')).status, 201)
  const dup = await upload('B.png', 'same')
  assert.equal(dup.status, 409)
  assert.equal((await upload('notes.txt', 'x')).status, 415)
  assert.equal((await upload('noext', 'x')).status, 415)
  assert.equal((await upload('C.png', 'x', 'nope')).status, 401)
  assert.equal((await app.request('/api/upload', { method: 'POST', headers: { authorization: 'Bearer secret' } })).status, 400)
})

test('drawings borrow the preview of a format that has one', async () => {
  const preview = (id: number) => app.request(`/api/drawings/${id}/preview`, { headers: { authorization: 'Bearer secret' } })
  const procreate = readFileSync(new URL('./fixtures/sample.procreate', import.meta.url))

  const psdOnly = await (await upload('Bird.psd', 'bird psd bytes')).json()
  assert.equal((await preview(psdOnly.drawingId)).status, 404)

  // Same stem, same day: the .procreate joins the .psd drawing and gives it a preview.
  await upload('Bird.procreate', procreate)
  const res = await preview(psdOnly.drawingId)
  assert.equal(res.status, 200)
  assert.equal(res.headers.get('content-type'), 'image/webp')
})

test('lists drawings with their files and downloads originals', async () => {
  const get = (path: string) => app.request(path, { headers: { authorization: 'Bearer secret' } })
  const { drawingId, fileId } = await (await upload('Fox été.png', 'fox bytes')).json()

  const list = await (await get('/api/drawings')).json()
  const fox = list.find((d: { id: number }) => d.id === drawingId)
  assert.deepEqual(fox.files, [{ id: fileId, format: 'png', filename: 'Fox été.png', size: 9 }])
  assert.match(fox.drawnOn, /^\d{4}-\d{2}-\d{2}$/)

  const file = await get(`/api/files/${fileId}`)
  assert.equal(await file.text(), 'fox bytes')
  assert.equal(file.headers.get('content-disposition'), "attachment; filename*=UTF-8''Fox%20%C3%A9t%C3%A9.png")
  assert.equal((await get('/api/files/99999')).status, 404)
  assert.equal((await get('/api/nope')).headers.get('content-type'), 'application/json')
})
