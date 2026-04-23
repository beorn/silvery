/**
 * Backdrop fade — stage 1: build the immutable `Plan`.
 *
 * `buildPlan(root, options)` is a PURE pass that walks the tree, collects
 * `data-backdrop-fade` / `data-backdrop-fade-excluded` markers, enforces
 * the single-amount invariant, and resolves the scrim + default colors.
 * It returns a `TerminalPlan` (`CorePlan` + `kittyEnabled`); call
 * `buildCorePlan` for a framework-agnostic plan that strips terminal
 * capability flags. The realizers (`./realize-buffer.ts`,
 * `./realize-kitty.ts`) trust the plan: they do NOT re-walk the tree,
 * re-resolve the scrim, or re-validate amounts. This module is the
 * single source of truth.
 *
 * ## The model: per-channel alpha scrim with perceptually-aware fg
 *
 * The pass fades every covered cell by blending BOTH fg AND bg toward a
 * neutral scrim color at the caller's `amount`. Default scrim: pure black
 * for dark themes (Apple `colorWithWhite:0.0 alpha:0.4`), pure white for
 * light. Default amount: `DEFAULT_AMOUNT` (0.25) — calibrated against
 * macOS 0.20, Material 3 0.32, iOS 0.40, Flutter 0.54.
 *
 * ### Two operations, one per channel
 *
 *   fg' = deemphasizeOklchToward(fg, amount, towardLight)
 *                                             // OKLCH: L toward 0 or 1,
 *                                             //        C *= (1-α)²
 *   bg' = mixSrgb(bg, scrim, amount)          // sRGB source-over alpha
 *
 * Fg uses OKLCH deemphasize with explicit polarity so colored text
 * deemphasizes toward the correct theme neutral — toward black on dark
 * themes (same formula we've always used), toward white on light themes
 * (new — see `./color-shim.ts` for the math). The quadratic chroma
 * falloff compensates for the human-vision nonlinearity that reads chroma
 * relative to luminance. Bg uses sRGB source-over because the Kitty
 * graphics scrim overlay composites in sRGB at alpha at the hardware
 * level.
 *
 * ### Uniform amount per channel, heaviness tuned at call site
 *
 * Both fg and bg use the same `amount`. An earlier revision halved bg
 * amount to prevent "scene drowning" — that caused border/panel brightness
 * inversion (fg-dominated border darkens faster than bg-dominated fill).
 * Heaviness is controlled by `amount`, not by asymmetric math.
 *
 * ## Scrim color
 *
 * - Dark themes: pure black (`#000000`) — Apple's modal-sheet dimming color.
 * - Light themes: pure white (`#ffffff`) — the sign-flipped equivalent.
 *
 * Null-bg cells are resolved to `defaultBg` first, then `mixSrgb` toward
 * the scrim — empty cells darken at the same rate as explicitly-colored ones.
 *
 * Tiers (`colorLevel`): a single code path for all supported tiers. For
 * `"none"` (monochrome) the pass short-circuits to a no-op. For `basic`,
 * `256`, and `truecolor`, the per-cell operation is identical — the output
 * phase quantizes the mixed truecolor hex to the tier's palette on emit.
 *
 * ## Purity
 *
 * This module is pure: no console I/O, no buffer access, no mutable module
 * state. `buildPlan` returns a `Plan` whose `mixedAmounts` flag signals
 * multi-amount frames; the orchestrator (`./index.ts`) emits the dev-mode
 * warning so stage 1 remains a pure function of its inputs.
 */

import { relativeLuminance } from "@silvery/color"
import type { AgNode, Rect } from "@silvery/ag/types"
export type { ColorLevel } from "@silvery/ansi"
import type { ColorLevel } from "@silvery/ansi"
import { type HexColor, normalizeHex } from "./color"

