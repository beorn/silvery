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
  /**
   * Transmit only — store the image but do NOT place it.
   *
   * Default `false`: action is `a=T` (transmit and display at cursor).
   * Set to `true` for `a=t` (transmit only) — store the image bytes for
   * later placement via {@link placeKittyImage}, without consuming a cell.
   * The two-step flow lets a moving consumer (e.g. an `<Image>` that
   * re-positions on scroll) transmit the PNG bytes once and re-place
   * with a tiny APC packet on every subsequent move — eliminating the
   * "delete-and-retransmit" flicker that re-encoding the full base64
   * blob on every position change otherwise produces.
   */
  transmitOnly?: boolean
  /** Z-index stacking order. Defaults to 1 so images remain above reserved cells. */
  zIndex?: number
  /** Pixel offset inside the first cell. Kitty keys: X/Y. */
  pixelOffset?: { readonly x?: number; readonly y?: number }
  /** Source rectangle in image pixels. Kitty keys: x/y/w/h. */
  sourceRect?: {
    readonly x?: number
    readonly y?: number
    readonly width?: number
    readonly height?: number
  }
  /** Create a virtual placement for a Unicode placeholder. Kitty key: U=1. */
  virtualPlacement?: boolean
}

/** Options for {@link placeKittyImage}. */
export interface KittyPlaceOptions {
  /** Image ID previously transmitted via `a=t` (or `a=T`). */
  id: number
  /** Display width in terminal columns. */
  width?: number
  /** Display height in terminal rows. */
  height?: number
  /**
   * Placement ID for this displayed instance. Defaults to 1.
   *
   * Multiple placements of the same `id` can coexist if you give them
   * different `placementId`s — each is independently delete-able via
   * {@link deleteKittyPlacement}.
   */
  placementId?: number
  /** Z-index stacking order. Defaults to 1 so images remain above reserved cells. */
  zIndex?: number
  /** Pixel offset inside the first cell. Kitty keys: X/Y. */
  pixelOffset?: { readonly x?: number; readonly y?: number }
  /** Source rectangle in image pixels. Kitty keys: x/y/w/h. */
  sourceRect?: {
    readonly x?: number
    readonly y?: number
    readonly width?: number
    readonly height?: number
  }
  /** Create a virtual placement for a Unicode placeholder. Kitty key: U=1. */
  virtualPlacement?: boolean
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
 * Uses `a=d` (delete) with `d=i` (delete by image ID). Removes both the
 * stored image bytes AND every placement of it. Use
 * {@link deleteKittyPlacement} to remove a single placement while keeping
 * the image stored for later re-placement.
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
  // `q=2` suppresses the OK/error response — see buildParams comment
  // for placement. Same rationale: silvery's input parser treats the
  // response bytes as typed characters; the delete is fire-and-forget.
  return `${APC_START}a=d,d=i,i=${id},q=2${ST}`
}

/**
 * Delete a single placement of a stored image, keeping the image bytes.
 *
 * Uses `a=d` with `d=i` (image id) and `p=` (placement id). The image
 * remains stored on the terminal — re-place via {@link placeKittyImage}
 * without re-transmitting the PNG.
 *
 * @param id - Image ID
 * @param placementId - Placement ID (defaults to 1)
 */
export function deleteKittyPlacement(id: number, placementId: number = 1): string {
  return `${APC_START}a=d,d=i,i=${id},p=${placementId},q=2${ST}`
}

/**
 * Place an already-transmitted image at the current cursor position.
 *
 * Uses `a=p` (place existing image). The image must have been previously
 * transmitted with `transmitOnly: true` (or `a=T` — which transmits AND
 * places, but you can still re-place separately afterwards). This is the
 * fast path for a moving image: transmit the PNG once, then emit a tiny
 * APC packet for each position update — no re-encoding of base64 bytes.
 *
 * Pair with {@link deleteKittyPlacement} to clear the prior placement
 * before placing at a new cursor position. Skipping the delete leaves a
 * stacked copy at the old position.
 *
 * @example
 * ```ts
 * // Transmit once
 * write(encodeKittyImage(png, { id: 42, transmitOnly: true }))
 * // Place at cursor (which the caller positions via CSI ;H)
 * write(placeKittyImage({ id: 42, width: 40, height: 20 }))
 * // Move: clear old placement, position cursor, place again
 * write(deleteKittyPlacement(42))
 * write(`\x1b[10;5H`) // move cursor
 * write(placeKittyImage({ id: 42, width: 40, height: 20 }))
 * ```
 */
export function placeKittyImage(opts: KittyPlaceOptions): string {
  const placementId = opts.placementId ?? 1
  const parts = [
    `a=p`,
    `i=${opts.id}`,
    `p=${placementId}`,
    `z=${formatIntParam("zIndex", opts.zIndex ?? 1)}`,
    `C=1`,
    `q=2`,
  ]
  if (opts.width != null) parts.push(`c=${opts.width}`)
  if (opts.height != null) parts.push(`r=${opts.height}`)
  appendPlacementParams(parts, opts)
  return `${APC_START}${parts.join(",")};${ST}`
}

