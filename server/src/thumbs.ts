import { inflateRawSync } from 'node:zlib'
import sharp from 'sharp'

// Formats that can give a preview, best first. Other formats borrow one from their drawing.
export const PREVIEW_FORMATS = ['png', 'jpg', 'jpeg', 'procreate']

// Reads one entry of a zip held in memory, using the central directory (sizes there are always set).
// shortcut: no zip64, so archives over 4 GB are not read; .procreate files stay far below that.
export function readZipEntry(zip: Buffer, name: string): Buffer | null {
  const eocd = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]))
  if (eocd < 0) return null
  const count = zip.readUInt16LE(eocd + 10)
  let p = zip.readUInt32LE(eocd + 16)
  for (let i = 0; i < count; i++) {
    if (zip.readUInt32LE(p) !== 0x02014b50) return null
    const method = zip.readUInt16LE(p + 10)
    const size = zip.readUInt32LE(p + 20)
    const nameLen = zip.readUInt16LE(p + 28)
    if (zip.toString('utf8', p + 46, p + 46 + nameLen) === name) {
      const local = zip.readUInt32LE(p + 42)
      const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28)
      const data = zip.subarray(start, start + size)
      if (method === 0) return data
      if (method === 8) return inflateRawSync(data, { maxOutputLength: 64 * 1024 * 1024 })
      return null
    }
    p += 46 + nameLen + zip.readUInt16LE(p + 30) + zip.readUInt16LE(p + 32)
  }
  return null
}

// Returns a WebP preview, or null for formats that have none. Throws on broken files.
export async function makeThumb(bytes: Buffer, format: string): Promise<Buffer | null> {
  const source =
    format === 'procreate' ? readZipEntry(bytes, 'QuickLook/Thumbnail.png') : PREVIEW_FORMATS.includes(format) ? bytes : null
  if (!source) return null
  return sharp(source).rotate().resize(600, 600, { fit: 'inside', withoutEnlargement: true }).webp().toBuffer()
}