export interface BackdropOptions {
  /**
   * Terminal color tier. `"mono"` short-circuits to a no-op (monochrome).
   * All other tiers run the same sRGB scrim mix — output phase quantizes
   * to the tier's palette on emit.
   */
  colorLevel?: ColorLevel
  /**
   * Explicit scrim color, or `"auto"` (default) to derive from theme
   * luminance: pure black for dark themes, pure white for light. Apps that
   * want a tinted scrim (e.g., a mid-gray for flat-color TUIs) override
   * here.
   */
  scrimColor?: HexColor | "auto" | string
  /**
   * Default background hex — resolves null/default `cell.bg` before mixing
   * toward the scrim AND feeds the auto-scrim luminance derivation when
   * `scrimColor` is `"auto"`. Accepts any string; `normalizeHex` validates
   * and normalizes inside `buildPlan`.
   */
  defaultBg?: string
  /**
   * Default foreground hex — resolves null/default `cell.fg` before the
   * deemphasize pass. Without this, text using the terminal's default fg
   * would stay at full brightness against a darkened backdrop (looks like
   * the text is POPPING instead of receding). If omitted, the pass picks
   * the opposite of the scrim (white for dark scrim, black for light).
   * Accepts any string; `normalizeHex` validates and normalizes inside
   * `buildPlan`.
   */
  defaultFg?: string
  /**
   * When true, emit Kitty graphics protocol overlays on emoji cells inside
   * the faded region. The terminal renders a translucent scrim image above
   * the emoji glyph, which SGR 2 "dim" alone can't fade on bitmap emoji.
   *
   * CJK wide-char cells are NOT emoji — they respond to fg color like text,
   * so they go through the normal deemphasize path regardless of Kitty
   * availability. Only emoji cells (detected via `isLikelyEmoji`) skip the
   * buffer mix when Kitty is active.
   */
  kittyGraphics?: boolean
}

/** Marker prop key for include rects (fade cells INSIDE the node's rect). */
export const BACKDROP_FADE_ATTR = "data-backdrop-fade"
/** Marker prop key for exclude rects (fade everything OUTSIDE the node's rect). */
export const BACKDROP_FADE_EXCLUDE_ATTR = "data-backdrop-fade-excluded"

/**
 * Luminance threshold for dark/light theme detection.
 *
 * 0.18 is well below the WCAG midpoint. Standard dark terminal themes
 * (Catppuccin Mocha bg #1e1e2e, luminance ≈ 0.012; Tokyo Night bg #1a1b26,
 * ≈ 0.010) are well below. Light themes (GitHub Light #ffffff = 1.0) above.
 */
export const DARK_LUMINANCE_THRESHOLD = 0.18

/** Canonical scrim colors — Apple's `colorWithWhite:0.0` / `:1.0`. */
export const DARK_SCRIM: HexColor = "#000000"
export const LIGHT_SCRIM: HexColor = "#ffffff"

/**
 * Default fade amount — the calibrated baseline used when a marker
 * materializes as a presence attribute (`<Backdrop fade />`,
 * `data-backdrop-fade=""`, `data-backdrop-fade={true}`) without an explicit
 * numeric value. Calibrated against macOS 0.20, Material 3 0.32, iOS 0.40,
 * Flutter 0.54. Re-exported from `index.ts` so downstream callers can
 * reference the same constant.
 */
export const DEFAULT_AMOUNT = 0.25

/**
 * A single fade region. The per-frame `amount` lives on `Plan`, not on
 * the individual rect — the single-amount invariant (one scrim image per
 * frame at one alpha) makes per-rect amounts meaningless for realization.
 * `buildPlan` inspects the per-marker amount ONLY to detect the mixed-
 * amounts condition, then discards it.
 */
export interface PlanRect {
  readonly rect: Rect
}