/**
 * Check if the current terminal likely supports the Kitty graphics protocol.
 *
 * Pass a profile or caps fixture when available. Without one, this falls
 * back to {@link createTerminalProfile} — the canonical single-source-of-
 * truth entry point in `@silvery/ansi/profile`. Direct reads of terminal-
 * signal env vars (TERM / TERM_PROGRAM / …) are banned outside that module
 * — see `scripts/lint-env-reads.ts`.
 *
 * For definitive detection, use a terminal query (send the graphics protocol
 * query and check for a response), but that requires async I/O.
 *
 * Known supporting terminals: Kitty, WezTerm, Ghostty (partial), Konsole (partial).
 *
 * @returns `true` if the terminal likely supports Kitty graphics
 */
export function isKittyGraphicsSupported(
  profile?:
    | {
        readonly caps?: Pick<TerminalCaps, "kittyGraphics">
        readonly emulator?: { program: string; TERM: string }
      }
    | { program: string; TERM: string },
): boolean {
  if (profile === undefined) return createTerminalProfile().caps.kittyGraphics
  if ("caps" in profile && profile.caps) return profile.caps.kittyGraphics

  const resolved = isEmulator(profile) ? profile : profile.emulator
  if (!resolved) return false
  const term = resolved.TERM
  const termProgram = resolved.program

  if (term === "dumb") return false

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

function isEmulator(value: unknown): value is { program: string; TERM: string } {
  if (value === null || typeof value !== "object") return false
  const maybe = value as { program?: unknown; TERM?: unknown }
  return typeof maybe.program === "string" && typeof maybe.TERM === "string"
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
  // `q=2` suppresses BOTH OK and error responses from the terminal.
  // Without this, Kitty sends `\x1b_Gi=N;OK\x1b\\` (one envelope per
  // image command) back on stdin. silvery's input parser doesn't know
  // about Kitty graphics responses — it interprets the bytes as typed
  // characters and they end up in whatever TextInput holds focus
  // ("garbage" like `_Gi=2;OK\_Gi=1;OK\` in the command box). We don't
  // use the response anyway — placement is fire-and-forget.
  // `a=T` transmits AND places at the cursor. `a=t` transmits without
  // placing — used by callers that want to manage placement separately
  // via `placeKittyImage` (typically because the image moves and they
  // want to avoid re-transmitting the base64 bytes on every move).
  const action = opts?.transmitOnly ? `a=t` : `a=T`
  const parts = [
    action,
    `f=100`,
    `m=${more}`,
    `z=${formatIntParam("zIndex", opts?.zIndex ?? 1)}`,
    `C=1`,
    `q=2`,
  ]

  if (opts?.width != null) parts.push(`c=${opts.width}`)
  if (opts?.height != null) parts.push(`r=${opts.height}`)
  if (opts?.id != null) parts.push(`i=${opts.id}`)
  if (opts) appendPlacementParams(parts, opts)

  return parts.join(",")
}

function appendPlacementParams(
  parts: string[],
  opts: Pick<KittyImageOptions, "pixelOffset" | "sourceRect" | "virtualPlacement">,
): void {
  if (opts.pixelOffset?.x != null) {
    parts.push(`X=${formatNonNegativeIntParam("pixelOffset.x", opts.pixelOffset.x)}`)
  }
  if (opts.pixelOffset?.y != null) {
    parts.push(`Y=${formatNonNegativeIntParam("pixelOffset.y", opts.pixelOffset.y)}`)
  }
  if (opts.sourceRect?.x != null) {
    parts.push(`x=${formatNonNegativeIntParam("sourceRect.x", opts.sourceRect.x)}`)
  }
  if (opts.sourceRect?.y != null) {
    parts.push(`y=${formatNonNegativeIntParam("sourceRect.y", opts.sourceRect.y)}`)
  }
  if (opts.sourceRect?.width != null) {
    parts.push(`w=${formatPositiveIntParam("sourceRect.width", opts.sourceRect.width)}`)
  }
  if (opts.sourceRect?.height != null) {
    parts.push(`h=${formatPositiveIntParam("sourceRect.height", opts.sourceRect.height)}`)
  }
  if (opts.virtualPlacement) parts.push("U=1")
}

function formatIntParam(name: string, value: number): number {
  if (!Number.isInteger(value)) throw new Error(`kitty graphics ${name} must be an integer`)
  return value
}

function formatNonNegativeIntParam(name: string, value: number): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`kitty graphics ${name} must be a non-negative integer`)
  }
  return value
}

function formatPositiveIntParam(name: string, value: number): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`kitty graphics ${name} must be a positive integer`)
  }
  return value
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
