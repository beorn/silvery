---
title: FAQ
description: "Frequently asked questions about Silvery — installation, Ink compatibility, performance, components, testing, and terminal support."
faq:
  - q: "What is Silvery?"
    a: "Silvery is a React-based framework for building terminal user interfaces (TUIs). It provides 45+ components, incremental rendering with per-node dirty tracking, responsive layout via useContentRect(), and full support for modern terminal protocols. It works with Bun, Node.js (23.6+), and Deno."
  - q: "How does Silvery compare to Ink?"
    a: "Both use React for terminal UIs. Silvery's key differences are layout-first rendering (components know their size during render), incremental updates (100x faster for typical interactions), a larger component library (45+ vs ~10), and comprehensive terminal protocol support (Kitty keyboard, SGR mouse, graphics, synchronized output). Ink has a larger ecosystem and is faster for full tree re-renders."
  - q: "Is Silvery compatible with existing Ink code?"
    a: "Yes. Silvery provides a compatibility layer via silvery/ink and silvery/chalk that passes 98.9% of Ink's test suite. Most Ink code works with import path changes. See the migration guide for details."
  - q: "How fast is Silvery compared to Ink?"
    a: "For typical interactive updates (cursor move in a 1000-node tree), Silvery takes 169 microseconds vs Ink's 20.7 milliseconds — over 100x faster. Full tree re-renders are 30x slower because Silvery's 5-phase pipeline has overhead, but this scenario rarely occurs in interactive apps. Benchmarked on Apple M1 Max, Bun 1.3.9."
  - q: "What components does Silvery include?"
    a: "45+ components across layout (Box, SplitView, Divider), input (TextInput, TextArea, SelectList, CommandPalette, Form), display (Text, Badge, Spinner, ProgressBar, Table, Tabs, Toast), navigation (TreeView, ListView, VirtualList, Breadcrumb), and containers (Screen, ModalDialog, ScrollbackView). See the component catalog for the full list."
  - q: "Does Silvery work with Node.js, Bun, and Deno?"
    a: "Yes. Silvery is pure TypeScript with no native dependencies or WASM. It works with Bun (any version), Node.js 23.6+ (which has native TypeScript type stripping), and Deno."
  - q: "How do I test Silvery apps?"
    a: "Silvery provides two testing approaches. For fast unit tests, use createRenderer() from @silvery/test for headless rendering with text assertions. For full terminal verification (ANSI output, colors, scrollback, cursor positioning), use createTermless() which runs a real xterm.js emulator in-process."
  - q: "Does Silvery support mouse input?"
    a: "Yes. Silvery supports X10, button event tracking, and SGR extended mouse protocol (coordinates beyond 223). Components can handle onClick, onMouseDown, onMouseUp, and onMouseMove. Focus in/out reporting and mouse cursor shape (via OSC 22) are also supported."
  - q: "What terminal emulators does Silvery support?"
    a: "Silvery works with any terminal that supports basic ANSI escape sequences. Modern features like Kitty keyboard protocol, truecolor, synchronized output, and graphics are auto-detected at startup and enabled when available. Tested with Ghostty, Kitty, iTerm2, WezTerm, Alacritty, Windows Terminal, and others. See terminfo.dev for detailed compatibility data."
  - q: "How does theming work in Silvery?"
    a: "Silvery ships 23 color palettes with semantic tokens ($primary, $success, $muted, $danger, etc.). Themes auto-detect the terminal's background color and adjust for WCAG-compliant contrast. Use ThemeProvider to set a palette, then reference tokens in your components. See the styling guide and theme explorer for details."
  - q: "Is Silvery production-ready?"
    a: "Silvery is actively developed and used in production by a complex TUI application with thousands of nodes, multiple views, and rich interactions. The API surface is stabilizing but may have breaking changes before 1.0. It ships with comprehensive tests, including property-invariant fuzz tests for the rendering pipeline."
  - q: "Does Silvery have TypeScript support?"
    a: "Silvery is written entirely in TypeScript with strict mode enabled. All components, hooks, and APIs are fully typed. The package ships TypeScript source directly (no compiled JavaScript), which works with Bun natively and Node.js 23.6+ with type stripping."
  - q: "How does the layout engine work?"
    a: "Silvery uses Flexily, a Yoga-compatible flexbox layout engine written in pure TypeScript. Layout runs before rendering, so components can access their dimensions via useContentRect(). This enables responsive layouts, native scrollable containers, and automatic text truncation without post-render measurement."
  - q: "Can I use Silvery for fullscreen terminal apps?"
    a: "Yes. Silvery supports both fullscreen mode (alternate screen buffer, absolute positioning, incremental diff) and inline mode (normal scrollback, relative positioning). Fullscreen is the default. Both modes use incremental rendering for efficient updates."
  - q: "How do I migrate from Ink to Silvery?"
    a: "Most Ink code works with minimal changes. Replace ink imports with silvery/ink, chalk with silvery/chalk, and you're running. For new code, use Silvery's native APIs (useContentRect, SelectList, VirtualList) to take advantage of responsive layout and the full component library. See the migration guide for step-by-step instructions."
