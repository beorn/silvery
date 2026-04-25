/**
 * Custom tokens — extend the theme with app-specific semantic or brand tokens.
 *
 * Two paths for declaring custom tokens:
 *
 * 1. **Derivation** — for semantic extensions that should follow the scheme.
 *    Re-derives when the theme changes. Use for: priority levels, status
 *    subtypes, category-specific accents.
 *
 *    ```ts
 *    defineTokens({
 *      "$priority-p0": { derive: (scheme, theme) => scheme.brightRed },
 *      "$priority-p1": { derive: (scheme, theme) => blend(theme.warning, theme.bg, 0.2) },
 *    })
 *    ```
 *
 * 2. **Fixed-rgb** — for brand tokens that must never shift. Carries an
 *    ansi16 fallback (required) so the token renders in every tier. Use for:
 *    logos, identity chrome, signature accents that are part of the brand.
 *
 *    ```ts
 *    defineTokens({
 *      "$km-brand": { rgb: "#5B8DEF", ansi16: "brightBlue" },
 *    })
 *    ```
 *
 * Brand conventions:
 *   - Use for: logos, identity chrome, signature accents
 *   - Avoid for: body text, state, cursor/borders (prefer derivation)
 *   - Naming: `$<app>-<role>`
 *   - ansi16 fallback is required (not optional)
 *
 * @module
 */

import type { Theme, ColorScheme, AnsiColorName } from "./types.ts"
import type { MonoAttr } from "./monochrome.ts"

/** A derivation-style token — computed from the scheme + theme at resolution time. */
export interface DeriveTokenDef {
  /** Compute the hex value from the scheme and derived theme. */
  derive: (scheme: ColorScheme, theme: Theme) => string
  rgb?: never
  ansi16?: never
  attrs?: never
}

/** A fixed-rgb brand token — carries exact values for every rendering tier. */
export interface BrandTokenDef {
  /** Exact hex color at truecolor / 256 tier. */
  rgb: string
  /** Required ANSI 16 slot for low-color terminals. */
  ansi16: AnsiColorName
  /** SGR attrs at monochrome tier. Default: []. */
  attrs?: readonly MonoAttr[]
  derive?: never
}

/** Union — a custom token is either derivation-style or fixed-rgb. */
export type CustomTokenDef = DeriveTokenDef | BrandTokenDef

/** A registry of app-scoped custom tokens. Keys begin with `$`. */
export type CustomTokenRegistry = Record<string, CustomTokenDef>

/** Thrown by `defineTokens` when a definition violates the rules. */
export class CustomTokenError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "CustomTokenError"
  }
}

/** Canonical Theme keys — cannot be overridden by custom tokens. */
const RESERVED_KEYS = new Set<string>([
  "bg",
  "fg",
  "muted",
  "mutedbg",
  "surface",
  "surfacebg",
  "popover",
  "popoverbg",
  "cursor",
  "cursorbg",
  "primary",
  "primaryfg",
  "secondary",
  "secondaryfg",
  "accent",
  "accentfg",
  "error",
  "errorfg",
  "warning",
  "warningfg",
  "success",
  "successfg",
  "info",
  "infofg",
  "border",
  "inputborder",
  "focusborder",
  "disabledfg",
  "palette",
  "name",
  // Brand + state variants (kebab keys)
  "brand",
  "brand-hover",
  "brand-active",
  "primary-hover",
  "primary-active",
  "accent-hover",
  "accent-active",
  "fg-hover",
  "fg-active",
  "bg-selected-hover",
  "bg-surface-hover",
  // Sterling flat selection / inverse / link tokens (replaced legacy aliases in 0.21.0)
  "bg-selected",
  "fg-on-selected",
  "bg-inverse",
  "fg-on-inverse",
  "fg-link",
])

function stripSigil(key: string): string {
  return key.startsWith("$") ? key.slice(1) : key
}

/**
 * Define app-scoped custom tokens. Returns the validated registry.
 *
 * Each token key MUST begin with `$`. The name (minus `$`) cannot collide
 * with a built-in Theme token. Brand tokens MUST declare both `rgb` and
 * `ansi16`.
 *
 * @throws {CustomTokenError} on invalid declarations.
 */
export function defineTokens(defs: Record<string, CustomTokenDef>): CustomTokenRegistry {
  const out: CustomTokenRegistry = {}
  for (const [key, def] of Object.entries(defs)) {
    if (!key.startsWith("$")) {
      throw new CustomTokenError(`Custom token "${key}" must begin with "$"`)
    }
    const name = stripSigil(key)
    if (RESERVED_KEYS.has(name)) {
      throw new CustomTokenError(
        `Custom token "${key}" collides with built-in Theme token "${name}". Pick a namespaced name like "$app-${name}".`,
      )
    }
    const isDerive = "derive" in def && typeof def.derive === "function"
    const isBrand = "rgb" in def && typeof def.rgb === "string"
    if (isDerive && isBrand) {
      throw new CustomTokenError(
        `Custom token "${key}" declares both 'derive' and 'rgb' — pick one (derivation OR fixed-rgb).`,
      )
    }
    if (!isDerive && !isBrand) {
      throw new CustomTokenError(
        `Custom token "${key}" must declare either 'derive' (function) or 'rgb' (hex string).`,
      )
    }
    if (isBrand) {
      const brand = def as BrandTokenDef
      if (!brand.ansi16) {
        throw new CustomTokenError(
          `Custom brand token "${key}" requires an 'ansi16' fallback — every rendering tier must have a valid color.`,
        )
      }
    }
    out[key] = def
  }
  return out
}

/**
 * Resolve a custom token against a scheme + theme at the current rendering tier.
 *
 * `tier` selects the value source:
 *   - `"truecolor"` / `"256"` → derivation result (for derive tokens) or `rgb` (for brand)
 *   - `"ansi16"` → brand `ansi16`, or derive result (apps resolve further)
 *   - `"mono"` → brand `attrs`, or empty
 */
export function resolveCustomToken(
  key: string,
  registry: CustomTokenRegistry,
  scheme: ColorScheme,
  theme: Theme,
  tier: "truecolor" | "256" | "ansi16" | "mono" = "truecolor",
): string | AnsiColorName | readonly MonoAttr[] | undefined {
  const def = registry[key]
  if (!def) return undefined

  if ("derive" in def && typeof def.derive === "function") {
    // Derivation tokens apply to all non-mono tiers.
    if (tier === "mono") return []
    return def.derive(scheme, theme)
  }

  const brand = def as BrandTokenDef
  if (tier === "ansi16") return brand.ansi16
  if (tier === "mono") return brand.attrs ?? []
  return brand.rgb
}
