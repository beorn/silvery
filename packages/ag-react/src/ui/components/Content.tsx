import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react"
import { createLogger } from "loggily"
import { Box } from "../../components/Box"
import {
  contentNode,
  contentText,
  DocumentTable as DataTable,
  type Column as DataTableColumn,
  type MeasuredContent,
} from "../../components/Table"
import { Text } from "../../components/Text"
import { useOnBoxRectCommitted } from "../../hooks/useLayout"
import { type Breakpoint, DEFAULT_BREAKPOINTS } from "../../hooks/useResponsiveValue"
import { useTerm } from "../../hooks/useTerm"
import { densityForWidth } from "../density"
import { computeRowSideGeometry } from "./content-row-geometry"

type TableAlignment = "left" | "right" | "center" | null

export type ContentResponsive<T> = T | ({ default: T } & Partial<Record<Breakpoint, T>>)
export type ContentWidthValue = number | `${number}%`
export type ContentBodyWidth = "prose" | "wide" | "full" | "auto"

export type ContentBodyProps = {
  children: React.ReactNode
  width?: ContentBodyWidth
  backgroundColor?: string
  /**
   * Inner-edge left padding inside the resolved lane. Used when a visual group
   * indents rows but the indent must still count against the lane budget.
   */
  paddingLeft?: number
  /**
   * Inner-edge right padding inside the resolved lane.
   */
  paddingRight?: number
}

export type ContentLayoutContextValue = {
  available: number
  prose: number
  wide: number
  full: number
  align: "start" | "center" | "stretch"
  gap: number
  /** Minimum left/right prose gutters in cells, normalized by Content.Layout. */
  gutterMinWidth: { readonly left: number; readonly right: number }
}

const DEFAULT_CONTEXT: ContentLayoutContextValue = {
  available: 0,
  prose: 96,
  wide: 120,
  full: 0,
  align: "start",
  gap: 1,
  gutterMinWidth: { left: 1, right: 1 },
}

const layoutLog = createLogger("silvery:content-layout")
const ContentContext = createContext<ContentLayoutContextValue | null>(null)
const ContentRowContext = createContext<{ available: number } | null>(null)

function contentSideSpacingForWidth(width: number): {
  readonly sideGapCells: 0 | 1
  readonly sideSlotMaxWidthCells: 0 | 8
} {
  if (densityForWidth(width) === "compact") {
    return { sideGapCells: 0, sideSlotMaxWidthCells: 0 }
  }
  return { sideGapCells: 1, sideSlotMaxWidthCells: 8 }
}

function resolveResponsive<T>(values: ContentResponsive<T>, width: number): T {
  if (typeof values !== "object" || values === null || !("default" in values)) return values as T
  if (width >= DEFAULT_BREAKPOINTS.xl && values.xl !== undefined) return values.xl
  if (width >= DEFAULT_BREAKPOINTS.lg && values.lg !== undefined) return values.lg
  if (width >= DEFAULT_BREAKPOINTS.md && values.md !== undefined) return values.md
  if (width >= DEFAULT_BREAKPOINTS.sm && values.sm !== undefined) return values.sm
  if (width >= DEFAULT_BREAKPOINTS.xs && values.xs !== undefined) return values.xs
  return values.default
}

function resolveWidth(value: ContentWidthValue, available: number): number {
  if (typeof value === "number") return Math.max(1, Math.min(value, available || value))
  const pct = Number(value.slice(0, -1))
  if (!Number.isFinite(pct)) return available
  return Math.max(1, Math.floor((available * pct) / 100))
}

export function useContentLayout(): ContentLayoutContextValue {
  return useContext(ContentContext) ?? DEFAULT_CONTEXT
}

export function useHasContentLayout(): boolean {
  return useContext(ContentContext) !== null
}

/**
 * The resolved width of the rendered row middle a descendant is laid
 * out inside — the value `Content.Row` puts on `ContentRowContext`.
 *
 * This is the lane-true width: it reflects committed row geometry and
 * shrinks when the surrounding container is narrower than the declared pane.
 *
 * Returns `0` before the row's geometry is measured. Callers that need a
 * non-zero width on the first paint should fall back to
 * `useContentLayout().prose` when this returns `0`.
 */
export function useContentRowWidth(): number {
  return useContext(ContentRowContext)?.available ?? 0
}

export function useResponsiveContent<T>(values: ContentResponsive<T>): T {
  const ctx = useContentLayout()
  return resolveResponsive(values, ctx.available)
}

