/**
 * Backdrop fade pass.
 *
 * Runs AFTER the content + decoration phases, BEFORE the output phase. Walks
 * the tree to find nodes with `data-backdrop-fade` or
 * `data-backdrop-fade-excluded` markers, then applies a cell-level color
 * transform to the affected rect(s) on the buffer.
 *
 * ## The model: per-channel alpha scrim with perceptually-aware fg
 *
 * The pass fades every covered cell by blending BOTH fg AND bg toward a
 * neutral scrim color at the caller's `amount`. Default scrim: pure black
 * for dark themes (Apple `colorWithWhite:0.0 alpha:0.4`), pure white for
 * light. Default amount: 0.25 (calibrated against macOS 0.20, Material 3
 * 0.32, iOS 0.40, Flutter 0.54).
 *
 * ### Two operations, one per channel
 *
 *   fg' = deemphasize(fg, amount)     // OKLCH: L*=1-α, C*=1-α, H preserved
 *   bg' = mixSrgb(bg, scrim, amount)  // sRGB source-over alpha
 *
 * Why the split:
 *
 * Foreground colored text (syntax highlights, badges, chromatic glyphs) is
 * where users notice "darkened colors look MORE saturated" — sRGB channel-
 * linear scaling preserves HSL ratios but subtly breaks perceived chroma-
 * per-luminance (C/L) because OKLCH's L isn't linear with sRGB channel
 * multiplication. Using OKLCH `deemphasize` (proportional L + C scaling, H
 * preserved) keeps C/L constant — a blue stays "the same blue, less visually
 * present" rather than "darker blue that pops harder".
 *
 * Background uses sRGB source-over because the Kitty graphics scrim overlay
 * composites in sRGB at alpha at the hardware level. Using sRGB for bg here
 * keeps text-cell bg visually matching emoji-cell bg (where Kitty handles
 * the fade) — critical for making wide cells and neighboring text cells
 * read as the same faded region.
 *
 * ### No asymmetric amount math
 *
 * Amounts are uniform across fg and bg (both use `amount`). An earlier
 * revision halved bg amount to prevent "scene drowning" — that caused
 * border/panel brightness inversion (fg-dominated border darkens faster
 * than bg-dominated fill). Heaviness is controlled by `amount`, not by
 * asymmetric math.
 *
 * ## Scrim color
 *
 * - Dark themes: pure black (`#000000`) — Apple's modal-sheet dimming color.
 * - Light themes: pure white (`#ffffff`) — the sign-flipped equivalent.
 *
 * Null-bg cells are resolved to rootBg first, then `mixSrgb` toward the
 * scrim — empty cells darken at the same rate as explicitly-colored ones.
 *
 * Tiers (`colorLevel`): a single code path for all supported tiers. For
 * `"none"` (monochrome) the pass short-circuits to a no-op. For `basic`,
 * `256`, and `truecolor`, the per-cell operation is identical — the output
 * phase quantizes the mixed truecolor hex to the tier's palette on emit.
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
 * Terminals render emoji using the glyph's own bitmap colors — the per-cell
 * fg mix has no visible effect on the emoji itself. Two paths, mutually
 * exclusive:
 *
 * 1. **Kitty graphics available** (Ghostty / Kitty / WezTerm outside tmux):
 *    `buildKittyOverlay` emits a translucent scrim image at alpha=amount
 *    above each wide cell, and the per-cell mix SKIPS wide cells entirely.
 *    The terminal composites the overlay on top of the unmixed cell, landing
 *    at `cell_bg * (1 - amount) + scrim * amount` — the same luminance as
 *    surrounding non-wide cells (which were mixed via the cell pass). This
 *    avoids the double-fade that would make emoji bg visibly blacker than
 *    surrounding text cells.
 *
 * 2. **Kitty graphics unavailable** (tmux, or older terminal): the per-cell
 *    mix runs on wide cells too and stamps `attrs.dim` (SGR 2) on lead +
 *    continuation. Terminals honoring SGR 2 on emoji fade the glyph;
 *    others see the glyph at full brightness but the cell bg matches
 *    surroundings.
 */

