# Silvery

React framework for modern terminal UIs. Layout feedback, incremental rendering, multi-target (terminal, canvas, DOM). Library works with Bun and Node.js >= 18; CLI (`bin/silvery.ts`) requires Bun.

**[The Silvery Way](docs/guide/the-silvery-way.md)** — 10 principles for building canonical Silvery apps. Read it before building with Silvery.

**[Styling Guide](docs/guide/styling.md)** — Semantic colors, typography presets, and component defaults. Read it before styling anything.

## Central Abstraction: Term

`createTerm()` is the terminal abstraction. It wraps a terminal backend (Node.js stdin/stdout, xterm.js, headless) and provides styling, capabilities, dimensions, and I/O. You pass it to `run()` or `render()`:

```typescript
using term = createTerm()
await render(<App />, term)  // or: await run(<App />, term)
```

The same pattern works for any backend. `Term` is a Provider — it has state (dims), events (keys, mouse, resize), output (writable), and styling (chainable ANSI via chalk). See `packages/ag-term/src/ansi/term.ts` for the type and `packages/ag-term/src/runtime/term-provider.ts` for the Provider implementation.

## TextFrame: Immutable Render Output

`TextFrame` is the unified interface for rendered terminal output. It provides plain text, ANSI-styled text, per-line access, cell-level queries with resolved RGB colors, and text search. Defined in `packages/ag/src/text-frame.ts`.

`createTextFrame(buffer)` creates an immutable snapshot from a `TerminalBuffer`. The snapshot is detached — buffer mutations after creation don't affect the frame. Text and ANSI are lazily computed on first access.

```typescript
interface TextFrame {
  readonly text: string // plain text (no ANSI)
  readonly ansi: string // text with ANSI styling
  readonly lines: string[] // per-line plain text
  readonly width: number // frame width in columns
  readonly height: number // frame height in rows
  cell(col: number, row: number): FrameCell // resolved styling per cell
  containsText(text: string): boolean // substring search
}
```

`FrameCell` has resolved RGB colors (not raw palette indices), flattened boolean attributes (bold, dim, italic, etc.), underline style/color, wide character info, and hyperlink URL.

`App` structurally implements `TextFrame` — `app.text`, `app.ansi`, `app.lines`, `app.width`, `app.height`, `app.cell()`, `app.containsText()` all work directly. Internal pipeline code continues to use `TerminalBuffer`; `TextFrame` is the public read API.

### term.paint() and term.frame

`Term` has an optional `paint(buffer, prev)` method that diffs two `TerminalBuffer`s via the output phase and returns the ANSI string. After painting, `term.frame` holds an immutable `TextFrame` snapshot.

```typescript
const term = createTerm({ cols: 80, rows: 24 })
const output = term.paint!(buffer, prevBuffer) // ANSI diff string
term.frame // TextFrame — cell access, text, containsText()
```

Behavior varies by Term type:

- **Node.js terminal**: computes ANSI diff, stores frame (caller writes output to stdout)
- **Headless**: stores frame, returns empty string (no output)
- **Emulator (termless)**: computes ANSI diff, feeds emulator, stores frame

`RenderAdapter` is internal — not exported from the public barrel. Use `term.paint()` instead of `adapter.flush()`.

## Ag: Decomposed Pipeline

`createAg(root, { measurer? })` wraps the render pipeline as two independent phases:

```typescript
import { createAg } from "@silvery/ag-term"

const ag = createAg(root, { measurer })
ag.layout({ cols: 80, rows: 24 }) // measure + flexbox → positions/sizes
const { frame, buffer, prevBuffer } = ag.render() // positioned tree → TextFrame
ag.resetBuffer() // clear prev (on resize)
ag.render({ fresh: true }) // force non-incremental render
```

- `ag.layout(dims, opts?)` — measure, layout, scroll, sticky, screenRect, notify
- `ag.render(opts?)` — incremental content render → TextFrame + TerminalBuffer
- Internal prevBuffer management — no caller tracking needed
- `executeRender()` delegates to `createAg` internally

## Composition Architecture

Silvery apps are assembled via `pipe()` — each **provider** (`with-*` function) adds one capability to the app object. Providers live in `@silvery/create`. Pure state machines live in `@silvery/headless`.

- **[Providers and Plugins](docs/guide/providers.md)** — `pipe()` composition, `AppPlugin` type, all built-in providers, how to write custom providers
- **[Headless Machines](docs/guide/headless-machines.md)** — `createMachine()`, pure update functions (readline, select-list), naming conventions, React hooks

Quick reference:

```typescript
const app = pipe(
  createApp(store),       // base app
  withReact(<Board />),   // React reconciler
  withTerminal(process),  // terminal I/O
  withFocus(),            // Tab/Escape focus + FindFeature (Ctrl+F) + CopyModeFeature (Esc,v)
  withDomEvents(),        // mouse dispatch + SelectionFeature + DragFeature
)
```

### Interactions Runtime

