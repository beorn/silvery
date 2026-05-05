/**
 * Sterling derivation — preservative OKLCH rules over a 22-color ColorScheme.
 *
 * Implements design-system.md §"Derivation rules" with guardrails from D3.
 * Produces the nested `Roles` shape. `flatten.ts` projects the flat keys.
 *
 * Derivation is:
 *   1. `scheme.primary` (or fallback) → accent.fg / accent.bg / info.fg
 *   2. status roles from `scheme.red / yellow / green / primary`
 *   3. Adaptive OKLCH hover/active L-shift (direction = base-L, not scheme.dark):
 *        baseL > 0.6  → darken (hover −0.04L, active −0.08L)
 *        baseL ≤ 0.6  → brighten (hover +0.04L, active +0.08L)
 *      At L extremes (target L > 0.9 or < 0.1) chroma is proportionally
 *      reduced so the color pushes toward gray instead of collapsing to
 *      white/black — fixes the Frappe yellow/light-accent whiteout.
 *   4. `fgOn` picked for WCAG AA against role's `bg` (prefers scheme bg/fg)
 *   5. surface ramp via OKLCH blend
 *   6. contrast guardrail: strict throws, auto-lift adjusts
 *
 * Per-hue delta adaptation: yellows (H ∈ [80, 110]) get ±0.06L / ±0.10L,
 * low-chroma schemes (C < 0.05) get ±0.06L / ±0.10L. Everything else uses
 * the standard ±0.04L / ±0.08L.
 *
 * Pinned tokens (via `DeriveOptions.pins`) bypass both the rule and
 * auto-lift; they're written verbatim onto the Theme.
 */

import {
  blend,
  deltaE as oklchDeltaE,
  ensureContrast,
  hexToOklch,
  oklchToHex,
  relativeLuminance,
} from "@silvery/color"
import type { ColorScheme } from "../theme/types.ts"
import type {
  AccentRole,
  BorderRole,
  CategoricalHues,
  CursorRole,
  DeepPartial,
  DeriveOptions,
  DerivationStep,
  DisabledRole,
  InverseRole,
  LinkRole,
  MutedRole,
  Roles,
  SelectedRole,
  StatusRole,
  SurfaceRole,
  Theme,
  Variant,
} from "./types.ts"
import { WCAG_AA, autoLift, checkAA, ContrastError, type ContrastViolation } from "./contrast.ts"

/**
 * Default typography variants — token-based, works across any Sterling theme.
 * Consumed by `<Text variant="h1">` via the theme's `variants` record.
 *
 * Keys use Sterling flat-token names in their color slots (`$fg-accent`,
 * `$fg-muted`, `$bg-muted`) so the defaults resolve against every Sterling-
 * derived Theme without further wiring.
 */
export const DEFAULT_VARIANTS: Record<string, Variant> = {
  h1: { color: "$fg-accent", bold: true },
  h2: { color: "$fg-accent", bold: true },
  h3: { bold: true },
  h4: { color: "$fg-muted", bold: true },
  h5: { color: "$fg-muted", italic: true },
  h6: { color: "$fg-muted", dim: true },
  body: {},
  "body-muted": { color: "$fg-muted" },
  "fine-print": { color: "$fg-muted", dim: true },
  strong: { bold: true },
  em: { italic: true },
  link: { color: "$fg-accent", underlineStyle: "single" },
  key: { color: "$fg-accent", bold: true },
  code: { backgroundColor: "$bg-muted" },
  kbd: { backgroundColor: "$bg-muted", color: "$fg-accent", bold: true },
}

/**
 * Build the 16-slot ANSI palette from a ColorScheme. Indexed `$color0` …
 * `$color15` by the framework's token resolver.
 */
function buildPalette(scheme: ColorScheme): readonly string[] {
  return [
    scheme.black,
    scheme.red,
    scheme.green,
    scheme.yellow,
    scheme.blue,
    scheme.magenta,
    scheme.cyan,
    scheme.white,
    scheme.brightBlack,
    scheme.brightRed,
    scheme.brightGreen,
    scheme.brightYellow,
    scheme.brightBlue,
    scheme.brightMagenta,
    scheme.brightCyan,
    scheme.brightWhite,
  ]
}

/**
 * Derive the 8-hue categorical ring from a ColorScheme. Mirrors the legacy
 * derive.ts logic — blends scheme hues for the missing Sterling slots
 * (orange from red+yellow, teal from green+cyan, pink from magenta+red).
 */
