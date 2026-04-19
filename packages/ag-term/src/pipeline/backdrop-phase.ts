/**
 * Backdrop fade pass.
 *
 * Runs AFTER the content + decoration phases, BEFORE the output phase. Walks
 * the tree to find nodes with `data-backdrop-fade` or
 * `data-backdrop-fade-excluded` markers, then applies a cell-level color
 * transform to the affected rect(s) on the buffer.
 *
 * ## The model: source-over alpha scrim
 *
 * This is the operation every production UI stack ships — CSS `filter:
 * brightness()` + opacity, Apple UIKit `colorWithWhite:alpha:` dimming view,
 * Material 3 `Scrim(color, alpha)` → `drawRect`, Flutter `AnimatedModalBarrier`
 * at `Colors.black54`, Figma / Adobe / Sketch "Normal blend + opacity",
 * Quartz `(α·src) + (1-α)·dst`, Cairo OVER, Skia kSrcOver. Same shape
 * everywhere:
 *
 *   out = mix_srgb(cell, scrimColor, amount)
 *       = cell * (1 - amount) + scrimColor * amount
 *
 * Computed in sRGB gamma space (not OKLab/OKLCH) — that's where CSS filters,
 * Quartz, Skia, and every shipping design tool live. OKLab gives perceptually
 * uniform *interpolation*, but it drags the cell's chroma toward the target,
 * which violates the source-over compositing contract (Ottosson himself
 * recommends linear-sRGB over OKLab for transparency). sRGB is also the
 * simpler, CSS-filter-aligned choice.
 *
 * Both `cell.fg` AND `cell.bg` are mixed uniformly. Asymmetric amounts were
 * tried briefly (bg at half amount to prevent "scene drowning") but caused
 * border/panel brightness-ordering inversion — a border cell (fg-dominated)
 * darkens faster than its panel fill (bg-dominated) when fg and bg move
 * toward the scrim at different rates. Uniform amounts preserve visual
 * hierarchy; heaviness is controlled by the `amount` itself (default 0.25,
 * calibrated against macOS 20%, Material 3 32%, iOS 40%, Flutter 54%).
 *
 * ## Scrim color
 *
 * - Dark themes: pure black (`#000000`) — Apple's modal-sheet dimming color.
 * - Light themes: pure white (`#ffffff`) — the sign-flipped equivalent.
 *
 * A pure-black scrim behind a blue-tinted theme (e.g. Nord `#2E3440`)
 * desaturates null-bg cells naturally: blending `#2E3440` toward `#000000` at
 * amount=0.25 lands at `#222732` — still slightly blue but muted, not
 * amplified. An earlier revision used an OKLab-desaturated gray target to
 * actively kill the hue cast; that target violated the source-over contract
 * for authored colors (blue text lost chroma at the same rate as ambient bg,
 * which users perceived as "the blue looks more saturated than expected").
 * Black scrim is both simpler AND closer to industry practice.
 *
 * Tiers (`colorLevel`):
 * - `truecolor` / `256`: sRGB source-over mix toward the scrim when `rootBg`
 *   is supplied; falls back to fg-toward-cell-bg mix otherwise. Deterministic.
 * - `basic` (ANSI 16): stamps `attrs.dim` (SGR 2). Can't mix palette slots.
 * - `none` (monochrome): no-op. Modal border + box-drawing carry separation.
 *
 * ## Incremental correctness
 *
 * The pass mutates the final buffer in place after the decoration phase. The
 * same buffer is what `ag.render()` stores as `_prevBuffer`. This is safe
 * because:
 *
 * 1. The backdrop pass is a pure function of (tree markers, buffer cells,
 *    rootBg). `rootBg` is stable within a frame and identical on fresh/
 *    incremental paths.
 * 2. `renderPhase` writes the same pre-transform pixels on both fresh and
 *    incremental paths (existing incremental invariant).
 * 3. Running the same pure transform produces identical post-transform
 *    buffers — `SILVERY_STRICT=1` stays green.
 *
 * ## Emoji / wide-char cells
 *
 * Terminals render emoji using the glyph's own bitmap colors, so the fg mix
 * has no visible effect on the emoji itself. Two compensations:
 *
 * 1. Stamp `attrs.dim` (SGR 2) on lead + continuation cells. Modern terminals
 *    (Ghostty, iTerm2, Kitty, WezTerm) honor SGR 2 on emoji. Best-effort.
 * 2. Optionally emit Kitty graphics overlays via `buildKittyOverlay`. The
 *    scrim color for the Kitty overlay matches the scrimColor used for cell
 *    mixing, so the emoji visually fades in lockstep with surrounding cells.
 */