Interactive features (selection, find, copy-mode, drag) are implemented as runtime features in `packages/ag-term/src/features/`. Each feature registers with the **InputRouter** (`@silvery/create/internal/input-router.ts`) for event dispatch and the **CapabilityRegistry** (`@silvery/create/internal/capability-registry.ts`) for React-side state access.

| Feature            | Activated by      | Trigger                 | Observer hook    |
| ------------------ | ----------------- | ----------------------- | ---------------- |
| `SelectionFeature` | `withDomEvents()` | mouse drag              | `useSelection()` |
| `DragFeature`      | `withDomEvents()` | mouse drag on draggable | —                |
| `FindFeature`      | `withFocus()`     | `Ctrl+F`                | —                |
| `CopyModeFeature`  | `withFocus()`     | `Esc, v`                | —                |

React components access feature state via the `CapabilityRegistryContext`. The `useSelection()` hook is the canonical example — it reads `SelectionFeature` state without needing a provider wrapper.

## Commands

```bash
bun test                  # Run all tests
bun run test:fast         # Fast tests (dot reporter)
bun run typecheck         # Type check
bun run lint              # Lint (oxlint + oxfmt)
bun run fix               # Auto-fix lint + format
bun run docs:dev          # Local docs dev server
bun run docs:build        # Build docs for production
bun run theme             # Theme CLI (list/preview palettes)
bun run compat            # Run Ink/Chalk compatibility checks
```

## Public Packages

Users install and import from these packages:

| Package              | What                                                                        |
| -------------------- | --------------------------------------------------------------------------- |
| `silvery`            | Main barrel — components, hooks, render, types, runtime                     |
| `@silvery/create`    | App composition — createApp, pipe, withApp, TEA store                       |
| `@silvery/test`      | Testing utilities — virtual renderer, locators                              |
| `@silvery/headless`  | Pure state machines — SelectList, Readline (no React)                       |
| `@silvery/commands`  | Command registry, keymaps, invocation                                       |
| `@silvery/scope`     | Structured concurrency — createScope, withScope                             |
| `@silvery/signals`   | Reactive signals — thin wrapper around alien-signals                        |
| `@silvery/model`     | Optional DI model factories                                                 |
| `@silvery/commander` | Type-safe Commander.js with colorized help, Standard Schema                 |
| `@silvery/ansi`      | Everything terminal — styling, ANSI primitives, detection, theme derivation |
| `@silvery/color`     | Color math — blend, brighten, darken, hexToRgb, contrast (re-exported by @silvery/theme) |

Subpath imports available from `silvery`:

- `silvery` — components, hooks, render, types (re-exports @silvery/ag-react)
- `silvery/runtime` — run(), useInput, createRuntime (re-exports @silvery/ag-term/runtime)
- `silvery/theme` — ThemeProvider, useTheme, palettes, color utilities (re-exports @silvery/theme)
- `silvery/ui` — component library (re-exports @silvery/ag-react/ui)
- `silvery/ui/cli` — CLI progress indicators (no React)
- `silvery/ui/react` — React progress components
- `silvery/ink`, `silvery/chalk` — Ink/Chalk compatibility layers

## Internal Packages

These are workspace packages for development. Users do not import from them directly — the `silvery` barrel re-exports their public APIs. All marked `"private": true`.

| Package             | What                                       |
| ------------------- | ------------------------------------------ |
| `@silvery/ag`       | Core types (AgNode, BoxProps, keys, focus) |
| `@silvery/ag-react` | React reconciler, hooks, and UI components |
| `@silvery/ag-term`  | Terminal runtime, ANSI output, pipeline    |
| `@silvery/theme`    | Theme tokens, 38 palettes, theme CLI       |
| `@silvery/ink`      | Ink/Chalk compatibility layers             |

## Structure

| Directory   | What                                                                              |
| ----------- | --------------------------------------------------------------------------------- |
| `packages/` | Internal workspace packages (ag, ag-react, ag-term, tea, test, theme, ink)        |
| `src/`      | Public barrel + subpath re-exports (index.ts, runtime.ts, theme.ts, ui.ts, ui/\*) |
| `docs/`     | VitePress documentation site (silvery.dev)                                        |
| `examples/` | Interactive demos, web showcases, playground                                      |
| `tests/`    | Test suites (compat, perf, tree-shaking, features)                                |
| `scripts/`  | Build and maintenance scripts                                                     |

## Key Internals

| File                                            | What                                                 |
| ----------------------------------------------- | ---------------------------------------------------- |
| `packages/ag/src/text-frame.ts`                 | TextFrame + FrameCell type definitions               |
| `packages/ag-term/src/ansi/term.ts`             | Term type and createTerm() — the central abstraction |
| `packages/ag-term/src/runtime/term-provider.ts` | Terminal as Provider (state, events, input parsing)  |
| `packages/ag-term/src/runtime/run.tsx`          | Layer 2 entry point — run(<App />, term)             |
| `packages/ag-term/src/runtime/create-app.tsx`   | Layer 3 — multi-provider apps with zustand store     |
| `packages/ag-term/src/pipeline/render-phase.ts` | Incremental rendering (most complex)                 |
| `packages/ag-term/src/buffer.ts`                | TerminalBuffer + createTextFrame() snapshot factory  |
| `packages/ag-term/src/pipeline/output-phase.ts` | Buffer diff, ANSI output generation                  |
| `packages/ag-term/src/pipeline/layout-phase.ts` | Layout, scroll, sticky, screen rects                 |
| `packages/ag-term/src/pipeline/CLAUDE.md`       | Pipeline internals docs (read before editing)        |

