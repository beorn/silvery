/**
 * Ink 7.0 BackgroundContext compatibility shim.
 *
 * Ink 7.0 propagates background color down the component tree via a React
 * Context (`backgroundContext`). When a `<Box backgroundColor="red">` mounts,
 * Ink wraps its children in `<backgroundContext.Provider value="red">`. The
 * `<Text>` component reads from this context with `useContext(backgroundContext)`
 * and uses the inherited value when no explicit `backgroundColor` prop is set.
 *
 * Silvery already implements background inheritance at paint-time via
 * `findInheritedBg()` in the render phase, so the observable rendered output
 * is identical without this context. However, the upstream Ink test suite
 * (Layer 1 compat) and any third-party Ink consumers that import
 * `backgroundContext` directly need this export to exist with the same shape.
 *
 * This module re-creates Ink's API surface 1:1:
 *
 *   import { createContext } from 'react'
 *   import { type LiteralUnion } from 'type-fest'
 *   import { type ForegroundColorName } from 'ansi-styles'
 *
 *   export type BackgroundColor = LiteralUnion<ForegroundColorName, string>
 *   export const backgroundContext = createContext<BackgroundColor | undefined>(undefined)
 *
 * The compat `Box` and `Text` components in `ink-components.ts` use this
 * context to thread inherited backgrounds through the React tree as explicit
 * `backgroundColor` props, which makes the upstream test suite's render path
 * (which goes through silvery's test renderer with `debug: true`) match Ink's
 * exact ANSI output for nested-background scenarios.
 *
 * @internal
 */

import { createContext } from "react"

/**
 * Ink-compatible BackgroundColor type. Matches Ink 7.0's definition exactly.
 *
 * Upstream definition from `ink/src/components/BackgroundContext.ts`:
 *   export type BackgroundColor = LiteralUnion<ForegroundColorName, string>
 *
 * `LiteralUnion<ForegroundColorName, string>` is functionally equivalent to
 * `string` for runtime purposes — the type-fest helper just gives autocomplete
 * for the well-known ANSI color names while still permitting any string
 * (hex, rgb, ansi256, etc.). We use a plain `string` here to avoid pulling
 * in `type-fest` and `ansi-styles` as direct dependencies.
 */
export type BackgroundColor = string

/**
 * Ink-compatible background color context.
 *
 * Mirrors Ink 7.0's `backgroundContext` (lowercase `b`) — the exported name
 * matches Ink exactly so consumers can `import { backgroundContext } from "@silvery/ink/ink"`.
 *
 * Default value is `undefined` (no inherited background), matching Ink.
 */
export const backgroundContext = createContext<BackgroundColor | undefined>(undefined)