function laneJustify(
  align: ContentLayoutContextValue["align"],
): "flex-start" | "center" | undefined {
  if (align === "center") return "center"
  return "flex-start"
}

/**
 * Declares a pane's available logical width from host-owned inputs.
 * Content.Layout reads this instead of measuring its own rectangle.
 *
 * Without a provider, Layout uses the active renderer surface width. This
 * keeps standalone consumers working without extra setup.
 */
const PaneSizeContext = createContext<{ paneCols: number } | null>(null)

export function PaneSize({
  paneCols,
  children,
}: {
  paneCols: number
  children: React.ReactNode
}): React.ReactElement {
  const value = useMemo(() => ({ paneCols }), [paneCols])
  return <PaneSizeContext.Provider value={value}>{children}</PaneSizeContext.Provider>
}

/**
 * Re-provides `PaneSize` at this subtree's committed width, clamped so it
 * never exceeds the inherited declaration.
 *
 * The declaration seeds the first paint. A commit-boundary measurement may
 * narrow it after a host subdivides the pane, preventing content from wrapping
 * to a wider lane than the geometry it actually occupies.
 */
export function MeasuredPaneScope({ children }: { children: React.ReactNode }): React.ReactElement {
  const paneCtx = useContext(PaneSizeContext)
  const termCols = useTerm((t) => t.size.cols())
  const declared = paneCtx?.paneCols ?? termCols
  const [measured, setMeasured] = useState(0)
  useOnBoxRectCommitted((rect) => {
    if (rect.width > 0) setMeasured(rect.width)
  })
  const paneCols = measured > 0 ? Math.min(declared, measured) : declared
  return (
    // flex-ceremony-ok: must shrink with the pane so the measured width is the
    // real paint, not the declared paneCols (that measurement is the point).
    <Box flexDirection="column" width="100%" minWidth={0} flexGrow={1} flexShrink={1} minHeight={0}>
      <PaneSize paneCols={paneCols}>{children}</PaneSize>
    </Box>
  )
}

function Layout({
  children,
  fill = true,
  prose = 96,
  wide = 120,
  align = "center",
  gap = 1,
  gutterMinWidth = 1,
}: {
  children?: React.ReactNode
  fill?: boolean
  prose?: ContentResponsive<ContentWidthValue>
  wide?: ContentResponsive<ContentWidthValue>
  align?: ContentResponsive<"start" | "center" | "stretch">
  gap?: number
  /** Minimum prose gutters; a number applies to both sides. Default `1`. */
  gutterMinWidth?: number | ContentLayoutContextValue["gutterMinWidth"]
}): React.ReactElement {
  // Declarative paneCols — from PaneSize context if the host provides it,
  // else fall back to the active surface width. NO useBoxRect read; ctx is correct
  // from frame 0, eliminating the 0→N transition that produced the
  // flush-left-on-first-paint class of regressions.
  // Bead: @km/silvery/responsive-layout-architecture-reframe Phase B.3.
  const paneCtx = useContext(PaneSizeContext)
  const termCols = useTerm((t) => t.size.cols())
  const paneCols = paneCtx?.paneCols ?? termCols

  // Memoize the context value so its identity is stable when none of its
  // inputs change. Without memoization, every parent re-render produces a
  // new object identity and every consumer of `useContentLayout()` re-renders
  // even when the resolved widths haven't changed.
  const value: ContentLayoutContextValue = useMemo(
    () => ({
      available: paneCols,
      prose: resolveWidth(resolveResponsive(prose, paneCols), paneCols),
      wide: resolveWidth(resolveResponsive(wide, paneCols), paneCols),
      full: paneCols,
      align: resolveResponsive(align, paneCols),
      gap,
      gutterMinWidth:
        typeof gutterMinWidth === "number"
          ? { left: gutterMinWidth, right: gutterMinWidth }
          : gutterMinWidth,
    }),
    [paneCols, prose, wide, align, gap, gutterMinWidth],
  )

  const lastLogKey = useRef("")
  useEffect(() => {
    const key = `${value.available}:${value.prose}:${value.wide}:${value.full}:${value.align}:${value.gap}:${value.gutterMinWidth.left}:${value.gutterMinWidth.right}`
    if (key === lastLogKey.current) return
    lastLogKey.current = key
    layoutLog.debug?.("content layout resolved (declarative)", value)
  }, [value])

  return (
    <Box
      flexDirection="column"
      alignSelf="stretch"
      width="100%"
      minWidth={0}
      flexGrow={fill ? 1 : 0}
      flexShrink={fill ? 1 : 0}
      minHeight={fill ? 0 : undefined}
    >
      <ContentContext.Provider value={value}>
        <Box
          flexDirection="column"
          alignSelf="stretch"
          width="100%"
          minWidth={0}
          flexGrow={fill ? 1 : 0}
          flexShrink={fill ? 1 : 0}
          minHeight={fill ? 0 : undefined}
        >
          {children}
        </Box>
      </ContentContext.Provider>
    </Box>
  )
}

