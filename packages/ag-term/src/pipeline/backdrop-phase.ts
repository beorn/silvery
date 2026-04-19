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

import { blend, hexToOklch, oklchToHex } from "@silvery/color"
import { relativeLuminance } from "@silvery/color"
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
   * When supplied, the blend target is derived as the theme-neutral: pure black
   * (`#000000`) for dark themes (luminance < 0.18), pure white (`#ffffff`) for
   * light themes. Both `cell.fg` and `cell.bg` are blended toward this neutral,
   * giving the "modal spotlight" depth effect.
   *
   * When omitted, the pass falls back to the legacy single-channel behavior:
   * `cell.fg = blend(fg, cell.bg, amount)`.
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
 * 0.18 is well below the WCAG midpoint (0.179 ≈ WCAG threshold for white text
 * on dark bg). Standard dark terminal themes (Catppuccin Mocha bg #1e1e2e,
 * luminance ≈ 0.012; Tokyo Night bg #1a1b26, luminance ≈ 0.010) are well
 * below this. Light themes (GitHub Light bg #ffffff, luminance = 1.0) are
 * well above.
 */
const DARK_LUMINANCE_THRESHOLD = 0.18

/**
 * OKLCH lightness offset for dark-theme neutral. The blend target for dark
 * themes is a DESATURATED gray at `rootBg.L - 0.15`. Using pure black
 * (`#000000`) as the target preserves the rootBg's hue when blending null-bg
 * cells (the cell's starting color is rootBg, and black has undefined hue in
 * OKLab so the hue doesn't drift — but the cell ends up at a darker version
 * of rootBg's hue, giving a "blue cast" on Nord-like blue-tinted schemes).
 *
 * Blending toward a hue-neutral dark gray (C=0) drags the cell's chroma down
 * while darkening L — so null-bg cells desaturate as they darken. Explicitly-
 * colored cells (red text, green badges) keep their hue because the blend
 * target has C=0, which in OKLab means "no color contribution" — the
 * saturated channel dominates relative to neutral, preserving hue.
 *
 * 0.15 is the empirically-chosen L offset: enough to visibly darken, small
 * enough that null-bg cells remain in the "backdrop palette" rather than
 * collapsing to pure black (which would exaggerate the fade and lose
 * readability). For light themes the sign flips.
 */
const DARK_NEUTRAL_L_OFFSET = -0.15
const LIGHT_NEUTRAL_L_OFFSET = 0.15

/**
 * Uniform fg/bg blend — both channels blend toward the theme-neutral at the
 * same `amount`.
 *
 * History: an earlier revision (b2dafd70) used asymmetric amounts
 * (`bg = fg * 0.5`) with the rationale that bg dominates visual weight. That
 * rationale is CORRECT, but the execution caused three real-app regressions:
 *
 * 1. Brightness-ordering inversion (dominant). A border char (fg-dominated
 *    cell) and an adjacent panel-fill cell (bg-dominated) walk toward the
 *    neutral at different rates. Border fg at full `amount` darkens ~2x
 *    faster than panel bg at `amount/2`. A border that was visibly brighter
 *    than its panel pre-fade (the standard UI affordance: "border delineates
 *    panel") collapses in relative brightness — and often inverts outright.
 *    The user's exact observation: separator borders that were lighter
 *    became darker than the panel fill after the modal opened.
 *
 * 2. Emoji / wide-char "bright spot." Emoji glyphs are rendered by the
 *    terminal using their own bitmap colors — the fg blend has NO visual
 *    effect on the glyph. So emoji cells only saw the (reduced) bg blend
 *    while surrounding text saw both full-amount fg + half-amount bg.
 *    Emoji visibly popped against darkened neighbors. (Separate fix:
 *    `attrs.dim` is stamped on wide-char cells so terminals honoring SGR 2
 *    fade the glyph.)
 *
 * 3. Excessive overall darkness. The `amount=0.7` default was calibrated
 *    against the asymmetric path — halving bg compensated for over-eager
 *    fg. With uniform amounts that compensation is gone; the default must
 *    come down substantially. macOS sheet backdrop ≈ 20%, iOS action sheet
 *    ≈ 40%, Material 3 scrim = 32%. We aim for ~0.25 by default.
 *
 * Uniform amounts preserve relative brightness ordering and deltas across
 * fg/bg — the UI's visual hierarchy survives the fade. The "too heavy"
 * problem is solved by lowering the default fade, not by asymmetric math.
 */

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
 *
 * The result was promoted from a bare `boolean` when the Kitty emoji-scrim
 * overlay was added — the old shape is preserved via `modified`.
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

  const strategy: FadeStrategy = colorLevel === "basic" ? "dim" : "blend"

  // Derive the theme-neutral blend target from rootBg luminance.
  // Pure black/white is chosen (not $bg itself) so cells already AT $bg darken
  // further, amplifying the depth separation from the modal.
  const blendTarget = deriveBlendTarget(options?.rootBg)
  const rootBgHex = options?.rootBg ?? null

  let modified = false

  // Pass 1: data-backdrop-fade — fade cells INSIDE each marked rect.
  for (const { rect, amount } of includes) {
    if (amount <= 0) continue
    if (fadeRect(buffer, rect, amount, strategy, blendTarget, rootBgHex)) modified = true
  }

  // Pass 2: data-backdrop-fade-excluded — fade everything OUTSIDE each marked
  // rect (the modal "cuts a hole"). When multiple excluded rects exist, each
  // is processed independently: the union of their rects is the crisp region.
  if (excludes.length > 0) {
    const fullRect: Rect = { x: 0, y: 0, width: buffer.width, height: buffer.height }
    for (const { rect, amount } of excludes) {
      if (amount <= 0) continue
      if (fadeRectExcluding(buffer, fullRect, rect, amount, strategy, blendTarget, rootBgHex))
        modified = true
    }
  }

  // After the per-cell fade pass, emit Kitty graphics placements for any
  // wide-char cells in the faded region. SGR 2 "dim" is a no-op on bitmap
  // emoji in most terminals (Ghostty confirmed), so the scrim overlay is
  // the only way to visually fade emoji/CJK alongside text.
  //
  // Incremental invariant: the wide-cell set is derived from the same
  // post-fade buffer state on both fresh and incremental paths (renderPhase
  // writes the same pre-transform pixels on both paths, and the fade pass
  // is a pure function). So the emitted placements are byte-identical
  // between fresh and incremental renders. STRICT mode stays green.
  const kittyEnabled = options?.kittyGraphics === true && strategy === "blend"
  const kittyOverlay = kittyEnabled
    ? buildKittyOverlay(buffer, includes, excludes, blendTarget, rootBgHex)
    : ""

  return { modified, kittyOverlay }
}

const EMPTY_RESULT: BackdropFadeResult = { modified: false, kittyOverlay: "" }

/**
 * Derive the blend target color from the root bg hex.
 *
 * The target is a DESATURATED gray (C=0 in OKLCH) at a luminance offset from
 * the rootBg. For dark themes: `oklch(rootBg.L - 0.15, 0, 0)` → a dark gray.
 * For light themes: `oklch(rootBg.L + 0.15, 0, 0)` → a light gray.
 *
 * Using C=0 means the target has no hue, so blending null-bg cells (which
 * start at rootBg's hue) drags chroma DOWN as they darken — they desaturate
 * along the way rather than staying at rootBg's hue. On a Nord-like theme
 * (#2E3440, blue-tinted) the user previously saw the whole backdrop tint
 * blue post-fade; with this target the backdrop goes neutral gray instead.
 *
 * Explicitly-colored text/bg cells keep their hue because OKLab blending
 * toward a C=0 target preserves hue (the saturated channel dominates).
 *
 * Returns `null` when `rootBg` is absent or unparseable — signals legacy
 * single-channel fallback in `fadeCell`.
 */
function deriveBlendTarget(rootBg: string | undefined): string | null {
  if (!rootBg) return null
  const o = hexToOklch(rootBg)
  if (!o) return null
  const lum = relativeLuminance(rootBg)
  if (lum === null) return null
  const offset = lum < DARK_LUMINANCE_THRESHOLD ? DARK_NEUTRAL_L_OFFSET : LIGHT_NEUTRAL_L_OFFSET
  const targetL = Math.max(0, Math.min(1, o.L + offset))
  return oklchToHex({ L: targetL, C: 0, H: 0 })
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
      if (fadeCell(buffer, x, y, amount, strategy, blendTarget, rootBgHex)) any = true
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
      if (fadeCell(buffer, x, y, amount, strategy, blendTarget, rootBgHex)) any = true
    }
  }
  return any
}

