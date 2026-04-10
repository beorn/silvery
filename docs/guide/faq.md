---
title: FAQ
description: "Frequently asked questions about Silvery — installation, Ink compatibility, performance, components, testing, and terminal support."
faq:
  - q: "What is Silvery?"
    a: "Polished terminal apps in React. Silvery provides 45+ components, layout-first rendering with per-node dirty tracking, responsive layout via useBoxRect(), and full support for modern terminal protocols. Three principles guide the project: take the best from the web, stay true to the terminal, and raise the bar for developer ergonomics, architecture composability, and performance. It works with Bun and Node.js (23.6+)."
  - q: "How does Silvery compare to Ink?"
    a: "Both use React for terminal UIs. Silvery's key differences are layout-first rendering (components know their size during render via useBoxRect()), comparable performance with different strengths (Silvery faster on cursor/selection, Ink faster on content updates), bundle-parity with Ink+Yoga (114.9 KB vs 116.6 KB gzipped), a larger component library (45+ vs Ink's 6 core + @inkjs/ui's 13), and comprehensive terminal protocol support (Kitty keyboard, SGR mouse, graphics, synchronized output). Ink has a larger ecosystem and is the established standard."
  - q: "Is Silvery compatible with existing Ink code?"
    a: "Yes. Silvery provides a compatibility layer via silvery/ink and silvery/chalk that passes ~99% of Ink 7.0's test suite (918/931 tests). Most Ink code works with import path changes. See the migration guide for details."
  - q: "How fast is Silvery compared to Ink?"
    a: "Silvery is faster on cursor and selection updates (2-6x). Ink is faster on content-heavy changes (1.6-2.5x). Both are fast enough for 60fps at typical terminal sizes. The cell-level output phase also emits 10-20x less output than Ink's line-level diff on incremental updates. See the detailed benchmarks on the Silvery vs Ink page."
  - q: "What components does Silvery include?"
    a: "45+ components across layout (Box, SplitView, Divider), input (TextInput, TextArea, SelectList, CommandPalette, Form), display (Text, Badge, Spinner, ProgressBar, Table, Tabs, Toast), navigation (TreeView, ListView, VirtualList, Breadcrumb), and containers (Screen, ModalDialog, ScrollbackView). See the component catalog for the full list."
  - q: "Does Silvery work with Node.js and Bun?"
    a: "Yes. Silvery is pure TypeScript with no native dependencies or WASM. It works with Bun (any version) and Node.js 23.6+ (which has native TypeScript type stripping)."
  - q: "How do I test Silvery apps?"
    a: "Silvery provides two testing approaches. For fast unit tests, use createRenderer() from @silvery/test for headless rendering with text assertions. For full terminal verification (ANSI output, colors, scrollback, cursor positioning), use createTermless() which runs a real xterm.js emulator in-process."
  - q: "Does Silvery support mouse input?"
    a: "Yes. Silvery supports X10, button event tracking, and SGR extended mouse protocol (coordinates beyond 223). Components can handle onClick, onMouseDown, onMouseUp, and onMouseMove. Focus in/out reporting and mouse cursor shape (via OSC 22) are also supported."
  - q: "What terminal emulators does Silvery support?"
    a: "Silvery works with any terminal that supports basic ANSI escape sequences. Modern features like Kitty keyboard protocol, truecolor, synchronized output, and graphics are auto-detected at startup and enabled when available. Tested with Ghostty, Kitty, iTerm2, WezTerm, Alacritty, Windows Terminal, and others. See terminfo.dev for detailed compatibility data."
  - q: "How does theming work in Silvery?"
    a: "Silvery ships 38 color palettes with semantic tokens ($primary, $success, $muted, $danger, etc.). Themes auto-detect the terminal's background color and adjust for WCAG-compliant contrast. Use ThemeProvider to set a palette, then reference tokens in your components. See the styling guide and theme explorer for details."
  - q: "Is Silvery production-ready?"
    a: "Silvery is actively developed and used in production by a complex TUI application with thousands of nodes, multiple views, and rich interactions. The API surface is stabilizing but may have breaking changes before 1.0. It ships with comprehensive tests, including property-invariant fuzz tests for the rendering pipeline."
  - q: "Does Silvery have TypeScript support?"
    a: "Silvery is written entirely in TypeScript with strict mode enabled. All components, hooks, and APIs are fully typed. The package ships TypeScript source directly (no compiled JavaScript), which works with Bun natively and Node.js 23.6+ with type stripping."
  - q: "How does the layout engine work?"
    a: "Silvery uses Flexily, a Yoga-compatible flexbox layout engine written in pure TypeScript. Layout runs before rendering, so components can access their dimensions via useBoxRect(). This enables responsive layouts, native scrollable containers, and automatic text truncation without post-render measurement."
  - q: "Can I use Silvery for fullscreen terminal apps?"
    a: "Yes. Silvery supports both fullscreen mode (alternate screen buffer, absolute positioning, incremental diff) and inline mode (normal scrollback, relative positioning). Fullscreen is the default. Both modes use incremental rendering for efficient updates."
  - q: "How do I migrate from Ink to Silvery?"
    a: "Most Ink code works with minimal changes. Replace ink imports with silvery/ink, chalk with silvery/chalk, and you're running. For new code, use Silvery's native APIs (useBoxRect, SelectList, VirtualList) to take advantage of responsive layout and the full component library. See the migration guide for step-by-step instructions."