import { hexToOklch, oklchToHex, relativeLuminance } from "@silvery/color"
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
  /**
   * Terminal color tier. `"none"` short-circuits to a no-op (monochrome).
   * All other tiers run the same sRGB scrim mix — output phase quantizes
   * to the tier's palette on emit.
   */
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
 * Result of `applyBackdropFade`.
 *
 * The split between `bufferModified` and `visuallyModified` reflects that
 * Kitty-capable terminals can change the visible frame without mutating
 * any buffer cells (pure overlay). Callers gating on "did anything change"
 * should check `visuallyModified`; callers logging buffer-cell stats
 * should check `bufferModified`. `modified` is a pre-split alias kept for
 * backward compatibility — it equals `bufferModified`.
 */
export interface BackdropFadeResult {
  /** @deprecated alias for `bufferModified`. */
  modified: boolean
  /** True when at least one buffer cell was mutated by the pass. */
  bufferModified: boolean
  /** True when the visible frame differs from pre-fade: buffer OR overlay. */
  visuallyModified: boolean
  /**
   * Out-of-band ANSI escapes appended after the normal output phase diff.
   * Non-empty whenever Kitty graphics are enabled AND a backdrop is active
   * — includes a delete-all-placements command so last-frame scrims get
   * cleared even if this frame has no wide cells.
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
 * - `bufferModified` — any buffer cells changed (STRICT compares buffers;
 *   this is the narrow "did we mutate the buffer" signal).
 * - `visuallyModified` — the visible frame differs from the pre-fade state.
 *   True when buffer cells changed OR a Kitty overlay is emitted. Callers
 *   that gate re-render on "anything changed" should check this field.
 * - `kittyOverlay` — out-of-band ANSI escapes. Non-empty when Kitty graphics
 *   are enabled AND backdrop is active: contains at minimum a scrim-clear
 *   command so last-frame placements get erased even if this frame has no
 *   wide cells. Empty only when Kitty is disabled or backdrop is inactive.
 * - `modified` — deprecated alias for `bufferModified`, kept for callers
 *   that predate the visual/buffer split.
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

  // One mode for all supported color tiers: sRGB source-over scrim mix.
  // For ANSI-16 terminals the output phase quantizes the mixed truecolor hex
  // to the nearest palette slot — good enough, and strictly better than the
  // earlier "SGR 2 dim" fallback which only affected fg, leaving bg bright.
  // Monochrome is handled by the `colorLevel === "none"` early return above.

  // Derive the scrim from rootBg luminance. Pure black for dark themes, pure
  // white for light — the canonical Apple / Material / Flutter convention.
  const scrim = deriveScrimColor(options?.rootBg)
  const rootBgHex = options?.rootBg ?? null

  // Kitty graphics realize the scrim for wide-char cells (emoji, CJK): the
  // overlay composites at alpha=amount above the unmixed cell, matching the
  // luminance of surrounding text cells (mixed via the cell pass). Require a
  // resolved scrim — mixing wide cells against an unknown scrim would
  // produce inconsistent visuals.
  const kittyEnabled = options?.kittyGraphics === true && scrim !== null

  // Single-amount invariant: the Kitty overlay emits one scrim image at one
  // alpha. Multiple fade regions with different amounts would require either
  // per-cell alpha maps or grouping — neither is cheap. Assert one global
  // amount for now; revisit if nested-modal use cases appear.
  const uniqueAmount = assertSingleAmount(includes, excludes)

  let bufferModified = false

  // Pass 1: data-backdrop-fade — fade cells INSIDE each marked rect.
  for (const { rect, amount } of includes) {
    if (amount <= 0) continue
    if (fadeRect(buffer, rect, amount, scrim, rootBgHex, kittyEnabled)) bufferModified = true
  }

  // Pass 2: data-backdrop-fade-excluded — fade everything OUTSIDE each marked
  // rect (the modal "cuts a hole").
  if (excludes.length > 0) {
    const fullRect: Rect = { x: 0, y: 0, width: buffer.width, height: buffer.height }
    for (const { rect, amount } of excludes) {
      if (amount <= 0) continue
      if (fadeRectExcluding(buffer, fullRect, rect, amount, scrim, rootBgHex, kittyEnabled))
        bufferModified = true
    }
  }

  // Kitty overlay. Always emitted when kittyEnabled is true (even if no wide
  // cells this frame) so last-frame placements get cleared by the delete-all
  // at the head of the overlay string. Without this, stale scrims from a
  // prior backdrop region can persist visually when the current frame has
  // no emoji to overlay.
  const kittyOverlay = kittyEnabled
    ? buildKittyOverlay(buffer, includes, excludes, scrim, rootBgHex, uniqueAmount)
    : ""

  const visuallyModified = bufferModified || kittyOverlay !== ""

  return {
    modified: bufferModified,
    bufferModified,
    visuallyModified,
    kittyOverlay,
  }
}

/**
 * Assert that all fade markers share a single amount, returning that amount.
 * Mixed amounts currently break the Kitty overlay (one image, one alpha) and
 * have unclear composition semantics (max? source-over compound?). Dev-mode
 * warn and fall back to the first observed amount; production behavior is
 * first-wins but will look wrong.
 */
function assertSingleAmount(includes: FadeRect[], excludes: FadeRect[]): number {
  const all = [...includes, ...excludes]
  const first = all[0]?.amount ?? 0
  if (process.env.NODE_ENV !== "production") {
    for (const r of all) {
      if (Math.abs(r.amount - first) > 1e-6) {
        // eslint-disable-next-line no-console
        console.warn(
          `[silvery:backdrop-fade] multiple fade amounts in one frame (${first} vs ${r.amount}); ` +
            `Kitty overlay will use the first. See buildKittyOverlay / assertSingleAmount.`,
        )
        break
      }
    }
  }
  return Math.max(0, Math.min(1, first))
}

const EMPTY_RESULT: BackdropFadeResult = {
  modified: false,
  bufferModified: false,
  visuallyModified: false,
  kittyOverlay: "",
}

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
  scrim: string | null,
  rootBgHex: string | null,
  kittyEnabled: boolean,
): boolean {
  const x0 = Math.max(0, rect.x)
  const y0 = Math.max(0, rect.y)
  const x1 = Math.min(buffer.width, rect.x + rect.width)
  const y1 = Math.min(buffer.height, rect.y + rect.height)
  if (x0 >= x1 || y0 >= y1) return false

  let any = false
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      if (fadeCell(buffer, x, y, amount, scrim, rootBgHex, kittyEnabled)) any = true
    }
  }
  return any
}