---

# FAQ

Frequently asked questions about Silvery.

## What is Silvery?

Silvery is a React-based framework for building terminal user interfaces (TUIs). It provides 45+ components, incremental rendering with per-node dirty tracking, responsive layout via `useContentRect()`, and full support for modern terminal protocols. It works with Bun, Node.js (23.6+), and Deno.

If you know React, you know Silvery -- the core API (`Box`, `Text`, `useInput`, `render`) is familiar. What's different is the rendering pipeline: layout runs first, so components know their size during render, and only changed nodes are re-rendered.

## How does Silvery compare to Ink?

Both use React for terminal UIs. Silvery differs in several key ways:

- **Layout-first rendering** -- components know their size during render via `useContentRect()`, enabling responsive layouts without prop drilling or post-render effects
- **Incremental updates** -- per-node dirty tracking makes typical interactive updates 100x faster (169 us vs 20.7 ms for a cursor move in 1000 nodes)
- **Larger component library** -- 45+ components (vs ~10 in Ink), including VirtualList, CommandPalette, TreeView, SplitView, Table, and Form
- **Terminal protocol support** -- Kitty keyboard, SGR mouse, synchronized output, Sixel/Kitty graphics, clipboard, and more

Ink has a larger ecosystem (~1.3M weekly downloads, 50+ community components) and is faster for full tree re-renders. For a detailed breakdown, see [Silvery vs Ink](/guide/silvery-vs-ink).

## Is Silvery compatible with existing Ink code?

Yes. Silvery provides compatibility layers via `silvery/ink` and `silvery/chalk` that pass 98.9% of Ink's test suite. Most Ink code works by changing import paths:

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

For the scenario that matters most -- a user pressing a key in a running application -- Silvery is over 100x faster:

| Scenario                         | Silvery    | Ink         |
| -------------------------------- | ---------- | ----------- |
| **Typical interactive update**   | **169 us** | **20.7 ms** |
| Cold render (1 component)        | 165 us     | 271 us      |
| Layout (50-node kanban)          | 57 us      | 88 us       |
| Full tree re-render (1000 nodes) | 630 ms     | 20.7 ms     |

_Apple M1 Max, 64 GB RAM, Bun 1.3.9, Feb 2026. Reproduce: `bun run bench:compare`_

