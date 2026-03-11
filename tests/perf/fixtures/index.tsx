/**
 * Shared fixtures for silvery performance benchmarks.
 *
 * Provides component trees at various scales for consistent benchmarking
 * across render, layout, diff, and memory benchmarks.
 */

import React from "react"
import { Box, Text, useContentRect } from "@silvery/react"
import type { ReactElement } from "react"

// ============================================================================
// Simple Components
// ============================================================================

/** Single Box+Text pair — the simplest renderable unit. */
export function SimpleItem({ label }: { label: string }): ReactElement {
  return (
    <Box>
      <Text>{label}</Text>
    </Box>
  )
}

/** Box+Text with styling — tests styled content rendering. */
export function StyledItem({ label, index }: { label: string; index: number }): ReactElement {
  return (
    <Box paddingLeft={1} borderStyle={index % 3 === 0 ? "single" : undefined}>
      <Text bold={index % 2 === 0} color={index % 4 === 0 ? "green" : undefined}>
        {label}
      </Text>
    </Box>
  )
}

/** Component that uses useContentRect — triggers two-phase rendering. */
export function ResponsiveItem({ label }: { label: string }): ReactElement {
  const { width } = useContentRect()
  return (
    <Box>
      <Text>{width > 0 ? `${label} (w=${width})` : label}</Text>
    </Box>
  )
}

// ============================================================================
// Tree Generators
// ============================================================================

/** Flat list of N items in a column. */
export function FlatList({ count, styled }: { count: number; styled?: boolean }): ReactElement {
  return (
    <Box flexDirection="column">
      {Array.from({ length: count }, (_, i) =>
        styled ? <StyledItem key={i} label={`Item ${i}`} index={i} /> : <SimpleItem key={i} label={`Item ${i}`} />,
      )}
    </Box>
  )
}

/** Kanban board: N columns, each with M cards. */
export function KanbanBoard({ columns, cardsPerColumn }: { columns: number; cardsPerColumn: number }): ReactElement {
  return (
    <Box flexDirection="row" gap={1}>
      {Array.from({ length: columns }, (_, col) => (
        <Box key={col} flexDirection="column" flexGrow={1}>
          <Box borderStyle="single">
            <Text bold>{`Column ${col}`}</Text>
          </Box>
          {Array.from({ length: cardsPerColumn }, (_, card) => (
            <Box key={card} paddingLeft={1} borderStyle="round">
              <Text>{`Card ${col}-${card}`}</Text>
            </Box>
          ))}
        </Box>
      ))}
    </Box>
  )
}

/** Dashboard layout: header, sidebar + content, footer. */
export function Dashboard({ widgetCount }: { widgetCount: number }): ReactElement {
  return (
    <Box flexDirection="column">
      {/* Header */}
      <Box height={1} borderStyle="single">
        <Text bold>Dashboard</Text>
      </Box>

      {/* Main: sidebar + content */}
      <Box flexGrow={1} flexDirection="row" gap={1}>
        {/* Sidebar */}
        <Box width={20} flexDirection="column" borderStyle="single">
          <Text>Navigation</Text>
          {Array.from({ length: 5 }, (_, i) => (
            <Box key={i} paddingLeft={1}>
              <Text>{`Nav ${i}`}</Text>
            </Box>
          ))}
        </Box>

        {/* Content area */}
        <Box flexGrow={1} flexDirection="column" gap={1}>
          {Array.from({ length: widgetCount }, (_, i) => (
            <Box key={i} flexGrow={1} borderStyle="round" padding={1}>
              <Text>{`Widget ${i}: some content here`}</Text>
            </Box>
          ))}
        </Box>
      </Box>

      {/* Footer */}
      <Box height={1}>
        <Text dimColor>Status bar</Text>
      </Box>
    </Box>
  )
}

/** Deeply nested component tree — stress tests tree traversal. */
export function DeepTree({ depth }: { depth: number }): ReactElement {
  if (depth === 0) {
    return <Text>Leaf</Text>
  }
  return (
    <Box paddingLeft={1}>
      <DeepTree depth={depth - 1} />
    </Box>
  )
}

/** Scrollable list — overflow="scroll" container with many items. */
export function ScrollableList({ count, visibleHeight }: { count: number; visibleHeight: number }): ReactElement {
  return (
    <Box height={visibleHeight} overflow="scroll">
      {Array.from({ length: count }, (_, i) => (
        <Box key={i}>
          <Text>{`Scroll item ${i}`}</Text>
        </Box>
      ))}
    </Box>
  )
}

// ============================================================================
// Stateful Components (for re-render benchmarks)
// ============================================================================

/** Counter app — minimal state change for re-render benchmarking. */
export function CounterApp({ count }: { count: number }): ReactElement {
  return (
    <Box flexDirection="column" padding={1}>
      <Text bold>Counter</Text>
      <Text>Count: {count}</Text>
    </Box>
  )
}

/** List with a single highlighted item — simulates cursor movement. */
export function CursorList({ count, cursor }: { count: number; cursor: number }): ReactElement {
  return (
    <Box flexDirection="column">
      {Array.from({ length: count }, (_, i) => (
        <Box key={i} paddingLeft={1}>
          <Text inverse={i === cursor} bold={i === cursor}>
            {i === cursor ? `> Item ${i}` : `  Item ${i}`}
          </Text>
        </Box>
      ))}
    </Box>
  )
}
