---
title: Layout — CSS Flexbox for Terminals
description: Responsive flex layouts, proportional sizing, gap spacing, and scroll containers in the terminal using Silvery.
prev:
  text: Components
  link: /examples/components
next:
  text: Forms & Input
  link: /examples/forms
---

<script setup>
import LiveDemo from '../.vitepress/components/LiveDemo.vue'
</script>

# Layout

Silvery brings CSS-like flexbox to the terminal. Proportional sizing, gap spacing, `justifyContent`, `alignItems`, responsive breakpoints via `useContentRect()` — the same layout model you know from the web, working in every terminal.

<LiveDemo xtermSrc="/examples/showcase.html?demo=dashboard" :height="500" />

## What It Demonstrates

- **Flexbox layouts** — proportional sizing with `flexGrow`, spacing with `gap` and `justifyContent`
- **Tab navigation** — left/right arrows switch between panels
- **Progress bars** — `flexGrow` sized proportionally to values (no manual width math)
- **Scrollable list** — `overflow="scroll"` with `scrollTo` for keyboard navigation
- **Responsive sizing** — `useContentRect()` provides dimensions at render time

## Source Code

::: code-group

```tsx [app.tsx]
import { Box, Text, render, useInput, useApp, createTerm } from "silvery"
import { useState } from "react"

const stats = [
  { label: "CPU", value: 45 },
  { label: "Memory", value: 62 },
  { label: "Disk", value: 28 },
  { label: "Network", value: 15 },
]

const tabs = ["Stats", "Activity", "Recent"] as const

function App() {
  const { exit } = useApp()
  const [tab, setTab] = useState(0)

  useInput((input, key) => {
    if (input === "q" || key.escape) exit()
    if (key.leftArrow) setTab((t) => Math.max(0, t - 1))
    if (key.rightArrow) setTab((t) => Math.min(tabs.length - 1, t + 1))
  })

  return (
    <Box flexDirection="column" width="100%" height="100%">
      <Box flexDirection="row" gap={1} paddingX={1}>
        {tabs.map((label, i) => (
          <Text key={label} bold={i === tab} inverse={i === tab}>
            {" "}
            {label}{" "}
          </Text>
        ))}
      </Box>
      <Box flexGrow={1} borderStyle="single" paddingX={1} paddingTop={1}>
        {tab === 0 && <StatsPane />}
      </Box>
      <Box paddingX={1}>
        <Text dimColor>←→ tabs q quit</Text>
      </Box>
    </Box>
  )
}

function StatsPane() {
  return (
    <Box flexDirection="column" gap={1}>
      {stats.map((stat) => (
        <Box key={stat.label} flexDirection="column">
          <Box flexDirection="row" justifyContent="space-between">
            <Text>{stat.label}</Text>
            <Text bold>{stat.value}%</Text>
          </Box>
          <ProgressBar value={stat.value} />
        </Box>
      ))}
    </Box>
  )
}

function ProgressBar({ value }: { value: number }) {
  return (
    <Box flexDirection="row">
      <Box flexGrow={value}>
        <Text color="green">{"█".repeat(50)}</Text>
      </Box>
      <Box flexGrow={100 - value}>
        <Text dimColor>{"░".repeat(50)}</Text>
      </Box>
    </Box>
  )
}

using term = createTerm()
await render(<App />, term)
```

:::

## Key Patterns

### Flex Progress Bars

Instead of calculating bar widths manually, use `flexGrow` proportionally. The text is longer than the box — Silvery truncates it. `flexGrow` handles the proportions:

```tsx
<Box flexDirection="row">
  <Box flexGrow={value}>
    <Text color="green">{"█".repeat(50)}</Text>
  </Box>
  <Box flexGrow={100 - value}>
    <Text dimColor>{"░".repeat(50)}</Text>
  </Box>
</Box>
```

### Responsive Layout with `useContentRect()`

Components query their computed dimensions at render time. No prop drilling, no `useEffect`:

```tsx
function ResponsivePanel() {
  const { width } = useContentRect()
  const columns = width > 100 ? 3 : width > 60 ? 2 : 1
  return <Grid columns={columns}>...</Grid>
}
```

### Flex Spacing

Use `justifyContent` and `gap` instead of manual padding:

```tsx
<Box flexDirection="row" justifyContent="space-between">
  <Text>{stat.label}</Text>
  <Text bold>{stat.value}%</Text>
</Box>
```

### Scrollable Containers

Add scrolling to any Box. Silvery measures children, calculates the visible range, and shows overflow indicators automatically:

```tsx
<Box flexDirection="column" flexGrow={1} overflow="scroll" scrollTo={selectedIndex}>
  {items.map((item, i) => (
    <Text key={i} inverse={i === selectedIndex}>
      {item.name}
    </Text>
  ))}
</Box>
```

### Multi-Column Layouts

Equal-width columns via `flexGrow`. Each column scrolls independently (see the [Kanban showcase](/examples/showcase.html?demo=kanban)):

```tsx
<Box flexDirection="row" flexGrow={1}>
  {columns.map((col) => (
    <Box key={col.id} flexGrow={1} flexDirection="column" overflow="scroll">
      {col.items.map((item) => (
        <Card key={item.id} {...item} />
      ))}
    </Box>
  ))}
</Box>
```

## Features Used

| Feature             | Usage                                       |
| ------------------- | ------------------------------------------- |
| `flexGrow`          | Proportional progress bars and panel sizing |
| `justifyContent`    | Spacing between labels and values           |
| `gap`               | Consistent spacing between items            |
| `overflow="scroll"` | Scrollable containers with auto-indicators  |
| `scrollTo={index}`  | Keep selected item visible                  |
| `useContentRect()`  | Responsive layout feedback at render time   |
| `useInput()`        | Tab switching and list navigation           |

## Exercises

1. **Responsive tabs** — Stack tabs vertically on narrow terminals using `useContentRect()`
2. **Multi-pane dashboard** — Use `flexGrow` ratios (2:1) for main/sidebar panels
3. **Nested scroll** — Put a scrollable list inside a scrollable panel
4. **Live updates** — Use `useEffect` + `setInterval` to animate stat values