Full tree re-renders are slower in Silvery because its 5-phase pipeline (measure, layout, content, diff, output) has overhead. But this scenario -- replacing the entire root element -- rarely occurs in interactive apps. See the [benchmark methodology](/guide/silvery-vs-ink#benchmark-methodology) for details.

## What components does Silvery include?

45+ components across several categories:

- **Layout:** Box, Spacer, Fill, Newline, Divider, SplitView
- **Input:** TextInput, TextArea, SelectList, CommandPalette, Form, Toggle, SearchBar
- **Display:** Text, Badge, Spinner, ProgressBar, Table, Tabs, Toast, Tooltip, Skeleton
- **Navigation:** TreeView, ListView, VirtualList, Breadcrumb
- **Containers:** Screen, ModalDialog, PickerDialog, ScrollbackView, ScrollbackList, ErrorBoundary, Console

See the [component catalog](/guides/components) for usage examples and API documentation.

## Does Silvery work with Node.js, Bun, and Deno?

Yes. Silvery is pure TypeScript with no native dependencies or WASM. It works with:

- **Bun** -- any version, natively handles TypeScript
- **Node.js 23.6+** -- uses native TypeScript type stripping (no compilation step)
- **Deno** -- natively handles TypeScript

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

Silvery ships 23 color palettes with semantic tokens:

```tsx
<Box borderStyle="round" borderColor="$primary">
  <Text color="$success">Saved</Text>
  <Text color="$muted">Last updated 2 min ago</Text>
</Box>
```

Themes auto-detect the terminal's background color (via OSC 11 query) and adjust for WCAG-compliant contrast. Use `ThemeProvider` to set a palette globally, or override per-component.

See the [styling guide](/guide/styling) for token reference and the [theme explorer](/themes) to preview all 23 palettes.

## Is Silvery production-ready?

Silvery is actively developed and used in production by a complex TUI application with thousands of nodes, multiple views, and rich interactions. The rendering pipeline is exercised by property-invariant fuzz tests that verify idempotence, no-op stability, inverse operations, and viewport clipping.

The API surface is stabilizing but may have breaking changes before 1.0. If you're building something that needs long-term API stability, pin your version and watch the changelog.

## Does Silvery have TypeScript support?

Silvery is written entirely in TypeScript with strict mode enabled. All components, hooks, and APIs are fully typed. The package ships TypeScript source directly -- no compiled JavaScript, no type declaration files. This means you get full type information including inline documentation in your editor.

## How does the layout engine work?

Silvery uses [Flexily](https://beorn.codes/flexily), a Yoga-compatible flexbox layout engine written in pure TypeScript. The key difference from other terminal frameworks:

1. **Layout runs first** -- Flexily calculates positions and sizes before React renders components
2. **Components access dimensions** -- `useContentRect()` provides width, height, x, y during render
3. **Flexbox model** -- standard CSS flexbox properties (`flexDirection`, `justifyContent`, `alignItems`, `flexGrow`, `flexShrink`, `gap`, etc.)
4. **No WASM** -- pure TypeScript, roughly 1.5x faster than Yoga WASM for typical terminal layouts

This enables responsive layouts (columns that adapt to terminal width), native `overflow="scroll"` containers, and automatic text truncation -- all without post-render measurement.

## Can I use Silvery for fullscreen terminal apps?

Yes. Silvery supports two modes:

- **Fullscreen** (default) -- alternate screen buffer, absolute positioning, incremental diff. Best for interactive apps (editors, dashboards, games).
- **Inline** -- normal scrollback, relative positioning. Best for CLIs that output results and exit, or tools that mix interactive and scrolling output.

Both modes use incremental rendering for efficient updates. The mode is set at startup and affects only the output phase, not components or state management.

## How do I migrate from Ink to Silvery?

Three steps:

1. **Swap imports** -- replace `ink` with `silvery/ink` and `chalk` with `silvery/chalk`
2. **Run your tests** -- 98.9% of Ink's test suite passes with the compatibility layer
3. **Adopt native APIs gradually** -- use `useContentRect()` for responsive layouts, replace manual key handlers with `SelectList`, add themes with semantic tokens

The compatibility layer is a bridge, not a destination. New code should use Silvery's native APIs to get the full benefit of layout-first rendering and the component library.

See the [migration guide](/getting-started/migrate-from-ink) for detailed instructions and common patterns.
