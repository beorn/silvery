/**
 * Prose — text-wrapping container primitive.
 *
 * Drop-in replacement for `<Box flexDirection="column" flexShrink={1} minWidth={0}>`
 * around long-form text (markdown, paragraphs, message bodies). Encapsulates the
 * flex-chain config required for `<Text wrap="wrap">` to actually wrap at the
 * parent's available width instead of measuring at the child's max-content.
 *
 * ## Why this exists
 *
 * Flexily defaults `flex-shrink` to 0, and silvery's reconciler does not apply
 * CSS §4.5's "overflow:hidden ⇒ flex-shrink:1" inference rule. Without
 * `flexShrink={1} minWidth={0}` on every box in the chain from a fixed-width
 * ancestor down to a `<Text wrap="wrap">`, an intermediate row/column measures
 * at `sum(children.maxContent)` and the wrappable Text receives that wide
 * measure — and never wraps.
 *
 * Two silvercode commits (cdf14b59 + 363deaf6) fixed the production bug by
 * threading these props through `MarkdownView` / `DetectionText` / `AssistantBlock`.
 * `<Prose>` is the named primitive so consumers don't need to remember the
 * incantation.
 *
 * ## Usage
 *
 * ```tsx
 * <Prose>
 *   <MarkdownView source={longText} />
 * </Prose>
 *
 * <Prose gap={1} paddingX={1}>
 *   <Text wrap="wrap">{paragraph1}</Text>
 *   <Text wrap="wrap">{paragraph2}</Text>
 * </Prose>
 * ```
 *
 * ## Defaults
 *
 * - `flexDirection: "column"` — paragraphs stack vertically.
 * - `flexShrink: 1` + `minWidth: 0` — the wrap-enabling flex chain.
 *
 * Any prop can be overridden. If you set `flexDirection="row"` on Prose, the
 * children stitch horizontally with wrapping at the row level (use `flexWrap="wrap"`
 * to get visual line breaks).
 *
 * ## Anti-pattern this replaces
 *
 * ```tsx
 * // ❌ Hand-rolled — easy to forget one prop in a deeply nested chain
 * <Box flexDirection="column" flexShrink={1} minWidth={0}>
 *   <MarkdownView source={text} />
 * </Box>
 *
 * // ✅ Prose — intent is named, defaults are correct
 * <Prose>
 *   <MarkdownView source={text} />
 * </Prose>
 * ```
 */

import type { ForwardedRef, JSX, ReactNode } from "react"
import { forwardRef } from "react"
import { Box, type BoxHandle, type BoxProps } from "../../components/Box"

export interface ProseProps extends Omit<BoxProps, "children"> {
  children?: ReactNode
}

export type ProseHandle = BoxHandle

export const Prose = forwardRef(function Prose(
  props: ProseProps,
  ref: ForwardedRef<ProseHandle>,
): JSX.Element {
  // flexDirection / flexShrink / minWidth are spread first so caller props
  // can override (e.g. row layout, no-shrink for fixed-width prose blocks).
  return (
    <Box
      flexDirection="column"
      flexShrink={1}
      minWidth={0}
      {...props}
      ref={ref}
    />
  )
})
