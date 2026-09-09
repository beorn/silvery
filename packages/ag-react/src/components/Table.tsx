/**
 * Generic tabular layout with one Flexily-owned track geometry path.
 *
 * The default presentation is the compact data table used by applications.
 * `frame` adds document-table chrome and wrapping without introducing another
 * width allocator: both presentations share the same tracks and cells.
 *
 * Column widths come from the shared `apportion()` allocator (@silvery/ag):
 * each track carries a [min-content, max-content] band and the measured
 * container width is distributed css-tables-3 style — shrink proportional to
 * shrinkability, floors respected, house-monotone integer rounding. When even
 * the floors do not fit, wrap-capable columns degrade legibly to
 * character-level wrapping and re-allocate; when nothing fits, cells fall
 * back to truncation with visible loss marking. The table never silently
 * renders an allocation that violates its own floors while looking fine.
 */
import React, { useMemo, useState } from "react"
import { apportion, TRACK_BAND_ATTR, type ApportionTrack } from "@silvery/ag"
import { displayWidth, intrinsicWidths } from "@silvery/ag-term/unicode"
import { useOnBoxRectCommitted } from "../hooks/useLayout"
import { Box } from "./Box"
import { Text, type TextProps } from "./Text"
import { ListView } from "../ui/components/ListView"

/**
 * Cell content whose rendered node differs from the text that measures it.
 * A plain string is both. A `{ text, node }` pair renders `node` while the
 * width allocator reads `text` — a cell that renders `[[@i/29-buckets]]`
 * down to the label `@i/29-buckets` must size by the label, not by the
 * source bytes.
 */
export type MeasuredContent = string | { readonly text: string; readonly node: React.ReactNode }

/** The text the width allocator reads for a piece of measured content. */
export function contentText(content: MeasuredContent): string {
  return typeof content === "string" ? content : content.text
}

/** The node the renderer paints for a piece of measured content. */
export function contentNode(content: MeasuredContent): React.ReactNode {
  return typeof content === "string" ? content : content.node
}

export type Column<T> = {
  /** Column header: plain text, or a `{ text, node }` pair rendered as `node` and measured as `text`. */
  header: MeasuredContent
  /** Key to read from the data item. */
  key?: keyof T & string
  /** Custom renderer; a returned string also participates in intrinsic sizing. */
  render?: (item: T, index: number) => React.ReactNode
  /**
   * Plain text the width allocator reads when `render` returns a node. Without
   * it a node cell measures as empty and the track collapses to its header.
   */
  measure?: (item: T, index: number) => string
  /** Text alignment. */
  align?: "left" | "right" | "center"
  /** Fixed total track width. */
  width?: number
  /** Smallest total width the allocator may assign to this track. */
  minWidth?: number
  /** Largest total width the allocator may assign to this track. */
  maxWidth?: number
  /** Allow this track to consume positive free space. */
  grow?: boolean
  /** Allow this track to yield under negative free space. */
  shrink?: boolean
}

export type TableProps<T> = {
  data: readonly T[]
  columns: readonly Column<T>[]
  headerColor?: string
  showHeader?: boolean
  /** Total horizontal padding per cell (default 2). */
  padding?: number
  /** Draw document-table chrome and direct rows instead of a ListView. */
  frame?: boolean
  /** Body-cell overflow behavior (default truncate). */
  cellWrap?: TextProps["wrap"]
  /** Draw rules between direct body rows. */
  rowSeparators?: boolean
  /** Responsive presentation policy (document tables default to auto). */
  layout?: "grid" | "auto" | "blocks"
  /** Host-declared width, used before a committed layout rectangle exists. */
  availableWidth?: number
}

function useContainerWidth(): number {
  const [width, setWidth] = useState(0)
  useOnBoxRectCommitted((rect) => {
    setWidth((previous) => (previous === rect.width ? previous : rect.width))
  })
  return width
}

type TablePresentation = "plain" | "framed" | "document"

type TableImplementationProps<T> = Omit<TableProps<T>, "frame"> & {
  presentation: TablePresentation
}

export function Table<T>({
  frame = false,
  layout = "grid",
  ...props
}: TableProps<T>): React.ReactElement {
  return (
    <TableImplementation {...props} layout={layout} presentation={frame ? "framed" : "plain"} />
  )
}

/** @internal Document chrome for Content.Table; intentionally not re-exported from the package API. */
export function DocumentTable<T>({
  layout = "auto",
  ...props
}: Omit<TableProps<T>, "frame">): React.ReactElement {
  return <TableImplementation {...props} layout={layout} presentation="document" />
}

type Track = Readonly<{
  /** Band floor: min-content + chrome (or the author's explicit floor if larger). */
  min: number
  /** Band cap: max-content + chrome, capped by an explicit maxWidth. */
  max: number
  /** Character-wrap floor; document headers and explicit minima still fit. */
  degradedMin: number
  /** Explicit author width — the band is a single point and never degrades. */
  fixed: boolean
}>