import { mixSrgb, relativeLuminance } from "@silvery/color"
import type { AgNode, Rect } from "@silvery/ag/types"
import { ansi256ToRgb, isDefaultBg, type Color, type TerminalBuffer } from "../buffer"
import {
  backdropPlacementId,
  buildScrimPixels,
  cupTo,
  CURSOR_RESTORE,
  CURSOR_SAVE,
  kittyDeleteAllScrimPlacements,
  kittyPlaceAt,
  kittyUploadScrimImage,
} from "@silvery/ansi"

export type BackdropColorLevel = "none" | "basic" | "256" | "truecolor"

export interface BackdropFadeOptions {
  /** Terminal color tier. Controls which transform strategy runs. */
  colorLevel?: BackdropColorLevel
  /**
   * Root background hex color from the active theme (e.g. `theme.bg`).
   *
   * When supplied, the scrim is derived from the theme's luminance: pure
   * black (`#000000`) for dark themes, pure white (`#ffffff`) for light.
   * Both `cell.fg` and `cell.bg` are mixed toward the scrim via sRGB
   * source-over alpha at `amount`.
   *
   * When omitted, the pass falls back to the legacy single-channel behavior:
   * `cell.fg = mixSrgb(fg, cell.bg, amount)`.
   */
  rootBg?: string
  /**
   * When true, emit Kitty graphics protocol overlays on wide-char cells
   * (emoji, CJK) inside the faded region. The terminal renders a translucent
   * scrim *above* the emoji glyph, which SGR 2 "dim" alone can't fade on
   * bitmap emoji (verified empirically — Ghostty ignores SGR 2 on bitmap
   * emoji). Degrades gracefully: terminals without Kitty graphics ignore the
   * APC sequences (they're eaten by the parser).
   *
   * Only emitted on modern terminals (Ghostty, Kitty, WezTerm) that are not
   * inside tmux. Caller should set based on `TerminalCaps.kittyGraphics` and
   * absence of `TMUX` env var. See `agKittyGraphicsEnabled()` in `ag.ts`.
   */
  kittyGraphics?: boolean
}

/**
 * Result of `applyBackdropFade`. Replaces the old boolean return so callers
 * can route the out-of-band Kitty overlay escapes through the output path
 * alongside the normal ANSI diff.
 */
export interface BackdropFadeResult {
  /** Whether at least one cell in the buffer was modified (for logging/stats). */
  modified: boolean
  /**
   * Out-of-band ANSI escapes that must be appended to the output stream after
   * the normal output phase diff. Empty string when no Kitty overlays are
   * emitted (cap disabled, no wide cells in region, or no backdrop active).
   *
   * Contains: CURSOR_SAVE + (optional image upload on first frame per term)
   * + per-cell CUP + place + CURSOR_RESTORE. Wrapped in save/restore so the
   * overlay doesn't disturb the main output phase's cursor tracking.
   */
  kittyOverlay: string
}

const FADE_ATTR = "data-backdrop-fade"
const FADE_EXCLUDE_ATTR = "data-backdrop-fade-excluded"

/**
 * Luminance threshold for dark/light theme detection.
 *
 * 0.18 is well below the WCAG midpoint. Standard dark terminal themes
 * (Catppuccin Mocha bg #1e1e2e, luminance ≈ 0.012; Tokyo Night bg #1a1b26,
 * ≈ 0.010) are well below. Light themes (GitHub Light #ffffff = 1.0) above.
 */
const DARK_LUMINANCE_THRESHOLD = 0.18

/** Canonical scrim colors — Apple's `colorWithWhite:0.0` / `:1.0`. */
const DARK_SCRIM = "#000000"
const LIGHT_SCRIM = "#ffffff"

interface FadeRect {
  rect: Rect
  amount: number
}

/**
 * Quick check: does the tree contain any backdrop markers? Used as a gate so
 * we don't clone the buffer every frame when no fade is active. Walks the
 * full tree once (O(N)) — the alternative (tracking dirty markers in the
 * reconciler) is more complex and the walk is cheap compared to the pass.
 */
export function hasBackdropMarkers(root: AgNode): boolean {
  const props = root.props as Record<string, unknown>
  if (props[FADE_ATTR] !== undefined || props[FADE_EXCLUDE_ATTR] !== undefined) return true
  for (const child of root.children) {
    if (hasBackdropMarkers(child)) return true
  }
  return false
}

