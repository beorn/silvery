/**
 * Text Selection Demo
 *
 * Demonstrates silvery's real text selection system using the useSelection hook.
 * Shows userSelect modes (text, none, contain) and live selection state readout.
 *
 * Run: bun vendor/silvery/examples/apps/text-selection-demo.tsx
 */

import React from "react"
import { Box, Text, H1, H2, Small, Muted, Strong, Kbd, HR } from "../../src/index.js"
import { run } from "@silvery/ag-term/runtime"
import { ExampleBanner, type ExampleMeta } from "../_banner.js"
import { useSelection } from "../../packages/ag-react/src/hooks/useSelection"

export const meta: ExampleMeta = {
  name: "Text Selection",
  description: "Real selection via useSelection hook, userSelect modes, live state readout",
  demo: true,
  features: ["useSelection()", "userSelect prop", "CapabilityRegistry", "mouse drag selection"],
}

// ============================================================================
// Selectable text panel (default — userSelect="text")
// ============================================================================

function SelectableTextPanel(): React.ReactElement {
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="$border" paddingX={1} flexGrow={1}>
      <H2>Selectable Text</H2>
      <Small>userSelect="text" (default)</Small>
      <Box height={1} />
      <Text>Drag your mouse over this text to select it.</Text>
      <Text>Multi-line selections work across paragraphs.</Text>
      <Box height={1} />
      <Text color="$muted">
        The quick brown fox jumps over the lazy dog. Pack my box with five dozen liquor jugs.
      </Text>
    </Box>
  )
}

// ============================================================================
// Non-selectable panel (userSelect="none")
// ============================================================================

function NonSelectablePanel(): React.ReactElement {
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="$border" paddingX={1} flexGrow={1} userSelect="none">
      <H2>Non-Selectable</H2>
      <Small>userSelect="none"</Small>
      <Box height={1} />
      <Text>This area cannot be selected by mouse drag.</Text>
      <Text>Click events still work normally here.</Text>
      <Box height={1} />
      <Muted>Hold Alt and drag to override and select anyway.</Muted>
    </Box>
  )
}

// ============================================================================
// Contained panel (userSelect="contain")
// ============================================================================

function ContainedPanel(): React.ReactElement {
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="$warning" paddingX={1} flexGrow={1}>
      <H2 color="$warning">Contained Selection</H2>
      <Small>userSelect="contain"</Small>
      <Box height={1} />
      <Box flexDirection="column" borderStyle="round" borderColor="$primary" paddingX={1} userSelect="contain">
        <Text bold color="$primary">
          Selection Boundary
        </Text>
        <Box height={1} />
        <Text>Selection cannot escape this container.</Text>
        <Text>Try dragging past the border — it clips.</Text>
        <Box height={1} />
        <Text color="$success">Useful for modals, side panes, overlays.</Text>
      </Box>
    </Box>
  )
}

// ============================================================================
// Live selection state readout via useSelection()
// ============================================================================

function SelectionStatePanel(): React.ReactElement {
  const selection = useSelection()

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="$info" paddingX={1} flexGrow={1}>
      <H2 color="$info">Selection State</H2>
      <Small>Live readout from useSelection()</Small>
      <Box height={1} />
      {!selection ? (
        <Text color="$muted">useSelection() returned undefined — feature not installed</Text>
      ) : selection.range ? (
        <>
          <Box gap={1}>
            <Strong>Status:</Strong>
            <Text color="$success">{selection.selecting ? "Selecting..." : "Selected"}</Text>
          </Box>
          <Box gap={1}>
            <Strong>Source:</Strong>
            <Text>{selection.source ?? "unknown"}</Text>
          </Box>
          <Box gap={1}>
            <Strong>Anchor:</Strong>
            <Text>
              ({selection.range.anchor.col}, {selection.range.anchor.row})
            </Text>
          </Box>
          <Box gap={1}>
            <Strong>Head:</Strong>
            <Text>
              ({selection.range.head.col}, {selection.range.head.row})
            </Text>
          </Box>
        </>
      ) : (
        <Text color="$muted">No active selection — drag to select text</Text>
      )}
    </Box>
  )
}

// ============================================================================
// Status bar
// ============================================================================

function StatusBar(): React.ReactElement {
  return (
    <Box flexDirection="row" gap={2} paddingX={1} flexShrink={0} userSelect="none">
      <Muted>
        <Kbd>Drag</Kbd> select <Kbd>Alt+Drag</Kbd> force select <Kbd>Ctrl+C</Kbd> quit
      </Muted>
    </Box>
  )
}

// ============================================================================
// Main app
// ============================================================================

function TextSelectionDemo(): React.ReactElement {
  return (
    <Box flexDirection="column" padding={1} gap={1} height="100%">
      <Box>
        <H1 color="$primary">Text Selection Demo</H1>
        <Muted> — real selection via useSelection()</Muted>
      </Box>

      {/* Top row: selectable + non-selectable */}
      <Box flexDirection="row" gap={1} flexGrow={1}>
        <SelectableTextPanel />
        <NonSelectablePanel />
      </Box>

      {/* Bottom row: contained + live state readout */}
      <Box flexDirection="row" gap={1} flexGrow={1}>
        <ContainedPanel />
        <SelectionStatePanel />
      </Box>

      <HR />
      <StatusBar />
    </Box>
  )
}

// ============================================================================
// Main
// ============================================================================

if (import.meta.main) {
  using handle = await run(
    <ExampleBanner meta={meta} controls="Drag select  Alt+Drag force select  Ctrl+C quit">
      <TextSelectionDemo />
    </ExampleBanner>,
    { mode: "fullscreen" },
  )
  await handle.waitUntilExit()
}