function isElementOfType<P>(
  child: React.ReactNode,
  type: React.ComponentType<P>,
): child is React.ReactElement<P> {
  return React.isValidElement(child) && child.type === type
}

function Left({ children }: { children?: React.ReactNode }): React.ReactElement {
  return <>{children}</>
}

function Right({ children }: { children?: React.ReactNode }): React.ReactElement {
  return <>{children}</>
}

function resolveContentBodyWidth(
  width: ContentBodyWidth | undefined,
): Exclude<ContentBodyWidth, "auto"> {
  // `auto` resolves to `full` for Row sizing so the lane chooser can pick
  // any lane (prose / wide / full) from the full available width. Without
  // this, Row sized to prose (96) and the "wide" (120) lane was capped at
  // prose → no actual promotion. AutoLane itself still picks the smallest
  // fitting lane via `<Box fitWidth>`; the Row just gives it room to do so.
  // Bead: @km/code/autofit-wide-lane-for-tabular-codeblocks.
  if (width === "auto") return "full"
  return width === undefined ? "prose" : width
}

/**
 * Pure helper: derive the lane set for `<Content.Body width="auto">` from a
 * Content layout context. Lanes are sorted ascending and de-duplicated so
 * flexily's `fitWidth` "smallest fitting lane" pick is unambiguous.
 *
 * Bead: @km/silvery/responsive-layout-architecture-reframe (Phase A0.2 —
 * the lane-snap targets come from the existing `ContentContext`, not from
 * new constants).
 *
 * No-fallbacks: if no lane width resolves to a positive number we throw
 * at construction. Silent best-effort would hide a misconfigured
 * `Content.Layout` (or an auto-lane consumer placed outside a
 * `Content.Layout`).
 */
function autoLaneWidths(prose: number, wide: number, full: number): number[] {
  const lanes = [prose, wide, full].filter(
    (w): w is number => typeof w === "number" && Number.isFinite(w) && w > 0,
  )
  const unique = Array.from(new Set(lanes)).sort((a, b) => a - b)
  if (unique.length === 0) {
    throw new Error(
      'Content.Body width="auto": no positive lane widths resolved from ' +
        `ContentContext (prose=${prose}, wide=${wide}, full=${full}). ` +
        "Ensure the body is rendered inside a <Content.Layout> with valid prose/wide widths.",
    )
  }
  return unique
}

type RowSlots = {
  left: React.ReactNode[]
  right: React.ReactNode[]
  middle: React.ReactNode[]
}

type RowLaneFlags = {
  hasDirectProseLane: boolean
  hasDirectFullLane: boolean
  hasDirectWideLane: boolean
  hasDirectFullBody: boolean
  hasDirectWideBody: boolean
  hasDirectProseBody: boolean
}

function splitRowSlots(children: React.ReactNode): RowSlots {
  const slots: RowSlots = { left: [], right: [], middle: [] }
  for (const child of React.Children.toArray(children)) {
    if (isElementOfType(child, Left)) slots.left.push(child.props.children)
    else if (isElementOfType(child, Right)) slots.right.push(child.props.children)
    else slots.middle.push(child)
  }
  return slots
}

function rowLaneFlags(middle: readonly React.ReactNode[]): RowLaneFlags {
  return {
    hasDirectProseLane: middle.some((child) => isElementOfType(child, ProseLane)),
    hasDirectFullLane: middle.some((child) => isElementOfType(child, Full)),
    hasDirectWideLane: middle.some((child) => isElementOfType(child, Wide)),
    hasDirectFullBody: middle.some(
      (child) =>
        isElementOfType<ContentBodyProps>(child, Body) &&
        resolveContentBodyWidth(child.props.width) === "full",
    ),
    hasDirectWideBody: middle.some(
      (child) =>
        isElementOfType<ContentBodyProps>(child, Body) &&
        resolveContentBodyWidth(child.props.width) === "wide",
    ),
    hasDirectProseBody: middle.some(
      (child) =>
        isElementOfType<ContentBodyProps>(child, Body) &&
        resolveContentBodyWidth(child.props.width) === "prose",
    ),
  }
}