/**
 * Apply backdrop-fade to the buffer based on tree markers.
 *
 * Returns a `BackdropFadeResult`:
 * - `modified` — whether any cells changed (for stats/logging).
 * - `kittyOverlay` — out-of-band ANSI escapes to append after output-phase
 *   diff. Empty when Kitty graphics are disabled or no wide cells exist in
 *   the faded region.
 */
export function applyBackdropFade(
  root: AgNode,
  buffer: TerminalBuffer,
  options?: BackdropFadeOptions,
): BackdropFadeResult {
  const colorLevel: BackdropColorLevel = options?.colorLevel ?? "truecolor"
  if (colorLevel === "none") return EMPTY_RESULT

  const includes: FadeRect[] = []
  const excludes: FadeRect[] = []
  collectBackdropMarkers(root, includes, excludes)

  if (includes.length === 0 && excludes.length === 0) return EMPTY_RESULT

  const strategy: FadeStrategy = colorLevel === "basic" ? "dim" : "mix"

  // Derive the scrim from rootBg luminance. Pure black for dark themes, pure
  // white for light — the canonical Apple / Material / Flutter convention.
  const scrim = deriveScrimColor(options?.rootBg)
  const rootBgHex = options?.rootBg ?? null

  let modified = false

  // Pass 1: data-backdrop-fade — fade cells INSIDE each marked rect.
  for (const { rect, amount } of includes) {
    if (amount <= 0) continue
    if (fadeRect(buffer, rect, amount, strategy, scrim, rootBgHex)) modified = true
  }

  // Pass 2: data-backdrop-fade-excluded — fade everything OUTSIDE each marked
  // rect (the modal "cuts a hole"). When multiple excluded rects exist, each
  // is processed independently: the union of their rects is the crisp region.
  if (excludes.length > 0) {
    const fullRect: Rect = { x: 0, y: 0, width: buffer.width, height: buffer.height }
    for (const { rect, amount } of excludes) {
      if (amount <= 0) continue
      if (fadeRectExcluding(buffer, fullRect, rect, amount, strategy, scrim, rootBgHex))
        modified = true
    }
  }

  // Emit Kitty graphics placements for wide-char cells in the faded region.
  // SGR 2 "dim" is a no-op on bitmap emoji in most terminals, so the scrim
  // overlay is the only way to visually fade emoji/CJK alongside text.
  const kittyEnabled = options?.kittyGraphics === true && strategy === "mix"
  const kittyOverlay = kittyEnabled
    ? buildKittyOverlay(buffer, includes, excludes, scrim, rootBgHex)
    : ""

  return { modified, kittyOverlay }
}

const EMPTY_RESULT: BackdropFadeResult = { modified: false, kittyOverlay: "" }

/**
 * Derive the scrim color from the root bg hex.
 *
 * Dark themes scrim toward `#000000`; light themes scrim toward `#ffffff`.
 * Returns `null` when `rootBg` is absent or unparseable — signals legacy
 * single-channel fallback in `fadeCell`.
 */
function deriveScrimColor(rootBg: string | undefined): string | null {
  if (!rootBg) return null
  const lum = relativeLuminance(rootBg)
  if (lum === null) return null
  return lum < DARK_LUMINANCE_THRESHOLD ? DARK_SCRIM : LIGHT_SCRIM
}

type FadeStrategy = "mix" | "dim"

function collectBackdropMarkers(node: AgNode, includes: FadeRect[], excludes: FadeRect[]): void {
  const props = node.props as Record<string, unknown>
  const includeRaw = props[FADE_ATTR]
  const excludeRaw = props[FADE_EXCLUDE_ATTR]

  if (includeRaw !== undefined || excludeRaw !== undefined) {
    const rect = node.screenRect ?? node.scrollRect ?? node.boxRect
    if (rect && rect.width > 0 && rect.height > 0) {
      const inc = parseFade(includeRaw)
      if (inc !== null) includes.push({ rect, amount: inc })
      const exc = parseFade(excludeRaw)
      if (exc !== null) excludes.push({ rect, amount: exc })
    }
  }

  for (const child of node.children) {
    collectBackdropMarkers(child, includes, excludes)
  }
}

function parseFade(raw: unknown): number | null {
  if (raw === undefined || raw === null) return null
  const n = typeof raw === "number" ? raw : Number(raw)
  if (!Number.isFinite(n)) return null
  if (n <= 0) return null
  return n > 1 ? 1 : n
}