function buildCategoricalHues(scheme: ColorScheme): CategoricalHues {
  const dark = scheme.dark ?? true
  return {
    red: scheme.red,
    orange: blend(scheme.red, scheme.yellow, 0.5),
    yellow: scheme.yellow,
    green: scheme.green,
    teal: blend(scheme.green, scheme.cyan, 0.5),
    blue: dark ? scheme.brightBlue : scheme.blue,
    purple: scheme.magenta,
    pink: blend(scheme.magenta, scheme.red, 0.5),
  }
}

// ── Hue / chroma helpers ───────────────────────────────────────────────────

function isYellowish(hex: string): boolean {
  const o = hexToOklch(hex)
  if (!o) return false
  // OKLCH yellow ~ H in [80, 120]
  return o.H >= 80 && o.H <= 120
}

function isLowChroma(hex: string): boolean {
  const o = hexToOklch(hex)
  if (!o) return false
  return o.C < 0.05
}

/** Compute state-shift deltas for a given base color. Wider for yellows + low-chroma. */
function stateDeltas(base: string): { hover: number; active: number } {
  if (isYellowish(base) || isLowChroma(base)) return { hover: 0.06, active: 0.1 }
  return { hover: 0.04, active: 0.08 }
}

// ── L-shift primitives (adaptive, chroma-preserving) ──────────────────────

/**
 * Adaptive L-shift: direction follows the token's own luminance, NOT
 * scheme.dark. High-L tokens (yellows, light accents) darken; low-L tokens
 * brighten. Uniform handling — yields a reliable "more active than hover"
 * relationship no matter what hue/lightness the base is.
 *
 * Chroma preservation at L extremes: when the target L pushes past 0.9
 * (approaching white) or below 0.1 (approaching black), chroma is scaled
 * down proportionally so the color drifts toward gray rather than
 * collapsing to #FFFFFF or #000000. This preserves perceptual differences
 * between the base / hover / active states even on intrinsically-bright
 * tokens (catppuccin-frappe yellow, light blue accents, etc.).
 *
 * Returns the original hex unchanged when OKLCH parsing fails.
 */
function shiftL(hex: string, amount: number): string {
  const o = hexToOklch(hex)
  if (!o) return hex
  const direction = o.L > 0.6 ? -1 : +1
  const targetL = clamp01(o.L + direction * amount)

  // Chroma-preservation at L extremes:
  // |L − 0.5| × 2 ∈ [0, 1] — 0 at mid-gray, 1 at L=0 or L=1.
  // Below L=0.9 / above L=0.1 the factor is (1 − 0) = 1 (no dampening).
  // As L saturates, chroma collapses toward 0 → pushes toward gray, not
  // toward white/black.
  let nextC = o.C
  if (targetL > 0.9 || targetL < 0.1) {
    const distanceFromMid = Math.abs(targetL - 0.5) * 2 // 0..1
    // At L=0.9 or L=0.1, distance=0.8 → factor=0.2. At L=1/L=0 → factor=0.
    // Chroma linearly collapses between the 0.9/0.1 boundary and the endpoint.
    const factor = clamp01(1 - distanceFromMid)
    nextC = o.C * factor
  }

  return oklchToHex({ L: targetL, C: nextC, H: o.H })
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x
}

/** Label the direction the adaptive L-shift took, for trace rule strings. */
function shiftLabel(hex: string): "darken" | "brighten" {
  const o = hexToOklch(hex)
  if (!o) return "brighten"
  return o.L > 0.6 ? "darken" : "brighten"
}

// ── Mode inference ─────────────────────────────────────────────────────────

function inferMode(scheme: ColorScheme, explicit?: "light" | "dark"): "light" | "dark" {
  if (explicit) return explicit
  if (typeof scheme.dark === "boolean") return scheme.dark ? "dark" : "light"
  const lum = relativeLuminance(scheme.background)
  return lum !== null && lum < 0.5 ? "dark" : "light"
}

// ── fgOn picker ────────────────────────────────────────────────────────────

/**
 * Pick a foreground color to draw on a filled `bg` of a role. Prefers
 * `scheme.background` if it beats AA against the role bg (i.e. the role bg
 * is bright enough that using dark text reads); otherwise `scheme.foreground`;
 * otherwise falls back to white/black by bg luminance.
 */
function pickFgOn(roleBg: string, scheme: ColorScheme): string {
  const candidates = [scheme.foreground, scheme.background, "#FFFFFF", "#000000"]
  let best = candidates[0]!
  let bestRatio = 0
  for (const c of candidates) {
    const r = checkAA("fgOn", c, roleBg) // null means passes
    if (r === null) return c
    // r.ratio is the current ratio — if below AA, keep hunting
    if (r.ratio > bestRatio) {
      best = c
      bestRatio = r.ratio
    }
  }
  return best
}

