/**
 * Backdrop fade — stage 2a: apply the plan's cell-level transform to the
 * terminal buffer.
 *
 * Uses the shared `forEachBackdropCell` walker (`./region.ts`) to visit
 * every cell covered by the plan's include + exclude rects exactly once.
 * Trusts the plan: no marker re-collection, no scrim/default resolution,
 * no amount validation, no capability re-derivation (`plan.kittyEnabled`
 * is the sole source of truth for the emoji branch).
 *
 * Wide ≠ emoji. CJK / Hangul / Japanese fullwidth text occupies two columns
 * but responds to `fg` color normally — it goes through the standard mix
 * path. Only EMOJI (bitmap glyphs that ignore `fg`) need special handling,
 * detected via `isLikelyEmoji(cell.char)`.
 *
 * For emoji cells, two paths, mutually exclusive:
 *
 * 1. **Kitty graphics available** (`plan.kittyEnabled === true`): emoji cells
 *    are SKIPPED entirely here. `./realize-kitty.ts` emits a translucent
 *    scrim image at alpha=amount above each emoji cell, and the terminal
 *    composites the overlay on top of the unmixed cell, landing at
 *    `cell_bg * (1 - amount) + scrim * amount` — the same luminance as
 *    surrounding text cells. This avoids the double-fade that would make
 *    emoji bg visibly blacker.
 *
 * 2. **Kitty graphics unavailable** (`plan.kittyEnabled === false`): the
 *    per-cell mix runs on emoji cells too and stamps `attrs.dim` (SGR 2)
 *    on lead + continuation. Terminals honoring SGR 2 on emoji fade the
 *    glyph; others see the glyph at full brightness but the cell bg
 *    matches surroundings.
 *
 * @see ./plan.ts for the color model and scrim derivation.
 * @see ./color.ts for the hex↔rgb adapter helpers.
 * @see @silvery/color for `mixSrgb`.
 * @see ./color-shim.ts for `deemphasizeOklchToward` (polarity-aware,
 *   not yet upstream).
 * @see ./region.ts for the shared include/exclude region walker.
 */

import { mixSrgb, relativeLuminance } from "@silvery/color"
import type { Rect } from "@silvery/ag/types"
import type { TerminalBuffer } from "../../buffer"
import { isLikelyEmoji } from "../../unicode"
import { colorToHex, type HexColor, hexToRgb } from "./color"
import { deemphasizeOklchToward } from "./color-shim"
import { DARK_SCRIM, LIGHT_SCRIM, type Plan } from "./plan"
import { forEachBackdropCell } from "./region"

/**
 * Surface-polarity midpoint for the legacy (scrim===null) per-cell darkening
 * target. A cell whose own bg luminance is at/above this lightens toward
 * `LIGHT_SCRIM`; below it darkens toward `DARK_SCRIM`.
 *
 * This is INTENTIONALLY 0.5 (the perceptual light/dark surface midpoint),
 * NOT `DARK_LUMINANCE_THRESHOLD` (0.18). That constant detects a dark THEME
 * bg, which sits near 0 — it's the right boundary when classifying a whole
 * theme. Here we classify an arbitrary individual cell bg, and 0.18 would
 * send saturated mid-luminance surfaces (pure red ≈0.21, magenta ≈0.29,
 * mid-grey ≈0.22) toward WHITE — visually wrong for "recede under a
 * backdrop." 0.5 keeps every dark theme AND every saturated/mid surface
 * darkening toward black, and only genuinely-light surfaces (light-theme
 * panels, near-white) lighten toward white — matching how the theme-driven
 * scrim path behaves on light vs dark themes.
 */
const LEGACY_SURFACE_LIGHT_MIDPOINT = 0.5

