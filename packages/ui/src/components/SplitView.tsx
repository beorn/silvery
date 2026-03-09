/**
 * SplitView - Recursive binary-tree pane tiling component.
 *
 * Renders a layout tree of split panes using flexbox. Each leaf renders
 * via renderPane(id). Splits divide space according to ratio (0-1,
 * proportion given to first child).
 *
 * Horizontal splits use flexDirection="row", vertical splits use
 * flexDirection="column". Each pane gets a border with optional title
 * and focus highlight.
 */

import React from "react"
import type { LayoutNode } from "@silvery/term/pane-manager"
import { Box } from "@silvery/react/components/Box"
import { Text } from "@silvery/react/components/Text"

// ============================================================================
// Types
// ============================================================================

export type { LayoutNode }

export interface SplitViewProps {
  /** Layout tree describing the split arrangement */
  layout: LayoutNode
  /** Render function for each leaf pane */
  renderPane: (id: string) => React.ReactNode
  /** Optional: ID of the focused pane (for border highlighting) */
  focusedPaneId?: string
  /** Optional: show borders around panes (default: true) */
  showBorders?: boolean
  /** Optional: border style for focused pane */
  focusedBorderColor?: string
  /** Optional: border style for unfocused panes */
  unfocusedBorderColor?: string
  /** Optional: render pane title in border */
  renderPaneTitle?: (id: string) => string
}

// ============================================================================
// Constants
// ============================================================================

const MIN_PANE_WIDTH = 20
const MIN_PANE_HEIGHT = 5
const DEFAULT_FOCUSED_COLOR = "green"
const DEFAULT_UNFOCUSED_COLOR = "gray"

// ============================================================================
// Component
// ============================================================================

/**
 * SplitView renders a binary tree of panes.
 *
 * Each leaf renders via `renderPane(id)`. Splits divide space
 * according to `ratio` (0-1, proportion given to first child).
 */
export function SplitView(props: SplitViewProps): React.ReactElement {
  const {
    layout,
    renderPane,
    focusedPaneId,
    showBorders = true,
    focusedBorderColor = DEFAULT_FOCUSED_COLOR,
    unfocusedBorderColor = DEFAULT_UNFOCUSED_COLOR,
    renderPaneTitle,
  } = props

  return (
    <Box flexGrow={1} flexDirection="column">
      <LayoutNodeView
        node={layout}
        renderPane={renderPane}
        focusedPaneId={focusedPaneId}
        showBorders={showBorders}
        focusedBorderColor={focusedBorderColor}
        unfocusedBorderColor={unfocusedBorderColor}
        renderPaneTitle={renderPaneTitle}
      />
    </Box>
  )
}

// ============================================================================
// Internal Components
// ============================================================================

interface LayoutNodeViewProps {
  node: LayoutNode
  renderPane: (id: string) => React.ReactNode
  focusedPaneId?: string
  showBorders: boolean
  focusedBorderColor: string
  unfocusedBorderColor: string
  renderPaneTitle?: (id: string) => string
}

function LayoutNodeView(props: LayoutNodeViewProps): React.ReactElement {
  const { node, renderPane, focusedPaneId, showBorders, focusedBorderColor, unfocusedBorderColor, renderPaneTitle } =
    props

  if (node.type === "leaf") {
    return (
      <LeafPane
        id={node.id}
        renderPane={renderPane}
        isFocused={focusedPaneId === node.id}
        showBorders={showBorders}
        focusedBorderColor={focusedBorderColor}
        unfocusedBorderColor={unfocusedBorderColor}
        title={renderPaneTitle?.(node.id)}
      />
    )
  }

  // Split node: render two children with flex proportions
  // Use integer flex values to express the ratio without floating point issues.
  // ratio=0.5 => flexGrow 50:50, ratio=0.3 => flexGrow 30:70, etc.
  const firstFlex = Math.round(node.ratio * 100)
  const secondFlex = 100 - firstFlex

  return (
    <Box flexGrow={1} flexDirection={node.direction === "horizontal" ? "row" : "column"}>
      <Box
        flexGrow={firstFlex}
        flexShrink={1}
        minWidth={node.direction === "horizontal" ? MIN_PANE_WIDTH : undefined}
        minHeight={node.direction === "vertical" ? MIN_PANE_HEIGHT : undefined}
      >
        <LayoutNodeView
          node={node.first}
          renderPane={renderPane}
          focusedPaneId={focusedPaneId}
          showBorders={showBorders}
          focusedBorderColor={focusedBorderColor}
          unfocusedBorderColor={unfocusedBorderColor}
          renderPaneTitle={renderPaneTitle}
        />
      </Box>
      <Box
        flexGrow={secondFlex}
        flexShrink={1}
        minWidth={node.direction === "horizontal" ? MIN_PANE_WIDTH : undefined}
        minHeight={node.direction === "vertical" ? MIN_PANE_HEIGHT : undefined}
      >
        <LayoutNodeView
          node={node.second}
          renderPane={renderPane}
          focusedPaneId={focusedPaneId}
          showBorders={showBorders}
          focusedBorderColor={focusedBorderColor}
          unfocusedBorderColor={unfocusedBorderColor}
          renderPaneTitle={renderPaneTitle}
        />
      </Box>
    </Box>
  )
}

interface LeafPaneProps {
  id: string
  renderPane: (id: string) => React.ReactNode
  isFocused: boolean
  showBorders: boolean
  focusedBorderColor: string
  unfocusedBorderColor: string
  title?: string
}

function LeafPane(props: LeafPaneProps): React.ReactElement {
  const { id, renderPane, isFocused, showBorders, focusedBorderColor, unfocusedBorderColor, title } = props

  if (!showBorders) {
    return (
      <Box flexGrow={1} testID={`pane-${id}`}>
        {renderPane(id)}
      </Box>
    )
  }

  return (
    <Box
      flexGrow={1}
      borderStyle="single"
      borderColor={isFocused ? focusedBorderColor : unfocusedBorderColor}
      testID={`pane-${id}`}
      flexDirection="column"
    >
      {title != null && (
        <Box>
          <Text color={isFocused ? focusedBorderColor : unfocusedBorderColor}>{title}</Text>
        </Box>
      )}
      <Box flexGrow={1}>{renderPane(id)}</Box>
    </Box>
  )
}