/**
 * Fade a single cell. Returns true if the cell was modified.
 *
 * ### `blend` strategy — two-channel uniform transform
 *
 * When `blendTarget` (derived from `rootBg`) is provided:
 * - `cell.fg` is blended toward `blendTarget` at `amount` (only when
 *   `cell.fg` resolves to a concrete color; null fg cells keep `fg=null`).
 * - `cell.bg` is blended toward `blendTarget` at `amount`. `null`/`DEFAULT_BG`
 *   cells are treated as the theme's `rootBg` (that IS the color the
 *   terminal paints for them), so empty space cells in the modal's shadow
 *   darken at the same rate as explicitly-colored cells.
 *
 * Uniform amounts preserve relative brightness ordering between border
 * (fg-dominated) and panel-fill (bg-dominated) cells — the visual hierarchy
 * survives the fade. Calibration happens at the call site: the ModalDialog
 * default fade is deliberately small (~0.25) to keep the backdrop readable.
 *
 * This is the "modal spotlight" transform: everything outside the modal
 * converges toward the theme-neutral (pure black for dark themes, pure white
 * for light themes), creating visual separation. Both filled and empty cells
 * must darken — otherwise empty regions read as "modal not active" while
 * only text cells show the fade.
 *
 * When `blendTarget` is null (legacy path): mix fg toward cell.bg only.
 *
 * ### Wide-char / emoji handling
 *
 * Terminals render emoji glyphs using the glyph's own bitmap colors — the
 * `fg` blend has no visual effect on the emoji itself, only on text chars.
 * So an emoji in a backdrop, even with `fg` blended to near-black, would
 * visibly pop against surrounding darkened cells.
 *
 * Mitigation: stamp `attrs.dim` (SGR 2) on wide-char lead + continuation
 * cells. Most modern terminals (Ghostty, iTerm2, Kitty, WezTerm) honor SGR
 * 2 on emoji and render the glyph at reduced opacity. This is a best-effort
 * fade — not all terminals implement it, but the ones that do make the
 * emoji recede visually alongside its darkened bg.
 *
 * Separately, the continuation cell at `x+1` also needs its bg synced to
 * the lead cell's blended bg (otherwise the two halves of the glyph have
 * different bg colors — a visual split down the middle).
 *
 * ### `dim` strategy
 *
 * Stamps `attrs.dim` (SGR 2) on every covered cell. Used for the ANSI-16
 * tier where palette slot blending isn't well-defined.
 */
