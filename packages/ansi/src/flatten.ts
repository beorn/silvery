/**
 * Generic flat-projection helper for design-system Themes.
 *
 * Any DesignSystem whose Theme is a nested POJO of hex-string leaves can
 * project those leaves as hyphen-keyed siblings on the SAME object — the
 * "flat form" — with no copy and no Proxy. Both paths reference the same
 * string. The object is frozen at the end.
 *
 * ```ts
 * const theme = bakeFlat({
 *   accent: { fg: "#0969da", bg: "#0969da", fgOn: "#ffffff",
 *             hover: { fg: "#0550ae", bg: "#0550ae" } },
 *   surface: { default: "#ffffff", subtle: "#f6f8fa" },
 *   cursor: { fg: "#ffffff", bg: "#0969da" },
 * })
 *
 * theme.accent.bg === theme["bg-accent"]               // true — same reference
 * theme["bg-accent-hover"]                             // "#0550ae"
 * theme["bg-surface-subtle"]                           // "#f6f8fa"
 * ```
 *
 * Consumed by:
 *   - Sterling (`@silvery/theme/sterling`) via `defineDesignSystem({ flatten: true })`
 *   - Any alternative DesignSystem that wants flat-projection for free
 *
 * @see defaultFlattenRule — the channel-role-state rule Sterling uses
 * @see FlattenRule — bring-your-own rule for non-Sterling conventions
 */

/**
 * Given a nested path to a hex leaf, return the flat-key sibling to write
 * onto the root object. Return `null` to skip that leaf (no flat alias).
 *
 * Paths are arrays of segment names as they appear in the nested object,
 * e.g. `["accent", "hover", "bg"]`.
 */
export type FlattenRule = (path: readonly string[]) => string | null

/**
 * Channel-role-state default rule. Matches Sterling / Primer / CSS-var
 * conventions: `{kind}-{role}[-{state}]`, with `fg-on-{role}` for `fgOn`,
 * and implicit-kind collapse for the `surface` / `border` roles.
 *
 * Mapping examples:
 * | Path                         | Flat key                    |
 * | ---------------------------- | --------------------------- |
 * | `accent.fg`                  | `fg-accent`                 |
 * | `accent.bg`                  | `bg-accent`                 |
 * | `accent.fgOn`                | `fg-on-accent`              |
 * | `accent.border`              | `border-accent`             |
 * | `accent.hover.bg`            | `bg-accent-hover`           |
 * | `accent.active.fg`           | `fg-accent-active`          |
 * | `info.hover.bg`              | `bg-info-hover`             |
 * | `cursor.fg`                  | `fg-cursor`                 |
 * | `muted.bg`                   | `bg-muted`                  |
 * | `surface.default`            | `bg-surface-default`        |
 * | `surface.subtle`             | `bg-surface-subtle`         |
 * | `surface.hover`              | `bg-surface-hover`          |
 * | `border.default`             | `border-default`            |
 * | `border.focus`               | `border-focus`              |
 * | `border.muted`               | `border-muted`              |
 *
 * Returns `null` for depth-1 leaves (e.g. `mode`, `name` — not role-scoped)
 * so metadata doesn't get flattened. The caller (`bakeFlat`) already filters
 * non-hex leaves, but the rule also guards paths shorter than 2 segments.
 */
export const defaultFlattenRule: FlattenRule = (path) => {
  // Metadata at the root (mode, name) — no flat alias.
  if (path.length < 2) return null

  const role = path[0]!
  const last = path[path.length - 1]!
  const mid = path.slice(1, -1)

  // Rule B: fgOn → fg-on-{role}
  if (last === "fgOn") return `fg-on-${role}`

  // Rule A: last segment is a channel kind (fg | bg | border)
  if (last === "fg" || last === "bg" || last === "border") {
    // Optional state variant: mid[0] when present (hover, active, …).
    const state = mid.length > 0 ? mid.join("-") : undefined
    return state ? `${last}-${role}-${state}` : `${last}-${role}`
  }

  // Rule C: role implies a channel kind; leaf is a level/state name.
  //   surface → bg-surface-{last}
  //   border  → border-{last}   (collapse — don't emit "border-border-…")
  if (role === "surface") return `bg-surface-${last}`
  if (role === "border") return `border-${last}`

  // Unknown shape — no flat alias.
  return null
}

/** Matches `#rgb`, `#rrggbb`, and `#rrggbbaa` (case-insensitive). */
const HEX_LEAF_RE = /^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?([0-9a-fA-F]{2})?$/

function isHexLeaf(value: unknown): value is string {
  return typeof value === "string" && HEX_LEAF_RE.test(value)
}

/**
 * Populate flat hyphen-keys onto `theme` in-place by walking hex leaves and
 * asking `rule` where each leaf should also live at the root.
 *
 * Both the nested and flat forms reference the SAME string (not copies) —
 * `bakeFlat({...}).accent.bg === bakeFlat({...})["bg-accent"]`.
 *
 * `rule` defaults to {@link defaultFlattenRule} (channel-role-state).
 * Rules returning `null` for a path skip that leaf — useful for suppressing
 * metadata or implementing partial projections.
 *
 * The returned object is deep-frozen. The input object is mutated in place
 * and returned; callers that want an unfrozen copy should `structuredClone`
 * before calling.
 *
 * @param theme  nested POJO of hex-string leaves (plus optional metadata)
 * @param rule   how to compute flat keys from nested paths
 * @returns      the same object, with flat keys added and frozen
 */
export function bakeFlat<T extends object>(theme: T, rule: FlattenRule = defaultFlattenRule): T {
  const root = theme as Record<string, unknown>
  // Idempotence: re-baking a frozen Theme is a no-op. Callers sometimes
  // bake defensively (e.g. ThemeProvider round-trips) — don't throw on
  // the second bake.
  if (Object.isFrozen(root)) return theme
  walk(root, [], root, rule)
  freezeDeep(root)
  return theme
}

function walk(
  node: Record<string, unknown>,
  path: string[],
  root: Record<string, unknown>,
  rule: FlattenRule,
): void {
  for (const key of Object.keys(node)) {
    // Skip flat keys we've already written during this walk so we don't
    // recurse into them (they're siblings at the root and would otherwise
    // be re-visited with path=[flatKey], which produces garbage mappings).
    if (node === root && key.includes("-")) continue

    const value = node[key]
    const subpath = [...path, key]

    if (isHexLeaf(value)) {
      const flatKey = rule(subpath)
      if (flatKey !== null) {
        root[flatKey] = value
      }
      continue
    }

    if (value && typeof value === "object" && !Array.isArray(value)) {
      walk(value as Record<string, unknown>, subpath, root, rule)
    }
  }
}

function freezeDeep(o: unknown): void {
  if (o === null || typeof o !== "object") return
  if (Object.isFrozen(o)) return
  Object.freeze(o)
  for (const k of Object.keys(o as object)) {
    freezeDeep((o as Record<string, unknown>)[k])
  }
}
