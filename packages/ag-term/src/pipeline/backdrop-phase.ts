/**
 * Backdrop fade pass.
 *
 * Runs AFTER the content + decoration phases, BEFORE the output phase. Walks
 * the tree to find nodes with `data-backdrop-fade` or
 * `data-backdrop-fade-excluded` markers, then applies a cell-level color
 * transform to the affected rect(s) on the buffer.
 *
 * ## Two-channel transform (truecolor / 256 tiers)
 *
 * Both `cell.fg` AND `cell.bg` are blended toward a theme-neutral color: pure
 * black (`#000000`) on dark themes, pure white (`#ffffff`) on light themes.
 * This produces a classic "modal spotlight" effect: colored surfaces (panels,
 * borders, badges) converge toward the neutral, not just text. The result reads
 * as "receded into the background" rather than "colorful but unreadable."
 *
 * Using pure black/white instead of `$bg` ensures that cells already AT the
 * theme background color darken further — amplifying the depth separation.
 *
 *   neutral = theme.dark ? "#000000" : "#ffffff"
 *   cell.fg = blend(cell.fg, neutral, amount)
 *   cell.bg = blend(cell.bg, neutral, amount)   (explicit bg only; null/default stay unchanged)
 *
 * Pass `rootBg` (the theme's `bg` hex) so the neutral can be derived. When
 * `rootBg` is not supplied the transform falls back to the legacy single-channel
 * behaviour: `cell.fg = blend(fg, cell.bg, amount)`.
 *
 * Tiers (`colorLevel`):
 * - `truecolor` / `256`: two-channel OKLab blend toward the theme neutral when
 *   `rootBg` is supplied; falls back to fg-toward-cell-bg otherwise. Fully
 *   deterministic — produces hex output.
 * - `basic` (ANSI 16): stamps `attrs.dim` (SGR 2) on each cell. Can't blend
 *   arbitrary palette slots, so this is best-effort.
 * - `none` (monochrome): no-op. Modal border + box-drawing carry separation.
 *
 * ## Incremental correctness
 *
 * The pass mutates the final buffer in place after the decoration phase. The
 * same buffer is what `ag.render()` stores as `_prevBuffer`. This is safe
 * because:
 *
 * 1. The backdrop pass is a pure function of (tree markers, buffer cells,
 *    rootBg). `rootBg` is derived from the current theme — stable within a
 *    frame and identical on fresh/incremental paths.
 * 2. `renderPhase` writes the same pre-transform pixels on both fresh and
 *    incremental paths (this is the existing incremental invariant).
 * 3. Running the same pure transform over both paths produces identical post-
 *    transform buffers — `SILVERY_STRICT=1` (cell-by-cell compare between
 *    incremental and fresh render) stays green.
 * 4. On the NEXT frame, `renderPhase` clones the post-transform buffer.
 *    Cells in backdrop regions stay faded (fast-path skipped). Dirty cells
 *    get re-rendered with pre-transform content, then the pass re-applies
 *    fade. Result matches a fresh render.
 *
 * If the backdrop region itself moves (modal open/close, Backdrop mount/
 * unmount), the tree change triggers dirty re-renders in the affected area.
 * The new region is computed from the current tree — the pass doesn't carry
 * state across frames.
 */

import { blend } from "@silvery/theme"
import { relativeLuminance } from "@silvery/color"
import type { AgNode, Rect } from "@silvery/ag/types"
import { ansi256ToRgb, isDefaultBg, type Color, type TerminalBuffer } from "../buffer"

export type BackdropColorLevel = "none" | "basic" | "256" | "truecolor"

export interface BackdropFadeOptions {
  /** Terminal color tier. Controls which transform strategy runs. */
  colorLevel?: BackdropColorLevel
  /**
   * Root background hex color from the active theme (e.g. `theme.bg`).
   *
   * When supplied, the blend target is derived as the theme-neutral: pure black
   * (`#000000`) for dark themes (luminance < 0.18), pure white (`#ffffff`) for
   * light themes. Both `cell.fg` and `cell.bg` are blended toward this neutral,
   * giving the "modal spotlight" depth effect.
   *
   * When omitted, the pass falls back to the legacy single-channel behavior:
   * `cell.fg = blend(fg, cell.bg, amount)`.
   */
  rootBg?: string
}