function resolveRowLaneWidth(ctx: ContentLayoutContextValue, flags: RowLaneFlags): number {
  if (flags.hasDirectFullLane || flags.hasDirectFullBody) {
    return ctx.full || ctx.available || ctx.wide
  }
  if (flags.hasDirectProseLane || flags.hasDirectProseBody) return ctx.prose
  return ctx.wide
}

function rowMiddleSelfAligns(flags: RowLaneFlags): boolean {
  return (
    flags.hasDirectProseLane ||
    flags.hasDirectWideLane ||
    flags.hasDirectFullLane ||
    flags.hasDirectProseBody ||
    flags.hasDirectWideBody ||
    flags.hasDirectFullBody
  )
}

function Row({
  children,
  align,
}: {
  children: React.ReactNode
  align?: ContentLayoutContextValue["align"]
}): React.ReactElement {
  const ctx = useContentLayout()
  const rowAlign = align ?? ctx.align
  const { left, right, middle } = splitRowSlots(children)
  const laneFlags = rowLaneFlags(middle)
  const {
    hasDirectProseLane,
    hasDirectFullLane,
    hasDirectWideLane,
    hasDirectFullBody,
    hasDirectWideBody,
    hasDirectProseBody,
  } = laneFlags
  const laneWidth = resolveRowLaneWidth(ctx, laneFlags)
  const available = ctx.available > 0 ? ctx.available : laneWidth
  const paneChrome = contentSideSpacingForWidth(available)
  const hasSideSlots = left.length > 0 || right.length > 0
  const sideGeometry = computeRowSideGeometry({
    available,
    hasSideSlots,
    sideGapCells: paneChrome.sideGapCells,
    sideSlotMaxWidthCells: paneChrome.sideSlotMaxWidthCells,
  })
  const { sideGap, sideSlotWidth, sideReserve } = sideGeometry
  const middleAvailable = ctx.available > 0 ? sideGeometry.middleAvailable : laneWidth
  const width = ctx.available > 0 ? Math.min(laneWidth, middleAvailable) : laneWidth
  const middleSelfAligns = rowMiddleSelfAligns(laneFlags)
  const middleWidth = hasSideSlots ? width : middleSelfAligns ? middleAvailable : width
  const occupiedWidth = width + sideReserve
  const leftMargin =
    rowAlign === "center" ? Math.max(0, Math.floor((available - occupiedWidth) / 2)) : 0
  const rightMargin =
    rowAlign === "center" ? Math.max(0, available - occupiedWidth - leftMargin) : 0
  const leftSpacer = rowAlign === "center" && (hasSideSlots || !middleSelfAligns) ? leftMargin : 0
  const rightSpacer = rowAlign === "center" && (hasSideSlots || !middleSelfAligns) ? rightMargin : 0
  const usesMeasuredGeometry = ctx.available > 0
  const lastLogKey = useRef("")
  useEffect(() => {
    const key = [
      ctx.available,
      ctx.prose,
      ctx.wide,
      rowAlign,
      laneWidth,
      middleAvailable,
      width,
      middleWidth,
      leftMargin,
      rightMargin,
      sideGap,
      sideReserve,
      sideSlotWidth,
      left.length,
      right.length,
      middle.length,
      hasSideSlots,
      hasDirectProseLane,
      hasDirectWideLane,
      hasDirectFullLane,
      hasDirectProseBody,
      hasDirectWideBody,
      hasDirectFullBody,
      usesMeasuredGeometry,
    ].join(":")
    if (key === lastLogKey.current) return
    lastLogKey.current = key
    layoutLog.debug?.("content row resolved", {
      available,
      rowAlign,
      laneWidth,
      middleAvailable,
      width,
      middleWidth,
      occupiedWidth,
      leftMargin,
      rightMargin,
      leftSpacer,
      rightSpacer,
      sideGap,
      sideReserve,
      sideSlotWidth,
      leftCount: left.length,
      rightCount: right.length,
      middleCount: middle.length,
      hasSideSlots,
      middleSelfAligns,
      hasDirectProseLane,
      hasDirectWideLane,
      hasDirectFullLane,
      hasDirectProseBody,
      hasDirectWideBody,
      hasDirectFullBody,
      usesMeasuredGeometry,
    })
  }, [
    available,
    ctx.available,
    ctx.prose,
    ctx.wide,
    hasDirectFullBody,
    hasDirectFullLane,
    hasDirectProseBody,
    hasDirectProseLane,
    hasSideSlots,
    hasDirectWideBody,
    hasDirectWideLane,
    laneWidth,
    left.length,
    leftMargin,
    leftSpacer,
    middle.length,
    middleAvailable,
    middleSelfAligns,
    middleWidth,
    occupiedWidth,
    right.length,
    rightMargin,
    rightSpacer,
    rowAlign,
    sideGap,
    sideReserve,
    sideSlotWidth,
    usesMeasuredGeometry,
    width,
  ])
  // Stable React tree across all measurement states. The previous code
  // had a structural branch on `usesMeasuredGeometry` (= `ctx.available > 0`)
  // — when `available` flipped between 0 and a measured value during the
  // post-resize cascade, this Row torn down its subtree and rebuilt it,
  // which reset every descendant useBoxRect measurement and cascaded
  // through ContentContext consumers. Bead:
  // `@km/code/post-resize-ui-stability`.
  //
  // Same tree always. Width-derived ternaries above (`available`,
  // `middleAvailable`, `width`) feed in the resolved values so the layout
  // is correct in both pre-measurement (=0 → laneWidth fallback) and
  // measured (>0 → real available) states. ContentRowContext value of 0
  // when not measured is provided as before for downstream lanes that
  // care.
  const middleAvailableForRow = usesMeasuredGeometry ? middleWidth : 0
  // Stop propagating measured pixel widths upward through `width=`. Silvery
  // expert audit (2026-05-06, bead `@km/code/post-resize-ui-stability`)
  // identified `width={middleWidth}` as the load-bearing feedback edge: an
  // explicit `width` on a flex child changes its main-axis basis, which
  // changes the row's intrinsic size, which the parent's flexbox re-uses on
  // the next convergence pass — visible as the 96↔120 oscillation in the
  // STRICT log. Switching to `maxWidth` (a hint, not authoritative width)
  // lets flexily own the final resolved width and breaks the prop-value
  // feedback edge that survived the Phase 3 stable-tree fix.
  const middleNode = (
    <ContentRowContext.Provider value={{ available: middleAvailableForRow }}>
      <Box
        flexDirection="row"
        flexGrow={1}
        maxWidth={usesMeasuredGeometry ? middleWidth : "100%"}
        minWidth={0}
      >
        {middle}
      </Box>
    </ContentRowContext.Provider>
  )
  const leftSlot =
    usesMeasuredGeometry && hasSideSlots && sideSlotWidth > 0 ? (
      <Box
        width={sideSlotWidth}
        minWidth={0}
        flexDirection="row"
        justifyContent="flex-end"
        overflow="hidden"
      >
        {left}
      </Box>
    ) : null
  const rightSlot =
    usesMeasuredGeometry && hasSideSlots && sideSlotWidth > 0 ? (
      <Box
        width={sideSlotWidth}
        minWidth={0}
        flexDirection="row"
        justifyContent="flex-start"
        overflow="hidden"
      >
        {right}
      </Box>
    ) : null
  const showSpacers = usesMeasuredGeometry && rowAlign === "center"
  return (
    <Box flexDirection="row" alignSelf="stretch" width="100%" minWidth={0} flexShrink={0}>
      {showSpacers && leftSpacer > 0 ? <Box width={leftSpacer} minWidth={0} /> : null}
      {leftSlot}
      {leftSlot && sideGap > 0 ? <Box width={sideGap} minWidth={0} /> : null}
      {middleNode}
      {rightSlot && sideGap > 0 ? <Box width={sideGap} minWidth={0} /> : null}
      {rightSlot}
      {showSpacers && rightSpacer > 0 ? <Box width={rightSpacer} minWidth={0} /> : null}
    </Box>
  )
}

