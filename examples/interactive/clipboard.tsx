/**
 * OSC 52 Clipboard Demo
 *
 * Shows copy/paste across terminal sessions using the OSC 52 protocol.
 * Select items from a list, copy them to the system clipboard, and
 * request clipboard contents back — all without native clipboard access.
 *
 * Features:
 * - Navigate a list of items with j/k
 * - Press c to copy selected item via OSC 52
 * - Press v to request clipboard contents
 * - Status bar shows last copied/pasted text
 *
 * Run: bun vendor/silvery/examples/interactive/clipboard.tsx
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
  useStdout,
  createTerm,
  copyToClipboard,
  requestClipboard,
  parseClipboardResponse,
  type Key,
} from "../../src/index.js"
import { ExampleBanner, type ExampleMeta } from "../_banner.js"

export const meta: ExampleMeta = {
  name: "Clipboard (OSC 52)",
  description: "Copy/paste via OSC 52 terminal protocol",
  features: ["copyToClipboard()", "requestClipboard()", "parseClipboardResponse()", "useStdout"],
}

// ============================================================================
// Data
// ============================================================================

const items = [
  { category: "Colors", values: ["Crimson", "Cerulean", "Chartreuse", "Coral", "Cobalt", "Cyan"] },
  { category: "Languages", values: ["TypeScript", "Rust", "Elixir", "Haskell", "Zig", "OCaml"] },
  {
    category: "Fruits",
    values: ["Mango", "Passionfruit", "Dragon fruit", "Starfruit", "Lychee", "Rambutan"],
  },
]

const allItems = items.flatMap((group) => group.values.map((value) => ({ category: group.category, value })))

// ============================================================================
// Components
// ============================================================================

function ListItem({ item, isSelected }: { item: (typeof allItems)[0]; isSelected: boolean }): JSX.Element {
  return (
    <Box paddingX={1}>
      <Text
        color={isSelected ? "$bg" : undefined}
        backgroundColor={isSelected ? "$primary" : undefined}
        bold={isSelected}
      >
        {isSelected ? " > " : "   "}
        {item.value}
      </Text>
      <Small> ({item.category})</Small>
    </Box>
  )
}

function StatusBar({ lastCopied, lastPasted }: { lastCopied: string | null; lastPasted: string | null }): JSX.Element {
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="$border" paddingX={1}>
      <Box gap={1}>
        <Muted>Copied:</Muted>
        {lastCopied ? <Text color="$success">{lastCopied}</Text> : <Lead>nothing yet</Lead>}
      </Box>
      <Box gap={1}>
        <Muted>Pasted:</Muted>
        {lastPasted ? <Text color="$warning">{lastPasted}</Text> : <Lead>nothing yet</Lead>}
      </Box>
    </Box>
  )
}

export function ClipboardDemo(): JSX.Element {
  const { exit } = useApp()
  const { stdout } = useStdout()
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [lastCopied, setLastCopied] = useState<string | null>(null)
  const [lastPasted, setLastPasted] = useState<string | null>(null)

  useInput((input: string, key: Key) => {
    if (input === "q" || key.escape) {
      exit()
      return
    }

    // Navigation
    if (key.upArrow || input === "k") {
      setSelectedIndex((prev) => Math.max(0, prev - 1))
    }
    if (key.downArrow || input === "j") {
      setSelectedIndex((prev) => Math.min(allItems.length - 1, prev + 1))
    }

    // Copy selected item
    if (input === "c") {
      const text = allItems[selectedIndex]!.value
      copyToClipboard(stdout, text)
      setLastCopied(text)
    }

    // Request clipboard
    if (input === "v") {
      requestClipboard(stdout)
      // Note: The terminal responds with an OSC 52 sequence containing
      // the clipboard contents. In a real app you'd parse stdin for the
      // response using parseClipboardResponse(). For this demo we just
      // show that the request was sent.
      setLastPasted("(request sent — check terminal)")
    }

    // Try to parse clipboard response from raw input
    const parsed = parseClipboardResponse(input)
    if (parsed) {
      setLastPasted(parsed)
    }
  })

  return (
    <Box flexDirection="column" padding={1} gap={1}>
      <Box flexDirection="column" borderStyle="round" borderColor="$primary" paddingX={1}>
        <Box marginBottom={1}>
          <H1>Items</H1>
          <Small>
            {" "}
            — {selectedIndex + 1}/{allItems.length}
          </Small>
        </Box>
        <Box flexDirection="column" overflow="scroll" scrollTo={selectedIndex} height={10}>
          {allItems.map((item, index) => (
            <ListItem key={`${item.category}-${item.value}`} item={item} isSelected={index === selectedIndex} />
          ))}
        </Box>
      </Box>

      <StatusBar lastCopied={lastCopied} lastPasted={lastPasted} />

      <Muted>
        {" "}
        <Kbd>j/k</Kbd> navigate <Kbd>c</Kbd> copy <Kbd>v</Kbd> paste <Kbd>Esc/q</Kbd> quit
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
    <ExampleBanner meta={meta} controls="j/k navigate  c copy  v paste  Esc/q quit">
      <ClipboardDemo />
    </ExampleBanner>,
    term,
  )
  await waitUntilExit()
}

if (import.meta.main) {
  main().catch(console.error)
}
