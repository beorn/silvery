---
title: Building Developer Tools with inkx
description: Build terminal REPLs, log viewers, and debuggers with virtual lists, command palettes, and Playwright-style testing using inkx.
---

# Building Developer Tools with inkx

Terminal-based developer tools -- REPLs, log viewers, debuggers, profilers -- demand fast rendering of large data streams, responsive keyboard shortcuts, and composable UI panels. inkx provides the primitives to build these tools as React components with real layout feedback, virtualized scrolling, and a testable command system.

Unlike browser-based dev tools, terminal tools run where your code runs. They start instantly, consume minimal resources, and integrate directly with stdin/stdout pipelines. inkx makes building them practical by handling the hard parts: efficient rendering of thousands of lines, keyboard protocol support across terminals, and deterministic testing without a real terminal.

## Key Benefits

- **Console component** -- Captures `console.log`, `console.error`, and `console.warn` output via `patchConsole()` and renders it within your TUI layout. Display captured output side-by-side with other panels instead of losing it to raw stdout. Supports custom rendering via a render prop for color-coded log levels.

- **VirtualList** -- Renders thousands of log lines, stack frames, or profiler entries with O(1) scroll performance. Only items within the visible viewport (plus configurable overscan) are mounted as React elements. Variable item heights, frozen row prefixes, and overflow indicators are built in.

- **Hotkey parsing** -- Define keyboard shortcuts using macOS modifier symbols: `parseHotkey("⌘K")`, `matchHotkey(hotkey, key)`. Supports all modifier combinations including Ctrl, Shift, Alt/Option, Cmd/Super, and Hyper via the Kitty keyboard protocol. Build professional shortcut systems without manual key code parsing.

- **Plugin composition** -- `withCommands` gives your tool a command registry with metadata (name, description, bound keys) and a `cmd` proxy for direct invocation. `withKeybindings` routes key presses to commands via context-aware binding resolution. Together they provide a command palette and customizable shortcuts with zero boilerplate.

- **Playwright-style testing** -- `createRenderer` returns an app handle with `press()`, `getByTestId()`, `locator()`, and `text` for automated testing of your dev tool. Write fast, deterministic tests that verify both rendering output and keyboard interaction without spawning a real terminal.

## Code Example

A log viewer with captured console output, a virtualized log list, and keyboard navigation:

```tsx
import { useState, useCallback } from "react"
import { Box, Text, VirtualList, Console, patchConsole } from "inkx"
import { run, useInput } from "inkx/runtime"

interface LogEntry {
  time: string
  level: "info" | "warn" | "error"
  message: string
}

function LogViewer() {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [selected, setSelected] = useState(0)
  const [patched] = useState(() => patchConsole(console))

  // Simulate incoming log entries
  const addLog = useCallback((level: LogEntry["level"], message: string) => {
    const time = new Date().toISOString().slice(11, 23)
    setLogs((prev) => [...prev, { time, level, message }])
  }, [])

  useInput((input, key) => {
    if (input === "j" || key.downArrow) {
      setSelected((s) => Math.min(s + 1, logs.length - 1))
    }
    if (input === "k" || key.upArrow) {
      setSelected((s) => Math.max(s - 1, 0))
    }
    if (input === "i") addLog("info", `Request handled in ${Math.random() * 100 | 0}ms`)
    if (input === "w") addLog("warn", "Connection pool near capacity")
    if (input === "e") addLog("error", "Timeout after 30s on /api/data")
    if (input === "q") return "exit"
  })

  const levelColor = (level: string) =>
    level === "error" ? "red" : level === "warn" ? "yellow" : "green"

  return (
    <Box flexDirection="row" width="100%" height="100%">
      <Box flexDirection="column" flexGrow={2} borderStyle="single">
        <Text bold> Log Entries ({logs.length}) </Text>
        <VirtualList
          items={logs}
          height={18}
          itemHeight={1}
          scrollTo={selected}
          renderItem={(entry, index) => (
            <Text
              key={index}
              inverse={index === selected}
              color={levelColor(entry.level)}
            >
              {entry.time} [{entry.level.toUpperCase().padEnd(5)}] {entry.message}
            </Text>
          )}
        />
      </Box>
      <Box flexDirection="column" flexGrow={1} borderStyle="single">
        <Text bold> Console Output </Text>
        <Console console={patched} />
      </Box>
    </Box>
  )
}

await run(<LogViewer />)
```

Press `i`, `w`, or `e` to add log entries at different severity levels. Use `j`/`k` or arrow keys to scroll through the virtualized list. Press `q` to exit. Console output from `console.log()` calls appears in the right panel, captured by the `Console` component.

## Testing Your Dev Tool

inkx ships with a Playwright-style testing API. Verify rendering and keyboard interaction without a real terminal:

```tsx
import { createRenderer } from "inkx/testing"
import { expect, test } from "vitest"

const render = createRenderer({ cols: 100, rows: 24 })

test("log viewer navigates entries", async () => {
  const app = render(<LogViewer />)

  // Add some entries
  await app.press("i")
  await app.press("e")
  await app.press("w")

  expect(app.text).toContain("INFO")
  expect(app.text).toContain("ERROR")

  // Navigate down
  await app.press("j")
  await app.press("j")

  expect(app.text).toContain("WARN")
})
```

## What inkx Adds

Developer tools need to handle large datasets, complex shortcuts, and automated testing. inkx ships the building blocks: `VirtualList` renders thousands of log lines with constant memory, the command system wires shortcuts to actions declaratively with introspection for free, and the Playwright-style testing API (`createRenderer`, `press()`, `getByTestId`) lets you write automated tests without custom harnesses.

## Get Started

Install inkx and build your first developer tool:

```bash
bun add inkx
```

Follow the [Getting Started guide](/guide/getting-started) to set up your project, then explore the [Components reference](/guide/components) for the full API.
