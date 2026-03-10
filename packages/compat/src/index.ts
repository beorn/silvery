/**
 * @silvery/compat — API compatibility layers for ink and chalk.
 *
 * Not published as a separate package. Exported via the root `silvery` package:
 * - `silvery/ink` → ink-compatible API
 * - `silvery/chalk` → chalk-compatible API
 *
 * @packageDocumentation
 */

export * as ink from "./ink"
export * as chalk from "./chalk"
export { withInk } from "./with-ink"
export type { WithInkOptions, AppWithInk } from "./with-ink"
export { withInkCursor } from "./with-ink-cursor"
export type { WithInkCursorOptions, AppWithInkCursor } from "./with-ink-cursor"
export { withInkFocus } from "./with-ink-focus"
export type { WithInkFocusOptions, AppWithInkFocus } from "./with-ink-focus"