// ── Pins resolution ────────────────────────────────────────────────────────

/**
 * Resolve a pin for a token path. Accepts both nested (`"accent.hover.bg"`)
 * and flat (`"bg-accent-hover"`) forms. Returns the pinned hex or undefined.
 */
function pin(
  pins: Readonly<Record<string, string>> | undefined,
  nested: string,
  flat: string,
): string | undefined {
  if (!pins) return undefined
  return pins[nested] ?? pins[flat]
}

/**
 * Shared guard: handles pin → rule → contrast check → auto-lift → record.
 * `target` defaults to WCAG_AA (4.5); callers use 3.0 for "muted" tokens
 * that are deemphasized by design.
 */
function guardTarget(
  nestedPath: string,
  flatPath: string,
  rule: string,
  inputs: string[],
  value: string,
  against: string | undefined,
  target: number,
  contrast: "strict" | "auto-lift",
  pins: Readonly<Record<string, string>> | undefined,
  trace: DerivationStep[],
  violations: ContrastViolation[],
): string {
  const pinned = pin(pins, nestedPath, flatPath)
  if (pinned !== undefined) {
    trace.push({
      token: nestedPath,
      rule: "pinned by scheme author",
      inputs: [pinned],
      output: pinned,
      pinned: true,
    })
    return pinned
  }
  if (against === undefined) {
    trace.push({ token: nestedPath, rule, inputs, output: value })
    return value
  }
  const v = checkAA(nestedPath, value, against, target)
  if (v === null) {
    trace.push({ token: nestedPath, rule, inputs, output: value })
    return value
  }
  // Both modes apply auto-lift. The difference is failure handling:
  //   - strict: residual violations (lift couldn't reach target) → record, caller throws
  //   - auto-lift: residual violations → silent (caller continues)
  const lifted = autoLift(value, against, target)
  const finalValue = lifted.value
  const residual = checkAA(nestedPath, finalValue, against, target)
  if (residual !== null) {
    // Couldn't fully resolve — record a violation. In strict mode, the
    // caller will throw a ContrastError; in auto-lift mode it's metadata.
    violations.push(residual)
  }
  trace.push({
    token: nestedPath,
    rule: lifted.lifted ? `${rule} + auto-lift` : rule,
    inputs,
    output: finalValue,
    ...(lifted.lifted ? { liftedFrom: value } : {}),
  })
  return finalValue
}

// ── Main derivation ────────────────────────────────────────────────────────

/**
 * Derive a Theme's nested roles from a ColorScheme. Guardrails applied.
 */