function fadeRect(
  buffer: TerminalBuffer,
  rect: Rect,
  amount: number,
  strategy: FadeStrategy,
  scrim: string | null,
  rootBgHex: string | null,
): boolean {
  const x0 = Math.max(0, rect.x)
  const y0 = Math.max(0, rect.y)
  const x1 = Math.min(buffer.width, rect.x + rect.width)
  const y1 = Math.min(buffer.height, rect.y + rect.height)
  if (x0 >= x1 || y0 >= y1) return false

  let any = false
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      if (fadeCell(buffer, x, y, amount, strategy, scrim, rootBgHex)) any = true
    }
  }
  return any
}

function fadeRectExcluding(
  buffer: TerminalBuffer,
  outer: Rect,
  inner: Rect,
  amount: number,
  strategy: FadeStrategy,
  scrim: string | null,
  rootBgHex: string | null,
): boolean {
  const ox0 = Math.max(0, outer.x)
  const oy0 = Math.max(0, outer.y)
  const ox1 = Math.min(buffer.width, outer.x + outer.width)
  const oy1 = Math.min(buffer.height, outer.y + outer.height)

  const ix0 = Math.max(ox0, inner.x)
  const iy0 = Math.max(oy0, inner.y)
  const ix1 = Math.min(ox1, inner.x + inner.width)
  const iy1 = Math.min(oy1, inner.y + inner.height)
  const innerValid = ix0 < ix1 && iy0 < iy1

  let any = false
  for (let y = oy0; y < oy1; y++) {
    for (let x = ox0; x < ox1; x++) {
      if (innerValid && x >= ix0 && x < ix1 && y >= iy0 && y < iy1) continue
      if (fadeCell(buffer, x, y, amount, strategy, scrim, rootBgHex)) any = true
    }
  }
  return any
}

/**
 * Fade a single cell. Returns true if the cell was modified.
 *
 * ### `mix` strategy — sRGB source-over alpha
 *
 * When `scrim` (derived from `rootBg`) is provided:
 * - `cell.fg` is mixed toward `scrim` at `amount`: `fg' = fg * (1 - amount) + scrim * amount`.
 * - `cell.bg` is mixed toward `scrim` at `amount`. `null`/`DEFAULT_BG` cells
 *   are treated as the theme's `rootBg` first (that IS the color the terminal
 *   paints for them), then mixed — so empty cells darken at the same rate as
 *   explicitly-colored cells.
 *
 * Uniform amounts for fg + bg preserve relative brightness ordering across
 * borders vs fills. Heaviness is controlled by `amount`, not by asymmetric
 * math. Calibration at the call site — ModalDialog default is 0.25,
 * calibrated against macOS 0.20, Material 3 0.32, iOS 0.40, Flutter 0.54.
 *
 * When `scrim` is null (legacy path): mix fg toward cell.bg only.
 *
 * ### Wide-char / emoji handling
 *
 * Terminals render emoji glyphs using the glyph's own bitmap colors — the
 * `fg` mix has no visible effect on the emoji. Two compensations:
 *
 * 1. Stamp `attrs.dim` (SGR 2) on lead + continuation cells so terminals
 *    honoring SGR 2 fade the glyph. Best-effort.
 * 2. Propagate the mixed bg to the continuation cell so the two halves of
 *    the glyph share the same background (no visible split down the middle).
 *
 * ### `dim` strategy
 *
 * Stamps `attrs.dim` (SGR 2) on every covered cell. Used for the ANSI-16
 * tier where palette slot mixing isn't well-defined.
 */