type Allocation = Readonly<{
  widths: readonly number[]
  /** True when floors only fit after degrading wrap-capable cells to character wrapping. */
  degraded: boolean
}>

function trackAt(tracks: readonly Track[], index: number): Track {
  const track = tracks[index]
  if (track === undefined) throw new RangeError(`Missing table track ${index}`)
  return track
}

function plainCellValue<T>(column: Column<T>, item: T, index: number): string {
  // Explicit measurement wins: it is the only source that survives a render()
  // returning a node, which is exactly when the track would otherwise collapse.
  if (column.measure) return column.measure(item, index)
  if (column.render) {
    const rendered = column.render(item, index)
    if (typeof rendered === "string" || typeof rendered === "number") return String(rendered)
  }
  return column.key ? String(item[column.key] ?? "") : ""
}

/** Wrap modes whose min-content is the longest unbreakable segment (they cannot mark loss). */
function isWrapCapable(cellWrap: TextProps["wrap"]): boolean {
  return !(
    cellWrap === "truncate" ||
    cellWrap === "truncate-start" ||
    cellWrap === "truncate-middle" ||
    cellWrap === "truncate-end" ||
    cellWrap === "clip" ||
    cellWrap === false ||
    cellWrap === "hard"
  )
}

function computeTracks<T>(
  columns: readonly Column<T>[],
  data: readonly T[],
  padding: number,
  columnSeparators: boolean,
  cellWrap: TextProps["wrap"],
  wrapHeaders: boolean,
): Track[] {
  return columns.map((column, columnIndex) => {
    const separatorWidth = columnSeparators && columnIndex > 0 ? 1 : 0
    const chrome = padding + separatorWidth
    if (column.width !== undefined) {
      const total = column.width + separatorWidth
      return { min: total, max: total, degradedMin: total, fixed: true }
    }
    // Intrinsic sizing reads the RENDERED cell text — `measure` when the column
    // declares one, otherwise a render() that returns a string — never the
    // source data: a cell rendering a long source down to a short label must
    // not inflate the floor, and a cell rendering a node must not measure as
    // empty and collapse the track to its header.
    const headerMin = intrinsicWidths(
      contentText(column.header),
      wrapHeaders ? "wrap" : "truncate",
    ).minContentWidth
    let minContent = headerMin
    let maxContent = displayWidth(contentText(column.header))
    for (let itemIndex = 0; itemIndex < data.length; itemIndex++) {
      const item = data[itemIndex]
      if (item === undefined) continue
      const value = plainCellValue(column, item, itemIndex)
      const iw = intrinsicWidths(value, cellWrap)
      if (iw.minContentWidth > minContent) minContent = iw.minContentWidth
      if (iw.maxContentWidth > maxContent) maxContent = iw.maxContentWidth
    }
    const max = Math.min(maxContent + chrome, column.maxWidth ?? Number.MAX_SAFE_INTEGER)
    const min = Math.min(Math.max(minContent + chrome, column.minWidth ?? 0), max)
    const degradedMin = Math.min(
      wrapHeaders ? Math.max(headerMin + chrome, column.minWidth ?? 0) : chrome + 1,
      max,
    )
    return { min, max, degradedMin, fixed: false }
  })
}

/**
 * Allocate the measured width across tracks, escalating LEGIBLY when the
 * floors do not fit:
 *
 * 1. Bands as computed — the normal case.
 * 2. Floors exceed the width: re-allocate with character-wrap floors. Document
 *    headers and explicit minima stay readable; other tracks may reach one cell.
 *    The degradation is visible — text breaks mid-word — never a silent squeeze.
 * 3. Even one-cell floors do not fit: no legal allocation exists. Returns
 *    null; cells fall back to flex truncation, whose ellipsis marks the loss.
 */
function allocateTracks(
  tracks: readonly Track[],
  available: number,
  cellWrap: TextProps["wrap"],
): Allocation | null {
  if (tracks.length === 0) return null
  const bands: ApportionTrack[] = tracks.map((track) => ({ min: track.min, max: track.max }))
  const first = apportion(bands, available)
  if (first.feasible) return { widths: first.widths, degraded: false }

  if (isWrapCapable(cellWrap)) {
    const degradedBands: ApportionTrack[] = tracks.map((track) => ({
      min: track.degradedMin,
      max: track.max,
    }))
    const second = apportion(degradedBands, available)
    if (second.feasible) return { widths: second.widths, degraded: true }
  }
  return null
}

