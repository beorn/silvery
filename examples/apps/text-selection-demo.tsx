/**
 * Text Selection Demo
 *
 * Comprehensive demo of silvery's text selection system:
 * - Selectable text blocks (default behavior, mouse-drag to select)
 * - Non-selectable buttons (userSelect="none", clicks work)
 * - Contained dialog (userSelect="contain", selection stays inside)
 * - Alt+drag override (select even from non-selectable areas)
 * - Copy indicator (shows "Copied!" feedback)
 * - Find demo (Ctrl+F to search, n/N to navigate, Enter to select match)
 *
 * Run: bun vendor/silvery/examples/apps/text-selection-demo.tsx
 */

import React, { useState, useCallback } from "react"
import { Box, Text, H1, H2, Small, Muted, Strong, Kbd, ModalDialog, HR } from "../../src/index.js"
import { run, useInput, type Key } from "@silvery/ag-term/runtime"
import { ExampleBanner, type ExampleMeta } from "../_banner.js"

export const meta: ExampleMeta = {
  name: "Text Selection",
  description: "Mouse selection, userSelect modes, Alt+drag, contain boundaries, find",
  demo: true,
  features: [
    "userSelect prop",
    "mouse drag selection",
    "Alt+drag override",
    "contain boundaries",
    "copy indicator",
    "Ctrl+F find",
  ],
}

// ============================================================================
// Demo panels
// ============================================================================

/** Panel 1: Selectable text (default — userSelect="text") */
function SelectableTextPanel(): React.ReactElement {
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="$border" paddingX={1} flexGrow={1}>
      <H2>Selectable Text</H2>
      <Small>userSelect="text" (default)</Small>
      <Box height={1} />
      <Text>Drag your mouse over this text to select it.</Text>
      <Text>Multi-line selections work across paragraphs.</Text>
      <Text>Double-click to select a word. Triple-click for a line.</Text>
      <Box height={1} />
      <Text color="$muted">
        The quick brown fox jumps over the lazy dog. Pack my box with five dozen liquor jugs.
      </Text>
    </Box>
  )
}

/** Panel 2: Non-selectable buttons (userSelect="none") */
function NonSelectablePanel({
  onAction,
}: {
  onAction: (label: string) => void
}): React.ReactElement {
  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="$border"
      paddingX={1}
      flexGrow={1}
      userSelect="none"
    >
      <H2>Non-Selectable</H2>
      <Small>userSelect="none"</Small>
      <Box height={1} />
      <Text>Click these buttons — text won't select.</Text>
      <Box height={1} />
      <Box gap={2}>
        <Box
          borderStyle="round"
          borderColor="$primary"
          paddingX={1}
          onClick={() => onAction("Save")}
        >
          <Text color="$primary" bold>Save</Text>
        </Box>
        <Box
          borderStyle="round"
          borderColor="$success"
          paddingX={1}
          onClick={() => onAction("Apply")}
        >
          <Text color="$success" bold>Apply</Text>
        </Box>
        <Box
          borderStyle="round"
          borderColor="$error"
          paddingX={1}
          onClick={() => onAction("Cancel")}
        >
          <Text color="$error" bold>Cancel</Text>
        </Box>
      </Box>
      <Box height={1} />
      <Muted>Hold Alt and drag to override and select anyway.</Muted>
    </Box>
  )
}

/** Panel 3: Contained dialog (userSelect="contain") */
function ContainedDialogPanel(): React.ReactElement {
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="$warning" paddingX={1} flexGrow={1}>
      <H2 color="$warning">Contained Dialog</H2>
      <Small>userSelect="contain"</Small>
      <Box height={1} />
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor="$primary"
        paddingX={1}
        userSelect="contain"
      >
        <Text bold color="$primary">Selection Boundary</Text>
        <Box height={1} />
        <Text>This text is selectable, but selection cannot escape</Text>
        <Text>this container. Try dragging past the border — the</Text>
        <Text>selection will be clipped to this box.</Text>
        <Box height={1} />
        <Text color="$success">Useful for modal dialogs, side panes, and overlays.</Text>
      </Box>
    </Box>
  )
}