/**
 * Polarity-aware darkening target for a single resolved bg hex in the legacy
 * (scrim===null) path. Used ONLY as the no-usable-sample FALLBACK now — the
 * primary path derives ONE scene-level target via `sampleRegionScrimTarget`
 * (see below). The legacy path has NO theme context, so global polarity can't
 * be derived from a `defaultBg`; this per-cell heuristic reads the cell's own
 * luminance: below the surface midpoint it recedes toward `DARK_SCRIM`
 * (black), at/above it toward `LIGHT_SCRIM` (white). Falls back to `DARK_SCRIM`
 * when luminance is unresolvable (rare hex edge) — the historical dark-theme
 * default.
 *
 * Why this is no longer the primary path: per-cell polarity sends a LIGHT
 * element (e.g. a `#d8dee9` scrollbar block, luminance ≈ 0.87) toward WHITE,
 * so on a predominantly-DARK scene that cell gets BRIGHTER under the modal
 * instead of receding. A light element on a dark scene should recede toward
 * the dark scene, not pop toward white. Scene-level polarity fixes that — see
 * `sampleRegionScrimTarget`. (@km 19684, follow-up to 19665.)
 */
function legacyScrimTargetFor(bgHex: HexColor): HexColor {
  const lum = relativeLuminance(bgHex)
  if (lum === null) return DARK_SCRIM
  return lum >= LEGACY_SURFACE_LIGHT_MIDPOINT ? LIGHT_SCRIM : DARK_SCRIM
}

/**
 * Derive ONE scene-level polarity target for the legacy (scrim===null) path by
 * sampling the faded region's resolvable cell backgrounds.
 *
 * ### Why scene-level, not per-cell
 *
 * The legacy path runs when no theme bg flows into the backdrop options, so
 * there is no single `defaultBg` to derive a scrim from. The previous fix
 * (@km 19665) darkened each cell toward a PER-CELL polarity target. That
 * correctly darkened the dark status bar, but it also sent every LIGHT element
 * (a light scrollbar block, a light-on-dark badge) toward WHITE — making those
 * cells BRIGHTER under the modal instead of receding. On a dark scene a light
 * element must recede toward the DARK scene; on a light scene a dark element
 * must recede toward the LIGHT scene. Polarity is a property of the SCENE, not
 * of the individual cell — so we resolve it once for the whole region.
 *
 * ### Sampling approach: dominant-by-count of polarity buckets
 *
 * We walk every cell in the region (`forEachBackdropCell` — the same walker
 * the realize pass uses, so the sampled set is exactly the faded set) and
 * tally resolvable backgrounds into two buckets: `dark` (luminance below the
 * surface midpoint) and `light` (at/above it). The dominant bucket wins:
 *
 *   - light > dark  → `LIGHT_SCRIM` (predominantly-light scene)
 *   - otherwise     → `DARK_SCRIM`  (predominantly-dark scene; ties → dark)
 *
 * Counting buckets (rather than averaging luminance) is deliberately
 * outlier-resistant: it matches a median's robustness for a BINARY polarity
 * decision without storing/sorting a per-cell sample array each frame. A scene
 * that is 95% dark cells with a handful of bright accents stays "dark" no
 * matter how extreme those accents are — a mean could be dragged across the
 * midpoint by a few saturated cells. Ties resolve to `DARK_SCRIM`, the
 * historical dark-theme default (a tie on a TUI is overwhelmingly a dark scene
 * with light accents).
 *
 * ### Fallback
 *
 * Returns `null` when the region has NO resolvable bg cells (every cell is
 * null / DEFAULT_BG). With no sample there is nothing to count, so the caller
 * falls back to the per-cell `legacyScrimTargetFor` heuristic.
 *
 * Cheap: one extra walk of the region, two integer counters, no allocation
 * beyond the walker's own visited bitset.
 */
function sampleRegionScrimTarget(plan: Plan, buffer: TerminalBuffer): HexColor | null {
  let dark = 0
  let light = 0
  forEachBackdropCell(buffer.width, buffer.height, plan.includes, plan.excludes, (x, y) => {
    // Mirror fadeCell's continuation skip so a wide char's bg is counted once
    // (the lead cell), not twice.
    if (buffer.isCellContinuation(x, y)) return
    const bgHex = colorToHex(buffer.getCell(x, y).bg, plan.palette ?? undefined)
    if (bgHex === null) return
    const lum = relativeLuminance(bgHex)
    if (lum === null) return
    if (lum >= LEGACY_SURFACE_LIGHT_MIDPOINT) light += 1
    else dark += 1
  })
  if (dark === 0 && light === 0) return null
  return light > dark ? LIGHT_SCRIM : DARK_SCRIM
}