export function deriveRoles(
  scheme: ColorScheme,
  opts: DeriveOptions,
): {
  roles: Roles
  mode: "light" | "dark"
  trace: DerivationStep[]
  violations: ContrastViolation[]
} {
  const mode = inferMode(scheme, opts.mode)
  const contrast = opts.contrast ?? "auto-lift"
  const pins = opts.pins
  const trace: DerivationStep[] = []
  const violations: ContrastViolation[] = []

  // Primary seed
  const primary = scheme.primary ?? (mode === "dark" ? scheme.brightBlue : scheme.blue)
  const bg = scheme.background
  const fg = scheme.foreground

  // Shared function: guard one leaf token through pins + contrast.
  function guard(
    nestedPath: string,
    flatPath: string,
    rule: string,
    inputs: string[],
    value: string,
    against?: string,
    target = WCAG_AA,
  ): string {
    return guardTarget(
      nestedPath,
      flatPath,
      rule,
      inputs,
      value,
      against,
      target,
      contrast,
      pins,
      trace,
      violations,
    )
  }

  // ── Accent ───────────────────────────────────────────────────────────────
  const accentBase = guard("accent.fg", "fg-accent", "scheme.primary", [primary], primary, bg)
  const accentBg = guard("accent.bg", "bg-accent", "scheme.primary", [primary], primary)
  const deltaA = stateDeltas(accentBg)
  const bgDir = shiftLabel(accentBg)
  const accentHoverBg = guard(
    "accent.hover.bg",
    "bg-accent-hover",
    `OKLCH ${bgDir} ${deltaA.hover}L on accent.bg`,
    [accentBg],
    shiftL(accentBg, deltaA.hover),
  )
  const accentActiveBg = guard(
    "accent.active.bg",
    "bg-accent-active",
    `OKLCH ${bgDir} ${deltaA.active}L on accent.bg`,
    [accentBg],
    shiftL(accentBg, deltaA.active),
  )
  const accentFgOn = guard(
    "accent.fgOn",
    "fg-on-accent",
    "contrast-pick(scheme.fg/bg/BW)",
    [accentBg],
    pickFgOn(accentBg, scheme),
    accentBg,
  )
  const accentBorder = guard("accent.border", "border-accent", "= accent.bg", [accentBg], accentBg)
  // Accent is the canonical link-like role — retains fg.hover / fg.active
  // for interactive text treatments (link hover, clickable accent text).
  const fgDir = shiftLabel(accentBase)
  const accentHoverFg = guard(
    "accent.hover.fg",
    "fg-accent-hover",
    `OKLCH ${fgDir} ${deltaA.hover}L on accent.fg`,
    [accentBase],
    shiftL(accentBase, deltaA.hover),
    bg,
  )
  const accentActiveFg = guard(
    "accent.active.fg",
    "fg-accent-active",
    `OKLCH ${fgDir} ${deltaA.active}L on accent.fg`,
    [accentBase],
    shiftL(accentBase, deltaA.active),
    bg,
  )

  const accent: AccentRole = {
    fg: accentBase,
    bg: accentBg,
    fgOn: accentFgOn,
    border: accentBorder,
    hover: { fg: accentHoverFg, bg: accentHoverBg },
    active: { fg: accentActiveFg, bg: accentActiveBg },
  }

  // ── Info — independent derivation, same seed as accent (D2) ──────────────
  const infoSeed = primary
  const info = buildInteractive("info", infoSeed, scheme, opts, trace, violations)

  // ── Success / Warning / Error ────────────────────────────────────────────
  const success = buildInteractive("success", scheme.green, scheme, opts, trace, violations)
  const warning = buildInteractive("warning", scheme.yellow, scheme, opts, trace, violations)
  const error = buildInteractive("error", scheme.red, scheme, opts, trace, violations)

  // ── Muted ────────────────────────────────────────────────────────────────
  // Muted is a DEEMPHASIZED role by design — it must NOT hit AA-normal (4.5:1)
  // against bg, or it's no longer muted. We enforce only a 3:1 floor
  // (AA-Large / UI), which is the accessibility minimum for non-body text.
  // Blend at 0.4 toward bg (less muted than 0.5 midpoint) so schemes with
  // low fg/bg contrast still clear the 3:1 floor.
  //
  // We derive `mutedBg` first, then guard `mutedFg` against `mutedBg` (the
  // worst-case surface — `mutedBg` is shifted toward `fg`, so muted text on
  // muted bg has the tightest contrast). Lifting against the worst pair
  // implies passing on `bg` too. Tightening fg-muted to AA across every
  // surface is tracked in km-silvery.invariant-matrix-gaps.
  const mutedBg = guard(
    "muted.bg",
    "bg-muted",
    "blend(bg, fg, 0.08)",
    [bg, fg],
    blend(bg, fg, 0.08),
  )
  const mutedFg = guard(
    "muted.fg",
    "fg-muted",
    "blend(fg, bg, 0.4)",
    [fg, bg],
    blend(fg, bg, 0.4),
    mutedBg,
    3.0,
  )
  const muted: MutedRole = { fg: mutedFg, bg: mutedBg }

  // ── Surface ──────────────────────────────────────────────────────────────
  //
  // Surface backgrounds carry body text (`fg`) at AA. The base seeds are
  // small blends toward `fg` (subtle elevation cues) — on most schemes the
  // 0.03 / 0.08 / 0.10 / 0.12 nudge is small enough that `fg` still clears
  // 4.5:1, but a few light schemes (tokyo-night-day, everforest-light,
  // material-light) land at ~4.07-4.31:1 once the bg is shifted halfway
  // toward fg. Auto-lift via `guard(... fgForSurfaceLift, AA)` pushes the
  // surface BACK toward `bg` (away from `fg`) until the pair passes AA.
  //
  // Lift target is `fgForSurfaceLift` — `scheme.foreground` after replicating
  // the legacy `theme/derive.ts` fg lift (against `blend(bg, fg, 0.08)` at
  // AA). The legacy path ships the lifted fg as `theme.fg`, and the post-
  // derivation invariant audit reads `theme.fg` not `scheme.foreground`. If
  // Sterling lifted surfaces against `scheme.fg` only, schemes whose `fg`
  // gets lifted (darker on light schemes) would still fail the audit
  // because the surface isn't far enough from the post-lift `fg`. Anchoring
  // Sterling's surface lift to the same lifted-fg the legacy emits closes
  // that gap structurally without touching `theme/derive.ts`. `surfaceDefault`
  // is `bg` verbatim — we don't lift the root surface; `theme.fg` is already
  // guaranteed AA against it by the legacy ensure().
  const fgForSurfaceLift = ensureContrast(fg, blend(bg, fg, 0.08), WCAG_AA)
  const surfaceDefault = guard(
    "surface.default",
    "bg-surface-default",
    "scheme.background",
    [bg],
    bg,
  )
  const surfaceSubtle = guard(
    "surface.subtle",
    "bg-surface-subtle",
    "blend(bg, fg, 0.03)",
    [bg, fg],
    blend(bg, fg, 0.03),
    fgForSurfaceLift,
    WCAG_AA,
  )
  const surfaceRaised = guard(
    "surface.raised",
    "bg-surface-raised",
    "blend(bg, fg, 0.10)",
    [bg, fg],
    blend(bg, fg, 0.1),
    fgForSurfaceLift,
    WCAG_AA,
  )
  const surfaceOverlay = guard(
    "surface.overlay",
    "bg-surface-overlay",
    "blend(bg, fg, 0.12)",
    [bg, fg],
    blend(bg, fg, 0.12),
    fgForSurfaceLift,
    WCAG_AA,
  )
  const surfaceHover = guard(
    "surface.hover",
    "bg-surface-hover",
    "blend(bg, fg, 0.10)",
    [bg, fg],
    blend(bg, fg, 0.1),
    fgForSurfaceLift,
    WCAG_AA,
  )
  const surface: SurfaceRole = {
    default: surfaceDefault,
    subtle: surfaceSubtle,
    raised: surfaceRaised,
    overlay: surfaceOverlay,
    hover: surfaceHover,
  }

  // ── Border ───────────────────────────────────────────────────────────────
  //
  // WCAG 1.4.11 — non-text chrome (borders, dividers, focus rings) needs:
  //   - 3:1 (CONTROL) for "active" UI chrome (focus rings, default borders)
  //   - 1.5:1 (FAINT) for purely structural dividers (muted borders)
  //
  // The seed blends are aesthetic — small fg nudges that read as a faint
  // line. On schemes with low fg/bg contrast (default-dark / default-light
  // are good examples) those nudges land at ~1.2-1.5:1 against bg, which is
  // below the WCAG floor for a *visible* line. Auto-lift pushes the border
  // FURTHER toward fg (more contrast) until the floor is met. Borders never
  // hit AA-text (4.5:1) — they're not text. Constants below match
  // `theme/invariants.ts` (LARGE_RATIO=3.0, FAINT_RATIO=1.5).
  const borderDefault = guard(
    "border.default",
    "border-default",
    "blend(bg, fg, 0.18)",
    [bg, fg],
    blend(bg, fg, 0.18),
    bg,
    3.0,
  )
  const borderFocus = guard("border.focus", "border-focus", "= accent.bg", [accentBg], accentBg, bg)
  const borderMuted = guard(
    "border.muted",
    "border-muted",
    "blend(bg, fg, 0.10)",
    [bg, fg],
    blend(bg, fg, 0.1),
    bg,
    1.5,
  )
  const border: BorderRole = { default: borderDefault, focus: borderFocus, muted: borderMuted }

  // ── Cursor ───────────────────────────────────────────────────────────────
  //
  // Terminal cursor colors are configured for a blinky 1-cell indicator,
  // not a large selected-row surface. Many schemes ship `cursorText` /
  // `cursorColor` pairs that fail WCAG AA when used as fg/bg of rendered
  // text — and a few ship a `cursorColor` so close to `bg` that the cursor
  // is invisible (zenburn, tokyo-night-day, serendipity-*, one-light,
  // one-half-light).
  //
  // Adaptive repair pass:
  //   1. `repairCursorBg` lifts cursor.bg's L away from bg's L until OKLCH
  //      ΔE ≥ CURSOR_DELTA_E (visibility threshold from theme/invariants.ts).
  //   2. `guard(cursor.bg)` records the (possibly-repaired) value.
  //   3. `guard(cursor.fg)` auto-lifts the fg against the repaired bg at AA
  //      so the cursor row remains readable.
  //
  // This mirrors the existing `repairSelectionBg` pass but keys off ΔE
  // (perceptual distance) rather than ΔL alone — cursor visibility cares
  // about hue + chroma + L combined, not just lightness.
  const cursorBgRaw = guard(
    "cursor.bg",
    "bg-cursor",
    "scheme.cursorColor (visibility-repaired ΔE ≥ 0.15 vs bg)",
    [scheme.cursorColor, bg],
    repairCursorBg(scheme.cursorColor, bg),
  )
  const cursor: CursorRole = {
    fg: guard(
      "cursor.fg",
      "fg-cursor",
      "scheme.cursorText",
      [scheme.cursorText],
      scheme.cursorText,
      cursorBgRaw,
    ),
    bg: cursorBgRaw,
  }

  // ── Selected ─────────────────────────────────────────────────────────────
  //
  // The selection / cursor-row highlight surface. Authored by the scheme as
  // `selectionBackground` / `selectionForeground` for a literal text-selection
  // bar; we lift it to a first-class role because the same surface is reused
  // for the cursor row, search-match highlights, and any "this is the active
  // item" treatment.
  //
  // Visibility repair: if the scheme's selectionBackground is too close to bg
  // (ΔL < 0.08), shift L away — preserves hue + chroma but guarantees the
  // highlight reads against any background. fgOn defaults to the scheme's
  // selectionForeground, with auto-lift to AA against the (possibly repaired)
  // selection bg.
  const selectedBg = guard(
    "selected.bg",
    "bg-selected",
    "scheme.selectionBackground (visibility-repaired ΔL ≥ 0.08 vs bg)",
    [scheme.selectionBackground, bg],
    repairSelectionBg(scheme.selectionBackground, bg),
  )
  const selectedFgOn = guard(
    "selected.fgOn",
    "fg-on-selected",
    "scheme.selectionForeground",
    [scheme.selectionForeground],
    scheme.selectionForeground,
    selectedBg,
  )
  const selectedDeltaH = stateDeltas(selectedBg)
  const selectedHoverBg = guard(
    "selected.hover.bg",
    "bg-selected-hover",
    `OKLCH ${shiftLabel(selectedBg)} ${selectedDeltaH.hover}L on selected.bg`,
    [selectedBg],
    shiftL(selectedBg, selectedDeltaH.hover),
  )
  const selected: SelectedRole = {
    bg: selectedBg,
    fgOn: selectedFgOn,
    hover: { bg: selectedHoverBg },
  }

  // ── Inverse ──────────────────────────────────────────────────────────────
  //
  // Flipped surface — status bars, modal chrome, "you are here" bands.
  // `blend(fg, bg, 0.1)` matches the legacy Theme's `inversebg` derivation:
  // a slight tint of fg over bg, distinct enough to read as a band but not
  // so loud it competes with `bg-accent`. fgOn picks the contrast partner.
  const inverseBg = guard(
    "inverse.bg",
    "bg-inverse",
    "blend(fg, bg, 0.1)",
    [fg, bg],
    blend(fg, bg, 0.1),
  )
  const inverseFgOn = guard(
    "inverse.fgOn",
    "fg-on-inverse",
    "contrast-pick(scheme.fg/bg/BW)",
    [inverseBg],
    pickFgOn(inverseBg, scheme),
    inverseBg,
  )
  const inverse: InverseRole = { bg: inverseBg, fgOn: inverseFgOn }

  // ── Link ─────────────────────────────────────────────────────────────────
  //
  // Hyperlink text color. Not the same as accent — many design systems want
  // "link blue" (Material, Polaris, GitHub) distinct from the brand-derived
  // accent. Default: scheme.brightBlue (dark mode) / scheme.blue (light mode).
  // Apps that want link === accent can pin `{ "link.fg": "$fg-accent" }`.
  const linkFg = guard(
    "link.fg",
    "fg-link",
    mode === "dark" ? "scheme.brightBlue" : "scheme.blue",
    [mode === "dark" ? scheme.brightBlue : scheme.blue],
    mode === "dark" ? scheme.brightBlue : scheme.blue,
    bg,
  )
  const link: LinkRole = { fg: linkFg }

  // ── Disabled ─────────────────────────────────────────────────────────────
  //
  // Composite-based derivation: simulate alpha-over-surface, baked to a solid
  // hex. Disabled is a NEUTRAL family — sourced from the base interface
  // tokens (`fg`, `border-default`) rather than from accent/status, so a
  // disabled control reads as "absent / inactive" not as a muted error.
  //
  //   fg-disabled    = composite(fg              @ 0.38, bg-surface-default)
  //                    clamped to ≥3:1 contrast vs bg-surface-default
  //   border-disabled = composite(border-default @ 0.24, bg-surface-default)
  //   bg-disabled    = composite(border-default @ 0.12, bg-surface-default)
  //
  // The 3:1 floor on fg-disabled matches WCAG 1.4.3 Level AA-Large for
  // non-essential text — disabled labels are deemphasized but must remain
  // legible. Below 3:1 they read as missing content, which IS a negative
  // surprise.
  const fgDisabledRaw = blend(surfaceDefault, fg, 0.38)
  const fgDisabled = guard(
    "disabled.fg",
    "fg-disabled",
    "composite(fg @ 0.38, surface.default), ≥3:1",
    [fg, surfaceDefault],
    fgDisabledRaw,
    surfaceDefault,
    3.0,
  )
  const borderDisabled = guard(
    "disabled.border",
    "border-disabled",
    "composite(border-default @ 0.24, surface.default)",
    [borderDefault, surfaceDefault],
    blend(surfaceDefault, borderDefault, 0.24),
  )
  const bgDisabled = guard(
    "disabled.bg",
    "bg-disabled",
    "composite(border-default @ 0.12, surface.default)",
    [borderDefault, surfaceDefault],
    blend(surfaceDefault, borderDefault, 0.12),
  )
  const disabled: DisabledRole = { fg: fgDisabled, bg: bgDisabled, border: borderDisabled }

  const roles: Roles = {
    accent,
    info,
    success,
    warning,
    error,
    muted,
    surface,
    border,
    cursor,
    selected,
    inverse,
    link,
    disabled,
  }

  return { roles, mode, trace, violations }
}