/**
 * Framework-agnostic description of a backdrop frame. Does NOT carry
 * terminal-specific capability flags (`kittyEnabled`, `colorLevel`). A
 * canvas/DOM target with its own overlay strategy can realize a `CorePlan`
 * without touching terminal fields.
 *
 * Realizers trust the plan: they do NOT re-walk the tree, re-resolve the
 * scrim, or re-validate amounts. `buildCorePlan` / `buildPlan` is the
 * single source of truth.
 *
 * ### Invariants enforced by `buildCorePlan`
 *
 * - `active = includes.length > 0 || excludes.length > 0` whenever a
 *   non-zero fade marker is present.
 * - `amount ∈ [0, 1]`, clamped, and identical across all collected rects
 *   (single-amount invariant — `mixedAmounts=true` surfaces the dev warn,
 *   prod falls back to first).
 * - `scrim` is either a normalized `#rrggbb` hex (with a known theme bg or
 *   an explicit `scrimColor`) or `null` (legacy fallback where the buffer
 *   realizer mixes fg toward cell.bg without a scrim).
 * - `defaultBg` / `defaultFg` are resolved for stage-2 passes.
 * - `scrimTowardLight` records whether the scrim is on the light side of
 *   the luminance threshold. Null-scrim plans default to `false`.
 * - Active plans are frozen (`Object.isFrozen(plan) === true`); so are
 *   `includes` and `excludes`. `PlanRect.rect` is cloned so mutating the
 *   source AgNode's rect does not affect the plan.
 */
export interface CorePlan {
  /** True when the tree had at least one fade marker with amount > 0. */
  readonly active: boolean
  /**
   * The enforced single amount for this frame, clamped to [0, 1]. Zero
   * when `active` is false.
   */
  readonly amount: number
  /**
   * Resolved scrim hex, or null when no theme bg is available. The
   * buffer-realizer falls back to a legacy single-channel mix when null.
   */
  readonly scrim: HexColor | null
  /** Default background hex for resolving null/default `cell.bg`. */
  readonly defaultBg: HexColor | null
  /**
   * Default foreground hex for resolving null/default `cell.fg`. Derived
   * from `options.defaultFg`, else the opposite of the scrim (white for
   * dark scrim, black for light).
   */
  readonly defaultFg: HexColor | null
  /** Rects marked `data-backdrop-fade` — fade cells INSIDE each rect. */
  readonly includes: readonly PlanRect[]
  /**
   * Rects marked `data-backdrop-fade-excluded` — fade everything OUTSIDE
   * each rect (the modal "cuts a hole").
   */
  readonly excludes: readonly PlanRect[]
  /**
   * True when the collected markers had differing `amount` values. The
   * orchestrator reads this to emit a dev-mode warning; stage 1 stays pure
   * by surfacing the signal instead of calling `console.warn` inline.
   * Mixed amounts break the Kitty overlay's one-image-one-alpha model;
   * prod falls back to the first observed amount.
   */
  readonly mixedAmounts: boolean
  /**
   * True when the resolved `scrim` is on the LIGHT side of the luminance
   * threshold (scrim drifts toward white on light themes). False for dark
   * themes (scrim drifts toward black). Null-scrim plans default to
   * `false` (legacy dark-theme behavior).
   *
   * Determined by luminance comparison, NOT by string equality against
   * `DARK_SCRIM` / `LIGHT_SCRIM` — apps that supply a tinted scrim
   * (e.g., a mid-gray neutral for a flat-color TUI) still get the right
   * polarity.
   */
  readonly scrimTowardLight: boolean
}

/**
 * Terminal-specific plan. Adds the `kittyEnabled` capability flag the
 * terminal realizers consume. Extends `CorePlan`.
 *
 * - `kittyEnabled` is DERIVED from `options.kittyGraphics === true &&
 *   scrim !== null`. The Kitty overlay needs a resolvable tint to
 *   composite, so a null-scrim plan can't use the Kitty path even when
 *   the caller has the capability enabled. Realizers read this directly
 *   (no re-derivation at call sites).
 */
export interface TerminalPlan extends CorePlan {
  readonly kittyEnabled: boolean
}

/**
 * Legacy alias retained so callers importing `Plan` keep compiling. All
 * existing call sites pass a TerminalPlan (via `buildPlan`). New code
 * should prefer `CorePlan` + `TerminalPlan` explicitly.
 */
export type Plan = TerminalPlan