## Documentation Site

VitePress docs at `docs/` — deployed to silvery.dev via GitHub Pages.

- **Config**: `docs/.vitepress/config.ts`
- **CI**: `.github/workflows/docs.yml` — auto-deploys on push to main
- **Do NOT create `docs/site/`** — docs live directly in `docs/`

### Docs conventions

**Package manager commands** must always show all variants using VitePress `::: code-group` blocks with tabs for npm, bun, pnpm, and vp (Vite Plus):

````md
::: code-group

```bash [npm]
npx silvery examples
```
````

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

````

This applies to install commands, run commands, and `npx`/`bunx`/`pnpm dlx`/`vp` invocations.

## Code Style

Factory functions, `using` cleanup, no classes, no globals. ESM imports only. TypeScript strict mode.

## Testing with termless

`createTermless()` from `@silvery/test` creates an in-process terminal emulator for full ANSI testing — renders go through the real pipeline and a real xterm.js emulator, not stripped text:

```tsx
import { createTermless } from "@silvery/test"
import { run } from "silvery/runtime"
import "@termless/test/matchers"

using term = createTermless({ cols: 80, rows: 24 })
const handle = await run(<App />, term)

expect(term.screen).toContainText("Hello") // termless screen assertion
await handle.press("j") // input via handle
expect(term.screen).toContainText("Count: 1")
````

`createTermless(dims)` wraps `createTerm(createXtermBackend(), dims)`. The Term exposes `screen` and `scrollback` from the emulator for assertions.

Three kinds of Term:

- `createTerm()` — Node.js terminal (real stdin/stdout)
- `createTerm({ cols, rows })` — Headless (no output)
- `createTermless({ cols, rows })` — Terminal emulator (real ANSI processing, screen/scrollback)

Use `@silvery/test` + `createRenderer()` for fast stripped-text tests; use `createTermless()` when you need to verify ANSI output, box drawing, colors, scrollback, or cursor positioning. App has `cell(col, row)` for `FrameCell` access with resolved RGB colors — useful for asserting styling without parsing ANSI.

## Common Tasks

**Need to...** → **Use this:**

| Task | Import | Example |
|------|--------|---------|
| Blend/mix colors | `import { blend } from "@silvery/theme"` | `blend("#000", "#fff", 0.5)` |
| Brighten/darken | `import { brighten, darken } from "@silvery/theme"` | `brighten("#333", 0.2)` |
| Check contrast | `import { checkContrast } from "@silvery/theme"` | `checkContrast(fg, bg)` |
| Hex↔RGB↔HSL | `import { hexToRgb, rgbToHex, hexToHsl } from "@silvery/theme"` | |
| Cell-level color assertions | `app.cell(col, row)` or `term.cell(row, col)` | `expect(cell.fg).toBe(...)` |
| Frame-by-frame testing | `handle.frames` (ANSI strings per render) | Iterate all render frames |
| Cell grid per frame | termless `TapeFrame[]` via tape executor | `frame.cell(r, c)` |
| Verify incremental = fresh | `SILVERY_STRICT=1` env var | Auto-diffs every render |
| Replay all frames | `SILVERY_STRICT_ACCUMULATE=1` env var | O(N²) full replay |
| Terminal emulator in tests | `createTermless({ cols, rows })` from `@silvery/test` | Real ANSI processing |

## Debugging

See **[Debugging Guide](docs/guide/debugging.md)** for the canonical reference: env vars, STRICT mode hierarchy, diagnostic workflow, and symptom→check cross-reference.

Quick start:

```bash
SILVERY_STRICT=1 bun run app              # Verify incremental vs fresh render
SILVERY_STRICT_TERMINAL=vt100 bun run app # Verify ANSI output (fast, internal parser)
SILVERY_STRICT_TERMINAL=xterm bun run app # Verify via xterm.js emulator
SILVERY_STRICT_TERMINAL=all bun run app   # All backends (vt100 + xterm + ghostty)
SILVERY_INSTRUMENT=1 bun run app          # Expose skip/render counts
DEBUG=silvery:* DEBUG_LOG=/tmp/silvery.log bun run app  # Pipeline debug output
```

## Fuzz Tests

Property-invariant and stress fuzz tests (run with `FUZZ=1`, not in CI):

- `tests/features/property-invariants.fuzz.tsx` — 7 property invariants (idempotence, no-op, inverse ops, viewport clipping, combined)
- `tests/features/incremental-rendering.fuzz.tsx` — Stress tests (scrollable lists, nested bg, wrap boundaries, absolute positioning, multi-column boards)
