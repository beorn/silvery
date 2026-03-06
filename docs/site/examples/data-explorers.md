---
title: Building Data Explorers & Tables with hightea
description: Build terminal data explorers with sortable tables, virtual lists, responsive layouts, and real-time filtering using hightea.
prev:
  text: Developer Tools
  link: /examples/developer-tools
next: false
---

<script setup>
import LiveDemo from '../.vitepress/components/LiveDemo.vue'
</script>

# Data Explorers & Tables

Terminal data explorers need to handle thousands of rows, resize gracefully across terminal widths, and respond instantly to search queries. hightea provides the primitives that make this straightforward: a `Table` component with column alignment, `VirtualList` for constant-memory rendering of massive datasets, `useContentRect()` for responsive column sizing, and `TextInput` for real-time filtering.

<LiveDemo xtermSrc="/examples/showcase.html?demo=data-explorer" :height="400" />

## Key Benefits

- **Table component** -- Built-in `Table` with header alignment, column separators, and per-column `align` ("left", "right", "center"). Define columns declaratively with `{ header, key, width, align }` and pass your data array. Column widths auto-size to content when omitted, or accept explicit widths for fixed layouts.

- **VirtualList for massive datasets** -- Render millions of rows with constant memory. `VirtualList` only mounts React elements for the visible viewport plus a configurable overscan buffer. Items above and below are replaced with placeholder boxes that maintain scroll position. Supports fixed and variable-height items, gap/separator rendering, and imperative `scrollToItem()`.

- **Layout feedback with `useContentRect()`** -- Components query their computed dimensions at render time. Columns auto-size to the available terminal width without hardcoded values. When the terminal resizes, every component re-renders with updated dimensions. No width prop drilling through the tree.

- **TextInput for search and filtering** -- Combine `TextInput` with `useDeferredValue` and `useTransition` from React 19 to build responsive filter interfaces. The input stays snappy while expensive filtering runs at lower priority, keeping the UI non-blocking even with large datasets.

- **Inline images** -- Display thumbnails directly in table rows using the `Image` component. hightea auto-detects Kitty graphics or Sixel protocol support and falls back to text placeholders in unsupported terminals.

## Example: Process Explorer

A complete data explorer with search filtering, a sortable table, and responsive column widths.

```tsx
import { useState, useDeferredValue } from "react"
import { Box, Text, Table, TextInput, useContentRect } from "@hightea/term"
import { run, useInput } from "@hightea/term/runtime"

// Sample data -- replace with your own data source
const processes = Array.from({ length: 500 }, (_, i) => ({
  pid: 1000 + i,
  name: ["node", "bun", "vim", "zsh", "git", "ssh", "tmux"][i % 7],
  cpu: (Math.random() * 100).toFixed(1),
  mem: (Math.random() * 8192).toFixed(0),
  status: i % 5 === 0 ? "sleeping" : "running",
}))

function App() {
  const { width } = useContentRect()
  const [query, setQuery] = useState("")
  const deferredQuery = useDeferredValue(query)
  const [selected, setSelected] = useState(0)

  // Filter rows against the deferred query so typing stays responsive
  const filtered = processes.filter(
    (p) => p.name.includes(deferredQuery) || String(p.pid).includes(deferredQuery) || p.status.includes(deferredQuery),
  )

  useInput((input, key) => {
    if (key.downArrow) setSelected((s) => Math.min(s + 1, filtered.length - 1))
    if (key.upArrow) setSelected((s) => Math.max(s - 1, 0))
    if (input === "q") return "exit"
  })

  // Responsive column widths based on available terminal width
  const nameWidth = Math.max(8, Math.floor(width * 0.3))
  const statusWidth = Math.max(8, Math.floor(width * 0.2))

  return (
    <Box flexDirection="column" width="100%" height="100%">
      <Box paddingX={1} height={1}>
        <Text bold>Filter: </Text>
        <TextInput value={query} onChange={setQuery} placeholder="Search by name, PID, or status..." />
      </Box>

      <Box paddingX={1} flexGrow={1}>
        <Table
          columns={[
            { header: "PID", key: "pid", width: 7, align: "right" },
            { header: "Name", key: "name", width: nameWidth },
            { header: "CPU %", key: "cpu", width: 8, align: "right" },
            { header: "Mem MB", key: "mem", width: 9, align: "right" },
            { header: "Status", key: "status", width: statusWidth },
          ]}
          data={filtered}
        />
      </Box>

      <Box paddingX={1} height={1}>
        <Text dimColor>
          {filtered.length} / {processes.length} processes | q to quit
        </Text>
      </Box>
    </Box>
  )
}

await run(<App />)
```

This example demonstrates several patterns working together:

- **`useContentRect()`** provides the terminal width so `nameWidth` and `statusWidth` scale proportionally. Resize your terminal and the columns adapt.
- **`useDeferredValue`** keeps the `TextInput` responsive. Typing updates the input immediately while the expensive `filter()` over 500 rows runs at lower priority.
- **`Table`** renders aligned columns with right-justified numeric fields and a header separator line. No manual padding calculations.
- **`useInput`** handles navigation and exit alongside the text input.

For datasets larger than a few hundred rows, wrap the table body in a `VirtualList` to keep memory constant:

```tsx
<VirtualList
  items={filtered}
  height={terminalHeight - 4}
  itemHeight={1}
  scrollTo={selected}
  renderItem={(row, index) => <Text inverse={index === selected}>{formatRow(row, columns)}</Text>}
/>
```

## What hightea Adds

Data explorers need responsive tables, large dataset handling, and non-blocking search. hightea ships these as first-party components: `Table` handles column alignment and headers, `VirtualList` renders large datasets with constant memory, `useContentRect()` gives responsive column widths without prop threading, and React 19 support unlocks `useDeferredValue` and `useTransition` for keeping filter UIs responsive under load.

## Get Started

Install hightea and build your first data explorer in minutes:

```bash
bun add @hightea/term react flexture
```

Follow the [Getting Started guide](/guide/getting-started) for a full walkthrough, or explore the [Components](/guide/components) reference.