/** Sentinel "nothing to do" plan — reused across frames to avoid allocations. */
export const INACTIVE_PLAN: TerminalPlan = Object.freeze({
  active: false,
  amount: 0,
  scrim: null,
  defaultBg: null,
  defaultFg: null,
  includes: Object.freeze([]) as readonly PlanRect[],
  excludes: Object.freeze([]) as readonly PlanRect[],
  mixedAmounts: false,
  scrimTowardLight: false,
  kittyEnabled: false,
})

/**
 * Syntactic check: does the tree contain any `data-backdrop-fade*`
 * attribute? Returns true even when the marker amounts are 0 (which
 * yields an inactive plan). For "is the plan active this frame?" use
 * `buildPlan(...).active`.
 *
 * Used as a gate so we don't clone the buffer every frame when no
 * backdrop markers are mounted. Walks the full tree once (O(N)) — the
 * alternative (tracking dirty markers in the reconciler) is more complex
 * and the walk is cheap compared to the pass.
 */
export function hasBackdropMarkers(root: AgNode): boolean {
  const props = root.props as Record<string, unknown>
  if (props[BACKDROP_FADE_ATTR] !== undefined || props[BACKDROP_FADE_EXCLUDE_ATTR] !== undefined) {
    return true
  }
  for (const child of root.children) {
    if (hasBackdropMarkers(child)) return true
  }
  return false
}

/** Inactive CorePlan sentinel (TerminalPlan minus the Kitty field). */
const INACTIVE_CORE_PLAN: CorePlan = Object.freeze({
  active: false,
  amount: 0,
  scrim: null,
  defaultBg: null,
  defaultFg: null,
  includes: Object.freeze([]) as readonly PlanRect[],
  excludes: Object.freeze([]) as readonly PlanRect[],
  mixedAmounts: false,
  scrimTowardLight: false,
})

/**
 * Stage 1 (core) — build the framework-agnostic `CorePlan`.
 *
 * Pure function of `(tree markers, options)`. No buffer access, no
 * terminal capability knowledge, no console I/O. Suitable for any target
 * (terminal, canvas, DOM) — the realizer decides how to paint the plan.
 *
 * Returns a frozen inactive plan when:
 * - `colorLevel === "mono"` (no-op, e.g. monochrome terminal).
 * - The tree has no backdrop markers, OR all markers have `amount <= 0`.
 *
 * Implemented as a thin wrapper over `buildPlan` that strips the
 * terminal-specific `kittyEnabled` field. The stripping (and
 * `kittyGraphics` option suppression) keeps `CorePlan` JSON-serializable
 * to a subset that can be reconstructed on a non-terminal target.
 */
export function buildCorePlan(root: AgNode, options?: BackdropOptions): CorePlan {
  // Suppress kittyGraphics so derived flags don't leak through.
  const coreOptions: BackdropOptions | undefined =
    options === undefined ? undefined : { ...options, kittyGraphics: false }
  const plan = buildPlan(root, coreOptions)
  if (!plan.active) return INACTIVE_CORE_PLAN
  // Strip the terminal-specific field. Using object-rest to drop the key
  // entirely (so JSON.stringify doesn't include it) rather than setting it
  // to undefined.
  const { kittyEnabled: _kittyEnabled, ...core } = plan
  return Object.freeze(core)
}

/**
 * Stage 1 (terminal) — build the immutable `TerminalPlan`.
 *
 * Same as `buildCorePlan` plus the derived `kittyEnabled` capability flag.
 * `kittyEnabled = options.kittyGraphics === true && scrim !== null` — the
 * overlay needs a resolvable tint to composite, so a null-scrim plan
 * cannot use the Kitty path even when the caller has the capability
 * enabled.
 */