/**
 * Stage 2a — apply the plan's cell-level transform to the buffer.
 *
 * Walks every include + exclude cell once via `forEachBackdropCell` and
 * applies `fadeCell` with the plan's single `amount`. The buffer is mutated
 * in place.
 *
 * When `plan.kittyEnabled === true`, emoji cells (detected via
 * `isLikelyEmoji(cell.char)`) are SKIPPED — the Kitty overlay realizer
 * composites the scrim on top of the unmixed cell. When
 * `plan.kittyEnabled === false`, emoji cells go through the per-cell mix
 * AND get SGR 2 (`attrs.dim`) stamped on lead + continuation.
 *
 * Returns `true` when at least one buffer cell was mutated.
 */
export function realizeToBuffer(plan: Plan, buffer: TerminalBuffer): boolean {
  if (!plan.active) return false
  if (plan.amount <= 0) return false

  // Legacy (scrim===null) path: derive ONE scene-level polarity target from
  // the region's resolvable backgrounds BEFORE the per-cell fade, so light
  // elements recede toward a dark scene (and dark elements toward a light
  // scene) instead of each cell pulling toward its own polarity. `null` when
  // the region has no resolvable bg sample — fadeCell then falls back to the
  // per-cell heuristic. Computed once per frame; the two-channel scrim path
  // ignores it (it already recedes toward the resolved scrim).
  const regionTarget = plan.scrim === null ? sampleRegionScrimTarget(plan, buffer) : null

  let modified = false
  forEachBackdropCell(buffer.width, buffer.height, plan.includes, plan.excludes, (x, y) => {
    if (fadeCell(buffer, x, y, plan, regionTarget)) modified = true
  })
  return modified
}

/**
 * Stage 2a (subtree-fade variant) — fade cells INSIDE the plan's include rects
 * but OUTSIDE the supplied `excludes`, deduping overlapping/nested includes so
 * each cell is faded at most once.
 *
 * This differs from `realizeToBuffer` in its exclude semantics. The backdrop
 * pass's `forEachBackdropCell` treats `excludes` as the modal "cut a hole"
 * pattern — fade everything OUTSIDE the exclude union. Tree-scoped subtree fade
 * (the unfocused-pane dim, `data-subtree-fade`) needs the OPPOSITE: fade the
 * marked pane's rect MINUS the regions a FOREIGN overlay (a node outside the
 * faded subtree — a root-level dialog/popover) painted on top, so a dialog
 * crossing an unfocused pane keeps its own bg/fg. So `excludes` here are
 * SUBTRACTED from the include region (fade ⇔ inside-any-include ∧ inside-no-
 * exclude), not unioned as holes.
 *
 * Like `realizeToBuffer`, this trusts the plan (built by `buildRectPlan`) for
 * the color model and reuses the same `fadeCell` transform — so a subtree-fade
 * cell and a backdrop cell at the same amount land at identical colors.
 *
 * Returns `true` when at least one buffer cell was mutated.
 */
