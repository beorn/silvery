---
title: Building Terminal Dashboards with inkx
description: Build responsive multi-pane terminal dashboards with real-time data, theming, and flicker-free rendering using inkx.
---

# Dashboards & Monitoring

Terminal dashboards are one of the most natural fits for inkx. A dashboard is a set of panels competing for screen space, each displaying different data that updates at different rates. The hard part is making panels responsive to the terminal size, updating frequently without flicker, and keeping the layout consistent across different terminal widths.

inkx solves all three problems out of the box. Components query their own dimensions, the incremental renderer only repaints changed cells, and flexbox layout handles the space allocation.

## Key Benefits

- **Layout feedback** -- `useContentRect()` gives each panel its computed dimensions. Progress bars, sparklines, and data tables size themselves to fill available space. No manual width calculations, no prop threading.

- **Multi-pane layouts** -- Flexbox via `Box` with `flexDirection`, `flexGrow`, and percentage widths lets you compose arbitrary panel arrangements. Nest layouts freely: a sidebar next to a main area, each containing stacked sub-panels.

- **Real-time updates** -- inkx's incremental renderer tracks dirty flags per node. When one metric changes in a 1000-node dashboard, only that cell repaints — 169us per update vs 20.7ms for a full re-render ([benchmarks](/guide/why-inkx#performance)). Smooth 30fps data refreshes without saturating the terminal.

- **Theming** -- `ThemeProvider` with semantic `$token` colors (`$primary`, `$success`, `$error`, `$muted`, `$border`) gives your dashboard a consistent look. Switch between `defaultDarkTheme` and `defaultLightTheme` or define custom palettes.

- **Synchronized output** -- DEC 2026 synchronized updates wrap each frame in atomic begin/end markers. Terminals that support the protocol (tmux, Zellij, Ghostty, WezTerm, kitty) paint the entire frame at once, eliminating the partial-repaint flicker that plagues fast-updating dashboards.

## Code Example

A complete multi-pane dashboard with responsive layout, live-updating metrics, and progress bars that resize to fill available space.

```tsx
import { Box, Text, useContentRect, ThemeProvider, defaultDarkTheme } from "inkx"
import { run, useInput, type Key } from "inkx/runtime"
import { useInterval } from "inkx"
import { useState } from "react"

function App() {
  useInput((input: string, key: Key) => {
    if (input === "q" || key.escape) return "exit"
  })

  return (
    <ThemeProvider theme={defaultDarkTheme}>
      <Box flexDirection="column" width="100%" height="100%">
        <TopPanels />
        <LogPanel />
        <StatusBar />
      </Box>
    </ThemeProvider>
  )
}

function TopPanels() {
  const { width } = useContentRect()
  const isNarrow = width < 60

  return (
    <Box flexDirection={isNarrow ? "column" : "row"} flexGrow={1}>
      <MetricsPanel />
      <EventsPanel />
    </Box>
  )
}

function MetricsPanel() {
  const [metrics, setMetrics] = useState([
    { label: "CPU", value: 42 },
    { label: "Memory", value: 67 },
    { label: "Disk", value: 23 },
    { label: "Network", value: 15 },
  ])

  useInterval(() => {
    setMetrics((prev) =>
      prev.map((m) => ({
        ...m,
        value: Math.max(0, Math.min(100, m.value + Math.floor(Math.random() * 11) - 5)),
      })),
    )
  }, 1000)

  return (
    <Box flexDirection="column" flexGrow={1} borderStyle="single" borderColor="$border" paddingX={1}>
      <Text bold color="$primary">System Metrics</Text>
      <Text> </Text>
      {metrics.map((m) => (
        <MetricBar key={m.label} label={m.label} value={m.value} />
      ))}
    </Box>
  )
}

function MetricBar({ label, value }: { label: string; value: number }) {
  const { width } = useContentRect()
  const barWidth = Math.max(0, width - 16)
  const filled = Math.floor((barWidth * value) / 100)
  const empty = barWidth - filled

  const color = value > 80 ? "$error" : value > 60 ? "$warning" : "$success"

  return (
    <Text>
      {label.padEnd(8)}{" "}
      <Text color={color}>{"█".repeat(filled)}</Text>
      <Text color="$muted">{"░".repeat(empty)}</Text>
      <Text> {String(value).padStart(3)}%</Text>
    </Text>
  )
}

function EventsPanel() {
  const [events, setEvents] = useState([
    { time: "14:32", msg: "Deploy v2.4.1 complete" },
    { time: "14:30", msg: "Health check passed" },
    { time: "14:28", msg: "Build #847 succeeded" },
    { time: "14:25", msg: "PR #192 merged" },
  ])

  useInterval(() => {
    const now = new Date()
    const time = `${now.getHours()}:${String(now.getMinutes()).padStart(2, "0")}`
    const msgs = ["Request spike detected", "Cache cleared", "Backup complete", "New deploy queued"]
    const msg = msgs[Math.floor(Math.random() * msgs.length)]
    setEvents((prev) => [{ time, msg }, ...prev.slice(0, 7)])
  }, 3000)

  return (
    <Box flexDirection="column" flexGrow={2} borderStyle="single" borderColor="$border" paddingX={1}>
      <Text bold color="$primary">Events</Text>
      <Text> </Text>
      {events.map((e, i) => (
        <Text key={i}>
          <Text color="$muted">{e.time}</Text> {e.msg}
        </Text>
      ))}
    </Box>
  )
}

function LogPanel() {
  const [logs] = useState([
    "[INFO]  Server listening on :8080",
    "[INFO]  Connected to database",
    "[WARN]  Slow query detected (420ms)",
    "[INFO]  Cache warmed: 1,247 entries",
  ])

  return (
    <Box flexDirection="column" height={6} borderStyle="single" borderColor="$border" paddingX={1}>
      <Text bold color="$primary">Logs</Text>
      {logs.map((line, i) => (
        <Text key={i} color={line.includes("[WARN]") ? "$warning" : "$muted"}>
          {line}
        </Text>
      ))}
    </Box>
  )
}

function StatusBar() {
  return (
    <Box paddingX={1}>
      <Text color="$muted">Press q to quit</Text>
    </Box>
  )
}

await run(<App />)
```

## What inkx Adds

Traditional TUI frameworks require manual width calculations for responsive panels. inkx's layout feedback lets components query their own dimensions — size progress bars, truncate text, and set responsive breakpoints without prop threading. The theming system provides consistent color tokens. Incremental rendering (122x faster than full-screen rewrites — [benchmarks](/guide/why-inkx#performance)) eliminates visible flicker in dashboards that update multiple times per second. And synchronized output ensures multiplexers like tmux show complete frames.

## Get Started

Ready to build your own dashboard? Follow the [Getting Started guide](/guide/getting-started) to install inkx and render your first component, then come back here and adapt the example above.
