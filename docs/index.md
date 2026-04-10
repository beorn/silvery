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
    details: 'Same Box/Text/useInput you already know. React 18 + 19 — hooks, refs, effects, suspense. Flexbox layout.<br><a href="/guide/silvery-vs-ink#compatibility">918/931 Ink 7.0 tests pass</a> on <a href="/guide/silvery-vs-ink">@silvery/ink</a>.<a class="feature-link" href="/guide/silvery-vs-ink">Full comparison →</a>'
  - title: Best-in-Class Performance
    details: '<a href="/guide/silvery-vs-ink#performance">3–27× faster</a> than Ink in mounted rerenders. <a href="/guide/silvery-vs-ink#output-efficiency">10–20× less terminal output</a>.<br>Pure TypeScript, zero native deps. Layout via <a href="https://beorn.codes/flexily">Flexily</a> (or Yoga). Runs on Bun and Node.js.<a class="feature-link" href="/guide/silvery-vs-ink#performance">Benchmarks →</a>'
  - title: Web-like Responsive Layout
    details: '<a href="/guide/hooks">useBoxRect()</a> returns real dimensions during render.<br><a href="/guide/scrolling">Scroll containers</a> with virtualization. <a href="/guide/layout-coordinates">Sticky positioning</a>.<br><a href="/guide/ansi-layering">ANSI-aware compositing</a> — color blending with alpha.<a class="feature-link" href="/guide/layouts">Layout guide →</a>'
  - title: Inline, Fullscreen, or Both
    details: 'Same components, one-line switch.<br>Fullscreen — alt screen, traditional TUI.<br><a href="/examples/scrollback">Inline</a> — dynamic scrollback, native Cmd+F.<br><a href="/design/dynamic-scrollback">Virtual inline</a> — alt screen + app-managed scrollback.<a class="feature-link" href="/guide/runtime-layers">Runtime layers →</a>'
  - title: Web-like Interaction
    details: 'Full keyboard and mouse events that just work. <a href="/guide/silvery-vs-ink#terminal-protocol-coverage">100+ auto-negotiated protocols</a>.<br><a href="/guide/silvery-vs-ink#focus-system">Focus scopes</a> — spatial nav, Tab, click-to-focus.<br><a href="/guide/text-selection">Text selection</a>. <a href="/guide/find">Find</a>. <a href="/guide/clipboard">Copy-mode</a>. <a href="/guide/event-handling">Drag-and-drop</a>.<a class="feature-link" href="/guide/event-handling">Interaction guide →</a>'
  - title: Rich Component Library
    details: '<a href="/guides/components">45+ components</a>: TextInput, SelectList, Table, TreeView, CommandPalette, ModalDialog, Tabs, Toast, and more. Built-in focus, mouse, and native keybindings.<br><a href="/guide/styling">38 theme palettes</a> with semantic tokens and auto-detected terminal colors.<a class="feature-link" href="/guides/components">Browse components →</a>'
  - title: Playwright-Style Testing
    details: '3,000+ tests with full access to terminal internals.<br>Auto-refreshing CSS locators, cell-level color assertions, press() input.<br><a href="https://termless.dev">Termless</a> — full ANSI fidelity with <a href="https://termless.dev/guide/backends">10 swappable backends</a> (xterm.js, Ghostty, Alacritty, WezTerm, Kitty).<a class="feature-link" href="/guide/testing">Testing guide →</a>'
  - title: Composable Architecture
    details: 'Every layer is independently swappable. <a href="/guide/providers">DI</a> via pipe() providers.<br><a href="/guide/layout-engine">Layout</a> — Flexily or Yoga.<br><a href="/guide/runtime-layers">State</a> — BYO.<br><a href="/guide/runtime-layers">Term</a> — real, headless, emulator.<br><a href="/guide/runtime-layers">App</a> — from stringify to rich app (withFocus, withDomEvents, withCommands).<a class="feature-link" href="/guide/providers">Providers guide →</a>'
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
.VPFeature a {
  color: var(--vp-c-text-1) !important;
  text-decoration: underline !important;
  text-decoration-style: dotted !important;
  text-decoration-color: var(--vp-c-text-3) !important;
  text-underline-offset: 2px !important;
  cursor: pointer !important;
  transition: color 0.2s, text-decoration-color 0.2s, text-decoration-style 0.2s !important;
}
.VPFeature a:hover {
  color: var(--vp-c-brand-1) !important;
  text-decoration-style: solid !important;
  text-decoration-color: var(--vp-c-brand-1) !important;
}
/* Tighter card padding */
.VPFeature .box {
  padding: 16px 20px !important;
}
.VPFeature .details {
  line-height: 1.35 !important;
}
.VPFeature br {
  display: block;
  content: "";
  margin-top: 0.5em;
}
.VPFeature .feature-link {
  display: block;
  margin-top: 0.75em;
  font-size: 12px;
  font-weight: 500;
  text-align: right;
  color: var(--vp-c-brand-1) !important;
  text-decoration: none !important;
}
.VPFeature .feature-link:hover {
  text-decoration: underline !important;
}
.use-cases {
  margin: 0.5rem 0 1.5rem;
}
.use-cases li {
  margin: 0.25rem 0;
}
</style>
