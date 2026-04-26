/**
 * TextArea Example — Split-Pane Note Editor
 *
 * A note-taking app demonstrating:
 * - Multi-line text input with word wrapping and pre-filled content
 * - Split-pane layout: editor (2/3) + saved notes sidebar (1/3)
 * - Tab focus cycling between panes
 * - Cursor movement (arrow keys, Home/End, Ctrl+A/E)
 * - Kill operations (Ctrl+K, Ctrl+U)
 * - Word/character stats in the header
 * - Submit with Ctrl+Enter to collect notes
 */

import React, { useState } from "react"
import {
  render,
  Box,
  Text,
  H1,
  Strong,
  Muted,
  TextArea,
  useInput,
  useApp,
  createTerm,
  type Key,
} from "silvery"
import { ExampleBanner, type ExampleMeta } from "../_banner.js"

export const meta: ExampleMeta = {
  name: "TextArea",
  description: "Split-pane note editor with word wrap, kill ring, and note collection",
  features: ["TextArea", "Split pane layout", "Ctrl+Enter submit", "Tab focus cycling"],
}

const INITIAL_CONTENT = `# Release Notes — Silvery v0.1

## New Features

- **Flexbox layout engine** — CSS-compatible sizing,
  wrapping, and gap support via Flexily
- **84 built-in color schemes** — from Dracula
  to Solarized, Nord to Catppuccin
- **Incremental rendering** — only changed cells
  are repainted, no full-screen flicker

## Breaking Changes

- Dropped Node.js 18 support (now requires >=20)
- Renamed \`useTerminal()\` to \`useTerm()\`

## Performance

Benchmark results on an M4 MacBook Pro:
  Initial render:  2.1ms (80x24)
  Incremental:     0.3ms (typical diff)
  Layout:          0.8ms (1000 nodes)

Thanks to all contributors!`

export function NoteEditor() {
  const { exit } = useApp()
  const [notes, setNotes] = useState<string[]>([])
  const [value, setValue] = useState(INITIAL_CONTENT)
  const [focusIndex, setFocusIndex] = useState(0)

  useInput((input: string, key: Key) => {
    if (key.escape) {
      exit()
    }
    if (key.tab && !key.shift) {
      setFocusIndex((prev) => (prev + 1) % 2)
    }
    if (key.tab && key.shift) {
      setFocusIndex((prev) => (prev - 1 + 2) % 2)
    }
  })

  function handleSubmit(text: string) {
    if (text.trim()) {
      setNotes((prev) => [...prev, text.trim()])
      setValue("")
    }
  }

  const lines = value.split("\n").length
  const chars = value.length
  const words = value.split(/\s+/).filter(Boolean).length

  return (
    <Box flexDirection="column" flexGrow={1} padding={1}>
      <Box flexDirection="row" gap={1} flexGrow={1}>
        {/* Main editor */}
        <Box
          borderStyle="round"
          borderColor={focusIndex === 0 ? "$fg-accent" : "$border-default"}
          flexDirection="column"
          flexGrow={3}
          flexBasis={0}
        >
          <Box paddingX={1} justifyContent="space-between">
            <H1>Editor</H1>
            <Muted>
              {lines} lines, {words} words, {chars} chars
            </Muted>
          </Box>
          <Text> </Text>
          <Box paddingX={1} flexGrow={1}>
            <TextArea
              value={value}
              onChange={setValue}
              onSubmit={handleSubmit}
              fieldSizing="fixed"
              rows={16}
              isActive={focusIndex === 0}
            />
          </Box>
        </Box>

        {/* Saved notes sidebar */}
        <Box
          borderStyle="round"
          borderColor={focusIndex === 1 ? "$fg-accent" : "$border-default"}
          flexDirection="column"
          flexGrow={2}
          flexBasis={0}
        >
          <Box paddingX={1}>
            <H1>Notes</H1>
            <Muted> ({notes.length})</Muted>
          </Box>
          <Text> </Text>
          <Box flexDirection="column" paddingX={1} overflow="scroll" flexGrow={1}>
            {notes.length === 0 ? (
              <Muted>No notes yet.</Muted>
            ) : (
              notes.map((note, i) => (
                <Box key={i} flexDirection="column" marginBottom={1}>
                  <Text wrap="truncate">
                    <Strong color="$fg-success">#{i + 1}</Strong> {note.split("\n")[0]}
                  </Text>
                  <Muted>
                    {note.split("\n").length} lines, {note.length} chars
                  </Muted>
                </Box>
              ))
            )}
          </Box>
        </Box>
      </Box>
    </Box>
  )
}

export async function main() {
  using term = createTerm()
  const { waitUntilExit } = await render(
    <ExampleBanner meta={meta} controls="Tab switch pane  Ctrl+Enter submit  Esc quit">
      <NoteEditor />
    </ExampleBanner>,
    term,
  )
  await waitUntilExit()
}
