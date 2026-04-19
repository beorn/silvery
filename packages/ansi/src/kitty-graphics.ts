/**
 * Kitty graphics protocol — minimal encoder for cell-sized overlay placements.
 *
 * Used by the backdrop-fade pass to fade emoji/wide-char glyphs (SGR 2 "dim"
 * is a no-op on bitmap emoji in most terminals). We upload a single tiny
 * translucent RGBA image once, then emit `a=p` placements over specific cells
 * with `z=1` so the overlay sits on top of the already-rendered emoji glyph.
 *
 * ## Protocol summary
 *
 * The Kitty graphics protocol uses APC escapes: `\x1b_G<control>;<payload>\x1b\\`.
 * Control parameters are key=value pairs separated by commas. Payload is
 * base64-encoded image data (only on upload).
 *
 * Key commands we use:
 *
 * | Command     | Meaning                                                       |
 * | ----------- | ------------------------------------------------------------- |
 * | `a=t`       | Transmit (upload) image data                                  |
 * | `a=p`       | Place a previously-uploaded image                             |
 * | `a=d`       | Delete (remove placements and/or free images)                 |
 * | `f=32`      | RGBA pixel format (4 bytes per pixel)                         |
 * | `s=W,v=H`   | Source image dimensions in pixels                             |
 * | `i=<id>`    | Image ID (stable across frames)                               |
 * | `p=<id>`    | Placement ID (stable per cell)                                |
 * | `C=1`       | Disable cursor movement after placement (crucial for overlay) |
 * | `c=<cols>`  | Cell column extent                                            |
 * | `r=<rows>`  | Cell row extent                                               |
 * | `z=<zidx>`  | Z-index (0 = below text, 1 = above text)                      |
 * | `q=2`       | Quiet mode (suppress OK/error responses from terminal)        |
 *
 * Because the image is tiled into a single cell, `c=1,r=1,C=1` keeps the
 * placement local — it doesn't shift the rendered text layout.
 *
 * @see https://sw.kovidgoyal.net/kitty/graphics-protocol/
 */

// =============================================================================
// Image ID namespace
// =============================================================================

/**
 * Stable image ID for the backdrop scrim overlay. Uploaded once per terminal
 * session; placements reuse this ID. Value is arbitrary — just needs to be
 * unique within the process. 0xBEEF picked for grep-ability.
 */
export const BACKDROP_SCRIM_IMAGE_ID = 0xbeef

/**
 * Placement ID base for backdrop scrim placements. Each cell gets a unique
 * placement ID derived from `x * OFFSET + y`. This lets us target individual
 * placements for deletion while leaving others alive. `i=<id>,p=<pid>` refers
 * to a single placement.
 */
export const BACKDROP_PLACEMENT_X_STRIDE = 10_000

/**
 * Derive a stable placement ID for a given (x, y) cell. Max column = 9999,
 * which comfortably exceeds any realistic terminal width.
 */
export function backdropPlacementId(x: number, y: number): number {
  return x * BACKDROP_PLACEMENT_X_STRIDE + y + 1 // +1 to avoid ID=0 (reserved)
}

// =============================================================================
// Base64 encoding (minimal, no deps)
// =============================================================================

/**
 * Encode a Uint8Array as base64. Kitty expects standard base64 (with `+`/`/`
 * and `=` padding). We use Buffer when available (Node/Bun), fall back to
 * btoa for browser/canvas adapters (the canvas target may never actually
 * need to emit Kitty escapes — this is just defensive).
 */
function base64Encode(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64")
  }
  let binary = ""
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!)
  // btoa may not exist in non-browser; guard.
  const g = globalThis as { btoa?: (s: string) => string }
  if (typeof g.btoa === "function") return g.btoa(binary)
  throw new Error("base64 encoding unavailable in this environment")
}

// =============================================================================
// Scrim pixel data — translucent neutral
// =============================================================================

/**
 * Build a tiny RGBA pixel grid for the scrim overlay.
 *
 * Kitty's graphics protocol paints images at native pixel resolution scaled
 * to `c` x `r` cells. A 2x2 RGBA image scaled to a single cell (~10x20 px
 * depending on font) gives us a smooth fill. We intentionally keep the
 * image tiny to minimize base64 payload size on the upload frame.
 *
 * Pixel color: `(r, g, b, a)` where `r/g/b` is the scrim tint and `a` is the
 * alpha (0-255). For a dark backdrop we use near-black at ~50% alpha, which
 * darkens the emoji underneath without completely hiding it.
 *
 * Width/height = 2 pixels — 16 bytes total, ~24 bytes base64. Upload is ~60
 * bytes including control chars. One-time cost per modal session.
 */