function fadeCell(
  buffer: TerminalBuffer,
  x: number,
  y: number,
  amount: number,
  strategy: FadeStrategy,
  blendTarget: string | null,
  rootBgHex: string | null,
): boolean {
  // Skip continuation half of wide chars — the leading cell at x-1 will update
  // this cell's bg + dim in lockstep when it's processed. Processing the
  // continuation independently would double-blend or desync from the lead.
  if (buffer.isCellContinuation(x, y)) return false

  const cell = buffer.getCell(x, y)

  if (strategy === "dim") {
    if (cell.attrs.dim) return false
    buffer.setCell(x, y, { ...cell, attrs: { ...cell.attrs, dim: true } })
    // Wide-char continuation also gets dim so the whole glyph fades uniformly.
    if (cell.wide && x + 1 < buffer.width) {
      const cont = buffer.getCell(x + 1, y)
      if (!cont.attrs.dim) {
        buffer.setCell(x + 1, y, { ...cont, attrs: { ...cont.attrs, dim: true } })
      }
    }
    return true
  }

  // strategy === "blend"
  const fgHex = colorToHex(cell.fg)

  if (blendTarget !== null && rootBgHex !== null) {
    // Two-channel UNIFORM transform: blend fg and bg toward the theme-neutral
    // at the same `amount`. Asymmetric amounts (the b2dafd70 revision) caused
    // border/panel brightness inversion — see the BG_FADE_RATIO docblock
    // (removed) for the full history.
    //
    // Blend bg toward the neutral. When cell.bg is null/DEFAULT_BG, treat it
    // as the theme's rootBg — that IS the color the terminal paints for those
    // cells. Blending null-bg cells produces an explicit darkened hex so the
    // backdrop visibly darkens past $bg, matching cells with explicit $bg.
    const bgHex = colorToHex(cell.bg) ?? rootBgHex
    const blendedBgHex = blend(bgHex, blendTarget, amount)
    const blendedBg = hexToRgb(blendedBgHex)

    // Wide-char fg is INVISIBLE for emoji (terminal uses the glyph's own
    // colors). Stamp dim as a best-effort so terminals honoring SGR 2
    // on emoji fade the glyph alongside surrounding cells. Also stamp the
    // continuation cell.
    const stampEmojiDim = cell.wide
    const newAttrs = stampEmojiDim && !cell.attrs.dim ? { ...cell.attrs, dim: true } : cell.attrs

    // If fg is unresolvable (null — e.g., space character with no foreground),
    // blend the bg alone. Still mark dim as a belt-and-suspenders signal for
    // downstream consumers (terminals that ignore bg but honor SGR 2).
    if (!fgHex) {
      if (!blendedBg) {
        // Couldn't resolve either channel — final fallback to dim stamp.
        if (cell.attrs.dim) return false
        buffer.setCell(x, y, { ...cell, attrs: { ...cell.attrs, dim: true } })
        return true
      }
      buffer.setCell(x, y, { ...cell, bg: blendedBg, attrs: newAttrs })
      propagateBgToContinuation(buffer, cell, x, y, blendedBg, stampEmojiDim)
      return true
    }

    const blendedFgHex = blend(fgHex, blendTarget, amount)
    const blendedFg = hexToRgb(blendedFgHex)
    if (!blendedFg) return false

    if (!blendedBg) {
      buffer.setCell(x, y, { ...cell, fg: blendedFg, attrs: newAttrs })
      // No bg change to propagate, but continuation dim still needs syncing
      // when this is a wide char.
      if (stampEmojiDim) propagateDimToContinuation(buffer, cell, x, y)
      return true
    }
    buffer.setCell(x, y, { ...cell, fg: blendedFg, bg: blendedBg, attrs: newAttrs })
    propagateBgToContinuation(buffer, cell, x, y, blendedBg, stampEmojiDim)
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
  // Wide-char continuation also gets dim for uniform fade across the glyph.
  if (cell.wide && x + 1 < buffer.width) {
    const cont = buffer.getCell(x + 1, y)
    if (!cont.attrs.dim) {
      buffer.setCell(x + 1, y, { ...cont, attrs: { ...cont.attrs, dim: true } })
    }
  }
  return true
}

/**
 * When the lead cell of a wide char (emoji, CJK) has its bg blended, copy the
 * blended bg to its continuation cell at x+1. Without this, the two halves of
 * an emoji darken by different amounts — lead cell shows the blended bg,
 * continuation keeps the pre-fade bg, producing a visually-split glyph.
 *
 * When `stampDim=true` also stamps `attrs.dim` on the continuation (matches
 * the lead cell's dim stamp for emoji visual fade).
 *
 * `setCell` on a continuation cell preserves the continuation flag and char
 * (usually space or mirror of lead). Only the bg / dim attr updates.
 */
function propagateBgToContinuation(
  buffer: TerminalBuffer,
  leadCell: { wide: boolean },
  x: number,
  y: number,
  blendedBg: { r: number; g: number; b: number },
  stampDim: boolean,
): void {
  if (!leadCell.wide) return
  if (x + 1 >= buffer.width) return
  const cont = buffer.getCell(x + 1, y)
  if (!cont.continuation) return
  const attrs = stampDim && !cont.attrs.dim ? { ...cont.attrs, dim: true } : cont.attrs
  buffer.setCell(x + 1, y, { ...cont, bg: blendedBg, attrs })
}

/**
 * Stamp `attrs.dim` on the continuation cell of a wide char when the lead
 * cell has been dimmed but no bg change needed propagation (e.g., lead cell
 * had null bg and only fg was blended).
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
 *
 * ## What this emits
 *
 * 1. `CURSOR_SAVE` — preserve output-phase cursor tracking
 * 2. `kittyUploadScrimImage` — upload a 2x2 RGBA image under our reserved
 *    image ID. Repeat every frame (idempotent per Kitty spec — terminal
 *    replaces existing image with same `i=<id>`). Tiny payload (~60 bytes).
 * 3. `kittyDeleteAllScrimPlacements` — clear prior placements. Without this,
 *    placements from the previous frame's backdrop region would accumulate.
 * 4. For each wide-char cell in the faded region:
 *    - `cupTo(x, y)` — move to the cell
 *    - `kittyPlaceAt` — emit a `c=2,r=1` placement (covers both lead + cont)
 *      with `z=1` (above text) and `C=1` (don't advance cursor)
 * 5. `CURSOR_RESTORE`
 *
 * Placement extent is `c=2,r=1` because wide chars occupy 2 cells. We only
 * target the lead cell (`!isCellContinuation`) — the placement naturally
 * spans the continuation.
 *
 * ## Determinism / STRICT compatibility
 *
 * The set of wide cells is derived from the POST-fade buffer state. The fade
 * pass is a pure function of (tree markers, buffer, rootBg) and produces
 * identical buffers on fresh and incremental paths (this is the existing
 * invariant documented in `ag.ts`). So the Kitty overlay string is also
 * byte-identical on both paths. `SILVERY_STRICT=1` compares cells, not ANSI
 * output, so this is unaffected. ANSI-level STRICT modes (vt100/xterm) never
 * ran the emission path — we now short-circuit via the per-instance env
 * check to keep them deterministic.
 */
function buildKittyOverlay(
  buffer: TerminalBuffer,
  includes: FadeRect[],
  excludes: FadeRect[],
  blendTarget: string | null,
  rootBgHex: string | null,
): string {
  const cells = collectWideCellsInFadeRegion(buffer, includes, excludes)
  if (cells.length === 0) return ""

  // Pick a tint for the scrim. When we have a blend target (theme-neutral),
  // use it directly — the scrim lands on the emoji at the same darken amount
  // as the surrounding cell bg blend. Fallback to pure black.
  const tintHex = blendTarget ?? rootBgHex ?? "#000000"
  const tint = hexToRgb(tintHex) ?? { r: 0, g: 0, b: 0 }
  const pixels = buildScrimPixels(tint, SCRIM_ALPHA)

  const parts: string[] = []
  parts.push(CURSOR_SAVE)
  parts.push(kittyUploadScrimImage(pixels, 2, 2))
  // Clear any placements left over from prior frames. We re-emit the full set
  // each frame, so a single delete-all at the top is simpler than tracking
  // deltas. Kitty handles this in O(N) where N = active placements — cheap.
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
 *
 * For `includes`, a cell is in the faded region iff it falls inside the rect.
 * For `excludes` (the "modal cuts a hole" pattern), a cell is faded iff it
 * falls OUTSIDE the rect. When both include and exclude rects are present,
 * the union is walked independently — this matches the fade pass semantics.
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
    // Faded region = full buffer MINUS union of exclude rects. For a single
    // exclude rect this degenerates to "everything outside one hole" which
    // is the common modal case.
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
