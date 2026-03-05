/**
 * Generate sample PNG images for the Kitty protocol examples.
 *
 * Creates 3 sample images in examples/kitty/samples/:
 *   - gradient.png  — Rainbow gradient (256x192)
 *   - checker.png   — Colorful checkerboard pattern (256x192)
 *   - circles.png   — Overlapping colored circles on dark background (256x192)
 *
 * Uses raw PNG encoding with Node's zlib — no external dependencies.
 *
 * Run: bun vendor/hightea/examples/kitty/generate-samples.ts
 */

import { deflateSync } from "node:zlib"
import { writeFileSync, mkdirSync } from "node:fs"
import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const WIDTH = 256
const HEIGHT = 192

// ---------------------------------------------------------------------------
// HSV to RGB
// ---------------------------------------------------------------------------

function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const c = v * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = v - c

  let r = 0,
    g = 0,
    b = 0
  if (h < 60) {
    r = c
    g = x
  } else if (h < 120) {
    r = x
    g = c
  } else if (h < 180) {
    g = c
    b = x
  } else if (h < 240) {
    g = x
    b = c
  } else if (h < 300) {
    r = x
    b = c
  } else {
    r = c
    b = x
  }

  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)]
}

// ---------------------------------------------------------------------------
// Raw PNG encoder (no dependencies)
// ---------------------------------------------------------------------------

function crc32(buf: Buffer): number {
  // CRC-32 lookup table
  const table: number[] = []
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    table[n] = c
  }

  let crc = 0xffffffff
  for (let i = 0; i < buf.length; i++) {
    crc = table[(crc ^ buf[i]!) & 0xff]! ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function makePngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length, 0)

  const typeAndData = Buffer.concat([Buffer.from(type, "ascii"), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(typeAndData), 0)

  return Buffer.concat([length, typeAndData, crc])
}

function rgbaToPng(rgba: Buffer, width: number, height: number): Buffer {
  // PNG signature
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

  // IHDR chunk
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type: RGBA
  ihdr[10] = 0 // compression
  ihdr[11] = 0 // filter
  ihdr[12] = 0 // interlace
  const ihdrChunk = makePngChunk("IHDR", ihdr)

  // IDAT chunk: filter each row with filter type 0 (None), then deflate
  const rawRows = Buffer.alloc(height * (1 + width * 4))
  for (let y = 0; y < height; y++) {
    const rowOffset = y * (1 + width * 4)
    rawRows[rowOffset] = 0 // filter type: None
    rgba.copy(rawRows, rowOffset + 1, y * width * 4, (y + 1) * width * 4)
  }
  const compressed = deflateSync(rawRows)
  const idatChunk = makePngChunk("IDAT", compressed)

  // IEND chunk
  const iendChunk = makePngChunk("IEND", Buffer.alloc(0))

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk])
}

// ---------------------------------------------------------------------------
// Image generators
// ---------------------------------------------------------------------------

function generateGradient(): Buffer {
  const rgba = Buffer.alloc(WIDTH * HEIGHT * 4)

  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const offset = (y * WIDTH + x) * 4
      const hue = (x / WIDTH) * 360
      const brightness = 0.3 + 0.7 * (1 - y / HEIGHT)
      const [r, g, b] = hsvToRgb(hue, 1.0, brightness)
      rgba[offset] = r
      rgba[offset + 1] = g
      rgba[offset + 2] = b
      rgba[offset + 3] = 255
    }
  }

  return rgbaToPng(rgba, WIDTH, HEIGHT)
}

function generateChecker(): Buffer {
  const rgba = Buffer.alloc(WIDTH * HEIGHT * 4)
  const checkerSize = 24

  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const offset = (y * WIDTH + x) * 4
      const isLight = (Math.floor(x / checkerSize) + Math.floor(y / checkerSize)) % 2 === 0
      const hue = (x / WIDTH) * 360
      const [hr, hg, hb] = hsvToRgb(hue, 0.6, 1.0)

      if (isLight) {
        rgba[offset] = Math.min(255, hr + 60)
        rgba[offset + 1] = Math.min(255, hg + 60)
        rgba[offset + 2] = Math.min(255, hb + 60)
      } else {
        rgba[offset] = Math.max(0, hr - 100)
        rgba[offset + 1] = Math.max(0, hg - 100)
        rgba[offset + 2] = Math.max(0, hb - 100)
      }
      rgba[offset + 3] = 255
    }
  }

  return rgbaToPng(rgba, WIDTH, HEIGHT)
}

function generateCircles(): Buffer {
  const rgba = Buffer.alloc(WIDTH * HEIGHT * 4)

  // Dark background
  for (let i = 0; i < WIDTH * HEIGHT * 4; i += 4) {
    rgba[i] = 20
    rgba[i + 1] = 20
    rgba[i + 2] = 30
    rgba[i + 3] = 255
  }

  // Draw overlapping circles with additive blending
  const circles: { cx: number; cy: number; r: number; color: [number, number, number] }[] = [
    { cx: 90, cy: 80, r: 70, color: [200, 40, 40] },
    { cx: 166, cy: 80, r: 70, color: [40, 180, 40] },
    { cx: 128, cy: 140, r: 70, color: [40, 80, 220] },
    { cx: 50, cy: 140, r: 50, color: [220, 180, 30] },
    { cx: 206, cy: 140, r: 50, color: [180, 40, 220] },
    { cx: 128, cy: 60, r: 45, color: [40, 200, 200] },
  ]

  for (const circle of circles) {
    for (let y = 0; y < HEIGHT; y++) {
      for (let x = 0; x < WIDTH; x++) {
        const dx = x - circle.cx
        const dy = y - circle.cy
        const dist = Math.sqrt(dx * dx + dy * dy)

        if (dist < circle.r) {
          const offset = (y * WIDTH + x) * 4
          // Soft edge with smooth falloff
          const alpha = dist > circle.r - 8 ? (circle.r - dist) / 8 : 1.0

          // Additive blending
          rgba[offset] = Math.min(255, rgba[offset]! + Math.round(circle.color[0] * alpha))
          rgba[offset + 1] = Math.min(255, rgba[offset + 1]! + Math.round(circle.color[1] * alpha))
          rgba[offset + 2] = Math.min(255, rgba[offset + 2]! + Math.round(circle.color[2] * alpha))
        }
      }
    }
  }

  return rgbaToPng(rgba, WIDTH, HEIGHT)
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const samplesDir = resolve(dirname(fileURLToPath(import.meta.url)), "samples")
mkdirSync(samplesDir, { recursive: true })

const samples = [
  { name: "gradient.png", generate: generateGradient },
  { name: "checker.png", generate: generateChecker },
  { name: "circles.png", generate: generateCircles },
]

for (const sample of samples) {
  const path = resolve(samplesDir, sample.name)
  const png = sample.generate()
  writeFileSync(path, png)
  console.log(`  ${sample.name} (${png.length} bytes)`)
}

console.log(`\nGenerated ${samples.length} samples in ${samplesDir}`)
