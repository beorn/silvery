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

import { blend, hexToOklch, oklchToHex, relativeLuminance } from "@silvery/color"
import type { ColorScheme } from "@silvery/ansi"
import type {
  AccentRole,
  BorderRole,
  CursorRole,
  DeepPartial,
  DeriveOptions,
  DerivationStep,
  InteractiveRole,
  MutedRole,
  Roles,
  SurfaceRole,
  Theme,
} from "./types.ts"
import { WCAG_AA, autoLift, checkAA, ContrastError, type ContrastViolation } from "./contrast.ts"

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
  const mutedFg = guard(
    "muted.fg",
    "fg-muted",
    "blend(fg, bg, 0.4)",
    [fg, bg],
    blend(fg, bg, 0.4),
    bg,
    3.0,
  )
  const mutedBg = guard(
    "muted.bg",
    "bg-muted",
    "blend(bg, fg, 0.08)",
    [bg, fg],
    blend(bg, fg, 0.08),
  )
  const muted: MutedRole = { fg: mutedFg, bg: mutedBg }

  // ── Surface ──────────────────────────────────────────────────────────────
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
    "blend(bg, fg, 0.05)",
    [bg, fg],
    blend(bg, fg, 0.05),
  )
  const surfaceRaised = guard(
    "surface.raised",
    "bg-surface-raised",
    "blend(bg, fg, 0.08)",
    [bg, fg],
    blend(bg, fg, 0.08),
  )
  const surfaceOverlay = guard(
    "surface.overlay",
    "bg-surface-overlay",
    "blend(bg, fg, 0.12)",
    [bg, fg],
    blend(bg, fg, 0.12),
  )
  const surfaceHover = guard(
    "surface.hover",
    "bg-surface-hover",
    "blend(bg, fg, 0.10)",
    [bg, fg],
    blend(bg, fg, 0.1),
  )
  const surface: SurfaceRole = {
    default: surfaceDefault,
    subtle: surfaceSubtle,
    raised: surfaceRaised,
    overlay: surfaceOverlay,
    hover: surfaceHover,
  }

  // ── Border ───────────────────────────────────────────────────────────────
  const borderDefault = guard(
    "border.default",
    "border-default",
    "blend(bg, fg, 0.18)",
    [bg, fg],
    blend(bg, fg, 0.18),
  )
  const borderFocus = guard("border.focus", "border-focus", "= accent.bg", [accentBg], accentBg, bg)
  const borderMuted = guard(
    "border.muted",
    "border-muted",
    "blend(bg, fg, 0.10)",
    [bg, fg],
    blend(bg, fg, 0.1),
  )
  const border: BorderRole = { default: borderDefault, focus: borderFocus, muted: borderMuted }

  // ── Cursor ───────────────────────────────────────────────────────────────
  const cursor: CursorRole = {
    fg: guard(
      "cursor.fg",
      "fg-cursor",
      "scheme.cursorText",
      [scheme.cursorText],
      scheme.cursorText,
    ),
    bg: guard(
      "cursor.bg",
      "bg-cursor",
      "scheme.cursorColor",
      [scheme.cursorColor],
      scheme.cursorColor,
    ),
  }

  const roles: Roles = { accent, info, success, warning, error, muted, surface, border, cursor }

  return { roles, mode, trace, violations }
}

// ── Interactive role builder (shared across info/success/warning/error) ────

function buildInteractive(
  name: "info" | "success" | "warning" | "error",
  seed: string,
  scheme: ColorScheme,
  opts: DeriveOptions,
  trace: DerivationStep[],
  violations: ContrastViolation[],
): InteractiveRole {
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
  const fgDir = shiftLabel(fg)

  const fgOn = guard(
    `${name}.fgOn`,
    `fg-on-${name}`,
    "contrast-pick(scheme.fg/bg/BW)",
    [roleBg],
    pickFgOn(roleBg, scheme),
    roleBg,
  )
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
  const hoverFg = guard(
    `${name}.hover.fg`,
    `fg-${name}-hover`,
    `OKLCH ${fgDir} ${delta.hover}L on ${name}.fg`,
    [fg],
    shiftL(fg, delta.hover),
    bg,
  )
  const activeFg = guard(
    `${name}.active.fg`,
    `fg-${name}-active`,
    `OKLCH ${fgDir} ${delta.active}L on ${name}.fg`,
    [fg],
    shiftL(fg, delta.active),
    bg,
  )

  return {
    fg,
    bg: roleBg,
    fgOn,
    hover: { fg: hoverFg, bg: hoverBg },
    active: { fg: activeFg, bg: activeBg },
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
    name: scheme.name,
    mode,
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
