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
 * Run: bun vendor/silvery/examples/apps/paste-demo.tsx
 */

import React, { useState } from "react"
import {
  render,
  Box,
  Text,
  H1,
  Small,
  Kbd,
  Muted,
  Lead,
  useInput,
  useApp,
  createTerm,
  type Key,
} from "silvery"
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

function PasteIndicator() {
  return (
    <Box gap={1} paddingX={1}>
      <Text color="$success" bold>
        {"●"}
      </Text>
      <Text>Paste mode:</Text>
      <Text color="$success" bold>
        ENABLED
      </Text>
      <Muted>(bracketed paste is automatic with render())</Muted>
    </Box>
  )
}

function PasteEventCard({ event, isLatest }: { event: PasteEvent; isLatest: boolean }) {
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
        <H1 color={isLatest ? "$primary" : "white"}>Paste #{event.id}</H1>
        <Small>{event.timestamp}</Small>
      </Box>
      <Box gap={2}>
        <Small>
          {event.charCount} char{event.charCount !== 1 ? "s" : ""}
        </Small>
        <Small>
          {event.lineCount} line{event.lineCount !== 1 ? "s" : ""}
        </Small>
      </Box>
      <Box marginTop={1}>
        <Text color="yellow">{displayText}</Text>
      </Box>
    </Box>
  )
}

function EmptyState() {
  return (
    <Box flexDirection="column" padding={2} alignItems="center">
      <Muted>No paste events yet.</Muted>
      <Lead>Try pasting some text from your clipboard!</Lead>
      <Lead>(Cmd+V on macOS, Ctrl+Shift+V on Linux)</Lead>
    </Box>
  )
}

export function PasteDemo() {
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
          <H1>Paste History</H1>
          <Small>
            {" "}
            — {pasteHistory.length} event{pasteHistory.length !== 1 ? "s" : ""}
          </Small>
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

      <Muted>
        {" "}
        <Kbd>Paste text</Kbd> to see events <Kbd>x</Kbd> clear <Kbd>Esc/q</Kbd> quit
      </Muted>
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