function fadeCell(
  buffer: TerminalBuffer,
  x: number,
  y: number,
  amount: number,
  strategy: FadeStrategy,
  scrim: string | null,
  rootBgHex: string | null,
): boolean {
  // Skip continuation half of wide chars — the leading cell at x-1 will update
  // this cell's bg + dim in lockstep when it's processed.
  if (buffer.isCellContinuation(x, y)) return false

  const cell = buffer.getCell(x, y)

  if (strategy === "dim") {
    if (cell.attrs.dim) return false
    buffer.setCell(x, y, { ...cell, attrs: { ...cell.attrs, dim: true } })
    if (cell.wide && x + 1 < buffer.width) {
      const cont = buffer.getCell(x + 1, y)
      if (!cont.attrs.dim) {
        buffer.setCell(x + 1, y, { ...cont, attrs: { ...cont.attrs, dim: true } })
      }
    }
    return true
  }

  // strategy === "mix"
  const fgHex = colorToHex(cell.fg)

  if (scrim !== null && rootBgHex !== null) {
    // sRGB source-over mix: uniform fg + bg toward scrim at `amount`.
    const bgHex = colorToHex(cell.bg) ?? rootBgHex
    const mixedBgHex = mixSrgb(bgHex, scrim, amount)
    const mixedBg = hexToRgb(mixedBgHex)

    // Wide-char fg is INVISIBLE for emoji — stamp dim on lead + continuation
    // as best-effort for terminals honoring SGR 2 on bitmap glyphs.
    const stampEmojiDim = cell.wide
    const newAttrs = stampEmojiDim && !cell.attrs.dim ? { ...cell.attrs, dim: true } : cell.attrs

    if (!fgHex) {
      if (!mixedBg) {
        if (cell.attrs.dim) return false
        buffer.setCell(x, y, { ...cell, attrs: { ...cell.attrs, dim: true } })
        return true
      }
      buffer.setCell(x, y, { ...cell, bg: mixedBg, attrs: newAttrs })
      propagateBgToContinuation(buffer, cell, x, y, mixedBg, stampEmojiDim)
      return true
    }

    const mixedFgHex = mixSrgb(fgHex, scrim, amount)
    const mixedFg = hexToRgb(mixedFgHex)
    if (!mixedFg) return false

    if (!mixedBg) {
      buffer.setCell(x, y, { ...cell, fg: mixedFg, attrs: newAttrs })
      if (stampEmojiDim) propagateDimToContinuation(buffer, cell, x, y)
      return true
    }
    buffer.setCell(x, y, { ...cell, fg: mixedFg, bg: mixedBg, attrs: newAttrs })
    propagateBgToContinuation(buffer, cell, x, y, mixedBg, stampEmojiDim)
    return true
  }

  // Legacy path (no scrim): mix fg toward cell.bg.
  const bgHex = colorToHex(cell.bg)

  if (fgHex && bgHex) {
    const mixedHex = mixSrgb(fgHex, bgHex, amount)
    const mixedRgb = hexToRgb(mixedHex)
    if (!mixedRgb) return false
    buffer.setCell(x, y, { ...cell, fg: mixedRgb })
    return true
  }

  // Fallback — bg unresolvable (DEFAULT_BG / null) or fg null. Stamp dim so
  // the cell still reads as "backdrop".
  if (cell.attrs.dim) return false
  buffer.setCell(x, y, { ...cell, attrs: { ...cell.attrs, dim: true } })
  if (cell.wide && x + 1 < buffer.width) {
    const cont = buffer.getCell(x + 1, y)
    if (!cont.attrs.dim) {
      buffer.setCell(x + 1, y, { ...cont, attrs: { ...cont.attrs, dim: true } })
    }
  }
  return true
}

/**
 * When the lead cell of a wide char (emoji, CJK) has its bg mixed, copy the
 * mixed bg to its continuation cell at x+1. Without this, the two halves of
 * an emoji end up with different bg, producing a visually-split glyph.
 *
 * When `stampDim=true` also stamps `attrs.dim` on the continuation.
 */
function propagateBgToContinuation(
  buffer: TerminalBuffer,
  leadCell: { wide: boolean },
  x: number,
  y: number,
  mixedBg: { r: number; g: number; b: number },
  stampDim: boolean,
): void {
  if (!leadCell.wide) return
  if (x + 1 >= buffer.width) return
  const cont = buffer.getCell(x + 1, y)
  if (!cont.continuation) return
  const attrs = stampDim && !cont.attrs.dim ? { ...cont.attrs, dim: true } : cont.attrs
  buffer.setCell(x + 1, y, { ...cont, bg: mixedBg, attrs })
}

/**
 * Stamp `attrs.dim` on the continuation cell of a wide char when the lead
 * cell has been dimmed but no bg change needed propagation (e.g., lead cell
 * had null bg and only fg was mixed).
 */
function propagateDimToContinuation(
  buffer: TerminalBuffer,
  leadCell: { wide: boolean },
  x: number,
  y: number,
): void {
  if (!leadCell.wide) return
  if (x + 1 >= buffer.width) return
  const cont = buffer.getCell(x + 1, y)
  if (!cont.continuation) return
  if (cont.attrs.dim) return
  buffer.setCell(x + 1, y, { ...cont, attrs: { ...cont.attrs, dim: true } })
}

