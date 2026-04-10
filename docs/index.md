---
layout: home
head:
  - - script
    - type: application/ld+json
    - |
      {
        "@context": "https://schema.org",
        "@type": "SoftwareApplication",
        "name": "Silvery",
        "applicationCategory": "DeveloperApplication",
        "operatingSystem": "Cross-platform",
        "programmingLanguage": "TypeScript",
        "url": "https://silvery.dev",
        "downloadUrl": "https://www.npmjs.com/package/silvery",
        "codeRepository": "https://github.com/beorn/silvery",
        "license": "https://opensource.org/licenses/MIT",
        "author": {
          "@type": "Person",
          "name": "Bjørn Stabell",
          "url": "https://beorn.codes",
          "sameAs": ["https://github.com/beorn"]
        },
        "offers": {
          "@type": "Offer",
          "price": "0",
          "priceCurrency": "USD"
        }
      }

hero:
  name: "Silvery"
  text: "React for modern terminal apps"
  tagline: "Powerful apps. Polished UIs. Proudly terminal."
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
    details: "Same Box/Text/useInput patterns you already know. If you've used Ink, most code works with just an import change. @silvery/ink and @silvery/chalk compat layers pass 99% of Ink's and 100% of Chalk's test suites."
    link: /guide/silvery-vs-ink
    linkText: Full feature comparison
  - title: Pure TypeScript
    details: "No WASM, no C++, no native dependencies. Runs on Bun and Node.js. Instant startup, stable memory."
  - title: Fast Incremental Rendering
    details: "3–5× faster than Ink 7.0 on mounted workloads. Cell-level dirty tracking — only changed cells emit to the terminal. Works in inline mode with native scrollback, not just fullscreen."
    link: /guide/silvery-vs-ink#performance
    linkText: See benchmarks
  - title: Advanced Layout
    details: "One-phase responsive layouts — useBoxRect() returns real dimensions during render. overflow=scroll with scrollTo. position=sticky headers. ANSI-aware compositing with color blending."
    link: /guide/silvery-vs-ink
    linkText: Architecture deep dive
  - title: 45+ Components
    details: "VirtualList, TextArea, SelectList, Table, CommandPalette, ModalDialog, Tabs, TreeView, Image, Toast, Spinner, ProgressBar, SplitView, and more."
    link: /guides/components
    linkText: Browse components
  - title: Playwright-Style Testing
    details: "Headless rendering, auto-refreshing locators, getByText/getByTestId queries, bounding box assertions, and press() input. Test terminal UIs like you test web apps."
    link: /guide/testing
    linkText: Testing guide
  - title: Inline, Fullscreen, or Both
    details: "Same components, one-line switch. Inline mode gets fullscreen-level performance (cell-level incremental, no flicker) with native scrollback and Cmd+F. Fullscreen mode gets inline-level UX (app-managed scrollback graduation). Static for CI logs."
    link: /guide/runtime-layers
    linkText: Runtime layers
  - title: Terminal Protocol Support
    details: "100+ escape sequences, all auto-negotiated: Kitty keyboard, SGR mouse, OSC 8 hyperlinks, OSC 52 clipboard, bracketed paste, focus reporting, text sizing, synchronized output, and more."
    link: /guide/silvery-vs-ink
    linkText: See comparison
---

## Why Silvery?

Silvery grew out of building a complex terminal app — a multi-pane workspace with thousands of nodes. Components needed to know their size during render. Updates needed to be fast. Scroll containers, mouse events, focus scopes, and Playwright-style testing needed to just work. What started as a renderer grew into a layout engine, then 45+ components, theming, testing infrastructure, and eventually a framework.

Along the way, three principles emerged. Take the best from the web, stay true to the terminal, and raise the bar for developer ergonomics, architecture composability, and performance.

→ [The Silvery Way](/guide/the-silvery-way) · [Silvery vs Ink](/guide/silvery-vs-ink) · [About](/about)

## Build Any Terminal App

Try the interactive examples:

::: code-group

```bash [npm]
npx silvery examples
```

```bash [bun]
bunx silvery examples
```

```bash [pnpm]
pnpm dlx silvery examples
```

```bash [vp]
vp silvery examples
```

:::

<div class="use-cases">

- **[Components](/examples/components)** -- 45+ ready-made widgets: SelectList, Tabs, ProgressBar, Spinner, and more
- **[Layout](/examples/layout)** -- CSS flexbox for terminals: responsive sizing, gap, scroll containers
- **[Forms & Input](/examples/forms)** -- Multi-step wizards, SelectList, TextInput with readline
- **[Tables & Data](/examples/tables)** -- Table component, VirtualList, responsive columns, search/filter
- **[Scrollback](/examples/scrollback)** -- Dynamic inline mode: freeze-and-scroll, natural history (unique)
- **[AI Coding Agent](/examples/ai-chat)** -- Streaming output, tool calls, command introspection for agents
- **[Testing](/examples/testing)** -- Headless renderer, Playwright-style locators, press() simulation

</div>

## Packages

| Package                           | Description                                                                               |
| --------------------------------- | ----------------------------------------------------------------------------------------- |
| `silvery`                         | Components, hooks, renderer — the one package you need                                    |
| `@silvery/ink` / `@silvery/chalk` | [Ink compatibility](/guide/silvery-vs-ink) — 99% of Ink 7.0 tests, 100% of Chalk tests    |
| `@silvery/test`                   | [Playwright-style testing](/examples/testing) — locators, `press()`, buffer assertions    |
| `@silvery/create`                 | Composable app builder — `pipe()` providers _(under active development)_                  |
| `@silvery/theme`                  | 38 palettes, semantic tokens (`$primary`, `$muted`), auto-detect                          |
| `@silvery/commander`              | **[Beautiful CLIs for free](/reference/commander)** — help renders through Silvery itself |
| `@silvery/headless`               | Pure state machines — portable, embeddable, no React                                      |
| `@silvery/ansi`                   | [Terminal primitives](/reference/ansi) — styling, SGR, truecolor, detection               |

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

Standalone projects Silvery builds on — each stands on its own:

- **[Flexily](https://beorn.codes/flexily)** — pure JS flexbox layout engine (Yoga-compatible, 2.5× faster, zero WASM)
- **[Termless](https://termless.dev)** — headless terminal testing, like Playwright for terminal apps
- **[terminfo.dev](https://terminfo.dev)** — terminal feature compatibility database (161 features, 19 terminals)
- **[Loggily](https://beorn.codes/loggily)** — structured logging + tracing + metrics in one library

## Coming

- **Pretext** — rich text layout with word-wrap, hyphenation, and proportional fonts (via Flexily integration)
- **Renderers** — Canvas 2D, Web DOM (experimental today, production later)
- **Frameworks** — Svelte, Solid.js, Vue adapters
- **@silvery/create** — structured state management with commands, keybindings, effects-as-data

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