// ── Visibility repair (selection bg) ──────────────────────────────────────

const SELECTION_DELTA_L = 0.08

/**
 * Nudge selectionBg's OKLCH L until it differs from bg by ≥ SELECTION_DELTA_L.
 * Mirrors the legacy theme's repairSelectionBg behavior — preserves hue +
 * chroma but guarantees the highlight reads against any background. Non-hex
 * input returns unchanged.
 */
function repairSelectionBg(selectionBg: string, bg: string): string {
  const oSel = hexToOklch(selectionBg)
  const oBg = hexToOklch(bg)
  if (!oSel || !oBg) return selectionBg
  const dL = Math.abs(oSel.L - oBg.L)
  if (dL >= SELECTION_DELTA_L) return selectionBg
  const needed = SELECTION_DELTA_L - dL + 0.005
  const direction = oSel.L >= oBg.L ? 1 : -1
  const newL = clamp01(oSel.L + direction * needed)
  return oklchToHex({ L: newL, C: oSel.C, H: oSel.H })
}

// ── Visibility repair (cursor bg) ─────────────────────────────────────────

const CURSOR_DELTA_E = 0.15

/**
 * Nudge cursorBg's OKLCH L until it differs from bg by ≥ CURSOR_DELTA_E
 * (perceptual distance, not just lightness). Preserves hue + chroma but
 * guarantees the cursor reads against the surrounding bg.
 *
 * Uses ΔE (OKLCH perceptual distance) rather than ΔL because two colors at
 * the same lightness but different hue/chroma are still visibly distinct —
 * a yellow cursor on a blue bg of equal L is perfectly visible. Only when
 * ΔE falls below the visibility floor do we lift L to compensate.
 *
 * Mirrors `repairSelectionBg` in shape; the repair primitive is L because
 * shifting hue or chroma would change the author-intended cursor color
 * identity. L is the "size" knob — bigger ΔL → more visible without
 * recoloring.
 *
 * Non-hex input returns unchanged.
 */
