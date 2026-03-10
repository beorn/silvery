---
prev:
  text: Live Demo
  link: /examples/live-demo
next:
  text: Task List
  link: /examples/task-list
---

<script setup>
import LiveDemo from '../.vitepress/components/LiveDemo.vue'
</script>

# Dashboard Example

A multi-pane dashboard demonstrating responsive layouts with `useContentRect()`.

[[toc]]

## Live Demo

<LiveDemo xtermSrc="/examples/showcase.html?demo=dashboard" :height="500" />

## What It Demonstrates

- **Multi-pane layouts** using flexbox with `flexGrow`
- **Responsive breakpoints** that adapt to terminal width
- **`useContentRect()` usage** for proportional sizing and text truncation
- **Nested layout** with borders and padding

## Running the Example

```bash
cd silvery
bun run examples/dashboard/app.tsx
```

## Full Source Code

::: code-group

```tsx [app.tsx]
import { Box, Text, render, useContentRect, useInput, useApp, createTerm } from "silvery";
import { useState } from "react";

// Sample data
const stats = [
  { label: "CPU", value: 45 },
  { label: "Memory", value: 62 },
  { label: "Disk", value: 28 },
];

const activities = [
  { time: "12:01", message: "User logged in" },
  { time: "12:00", message: "Build passed" },
  { time: "11:58", message: "PR #42 merged" },
  { time: "11:55", message: "Deploy completed" },
  { time: "11:50", message: "Tests started" },
];

const recentItems = [
  { name: "project-alpha", date: "2 hours ago" },
  { name: "report-q4.pdf", date: "Yesterday" },
  { name: "config.json", date: "3 days ago" },
  { name: "notes.md", date: "Last week" },
];

function App() {
  const { exit } = useApp();

  useInput((input, key) => {
    if (input === "q" || key.escape) {
      exit();
    }
  });

  return (
    <Box flexDirection="column" width="100%" height="100%">
      <TopSection />
      <BottomSection />
      <StatusBar />
    </Box>
  );
}

function TopSection() {
  const { width } = useContentRect();

  // Responsive: stack vertically on narrow terminals
  const isNarrow = width < 60;

  return (
    <Box flexDirection={isNarrow ? "column" : "row"} flexGrow={1}>
      <StatsPane />
      <ActivityPane />
    </Box>
  );
}

function StatsPane() {
  return (
    <Box flexDirection="column" flexGrow={1} borderStyle="single" paddingX={1}>
      <Text bold>System Stats</Text>
      <Text> </Text>
      {stats.map((stat) => (
        <StatRow key={stat.label} label={stat.label} value={stat.value} />
      ))}
    </Box>
  );
}

function StatRow({ label, value }: { label: string; value: number }) {
  const { width } = useContentRect();

  // Calculate bar width based on available space
  // Account for label (8 chars) + spacing
  const barWidth = Math.max(0, width - 12);
  const filledWidth = Math.floor((barWidth * value) / 100);
  const emptyWidth = barWidth - filledWidth;

  const bar = "=".repeat(filledWidth) + " ".repeat(emptyWidth);

  return (
    <Text>
      {label.padEnd(8)} [{bar}]
    </Text>
  );
}

function ActivityPane() {
  return (
    <Box flexDirection="column" flexGrow={2} borderStyle="single" paddingX={1}>
      <Text bold>Activity Feed</Text>
      <Text> </Text>
      {activities.map((activity, i) => (
        <ActivityRow key={i} time={activity.time} message={activity.message} />
      ))}
    </Box>
  );
}

function ActivityRow({ time, message }: { time: string; message: string }) {
  const { width } = useContentRect();

  // Truncate message to fit available width
  const timeWidth = 6; // "12:01 "
  const maxMessageWidth = Math.max(0, width - timeWidth);
  const truncatedMessage =
    message.length > maxMessageWidth ? message.slice(0, maxMessageWidth - 1) + "..." : message;

  return (
    <Text>
      <Text dimColor>{time}</Text> {truncatedMessage}
    </Text>
  );
}

function BottomSection() {
  const [selected, setSelected] = useState(0);

  useInput((input, key) => {
    if (key.downArrow) {
      setSelected((s) => Math.min(s + 1, recentItems.length - 1));
    }
    if (key.upArrow) {
      setSelected((s) => Math.max(s - 1, 0));
    }
  });

  return (
    <Box flexDirection="column" height={8} borderStyle="single" paddingX={1}>
      <Text bold>Recent Items</Text>
      <Text> </Text>
      <Box flexDirection="column" overflow="scroll" scrollTo={selected}>
        {recentItems.map((item, i) => (
          <RecentItemRow
            key={item.name}
            name={item.name}
            date={item.date}
            isSelected={i === selected}
          />
        ))}
      </Box>
    </Box>
  );
}

function RecentItemRow({
  name,
  date,
  isSelected,
}: {
  name: string;
  date: string;
  isSelected: boolean;
}) {
  const { width } = useContentRect();

  // Calculate space for name, leaving room for date
  const dateWidth = date.length + 2;
  const nameWidth = Math.max(0, width - dateWidth - 2);

  const truncatedName = name.length > nameWidth ? name.slice(0, nameWidth - 1) + "..." : name;

  const padding = " ".repeat(Math.max(0, nameWidth - truncatedName.length));

  const prefix = isSelected ? "> " : "  ";

  return (
    <Text inverse={isSelected}>
      {prefix}
      {truncatedName}
      {padding}
      <Text dimColor>{date}</Text>
    </Text>
  );
}

function StatusBar() {
  return (
    <Box paddingX={1}>
      <Text dimColor>Press q to quit | Arrow keys to navigate</Text>
    </Box>
  );
}

using term = createTerm();
await render(<App />, term);
```