function fadeRectExcluding(
  buffer: TerminalBuffer,
  outer: Rect,
  inner: Rect,
  amount: number,
  scrim: string | null,
  rootBgHex: string | null,
  kittyEnabled: boolean,
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
      if (fadeCell(buffer, x, y, amount, scrim, rootBgHex, kittyEnabled)) any = true
    }
  }
  return any
}

/**
 * Fade a single cell. Returns true if the cell was modified.
 *
 * sRGB source-over alpha mix:
 *   fg' = fg * (1 - amount) + scrim * amount
 *   bg' = bg * (1 - amount) + scrim * amount
 *
 * `null`/`DEFAULT_BG` cells are resolved to the theme's `rootBg` first (that
 * IS the color the terminal paints), then mixed — so empty cells darken at
 * the same rate as explicitly-colored cells.
 *
 * Uniform amounts for fg + bg preserve relative brightness ordering across
 * borders vs fills. Heaviness is controlled by `amount` (default 0.25,
 * calibrated against macOS 0.20, Material 3 0.32, iOS 0.40, Flutter 0.54).
 *
 * When `scrim` is null (no theme context, e.g. bare `<Backdrop>` without
 * `<ThemeProvider>`): falls back to mixing fg toward cell.bg so the cell
 * still reads as "receded" without needing external theme info.
 *
 * ### Wide-char / emoji handling
 *
 * Terminals render emoji using the glyph's own bitmap colors — the fg mix
 * has no visible effect on the emoji. Two paths, mutually exclusive:
 *
 * 1. Kitty graphics available: `fadeCell` SKIPS wide cells entirely. The
 *    Kitty overlay composites the scrim at alpha=amount on top, landing at
 *    `cell * (1 - amount) + scrim * amount` — same as surrounding cells.
 * 2. Kitty unavailable: mix the cell bg + stamp `attrs.dim` on lead +
 *    continuation. Terminals honoring SGR 2 on emoji fade the glyph.
 */
