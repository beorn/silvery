/**
 * `defineDesignSystem` — wrap a DesignSystem so its derivations auto-apply
 * `bakeFlat` per the `flatten` flag.
 *
 * This makes flat-projection-on-same-object a FRAMEWORK feature, not a
 * Sterling-specific one. Any `DesignSystem` whose Theme is a nested POJO of
 * hex-string leaves gets `theme.accent.bg` AND `theme["bg-accent"]` access
 * without reimplementing the walk.
 *
 * ```ts
 * export const sterling = defineDesignSystem({
 *   name: "sterling",
 *   shape: STERLING_SHAPE,
 *   flatten: true,                      // ← opt in to default channel-role-state rule
 *   defaults(mode) { return derive(...) },
 *   theme(partial) { return derive(...) },
 *   deriveFromScheme(scheme) { return derive(...) },
 *   // … etc. Return VALUES without flat keys; defineDesignSystem bakes them.
 * })
 * ```
 *
 * Contract:
 * - `flatten: true` → apply `bakeFlat(theme)` with `defaultFlattenRule`
 * - `flatten: <fn>` → apply `bakeFlat(theme, <fn>)`
 * - `flatten: false` / omitted → pass-through (identity)
 *
 * All derivation methods (`defaults`, `theme`, `deriveFromScheme`,
 * `deriveFromColor`, `deriveFromPair`, `deriveFromSchemeWithBrand`) are
 * wrapped; their return values go through the flatten filter before
 * reaching the caller. `deriveFromPair` returns `{ light, dark }` —
 * both are flattened.
 */

import { bakeFlat, type FlattenRule } from "../flatten.ts"
import type { DesignSystem, Theme } from "./types.ts"

type FlattenFn = (theme: Theme) => Theme

function resolveFlatten(flatten: DesignSystem["flatten"]): FlattenFn {
  if (flatten === false || flatten === undefined) {
    return (t) => t
  }
  if (typeof flatten === "function") {
    const rule = flatten as FlattenRule
    return (t) => bakeFlat(t, rule)
  }
  // `true` → default channel-role-state rule
  return (t) => bakeFlat(t)
}

/**
 * Wrap a DesignSystem so every derivation method auto-applies `bakeFlat`
 * per the `flatten` flag. Pass your raw system (one that returns nested
 * themes) and this returns a user-facing system whose outputs have flat
 * keys populated.
 */
export function defineDesignSystem(def: DesignSystem): DesignSystem {
  const flatten = resolveFlatten(def.flatten)

  return {
    name: def.name,
    shape: def.shape,
    flatten: def.flatten,

    defaults: (mode) => flatten(def.defaults(mode)),
    theme: (partial, opts) => flatten(def.theme(partial, opts)),
    deriveFromScheme: (scheme, opts) => flatten(def.deriveFromScheme(scheme, opts)),
    deriveFromColor: (color, opts) => flatten(def.deriveFromColor(color, opts)),
    deriveFromPair: (light, dark, opts) => {
      const pair = def.deriveFromPair(light, dark, opts)
      return { light: flatten(pair.light), dark: flatten(pair.dark) }
    },
    deriveFromSchemeWithBrand: (scheme, brand, opts) =>
      flatten(def.deriveFromSchemeWithBrand(scheme, brand, opts)),
  }
}
