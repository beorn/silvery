---
layout: home

hero:
  name: "Silvery"
  text: "The shiny new renderer"
  tagline: "Polished terminal UIs in React"
  actions:
    - theme: brand
      text: Get Started
      link: /guide/getting-started
    - theme: alt
      text: View on GitHub
      link: https://github.com/beorn/silvery

features:
  - icon: "\U0001F504"
    title: Drop-in Ink Replacement
    details: "Same Box/Text/useInput API you already know. Migrate gradually -- swap the import, keep your components. No rewrite required."
    link: /guide/migration
    linkText: Migration guide
  - icon: "\u26A1"
    title: 100x+ Faster*
    details: "Per-node dirty tracking with 7 independent flags -- 100x+ faster on incremental renders. Only changed nodes re-render."
    link: /guide/why-silvery#incremental-rendering
    linkText: "* See benchmarks"
  - icon: "\U0001F4D0"
    title: Layout Feedback
    details: "Components query their own dimensions via useContentRect(). No width prop drilling. Ink's oldest open issue (2016), solved."
  - icon: "\U0001F5C4\uFE0F"
    title: Scrollable Containers
    details: 'overflow="scroll" with scrollTo just works. No manual virtualization. Ink''s #1 feature request since 2019, solved.'
  - icon: "\U0001F4E6"
    title: 23+ Components
    details: "Box, Text, VirtualList, TextArea, SelectList, Table, Image, Spinner, ProgressBar, and more. Built-in scrolling, focus, and input handling."
  - icon: "\U0001F310"
    title: Cross-Render (Future)
    details: "Terminal today, Canvas and DOM tomorrow. Write once, render to any target -- same React components across environments."
  - icon: "\U0001F9E9"
    title: TEA State Machines
    details: "Optional Elm-style reducers alongside React hooks and Zustand stores. Pure (action, state) functions for testing, replay, and undo."
  - icon: "\U0001F6AB"
    title: Zero Dependencies
    details: "Pure TypeScript. No WASM, no C++, no memory leaks. Runs on Node, Bun, and Deno."
---

<div class="alpha-banner">
  <strong>Alpha</strong> — under heavy development. APIs may change, things may break. <a href="https://github.com/beorn/silvery/issues">Feedback welcome</a>.
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

- **23+ components** -- Box, Text, VirtualList, TextArea, SelectList, Table, Image, Spinner, ProgressBar, and more
- **Scrollable containers** -- `overflow="scroll"` with `scrollTo` just works. No manual virtualization. Ink's #1 feature request since 2019.
- **Three architectures** -- React hooks, Elm-style reducers, or Zustand stores. Choose per use case -- all three in one framework.
- **Built for AI** -- Command introspection for agents, programmatic screenshots, scrollable streaming output. CLAUDE.md ships with the package.
- **Input system** -- Input layer stack (DOM-style event bubbling), tree-based focus with spatial navigation, command system with keybinding resolution
- **Zero native deps** -- Pure TypeScript. No WASM, no C++, no memory leaks. Runs on Node, Bun, and Deno.

</div>

## Quick Start

```bash
bun add @silvery/term react flexture
```

```tsx
import { Box, Text, useContentRect } from "@silvery/term"
import { run, useInput } from "@silvery/term/runtime"

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
.alpha-banner {
  margin: -0.5rem auto 2rem;
  max-width: 640px;
  padding: 0.6rem 1.2rem;
  border-radius: 8px;
  background: var(--vp-c-warning-soft);
  color: var(--vp-c-warning-1);
  font-size: 0.9rem;
  text-align: center;
}
.alpha-banner a {
  color: var(--vp-c-warning-1);
  text-decoration: underline;
}
</style>
