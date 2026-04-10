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
    details: 'Same Box/Text/useInput you already know:<ul><li>React 18 + 19 — hooks, refs, effects, suspense</li><li>Flexbox layout — flexDirection, padding, gap, flexGrow</li><li><a href="/guide/silvery-vs-ink#compatibility">918/931 Ink 7.0 tests pass</a> on <a href="/guide/silvery-vs-ink">@silvery/ink</a></li></ul>'
    link: /guide/silvery-vs-ink
    linkText: Full feature comparison
  - title: Best-in-Class Performance
    details: 'Pure TypeScript, zero native deps:<ul><li><a href="/guide/silvery-vs-ink#performance">3–6× faster</a> than Ink in mounted rerenders</li><li><a href="/guide/silvery-vs-ink#output-efficiency">10–20× less terminal output</a></li><li>Layout via <a href="https://beorn.codes/flexily">Flexily</a> (or Yoga)</li><li>Runs on Bun and Node.js</li></ul>'
    link: /guide/silvery-vs-ink#performance
    linkText: Benchmark details
  - title: Web-like Responsive Layout
    details: '<a href="/guide/hooks">useBoxRect()</a> returns real dimensions during render:<ul><li><a href="/guide/scrolling">Scroll containers</a> — overflow="scroll" with virtualization</li><li><a href="/guide/layout-coordinates">Sticky positioning</a> — position="sticky" for headers</li><li><a href="/guide/ansi-layering">ANSI-aware compositing</a> — color blending with alpha</li></ul>'
    link: /guide/layouts
    linkText: Layout guide
  - title: Rich Component Library
    details: '<a href="/guides/components">45+ components</a> with built-in focus, mouse, and native keybindings:<ul><li>TextInput, SelectList, ListView, Table, TreeView</li><li>CommandPalette, ModalDialog, Tabs, Toast, Spinner</li><li><a href="/guide/styling">38 theme palettes</a> with auto-detected terminal colors</li></ul>'
    link: /guides/components
    linkText: Browse components
  - title: Inline, Fullscreen, or Both
    details: 'Same components, one-line switch:<ul><li>Fullscreen — alt screen, traditional TUI</li><li><a href="/examples/scrollback">Inline</a> — dynamic scrollback, native Cmd+F</li><li><a href="/design/dynamic-scrollback">Virtual inline</a> — alt screen + app-managed scrollback</li></ul>'
    link: /guide/runtime-layers
    linkText: Runtime layers
  - title: Web-like Interaction
    details: 'Full keyboard and mouse events that just work. Powered by <a href="/guide/silvery-vs-ink#terminal-protocol-coverage">100+ auto-negotiated protocols</a>:<ul><li><a href="/guide/silvery-vs-ink#focus-system">Focus scopes</a> — spatial arrow nav, Tab/Escape, click-to-focus</li><li><a href="/guide/text-selection">Text selection</a> — mouse drag, word/line, userSelect</li><li><a href="/guide/find">Find</a> — Ctrl+F with highlighting and n/N</li><li><a href="/guide/clipboard">Copy-mode</a> · <a href="/guide/event-handling">Drag-and-drop</a></li></ul>'
    link: /guide/event-handling
    linkText: Interaction guide
  - title: Playwright-Style Testing
    details: '3,000+ tests with full access to terminal internals:<ul><li>Auto-refreshing CSS locators, cell-level color assertions, press() input</li><li><a href="https://termless.dev">Termless</a> — full ANSI fidelity with <a href="https://termless.dev/guide/backends">10 swappable backends</a></li><li>xterm.js, Ghostty, Alacritty, WezTerm, Kitty, and more</li></ul>'
    link: /guide/testing
    linkText: Testing guide
  - title: Composable Architecture
    details: 'Every layer is independently swappable:<ul><li><a href="/guide/layout-engine">Layout engine</a> — Flexily or Yoga, usable standalone</li><li>State — useState, Zustand, Jotai, Redux</li><li><a href="/guide/providers">Render targets</a> — terminal, Canvas, DOM</li><li><a href="/guide/runtime-layers">Runtime layers</a> — renderer, runtime, or full app via pipe()</li></ul>'
    link: /guide/providers
    linkText: Providers guide
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
/* Autolink style for inline links within VitePress feature cards */
.VPFeatures .details a {
  color: var(--vp-c-text-1);
  text-decoration: underline;
  text-decoration-style: dotted;
  text-decoration-color: var(--vp-c-text-3);
  text-underline-offset: 2px;
  cursor: pointer;
  transition: color 0.2s, text-decoration-color 0.2s, text-decoration-style 0.2s;
}
.VPFeatures .details a:hover {
  color: var(--vp-c-brand-1);
  text-decoration-style: solid;
  text-decoration-color: var(--vp-c-brand-1);
}
.VPFeatures .details ul {
  margin: 0.15rem 0 0;
  padding-left: 0;
  list-style: none;
}
.VPFeatures .details li {
  margin: 0.05rem 0;
  line-height: 1.4;
  padding-left: 0.75rem;
  text-indent: -0.75rem;
}
.VPFeatures .details li::before {
  content: "·  ";
  color: var(--vp-c-text-3);
}
/* Tighter card padding */
.VPFeatures .VPFeature .box {
  padding: 16px 20px !important;
}
.VPFeatures .details {
  font-size: 13px !important;
  line-height: 1.5 !important;
}
.use-cases {
  margin: 0.5rem 0 1.5rem;
}
.use-cases li {
  margin: 0.25rem 0;
}
</style>