const FADE_ATTR = "data-backdrop-fade"
const FADE_EXCLUDE_ATTR = "data-backdrop-fade-excluded"

/**
 * Luminance threshold for dark/light theme detection.
 *
 * 0.18 is well below the WCAG midpoint (0.179 ≈ WCAG threshold for white text
 * on dark bg). Standard dark terminal themes (Catppuccin Mocha bg #1e1e2e,
 * luminance ≈ 0.012; Tokyo Night bg #1a1b26, luminance ≈ 0.010) are well
 * below this. Light themes (GitHub Light bg #ffffff, luminance = 1.0) are
 * well above.
 */
const DARK_LUMINANCE_THRESHOLD = 0.18

/** Derived neutral color for dark themes — blend target for the spotlight effect. */
const DARK_NEUTRAL = "#000000"

/** Derived neutral color for light themes — blend target for the spotlight effect. */
const LIGHT_NEUTRAL = "#ffffff"

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
 * Returns `true` if at least one region was modified; `false` if nothing
 * changed (no markers found, or colorLevel is `none`).
 */
export function applyBackdropFade(
  root: AgNode,
  buffer: TerminalBuffer,
  options?: BackdropFadeOptions,
): boolean {
  const colorLevel: BackdropColorLevel = options?.colorLevel ?? "truecolor"
  if (colorLevel === "none") return false

  const includes: FadeRect[] = []
  const excludes: FadeRect[] = []
  collectBackdropMarkers(root, includes, excludes)

  if (includes.length === 0 && excludes.length === 0) return false

  const strategy: FadeStrategy = colorLevel === "basic" ? "dim" : "blend"

  // Derive the theme-neutral blend target from rootBg luminance.
  // Pure black/white is chosen (not $bg itself) so cells already AT $bg darken
  // further, amplifying the depth separation from the modal.
  const blendTarget = deriveBlendTarget(options?.rootBg)

  let modified = false

  // Pass 1: data-backdrop-fade — fade cells INSIDE each marked rect.
  for (const { rect, amount } of includes) {
    if (amount <= 0) continue
    if (fadeRect(buffer, rect, amount, strategy, blendTarget)) modified = true
  }

  // Pass 2: data-backdrop-fade-excluded — fade everything OUTSIDE each marked
  // rect (the modal "cuts a hole"). When multiple excluded rects exist, each
  // is processed independently: the union of their rects is the crisp region.
  if (excludes.length > 0) {
    const fullRect: Rect = { x: 0, y: 0, width: buffer.width, height: buffer.height }
    for (const { rect, amount } of excludes) {
      if (amount <= 0) continue
      if (fadeRectExcluding(buffer, fullRect, rect, amount, strategy, blendTarget)) modified = true
    }
  }

  return modified
}

/**
 * Derive the blend target color (theme-neutral) from the root bg hex.
 *
 * Returns `null` when `rootBg` is absent or unparseable — signals legacy
 * single-channel fallback in `fadeCell`.
 */
function deriveBlendTarget(rootBg: string | undefined): string | null {
  if (!rootBg) return null
  const lum = relativeLuminance(rootBg)
  if (lum === null) return null
  return lum < DARK_LUMINANCE_THRESHOLD ? DARK_NEUTRAL : LIGHT_NEUTRAL
}

type FadeStrategy = "blend" | "dim"

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
  blendTarget: string | null,
): boolean {
  const x0 = Math.max(0, rect.x)
  const y0 = Math.max(0, rect.y)
  const x1 = Math.min(buffer.width, rect.x + rect.width)
  const y1 = Math.min(buffer.height, rect.y + rect.height)
  if (x0 >= x1 || y0 >= y1) return false

  let any = false
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      if (fadeCell(buffer, x, y, amount, strategy, blendTarget)) any = true
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
  blendTarget: string | null,
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
      if (fadeCell(buffer, x, y, amount, strategy, blendTarget)) any = true
    }
  }
  return any
}

