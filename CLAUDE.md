# Silvery

React framework for modern terminal UIs. Layout feedback, incremental rendering, multi-target (terminal, canvas, DOM).

**[The Silvery Way](docs/guide/the-silvery-way.md)** — 10 principles for building canonical Silvery apps. Read it before building with Silvery.

## Central Abstraction: Term

`createTerm()` is the terminal abstraction. It wraps a terminal backend (Node.js stdin/stdout, xterm.js, headless) and provides styling, capabilities, dimensions, and I/O. You pass it to `run()` or `render()`:

```typescript
using term = createTerm()
await render(<App />, term)  // or: await run(<App />, term)
```

The same pattern works for any backend. `Term` is a Provider — it has state (dims), events (keys, mouse, resize), output (writable), and styling (chainable ANSI via chalk). See `packages/term/src/ansi/term.ts` for the type and `packages/term/src/runtime/term-provider.ts` for the Provider implementation.

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

## Packages

| Package           | npm               | What                                           |
| ----------------- | ----------------- | ---------------------------------------------- |
| `packages/term`   | `@silvery/term`   | Terminal runtime, ANSI output, pipeline        |
| `packages/react`  | `@silvery/react`  | React reconciler and hooks                     |
| `packages/ui`     | `@silvery/ui`     | Component library (30+ components)             |
| `packages/tea`    | `@silvery/tea`    | TEA state machine store (zustand-based)        |
| `packages/compat` | `@silvery/compat` | Ink/Chalk compatibility layers                 |
| `packages/test`   | `@silvery/test`   | Testing utilities (virtual renderer, locators) |
| `packages/theme`  | `@silvery/theme`  | Theme tokens, 38 palettes, theme CLI           |

The main `silvery` package re-exports `@silvery/react`. Users import from `silvery`, not the scoped packages.

## Structure

| Directory   | What                                                  |
| ----------- | ----------------------------------------------------- |
| `packages/` | Published packages (@silvery/term, @silvery/ui, etc.) |
| `src/`      | Root index.ts (re-exports @silvery/react)             |
| `docs/`     | VitePress documentation site (silvery.dev)            |
| `examples/` | Interactive demos, web showcases, playground          |
| `tests/`    | Test suites (compat, perf, tree-shaking, features)    |
| `scripts/`  | Build and maintenance scripts                         |

## Key Internals

| File                                          | What                                                 |
| --------------------------------------------- | ---------------------------------------------------- |
| `packages/term/src/ansi/term.ts`              | Term type and createTerm() — the central abstraction |
| `packages/term/src/runtime/term-provider.ts`  | Terminal as Provider (state, events, input parsing)  |
| `packages/term/src/runtime/run.tsx`           | Layer 2 entry point — run(<App />, term)             |
| `packages/term/src/runtime/create-app.tsx`    | Layer 3 — multi-provider apps with zustand store     |
| `packages/term/src/pipeline/content-phase.ts` | Incremental rendering (most complex)                 |
| `packages/term/src/pipeline/output-phase.ts`  | Buffer diff, ANSI output generation                  |
| `packages/term/src/pipeline/layout-phase.ts`  | Layout, scroll, sticky, screen rects                 |
| `packages/term/src/pipeline/CLAUDE.md`        | Pipeline internals docs (read before editing)        |

## Documentation Site

VitePress docs at `docs/` — deployed to silvery.dev via GitHub Pages.

- **Config**: `docs/.vitepress/config.ts`
- **CI**: `.github/workflows/docs.yml` — auto-deploys on push to main
- **Do NOT create `docs/site/`** — docs live directly in `docs/`

## Code Style

Factory functions, `using` cleanup, no classes, no globals. ESM imports only. TypeScript strict mode.

## Debugging

```bash
SILVERY_STRICT=1 bun run app          # Verify incremental vs fresh render
SILVERY_STRICT_OUTPUT=1 bun run app   # Verify ANSI output correctness
SILVERY_INSTRUMENT=1 bun run app      # Expose skip/render counts
DEBUG=silvery:* DEBUG_LOG=/tmp/silvery.log bun run app  # Pipeline debug output
```
