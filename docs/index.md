---
layout: home

hero:
  name: "Silvery"
  text: "Polished Terminal UIs in React"
  tagline: "Responsive layouts, scrollable containers, 100x+ faster incremental updates, and full support for modern terminal capabilities. 30+ components from TextInput to VirtualList. Pure TypeScript, no WASM."
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
    details: 'Container queries for terminals — components know their own size at render time via useContentRect(). No prop drilling, no measure-then-rerender flicker. Full CSS Flexbox via Flexily (pure JS, Yoga-compatible). Native scrollable containers with overflow="scroll".'
  - title: 30+ Components
    details: "VirtualList, TextArea, SelectList, Table, CommandPalette, ModalDialog, Tabs, TreeView, Image, Toast, Spinner, ProgressBar, SplitView, and more."
    link: /guides/components
    linkText: Browse components
  - title: Playwright-Style Testing
    details: "Headless rendering, auto-refreshing locators, getByText/getByTestId queries, bounding box assertions, and press() input. Test terminal UIs like you test web apps."
    link: /guide/testing
    linkText: Testing guide
  - title: Flexible Rendering
    details: "Three modes: render once (static output), run() for interactive apps (hooks + useInput), or compose with plugins for full control. Same renderer, pick your level."
    link: /guide/runtime-layers
    linkText: Runtime layers
  - title: Terminal Protocol Support
    details: "100+ escape sequences, all auto-negotiated: Kitty keyboard, SGR mouse, OSC 8 hyperlinks, OSC 52 clipboard, bracketed paste, focus reporting, text sizing, synchronized output, and more."
    link: /guide/silvery-vs-ink
    linkText: See comparison
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
- **Pure TypeScript** -- No WASM, no C++, no native dependencies. ~177 KB gzipped all-in. Runs on Node, Bun, and Deno.

</div>

## Packages

| Package           | Description                                                          |
| ----------------- | -------------------------------------------------------------------- |
| `silvery`         | Components, hooks, renderer -- the one package you need              |
| `@silvery/test`   | [Testing](/examples/testing) utilities and Playwright-style locators |
| `@silvery/ink`    | [Ink compatibility](/guide/silvery-vs-ink) layer for migration       |
| `@silvery/create` | App composition and state management _(coming soon)_                 |

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
import { render, Box, Text, useInput } from "silvery"

function Counter() {
  const [count, setCount] = useState(0)
  useInput((input) => {
    if (input === "j") setCount((c) => c + 1)
  })
  return (
    <Box borderStyle="round" padding={1}>
      <Text>Count: {count}</Text>
    </Box>
  )
}

await render(<Counter />).run()
```

## Ecosystem

Silvery is part of a family of terminal-focused libraries:

- **[Termless](https://termless.dev)** -- Headless terminal testing, like Playwright for terminal apps
- **[Flexily](https://beorn.github.io/flexily)** -- Pure JS flexbox layout engine (Yoga-compatible, 2.5x faster, zero WASM)
- **[Loggily](https://beorn.github.io/loggily)** -- Debug + structured logging + tracing in one library

## Coming

- **Renderers** -- Canvas 2D, Web DOM (experimental today, production later)
- **Frameworks** -- Svelte, Solid.js, Vue adapters
- **@silvery/create** -- Structured state management with commands, keybindings, effects-as-data

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
</style>
