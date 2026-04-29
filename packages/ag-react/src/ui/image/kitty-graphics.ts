/**
 * Kitty Graphics Protocol
 *
 * Encodes and manages images using the Kitty terminal graphics protocol.
 * Images are transmitted as base64-encoded PNG data via APC (Application
 * Program Command) escape sequences.
 *
 * Protocol reference: https://sw.kovidgoyal.net/kitty/graphics-protocol/
 *
 * Key concepts:
 * - `a=T` — transmit and display the image
 * - `f=100` — format is PNG (raw PNG data, terminal decodes it)
 * - `m=0|1` — 0 = last/only chunk, 1 = more chunks follow
 * - Chunks should be <= 4096 bytes of base64 to avoid overwhelming the terminal
 * - Images can be assigned an `i=<id>` for later deletion
 */

import { createTerminalProfile, type TerminalCaps } from "@silvery/ansi"

const APC_START = "\x1b_G"
const ST = "\x1b\\"

/** Maximum base64 bytes per chunk (Kitty recommendation) */
const MAX_CHUNK_SIZE = 4096

export interface KittyImageOptions {
  /** Image width in terminal columns */
  width?: number
  /** Image height in terminal rows */
  height?: number
  /** Image ID for later reference/deletion (positive integer) */
  id?: number
}

/**
 * Encode a PNG image into Kitty graphics protocol escape sequences.
 *
 * The image data is base64-encoded and split into chunks of <= 4096 bytes.
 * Each chunk is wrapped in an APC escape sequence. The first chunk carries
 * the image metadata (action, format, dimensions, ID). Subsequent chunks
 * only carry `m=1` or `m=0` to indicate continuation.
 *
 * @param pngData - Raw PNG image data
 * @param opts - Optional dimensions and ID
 * @returns A string containing the complete escape sequence(s)
 *
 * @example
 * ```ts
 * import { readFileSync } from "fs"
 * import { encodeKittyImage } from "@silvery/ag-react"
 *
 * const png = readFileSync("photo.png")
 * const seq = encodeKittyImage(png, { width: 40, height: 20 })
 * process.stdout.write(seq)
 * ```
 */
export function encodeKittyImage(pngData: Buffer, opts?: KittyImageOptions): string {
  const b64 = pngData.toString("base64")
  const chunks = splitIntoChunks(b64, MAX_CHUNK_SIZE)

  if (chunks.length === 0) {
    // Empty image — send a single empty payload
    return `${APC_START}${buildParams(opts, 0)};${ST}`
  }

  if (chunks.length === 1) {
    // Single chunk — m=0 (last/only)
    return `${APC_START}${buildParams(opts, 0)};${chunks[0]}${ST}`
  }

  // Multiple chunks
  const parts: string[] = []

  // First chunk carries full metadata, m=1 (more follows)
  parts.push(`${APC_START}${buildParams(opts, 1)};${chunks[0]}${ST}`)

  // Middle chunks — only m=1
  for (let i = 1; i < chunks.length - 1; i++) {
    parts.push(`${APC_START}m=1;${chunks[i]}${ST}`)
  }

  // Last chunk — m=0
  parts.push(`${APC_START}m=0;${chunks[chunks.length - 1]}${ST}`)

  return parts.join("")
}

/**
 * Generate an escape sequence to delete a Kitty image by ID.
 *
 * Uses `a=d` (delete) with `d=i` (delete by image ID).
 *
 * @param id - The image ID to delete
 * @returns The delete escape sequence
 *
 * @example
 * ```ts
 * process.stdout.write(deleteKittyImage(42))
 * ```
 */
export function deleteKittyImage(id: number): string {
  return `${APC_START}a=d,d=i,i=${id}${ST}`
}

/**
 * Check if the current terminal likely supports the Kitty graphics protocol.
 *
 * Pass `caps` (from `term.caps` or a {@link TerminalCaps} fixture) when
 * available. Without caps, this falls back to {@link createTerminalProfile}
 * — the canonical single-source-of-truth entry point in
 * `@silvery/ansi/profile`. Direct reads of terminal-signal env vars
 * (TERM / TERM_PROGRAM / …) are banned outside that module — see
 * `scripts/lint-env-reads.ts`.
 *
 * For definitive detection, use a terminal query (send the graphics protocol
 * query and check for a response), but that requires async I/O.
 *
 * Known supporting terminals: Kitty, WezTerm, Ghostty (partial), Konsole (partial).
 *
 * @returns `true` if the terminal likely supports Kitty graphics
 */
export function isKittyGraphicsSupported(emulator?: { program: string; TERM: string }): boolean {
  const resolved = emulator ?? createTerminalProfile().emulator
  const term = resolved.TERM
  const termProgram = resolved.program

  // Kitty terminal
  if (term === "xterm-kitty" || termProgram === "kitty") return true

  // WezTerm supports Kitty graphics protocol
  if (termProgram === "WezTerm") return true

  // Ghostty supports Kitty graphics (both capitalizations survive for
  // pre-plateau fixtures; profile.ts canonicalizes to "Ghostty").
  if (termProgram === "ghostty" || termProgram === "Ghostty") return true

  // Konsole 22.04+ supports Kitty graphics
  if (termProgram === "konsole") return true

  return false
}

// ============================================================================
// Internal helpers
// ============================================================================

/**
 * Build the Kitty graphics protocol parameter string for the first chunk.
 *
 * Important: `KittyImageOptions.width` / `.height` are documented as
 * "terminal columns" / "terminal rows" — i.e. CELL counts. The Kitty
 * protocol uses `c=N` / `r=M` for cell-based display sizing, NOT `s=` /
 * `v=` (those are SOURCE PIXEL dimensions, used only for raw RGB
 * uploads with f=24/32). Sending `s=`/`v=` with f=100 (PNG) leaves
 * display sizing to the PNG's native pixel dimensions, which on a
 * 1536×1024 asset blows up to ~192×64 cells and effectively disappears
 * off-screen. Use `c=`/`r=` so the terminal scales the PNG into the
 * reserved cell viewport.
 */
function buildParams(opts: KittyImageOptions | undefined, more: 0 | 1): string {
  // `z=1` puts the image above the default text layer (z=0) so silvery's
  // per-frame cell paints (which write spaces with default attrs over
  // the reserved Box area) don't visually obscure the image. Without
  // z>0 the image is technically present but immediately overdrawn by
  // the text layer on every frame.
  // `C=1` keeps the cursor parked — the protocol places the image
  // relative to the current cursor position, but moves the cursor by
  // the image's cell size after placing. We position the cursor
  // explicitly via CSI before each placement; C=1 prevents post-place
  // cursor drift from messing with subsequent silvery render writes.
  const parts = [`a=T`, `f=100`, `m=${more}`, `z=1`, `C=1`]

  if (opts?.width != null) parts.push(`c=${opts.width}`)
  if (opts?.height != null) parts.push(`r=${opts.height}`)
  if (opts?.id != null) parts.push(`i=${opts.id}`)

  return parts.join(",")
}

/**
 * Split a string into chunks of at most `size` characters.
 */
function splitIntoChunks(str: string, size: number): string[] {
  if (str.length === 0) return []

  const chunks: string[] = []
  for (let i = 0; i < str.length; i += size) {
    chunks.push(str.slice(i, i + size))
  }
  return chunks
}
