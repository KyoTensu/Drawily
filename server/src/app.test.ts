import { test } from 'node:test'
import assert from 'node:assert/strict'
import { app } from './app.ts'

test('GET /api/health answers ok', async () => {
  const res = await app.request('/api/health')
  assert.equal(res.status, 200)
  assert.deepEqual(await res.json(), { ok: true })
})