function repairCursorBg(cursorBg: string, bg: string): string {
  const oCur = hexToOklch(cursorBg)
  const oBg = hexToOklch(bg)
  if (!oCur || !oBg) return cursorBg
  if (oklchDeltaE(oCur, oBg) >= CURSOR_DELTA_E) return cursorBg

  // Direction = move L AWAY from bg's L so a lift always increases ΔE.
  const direction = oCur.L >= oBg.L ? 1 : -1
  // Binary-search the smallest |ΔL| shift that achieves ΔE ≥ threshold + 0.005
  // (tiny safety margin; the OKLCH→hex round-trip loses ~0.5e-2 of ΔE
  // precision, and the visibility invariant uses strict `<` comparison so
  // landing exactly on the threshold flunks the invariant). Bounded at the
  // L gamut edge so we don't loop forever on degenerate input.
  const TARGET = CURSOR_DELTA_E + 0.005
  let lo = 0
  let hi = direction > 0 ? 1 - oCur.L : oCur.L
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2
    const newL = clamp01(oCur.L + direction * mid)
    const candidate = { L: newL, C: oCur.C, H: oCur.H }
    if (oklchDeltaE(candidate, oBg) >= TARGET) hi = mid
    else lo = mid
  }
  const newL = clamp01(oCur.L + direction * hi)
  return oklchToHex({ L: newL, C: oCur.C, H: oCur.H })
}