/** Convert a buffer Color to a `#rrggbb` hex string, or null if unresolvable. */
function colorToHex(color: Color): string | null {
  if (color === null) return null
  if (typeof color === "number") {
    const rgb = ansi256ToRgb(color)
    return rgbToHex(rgb.r, rgb.g, rgb.b)
  }
  if (isDefaultBg(color)) return null
  return rgbToHex(color.r, color.g, color.b)
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (n: number) => {
    const v = Math.max(0, Math.min(255, Math.round(n)))
    return v.toString(16).padStart(2, "0")
  }
  return `#${clamp(r)}${clamp(g)}${clamp(b)}`
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  if (typeof hex !== "string") return null
  let s = hex
  if (s.startsWith("#")) s = s.slice(1)
  if (s.length === 3) {
    s = s[0]! + s[0]! + s[1]! + s[1]! + s[2]! + s[2]!
  }
  if (s.length !== 6) return null
  const r = parseInt(s.slice(0, 2), 16)
  const g = parseInt(s.slice(2, 4), 16)
  const b = parseInt(s.slice(4, 6), 16)
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null
  return { r, g, b }
}

// =============================================================================
// Kitty graphics overlay for emoji/wide-char cells
// =============================================================================

/**
 * Alpha for the scrim overlay (0-255). Matches the "~50% darken" look: enough
 * to visibly mute the emoji without hiding it entirely. Chosen to feel
 * consistent with the ~0.25 fade applied to surrounding text cells.
 */
const SCRIM_ALPHA = 128

/**
 * Build the Kitty graphics escape sequence that covers wide-char cells in the
 * backdrop region with a translucent scrim.
 */
function buildKittyOverlay(
  buffer: TerminalBuffer,
  includes: FadeRect[],
  excludes: FadeRect[],
  scrim: string | null,
  rootBgHex: string | null,
): string {
  const cells = collectWideCellsInFadeRegion(buffer, includes, excludes)
  if (cells.length === 0) return ""

  // Tint the scrim with the same color used for cell mixing (pure black /
  // white by theme luminance). Fallback to pure black.
  const tintHex = scrim ?? rootBgHex ?? "#000000"
  const tint = hexToRgb(tintHex) ?? { r: 0, g: 0, b: 0 }
  const pixels = buildScrimPixels(tint, SCRIM_ALPHA)

  const parts: string[] = []
  parts.push(CURSOR_SAVE)
  parts.push(kittyUploadScrimImage(pixels, 2, 2))
  parts.push(kittyDeleteAllScrimPlacements())

  for (const { x, y } of cells) {
    parts.push(cupTo(x, y))
    parts.push(
      kittyPlaceAt({
        placementId: backdropPlacementId(x, y),
        cols: 2,
        rows: 1,
        z: 1,
      }),
    )
  }
  parts.push(CURSOR_RESTORE)
  return parts.join("")
}

/**
 * Walk the include and exclude rects and collect the coordinates of every
 * wide-char LEAD cell (not continuation) inside a faded region.
 */
function collectWideCellsInFadeRegion(
  buffer: TerminalBuffer,
  includes: FadeRect[],
  excludes: FadeRect[],
): Array<{ x: number; y: number }> {
  const seen = new Set<number>() // encoded y * W + x
  const out: Array<{ x: number; y: number }> = []

  const add = (x: number, y: number) => {
    if (x + 1 >= buffer.width) return // no room for continuation
    if (!buffer.isCellWide(x, y)) return
    if (buffer.isCellContinuation(x, y)) return
    const key = y * buffer.width + x
    if (seen.has(key)) return
    seen.add(key)
    out.push({ x, y })
  }

  for (const { rect } of includes) {
    const x0 = Math.max(0, rect.x)
    const y0 = Math.max(0, rect.y)
    const x1 = Math.min(buffer.width, rect.x + rect.width)
    const y1 = Math.min(buffer.height, rect.y + rect.height)
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) add(x, y)
    }
  }

  if (excludes.length > 0) {
    for (const { rect } of excludes) {
      const ix0 = Math.max(0, rect.x)
      const iy0 = Math.max(0, rect.y)
      const ix1 = Math.min(buffer.width, rect.x + rect.width)
      const iy1 = Math.min(buffer.height, rect.y + rect.height)
      for (let y = 0; y < buffer.height; y++) {
        for (let x = 0; x < buffer.width; x++) {
          if (x >= ix0 && x < ix1 && y >= iy0 && y < iy1) continue
          add(x, y)
        }
      }
    }
  }

  return out
}
