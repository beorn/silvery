/**
 * SplitPane — controlled two-child pane layout.
 *
 * SplitPane owns the reusable layout mechanics around PaneDivider: converting
 * a controlled ratio into cell sizes, clamping both children to cell minimums,
 * tracking a captured resize gesture, and hiding/restoring the secondary pane.
 * Domain state and persistence stay with the caller.
 *
 * Hab Deck's PaneGrid intentionally stays specialized instead of wrapping this
 * primitive: it owns an arbitrary recursive split tree, persisted tree
 * mutations, pane-move hit testing, focus, and deck chrome, while SplitPane is
 * a controlled two-child layout. Both converge on PaneDivider for divider
 * rendering and pointer capture; forcing PaneGrid through SplitPane would add a
 * second layout-state owner rather than remove one.
 */

import React, { useCallback, useRef } from "react"
import { Box } from "../../components/Box"
import { MeasuredBox, type MeasuredBoxRect } from "./MeasuredBox"
import { PaneDivider, type PaneDividerResizeStartEvent } from "./PaneDivider"

export type SplitPaneDirection = "row" | "column"

export type SplitPaneLayout = SplitPaneDirection | "single"

export interface SplitPaneNaturalSize {
  readonly width: number
  readonly height: number
}

export interface ResolveSplitPaneLayoutOptions {
  readonly availableWidth: number
  readonly availableHeight: number
  readonly primary: SplitPaneNaturalSize
  readonly secondary: SplitPaneNaturalSize
  readonly dividerSize?: number
  readonly preferredDirection?: SplitPaneDirection
}

export interface SplitPaneRatioOptions {
  /** Total cells on the split's main axis, including the divider. */
  readonly containerSize: number
  readonly dividerSize?: number
  readonly minPrimarySize?: number
  readonly minSecondarySize?: number
}

export interface SplitPaneDragOptions extends SplitPaneRatioOptions {
  readonly startRatio: number
  readonly startCoordinate: number
  readonly coordinate: number
}

export interface SplitPaneProps {
  /** `row` places the secondary pane to the right; `column` places it below. */
  readonly direction: SplitPaneDirection
  /** Controlled fraction of non-divider cells allocated to the primary pane. */
  readonly ratio: number
  /** Fired for each captured pointer move with a ratio clamped to both cell minimums. */
  readonly onRatioChange?: (ratio: number) => void
  /** Fired once on pointer release with the last emitted ratio. */
  readonly onRatioCommit?: (ratio: number) => void
  readonly minPrimarySize?: number
  readonly minSecondarySize?: number
  readonly dividerSize?: number
  /** Hides the divider and secondary layout while keeping the secondary subtree mounted. */
  readonly secondaryCollapsed?: boolean
  readonly primary: React.ReactNode
  readonly secondary: React.ReactNode
}

export function SplitPane({
  direction,
  ratio,
  onRatioChange,
  onRatioCommit,
  minPrimarySize = 0,
  minSecondarySize = 0,
  dividerSize = 1,
  secondaryCollapsed = false,
  primary,
  secondary,
}: SplitPaneProps): React.ReactElement {
  return (
    // LAYOUT_READ_AT_RENDER: exact integer-cell clamps and drag ratios depend
    // on the non-divider cells assigned by the parent layout. MeasuredBox
    // defers the child tree until that committed size exists.
    <MeasuredBox flexGrow={1} minWidth={0} minHeight={0} overflow="hidden">
      {(rect) => (
        <MeasuredSplitPane
          rect={rect}
          direction={direction}
          ratio={ratio}
          onRatioChange={onRatioChange}
          onRatioCommit={onRatioCommit}
          minPrimarySize={minPrimarySize}
          minSecondarySize={minSecondarySize}
          dividerSize={dividerSize}
          secondaryCollapsed={secondaryCollapsed}
          primary={primary}
          secondary={secondary}
        />
      )}
    </MeasuredBox>
  )
}

