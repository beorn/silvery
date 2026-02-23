---
layout: home

hero:
  name: "inkx"
  text: "React for modern terminals"
  tagline: "Layout feedback, every terminal protocol, React + Elm architectures, 122x faster updates. Zero native dependencies."
  actions:
    - theme: brand
      text: Get Started
      link: /guide/getting-started
    - theme: alt
      text: View on GitHub
      link: https://github.com/beorn/inkx

features:
  - icon: "\U0001F4D0"
    title: Layout Feedback
    details: "useContentRect() — components know their size. Ink's oldest open issue (2016), solved."
  - icon: "\U0001F4E1"
    title: Every Protocol
    details: "Kitty keyboard, SGR mouse, images, clipboard, hyperlinks. All built-in, all auto-detected."
  - icon: "\u26A1"
    title: 122x Faster
    details: "Per-node dirty tracking — 169us vs 20.7ms. Only changed nodes re-render."
  - icon: "\U0001F3AF"
    title: "Three Render Targets"
    details: "Terminal, Canvas 2D, and DOM. Same components, different output."
---

<script setup>
import LiveDemo from './.vitepress/components/LiveDemo.vue'
</script>

## See It in Action

Same React component, three render targets — switch tabs to compare:

<LiveDemo :height="350" />

<div class="also">

**Also:** 23+ components with `overflow="scroll"` | Three architectures (React hooks, Elm reducers, Zustand) | Built for AI (command introspection, screenshots) | Zero native dependencies (pure TypeScript, Node/Bun/Deno)

</div>

[Explore examples](/examples/) &nbsp;·&nbsp; [Use cases](/use-cases/ai-assistants)

## Quick Start

```bash
bun add inkx react @beorn/flexx
```

```tsx
import { Box, Text, useContentRect } from "inkx"
import { run, useInput } from "inkx/runtime"

function App() {
  const { width } = useContentRect() // Components know their size!
  const [count, setCount] = useState(0)

  useInput((input, key) => {
    if (input === "j" || key.downArrow) setCount((c) => c + 1)
    if (input === "k" || key.upArrow) setCount((c) => c - 1)
    if (input === "q") return "exit"
  })

  return (
    <Box flexDirection="column">
      <Text>Terminal width: {width}</Text>
      <Text>Count: {count}</Text>
    </Box>
  )
}

await run(<App />)
```

## The Problem inkx Solves

In most TUI frameworks, components render _before_ layout is computed. You can't know a component's dimensions, so you manually thread width props everywhere. inkx computes layout first, then lets components query their dimensions:

<div class="code-compare">
<div class="code-compare-col">

**Before: manual width threading**

```tsx
function Board({ width }) {
  const colWidth = Math.floor((width - 2) / 3)
  return (
    <Box flexDirection="row">
      <Column width={colWidth} items={todo} />
      <Column width={colWidth} items={doing} />
      <Column width={colWidth} items={done} />
    </Box>
  )
}
```

</div>
<div class="code-compare-col">

**After: layout feedback**

```tsx
function Column({ items }) {
  const { width } = useContentRect()
  return (
    <Box flexGrow={1}>
      {items.map((item) => (
        <Card item={item} />
      ))}
    </Box>
  )
}
```

</div>
</div>

<style>
.also {
  margin: 1rem 0;
  padding: 0.75rem 1rem;
  background: var(--vp-c-bg-soft);
  border-radius: 8px;
  font-size: 0.9rem;
  line-height: 1.6;
  color: var(--vp-c-text-2);
}
.code-compare {
  display: flex;
  gap: 1rem;
  margin: 1rem 0;
}
.code-compare-col {
  flex: 1;
  min-width: 0;
}
@media (max-width: 768px) {
  .code-compare {
    flex-direction: column;
  }
}
</style>

## Build Any Terminal App

inkx powers everything from AI coding assistants to full-featured knowledge management TUIs. Explore what you can build:

<div class="use-cases">

- **[AI Assistants & Chat](/use-cases/ai-assistants)** — Streaming LLM output, scrollable history, command palettes
- **[Dashboards & Monitoring](/use-cases/dashboards)** — Multi-pane layouts with real-time data
- **[Kanban & Project Boards](/use-cases/kanban-boards)** — Multi-column navigation with cards and focus management
- **[CLI Wizards & Setup Tools](/use-cases/cli-wizards)** — Step-by-step forms, selections, progress tracking
- **[Developer Tools](/use-cases/developer-tools)** — REPLs, log viewers, debuggers, profilers
- **[Data Explorers & Tables](/use-cases/data-explorers)** — Virtual lists, filtering, search, sortable tables

</div>