export function realizeSubtreeFadeToBuffer(
  plan: Plan,
  buffer: TerminalBuffer,
  excludes: readonly Rect[],
): boolean {
  if (!plan.active) return false
  if (plan.amount <= 0) return false

  const W = buffer.width
  const H = buffer.height
  if (W <= 0 || H <= 0) return false

  const regionTarget = plan.scrim === null ? sampleRegionScrimTarget(plan, buffer) : null

  // Rasterize the foreign-overlay exclude rects into a "blocked" bitset so the
  // cells they painted stay crisp. Allocated lazily — most frames have no
  // overlay crossing a faded pane.
  let blocked: Uint8Array | null = null
  for (const r of excludes) {
    const x0 = Math.max(0, r.x)
    const y0 = Math.max(0, r.y)
    const x1 = Math.min(W, r.x + r.width)
    const y1 = Math.min(H, r.y + r.height)
    if (x0 >= x1 || y0 >= y1) continue
    if (blocked === null) blocked = new Uint8Array(W * H)
    for (let y = y0; y < y1; y++) {
      const row = y * W
      for (let x = x0; x < x1; x++) blocked[row + x] = 1
    }
  }

  // `seen` dedups overlapping/nested include rects (two tiled dimmed panes, or a
  // marker nested under another) so a cell is never faded twice in one frame.
  const seen = new Uint8Array(W * H)
  let modified = false
  for (const { rect } of plan.includes) {
    const x0 = Math.max(0, rect.x)
    const y0 = Math.max(0, rect.y)
    const x1 = Math.min(W, rect.x + rect.width)
    const y1 = Math.min(H, rect.y + rect.height)
    if (x0 >= x1 || y0 >= y1) continue
    for (let y = y0; y < y1; y++) {
      const row = y * W
      for (let x = x0; x < x1; x++) {
        const i = row + x
        if (seen[i] !== 0) continue
        seen[i] = 1
        if (blocked !== null && blocked[i] !== 0) continue
        if (fadeCell(buffer, x, y, plan, regionTarget)) modified = true
      }
    }
  }
  return modified
}

/**
 * Fade a single cell. Returns true if the cell was modified.
 *
 * Two-channel transform (see `./plan.ts` for the full color model):
 *
 *   fg' = deemphasizeOklchToward(fg, amount, scrimTowardLight)
 *   bg' = mixSrgb(bg, scrim, amount)
 *
 * Fg uses OKLCH deemphasize (not sRGB mixing) so colored text deemphasizes
 * perceptually — pale lavender becomes dull slate on dark themes, pale
 * grey on light themes. The polarity flag `scrimTowardLight` (from the
 * plan) steers L toward 0 or 1; chroma falloff is symmetric. Bg uses sRGB
 * source-over because the Kitty graphics scrim overlay composites in sRGB
 * at alpha at the hardware level.
 *
 * `null`/`DEFAULT_BG` cells are resolved to `plan.defaultBg` first (that
 * IS the color the terminal paints), then mixed toward the scrim — so
 * empty cells darken at the same rate as explicitly-colored cells.
 *
 * Uniform amounts for fg + bg preserve relative brightness ordering across
 * borders vs fills. Heaviness is controlled by `plan.amount` (default
 * 0.25, calibrated against macOS 0.20, Material 3 0.32, iOS 0.40, Flutter
 * 0.54).
 *
 * The `scrim !== null` gate activates the full two-channel path: fg always
 * deemphasizes (OKLCH), and bg mixes toward the scrim when a resolvable bg
 * hex is available (`cell.bg` non-null OR `defaultBg` non-null).
 *
 * When `scrim === null` (no theme context resolved a default bg) the LEGACY
 * path runs. It is ALSO two-channel, but derives a SCENE-LEVEL polarity target
 * (`regionTarget`, sampled once over the whole region in `realizeToBuffer`)
 * instead of a single theme scrim:
 *
 *   fg' = mixSrgb(fg, cell.bg, amount)         // fg recedes toward its own bg
 *   bg' = mixSrgb(bg, regionTarget, amount)    // regionTarget = DARK_SCRIM for
 *                                              // a predominantly-dark scene,
 *                                              // LIGHT_SCRIM for a
 *                                              // predominantly-light one
 *
 * Using ONE scene-level target (not the cell's own luminance) is the @km 19684
 * fix: a per-cell target made light elements (a light scrollbar block) recede
 * toward WHITE even on a dark scene — brightening them under the modal instead
 * of dimming. When the region had no resolvable bg sample
 * (`regionTarget === null`), this cell falls back to the per-cell
 * `legacyScrimTargetFor` heuristic.
 *
 * Recede-ing the bg here is what makes opaque background blocks (a status bar
 * with an explicit hex bg, a colored panel) recede under the backdrop even
 * with NO node-theme prop mounted — otherwise they stay full-brightness and
 * "pop" outside the modal overlay. Cells whose bg is unresolvable (null /
 * DEFAULT_BG) have nothing to mix toward, so they fall back to a dim stamp.
 *
 * ### Wide-char / emoji handling
 *
 * Terminals render emoji using the glyph's own bitmap colors — the fg mix
 * has no visible effect on the emoji glyph. Two paths, mutually exclusive:
 *
 * 1. Kitty graphics available: `fadeCell` SKIPS emoji wide cells entirely.
 *    The Kitty overlay composites the scrim at alpha=amount on top, landing
 *    at `cell * (1 - amount) + scrim * amount` — same as surrounding cells.
 * 2. Kitty unavailable: mix the cell bg + stamp `attrs.dim` on lead +
 *    continuation. Terminals honoring SGR 2 on emoji fade the glyph. Wide
 *    TEXT (CJK etc.) goes through the normal deemphasize path on both
 *    branches — the fg mix works fine and SGR 2 on CJK over-fades.
 */
