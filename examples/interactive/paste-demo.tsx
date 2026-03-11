/**
 * Bracketed Paste Demo
 *
 * Demonstrates bracketed paste mode — when text is pasted into the terminal,
 * it arrives as a single event rather than individual keystrokes. This prevents
 * pasted text from being interpreted as commands.
 *
 * Features:
 * - Shows paste mode status (always enabled with render())
 * - Displays pasted text as a single block event
 * - Shows character count and line count of pasted text
 * - Maintains a history of paste events
 *
 * Run: bun vendor/silvery/examples/interactive/paste-demo.tsx
 */

import React, { useState } from "react"
import { render, Box, Text, useInput, useApp, createTerm, type Key } from "../../src/index.js"
import { ExampleBanner, type ExampleMeta } from "../_banner.js"

export const meta: ExampleMeta = {
  name: "Bracketed Paste",
  description: "Receive pasted text as a single event via bracketed paste mode",
  features: ["onPaste", "useInput", "bracketed paste mode"],
}

// ============================================================================
// Types
// ============================================================================

interface PasteEvent {
  id: number
  text: string
  charCount: number
  lineCount: number
  timestamp: string
}

// ============================================================================
// Components
// ============================================================================

function PasteIndicator(): JSX.Element {
  return (
    <Box gap={1} paddingX={1}>
      <Text color="$success" bold>
        {"●"}
      </Text>
      <Text>Paste mode:</Text>
      <Text color="$success" bold>
        ENABLED
      </Text>
      <Text dim>(bracketed paste is automatic with render())</Text>
    </Box>
  )
}

function PasteEventCard({ event, isLatest }: { event: PasteEvent; isLatest: boolean }): JSX.Element {
  const preview = event.text.length > 60 ? event.text.slice(0, 57) + "..." : event.text
  const displayText = preview.replace(/\n/g, "\\n").replace(/\t/g, "\\t")

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={isLatest ? "$primary" : "$border"}
      paddingX={1}
      marginBottom={0}
    >
      <Box justifyContent="space-between">
        <Text bold color={isLatest ? "$primary" : "white"}>
          Paste #{event.id}
        </Text>
        <Text dim>{event.timestamp}</Text>
      </Box>
      <Box gap={2}>
        <Text dim>
          {event.charCount} char{event.charCount !== 1 ? "s" : ""}
        </Text>
        <Text dim>
          {event.lineCount} line{event.lineCount !== 1 ? "s" : ""}
        </Text>
      </Box>
      <Box marginTop={1}>
        <Text color="yellow">{displayText}</Text>
      </Box>
    </Box>
  )
}

function EmptyState(): JSX.Element {
  return (
    <Box flexDirection="column" padding={2} alignItems="center">
      <Text dim>No paste events yet.</Text>
      <Text dim italic>
        Try pasting some text from your clipboard!
      </Text>
      <Text dim italic>
        (Cmd+V on macOS, Ctrl+Shift+V on Linux)
      </Text>
    </Box>
  )
}

export function PasteDemo(): JSX.Element {
  const { exit } = useApp()
  const [pasteHistory, setPasteHistory] = useState<PasteEvent[]>([])
  const [nextId, setNextId] = useState(1)

  useInput(
    (input: string, key: Key) => {
      if (input === "q" || key.escape) {
        exit()
        return
      }

      // Clear history
      if (input === "x") {
        setPasteHistory([])
        setNextId(1)
      }
    },
    {
      onPaste: (text: string) => {
        const now = new Date()
        const timestamp = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}:${now.getSeconds().toString().padStart(2, "0")}`

        const event: PasteEvent = {
          id: nextId,
          text,
          charCount: text.length,
          lineCount: text.split("\n").length,
          timestamp,
        }

        setPasteHistory((prev) => [event, ...prev].slice(0, 10))
        setNextId((prev) => prev + 1)
      },
    },
  )

  return (
    <Box flexDirection="column" padding={1} gap={1}>
      <PasteIndicator />

      <Box flexDirection="column" borderStyle="round" borderColor="$primary" paddingX={1}>
        <Box marginBottom={1}>
          <Text bold color="$primary">
            Paste History
          </Text>
          <Text dim>
            {" "}
            — {pasteHistory.length} event{pasteHistory.length !== 1 ? "s" : ""}
          </Text>
        </Box>

        {pasteHistory.length === 0 ? (
          <EmptyState />
        ) : (
          <Box flexDirection="column" overflow="scroll" height={12} gap={1}>
            {pasteHistory.map((event, index) => (
              <PasteEventCard key={event.id} event={event} isLatest={index === 0} />
            ))}
          </Box>
        )}
      </Box>

      <Text dim>
        {" "}
        <Text bold dim>
          Paste text
        </Text>{" "}
        to see events{" "}
        <Text bold dim>
          x
        </Text>{" "}
        clear{" "}
        <Text bold dim>
          Esc/q
        </Text>{" "}
        quit
      </Text>
    </Box>
  )
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  using term = createTerm()
  const { waitUntilExit } = await render(
    <ExampleBanner meta={meta} controls="Paste text to see events  x clear  Esc/q quit">
      <PasteDemo />
    </ExampleBanner>,
    term,
  )
  await waitUntilExit()
}

if (import.meta.main) {
  main().catch(console.error)
}
