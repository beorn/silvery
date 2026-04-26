/**
 * Prose — text-wrapping container primitive.
 *
 * Optional typography sugar around long-form text (markdown, paragraphs,
 * message bodies). Documents intent ("this is long-form text") and provides
 * column-stacking defaults; the wrap-enablement chain is no longer required.
 *
 * ## Status: optional sugar (post CSS-defaults flip)
 *
 * silvery now uses CSS-correct flex defaults: `flexShrink: 1`,
 * `alignContent: stretch`, plus CSS §4.5 flex-item auto min-size. Wrap chains
 * work without ceremony — the historical `flexShrink={1} minWidth={0}` cascade
 * that was load-bearing under Yoga semantics is no longer needed:
 *
 * ```tsx
 * // Both work under current silvery; choose Prose for typography intent
 * <Box flexDirection="column">
 *   <MarkdownView source={text} />
 * </Box>
 *
 * <Prose>
 *   <MarkdownView source={text} />
 * </Prose>
 * ```
 *
 * ## History (2026-04 ergonomic fix)
 *
 * Before the CSS-defaults flip, flexily defaulted `flexShrink: 0` (Yoga
 * semantics). Without `flexShrink={1} minWidth={0}` on every box in the chain
 * from a fixed-width ancestor down to a `<Text wrap="wrap">`, an intermediate
 * row/column measured at `sum(children.maxContent)` and the wrappable Text
 * received that wide measure — and never wrapped. Two silvercode commits
 * (cdf14b59 + 363deaf6) and the `<Prose>` primitive worked around the gap.
 * The flip to CSS-correct defaults (km-silvery.flexshrink-flip-silvery-only,
 * 2026-04-25) plus flexily's CSS §4.5 auto min-size (km-flexily.auto-min-size-flex-items)
 * made the chain unnecessary — `<Prose>` survived as a typography primitive.
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
  return <Box flexDirection="column" flexShrink={1} minWidth={0} {...props} ref={ref} />
})
