/**
 * Sterling — silvery's canonical DesignSystem.
 *
 * This is the default system shipped from `@silvery/theme`. It implements
 * the `DesignSystem` contract from `types.ts` and serves as the reference
 * for alternative systems (`@silvery/design-material`, `-primer`, etc.).
 *
 * The flat-projection (`theme["bg-accent"]` as a sibling of `theme.accent.bg`
 * on the same object) is NOT Sterling-specific — it's a framework feature.
 * Sterling opts in via `flatten: true` in {@link defineDesignSystem}, which
 * auto-applies `bakeFlat` (from `@silvery/ansi`) to every derivation's
 * output. The default rule is channel-role-state (`fg-accent`, `bg-accent-hover`,
 * `fg-on-error`, `bg-surface-subtle`, `border-focus`, …) — exactly what
 * Sterling's pre-generalization `populateFlat` produced.
 *
 * All derivation functions return a frozen Theme with both nested roles
 * AND flat hyphen keys populated — the user-facing `$fg-accent` syntax
 * resolves against the flat keys, while programmatic access uses nested.
 */

import { blend } from "@silvery/color"
import type { ColorScheme } from "../theme/types.ts"
import type { DeepPartial, DeriveOptions, DesignSystem, Theme, ThemeShape } from "./types.ts"
import { deriveTheme, mergePartial } from "./derive.ts"
import { STERLING_FLAT_TOKENS } from "./flat-tokens.ts"
import { defaultScheme } from "./defaults.ts"
import { defineDesignSystem } from "./define.ts"

const STERLING_SHAPE: ThemeShape = {
  flatTokens: STERLING_FLAT_TOKENS,
  roles: [
    "accent",
    "info",
    "success",
    "warning",
    "error",
    "muted",
    "surface",
    "border",
    "cursor",
    "selected",
    "inverse",
    "link",
    "disabled",
  ],
  states: ["hover", "active"],
}

/**
 * Internal: build a nested Theme (no flat keys). `defineDesignSystem` applies
 * `bakeFlat` afterwards — the inner derivation stays flat-agnostic.
 *
 * Also pre-populates the standalone flat tokens that don't come from a role
 * walk: `bg-backdrop` (modal scrim), and `fg-default`/`bg-default` (explicit
 * aliases for canvas fg/bg). bakeFlat preserves pre-existing root-level
 * hyphen keys, so writing these here is the simplest seam.
 */
function buildRawTheme(scheme: ColorScheme, opts: DeriveOptions = {}): Theme {
  const base = deriveTheme(scheme, opts) as unknown as Theme
  const out = base as unknown as Record<string, unknown>

  // Backdrop — modal scrim. Composite-derived from canvas bg with a 40 %
  // toward-black push, baked solid (TUI has no alpha; web target can emit
  // the actual rgba layer separately). Distinct from `bg-surface-overlay`
  // (which is the popover/tooltip CARD bg).
  if (typeof out["bg-backdrop"] !== "string") {
    out["bg-backdrop"] = blend(scheme.background, "#000000", 0.4)
  }

  // Public default tokens — explicit flat aliases for canvas fg/bg, exposed
  // so consumers can write `$fg-default` / `$bg-default` without reaching
  // for `theme.fg` directly.
  if (typeof out["fg-default"] !== "string") {
    out["fg-default"] = scheme.foreground
  }
  if (typeof out["bg-default"] !== "string") {
    out["bg-default"] = scheme.background
  }

  return base
}

/**
 * Apply a brand overlay to a ColorScheme — overrides `primary` and relevant
 * ANSI hue slots with the brand color. Keeps the rest of the scheme intact.
 * Per Appendix F: brand is a theme INPUT, not a public token sibling of accent.
 */
function applyBrand(scheme: ColorScheme, brand: string): ColorScheme {
  return {
    ...scheme,
    primary: brand,
  }
}

/**
 * Raw Sterling — returns nested-only Themes. `defineDesignSystem` wraps this
 * with auto-`bakeFlat` (per `flatten: true`) to produce the user-facing
 * system with flat keys.
 */
const rawSterling: DesignSystem = {
  name: "sterling",
  shape: STERLING_SHAPE,
  flatten: true,

  defaults(mode: "light" | "dark" = "dark"): Theme {
    return buildRawTheme(defaultScheme(mode), { contrast: "auto-lift" })
  },

  theme(partial?: DeepPartial<Theme>, opts: DeriveOptions = {}): Theme {
    const mode = opts.mode ?? "dark"
    const base = buildRawTheme(defaultScheme(mode), {
      ...opts,
      contrast: opts.contrast ?? "auto-lift",
    })
    if (!partial) return base
    // Merge partial over base (both nested-only). `bakeFlat` (applied by the
    // wrapper) will compute fresh flat keys from the merged nested form.
    return mergePartial(base, partial)
  },

  deriveFromScheme(scheme: ColorScheme, opts: DeriveOptions = {}): Theme {
    return buildRawTheme(scheme, opts)
  },

  deriveFromColor(color: string, opts: DeriveOptions & { mode?: "light" | "dark" } = {}): Theme {
    const mode = opts.mode ?? "dark"
    const base = defaultScheme(mode)
    // Seed hue drives primary; keep background/foreground neutrals from the baseline.
    const scheme: ColorScheme = {
      ...base,
      name: `seed:${color}`,
      primary: color,
      blue: color,
      brightBlue: blend(color, "#ffffff", 0.15),
    }
    return buildRawTheme(scheme, opts)
  },

  deriveFromPair(
    light: ColorScheme,
    dark: ColorScheme,
    opts: DeriveOptions = {},
  ): {
    light: Theme
    dark: Theme
  } {
    return {
      light: buildRawTheme(light, { ...opts, mode: "light" }),
      dark: buildRawTheme(dark, { ...opts, mode: "dark" }),
    }
  },

  deriveFromSchemeWithBrand(scheme: ColorScheme, brand: string, opts: DeriveOptions = {}): Theme {
    return buildRawTheme(applyBrand(scheme, brand), opts)
  },
}

/**
 * Sterling — the user-facing DesignSystem. `defineDesignSystem` wraps
 * `rawSterling` with auto-`bakeFlat` (per `flatten: true`), so every
 * returned Theme has both nested roles AND flat hyphen keys populated.
 */
export const sterling: DesignSystem = defineDesignSystem(rawSterling)