---

# FAQ

Frequently asked questions about Silvery.

## What is Silvery?

Polished terminal apps in React. Silvery provides 45+ components, layout-first rendering with per-node dirty tracking, responsive layout via `useBoxRect()`, and full support for modern terminal protocols. It works with Bun and Node.js (23.6+).

If you know React, you know Silvery -- the core API (`Box`, `Text`, `useInput`, `render`) is familiar. What's different is the rendering pipeline: layout runs first, so components know their size during render, and only changed nodes are re-rendered.

Three principles guide the project: take the best from the web, stay true to the terminal, and raise the bar for developer ergonomics, architecture composability, and performance.

## How does Silvery compare to Ink?

Both use React for terminal UIs. Silvery differs in several key ways:

- **Layout-first rendering** — layout runs before content render, so components know their size during render via `useBoxRect()`. No components rendering at `width: 0`, no cascading measure→rerender cycles. See [Silvery vs Ink](/guide/silvery-vs-ink#responsive-layout).
- **Fast incremental rendering** — cell-level dirty tracking. Silvery is faster on cursor/selection updates (2-6x); Ink is faster on content-heavy changes (1.6-2.5x). See the [detailed benchmarks](/guide/silvery-vs-ink#performance--size).
- **Bundle parity with Ink+Yoga** — 114.9 KB gzipped runtime vs Ink+Yoga's 116.6 KB. Pure TypeScript, zero WASM, zero native dependencies.
- **Larger component library** — 45+ components (vs Ink's 6 core + [@inkjs/ui](https://github.com/vadimdemedes/ink-ui)'s 13), including VirtualList, CommandPalette, TreeView, SplitView, Table, and Form
- **Terminal protocol support** — Kitty keyboard, SGR mouse, synchronized output (DEC 2026), Sixel/Kitty graphics, clipboard, and more
- **Dynamic inline scrollback** — live React zone at the bottom, completed items graduate to terminal-owned scrollback. Cmd+F works natively.

Ink has a larger ecosystem (~1.3M weekly downloads, 50+ community components) and is the established standard. For a detailed breakdown, see [Silvery vs Ink](/guide/silvery-vs-ink).

## Is Silvery compatible with existing Ink code?

Yes. Silvery provides compatibility layers via `silvery/ink` and `silvery/chalk` that pass ~99% of Ink 7.0's test suite (918/931 tests). Most Ink code works by changing import paths:

```ts
// Before
import { Box, Text } from "ink"
import chalk from "chalk"

// After
import { Box, Text } from "silvery/ink"
import chalk from "silvery/chalk"
```

For new code, use Silvery's native APIs to take advantage of responsive layout and the full component library. See the [migration guide](/getting-started/migrate-from-ink) for step-by-step instructions.

## How fast is Silvery compared to Ink?

Silvery and Ink have different performance strengths on mounted workloads. Both frameworks keep a mounted app and call `rerender()`.

| Scenario                                  | Advantage          |
| ----------------------------------------- | ------------------ |
| Mounted cursor move 100-item              | **Silvery 2.3×**   |
| Memo'd cursor highlight 100 (inverse)     | **Silvery 4.1×**   |
| Memo'd cursor highlight 1000 (inverse)    | **Silvery 6.0×**   |
| Mounted kanban text change                | **Ink 2.5×**       |
| Memo'd 100-item toggle                    | **Ink 2.4×**       |
| Memo'd 500-item toggle                    | **Ink 1.6×**       |
| Memo'd kanban card edit                   | **Ink 1.7×**       |

Both are fast enough for 60fps at typical terminal sizes. Silvery's cell-level dirty tracking gives it an advantage on cursor and selection updates (the most common interactive operation). Ink is faster on content-heavy changes where more of the tree updates at once.

Beyond CPU time, Silvery's cell-level output phase emits **10–20× less output** to the terminal than Ink's line-level diff on incremental updates.

Methodology: `debug: false`, `maxFps: 10000`, `incrementalRendering: true`. See the [full benchmarks](/guide/silvery-vs-ink#performance--size) for details.

## What components does Silvery include?

45+ components across several categories:

- **Layout:** Box, Spacer, Fill, Newline, Divider, SplitView
- **Input:** TextInput, TextArea, SelectList, CommandPalette, Form, Toggle, SearchBar
- **Display:** Text, Badge, Spinner, ProgressBar, Table, Tabs, Toast, Tooltip, Skeleton
- **Navigation:** TreeView, ListView, VirtualList, Breadcrumb
- **Containers:** Screen, ModalDialog, PickerDialog, ScrollbackView, ScrollbackList, ErrorBoundary, Console

See the [component catalog](/guides/components) for usage examples and API documentation.

## Does Silvery work with Node.js and Bun?

Yes. Silvery is pure TypeScript with no native dependencies or WASM. It works with:

- **Bun** -- any version, natively handles TypeScript
- **Node.js 23.6+** -- uses native TypeScript type stripping (no compilation step)

The package ships TypeScript source directly. There is no build step, no `dist/` directory, and no compiled JavaScript.

## How do I test Silvery apps?

Silvery provides two testing approaches:

**Fast unit tests** with `createRenderer()` from `@silvery/test`. This is a headless renderer that produces stripped text output for assertions:

```tsx
import { createRenderer } from "@silvery/test"

const app = createRenderer(<MyComponent />)
expect(app.text).toContain("Hello")
```

**Full terminal tests** with `createTermless()`, which runs a real xterm.js terminal emulator in-process. This verifies actual ANSI output, colors, scrollback, and cursor positioning:

```tsx
import { createTermless } from "@silvery/test"
import { run } from "silvery/runtime"

using term = createTermless({ cols: 80, rows: 24 })
const handle = await run(<App />, term)
expect(term.screen).toContainText("Hello")
```

See the [testing guide](/guide/testing) for more patterns.

## Does Silvery support mouse input?

Yes. Silvery supports the full SGR extended mouse protocol:

- **Click events:** `onClick`, `onMouseDown`, `onMouseUp` on Box components
- **Movement:** `onMouseMove` for hover effects and drag interactions
- **Scroll:** Mouse wheel events via the mouse protocol
- **Extended coordinates:** SGR mode supports coordinates beyond column/row 223
- **Focus reporting:** Focus in/out events when the terminal window gains or loses focus
- **Cursor shape:** OSC 22 mouse cursor shape control (pointer, text, crosshair)

Mouse support is auto-detected and enabled when the terminal supports it.

## What terminal emulators does Silvery support?

Silvery works with any terminal that supports basic ANSI escape sequences. Modern features are auto-detected at startup using terminal queries (DA1, DA2, XTVERSION) and enabled when available:

- **Full support:** Ghostty, Kitty, WezTerm, iTerm2
- **Good support:** Alacritty, Windows Terminal, Hyper
- **Basic support:** Terminal.app, older xterm builds

Auto-detected features include Kitty keyboard protocol, truecolor, synchronized output, graphics protocols, and clipboard access. See [terminfo.dev](https://terminfo.dev) for detailed compatibility data across terminal emulators.

## How does theming work in Silvery?

Silvery ships 38 color palettes with semantic tokens:

```tsx
<Box borderStyle="round" borderColor="$primary">
  <Text color="$success">Saved</Text>
  <Text color="$muted">Last updated 2 min ago</Text>
</Box>
```

Themes auto-detect the terminal's background color (via OSC 11 query) and adjust for WCAG-compliant contrast. Use `ThemeProvider` to set a palette globally, or override per-component.

See the [styling guide](/guide/styling) for token reference and the [theme explorer](/themes) to preview all 38 palettes.

## Is Silvery production-ready?

Silvery is actively developed and used in production by a complex TUI application with thousands of nodes, multiple views, and rich interactions. The rendering pipeline is exercised by property-invariant fuzz tests that verify idempotence, no-op stability, inverse operations, and viewport clipping.

The API surface is stabilizing but may have breaking changes before 1.0. If you're building something that needs long-term API stability, pin your version and watch the changelog.

## Does Silvery have TypeScript support?

Silvery is written entirely in TypeScript with strict mode enabled. All components, hooks, and APIs are fully typed. The package ships TypeScript source directly -- no compiled JavaScript, no type declaration files. This means you get full type information including inline documentation in your editor.

## How does the layout engine work?

Silvery uses [Flexily](https://beorn.codes/flexily), a Yoga-compatible flexbox layout engine written in pure TypeScript. The key difference from other terminal frameworks:

1. **Layout runs first** -- Flexily calculates positions and sizes before React renders components
2. **Components access dimensions** -- `useBoxRect()` provides width, height, x, y during render
3. **Flexbox model** -- standard CSS flexbox properties (`flexDirection`, `justifyContent`, `alignItems`, `flexGrow`, `flexShrink`, `gap`, etc.)
4. **No WASM** -- pure TypeScript, 2.5× faster than Yoga WASM for typical terminal layouts

This enables responsive layouts (columns that adapt to terminal width), native `overflow="scroll"` containers, and automatic text truncation -- all without post-render measurement.

## Can I use Silvery for fullscreen terminal apps?

Yes. Silvery supports two modes:

- **Fullscreen** (default) -- alternate screen buffer, absolute positioning, incremental diff. Best for interactive apps (editors, dashboards, games).
- **Inline** -- normal scrollback, relative positioning. Best for CLIs that output results and exit, or tools that mix interactive and scrolling output.

Both modes use incremental rendering for efficient updates. The mode is set at startup and affects only the output phase, not components or state management.

## How do I migrate from Ink to Silvery?

Three steps:

1. **Swap imports** -- replace `ink` with `silvery/ink` and `chalk` with `silvery/chalk`
2. **Run your tests** — ~99% of Ink 7.0's test suite (918/931) passes with the compatibility layer
3. **Adopt native APIs gradually** -- use `useBoxRect()` for responsive layouts, replace manual key handlers with `SelectList`, add themes with semantic tokens

The compatibility layer is a bridge, not a destination. New code should use Silvery's native APIs to get the full benefit of layout-first rendering and the component library.

See the [migration guide](/getting-started/migrate-from-ink) for detailed instructions and common patterns.
