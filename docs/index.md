---
layout: home

hero:
  name: "Silvery"
  text: "Polished Terminal UIs in React"
  tagline: "A React renderer for terminal applications — responsive layouts, scrollable containers, per-node incremental rendering, and comprehensive terminal protocol support. Optional framework layers add 30+ components, theming, and TEA state machines."
  actions:
    - theme: brand
      text: Get Started
      link: /getting-started/quick-start
    - theme: alt
      text: The Silvery Way
      link: /guide/the-silvery-way
    - theme: alt
      text: View on GitHub
      link: https://github.com/beorn/silvery

features:
  - title: Familiar React API
    details: "Same Box/Text/useInput patterns you already know. If you've used Ink, most code works with just an import change."
    link: /guide/silvery-vs-ink
    linkText: Ink compatibility guide
  - title: Pure TypeScript
    details: "No WASM, no C++, no native dependencies. Runs on Node, Bun, and Deno. No memory leaks in long-running sessions."
  - title: 100x+ Faster Updates
    details: "Per-node dirty tracking with 7 independent flags. Only changed nodes re-render. Typical interactive updates in ~169us for 1000 nodes."
    link: /guide/silvery-vs-ink#performance
    linkText: See benchmarks
  - title: Responsive Layout
    details: 'Full CSS Flexbox layout via Flexily (pure JS, Yoga-compatible). Components query their own dimensions via useContentRect() — no width prop drilling. Native scrollable containers with overflow="scroll".'
  - title: 30+ Components
    details: "VirtualList, TextArea, SelectList, Table, CommandPalette, ModalDialog, Tabs, TreeView, Image, Toast, Spinner, ProgressBar, SplitView, and more."
    link: /guides/components
    linkText: Browse components
  - title: Playwright-Style Testing
    details: "Headless rendering, auto-refreshing locators, getByText/getByTestId queries, bounding box assertions, and press() input. Test terminal UIs like you test web apps."
    link: /guide/testing
    linkText: Testing guide
  - title: Beyond the Terminal
    details: "Terminal today, Canvas 2D and DOM experimental. Same React components, different rendering backends. ~30% of the codebase is target-independent."
    link: /guides/future-targets
    linkText: See the roadmap
  - title: TEA State Machines
    details: "Optional Elm Architecture (TEA) reducers alongside React hooks. Pure (action, state) -> [state, effects] functions for testing, replay, and undo."
    link: /guides/state-management
    linkText: Learn more
---

## Explore the Examples

<div class="viewer-wrapper">
  <iframe src="/examples/viewer.html" class="viewer-iframe" frameborder="0" title="Silvery Interactive Examples" loading="lazy" />
</div>

## Build Any Terminal App

<div class="use-cases">

- **[Components](/examples/components)** -- 30+ ready-made widgets: SelectList, Tabs, ProgressBar, Spinner, and more
- **[Layout](/examples/layout)** -- CSS flexbox for terminals: responsive sizing, gap, scroll containers
- **[Forms & Input](/examples/forms)** -- Multi-step wizards, SelectList, TextInput with readline
- **[Tables & Data](/examples/tables)** -- Table component, VirtualList, responsive columns, search/filter
- **[Scrollback](/examples/scrollback)** -- Dynamic inline mode: freeze-and-scroll, natural history (unique)
- **[AI Coding Agent](/examples/ai-chat)** -- Streaming output, tool calls, command introspection for agents
- **[Testing](/examples/testing)** -- Headless renderer, Playwright-style locators, press() simulation

</div>

## The Renderer

<div class="features-list">

- **Responsive layout** -- `useContentRect()` returns actual dimensions during render. No prop drilling, no post-render effects.
- **Scrollable containers** -- `overflow="scroll"` with `scrollTo` just works. No manual virtualization.
- **Incremental rendering** -- Per-node dirty tracking. Only changed nodes re-render. Cell-level ANSI-aware compositing.
- **Pure TypeScript** -- No WASM, no C++, no native dependencies. Runs on Node, Bun, and Deno.

</div>

## Optional Framework Layers

<div class="framework-layers">

- **`@silvery/ui`** — 30+ components -- TextArea, SelectList, Table, VirtualList, CommandPalette, ModalDialog, Tabs, TreeView, Toast, ProgressBar, and more
- **`@silvery/term`** — Input system -- Input layer stack (DOM-style event bubbling), tree-based focus with spatial navigation, mouse support, command system
- **`@silvery/tea`** — TEA state machines -- Pure `(action, state) → [state, effects]` reducers for testing, replay, and undo
- **`@silvery/theme`** — Theming -- 38 palettes, semantic color tokens, auto-detection
- **`@silvery/test`** — [Testing](/examples/testing) -- Headless renderer, Playwright-style locators, press() simulation, programmatic screenshots

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
.framework-layers {
  margin: 0.5rem 0 1.5rem;
}
.framework-layers li {
  margin: 0.35rem 0;
  line-height: 1.5;
}
.framework-layers code {
  font-size: 0.85em;
}
</style>
