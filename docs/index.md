---
layout: home

hero:
  name: "Silvery"
  text: "Polished terminal UIs in React"
  tagline: "A React framework for building terminal applications — fast, complete, and familiar"
  actions:
    - theme: brand
      text: Get Started
      link: /guide/getting-started
    - theme: alt
      text: View on GitHub
      link: https://github.com/beorn/silvery

features:
  - title: Familiar API
    details: "If you know Ink, you know Silvery -- same Box/Text/useInput patterns. Plus `silvery/ink` and `silvery/chalk` compat layers for effortless migration."
    link: /guide/migration
    linkText: Ink comparison
  - title: Fast Incremental Rendering
    details: "Per-node dirty tracking with 7 independent flags. 28-192x fewer bytes on typical incremental updates. Only changed nodes re-render."
    link: /guide/why-silvery#incremental-rendering
    linkText: "* See benchmarks"
  - title: Layout Feedback
    details: "Components query their own dimensions via useContentRect(). No width prop drilling needed."
  - title: Scrollable Containers
    details: 'overflow="scroll" with scrollTo just works. No manual virtualization needed.'
  - title: 23+ Components
    details: "Box, Text, VirtualList, TextArea, SelectList, Table, Image, Spinner, ProgressBar, and more. Built-in scrolling, focus, and input handling."
  - title: Beyond the Terminal
    details: "Terminal today, Canvas and DOM tomorrow. The architecture separates rendering targets from the component model — same React components, different outputs."
    link: /roadmap
    linkText: See the roadmap
  - title: TEA State Machines
    details: "Optional Elm Architecture (TEA) reducers alongside React hooks. Pure (action, state) → [state, effects] functions for testing, replay, and undo."
  - title: Zero Dependencies
    details: "Pure TypeScript. No WASM, no C++, no memory leaks. Runs on Node, Bun, and Deno."
---

<p class="alpha-badge"><strong>Alpha</strong> — under heavy development. APIs may change.</p>

## Explore the Examples

<div class="viewer-wrapper">
  <iframe src="/examples/viewer.html" class="viewer-iframe" frameborder="0" title="Silvery Interactive Examples" loading="lazy" />
</div>

## Build Any Terminal App

<div class="use-cases">

- **[AI Assistants & Chat](/examples/ai-assistants)** -- Streaming output, scrollback history, command palettes
- **[Dashboards & Monitoring](/examples/dashboard)** -- Multi-pane layouts with real-time data
- **[Kanban & Project Boards](/examples/kanban)** -- Multi-column navigation with cards and focus management
- **[CLI Wizards & Setup Tools](/examples/cli-wizards)** -- Step-by-step forms, selections, progress tracking
- **[Developer Tools](/examples/developer-tools)** -- REPLs, log viewers, debuggers, profilers
- **[Data Explorers & Tables](/examples/data-explorers)** -- Virtual lists, filtering, search, sortable tables

</div>

## What's Inside

<div class="features-list">

- **23+ components** -- Box, Text, VirtualList, TextArea, SelectList, Table, Image, Spinner, ProgressBar, and more
- **Scrollable containers** -- `overflow="scroll"` with `scrollTo` just works. No manual virtualization.
- **Three architectures** -- React hooks, Elm-style reducers, or Zustand stores. Choose per use case -- all three in one framework.
- **Built for AI** -- Command introspection for agents, programmatic screenshots, scrollable streaming output. CLAUDE.md ships with the package.
- **Input system** -- Input layer stack (DOM-style event bubbling), tree-based focus with spatial navigation, command system with keybinding resolution
- **Zero native deps** -- Pure TypeScript. No WASM, no C++, no memory leaks. Runs on Node, Bun, and Deno.

</div>

## Quick Start

::: code-group

```bash [npm]
npm install silvery react
```

```bash [bun]
bun add silvery react
```

```bash [pnpm]
pnpm add silvery react
```

```bash [yarn]
yarn add silvery react
```

:::

```tsx
import { useState } from "react"
import { Box, Text, useContentRect, useInput, render, createTerm } from "silvery"

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

using term = createTerm()
await render(<App />, term)
```

## Ecosystem

Silvery is part of a family of terminal-focused libraries:

- **[Termless](https://termless.dev)** -- Headless terminal testing, like Playwright for terminal apps
- **[Flexily](https://beorn.github.io/flexily)** -- Pure JS flexbox layout engine (Yoga-compatible, 2.5x faster, zero WASM)
- **[Loggily](https://beorn.github.io/loggily)** -- Debug + structured logging + tracing in one library

<style>
.viewer-wrapper {
  margin: 1.5rem 0 2rem;
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  overflow: hidden;
  background: #0f0f1a;
}
.viewer-iframe {
  width: 100%;
  height: 640px;
  border: none;
  display: block;
}
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
.alpha-badge {
  margin: -0.5rem auto 2rem;
  padding: 0.3rem 1rem;
  border-radius: 999px;
  background: var(--vp-c-warning-soft);
  color: var(--vp-c-warning-1);
  font-size: 0.85rem;
  text-align: center;
  width: fit-content;
}
</style>
