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

<script setup>
import LiveDemo from '../.vitepress/components/LiveDemo.vue'
</script>

# Scrollback

Silvery is the only TUI framework with a dynamic scrollback system. Instead of taking over the alternate screen buffer, inline mode renders directly into the terminal's normal scrollback — your output becomes part of the terminal history, scrollable like any other command output. This is how tools like Claude Code, npm, and modern CLI tools should work.

<LiveDemo xtermSrc="/examples/showcase.html?demo=scroll" :height="400" />

ScrollbackList is part of Silvery's [list component family](/guide/scrolling#list-components) — see the scrolling guide for how it relates to `overflow="scroll"` and `VirtualList`.

## Why This Matters

Most TUI frameworks force you to choose: alternate screen (full-screen, no history) or raw stdout (scrollback, no interactivity). Silvery's inline mode gives you both: interactive rendering with layout, keyboard input, and live updates — that also becomes part of your terminal history.

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
      setEntries((prev) => [
        ...prev,
        { id, input: text, output: `Result: ${text.toUpperCase()}`, done: true },
      ])
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

## What Makes This Unique

No other TUI framework has this capability:

- **Ink** always uses alternate screen for full apps
- **Blessed** is alternate-screen only
- **Bubble Tea / Ratatui** are alternate-screen only
- **Textual** is alternate-screen only

Silvery's inline mode gives you the best of both worlds: rich interactive rendering that becomes part of your terminal history.

## Exercises

1. **Build a task runner** — Show tasks as they complete, freeze completed ones
2. **Build a test runner** — Stream test results with pass/fail coloring, freeze each suite
3. **Add search** — Press `/` to search through frozen scrollback entries
4. **Progress footer** — Show a progress bar in the pinned footer area
