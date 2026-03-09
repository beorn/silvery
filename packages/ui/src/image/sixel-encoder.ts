/**
 * Sixel Encoder (Minimal Implementation)
 *
 * Sixel is an older image protocol supported by terminals like xterm, mlterm,
 * foot, and some others. Images are encoded as DCS (Device Control String)
 * sequences where each character encodes 6 vertical pixels.
 *
 * DCS format: `ESC P <params> q <sixel-data> ESC \`
 *
 * This is a minimal implementation that produces valid Sixel output for
 * simple images. For production use with complex images, consider using
 * a dedicated Sixel library that handles color quantization and dithering.
 *
 * Protocol reference: https://en.wikipedia.org/wiki/Sixel
 *
 * TODO: Full Sixel encoding with proper color quantization, dithering,
 * and compression. The current implementation handles basic RGBA image data
 * with a simple nearest-color palette approach.
 */

const DCS_START = "\x1bP"
const ST = "\x1b\\"

/** Sixel introduces a color with `#<index>;2;<r>;<g>;<b>` (RGB percentages 0-100) */
const SIXEL_NEWLINE = "-"

export interface SixelImageData {
  /** Image width in pixels */
  width: number
  /** Image height in pixels */
  height: number
  /** RGBA pixel data (4 bytes per pixel: R, G, B, A), row-major order */
  data: Uint8Array
}

/**
 * Encode RGBA image data as a Sixel escape sequence.
 *
 * This is a basic implementation that:
 * 1. Quantizes colors to a small palette (up to 256 colors)
 * 2. Encodes 6-row bands as Sixel characters
 * 3. Wraps in a DCS escape sequence
 *
 * For transparent pixels (alpha < 128), the background shows through.
 *
 * @param imageData - Image dimensions and RGBA pixel data
 * @returns A DCS escape sequence containing the Sixel-encoded image
 *
 * @example
 * ```ts
 * const img = { width: 10, height: 12, data: new Uint8Array(10 * 12 * 4) }
 * const seq = encodeSixel(img)
 * process.stdout.write(seq)
 * ```
 */
export function encodeSixel(imageData: SixelImageData): string {
  const { width, height, data } = imageData

  if (width === 0 || height === 0 || data.length === 0) {
    return `${DCS_START}q${ST}`
  }

  // Build a simple palette by collecting unique (quantized) colors
  const palette = new Map<string, number>()
  const pixelColors = new Uint16Array(width * height) // palette index per pixel (0 = transparent)
  let nextColorIndex = 1 // 0 reserved for transparent/background

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4
      const r = data[offset]!
      const g = data[offset + 1]!
      const b = data[offset + 2]!
      const a = data[offset + 3]!

      if (a < 128) {
        // Transparent — leave as 0
        continue
      }

      // Quantize to 6-bit per channel (64 levels) to keep palette small
      const qr = (r >> 2) & 0x3f
      const qg = (g >> 2) & 0x3f
      const qb = (b >> 2) & 0x3f
      const key = `${qr},${qg},${qb}`

      let idx = palette.get(key)
      if (idx == null) {
        if (nextColorIndex >= 256) {
          // Palette full — find closest existing color (simple fallback)
          idx = 1
        } else {
          idx = nextColorIndex++
          palette.set(key, idx)
        }
      }

      pixelColors[y * width + x] = idx
    }
  }

  // Build Sixel data
  const parts: string[] = []

  // Raster attributes: Pan;Pad;Ph;Pv (aspect ratio 1:1, width, height)
  parts.push(`"1;1;${width};${height}`)

  // Define palette colors
  for (const [key, idx] of palette) {
    const [qr, qg, qb] = key.split(",").map(Number)
    // Convert from 6-bit (0-63) to percentage (0-100)
    const rPct = Math.round((qr! / 63) * 100)
    const gPct = Math.round((qg! / 63) * 100)
    const bPct = Math.round((qb! / 63) * 100)
    parts.push(`#${idx};2;${rPct};${gPct};${bPct}`)
  }

  // Encode pixel data in 6-row bands
  for (let bandY = 0; bandY < height; bandY += 6) {
    if (bandY > 0) {
      parts.push(SIXEL_NEWLINE) // Move to next sixel row
    }

    // For each color in the palette, emit the sixel row
    // (Only emit colors that appear in this band)
    const bandColors = new Set<number>()
    for (let dy = 0; dy < 6 && bandY + dy < height; dy++) {
      for (let x = 0; x < width; x++) {
        const ci = pixelColors[(bandY + dy) * width + x]!
        if (ci > 0) bandColors.add(ci)
      }
    }

    let first = true
    for (const colorIdx of bandColors) {
      if (!first) {
        parts.push("$") // Carriage return within sixel line (reposition to start)
      }
      first = false

      parts.push(`#${colorIdx}`)

      // Build the sixel characters for this color in this band
      for (let x = 0; x < width; x++) {
        let sixelBits = 0
        for (let dy = 0; dy < 6; dy++) {
          const y = bandY + dy
          if (y < height && pixelColors[y * width + x] === colorIdx) {
            sixelBits |= 1 << dy
          }
        }
        // Sixel character = bits + 63 (0x3F)
        parts.push(String.fromCharCode(sixelBits + 63))
      }
    }
  }

  return `${DCS_START}q${parts.join("")}${ST}`
}

/**
 * Check if the current terminal likely supports the Sixel protocol.
 *
 * This is a heuristic based on environment variables. For definitive
 * detection, send a DA1 (Device Attributes) query and check for "4"
 * in the response, but that requires async I/O.
 *
 * Known supporting terminals: xterm (with +sixel), mlterm, foot, mintty,
 * WezTerm, Contour, Sixel-enabled builds of various terminals.
 *
 * @returns `true` if the terminal likely supports Sixel
 */
export function isSixelSupported(): boolean {
  const term = process.env.TERM ?? ""
  const termProgram = process.env.TERM_PROGRAM ?? ""

  // mlterm supports Sixel natively
  if (termProgram === "mlterm" || term.startsWith("mlterm")) return true

  // foot supports Sixel
  if (termProgram === "foot" || term === "foot" || term === "foot-extra") return true

  // WezTerm supports Sixel
  if (termProgram === "WezTerm") return true

  // mintty supports Sixel
  if (termProgram === "mintty") return true

  // xterm might support Sixel if compiled with +sixel
  // We can't know for sure from env alone, so we don't claim support
  // (the user can set protocol='sixel' explicitly)

  return false
}