function fadeCell(
  buffer: TerminalBuffer,
  x: number,
  y: number,
  plan: Plan,
  regionTarget: HexColor | null,
): boolean {
  // Skip continuation half of wide chars — the leading cell at x-1 updates
  // this cell in lockstep when it's processed.
  if (buffer.isCellContinuation(x, y)) return false

  const cell = buffer.getCell(x, y)

  // Glyph classification: only EMOJI cells (bitmap glyphs that ignore fg
  // color) go through the Kitty overlay path. CJK and other wide TEXT cells
  // respond to fg color like narrow text and go through the buffer mix
  // path, which is correct for them. `cell.wide` alone is the wrong
  // discriminator — wide != emoji — pro review flagged this as a bug class.
  const isEmojiGlyph = cell.wide && isLikelyEmoji(cell.char ?? "")

  // When Kitty is available and this cell is an emoji, skip the buffer mix
  // — the Kitty overlay will composite the scrim at alpha=amount above the
  // unmixed cell, landing at `cell_bg * (1 - amount) + scrim * amount`,
  // same luminance as surrounding mixed cells. Mixing here too would
  // double-fade and produce a visibly blacker emoji bg.
  if (plan.kittyEnabled && isEmojiGlyph) return false

  const { amount, scrim, defaultBg, defaultFg, scrimTowardLight } = plan
  // Resolve palette-indexed cells (ANSI 0–15) against the active theme palette
  // when present, so parsed-terminal cyan fades toward the theme's cyan rather
  // than VGA teal `#008080` (@km 19764). `undefined` palette → VGA fallback.
  const palette = plan.palette ?? undefined
  const rawFgHex = colorToHex(cell.fg, palette)

  if (scrim !== null) {
    // Two-channel path — scrim is available. An explicit scrim is useful
    // even without a `defaultBg`: fg always deemphasizes toward neutrality,
    // and cells with explicit (non-null) `cell.bg` still mix toward the
    // scrim. Only cells whose bg is unresolvable (null) AND have no
    // `defaultBg` to fall back on skip the bg mix.
    //
    // Resolve null/default fg BEFORE deemphasize. Without this, default-fg
    // text (common in TUIs that don't set Text color explicitly) skips the
    // fade entirely — bg darkens but fg stays at full terminal brightness,
    // producing a visible "text POPS against faded bg" effect that users
    // perceive as "colors look more saturated when darkened".
    const fgHex: HexColor = rawFgHex ?? defaultFg ?? (scrimTowardLight ? DARK_SCRIM : LIGHT_SCRIM)

    // sRGB source-over mix: uniform bg toward scrim at `amount`. sRGB
    // matches the Kitty graphics overlay compositing so text-cell bg and
    // emoji-cell bg land at the same luminance in shared faded regions.
    // `colorToHex(cell.bg) ?? defaultBg` — when cell.bg is null/default
    // and no defaultBg is available, bgHex stays null and we skip the bg
    // mix while still deemphasizing fg.
    const bgHex: HexColor | null = colorToHex(cell.bg, palette) ?? defaultBg
    const mixedBgHex = bgHex !== null ? mixSrgb(bgHex, scrim, amount) : null
    const mixedBg = mixedBgHex !== null ? hexToRgb(mixedBgHex) : null

    // Stamp SGR 2 dim on emoji cells when Kitty is NOT available — it's the
    // only portable way to signal "faded" on a glyph the fg mix can't
    // affect. For wide TEXT (CJK etc.), do NOT stamp dim: the fg mix works
    // fine, and SGR 2 on CJK over-fades the glyph.
    const stampEmojiDim = isEmojiGlyph
    const newAttrs = stampEmojiDim && !cell.attrs.dim ? { ...cell.attrs, dim: true } : cell.attrs

    // Fg uses OKLCH deemphasize — L toward 0 (dark) or 1 (light) per
    // `scrimTowardLight`, C *= (1-α)², H preserved. See
    // `deemphasizeOklchToward` docblock for the perceptual rationale. Bg
    // stays sRGB to match Kitty overlay compositing.
    const deemphasizedFgHex = deemphasizeOklchToward(fgHex, amount, scrimTowardLight)
    const mixedFg = hexToRgb(deemphasizedFgHex)

    if (mixedFg) {
      if (mixedBg) {
        buffer.setCell(x, y, {
          ...cell,
          preserveHyperlink: true,
          fg: mixedFg,
          bg: mixedBg,
          attrs: newAttrs,
        })
        propagateToContinuation(buffer, cell, x, y, { bg: mixedBg, dim: stampEmojiDim })
        return true
      }
      buffer.setCell(x, y, { ...cell, preserveHyperlink: true, fg: mixedFg, attrs: newAttrs })
      if (stampEmojiDim) propagateToContinuation(buffer, cell, x, y, { dim: true })
      return true
    }

    // Fg deemphasize failed (rare — hex parse edge). Fall back to bg-only
    // mix + dim stamp.
    if (mixedBg) {
      buffer.setCell(x, y, { ...cell, preserveHyperlink: true, bg: mixedBg, attrs: newAttrs })
      propagateToContinuation(buffer, cell, x, y, { bg: mixedBg, dim: stampEmojiDim })
      return true
    }
    if (cell.attrs.dim) return false
    buffer.setCell(x, y, { ...cell, preserveHyperlink: true, attrs: { ...cell.attrs, dim: true } })
    return true
  }

  const fgHex = rawFgHex

  // Legacy path (no scrim — no theme context resolved a default bg). Two
  // channels, same as the scrim path but with a SCENE-LEVEL polarity target:
  //
  //   fg' = mixSrgb(fg, cell.bg, amount)     // fg recedes toward its own bg
  //   bg' = mixSrgb(bg, sceneTarget, amount) // bg recedes toward the scene
  //                                          // polarity (dark scene → black,
  //                                          // light scene → white)
  //
  // `sceneTarget` is the SINGLE region target sampled in `realizeToBuffer`
  // (`sampleRegionScrimTarget`), shared by every cell in the region. This is
  // the @km 19684 fix: a per-cell target (the @km 19665 behavior) sent a LIGHT
  // element toward WHITE even on a dark scene, brightening it under the modal
  // instead of receding. Scene polarity keeps a light scrollbar on a dark
  // scene darkening WITH the scene. When the region had no resolvable sample
  // (`regionTarget === null`), fall back to the per-cell `legacyScrimTargetFor`
  // heuristic for this cell.
  //
  // The bg recede is the load-bearing fix from 19665: opaque background blocks
  // (e.g. an app's status bar painted with an explicit hex bg) must recede
  // under the modal backdrop even when no node-theme prop is mounted, so they
  // don't "pop" bright outside the overlay. Cells whose bg is unresolvable
  // (null / DEFAULT_BG) can't be mixed without a target, so they keep the
  // dim-stamp fallback below.
  const bgHex = colorToHex(cell.bg, palette)
  const cellTarget = regionTarget ?? (bgHex !== null ? legacyScrimTargetFor(bgHex) : DARK_SCRIM)
  const darkenedBgRgb = bgHex !== null ? hexToRgb(mixSrgb(bgHex, cellTarget, amount)) : null

  if (bgHex !== null && darkenedBgRgb) {
    // fg recedes toward the ORIGINAL bg (preserves the historical legacy fg
    // result); the bg darkens separately toward the polarity target.
    const mixedFgRgb = fgHex ? hexToRgb(mixSrgb(fgHex, bgHex, amount)) : null

    // Emoji glyphs ignore fg color — the fg mix has no visible effect on the
    // glyph. Stamp attrs.dim on lead + continuation so terminals honoring SGR
    // 2 on emoji still fade the glyph. CJK and other wide TEXT keep the fg mix
    // only; SGR 2 on CJK over-fades.
    const stampEmojiDim = isEmojiGlyph
    const newAttrs = stampEmojiDim && !cell.attrs.dim ? { ...cell.attrs, dim: true } : cell.attrs

    if (mixedFgRgb) {
      buffer.setCell(x, y, {
        ...cell,
        preserveHyperlink: true,
        fg: mixedFgRgb,
        bg: darkenedBgRgb,
        attrs: newAttrs,
      })
    } else {
      buffer.setCell(x, y, { ...cell, preserveHyperlink: true, bg: darkenedBgRgb, attrs: newAttrs })
    }
    propagateToContinuation(buffer, cell, x, y, { bg: darkenedBgRgb, dim: stampEmojiDim })
    return true
  }

  // Fallback — bg unresolvable (DEFAULT_BG / null). With no resolvable bg and
  // no theme default there is nothing to darken toward, so stamp dim to keep
  // the cell reading as "backdrop".
  if (cell.attrs.dim) return false
  buffer.setCell(x, y, { ...cell, preserveHyperlink: true, attrs: { ...cell.attrs, dim: true } })
  if (cell.wide && x + 1 < buffer.width) {
    const cont = buffer.getCell(x + 1, y)
    if (!cont.attrs.dim) {
      buffer.setCell(x + 1, y, {
        ...cont,
        preserveHyperlink: true,
        attrs: { ...cont.attrs, dim: true },
      })
    }
  }
  return true
}

