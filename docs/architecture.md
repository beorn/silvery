# Silvery Architecture

Silvery is a React framework for terminal UIs. It provides a React reconciler, layout engine, incremental rendering pipeline, component library, and theme system. Apps are written as standard React components; silvery handles the terminal.

## Rendering Pipeline

Three phases, run on each frame:

```
React tree → AgNode tree → Measure → Layout → Render → ANSI output
                              ↓          ↓         ↓
                          set constraints  positions   incremental
                          from props      via Flexily  buffer diff
```

**Measure** — React reconciler produces an `AgNode` tree. Each node's box props (width, height, flex, padding, etc.) become Flexily layout constraints.

**Layout** — Flexily (pure JS flexbox, Yoga-compatible) calculates positions and sizes. Results land on `AgNode.layout` as `Rect { x, y, width, height }`. Also computes scroll offsets, sticky positions, and screen-relative rects. Components receive layout via `useContentRect()` / `useScreenRect()`.

**Render** — Incremental content render to `TerminalBuffer`. Dirty flags (`contentDirty`, `stylePropsDirty`, `bgDirty`, `subtreeDirty`, `layoutDirty`) control which nodes re-render. Previous frame buffer is cloned; only dirty subtrees are re-rendered. Output phase diffs current vs previous buffer to produce minimal ANSI escape sequences.

The invariant: incremental output must match a fresh (non-incremental) render. Verified with `SILVERY_STRICT=1`.

## Key Abstractions

**Term** — The terminal. Wraps a backend (Node.js stdin/stdout, xterm.js, headless) and provides styling, capabilities, dimensions, I/O, and events. Created via `createTerm()`, passed to `render()` or `run()`. Everything flows through Term.

**AgNode** — The render tree. React reconciler maps each React component to an AgNode. AgNodes carry box props, styles, layout results, and content. The reconciler, layout engine, and renderer all operate on AgNode trees.

**TextFrame** — Immutable snapshot of rendered output. Public read API: `text` (plain), `ansi` (styled), `lines` (per-line), `cell(col, row)` (resolved RGB, bold/dim/italic, underline, hyperlink). `App` implements TextFrame — `app.text`, `app.cell()`, etc. work directly.

**Flexily** — Pure JS flexbox layout engine. Zero dependencies, Yoga-compatible API, 1.5-5.5x faster. Pluggable via adapters — swap with `SILVERY_ENGINE=yoga`. Used internally; apps don't interact with it directly.

## Package Map

Silvery is a monorepo. Internal packages (private, re-exported via barrel):

- `@silvery/ag` — Core types: AgNode, BoxProps, keys, focus management, TextFrame
- `@silvery/ag-react` — React reconciler + hooks + UI components (Box, Text, SelectList, TextInput, VirtualList, etc.)
- `@silvery/ag-term` — Terminal runtime: Term, render pipeline, ANSI output, buffer diffing
- `@silvery/theme` — 38 semantic color palettes, ThemeProvider, theme CLI
- `@silvery/ink` — Ink/Chalk compatibility layers

Public packages (users install directly):

- `silvery` — Main barrel: components, hooks, render, types
- `silvery/runtime` — `run()`, `useInput`, `createRuntime`
- `silvery/theme` — `ThemeProvider`, `useTheme`, palettes
- `silvery/ui` — Component library (progress, CLI, forms, display)
- `@silvery/create` — App composition: `createApp`, `pipe`, `withApp`, TEA store, zustand
- `@silvery/headless` — Pure state machines: SelectList, Readline (no React, no rendering)
- `@silvery/commands` — Command registry, keymaps, invocation
- `@silvery/test` — Virtual renderer + termless integration for testing
- `@silvery/scope` — Structured concurrency: `createScope`, cancellation
- `@silvery/signals` — Reactive signals (alien-signals wrapper)
- `@silvery/ansi` — ANSI utilities, color detection, theme derivation
- `@silvery/color` — Pure color math: RGB/HSL/hex conversion, contrast
- `@silvery/commander` — Commander.js integration with colorized help
- `@silvery/model` — Optional DI model factories

## Component & Hook Model

**Core components** (from `@silvery/ag-react`):

- `Box` — Flexbox container (the `<div>` of silvery)
- `Text` — Styled text content
- `Fill` — Flexible spacer
- `SelectList` — Interactive list with j/k/arrows/Enter (not manual cursor tracking)
- `TextInput` — Text entry with readline (Ctrl+A/E/K/U, Alt+B/F) (not manual key handling)
- `VirtualList` — Virtualized scrolling for large lists
- `Table` — Tabular layout
- `ProgressBar`, `Spinner` — Progress indicators

**Key hooks**:

- `useInput(handler)` — Keyboard/mouse input
- `useLayout()` — Current node's layout rect
- `useContentRect()` / `useScreenRect()` — Content and screen-relative rects
- `useFocusable()` / `useFocusManager()` — Focus management
- `useVirtualization()` — Virtual scrolling state
- `useScrollRegion()` — Scroll containers
- `useCursor()` — Terminal cursor control
- `useEditContext()` — Text editing with readline ops (cut/copy/paste/undo)
- `useApp()` — App-level state (zustand store)

## The Silvery Way

[Full manifesto: docs/guide/the-silvery-way.md](guide/the-silvery-way.md)

Core principle: **always use canonical high-level components, never manual low-level equivalents.**

- Lists → `SelectList` (not manual `useInput()` + `useState` cursor)
- Text entry → `TextInput` (not manual key handling)
- Focus → `focusScope` on Box (not manual focus state)
- Large lists → `VirtualList` (not manual scroll offset)
- Theme colors → `$primary`, `$muted` semantic tokens (not hardcoded ANSI)
- Progress → `ProgressBar` / `Spinner` (not manual animation)

Cursor convention: TextInput/TextArea use real terminal cursor when focused, fake (inverse/underline) when unfocused. No `realCursor` prop — this is just how it works.

## App Composition Layers

Three levels, from simple to full-featured:

1. **`render(<App />, term)`** — One-shot render. No input handling, no app lifecycle.
2. **`run(<App />, term)`** — Full app: input handling, `useInput`, `useExit`, graceful shutdown.
3. **`createApp(config)`** — Multi-provider composition: zustand store, TEA state machines, commands, plugins, `pipe()` for middleware.

Complex applications use level 3 (`createApp`) for multi-provider composition.

## Code Style

Factory functions, `using` cleanup, no classes, no globals. ESM imports only. TypeScript strict mode. Raw `.ts` source published to npm (no build step — Node.js 23.6+ strips types natively).