function ProseLane({ children }: { children: React.ReactNode }): React.ReactElement {
  const row = useContext(ContentRowContext)
  const ctx = useContentLayout()
  const available = row?.available ?? ctx.available
  // The configured floor (default 1, see ContentLayoutContextValue.gutterMinWidth)
  // still degrades to 0 below the same `available > 2` threshold the
  // original 1-cell floor used — a pane too narrow for even one blank
  // column on each side is narrower than any realistic document surface,
  // and this is the one degrade `DocumentView` does NOT opt out of: it
  // only ever asks for a WIDER floor, never a different threshold.
  const leftGutter = available > 2 ? ctx.gutterMinWidth.left : 0
  const rightGutter = available > 2 ? ctx.gutterMinWidth.right : 0
  const proseWidth =
    available > 0
      ? Math.max(1, Math.min(ctx.prose, available - leftGutter - rightGutter))
      : ctx.prose
  const lane = (
    <Box flexDirection="row" width="100%" minWidth={0}>
      <Box
        width={leftGutter}
        flexGrow={1}
        flexBasis={leftGutter}
        flexShrink={0}
        minWidth={leftGutter}
      />
      {/*
        `maxWidth="100%"`, not `maxWidth={proseWidth}` — the pair is
        `min(proseWidth, 100%)` and the second half is load-bearing
        (@km/tui/22752).

        `proseWidth` derives from `paneCols`, which is the PANE's width. An
        ancestor `<Box paddingLeft paddingRight>` shrinks the real containing
        block without changing paneCols, so the lane came out `2 × padding`
        too wide: text was laid out to `proseWidth`, the paint clipped at the
        parent, and a word straddling the boundary silently lost its last
        character. Measured at ~11% of terminal widths — sparse precisely
        because it needs a word to end across the overflow.

        A percentage fixes it because it resolves against the actual
        containing block, padding already subtracted, and it stays correct
        from frame 0 — no `useBoxRect` read, so this keeps the declarative
        property that `Layout` deliberately avoids measurement for.
      */}
      <Box flexDirection="column" width={proseWidth} maxWidth="100%" minWidth={0}>
        {children}
      </Box>
      <Box
        width={rightGutter}
        flexGrow={1}
        flexBasis={rightGutter}
        flexShrink={0}
        minWidth={rightGutter}
      />
    </Box>
  )
  if (row) {
    return (
      <Box flexDirection="row" width="100%" justifyContent={laneJustify(ctx.align)} minWidth={0}>
        {lane}
      </Box>
    )
  }
  return (
    <Box flexDirection="row" width="100%" justifyContent={laneJustify(ctx.align)} minWidth={0}>
      {lane}
    </Box>
  )
}

