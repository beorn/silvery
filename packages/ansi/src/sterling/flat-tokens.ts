/**
 * Canonical list of flat hyphen-keys Sterling emits. Mirrors the `FlatToken`
 * string-literal union in `types.ts`. Surfaced in `sterling.shape.flatTokens`
 * for tooling (docs, storybook, CSS export).
 *
 * The list is maintained here (not derived from a walk over a sample Theme)
 * so that type exports, runtime iteration, and doc generation all read the
 * same source. Keep this list in sync with {@link FlatToken} in `types.ts`
 * and the `defaultFlattenRule` behaviour in `@silvery/ansi`.
 */

import type { FlatToken } from "./types.ts"

export const STERLING_FLAT_TOKENS: readonly FlatToken[] = [
  // Surface
  "bg-surface-default",
  "bg-surface-subtle",
  "bg-surface-raised",
  "bg-surface-overlay",
  "bg-surface-hover",
  // Border
  "border-default",
  "border-focus",
  "border-muted",
  // Cursor
  "fg-cursor",
  "bg-cursor",
  // Muted
  "fg-muted",
  "bg-muted",
  // Accent — link-like interactive text, keeps fg state variants
  "fg-accent",
  "bg-accent",
  "fg-on-accent",
  "fg-accent-hover",
  "bg-accent-hover",
  "fg-accent-active",
  "bg-accent-active",
  "border-accent",
  // Info — status role; bg state only
  "fg-info",
  "bg-info",
  "fg-on-info",
  "bg-info-hover",
  "bg-info-active",
  // Success — status role; bg state only
  "fg-success",
  "bg-success",
  "fg-on-success",
  "bg-success-hover",
  "bg-success-active",
  // Warning — status role; bg state only
  "fg-warning",
  "bg-warning",
  "fg-on-warning",
  "bg-warning-hover",
  "bg-warning-active",
  // Error — status role; bg state only
  "fg-error",
  "bg-error",
  "fg-on-error",
  "bg-error-hover",
  "bg-error-active",
  // Selected — highlight surface
  "bg-selected",
  "fg-on-selected",
  "bg-selected-hover",
  // Inverse — flipped surface (status bar, modal chrome)
  "bg-inverse",
  "fg-on-inverse",
  // Link — hyperlink text color
  "fg-link",
  // Disabled — neutral deemphasis for unavailable controls
  "fg-disabled",
  "bg-disabled",
  "border-disabled",
  // Backdrop — modal/dialog scrim (distinct from bg-surface-overlay)
  "bg-backdrop",
  // Default surfaces — explicit public aliases for the unstyled canvas
  "fg-default",
  "bg-default",
]
