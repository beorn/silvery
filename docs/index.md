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

---

<div class="features-grid">
<div class="feature">

### Familiar React API

Same Box/Text/useInput patterns you already know. If you've used Ink, most code works with just an import change. [918/931 Ink 7.0 tests pass](/guide/silvery-vs-ink#compatibility) on the [@silvery/ink](/guide/silvery-vs-ink) compat layer.

<div class="feature-link"><a href="/guide/silvery-vs-ink">Full feature comparison →</a></div>
</div>
<div class="feature">

### Best-in-Class Performance

[3–6× faster](/guide/silvery-vs-ink#performance) than Ink, [10–20× less terminal output](/guide/silvery-vs-ink#output-efficiency). Pure TypeScript, zero native deps. Layout via [Flexily](https://beorn.codes/flexily) (or Yoga). Runs on Bun and Node.js.

<div class="feature-link"><a href="/guide/silvery-vs-ink#performance">Benchmark details →</a></div>
</div>
<div class="feature">

### Web-like Responsive Layout

One-phase responsive layouts — [`useBoxRect()`](/guide/hooks) returns real dimensions during render. [`overflow="scroll"`](/guide/scrolling) with virtualization. [`position="sticky"`](/guide/layout-coordinates) headers. [ANSI-aware compositing](/guide/ansi-layering) with color blending.

<div class="feature-link"><a href="/guide/layouts">Layout guide →</a></div>
</div>
<div class="feature">

### Rich Component Library

[45+ components](/guides/components): TextInput, SelectList, ListView, Table, CommandPalette, ModalDialog, Tabs, TreeView, Toast, Spinner, and more. Built-in focus, mouse, and native keybindings. [38 theme palettes](/guide/styling) with auto-detected terminal colors.

<div class="feature-link"><a href="/guides/components">Browse components →</a></div>
</div>
<div class="feature">

### Inline, Fullscreen, or Both

Same components, one-line switch. [Inline mode](/examples/scrollback) gets fullscreen-level performance with native scrollback and Cmd+F. Fullscreen mode gets inline-level UX ([app-managed scrollback](/design/dynamic-scrollback)). [Virtual inline](/design/dynamic-scrollback) combines both.

<div class="feature-link"><a href="/guide/runtime-layers">Runtime layers →</a></div>
</div>
<div class="feature">

### Web-like Interaction

[Focus scopes](/guide/silvery-vs-ink#focus-system) with spatial arrow-key nav, click-to-focus, [text selection](/guide/text-selection), [Ctrl+F find](/guide/find), [vim copy-mode](/guide/clipboard), and [drag-and-drop](/guide/event-handling). Powered by [100+ auto-negotiated terminal protocols](/guide/silvery-vs-ink#terminal-protocol-coverage): Kitty keyboard, SGR mouse, hyperlinks, clipboard, and more.

<div class="feature-link"><a href="/guide/event-handling">Interaction guide →</a></div>
</div>
<div class="feature">

### Playwright-Style Testing

3,000+ tests. Auto-refreshing CSS locators, cell-level color assertions, and `press()` input. [Termless](https://termless.dev) provides full ANSI fidelity with [10 swappable backends](https://termless.dev/guide/backends) (xterm.js, Ghostty, Alacritty, WezTerm, Kitty).

<div class="feature-link"><a href="/guide/testing">Testing guide →</a></div>
</div>
<div class="feature">

### Composable Architecture

Every layer is independently swappable: [layout engine](/guide/layout-engine) (Flexily or Yoga), terminal backends, state management (useState, Zustand, Jotai), [render targets](/guide/providers) (terminal, Canvas, DOM), and [runtime layers](/guide/runtime-layers) via `pipe()`.

<div class="feature-link"><a href="/guide/providers">Providers guide →</a></div>
</div>
</div>

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
.features-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 0.75rem;
  margin: 0.75rem 0;
  max-width: 1152px;
  margin-left: auto;
  margin-right: auto;
  padding: 0 1.5rem;
}
.feature {
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  padding: 0.75rem 1rem;
  background: var(--vp-c-bg-soft);
  transition: border-color 0.25s, box-shadow 0.25s;
}
.feature:hover {
  border-color: var(--vp-c-brand-1);
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
}
.feature h3 {
  margin: 0 0 0.25rem;
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--vp-c-text-1);
}
.feature p a {
  color: var(--vp-c-text-2);
  text-decoration: underline;
  text-decoration-color: var(--vp-c-divider);
  text-underline-offset: 2px;
  transition: color 0.2s, text-decoration-color 0.2s;
}
.feature p a:hover {
  color: var(--vp-c-brand-1);
  text-decoration-color: var(--vp-c-brand-1);
}
.feature-link {
  margin-top: 0.5rem;
}
.feature-link a {
  color: var(--vp-c-brand-1) !important;
  text-decoration: none !important;
  font-size: 0.8rem;
  font-weight: 500;
}
.feature-link a:hover {
  text-decoration: underline !important;
}
.feature p {
  margin: 0;
  font-size: 0.85rem;
  line-height: 1.6;
  color: var(--vp-c-text-2);
}
.use-cases {
  margin: 0.5rem 0 1.5rem;
}
.use-cases li {
  margin: 0.25rem 0;
}
</style>