function TableRule({ color }: { color: string }): React.ReactElement {
  return (
    <Box
      height={1}
      alignSelf="stretch"
      flexShrink={0}
      borderStyle="single"
      borderColor={color}
      borderLeft={false}
      borderRight={false}
      borderBottom={false}
    />
  )
}

function TableImplementation<T>({
  data,
  columns,
  headerColor = "$fg-accent",
  showHeader = true,
  padding = 2,
  cellWrap = "truncate",
  rowSeparators = false,
  layout,
  availableWidth,
  presentation,
}: TableImplementationProps<T>): React.ReactElement {
  const directRows = presentation !== "plain"
  const framed = presentation === "framed"
  const wrapHeaders = presentation === "document" && isWrapCapable(cellWrap)
  const tracks = useMemo(
    () => computeTracks(columns, data, padding, framed, cellWrap, wrapHeaders),
    [cellWrap, columns, data, framed, padding, wrapHeaders],
  )
  // The committed inner rect of the CONTAINING Box (NodeContext) — the width
  // the table is being laid into. Batch-invariant, so allocating from it
  // cannot oscillate: a content-sized parent measures Σmax, and
  // apportion(Σmax) returns exactly the max widths — a fixpoint.
  // Allocation depends only on the containing box's width. Observe committed
  // geometry and project that single scalar into state: subscribing to the
  // full rect or `{width,height}` wakes every table while its own rendered
  // rows change the container height, which forms a self-sustaining follow-up
  // frame in table-heavy documents.
  const containerWidth = useContainerWidth()
  const declaredAvailable =
    containerWidth > 0
      ? containerWidth
      : availableWidth !== undefined && availableWidth > 0
        ? availableWidth
        : 0
  const available = declaredAvailable > 0 ? declaredAvailable - (framed ? 2 : 0) : null
  const allocation = useMemo(
    () => (available === null ? null : allocateTracks(tracks, available, cellWrap)),
    [available, cellWrap, tracks],
  )
  const allocationHasSlack =
    allocation !== null &&
    available !== null &&
    allocation.widths.reduce((total, width) => total + width, 0) < available
  const borderColor = "$border"
  const ruleColor = presentation === "document" ? "$border-muted" : borderColor
  const leftPadding = directRows ? Math.floor(padding / 2) : 0
  const rightPadding = directRows ? padding - leftPadding : padding
  const bodyWrap: TextProps["wrap"] = allocation?.degraded && !wrapHeaders ? "hard" : cellWrap
  const blocks =
    layout === "blocks" ||
    (layout === "auto" &&
      available !== null &&
      (containerWidth <= 0 || allocation === null || (allocation.degraded && !wrapHeaders)))

  // The band the allocator worked under, carried onto the rendered track so the
  // `apportion-bands` STRICT check can compare the width the layout engine
  // actually realized against the width the allocation promised. An
  // unmeasured first frame or visible hard-overflow fallback has no allocation
  // promise, so it deliberately carries no band assertion.
  const trackProps = (column: Column<T>, track: Track, columnIndex: number) => ({
    ...(allocation === null
      ? {}
      : {
          [TRACK_BAND_ATTR]: `${allocation.degraded ? track.degradedMin : track.min},${track.max}`,
        }),
    ...trackFlexProps(column, track, columnIndex),
  })

  const trackFlexProps = (column: Column<T>, track: Track, columnIndex: number) => {
    if (track.fixed) {
      return {
        width: track.max,
        minWidth: track.max,
        maxWidth: track.max,
        flexGrow: 0,
        flexShrink: 0,
      }
    }
    if (allocation !== null) {
      const width = allocation.widths[columnIndex] ?? track.min
      // A feasible in-band allocation already owns every available cell. Lock
      // those tracks to the widths the allocator promised: leaving grow
      // enabled lets JSX-rendered cell content expand past its band and steal
      // width from siblings. Grow is only needed when the container is wider
      // than the sum of every track's max and genuine positive slack remains.
      return column.grow && allocationHasSlack
        ? { flexBasis: width, minWidth: width, flexGrow: 1, flexShrink: 0 }
        : { width, minWidth: width, maxWidth: width, flexGrow: 0, flexShrink: 0 }
    }
    // Unmeasured first frame, or no legal allocation exists (hard overflow):
    // natural-width tracks that flex-shrink linearly; overflow="hidden" plus
    // truncation marks the loss. Shrink weight is the band's shrinkability so
    // rigid tracks hold and prose yields — same model as the allocator.
    const canShrink = column.shrink ?? column.grow ?? false
    return {
      flexBasis: track.max,
      minWidth: column.minWidth ?? 0,
      maxWidth: column.maxWidth,
      flexGrow: column.grow ? 1 : 0,
      flexShrink: canShrink ? Math.max(track.max - track.min, 1) : 0,
    }
  }

  const cellBorderProps = (columnIndex: number) =>
    framed && columnIndex > 0
      ? {
          borderStyle: "single" as const,
          borderColor,
          borderTop: false,
          borderRight: false,
          borderBottom: false,
        }
      : {}

  const cellJustify = (column: Column<T>) =>
    column.align === "right"
      ? ("flex-end" as const)
      : column.align === "center"
        ? ("center" as const)
        : undefined

  const renderCell = (
    column: Column<T>,
    item: T,
    itemIndex: number,
    track: Track,
    columnIndex: number,
  ) => {
    const rendered = column.render ? column.render(item, itemIndex) : null
    const content =
      rendered != null && typeof rendered !== "string" && typeof rendered !== "number" ? (
        rendered
      ) : (
        <Text minWidth={0} maxWidth="100%" wrap={bodyWrap}>
          {rendered == null ? String((column.key ? item[column.key] : "") ?? "") : String(rendered)}
        </Text>
      )
    return (
      <Box
        key={columnIndex}
        {...trackProps(column, track, columnIndex)}
        {...cellBorderProps(columnIndex)}
        overflow="hidden"
        paddingLeft={leftPadding}
        paddingRight={rightPadding}
        justifyContent={cellJustify(column)}
      >
        {content}
      </Box>
    )
  }

  const renderRow = (item: T, itemIndex: number) => (
    <Box
      key={itemIndex}
      flexDirection="row"
      width="100%"
      alignSelf={directRows ? "stretch" : undefined}
      minWidth={0}
      overflow="hidden"
    >
      {columns.map((column, columnIndex) =>
        renderCell(column, item, itemIndex, trackAt(tracks, columnIndex), columnIndex),
      )}
    </Box>
  )

  if (blocks) {
    return (
      <Box
        data-component="content-table-blocks"
        flexDirection="column"
        width="100%"
        minWidth={0}
        gap={1}
      >
        {data.map((item, itemIndex) => (
          <Box key={itemIndex} flexDirection="column" minWidth={0}>
            {columns.map((column, columnIndex) => {
              const rendered = column.render ? column.render(item, itemIndex) : null
              const value =
                rendered == null ? String((column.key ? item[column.key] : "") ?? "") : rendered
              return (
                <Box key={columnIndex} flexDirection="column" width="100%" minWidth={0}>
                  <Text bold color={headerColor} flexShrink={0}>
                    {contentNode(column.header)}:
                  </Text>
                  {typeof value === "string" || typeof value === "number" ? (
                    <Text minWidth={0} wrap="wrap">
                      {String(value)}
                    </Text>
                  ) : (
                    value
                  )}
                </Box>
              )
            })}
          </Box>
        ))}
      </Box>
    )
  }

  const header = showHeader ? (
    <Box
      flexDirection="row"
      width="100%"
      alignSelf={directRows ? "stretch" : undefined}
      minWidth={0}
      overflow="hidden"
    >
      {columns.map((column, columnIndex) => (
        <Box
          key={columnIndex}
          {...trackProps(column, trackAt(tracks, columnIndex), columnIndex)}
          {...cellBorderProps(columnIndex)}
          overflow="hidden"
          paddingLeft={leftPadding}
          paddingRight={rightPadding}
          justifyContent={cellJustify(column)}
        >
          <Text
            bold
            color={headerColor}
            minWidth={0}
            maxWidth="100%"
            wrap={wrapHeaders ? "wrap" : "truncate"}
          >
            {contentNode(column.header)}
          </Text>
        </Box>
      ))}
    </Box>
  ) : null

  if (directRows) {
    const intrinsicWidth =
      (allocation === null
        ? tracks.reduce((sum, track) => sum + track.max, 0)
        : allocation.widths.reduce((sum, width) => sum + width, 0)) + (framed ? 2 : 0)
    return (
      <Box
        data-component="content-table-grid"
        flexDirection="column"
        width={intrinsicWidth}
        maxWidth="100%"
        minWidth={0}
        marginLeft="auto"
        marginRight="auto"
        borderStyle={framed ? "single" : undefined}
        borderColor={framed ? borderColor : undefined}
        overflow="hidden"
      >
        {header}
        {header && data.length > 0 ? <TableRule color={ruleColor} /> : null}
        {data.map((item, itemIndex) => (
          <React.Fragment key={itemIndex}>
            {rowSeparators && itemIndex > 0 ? <TableRule color={ruleColor} /> : null}
            {renderRow(item, itemIndex)}
          </React.Fragment>
        ))}
      </Box>
    )
  }

  const viewportHeight = Math.max(data.length, 1)
  return (
    <Box flexDirection="column" width="100%" minWidth={0} overflow="hidden">
      {header}
      {data.length > 0 && (
        <ListView items={data} height={viewportHeight} estimateHeight={1} renderItem={renderRow} />
      )}
    </Box>
  )
}
