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
    details: '<span class="line"><a href="/guide/react-19">React 18 + 19</a> — hooks, refs, effects, suspense, context, portals. Flexbox layout.</span><span class="line"><a href="/guide/silvery-vs-ink#compatibility">98.6% Ink compatible</a> — same Box/Text/useInput you already know.<a class="feature-link" href="/guide/silvery-vs-ink">Ink comparison →</a></span>'
  - title: Best-in-Class Performance
    details: '<span class="line"><a href="/guide/silvery-vs-ink#performance">3–27× faster</a> than Ink in mounted rerenders. <a href="/guide/silvery-vs-ink#output-efficiency">10–20× less terminal output</a>.</span><span class="line"><a href="https://beorn.codes/flexily">Flexily</a> layout (or Yoga). Pure TypeScript, zero native deps. Bun and Node.js.<a class="feature-link" href="/guide/silvery-vs-ink#performance">Benchmarks →</a></span>'
  - title: Web-like Responsive Layout
    details: '<span class="line"><a href="/guide/hooks">useBoxRect()</a> — real dimensions during render.</span><span class="line"><a href="/guide/scrolling">Scroll containers</a> — virtualization + <a href="/guide/layout-coordinates">sticky positioning</a>.</span><span class="line"><a href="/guide/ansi-layering">ANSI compositing</a> — color blending with alpha.<a class="feature-link" href="/guide/layouts">Layout guide →</a></span>'
  - title: Inline, Fullscreen, or Both
    details: '<span class="line"><a href="/guide/faq#can-i-use-silvery-for-fullscreen-terminal-apps">Fullscreen</a> — alt screen, traditional TUI.</span><span class="line"><a href="/examples/scrollback">Inline</a> — dynamic scrollback, native Cmd+F.</span><span class="line"><a href="/design/dynamic-scrollback">Virtual inline</a> — alt screen + app-managed scrollback.<a class="feature-link" href="/guide/runtime-layers">Runtime layers →</a></span>'
  - title: Web-like Interaction
    details: '<span class="line"><a href="/guide/silvery-vs-ink#terminal-protocol-coverage">100+ protocols</a> — full keyboard and mouse, auto-negotiated.</span><span class="line"><a href="/guide/silvery-vs-ink#focus-system">Focus scopes</a> — spatial nav, Tab, click-to-focus.</span><span class="line"><a href="/guide/text-selection">Text selection</a>. <a href="/guide/find">Find</a>. <a href="/guide/clipboard">Copy-mode</a>. <a href="/guide/event-handling">Drag-and-drop</a>.<a class="feature-link" href="/guide/event-handling">Interaction guide →</a></span>'
  - title: Rich Component Library
    details: '<span class="line"><a href="/guides/components">45+ components</a> — TextInput, SelectList, Table, TreeView, CommandPalette, ModalDialog, Tabs, Toast, and more.</span><span class="line"><a href="/guide/styling">38 palettes</a> — semantic tokens, auto-detected terminal colors.<a class="feature-link" href="/guides/components">Browse components →</a></span>'
  - title: Playwright-Style Testing
    details: '<span class="line"><a href="/guide/testing">CSS locators</a> — cell-level color assertions, press() input.</span><span class="line"><a href="https://termless.dev">Termless</a> — full ANSI fidelity, <a href="https://termless.dev/guide/backends">10 swappable backends</a>.</span><span class="line">3,000+ tests with full access to terminal internals.<a class="feature-link" href="/guide/testing">Testing guide →</a></span>'
  - title: Composable Architecture
    details: '<span class="line"><a href="/guide/providers">pipe()</a> — every layer independently swappable via providers.</span><span class="line"><a href="/guide/layout-engine">Layout</a> — Flexily or Yoga.</span><span class="line"><a href="/guide/runtime-layers">Term</a> — real, headless, emulator.</span><span class="line"><a href="/guide/runtime-layers">App</a> — from stringify to rich (withFocus, withDomEvents, withCommands).<a class="feature-link" href="/guide/providers">Providers guide →</a></span>'
