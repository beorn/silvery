/**
 * useResponsiveBoxProps — pick a Box-prop bag based on the current viewport
 * breakpoint, with mobile-first cascade semantics.
 *
 * Canonical primitive for responsive layout in silvery. Pass either a flat
 * `Partial<BoxProps>` (no responsive variants) or a `Responsive<Partial<BoxProps>>`
 * shape with a `default` key plus optional per-breakpoint overrides. Each
 * breakpoint's variant is MERGED ON TOP of the previous (mobile-first
 * cascade), so you only specify the keys that change at each step.
 *
 * Returns a `Partial<BoxProps>` ready to spread into a `<Box>`.
 *
 * @example
 * ```tsx
 * const layout = useResponsiveBoxProps({
 *   default: { flexDirection: "column", padding: 1 },
 *   md: { flexDirection: "row", padding: 2 },
 *   lg: { padding: 3 },          // inherits flexDirection: "row" from md
 * })
 * return <Box {...layout}>{children}</Box>
 * ```
 *
 * The cascade above resolves to:
 * - `default`: `{ flexDirection: "column", padding: 1 }`
 * - `xs`:      `{ flexDirection: "column", padding: 1 }` (no xs variant — inherits default)
 * - `sm`:      `{ flexDirection: "column", padding: 1 }` (inherits)
 * - `md`:      `{ flexDirection: "row",    padding: 2 }`
 * - `lg`:      `{ flexDirection: "row",    padding: 3 }` (inherits flexDirection from md)
 * - `xl`:      `{ flexDirection: "row",    padding: 3 }` (inherits)
 *
 * Pass a flat (non-responsive) prop bag — it short-circuits without going
 * through `useResponsiveValue`:
 *
 * ```tsx
 * const layout = useResponsiveBoxProps({ flexDirection: "row" }) // returns input unchanged
 * ```
 *
 * The flat shape is detected by the absence of a `default` key. If your
 * BoxProps happen to contain a literal field named `default` (none today,
 * but future-proof), wrap as `{ default: {...} }` to disambiguate.
 *
 * Reactive on viewport-size changes — same backing store as
 * `useResponsiveValue`. See bead
 * `@km/silvery/use-deferred-box-rect-and-post-commit-observers`.
 */

import type { BoxProps } from "@silvery/ag/types"
import {
  type Breakpoint,
  type ResponsiveValues,
  useResponsiveValue,
} from "./useResponsiveValue"

/** A responsive-or-flat value of T. Either a plain T or a `{ default, xs?, sm?, ... }` cascade. */
export type Responsive<T> = T | ResponsiveValues<T>

/** Order matches `useResponsiveValue` cascade — mobile-first ascending. */
const BREAKPOINT_ORDER: readonly Breakpoint[] = ["xs", "sm", "md", "lg", "xl"]

function isResponsiveCascade<T>(v: Responsive<T>): v is ResponsiveValues<T> {
  return typeof v === "object" && v !== null && "default" in v
}

export function useResponsiveBoxProps(map: Responsive<Partial<BoxProps>>): Partial<BoxProps> {
  // Non-responsive (flat) shape: spread the props as-is, no breakpoint
  // resolution. This keeps call sites free to mix responsive and
  // non-responsive surfaces without ceremony.
  if (!isResponsiveCascade(map)) {
    return map
  }

  // Mobile-first cascade: each breakpoint variant merges on top of the
  // previous. The cascade is built up-front (cheap — at most 5 spreads of
  // small objects) so `useResponsiveValue` resolves a single field lookup.
  const cascade: ResponsiveValues<Partial<BoxProps>> = {
    default: { ...map.default },
  }
  let acc: Partial<BoxProps> = { ...map.default }
  for (const bp of BREAKPOINT_ORDER) {
    const variant = map[bp]
    if (variant !== undefined) acc = { ...acc, ...variant }
    cascade[bp] = acc
  }
  return useResponsiveValue<Partial<BoxProps>>(cascade)
}