/**
 * Fade a single cell. Returns true if the cell was modified.
 *
 * ### `blend` strategy — two-channel transform
 *
 * When `blendTarget` (derived from `rootBg`) is provided:
 * - `cell.fg` is blended toward `blendTarget`
 * - `cell.bg` is blended toward `blendTarget` (explicit hex/256 only;
 *   null or DEFAULT_BG are left unchanged — they already represent the
 *   terminal's own background)
 *
 * This is the "modal spotlight" transform: everything outside the modal
 * converges toward the theme-neutral (pure black for dark themes, pure white
 * for light themes), creating a strong visual separation.
 *
 * When `blendTarget` is null (legacy path): mix fg toward cell.bg only.
 *
 * ### `dim` strategy
 *
 * Stamps `attrs.dim` (SGR 2). Used for the ANSI-16 tier where palette slot
 * blending isn't well-defined.
 *
 * Wide-char continuation cells are skipped — they share styling with the
 * leading cell and modifying them separately would desync.
 */
function fadeCell(
  buffer: TerminalBuffer,
  x: number,
  y: number,
  amount: number,
  strategy: FadeStrategy,
  blendTarget: string | null,
): boolean {
  // Skip continuation half of wide chars — the leading cell carries the style.
  if (buffer.isCellContinuation(x, y)) return false

  const cell = buffer.getCell(x, y)

  if (strategy === "dim") {
    if (cell.attrs.dim) return false
    buffer.setCell(x, y, { ...cell, attrs: { ...cell.attrs, dim: true } })
    return true
  }

  // strategy === "blend"
  const fgHex = colorToHex(cell.fg)

  if (blendTarget !== null) {
    // Two-channel transform: blend fg AND bg toward the theme-neutral.
    if (!fgHex) {
      // fg unresolvable — stamp dim as fallback.
      if (cell.attrs.dim) return false
      buffer.setCell(x, y, { ...cell, attrs: { ...cell.attrs, dim: true } })
      return true
    }

    const blendedFgHex = blend(fgHex, blendTarget, amount)
    const blendedFg = hexToRgb(blendedFgHex)
    if (!blendedFg) return false

    // Blend bg toward the neutral only when it's an explicit (resolvable) color.
    // null or DEFAULT_BG cells inherit the terminal bg — they're already at the
    // "deepest" level and don't need to be shifted.
    const bgHex = colorToHex(cell.bg)
    if (bgHex) {
      const blendedBgHex = blend(bgHex, blendTarget, amount)
      const blendedBg = hexToRgb(blendedBgHex)
      if (!blendedBg) {
        buffer.setCell(x, y, { ...cell, fg: blendedFg })
        return true
      }
      buffer.setCell(x, y, { ...cell, fg: blendedFg, bg: blendedBg })
    } else {
      // bg is null/default — only update fg.
      buffer.setCell(x, y, { ...cell, fg: blendedFg })
    }
    return true
  }

  // Legacy path (no blendTarget): blend fg toward cell.bg.
  const bgHex = colorToHex(cell.bg)

  if (fgHex && bgHex) {
    // OKLab blend fg toward bg. amount=0.4 means 40% of the way to bg.
    const blendedHex = blend(fgHex, bgHex, amount)
    const blendedRgb = hexToRgb(blendedHex)
    if (!blendedRgb) return false
    buffer.setCell(x, y, { ...cell, fg: blendedRgb })
    return true
  }

  // Fallback — bg unresolvable (DEFAULT_BG / null) or fg null. Stamp dim so
  // the cell still reads as "backdrop". This covers cells that inherit the
  // terminal bg where we can't compute a blend target.
  if (cell.attrs.dim) return false
  buffer.setCell(x, y, { ...cell, attrs: { ...cell.attrs, dim: true } })
  return true
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
