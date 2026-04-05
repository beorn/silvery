---
title: Scrollback — Dynamic Inline Mode (Unique Feature)
description: Silvery's unique scrollback system — inline mode rendering, ScrollbackList/ScrollbackView, freeze-and-scroll, and natural terminal scrolling.
prev:
  text: Tables & Data
  link: /examples/tables
next:
  text: Terminal Protocols
  link: /examples/terminal
---

# Scrollback

::: code-group

```bash [npm]
npx silvery examples scrollback
```

```bash [bun]
bunx silvery examples scrollback
```

```bash [pnpm]
pnpm dlx silvery examples scrollback
```

```bash [vp]
vp silvery examples scrollback
```

:::

Terminal apps that produce output users want to review later — AI agents, test runners, build tools — have a fundamental problem. Traditional TUI frameworks render on the alternate screen buffer, which means the output vanishes when the app exits. You can't scroll back through it, can't Cmd+F to search it, can't select and copy across multiple screens of output.

The usual alternative is raw stdout: just print lines. But then you lose layout, live updates, keyboard input, and interactivity.

Silvery's inline mode gives you both: interactive React rendering with layout and live updates, where completed output graduates into the terminal's native scrollback. The output becomes part of your terminal history — scrollable, searchable, selectable.

ScrollbackList is part of Silvery's [list component family](/guide/scrolling#list-components) — see the scrolling guide for how it relates to `overflow="scroll"` and `VirtualList`.

## The Problem

Most terminal apps that stream output face a tradeoff:

**Alternate screen** (what most TUI frameworks use): You get full layout control and interactivity, but everything disappears on exit. No scrollback, no search, no text selection across the history.

**Raw stdout** (what simpler CLIs do): Output persists in scrollback, but you lose layout, live updates, and keyboard-driven interaction. Redraws cause flickering because there's no incremental rendering — the app redraws everything from scratch.

**Inline rendering without layout feedback** causes a third problem: the app doesn't know how much space it has, so it can't make layout decisions (how wide to render a table, when to truncate, how many columns to show). This leads to either hardcoded widths or a render → measure → re-render cycle that flickers on every update.

Silvery solves all three by combining inline mode (render into normal scrollback) with layout-first rendering (components know their width) and incremental updates (only changed cells are rewritten).

### ScrollbackList

Renders a list of items where completed items "freeze" into the scrollback and new items appear at the bottom. The frozen items scroll naturally with the terminal:

```tsx
<ScrollbackList
  items={items}
  keyExtractor={(item) => item.id}
  isFrozen={(item) => item.done}
  markers={true}
  footer={<StatusBar />}
>
  {(item) => <ItemView item={item} />}
</ScrollbackList>
```

### ScrollbackView

Auto-sizes to its content — no manual height management. The output phase caps output at terminal height independently, so content that exceeds the terminal causes natural scrolling:

```tsx
function App() {
  return (
    <ScrollbackView footer={<StatusBar />}>
      <Content />
    </ScrollbackView>
  )
}

await render(<App />, term, { mode: "inline" })
```

## Key Benefits

- **Natural terminal history** — Output stays in scrollback. Scroll up to see earlier output, just like regular commands.
- **Freeze-and-scroll** — Completed items freeze into scrollback while active items stay interactive at the bottom.
- **No height management** — ScrollbackView/ScrollbackList auto-size to content. The runtime caps output at terminal height automatically.
- **Incremental inline rendering** — Instance-scoped cursor tracking produces 28–192x fewer bytes than full re-renders.
- **Footer pinning** — Status bars and input areas stay pinned at the bottom of the viewport.
- **Piped output** — Inline mode detects non-TTY output and strips control sequences automatically.

## Source Code

A REPL-style interface using ScrollbackList:

::: code-group

```tsx [repl.tsx]
import { useState, useCallback } from "react"
import { Box, Text, TextInput, ScrollbackList, render, createTerm } from "silvery"

interface Entry {
  id: number
  input: string
  output: string
  done: boolean
}

function REPL() {
  const [entries, setEntries] = useState<Entry[]>([])
  const [input, setInput] = useState("")
  let nextId = entries.length

  const handleSubmit = useCallback(
    (text: string) => {
      if (!text.trim()) return
      setInput("")
      const id = nextId++
      // Add entry, simulate processing, then freeze
      setEntries((prev) => [...prev, { id, input: text, output: `Result: ${text.toUpperCase()}`, done: true }])
    },
    [nextId],
  )

  return (
    <ScrollbackList
      items={entries}
      keyExtractor={(e) => String(e.id)}
      isFrozen={(e) => e.done}
      footer={
        <Box borderStyle="round" borderColor="$primary" paddingX={1}>
          <TextInput
            value={input}
            onChange={setInput}
            onSubmit={handleSubmit}
            prompt="> "
            placeholder="Type a command..."
          />
        </Box>
      }
    >
      {(entry) => (
        <Box flexDirection="column">
          <Text color="$primary">&gt; {entry.input}</Text>
          <Text color="$success">{entry.output}</Text>
        </Box>
      )}
    </ScrollbackList>
  )
}

using term = createTerm()
await render(<REPL />, term, { mode: "inline" })
```

:::

## Key Patterns

### Inline Mode Rendering

Pass `{ mode: "inline" }` to render in the normal scrollback instead of the alternate screen:

```tsx
await render(<App />, term, { mode: "inline" })
```

### Freeze-and-Scroll

The `isFrozen` callback controls which items are "done" and can be scrolled past:

```tsx
<ScrollbackList items={items} isFrozen={(item) => item.status === "complete"}>
  {(item) => <ItemView item={item} />}
</ScrollbackList>
```

### Piped Output Detection

Inline mode auto-detects when stdout is not a TTY and strips ANSI control sequences:

```tsx
// This works in both TTY and piped output:
bun my-app.tsx           # Interactive with colors
bun my-app.tsx | head    # Clean text, no escape sequences
```

## Features Used

| Feature          | Usage                                  |
| ---------------- | -------------------------------------- |
| `ScrollbackList` | Freeze-and-scroll item list            |
| `ScrollbackView` | Auto-sizing inline container           |
| `mode: "inline"` | Render in normal scrollback            |
| `isFrozen`       | Control which items are done           |
| `footer`         | Pinned input area at bottom            |
| `markers`        | Visual separators between frozen items |

## How It's Different

The combination of three features makes this work:

1. **Inline mode** — renders into normal scrollback, not the alternate screen
2. **Layout-first rendering** — components know their width via `useContentRect()`, so layout decisions happen correctly on the first paint without a measure-then-rerender cycle
3. **Incremental rendering** — only changed cells are rewritten, so live updates don't cause the flickering you'd get from redrawing everything

Without all three, inline rendering either loses interactivity (raw stdout), loses history (alternate screen), or flickers on every update (naive redraws).

## Exercises

1. **Build a task runner** — Show tasks as they complete, freeze completed ones
2. **Build a test runner** — Stream test results with pass/fail coloring, freeze each suite
3. **Add search** — Press `/` to search through frozen scrollback entries
4. **Progress footer** — Show a progress bar in the pinned footer area
