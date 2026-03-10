---
layout: home

hero:
  name: "Silvery"
  text: "Polished Terminal UIs in React"
  tagline: "A React framework for building terminal applications — responsive layouts, scrollable containers, and lightning-fast interactive updates"
  actions:
    - theme: brand
      text: Get Started
      link: /getting-started/quick-start
    - theme: alt
      text: View on GitHub
      link: https://github.com/beorn/silvery

features:
  - title: Familiar Ink API
    details: "Same Box/Text/useInput API you already know. Compatibility layers available for migrating existing apps with minimal changes."
    link: /guide/silvery-vs-ink
    linkText: Ink comparison
  - title: Pure TypeScript
    details: "No WASM, no C++, no native dependencies. Runs on Node, Bun, and Deno. Constant memory in long sessions."
  - title: 100x+ Faster Updates
    details: "Per-node dirty tracking with 7 independent flags. Only changed nodes re-render. Typical interactive updates in ~169us for 1000 nodes."
    link: /guide/silvery-vs-ink#performance
    linkText: See benchmarks
  - title: Responsive Layout
    details: "Full CSS Flexbox layout via Flexily (pure JS, Yoga-compatible). Components query their own dimensions via useContentRect() — no width prop drilling. Native scrollable containers with overflow=\"scroll\"."
  - title: 30+ Components
    details: "VirtualList, TextArea, SelectList, Table, CommandPalette, ModalDialog, Tabs, TreeView, Image, Toast, Spinner, ProgressBar, SplitView, and more."
    link: /guides/components
    linkText: Browse components
  - title: Beyond the Terminal
    details: "Terminal today, Canvas 2D and DOM experimental. Same React components, different rendering backends. ~30% of the codebase is target-independent."
    link: /guides/future-targets
    linkText: See the roadmap
  - title: TEA State Machines
    details: "Optional Elm Architecture (TEA) reducers alongside React hooks. Pure (action, state) -> [state, effects] functions for testing, replay, and undo."
    link: /guides/state-management
    linkText: Learn more
---

<p class="alpha-badge"><strong>Alpha</strong> — under heavy development. APIs may change.</p>

<div class="migration-callout">

**Coming from Ink?** Silvery's API is nearly identical — most apps work with just an import change. [See the migration guide &rarr;](/getting-started/migrate-from-ink)

</div>

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

- **30+ components** -- TextArea, SelectList, Table, VirtualList, CommandPalette, ModalDialog, Tabs, TreeView, Toast, ProgressBar, and more
- **Scrollable containers** -- `overflow="scroll"` with `scrollTo` just works. No manual virtualization.
- **Three architectures** -- React hooks, Elm-style reducers, or Zustand stores. Choose per use case -- all three in one framework.
- **Built for AI** -- Command introspection for agents, programmatic screenshots, scrollable streaming output
- **Input system** -- Input layer stack (DOM-style event bubbling), tree-based focus with spatial navigation, command system with keybinding resolution
- **Zero native deps** -- Pure TypeScript. No WASM, no C++. Runs on Node, Bun, and Deno.

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
.migration-callout {
  margin: -0.5rem 0 2rem;
  padding: 1rem 1.5rem;
  border-radius: 8px;
  background: var(--vp-c-brand-soft);
  border: 1px solid var(--vp-c-brand-2);
  text-align: center;
}
.migration-callout p {
  margin: 0;
}
</style>