export function buildScrimPixels(
  tint: { r: number; g: number; b: number },
  alpha: number, // 0-255
): Uint8Array {
  const a = Math.max(0, Math.min(255, Math.round(alpha)))
  const r = Math.max(0, Math.min(255, Math.round(tint.r)))
  const g = Math.max(0, Math.min(255, Math.round(tint.g)))
  const b = Math.max(0, Math.min(255, Math.round(tint.b)))
  const bytes = new Uint8Array(2 * 2 * 4)
  for (let i = 0; i < 4; i++) {
    bytes[i * 4 + 0] = r
    bytes[i * 4 + 1] = g
    bytes[i * 4 + 2] = b
    bytes[i * 4 + 3] = a
  }
  return bytes
}

// =============================================================================
// Escape emitters
// =============================================================================

/**
 * APC wrapper: `\x1b_G<control>[;<payload>]\x1b\\`.
 *
 * The protocol allows chunking large payloads via `m=1` but our scrim is
 * tiny — always fits in one chunk.
 */
function apc(control: string, payload?: string): string {
  if (payload === undefined || payload === "") {
    return `\x1b_G${control}\x1b\\`
  }
  return `\x1b_G${control};${payload}\x1b\\`
}

/**
 * Emit a one-shot image upload. Terminal stores the RGBA pixels under
 * `i=<imageId>` and keeps them until explicitly freed. Subsequent placements
 * reference the image by ID without re-sending pixel data.
 *
 * `q=2` suppresses the terminal's OK/error reply — otherwise we'd see stray
 * APC sequences back on stdin.
 */
export function kittyUploadScrimImage(
  pixels: Uint8Array,
  width: number,
  height: number,
  imageId: number = BACKDROP_SCRIM_IMAGE_ID,
): string {
  const payload = base64Encode(pixels)
  // a=t: transmit. f=32: RGBA. s/v: image pixel dims. i: stable image ID.
  // q=2: quiet (no response). o=z: no compression.
  const control = `a=t,f=32,s=${width},v=${height},i=${imageId},q=2`
  return apc(control, payload)
}

/**
 * Emit a cell placement. Places `imageId` at the current cursor position
 * covering `c` cols and `r` rows with z-index `z`. `C=1` prevents the cursor
 * from advancing after placement (critical — otherwise every placement
 * shifts the cursor, breaking the caller's positioning).
 *
 * Placement ID (`p=<pid>`) is stable per cell so incremental frames can
 * replace placements without accumulating duplicates.
 */
export function kittyPlaceAt(opts: {
  imageId?: number
  placementId: number
  cols?: number
  rows?: number
  z?: number
}): string {
  const imageId = opts.imageId ?? BACKDROP_SCRIM_IMAGE_ID
  const cols = opts.cols ?? 1
  const rows = opts.rows ?? 1
  const z = opts.z ?? 1
  // a=p: place. i: image. p: placement. c/r: cell extent. C=1: don't move cursor.
  // z: z-index (>0 = above text). q=2: quiet.
  return apc(`a=p,i=${imageId},p=${opts.placementId},c=${cols},r=${rows},z=${z},C=1,q=2`)
}

/**
 * Delete a single placement by (imageId, placementId) without freeing the
 * image itself. The image stays cached for future placements.
 */
export function kittyDeletePlacement(
  placementId: number,
  imageId: number = BACKDROP_SCRIM_IMAGE_ID,
): string {
  // a=d: delete. d=i: delete by image+placement id. Lowercase `i`/`p` means
  // "don't free stored data, just remove these placements" (uppercase `I`/`P`
  // would free the stored image too).
  return apc(`a=d,d=i,i=${imageId},p=${placementId},q=2`)
}

/**
 * Delete ALL placements of our scrim image without freeing the image.
 * Used when the modal closes — we leave the image cached in case another
 * modal opens, but remove every overlay cell at once.
 */
export function kittyDeleteAllScrimPlacements(imageId: number = BACKDROP_SCRIM_IMAGE_ID): string {
  // d=i with no placement ID targets all placements of the given image.
  return apc(`a=d,d=i,i=${imageId},q=2`)
}

// =============================================================================
// Cursor positioning helpers
// =============================================================================

/**
 * Absolute cursor position (CUP). 1-based row/col per VT100.
 *
 * Used to position the cursor before emitting a placement so the placement
 * lands in the right cell. Kept small and local — the rest of the pipeline
 * uses more elaborate cursor tracking, but for out-of-band overlay emission
 * we just want a deterministic "jump here, place, done."
 */
export function cupTo(col: number, row: number): string {
  return `\x1b[${row + 1};${col + 1}H`
}

/**
 * Save cursor (DECSC) / restore cursor (DECRC). The overlay emitter wraps its
 * own emissions in save/restore so it doesn't disturb the main output phase's
 * cursor tracking.
 */
export const CURSOR_SAVE = "\x1b7"
export const CURSOR_RESTORE = "\x1b8"
