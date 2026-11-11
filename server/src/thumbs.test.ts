import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import sharp from 'sharp'
import { makeThumb, readZipEntry } from './thumbs.ts'

const procreate = readFileSync(new URL('./fixtures/sample.procreate', import.meta.url))

test('reads the thumbnail out of a .procreate zip', async () => {
  const png = readZipEntry(procreate, 'QuickLook/Thumbnail.png')!
  assert.deepEqual(await sharp(png).metadata().then((m) => [m.format, m.width]), ['png', 300])
  assert.equal(readZipEntry(procreate, 'missing.png'), null)
  assert.equal(readZipEntry(Buffer.from('not a zip'), 'QuickLook/Thumbnail.png'), null)
})

test('makes a WebP preview that fits in 600px', async () => {
  const big = await sharp({ create: { width: 2000, height: 1000, channels: 3, background: 'red' } }).png().toBuffer()
  const meta = await sharp((await makeThumb(big, 'png'))!).metadata()
  assert.deepEqual([meta.format, meta.width, meta.height], ['webp', 600, 300])
  assert.equal((await sharp((await makeThumb(procreate, 'procreate'))!).metadata()).width, 300)
  assert.equal(await makeThumb(big, 'psd'), null)
  await assert.rejects(makeThumb(Buffer.from('broken'), 'png'))
})
