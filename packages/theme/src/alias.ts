/**
 * Token aliasing — resolve token values that reference other tokens.
 *
 * Supports alias chains (e.g. $button -> $primary -> #EBCB8B) with a
 * depth limit to prevent infinite loops from circular references.
 */

import type { Theme } from "@silvery/ansi"

/** Maximum depth for alias chain resolution before treating as circular. */
const MAX_ALIAS_DEPTH = 10

/**
 * Resolve all token aliases in a theme.
 *
 * Token values that start with `$` are treated as references to other tokens.
 * Alias chains are followed until a concrete (non-$) value is reached.
 * Circular references are detected via a depth limit and left unresolved.
 *
 * @param theme - A theme-like object where values may reference other tokens via `$name`
 * @returns A new object with all aliases resolved to concrete values
 *
 * @example
 * ```typescript
 * const themed = resolveAliases({
 *   ...baseTheme,
 *   button: "$primary",      // resolves to the value of 'primary'
 *   buttonHover: "$button",  // chain: buttonHover -> button -> primary -> hex
 * })
 * ```
 */
export function resolveAliases(theme: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {}

  for (const key of Object.keys(theme)) {
    result[key] = resolveAlias(key, theme, 0)
  }

  return result
}

/**
 * Resolve a single token's alias chain.
 *
 * @param key - The token key to resolve
 * @param tokens - The full token map
 * @param depth - Current recursion depth (for loop detection)
 * @returns The resolved concrete value, or the raw alias string if unresolvable
 */
function resolveAlias(key: string, tokens: Record<string, string>, depth: number): string {
  if (depth >= MAX_ALIAS_DEPTH) return tokens[key] ?? ""

  const value = tokens[key]
  if (value === undefined) return ""

  // Not an alias — return the concrete value
  if (!value.startsWith("$")) return value

  // Strip the `$` prefix and look up the referenced token
  const refKey = value.slice(1)
  if (!(refKey in tokens)) return value // Unknown reference, return as-is

  return resolveAlias(refKey, tokens, depth + 1)
}

/**
 * Resolve a single alias value against a Theme.
 *
 * Useful for resolving individual values without processing the entire theme.
 *
 * @param value - The value to resolve (may be "$tokenName" or a concrete value)
 * @param theme - The theme to resolve against
 * @returns The resolved concrete value
 */
export function resolveTokenAlias(value: string, theme: Theme): string {
  if (!value.startsWith("$")) return value

  const seen = new Set<string>()
  let current = value

  for (let i = 0; i < MAX_ALIAS_DEPTH; i++) {
    if (!current.startsWith("$")) return current

    const key = current.slice(1) as keyof Theme
    if (seen.has(key)) return current // Circular reference
    seen.add(key)

    const resolved = theme[key]
    if (typeof resolved !== "string") return current
    current = resolved
  }

  return current
}