/**
 * Propagate lead-cell updates to the continuation cell of a wide char.
 *
 * When a wide char (emoji, CJK) has its bg or dim attribute changed on the
 * lead cell, the continuation cell at `x+1` must track in lockstep or the
 * two halves of the glyph render inconsistently (different bg → visually
 * split glyph; missing dim → half-faded emoji).
 *
 * `patch.bg` copies the mixed bg onto the continuation. `patch.dim` stamps
 * `attrs.dim`. Either or both may be provided; the function is a no-op
 * when neither is set.
 */
function propagateToContinuation(
  buffer: TerminalBuffer,
  leadCell: { wide: boolean },
  x: number,
  y: number,
  patch: { bg?: { r: number; g: number; b: number }; dim?: boolean },
): void {
  if (!leadCell.wide) return
  if (x + 1 >= buffer.width) return
  const cont = buffer.getCell(x + 1, y)
  if (!cont.continuation) return

  const stampDim = patch.dim === true && !cont.attrs.dim
  const writeBg = patch.bg !== undefined

  // Nothing to do: skip the setCell allocation.
  if (!stampDim && !writeBg) return

  const attrs = stampDim ? { ...cont.attrs, dim: true } : cont.attrs
  if (writeBg) {
    buffer.setCell(x + 1, y, { ...cont, preserveHyperlink: true, bg: patch.bg, attrs })
  } else {
    buffer.setCell(x + 1, y, { ...cont, preserveHyperlink: true, attrs })
  }
}