---

## Why Silvery?

Silvery grew out of building a complex terminal app — a multi-pane workspace with thousands of nodes. Components needed to know their size during render. Updates needed to be fast. Scroll containers, mouse events, focus scopes, and Playwright-style testing needed to just work. What started as a renderer grew into a layout engine, then 45+ components, theming, testing infrastructure, and eventually a framework.

Along the way, three principles emerged. Take the best from the web, stay true to the terminal, and raise the bar for developer ergonomics, architecture composability, and performance.

→ [The Silvery Way](/guide/the-silvery-way) · [Silvery vs Ink](/guide/silvery-vs-ink) · [About](/about)

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

## Build Any Terminal App

Try the interactive examples:

::: code-group

```bash [npm]
npx @silvery/examples
```

```bash [bun]
bunx @silvery/examples
```

```bash [pnpm]
pnpm dlx @silvery/examples
```

```bash [vp]
vp @silvery/examples
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

## Ecosystem

Standalone projects Silvery builds on — each stands on its own:

- **[Flexily](https://beorn.codes/flexily)** — pure JS flexbox layout engine (Yoga-compatible, 2.5× faster, zero WASM)
- **[Termless](https://termless.dev)** — headless terminal testing, like Playwright for terminal apps
- **[terminfo.dev](https://terminfo.dev)** — terminal feature compatibility database (161 features, 19 terminals)
- **[Loggily](https://loggily.dev)** — structured logging + tracing + metrics in one library

## Coming

- **Pretext** — rich text layout with word-wrap, hyphenation, and proportional fonts (via Flexily integration)
- **Renderers** — Canvas 2D, Web DOM (experimental today, production later)
- **Frameworks** — Svelte, Solid.js, Vue adapters
- **@silvery/create** — structured state management with commands, keybindings, effects-as-data

<style>
/* Manual links in feature cards — dotted underline, subtle */
.VPFeature a {
  color: var(--vp-c-text-1) !important;
  text-decoration: underline dotted 1px !important;
  text-decoration-color: var(--vp-c-text-3) !important;
  text-underline-offset: 2px !important;
  cursor: pointer !important;
  transition: color 0.2s, text-decoration-color 0.2s, text-decoration-style 0.2s !important;
}
.VPFeature a:hover {
  color: var(--vp-c-brand-1) !important;
  text-decoration: underline solid 1px !important;
  text-decoration-color: var(--vp-c-brand-1) !important;
}
/* Glossary autolinks in feature cards — no underline until hover */
.VPFeature a.hover-link {
  text-decoration: none !important;
  color: inherit !important;
}
.VPFeature a.hover-link:hover {
  color: var(--vp-c-brand-1) !important;
  text-decoration: underline solid 1px !important;
  text-decoration-color: var(--vp-c-brand-1) !important;
}
/* Tighter card padding */
.VPFeature .box {
  padding: 16px 20px !important;
  position: relative;
}
.VPFeature .details {
  line-height: 1.35 !important;
  padding-bottom: 1.75em !important;
}
.VPFeature .line {
  display: block;
  margin-top: 0.75em;
}
.VPFeature .line:first-child {
  margin-top: 0;
}
/* Main card link — bottom-right aligned, consistent across all cards */
/* .feature-link.hover-link needs higher specificity to beat the glossary plugin */
.VPFeature a.feature-link {
  position: absolute;
  bottom: 16px;
  right: 20px;
  display: inline-block;
  font-size: 0.85em;
  font-weight: 500;
  color: var(--vp-c-brand-1) !important;
  text-decoration: none !important;
}
.VPFeature a.feature-link:hover {
  text-decoration: underline !important;
}
.use-cases {
  margin: 0.5rem 0 1.5rem;
}
.use-cases li {
  margin: 0.25rem 0;
}
</style>