export function buildPlan(root: AgNode, options?: BackdropOptions): TerminalPlan {
  const colorLevel: ColorLevel = options?.colorLevel ?? "truecolor"
  if (colorLevel === "mono") return INACTIVE_PLAN

  // Collect rects + per-marker amounts. The amounts are inspected only to
  // verify the single-amount invariant; they're discarded after.
  const includes: PlanRect[] = []
  const excludes: PlanRect[] = []
  const includeAmounts: number[] = []
  const excludeAmounts: number[] = []
  collectBackdropMarkers(root, includes, excludes, includeAmounts, excludeAmounts)

  if (includes.length === 0 && excludes.length === 0) return INACTIVE_PLAN

  // Resolve the three color inputs. Every user-provided hex is normalized
  // exactly once here — downstream comparisons (e.g., `scrim === defaultBg`)
  // and string-equality tests in the realizers work regardless of input
  // casing or shorthand.
  const defaultBg = normalizeHex(options?.defaultBg ?? null)
  const scrimColorOpt = options?.scrimColor
  // Explicit scrimColor wins when it parses to a valid hex. Unparseable
  // strings (e.g. "#zzz", "rgb(...)") quietly fall back to the luminance-
  // derived default — treating a typo as "use auto" is friendlier than
  // nullifying the scrim and dropping to the legacy single-channel path.
  const explicitScrim =
    typeof scrimColorOpt === "string" && scrimColorOpt !== "auto"
      ? normalizeHex(scrimColorOpt)
      : null
  const scrim = explicitScrim ?? deriveAutoScrimColor(defaultBg)

  // Polarity by luminance: scrim with luminance >= threshold is "light"
  // (drift fg toward white), below is "dark" (drift toward black).
  const scrimTowardLight = isLightScrim(scrim)

  // Default fg fallback: opposite of the scrim polarity.
  const defaultFg =
    normalizeHex(options?.defaultFg) ??
    (scrim === null ? null : scrimTowardLight ? DARK_SCRIM : LIGHT_SCRIM)

  // Single-amount invariant: one scrim image per frame at one alpha.
  const { amount, hasMixedAmounts } = assertSingleAmount(includeAmounts, excludeAmounts)

  // Kitty overlay is available only when the caller enabled the capability
  // AND the plan resolved a scrim — the overlay needs a tint to composite.
  const kittyEnabled = options?.kittyGraphics === true && scrim !== null

  // Freeze the rect arrays so realizers (and external observers) cannot
  // mutate them. The plan itself is also frozen below.
  Object.freeze(includes)
  Object.freeze(excludes)

  return Object.freeze({
    active: true,
    amount,
    scrim,
    defaultBg,
    defaultFg,
    includes,
    excludes,
    mixedAmounts: hasMixedAmounts,
    scrimTowardLight,
    kittyEnabled,
  })
}

/**
 * Detect the single-amount invariant across all markers. Returns the
 * clamped first-observed amount AND a flag indicating whether any later
 * marker differed. The orchestrator uses the flag to emit a dev-mode warn.
 *
 * Mixed amounts currently break the Kitty overlay (one image, one alpha)
 * and have unclear composition semantics (max? source-over compound?).
 * Production behavior is first-wins but will look wrong until the markers
 * are reconciled to a single value.
 */
function assertSingleAmount(
  includeAmounts: readonly number[],
  excludeAmounts: readonly number[],
): { amount: number; hasMixedAmounts: boolean } {
  const first =
    includeAmounts.length > 0
      ? includeAmounts[0]!
      : excludeAmounts.length > 0
        ? excludeAmounts[0]!
        : 0
  let hasMixedAmounts = false
  for (const a of includeAmounts) {
    if (Math.abs(a - first) > 1e-6) {
      hasMixedAmounts = true
      break
    }
  }
  if (!hasMixedAmounts) {
    for (const a of excludeAmounts) {
      if (Math.abs(a - first) > 1e-6) {
        hasMixedAmounts = true
        break
      }
    }
  }
  return { amount: Math.max(0, Math.min(1, first)), hasMixedAmounts }
}

/**
 * Derive the auto scrim color from a normalized bg hex. Dark themes scrim
 * toward `DARK_SCRIM`; light themes scrim toward `LIGHT_SCRIM`. Returns
 * `null` when `bg` is absent or unparseable — signals legacy single-
 * channel fallback in `fadeCell`.
 */