:::

## Code Walkthrough

### Responsive Layout

The `TopSection` component uses `useContentRect()` to detect narrow terminals:

```tsx
function TopSection() {
  const { width } = useContentRect();
  const isNarrow = width < 60;

  return (
    <Box flexDirection={isNarrow ? "column" : "row"}>
      <StatsPane />
      <ActivityPane />
    </Box>
  );
}
```

On narrow terminals (< 60 chars), the stats and activity panes stack vertically instead of side-by-side.

### Proportional Sizing

The two top panes use `flexGrow` for proportional sizing:

```tsx
<StatsPane />      // flexGrow={1} - takes 1/3 of space
<ActivityPane />   // flexGrow={2} - takes 2/3 of space
```

No width calculations needed. Yoga handles the math.

### Dynamic Progress Bars

The `StatRow` component builds progress bars that fill available space:

```tsx
function StatRow({ label, value }: { label: string; value: number }) {
  const { width } = useContentRect();

  const barWidth = Math.max(0, width - 12); // Account for label
  const filledWidth = Math.floor((barWidth * value) / 100);
  const emptyWidth = barWidth - filledWidth;

  const bar = "=".repeat(filledWidth) + " ".repeat(emptyWidth);

  return (
    <Text>
      {label.padEnd(8)} [{bar}]
    </Text>
  );
}
```

The bar automatically resizes when the terminal is resized.

### Text Truncation

The `ActivityRow` component truncates long messages:

```tsx
function ActivityRow({ time, message }: { time: string; message: string }) {
  const { width } = useContentRect();

  const maxMessageWidth = Math.max(0, width - 6);
  const truncatedMessage =
    message.length > maxMessageWidth ? message.slice(0, maxMessageWidth - 1) + "..." : message;

  return (
    <Text>
      <Text dimColor>{time}</Text> {truncatedMessage}
    </Text>
  );
}
```

No overflow, no layout bugs.

### Scrollable List

The "Recent Items" section uses `overflow="scroll"`:

```tsx
<Box flexDirection="column" overflow="scroll" scrollTo={selected}>
  {recentItems.map((item, i) => (
    <RecentItemRow key={item.name} isSelected={i === selected} /* ... */ />
  ))}
</Box>
```

Add more items to `recentItems` and they'll scroll automatically.

## Key Silvery Features Used

| Feature             | Usage                                                                |
| ------------------- | -------------------------------------------------------------------- |
| `useContentRect()`  | Get dimensions for responsive layout, progress bars, text truncation |
| `overflow="scroll"` | Scrollable recent items list                                         |
| `scrollTo={index}`  | Keep selected item visible                                           |
| `flexGrow`          | Proportional pane sizing                                             |
| `useInput()`        | Keyboard navigation                                                  |

### Why Silvery for Dashboards

- **Real-time updates** -- Silvery's incremental renderer tracks dirty flags per node. When one metric changes in a large dashboard, only that cell repaints -- 169us per update vs 20.7ms for a full re-render ([benchmarks](/guide/silvery-vs-ink#performance)). Smooth 30fps data refreshes without saturating the terminal.

- **Theming** -- `ThemeProvider` with semantic `$token` colors (`$primary`, `$success`, `$error`, `$muted`, `$border`) gives your dashboard a consistent look. Switch between `defaultDarkTheme` and `defaultLightTheme` or define custom palettes.

- **Synchronized output** -- DEC 2026 synchronized updates wrap each frame in atomic begin/end markers. Terminals that support the protocol (tmux, Zellij, Ghostty, WezTerm, kitty) paint the entire frame at once, eliminating partial-repaint flicker in fast-updating dashboards.

## Exercises

1. **Add a third pane** - Add a "Notifications" pane to the top section
2. **Make stats scrollable** - Add more stats and make the stats pane scroll
3. **Add timestamps** - Show relative timestamps that update every second
4. **Add color coding** - Color progress bars red/yellow/green based on value
