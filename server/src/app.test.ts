import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
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

test('merge moves files into a drawing and split moves one back out', async () => {
  const post = (path: string, body?: object) =>
    app.request(path, { method: 'POST', body: JSON.stringify(body), headers: { authorization: 'Bearer secret', 'content-type': 'application/json' } })
  const filesOf = (id: number) => db.prepare('SELECT id FROM file WHERE drawing_id = ? ORDER BY id').all(id).map((f) => f.id)

  const a = await (await upload('Owl.png', 'owl png')).json()
  const b = await (await upload('Owl sketch.psd', 'owl psd')).json()
  assert.notEqual(a.drawingId, b.drawingId)

  assert.equal((await post(`/api/drawings/${a.drawingId}/merge`, { from: a.drawingId })).status, 400)
  assert.equal((await post(`/api/drawings/${a.drawingId}/merge`, { from: 99999 })).status, 404)
  assert.equal((await post(`/api/drawings/${a.drawingId}/merge`, { from: b.drawingId })).status, 200)
  assert.deepEqual(filesOf(a.drawingId), [a.fileId, b.fileId])
  assert.equal(db.prepare('SELECT 1 FROM drawing WHERE id = ?').get(b.drawingId), undefined)
  assert.equal(readFileSync(join(dataDir, 'files', String(a.drawingId), `${b.fileId}.psd`), 'utf8'), 'owl psd')
  assert.equal(existsSync(join(dataDir, 'files', String(b.drawingId))), false)

  const split = await post(`/api/files/${b.fileId}/split`)
  assert.equal(split.status, 201)
  const { drawingId } = await split.json()
  assert.deepEqual(filesOf(drawingId), [b.fileId])
  assert.equal(db.prepare('SELECT title FROM drawing WHERE id = ?').get(drawingId)!.title, 'Owl sketch')
  assert.equal(readFileSync(join(dataDir, 'files', String(drawingId), `${b.fileId}.psd`), 'utf8'), 'owl psd')
  assert.equal((await post(`/api/files/${b.fileId}/split`)).status, 400)
})

test('a merge that fails halfway puts everything back', async () => {
  const into = await (await upload('Moth.png', 'moth png')).json()
  const first = await (await upload('Moth b.png', 'moth b png')).json()
  const second = await (await upload('Moth b.psd', 'moth b psd')).json()
  rmSync(join(dataDir, 'files', String(second.drawingId), `${second.fileId}.psd`)) // makes the second move fail

  const res = await app.request(`/api/drawings/${into.drawingId}/merge`, {
    method: 'POST',
    body: JSON.stringify({ from: first.drawingId }),
    headers: { authorization: 'Bearer secret', 'content-type': 'application/json' },
  })
  assert.equal(res.status, 500)
  assert.equal(db.prepare('SELECT drawing_id FROM file WHERE id = ?').get(first.fileId)!.drawing_id, first.drawingId)
  assert.equal(readFileSync(join(dataDir, 'files', String(first.drawingId), `${first.fileId}.png`), 'utf8'), 'moth b png')
})
