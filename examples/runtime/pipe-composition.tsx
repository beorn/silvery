/**
 * Pipe Composition - Plugin System Example
 *
 * Demonstrates the full pipe() composition pattern — silvery's
 * plugin system for building apps from composable pieces.
 *
 * Each plugin is a function (app) => enhancedApp that adds one
 * capability. pipe() chains them left-to-right:
 *
 *   pipe(base, p1, p2, p3)  =  p3(p2(p1(base)))
 *
 * This example builds a selectable list using:
 *   - createApp()      — Zustand store for list state
 *   - withReact()      — binds the React element
 *   - withTerminal()   — binds stdin/stdout for terminal I/O
 *
 * Usage: bun examples/runtime/pipe-composition.tsx
 *
 * Controls:
 *   j/k       - Move selection down/up
 *   Space/x   - Toggle item
 *   a         - Add new item
 *   Esc/q     - Quit
 */

import React from "react"
import { Box, Text, H3, Muted, Small } from "../../src/index.js"
import { createApp, useApp } from "@silvery/term/runtime"
import { pipe, withReact, withTerminal } from "@silvery/tea/plugins"
import { ExampleBanner, type ExampleMeta } from "../_banner.js"

export const meta: ExampleMeta = {
  name: "Pipe Composition",
  description: "Plugin system: pipe() composes createApp + withReact + withTerminal",
  features: ["pipe()", "withReact()", "withTerminal()", "createApp()"],
}

// ============================================================================
// Types
// ============================================================================

interface ListItem {
  id: number
  label: string
  selected: boolean
}

interface State {
  items: ListItem[]
  cursor: number
  nextId: number
}

// ============================================================================
// Components
// ============================================================================

function Item({ item, isCursor }: { item: ListItem; isCursor: boolean }) {
  const check = item.selected ? "◉" : "○"
  return (
    <Box>
      <Text color={isCursor ? "$primary" : "$muted"}>{isCursor ? "❯ " : "  "}</Text>
      <Text color={item.selected ? "$success" : undefined}>
        {check} {item.label}
      </Text>
    </Box>
  )
}

function SelectableList() {
  const items = useApp((s: State) => s.items)
  const cursor = useApp((s: State) => s.cursor)

  const selectedCount = items.filter((i) => i.selected).length

  return (
    <Box flexDirection="column" padding={1}>
      <H3>Select items:</H3>
      <Text> </Text>
      {items.map((item, i) => (
        <Item key={item.id} item={item} isCursor={i === cursor} />
      ))}
      {items.length === 0 && <Muted>No items. Press 'a' to add one.</Muted>}
      <Text> </Text>
      <Muted>
        {selectedCount}/{items.length} selected
      </Muted>
      <Text> </Text>
      <Small>j/k: move • space/x: toggle • a: add • Esc/q: quit</Small>
    </Box>
  )
}

// ============================================================================
// App — the pipe() composition pattern
// ============================================================================

// Step 1: Define the app with createApp()
//
// createApp() takes a store factory and event handlers.
// It returns an AppDefinition with a run(element, options) method.
const baseApp = createApp<Record<string, unknown>, State>(
  // Store factory: (providers) => zustand StateCreator
  () => (set) => ({
    items: [
      { id: 1, label: "Read the docs", selected: false },
      { id: 2, label: "Try pipe() composition", selected: true },
      { id: 3, label: "Build something", selected: false },
      { id: 4, label: "Ship it", selected: false },
    ],
    cursor: 0,
    nextId: 5,
  }),

  // Event handlers: 'provider:event' → handler
  {
    "term:key": (
      data: unknown,
      { get, set }: { get: () => State; set: (fn: (s: State) => Partial<State>) => void },
    ) => {
      const { input: k, key } = data as { input: string; key: { escape: boolean } }
      const { items, cursor, nextId } = get()

      if (key.escape || k === "q") return "exit"

      switch (k) {
        case "j":
          set(() => ({ cursor: Math.min(cursor + 1, items.length - 1) }))
          break
        case "k":
          set(() => ({ cursor: Math.max(cursor - 1, 0) }))
          break
        case " ":
        case "x":
          set(() => ({
            items: items.map((item, i) =>
              i === cursor ? { ...item, selected: !item.selected } : item,
            ),
          }))
          break
        case "a":
          set(() => ({
            items: [...items, { id: nextId, label: `Item ${nextId}`, selected: false }],
            nextId: nextId + 1,
          }))
          break
      }
    },
  },
)

// Step 2: Compose with pipe()
//
// pipe() chains plugins left-to-right. Each plugin wraps run():
//   - withReact(<App />)    → binds the element, so run() needs no JSX
//   - withTerminal(process) → binds stdin/stdout, so run() needs no options
//
// The result is an app where run() takes no arguments.
const app = pipe(
  baseApp,
  withReact(
    <ExampleBanner meta={meta} controls="j/k move  space/x toggle  a add  Esc/q quit">
      <SelectableList />
    </ExampleBanner>,
  ),
  withTerminal(process),
)

// ============================================================================
// Main
// ============================================================================

async function main() {
  // Step 3: Run — no arguments needed, everything is composed
  const handle = await app.run()

  await handle.waitUntilExit()

  const { items } = handle.store.getState()
  const selected = items.filter((i) => i.selected)
  console.log(`\nSelected ${selected.length} items:`, selected.map((i) => i.label).join(", "))
}

if (import.meta.main) {
  main().catch(console.error)
}
