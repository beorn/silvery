---
title: Tables & Data — Table, VirtualList, Search & Sort
description: Build terminal data explorers with sortable tables, virtual lists, responsive layouts, and real-time filtering using Silvery.
prev:
  text: Forms & Input
  link: /examples/forms
next:
  text: Scrollback
  link: /examples/scrollback
---

# Tables & Data

::: code-group

```bash [npm]
npx @silvery/examples data-explorer
```

```bash [bun]
bunx @silvery/examples data-explorer
```

```bash [pnpm]
pnpm dlx @silvery/examples data-explorer
```

```bash [vp]
vp @silvery/examples data-explorer
```

:::

Terminal data explorers need to handle thousands of rows, resize gracefully across terminal widths, and respond instantly to search queries. Silvery provides the primitives: a `Table` component with column alignment, `VirtualList` for constant-memory rendering of massive datasets, `useBoxRect()` for responsive column sizing, and `TextInput` for real-time filtering.

## Key Benefits

- **Table component** — Built-in `Table` with header alignment, column separators, and per-column `align` ("left", "right", "center"). Column widths auto-size to content when omitted, or accept explicit widths.

- **VirtualList for massive datasets** — Render millions of rows with constant memory. Only items within the visible viewport (plus configurable overscan) are mounted. Supports fixed and variable-height items, gap/separator rendering, and imperative `scrollToItem()`.

- **Responsive with `useBoxRect()`** — Components query their computed dimensions at render time. Columns auto-size to the terminal width. No width prop drilling.

- **TextInput for search** — Combine `TextInput` with `useDeferredValue` from React 19 to build responsive filter interfaces. The input stays snappy while expensive filtering runs at lower priority.

- **Inline images** — Display thumbnails in table rows using the `Image` component. Silvery auto-detects Kitty graphics or Sixel protocol support.

## Source Code

A process explorer with search filtering, a sortable table, and responsive columns:

::: code-group

```tsx [explorer.tsx]
import { useState, useDeferredValue } from "react"
import {
  Box,
  Text,
  Table,
  TextInput,
  VirtualList,
  useBoxRect,
  render,
  useApp,
  createTerm,
} from "silvery"

// Sample data — replace with your own data source
const processes = Array.from({ length: 500 }, (_, i) => ({
  pid: 1000 + i,
  name: ["node", "bun", "vim", "zsh", "git", "ssh", "tmux"][i % 7],
  cpu: (Math.random() * 100).toFixed(1),
  mem: (Math.random() * 8192).toFixed(0),
  status: i % 5 === 0 ? "sleeping" : "running",
}))

function App() {
  const { exit } = useApp()
  const { width, height } = useBoxRect()
  const [query, setQuery] = useState("")
  const deferredQuery = useDeferredValue(query)

  // Filter rows against the deferred query so typing stays responsive
  const filtered = processes.filter(
    (p) =>
      p.name.includes(deferredQuery) ||
      String(p.pid).includes(deferredQuery) ||
      p.status.includes(deferredQuery),
  )

  // Responsive column widths
  const nameWidth = Math.max(8, Math.floor(width * 0.3))
  const statusWidth = Math.max(8, Math.floor(width * 0.2))

  return (
    <Box flexDirection="column" width="100%" height="100%">
      <Box paddingX={1} height={1}>
        <Text bold>Filter: </Text>
        <TextInput
          value={query}
          onChange={setQuery}
          placeholder="Search by name, PID, or status..."
        />
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
          {filtered.length} / {processes.length} processes | q quit
        </Text>
      </Box>
    </Box>
  )
}

using term = createTerm()
await render(<App />, term)
```

:::

## Key Patterns

### Responsive Column Widths

`useBoxRect()` gives the terminal width at render time. Columns scale proportionally:

```tsx
const { width } = useBoxRect()
const nameWidth = Math.max(8, Math.floor(width * 0.3))
const statusWidth = Math.max(8, Math.floor(width * 0.2))
```

### Deferred Search

`useDeferredValue` keeps the TextInput responsive while filtering large datasets:

```tsx
const [query, setQuery] = useState("")
const deferredQuery = useDeferredValue(query)
const filtered = data.filter((row) => row.name.includes(deferredQuery))
```

### VirtualList for Large Datasets

For thousands of rows, wrap in a VirtualList to keep memory constant:

```tsx
<VirtualList
  items={filtered}
  height={terminalHeight - 4}
  itemHeight={1}
  scrollTo={selected}
  renderItem={(row, index) => <Text inverse={index === selected}>{formatRow(row)}</Text>}
/>
```

### Table with Aligned Columns

The Table component handles header alignment and separators:

```tsx
<Table
  columns={[
    { header: "PID", key: "pid", width: 7, align: "right" },
    { header: "Name", key: "name", width: nameWidth },
    { header: "CPU %", key: "cpu", width: 8, align: "right" },
    { header: "Status", key: "status", width: statusWidth },
  ]}
  data={filtered}
/>
```

## Features Used

| Feature            | Usage                                       |
| ------------------ | ------------------------------------------- |
| `Table`            | Column alignment and headers                |
| `VirtualList`      | Constant-memory rendering of large datasets |
| `useBoxRect()`     | Responsive column widths                    |
| `TextInput`        | Real-time search filter                     |
| `useDeferredValue` | Non-blocking filter during typing           |
| `useInput()`       | Keyboard navigation                         |

## Exercises

1. **Add column sorting** — Click a header or press a key to sort by that column
2. **Add row details** — Press Enter on a row to expand a detail pane
3. **Add CSV export** — Press `e` to export filtered data to a file
4. **Color-coded status** — Red for stopped, green for running, yellow for sleeping