function finiteCells(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${label} must be a finite non-negative cell count`)
  }
  return Math.floor(value)
}

function dividerCells(value: number | undefined): number {
  return finiteCells(value ?? 1, "dividerSize")
}

function finiteRatio(value: number): number {
  if (!Number.isFinite(value)) throw new RangeError("ratio must be finite")
  return Math.min(1, Math.max(0, value))
}

/** Clamp a controlled ratio against integer cell minimums. */
export function clampSplitPaneRatio(ratio: number, options: SplitPaneRatioOptions): number {
  const safeRatio = finiteRatio(ratio)
  const containerSize = finiteCells(options.containerSize, "containerSize")
  const dividerSize = dividerCells(options.dividerSize)
  const availableSize = Math.max(0, containerSize - dividerSize)
  const minPrimarySize = finiteCells(options.minPrimarySize ?? 0, "minPrimarySize")
  const minSecondarySize = finiteCells(options.minSecondarySize ?? 0, "minSecondarySize")

  if (availableSize === 0) return safeRatio

  // When the caller keeps a split visible below its declared natural fit,
  // neither minimum can be honored. Compress proportionally instead of
  // allowing one child to disappear or producing an inverted clamp range.
  const minimumSum = minPrimarySize + minSecondarySize
  if (minimumSum > availableSize && minimumSum > 0) {
    return minPrimarySize / minimumSum
  }

  const minimumRatio = minPrimarySize / availableSize
  const maximumRatio = 1 - minSecondarySize / availableSize
  return Math.min(maximumRatio, Math.max(minimumRatio, safeRatio))
}

/** Convert one captured divider move into the next controlled ratio. */
export function splitPaneRatioAfterDrag(options: SplitPaneDragOptions): number {
  const containerSize = finiteCells(options.containerSize, "containerSize")
  const availableSize = Math.max(1, containerSize - dividerCells(options.dividerSize))
  const desiredRatio =
    options.startRatio + (options.coordinate - options.startCoordinate) / availableSize
  return clampSplitPaneRatio(desiredRatio, options)
}

/**
 * Pick a preferred split direction, its orthogonal fallback, or a single-pane
 * drill-in layout from caller-supplied natural sizes.
 *
 * The query intentionally checks only the split's main axis. Both children
 * share the cross axis, so callers may still render them below natural height
 * or width when every available layout is cross-axis constrained.
 */
export function resolveSplitPaneLayout({
  availableWidth,
  availableHeight,
  primary,
  secondary,
  dividerSize: requestedDividerSize,
  preferredDirection = "row",
}: ResolveSplitPaneLayoutOptions): SplitPaneLayout {
  const width = finiteCells(availableWidth, "availableWidth")
  const height = finiteCells(availableHeight, "availableHeight")
  const dividerSize = dividerCells(requestedDividerSize)
  const primaryWidth = finiteCells(primary.width, "primary.width")
  const primaryHeight = finiteCells(primary.height, "primary.height")
  const secondaryWidth = finiteCells(secondary.width, "secondary.width")
  const secondaryHeight = finiteCells(secondary.height, "secondary.height")
  const rowFits = width >= primaryWidth + dividerSize + secondaryWidth
  const columnFits = height >= primaryHeight + dividerSize + secondaryHeight

  if (preferredDirection === "row") {
    if (rowFits) return "row"
    if (columnFits) return "column"
  } else {
    if (columnFits) return "column"
    if (rowFits) return "row"
  }
  return "single"
}

interface MeasuredSplitPaneProps extends Omit<SplitPaneProps, "dividerSize"> {
  readonly rect: MeasuredBoxRect
  readonly dividerSize: number
}

interface SplitPaneDragState {
  readonly startCoordinate: number
  readonly startRatio: number
  readonly containerSize: number
  latestRatio: number
}

function MeasuredSplitPane({
  rect,
  direction,
  ratio,
  onRatioChange,
  onRatioCommit,
  minPrimarySize = 0,
  minSecondarySize = 0,
  dividerSize: requestedDividerSize,
  secondaryCollapsed = false,
  primary,
  secondary,
}: MeasuredSplitPaneProps): React.ReactElement {
  const dividerSize = dividerCells(requestedDividerSize)
  const containerSize = direction === "row" ? rect.width : rect.height
  const ratioOptions = { containerSize, dividerSize, minPrimarySize, minSecondarySize }
  const visibleRatio = clampSplitPaneRatio(ratio, ratioOptions)
  const availableSize = Math.max(0, containerSize - dividerSize)
  const primarySize = Math.round(visibleRatio * availableSize)
  const dragRef = useRef<SplitPaneDragState | null>(null)

  const handleResizeStart = useCallback(
    (event: PaneDividerResizeStartEvent): void => {
      dragRef.current = {
        startCoordinate: event.coordinate,
        startRatio: visibleRatio,
        containerSize,
        latestRatio: visibleRatio,
      }
    },
    [containerSize, visibleRatio],
  )

  const handleResizeMove = useCallback(
    (coordinate: number): void => {
      const drag = dragRef.current
      if (drag === null || onRatioChange === undefined) return
      const nextRatio = splitPaneRatioAfterDrag({
        startRatio: drag.startRatio,
        startCoordinate: drag.startCoordinate,
        coordinate,
        containerSize: drag.containerSize,
        dividerSize,
        minPrimarySize,
        minSecondarySize,
      })
      drag.latestRatio = nextRatio
      onRatioChange(nextRatio)
    },
    [dividerSize, minPrimarySize, minSecondarySize, onRatioChange],
  )

  const handleResizeEnd = useCallback((): void => {
    const drag = dragRef.current
    if (drag === null) return
    dragRef.current = null
    onRatioCommit?.(drag.latestRatio)
  }, [onRatioCommit])

  const row = direction === "row"
  return (
    <Box flexGrow={1} minWidth={0} minHeight={0} overflow="hidden" flexDirection={direction}>
      <Box
        key="primary"
        minWidth={0}
        minHeight={0}
        overflow="hidden"
        flexShrink={0}
        flexGrow={secondaryCollapsed ? 1 : 0}
        width={row && !secondaryCollapsed ? primarySize : undefined}
        height={!row && !secondaryCollapsed ? primarySize : undefined}
      >
        {primary}
      </Box>
      {!secondaryCollapsed && dividerSize > 0 && (
        <PaneDivider
          key={direction}
          orientation={row ? "vertical" : "horizontal"}
          size={dividerSize}
          disabled={onRatioChange === undefined}
          onResizeStart={handleResizeStart}
          onResizeMove={handleResizeMove}
          onResizeEnd={handleResizeEnd}
        />
      )}
      <Box
        key="secondary"
        display={secondaryCollapsed ? "none" : undefined}
        minWidth={0}
        minHeight={0}
        overflow="hidden"
        flexGrow={1}
        flexShrink={1}
      >
        {secondary}
      </Box>
    </Box>
  )
}