function Wide({ children }: { children: React.ReactNode }): React.ReactElement {
  // Single React tree across all measurement states — no structural branch on
  // `available > 0` (the previous code added/removed `ContentRowContext.Provider`
  // between paints, which the post-resize-ui-stability investigation identified
  // as the same anti-pattern as Row's old `usesMeasuredGeometry` branch — every
  // `0 → N` transition tore down the lane subtree and reset descendant
  // measurements). Width control switches from authoritative `width={width}` to
  // `maxWidth={width}`; Silvery's default shrink lets flexily own the final
  // resolved width. flexily clamps `maxWidth=120` to parent width when the
  // container is narrower than the wide lane.
  // Bead: @km/code/codeblock-flush-left-not-centered (#undead 2026-05-12).
  const ctx = useContentLayout()
  const row = useContext(ContentRowContext)
  const available = row?.available ?? ctx.available
  const width = available > 0 ? Math.min(ctx.wide, Math.max(1, available - 2)) : ctx.wide
  return (
    <Box
      data-component="content-lane-wide-outer"
      flexDirection="row"
      width="100%"
      justifyContent={laneJustify(ctx.align)}
      minWidth={0}
    >
      <ContentRowContext.Provider value={{ available: width }}>
        {/* overflow="hidden" mirrors the Full lane (below): non-wrapping content
            wider than the lane (long code lines, unbreakable tokens, base64
            image blobs) clips at the lane edge instead of overflowing. Without
            it, such a child trips strictLayoutOverflowCheck and hard-crashes the
            UI under SILVERY_STRICT=2 ("Layout overflow: … content-lane-wide-inner
            … silvery-text"). The strict check exempts overflow:hidden|scroll
            parents. Regression: tests/regressions/content-lane-sizing-safety-class. */}
        <Box
          data-component="content-lane-wide-inner"
          flexDirection="column"
          maxWidth={width}
          minWidth={0}
          overflow="hidden"
        >
          {children}
        </Box>
      </ContentRowContext.Provider>
    </Box>
  )
}

