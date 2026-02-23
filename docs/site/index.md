---
layout: home

hero:
  name: "inkx"
  text: "React for modern terminals"
  tagline: "122x faster interactive updates. Reactive layout. AI-ready. Three architectures. Mouse, keyboard, images, clipboard, hyperlinks, scrollback. Pure TypeScript — no WASM, no C++."
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
    title: 122x Faster*
    details: "Per-node dirty tracking with 7 independent flags — 169μs vs Ink's 20.7ms. Only changed nodes re-render."
    link: /guide/why-inkx#incremental-rendering
    linkText: "* See benchmarks"
  - icon: "\U0001F3AF"
    title: "Runs in the Browser"
    details: "Same React components render to xterm.js in any web page. Canvas 2D and DOM targets in development."
---

<script setup>
import LiveDemo from './.vitepress/components/LiveDemo.vue'
</script>

## See It in Action

Same React component, running in the browser via xterm.js:

<LiveDemo />

## Build Any Terminal App

<div class="use-cases">

- **[AI Assistants & Chat](/use-cases/ai-assistants)** — Streaming output, scrollback history, command palettes
- **[Dashboards & Monitoring](/use-cases/dashboards)** — Multi-pane layouts with real-time data
- **[Kanban & Project Boards](/use-cases/kanban-boards)** — Multi-column navigation with cards and focus management
- **[CLI Wizards & Setup Tools](/use-cases/cli-wizards)** — Step-by-step forms, selections, progress tracking
- **[Developer Tools](/use-cases/developer-tools)** — REPLs, log viewers, debuggers, profilers
- **[Data Explorers & Tables](/use-cases/data-explorers)** — Virtual lists, filtering, search, sortable tables

</div>

## What's Inside

<div class="features-list">

- **23+ components** — Box, Text, VirtualList, TextArea, SelectList, Table, Image, Spinner, ProgressBar, and more
- **Scrollable containers** — `overflow="scroll"` with `scrollTo` just works. No manual virtualization. Ink's #1 feature request since 2019.
- **Three architectures** — React hooks, Elm-style reducers, or Zustand stores. Choose per use case — all three in one framework.
- **Built for AI** — Command introspection for agents, programmatic screenshots, scrollable streaming output. CLAUDE.md ships with the package.
- **Input system** — Input layer stack (DOM-style event bubbling), tree-based focus with spatial navigation, command system with keybinding resolution
- **Zero native deps** — Pure TypeScript. No WASM, no C++, no memory leaks. Runs on Node, Bun, and Deno.

</div>

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

<style>
.use-cases {
  margin: 0.5rem 0 1.5rem;
}
.use-cases li {
  margin: 0.25rem 0;
}
.features-list {
  margin: 0.5rem 0 1.5rem;
}
.features-list li {
  margin: 0.35rem 0;
  line-height: 1.5;
}
</style>