// ── Interactive role builder (shared across info/success/warning/error) ────

function buildInteractive(
  name: "info" | "success" | "warning" | "error",
  seed: string,
  scheme: ColorScheme,
  opts: DeriveOptions,
  trace: DerivationStep[],
  violations: ContrastViolation[],
): StatusRole {
  const pins = opts.pins
  const contrast = opts.contrast ?? "auto-lift"
  const bg = scheme.background

  const guard = (
    nestedPath: string,
    flatPath: string,
    rule: string,
    inputs: string[],
    value: string,
    against?: string,
    target = WCAG_AA,
  ): string =>
    guardTarget(
      nestedPath,
      flatPath,
      rule,
      inputs,
      value,
      against,
      target,
      contrast,
      pins,
      trace,
      violations,
    )

  const fg = guard(`${name}.fg`, `fg-${name}`, seedRule(name), [seed], seed, bg)
  const roleBg = guard(`${name}.bg`, `bg-${name}`, seedRule(name), [seed], seed)
  const delta = stateDeltas(roleBg)
  const bgDir = shiftLabel(roleBg)

  const fgOn = guard(
    `${name}.fgOn`,
    `fg-on-${name}`,
    "contrast-pick(scheme.fg/bg/BW)",
    [roleBg],
    pickFgOn(roleBg, scheme),
    roleBg,
  )
  // Status roles: ONLY bg state variants. Text doesn't hover — fg-error
  // is "this is an error", not an interactive link. Removing fg.hover /
  // fg.active prevents the algorithmic over-generation of illegible
  // variants on high-L seeds (see catppuccin-frappe warning whiteout).
  const hoverBg = guard(
    `${name}.hover.bg`,
    `bg-${name}-hover`,
    `OKLCH ${bgDir} ${delta.hover}L`,
    [roleBg],
    shiftL(roleBg, delta.hover),
  )
  const activeBg = guard(
    `${name}.active.bg`,
    `bg-${name}-active`,
    `OKLCH ${bgDir} ${delta.active}L`,
    [roleBg],
    shiftL(roleBg, delta.active),
  )

  return {
    fg,
    bg: roleBg,
    fgOn,
    hover: { bg: hoverBg },
    active: { bg: activeBg },
  }
}