function Full({ children }: { children: React.ReactNode }): React.ReactElement {
  const row = useContext(ContentRowContext)
  const ctx = useContentLayout()
  const available = row?.available ?? ctx.available
  const gutterWidth = available > 2 ? 1 : 0
  return (
    <Box data-component="content-lane-full-outer" flexDirection="row" width="100%" minWidth={0}>
      {gutterWidth > 0 ? (
        <Box width={gutterWidth} flexShrink={0}>
          <Text> </Text>
        </Box>
      ) : null}
      <Box
        data-component="content-lane-full-inner"
        flexDirection="column"
        flexGrow={1}
        flexBasis={0}
        minWidth={0}
        overflow="hidden"
      >
        {children}
      </Box>
      {gutterWidth > 0 ? (
        <Box width={gutterWidth} flexShrink={0}>
          <Text> </Text>
        </Box>
      ) : null}
    </Box>
  )
}

function Body({
  children,
  width = "prose",
  backgroundColor,
  paddingLeft,
  paddingRight,
}: ContentBodyProps): React.ReactElement {
  // Wrap in (padding) → (backgroundColor) layers when either is set.
  // Mirror the existing backgroundColor pattern; padding goes outside so
  // the bg fills the padded area too (consistent with tank-fill semantics
  // on prose surfaces — the gutters are part of the lane, not outside
  // it).
  let body: React.ReactNode = children
  if (
    (paddingLeft !== undefined && paddingLeft > 0) ||
    (paddingRight !== undefined && paddingRight > 0)
  ) {
    body = (
      <Box
        flexDirection="column"
        width="100%"
        minWidth={0}
        paddingLeft={paddingLeft !== undefined && paddingLeft > 0 ? paddingLeft : undefined}
        paddingRight={paddingRight !== undefined && paddingRight > 0 ? paddingRight : undefined}
      >
        {body}
      </Box>
    )
  }
  if (backgroundColor !== undefined) {
    body = (
      <Box flexDirection="column" width="100%" minWidth={0} backgroundColor={backgroundColor}>
        {body}
      </Box>
    )
  }
  // width="auto" snaps the body's inline-size to the smallest fitting lane
  // (prose / wide / full) via flexily's engine-resolved `fitWidth` Box
  // prop. Replaces the previous caller-supplied numeric width hint with
  // intrinsic-driven snap, in a single layout pass.
  // Bead: @km/silvery/responsive-layout-architecture-reframe (Phase A0.2/B).
  if (width === "auto") return <AutoLane>{body}</AutoLane>
  const resolved = resolveContentBodyWidth(width)
  if (resolved === "full") return <Full>{body}</Full>
  if (resolved === "wide") return <Wide>{body}</Wide>
  return <ProseLane>{body}</ProseLane>
}

/**
 * AutoLane — lane-snapping wrapper used by `<Content.Body width="auto">`.
 *
 * Pulls the lane-snap targets from the surrounding `Content.Layout`
 * context (`ctx.prose`, `ctx.wide`, `ctx.full || row.available`) and
 * delegates the snap to flexily's engine-resolved `fitWidth` Box prop —
 * the layout engine picks the smallest fitting lane in a single pass, no
 * React round-trip. The outer Box mirrors `ProseLane` / `Wide` / `Full`'s
 * row-justify shape so the chosen lane lays out under the same alignment
 * policy as the static lanes.
 *
 * Internal — `<Content.Auto>` is no longer exported. New consumers reach
 * for `<Content.Body width="auto">`; advanced cases that need lane
 * semantics outside Content reach for `<Box fitWidth>` directly.
 *
 * Bead: @km/silvery/responsive-layout-architecture-reframe (Phase A0.2/B).
 */