function deriveAutoScrimColor(bg: HexColor | null): HexColor | null {
  if (!bg) return null
  const lum = relativeLuminance(bg)
  if (lum === null) return null
  return lum < DARK_LUMINANCE_THRESHOLD ? DARK_SCRIM : LIGHT_SCRIM
}

/**
 * Polarity detection for an arbitrary scrim color. Returns `true` when the
 * scrim is on the LIGHT side of the luminance threshold (fg should drift
 * toward white), `false` otherwise. Uses luminance, not string equality,
 * so tinted scrims (mid-gray neutrals, etc.) land on the correct branch.
 * Null scrim defaults to false (dark-theme fallback behavior).
 */
function isLightScrim(scrim: HexColor | null): boolean {
  if (scrim === null) return false
  const lum = relativeLuminance(scrim)
  if (lum === null) return false
  return lum >= DARK_LUMINANCE_THRESHOLD
}

function collectBackdropMarkers(
  node: AgNode,
  includes: PlanRect[],
  excludes: PlanRect[],
  includeAmounts: number[],
  excludeAmounts: number[],
): void {
  const props = node.props as Record<string, unknown>
  const includeRaw = props[BACKDROP_FADE_ATTR]
  const excludeRaw = props[BACKDROP_FADE_EXCLUDE_ATTR]

  if (includeRaw !== undefined || excludeRaw !== undefined) {
    const sourceRect = node.screenRect ?? node.scrollRect ?? node.boxRect
    if (sourceRect && sourceRect.width > 0 && sourceRect.height > 0) {
      // Clone the rect — the source aliases the AgNode's live `screenRect`
      // / `scrollRect` / `boxRect`, which the layout phase mutates next
      // frame. Without a clone, mid-frame layout changes would silently
      // shift the plan's rects.
      const rect = Object.freeze({
        x: sourceRect.x,
        y: sourceRect.y,
        width: sourceRect.width,
        height: sourceRect.height,
      })
      const inc = parseFade(includeRaw)
      if (inc !== null) {
        includes.push(Object.freeze({ rect }))
        includeAmounts.push(inc)
      }
      const exc = parseFade(excludeRaw)
      if (exc !== null) {
        excludes.push(Object.freeze({ rect }))
        excludeAmounts.push(exc)
      }
    }
  }

  for (const child of node.children) {
    collectBackdropMarkers(child, includes, excludes, includeAmounts, excludeAmounts)
  }
}

/**
 * Coerce a marker attribute value into a fade amount in (0, 1], or `null`
 * when the marker is absent / disabled.
 *
 * Accepted inputs:
 *
 *   - `undefined`, `null`, `false` → `null` (marker absent)
 *   - `true` → `DEFAULT_AMOUNT` (presence attribute, e.g. `<Backdrop fade />`)
 *   - `""` → `DEFAULT_AMOUNT` (HTML-attribute presence idiom)
 *   - finite numeric or numeric-string (including in scientific notation):
 *       - `<= 0` → `null` (explicit opt-out)
 *       - `> 1` → `1` (clamped)
 *       - otherwise → the numeric value itself
 *   - any other non-numeric string (e.g. `"bad"`) → `null`
 *
 * The presence-attribute idiom lets components emit `data-backdrop-fade`
 * without threading a numeric value through when the default is fine. The
 * React `Backdrop.tsx` / `ModalDialog.tsx` today always emit a numeric
 * attribute, but the semantic is forward-compatible so nothing breaks if
 * a future component (or a hand-written JSX usage) prefers presence-only.
 */
function parseFade(raw: unknown): number | null {
  if (raw === undefined || raw === null) return null
  if (raw === false) return null
  if (raw === true) return DEFAULT_AMOUNT
  if (raw === "") return DEFAULT_AMOUNT
  const n = typeof raw === "number" ? raw : Number(raw)
  if (!Number.isFinite(n)) return null
  if (n <= 0) return null
  return n > 1 ? 1 : n
}