function fadeCell(
  buffer: TerminalBuffer,
  x: number,
  y: number,
  amount: number,
  scrim: string | null,
  rootBgHex: string | null,
  kittyEnabled: boolean,
): boolean {
  // Skip continuation half of wide chars — the leading cell at x-1 will update
  // this cell's bg + dim in lockstep when it's processed.
  if (buffer.isCellContinuation(x, y)) return false

  const cell = buffer.getCell(x, y)

  // When Kitty graphics are available, the emoji scrim overlay will composite
  // over the wide cell at alpha=amount — doing the per-cell mix here too
  // would double-dim the bg and produce a visibly blacker emoji region than
  // surrounding text cells. Skip wide cells entirely; Kitty does the fade.
  // (When Kitty is NOT available, the `mix` branch below still runs on wide
  // cells and stamps SGR 2 dim as a degraded fallback — visible fade on
  // terminals honoring SGR 2 on emoji, bg slightly inconsistent otherwise.)
  if (kittyEnabled && cell.wide) return false

  const rawFgHex = colorToHex(cell.fg)

  if (scrim !== null && rootBgHex !== null) {
    // Resolve null/default fg to its implicit terminal color BEFORE fading.
    // On dark themes, default fg renders as white-ish; on light themes, as
    // black-ish. Leaving it unresolved would skip the fg fade entirely —
    // bg darkens but fg stays at full terminal brightness, producing a
    // visible "text is MORE saturated / pops HARDER against faded bg"
    // effect that users notice as "colors look more saturated when
    // darkened". Substituting `scrim`'s opposite (white for dark scrim,
    // black for light scrim) as the implicit default lets deemphasize
    // produce a proportionally-faded fg that matches the backdrop's
    // receded feel.
    const fgHex = rawFgHex ?? (scrim === DARK_SCRIM ? LIGHT_SCRIM : DARK_SCRIM)
    const fgWasDefault = rawFgHex === null

    // sRGB source-over mix: uniform bg toward scrim at `amount`.
    const bgHex = colorToHex(cell.bg) ?? rootBgHex
    const mixedBgHex = mixSrgb(bgHex, scrim, amount)
    const mixedBg = hexToRgb(mixedBgHex)

    // Wide-char fg is INVISIBLE for emoji — stamp dim on lead + continuation
    // as best-effort for terminals honoring SGR 2 on bitmap glyphs.
    const stampEmojiDim = cell.wide
    const newAttrs = stampEmojiDim && !cell.attrs.dim ? { ...cell.attrs, dim: true } : cell.attrs

    // Fg uses OKLCH deemphasize (L *= 1-α, C *= 1-α, H preserved) instead of
    // sRGB source-over. sRGB channel-linear scaling preserves HSL ratios but
    // NOT C/L (perceived saturation) — colored text tends to look slightly
    // MORE saturated per unit luminance after darkening, which users notice
    // on flat-color TUIs (where the effect isn't masked by photos / blur /
    // gradients). OKLCH proportional L+C scaling preserves C/L exactly, so
    // darkened text reads as "the same color, less visually present" rather
    // than "darker but somehow poppier".
    //
    // Bg stays sRGB because the Kitty overlay composites in sRGB at the same
    // alpha — using sRGB for bg keeps text-cell bg matching emoji-cell bg
    // when both appear in the same faded region.
    const deemphasizedFgHex = deemphasizeOklch(fgHex, amount)
    const mixedFg = hexToRgb(deemphasizedFgHex)

    if (mixedFg) {
      // When `fg` was originally default (null), we write an explicit faded
      // hex — the cell stops deferring to the terminal default under the
      // backdrop. When the backdrop lifts, the cell is repainted from the
      // fresh render (no state leak). `fgWasDefault` is tracked for future
      // diagnostics / STRICT assertions but isn't behaviorally used today.
      void fgWasDefault
      if (mixedBg) {
        buffer.setCell(x, y, { ...cell, fg: mixedFg, bg: mixedBg, attrs: newAttrs })
        propagateBgToContinuation(buffer, cell, x, y, mixedBg, stampEmojiDim)
        return true
      }
      buffer.setCell(x, y, { ...cell, fg: mixedFg, attrs: newAttrs })
      if (stampEmojiDim) propagateDimToContinuation(buffer, cell, x, y)
      return true
    }

    // Fg deemphasize failed (very rare — hex parse edge). Fall back to
    // bg-only mix + dim stamp.
    if (mixedBg) {
      buffer.setCell(x, y, { ...cell, bg: mixedBg, attrs: newAttrs })
      propagateBgToContinuation(buffer, cell, x, y, mixedBg, stampEmojiDim)
      return true
    }
    if (cell.attrs.dim) return false
    buffer.setCell(x, y, { ...cell, attrs: { ...cell.attrs, dim: true } })
    return true
  }

  const fgHex = rawFgHex

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

/**
 * sRGB source-over alpha mix. Inlined locally to avoid a publish-cycle
 * dependency on `@silvery/color`'s `mixSrgb` export — silvery's build
 * references `@silvery/color` as an external at install time, so adding a
 * new export in the same release cycle breaks CI verify (the published
 * `@silvery/color` dist doesn't ship the new name until its next publish).
 * `@silvery/color` does re-export `mixSrgb` from its source for third-party
 * consumers; this inline copy exists only to keep silvery self-contained.
 */
/**
 * OKLCH-native deemphasize: linear L reduction, QUADRATIC C reduction,
 * hue preserved.
 *
 *   L' = L × (1 - amount)
 *   C' = C × (1 - amount)²
 *   H' = H
 *
 * The asymmetric chroma falloff corrects for a perceptual nonlinearity:
 * the human visual system reads chroma RELATIVE to luminance, so a modest
 * OKLCH C at low L *appears* distinctly more chromatic than the same C at
 * high L. Proportional L+C scaling (`C *= 1-α`, preserving C/L) therefore
 * feels "darker but more saturated" to viewers — the exact complaint that
 * prompted this revision.
 *
 * Using `(1-α)²` for chroma reduces saturation faster than lightness:
 *
 *   α=0.25 → L *= 0.75, C *= 0.563  (C/L drops to 75% of original)
 *   α=0.40 → L *= 0.60, C *= 0.360  (C/L drops to 60%)
 *   α=0.50 → L *= 0.50, C *= 0.250  (C/L drops to 50%)
 *   α=1.00 → both 0 (fully faded to pure black).
 *
 * At the default ModalDialog amount (0.25), pale-lavender `#cdd6f4`
 * deemphasizes to L=0.66, C=0.024 — visibly muted, not "even more
 * saturated than before".
 *
 * `@silvery/color` exports `deemphasize` for third-party consumers; this
 * inline copy exists only to keep silvery self-contained across publish
 * cycles (see the `mixSrgb` inline comment for rationale).
 */
function deemphasizeOklch(hex: string, amount: number): string {
  const o = hexToOklch(hex)
  if (!o) return hex
  const a = Math.max(0, Math.min(1, amount))
  const chromaFactor = (1 - a) * (1 - a)
  return oklchToHex({
    L: Math.max(0, o.L * (1 - a)),
    C: Math.max(0, o.C * chromaFactor),
    H: o.H,
  })
}

function mixSrgb(a: string, b: string, t: number): string {
  const ra = hexToRgb(a)
  const rb = hexToRgb(b)
  if (!ra || !rb) return a
  const u = Math.max(0, Math.min(1, t))
  const r = ra.r * (1 - u) + rb.r * u
  const g = ra.g * (1 - u) + rb.g * u
  const bl = ra.b * (1 - u) + rb.b * u
  return rgbToHex(r, g, bl)
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
 * Build the Kitty graphics escape sequence that covers wide-char cells in the
 * backdrop region with a translucent scrim.
 *
 * The scrim alpha matches the fade `amount` (scaled 0-255) so the composited
 * emoji bg lands at the same luminance as surrounding text cells: both
 * produce `cell_bg * (1 - amount) + scrim * amount`.
 *
 * Always emits at least `CURSOR_SAVE + kittyDeleteAllScrimPlacements() +
 * CURSOR_RESTORE` when called — even with zero wide cells in the region —
 * so stale placements from a previous frame get cleared. Without the
 * unconditional clear, an emoji visible under a modal in frame N could
 * persist as an orphan scrim into frame N+1 after the modal closes.
 */
function buildKittyOverlay(
  buffer: TerminalBuffer,
  includes: FadeRect[],
  excludes: FadeRect[],
  scrim: string | null,
  rootBgHex: string | null,
  amount: number,
): string {
  const cells = collectWideCellsInFadeRegion(buffer, includes, excludes)

  // Tint the scrim with the same color used for cell mixing (pure black /
  // white by theme luminance). Fallback to pure black.
  const tintHex = scrim ?? rootBgHex ?? "#000000"
  const tint = hexToRgb(tintHex) ?? { r: 0, g: 0, b: 0 }
  const scrimAlpha = Math.max(0, Math.min(255, Math.round(amount * 255)))

  const parts: string[] = []
  parts.push(CURSOR_SAVE)

  if (cells.length === 0) {
    // No wide cells to cover this frame, but we must still clear any
    // placements left over from a prior frame where there were some.
    parts.push(kittyDeleteAllScrimPlacements())
    parts.push(CURSOR_RESTORE)
    return parts.join("")
  }

  const pixels = buildScrimPixels(tint, scrimAlpha)
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