function AutoLane({ children }: { children: React.ReactNode }): React.ReactElement {
  const ctx = useContentLayout()
  const row = useContext(ContentRowContext)
  const available = row?.available ?? ctx.available
  // Lane set: [prose, wide, full]. flexily picks the smallest lane that
  // fits the content's intrinsic width via `fitWidth`. Content that fits
  // in wide (120) stays in wide (centered); content wider than wide
  // promotes to full. Per user 2026-05-11 12:54: "wide-lane should
  // promote to wide or full depending".
  //
  // `ctx.full` is the layout's full-lane cap (set to `available` by
  // Layout); when it's 0 (no measurement yet), fall back to the row's
  // available width or `ctx.wide` so the lane set always has a
  // non-degenerate largest entry.
  // The effective content cap reserves one pane-edge cell on each side
  // when auto promotes to the full available width.
  // Bead: @km/code/autofit-wide-lane-for-tabular-codeblocks.
  const fullCap = available > 0 ? available : ctx.full || ctx.wide
  const paneContentCap = fullCap > 2 ? fullCap - 2 : fullCap
  const lanes = autoLaneWidths(
    Math.min(ctx.prose, paneContentCap),
    Math.min(ctx.wide, paneContentCap),
    paneContentCap,
  )
  // The visible-tree shape mirrors AutoFit's prior wrap: outer row sets
  // justifyContent so the column claims the row's main-axis; inner column
  // claims the row's full width and lets `alignSelf` on a fitWidth child
  // do the cross-axis (horizontal) centering. Without the column wrap,
  // alignSelf on a child inside the row would map to vertical alignment.
  //
  // The inner column also propagates the parent's available width down to
  // fitWidth's max-content read — without it, fitWidth measures unconstrained
  // but the children's wrap behavior interacts with `width="100%"` ancestors,
  // and the lane choice can disagree with the visible-tree width. The
  // explicit column wrap is the same shape AutoFit shipped — it works.
  const innerAlignSelf = ctx.align === "center" && available > 0 ? "center" : "flex-start"
  return (
    <Box
      data-component="content-lane-auto-outer"
      flexDirection="row"
      width="100%"
      justifyContent={laneJustify(ctx.align)}
      minWidth={0}
    >
      <Box flexDirection="column" width="100%" minWidth={0}>
        <Box
          fitWidth={lanes}
          flexDirection="column"
          alignSelf={innerAlignSelf}
          maxWidth="100%"
          minWidth={0}
        >
          <Box flexDirection="column" minWidth={0}>
            {children}
          </Box>
        </Box>
      </Box>
    </Box>
  )
}

type TableProps = {
  /** Column headers; a `{ text, node }` header renders `node` and measures `text`. */
  headers: readonly MeasuredContent[]
  /** Body cells; a `{ text, node }` cell renders `node` and measures `text`. */
  rows: readonly (readonly MeasuredContent[])[]
  alignments?: TableAlignment[]
}

type TableGridProps = TableProps & {
  widths?: number[]
  layout?: "grid" | "auto" | "blocks"
}

function TableRoot({ headers, rows, alignments = [] }: TableProps): React.ReactElement {
  return <TableGridRoot headers={headers} rows={rows} alignments={alignments} layout="auto" />
}

function TableGridRoot({
  headers,
  rows,
  alignments = [],
  widths,
  layout = "grid",
}: TableGridProps): React.ReactElement {
  const availableWidth = useContentRowWidth()
  const columns: DataTableColumn<readonly MeasuredContent[]>[] = headers.map(
    (header, columnIndex) => {
      const width = widths?.[columnIndex]
      return {
        header,
        render: (row) => contentNode(row[columnIndex] ?? ""),
        // Without this the width allocator sees a node and measures nothing,
        // collapsing the track to its header.
        measure: (row) => contentText(row[columnIndex] ?? ""),
        align: alignments[columnIndex] ?? undefined,
        width: width === undefined ? undefined : width + 2,
        minWidth: 3,
        shrink: true,
      }
    },
  )
  return (
    <DataTable
      columns={columns}
      data={rows}
      cellWrap="wrap"
      rowSeparators
      headerColor="$fg"
      layout={layout}
      availableWidth={availableWidth > 0 ? availableWidth : undefined}
    />
  )
}

function TableBlocksRoot({ headers, rows }: TableProps): React.ReactElement {
  return <TableGridRoot headers={headers} rows={rows} layout="blocks" />
}

const Table = Object.assign(TableRoot, {
  Grid: TableGridRoot,
  Blocks: TableBlocksRoot,
})

function Aside({
  children,
  side = "left",
  show = true,
  paddingTop = 0,
}: {
  children: React.ReactNode
  side?: "left" | "right"
  show?: boolean
  paddingTop?: number
}): React.ReactElement | null {
  if (!show) return null
  const node = (
    <Text color="$fg-muted" flexShrink={1} wrap="truncate">
      {children}
    </Text>
  )
  return (
    // flex-ceremony-ok: aside labels truncate inside measured side slots instead of pushing prose.
    <Box
      flexShrink={1}
      minWidth={0}
      paddingLeft={side === "right" ? 1 : 0}
      paddingRight={side === "left" ? 1 : 0}
      paddingTop={paddingTop}
    >
      {node}
    </Box>
  )
}

export const Content = {
  Layout,
  Row,
  Left,
  Body,
  Table,
  Aside,
  MeasuredPaneScope,
}