/** Panel 4: Find demo placeholder */
function FindPanel({ findActive, query, matchCount, currentMatch }: {
  findActive: boolean
  query: string
  matchCount: number
  currentMatch: number
}): React.ReactElement {
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="$border" paddingX={1} flexGrow={1}>
      <H2>Find in Buffer</H2>
      <Small>Ctrl+F to search, n/N navigate, Enter select, Esc close</Small>
      <Box height={1} />
      <Text>The terminal buffer supports text search. Press Ctrl+F to</Text>
      <Text>open the find bar. Type a query to highlight all matches.</Text>
      <Text>Use n to jump to the next match and N for the previous.</Text>
      <Text>Press Enter to select the current match for copying.</Text>
      <Box height={1} />
      <Text color="$muted">
        Silvery provides searchBuffer for visible content and FindProvider
        for virtual lists where off-screen items need model-level search.
      </Text>
      {findActive && (
        <>
          <Box height={1} />
          <Box gap={1}>
            <Text bold>Find:</Text>
            <Text color="$primary">{query}</Text>
            {matchCount > 0 ? (
              <Text color="$success">
                {currentMatch + 1}/{matchCount} matches
              </Text>
            ) : (
              <Text color="$error">no matches</Text>
            )}
          </Box>
        </>
      )}
    </Box>
  )
}

// ============================================================================
// Status bar
// ============================================================================

function StatusBar({
  lastAction,
  copied,
}: {
  lastAction: string | null
  copied: boolean
}): React.ReactElement {
  return (
    <Box flexDirection="row" gap={2} paddingX={1} flexShrink={0} userSelect="none">
      <Muted>
        <Kbd>Drag</Kbd> select <Kbd>Alt+Drag</Kbd> force select <Kbd>Ctrl+F</Kbd> find{" "}
        <Kbd>y</Kbd> copy <Kbd>q</Kbd> quit
      </Muted>
      {lastAction && (
        <Text color="$info">Action: {lastAction}</Text>
      )}
      {copied && (
        <Text color="$success" bold>Copied!</Text>
      )}
    </Box>
  )
}

// ============================================================================
// Main app
// ============================================================================

function TextSelectionDemo(): React.ReactElement {
  const [lastAction, setLastAction] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [findActive, setFindActive] = useState(false)
  const [findQuery, setFindQuery] = useState("")

  const handleAction = useCallback((label: string) => {
    setLastAction(label)
    // Clear after 2s
    setTimeout(() => setLastAction(null), 2000)
  }, [])

  useInput((input: string, key: Key) => {
    if (input === "q" || (key.escape && !findActive)) return "exit"

    // Copy feedback
    if (input === "y") {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
      return
    }

    // Find mode toggle
    if (key.ctrl && input === "f") {
      setFindActive(true)
      return
    }

    if (findActive) {
      if (key.escape) {
        setFindActive(false)
        setFindQuery("")
        return
      }
      if (key.backspace) {
        setFindQuery((q) => q.slice(0, -1))
        return
      }
      if (input && !key.ctrl && !key.meta) {
        setFindQuery((q) => q + input)
        return
      }
    }
  })

  return (
    <Box flexDirection="column" padding={1} gap={1} height="100%">
      <Box>
        <H1 color="$primary">Text Selection Demo</H1>
        <Muted> — all selection features in one place</Muted>
      </Box>

      {/* Top row: selectable text + non-selectable */}
      <Box flexDirection="row" gap={1} flexGrow={1}>
        <SelectableTextPanel />
        <NonSelectablePanel onAction={handleAction} />
      </Box>

      {/* Bottom row: contained dialog + find */}
      <Box flexDirection="row" gap={1} flexGrow={1}>
        <ContainedDialogPanel />
        <FindPanel
          findActive={findActive}
          query={findQuery}
          matchCount={findQuery.length > 0 ? 3 : 0}
          currentMatch={0}
        />
      </Box>

      <HR />

      <StatusBar lastAction={lastAction} copied={copied} />
    </Box>
  )
}

// ============================================================================
// Main
// ============================================================================

if (import.meta.main) {
  using handle = await run(
    <ExampleBanner
      meta={meta}
      controls="Drag select  Alt+Drag force select  Ctrl+F find  y copy  q quit"
    >
      <TextSelectionDemo />
    </ExampleBanner>,
    { mode: "fullscreen" },
  )
  await handle.waitUntilExit()
}
