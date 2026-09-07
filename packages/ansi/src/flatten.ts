/**
 * Generic flat-projection helper for design-system Themes.
 *
 * Any DesignSystem whose Theme is a nested POJO of terminal-color leaves can
 * project those leaves as hyphen-keyed siblings on the SAME object — the
 * "flat form" — in-place for mutable inputs, without a Proxy. Both paths reference the same
 * value. The object is frozen at the end.
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

import { FG_COLORS } from "./color-maps.ts"

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
 * | `inverse.muted.fgOn`         | `fg-on-inverse-muted`       |
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
 * The two canonical root colors map to the explicit default tokens. Other
 * depth-one leaves (e.g. `mode`, `name`) are metadata and remain unflattened.
 */
export const defaultFlattenRule: FlattenRule = (path) => {
  // Canonical root defaults; `bakeFlat` is their only flat writer.
  if (path.length === 1) {
    if (path[0] === "fg") return "fg-default"
    if (path[0] === "bg") return "bg-default"
    return null
  }

  const role = path[0]
  const last = path[path.length - 1]
  if (role === undefined || last === undefined) return null
  const mid = path.slice(1, -1)

  // Rule B: fgOn → fg-on-{role}[-{state}]
  if (last === "fgOn") {
    const state = mid.length > 0 ? mid.join("-") : undefined
    return state ? `fg-on-${role}-${state}` : `fg-on-${role}`
  }

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
const HEX_LEAF_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/

/** The closed color-leaf grammar Theme projection accepts.
 *
 * Component color props accept broader expressions (`$tokens`, `mix(...)`,
 * `rgb(...)`, …), but a Theme is the concrete resolved palette those props
 * consume. A mapped role leaf therefore holds only a literal hex color, the
 * explicit terminal-default clear, an ANSI name, or a bounded ANSI-256 index.
 * Metadata stays untouched because it has no flat mapping rule. */
function isTerminalColorLeaf(value: unknown): value is string | number {
  if (typeof value === "number") return Number.isInteger(value) && value >= 0 && value <= 255
  if (typeof value !== "string") return false
  if (value === "" || HEX_LEAF_RE.test(value)) return true
  if (Object.hasOwn(FG_COLORS, value)) return true
  const indexed = /^ansi256\(\s*(\d+)\s*\)$/i.exec(value)
  return indexed !== null && Number(indexed[1]) <= 255
}

function unsupportedColorLeaf(path: readonly string[], value: unknown): Error {
  return new Error(
    `Invalid color leaf at ${JSON.stringify(path.join("."))}: ${JSON.stringify(value)}`,
  )
}

/**
 * Populate flat hyphen-keys onto `theme` in-place by walking concrete color leaves and
 * asking `rule` where each leaf should also live at the root.
 *
 * Both the nested and flat forms reference the SAME string (not copies) —
 * `bakeFlat({...}).accent.bg === bakeFlat({...})["bg-accent"]`.
 *
 * `rule` defaults to {@link defaultFlattenRule} (channel-role-state).
 * Rules returning `null` for a path skip that leaf — useful for suppressing
 * metadata or implementing partial projections.
 *
 * The returned object is deep-frozen. An unfrozen input is mutated in place
 * and returned; a shallow-frozen input is cloned before projection so its
 * mutable nested roles are not silently shared. A deeply frozen Theme is
 * returned unchanged for idempotence.
 *
 * @param theme  nested POJO of concrete color leaves (plus optional metadata)
 * @param rule   how to compute flat keys from nested paths
 * @returns      the baked object, with flat keys added and frozen
 */
export function bakeFlat<T extends object>(theme: T, rule: FlattenRule = defaultFlattenRule): T {
  const root = theme as Record<string, unknown>
  // Frozen is a JavaScript property, not proof this projector has run. Read
  // and validate the nested source before deciding whether an alias is current.
  const flat: Record<string, unknown> = {}
  walk(root, [], flat, rule)
  if (Object.isFrozen(root)) {
    if (
      Object.entries(flat).every(([key, value]) => Object.is(root[key], value)) &&
      isDeepFrozen(root)
    ) {
      return theme
    }
    const clone = (globalThis as { structuredClone?: <T>(value: T) => T }).structuredClone
    if (clone === undefined) {
      throw new Error("bakeFlat cannot project a frozen Theme: structuredClone is unavailable")
    }
    const baked = Object.assign(clone(theme), flat)
    freezeDeep(baked)
    return baked
  }
  Object.assign(root, flat)
  freezeDeep(root)
  return theme
}

function isDeepFrozen(value: unknown, seen = new Set<object>()): boolean {
  if (value === null || typeof value !== "object") return true
  if (!Object.isFrozen(value)) return false
  if (seen.has(value)) return true
  seen.add(value)
  return Object.values(value as Record<string, unknown>).every((child) => isDeepFrozen(child, seen))
}

function walk(
  node: Record<string, unknown>,
  path: string[],
  flat: Record<string, unknown>,
  rule: FlattenRule,
): void {
  for (const key of Object.keys(node)) {
    // Existing flat aliases are derived output, never input to the next bake.
    if (path.length === 0 && key.includes("-")) continue

    const value = node[key]
    const subpath = [...path, key]

    const flatKey = rule(subpath)
    if (flatKey !== null) {
      if (!isTerminalColorLeaf(value)) throw unsupportedColorLeaf(subpath, value)
      flat[flatKey] = value
      continue
    }

    if (value && typeof value === "object" && !Array.isArray(value)) {
      walk(value as Record<string, unknown>, subpath, flat, rule)
    }
  }
}

function freezeDeep(o: unknown, seen = new Set<object>()): void {
  if (o === null || typeof o !== "object") return
  if (seen.has(o)) return
  seen.add(o)
  Object.freeze(o)
  for (const k of Object.keys(o as object)) {
    freezeDeep((o as Record<string, unknown>)[k], seen)
  }
}
