/**
 * Regression test for the Sixel PNG-decode path.
 *
 * The <Image> component receives PNG data. Kitty can transmit PNG directly
 * via `f=100`, but Sixel cannot — it needs raw RGBA pixels. This test pins
 * the PNG → RGBA → Sixel pipeline that lifts the original "Sixel rendering
 * from raw PNG is deferred" limit.
 *
 * Bead: km-silvery.known-limits.sixel-png
 */

import { deflateSync } from "node:zlib"
import { describe, expect, test } from "vitest"

import { decodePngToRgba, encodeSixel } from "@silvery/ag-react/ui/image/sixel-encoder"

// ----------------------------------------------------------------------------
// Tiny PNG synthesizer
// ----------------------------------------------------------------------------
//
// Hand-rolled to keep the fixture in-tree (no binary blob, no extra dep).
// Produces an 8-bit RGBA PNG with one filter byte per row (filter type 0 = none).
//
// Why hand-rolled instead of upng-js encode? The whole point of this test is
// to exercise our decode path. Using upng-js to produce the fixture and
// upng-js to consume it would be a tautology — a hand-rolled PNG locks the
// contract to "any valid PNG, however produced".

const CRC_TABLE: Uint32Array = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(buf: Buffer): number {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = (CRC_TABLE[(c ^ buf[i]!) & 0xff]! ^ (c >>> 8)) >>> 0
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const t = Buffer.from(type, "ascii")
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0)
  return Buffer.concat([len, t, data, crc])
}

/**
 * Build a tiny RGBA PNG. `pixels` must be `width * height * 4` bytes long.
 */
function makePng(width: number, height: number, pixels: Uint8Array): Buffer {
  if (pixels.length !== width * height * 4) {
    throw new Error(`expected ${width * height * 4} pixel bytes, got ${pixels.length}`)
  }
  // Insert filter byte (0 = none) at the start of every row.
  const rowBytes = width * 4
  const filtered = Buffer.alloc(height * (rowBytes + 1))
  for (let y = 0; y < height; y++) {
    filtered[y * (rowBytes + 1)] = 0
    Buffer.from(pixels.buffer, pixels.byteOffset + y * rowBytes, rowBytes).copy(
      filtered,
      y * (rowBytes + 1) + 1,
    )
  }

  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type: RGBA
  ihdr[10] = 0 // compression method: deflate
  ihdr[11] = 0 // filter method: per-scanline
  ihdr[12] = 0 // interlace: none

  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(filtered)),
    chunk("IEND", Buffer.alloc(0)),
  ])
}

// ----------------------------------------------------------------------------
// Tests
// ----------------------------------------------------------------------------

describe("Sixel: PNG → RGBA decode", () => {
  test("decodePngToRgba round-trips RGBA pixels via a synthetic PNG", () => {
    // 2×2 pixel image: red, green / blue, transparent.
    const pixels = new Uint8Array([
      255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 0, 0, 0, 0,
    ])
    const png = makePng(2, 2, pixels)

    const rgba = decodePngToRgba(png)
    expect(rgba).not.toBeNull()
    expect(rgba!.width).toBe(2)
    expect(rgba!.height).toBe(2)
    expect(rgba!.data.length).toBe(2 * 2 * 4)

    // Pixel-perfect: top-left red.
    expect(Array.from(rgba!.data.slice(0, 4))).toEqual([255, 0, 0, 255])
    // Pixel-perfect: top-right green.
    expect(Array.from(rgba!.data.slice(4, 8))).toEqual([0, 255, 0, 255])
    // Pixel-perfect: bottom-left blue.
    expect(Array.from(rgba!.data.slice(8, 12))).toEqual([0, 0, 255, 255])
    // Pixel-perfect: bottom-right fully transparent.
    expect(rgba!.data[15]).toBe(0)
  })

  test("decodePngToRgba returns null for a buffer that is not a PNG", () => {
    expect(decodePngToRgba(Buffer.from("definitely not a PNG"))).toBeNull()
    expect(decodePngToRgba(new Uint8Array([0, 1, 2, 3]))).toBeNull()
  })

  test("PNG → RGBA → Sixel produces a well-formed DCS sequence", () => {
    // Same 2×2 fixture, then run it through the full pipeline.
    const pixels = new Uint8Array([
      255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 0, 0, 0, 0,
    ])
    const png = makePng(2, 2, pixels)

    const rgba = decodePngToRgba(png)
    expect(rgba).not.toBeNull()

    const seq = encodeSixel(rgba!)

    // DCS introducer + Sixel opcode + ST terminator. These three anchors are
    // the contract every Sixel renderer relies on; if any drifts, every
    // Sixel-capable terminal will mis-parse.
    expect(seq.startsWith("\x1bP")).toBe(true)
    expect(seq).toContain("q") // Sixel command
    expect(seq.endsWith("\x1b\\")).toBe(true) // String Terminator

    // Raster attributes — width;height — must reflect the decoded PNG.
    expect(seq).toContain('"1;1;2;2')

    // Three opaque colors → three palette definitions. The fully transparent
    // pixel intentionally never enters the palette (alpha < 128 short-circuit
    // in encodeSixel).
    const paletteEntries = seq.match(/#\d+;2;\d+;\d+;\d+/g) ?? []
    expect(paletteEntries.length).toBe(3)

    // Each opaque color (red, green, blue) appears as a 100% channel + two 0%
    // channels. We don't pin the assignment order (palette index is build-order
    // dependent), only that the three pure colors round-tripped.
    const palette = new Set(paletteEntries.map((e) => e.replace(/^#\d+/, "")))
    expect(palette.has(";2;100;0;0")).toBe(true)
    expect(palette.has(";2;0;100;0")).toBe(true)
    expect(palette.has(";2;0;0;100")).toBe(true)
  })
})