function seedRule(name: string): string {
  switch (name) {
    case "info":
      return "scheme.primary (info mirrors accent's seed, derived independently)"
    case "success":
      return "scheme.green"
    case "warning":
      return "scheme.yellow"
    case "error":
      return "scheme.red"
    case "accent":
      return "scheme.primary"
    default:
      return `scheme.${name}`
  }
}

// ── Full-theme derivation ──────────────────────────────────────────────────

/**
 * Derive a full Theme (pre-flatten) from a ColorScheme. Throws `ContrastError`
 * in strict mode if any role pair fails WCAG AA. Callers typically wrap this
 * with `flatten()` (from `flatten.ts`) to get the user-facing Theme.
 *
 * Returned Theme is NOT frozen and DOES NOT contain flat keys yet.
 */
export function deriveTheme(
  scheme: ColorScheme,
  opts: DeriveOptions = {},
): Omit<Theme, keyof import("./types.ts").FlatTokens> {
  const { roles, mode, trace, violations } = deriveRoles(scheme, opts)

  if ((opts.contrast ?? "auto-lift") === "strict" && violations.length > 0) {
    throw new ContrastError(violations)
  }

  const partial = {
    ...roles,
    ...buildCategoricalHues(scheme),
    name: scheme.name,
    mode,
    variants: DEFAULT_VARIANTS,
    palette: buildPalette(scheme),
    ...(opts.trace ? { derivationTrace: trace } : {}),
  }
  return partial as Omit<Theme, keyof import("./types.ts").FlatTokens>
}

// ── Apply partial overrides ────────────────────────────────────────────────

/**
 * Merge a DeepPartial<Theme> onto an existing Theme (for `sterling.theme()`).
 * Nested role objects are spread deeply; flat keys are replaced if present.
 */
export function mergePartial(base: Theme, patch: DeepPartial<Theme> | undefined): Theme {
  if (!patch) return base
  const out: any = { ...base }
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue
    const cur = (base as any)[k]
    if (cur && typeof cur === "object" && typeof v === "object" && !Array.isArray(v)) {
      out[k] = { ...cur, ...(v as object) }
      // Second-level deep (for hover/active under roles)
      for (const [k2, v2] of Object.entries(v as object)) {
        if (
          v2 &&
          typeof v2 === "object" &&
          !Array.isArray(v2) &&
          cur[k2] &&
          typeof cur[k2] === "object"
        ) {
          out[k][k2] = { ...cur[k2], ...(v2 as object) }
        }
      }
    } else {
      out[k] = v
    }
  }
  return out as Theme
}
