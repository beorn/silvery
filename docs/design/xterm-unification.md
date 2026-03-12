# Xterm.js Unification: Terminal as Provider

## Status: Design Proposal

## Problem

`renderToXterm()` is a parallel render path that duplicates core runtime logic:

1. **Own reconciler management** — creates container, fiber root, schedules renders via `requestAnimationFrame`
2. **Own render pipeline** — uses `executeRenderAdapter` (adapter-aware path with `contentPhaseAdapter`) instead of `executeRender` (terminal-optimized with incremental `contentPhase`)
3. **No runtime features** — no `useInput`, no focus management, no `RuntimeContext`, no event loop, no store
4. **Input handled externally** — showcases wire their own key/mouse handlers via callbacks instead of using the standard `useInput`/`useMouse` hooks

This means:

- Web showcases can't use `useInput`, `useFocusManager`, or any runtime hook
- The adapter content phase (`contentPhaseAdapter`) lacks incremental rendering (full re-render every frame)
- Two content phases must be maintained in parallel
- Bug fixes to the main pipeline don't benefit xterm.js renders

## Proposed Solution: `createXtermProvider()`

The terminal is already modeled as a Provider (`Provider<TermState, TermEvents>`) via `createTermProvider(stdin, stdout)`. Create an equivalent for xterm.js:

```typescript
import type { TermState, TermEvents } from "@silvery/term/runtime"
import type { Provider, ProviderEvent } from "@silvery/term/runtime"

/**
 * Create a terminal provider from an xterm.js Terminal instance.
 *
 * Returns a Provider<TermState, TermEvents> — same shape as
 * createTermProvider(stdin, stdout), so run() handles it identically.
 */
export function createXtermProvider(
  terminal: XtermTerminal,
  options?: { cols?: number; rows?: number },
): Provider<TermState, TermEvents> & Disposable
```

### How It Works

The xterm provider wraps `terminal.onData` and `terminal.textarea` focus events into the same `ProviderEvent<TermEvents>` stream that `createTermProvider` produces:

| Node.js (`createTermProvider`)     | xterm.js (`createXtermProvider`)             |
| ---------------------------------- | -------------------------------------------- |
| `stdin.on("data", chunk)`          | `terminal.onData(data)`                      |
| `stdout.on("resize", handler)`     | External `resize()` call or `ResizeObserver` |
| `stdout.write(frame)`              | `terminal.write(frame)`                      |
| `stdin.setRawMode(true)`           | N/A (xterm.js is always "raw")               |
| Focus reporting via ANSI sequences | `terminal.textarea` focus/blur events        |

### State & Events

```typescript
// State (same as TermState)
{ cols: number, rows: number }

// Events (same as TermEvents)
{ type: "key",    data: { input: string, key: Key } }
{ type: "mouse",  data: ParsedMouse }
{ type: "paste",  data: { text: string } }
{ type: "resize", data: Dims }
{ type: "focus",  data: { focused: boolean } }
```

### RenderTarget for xterm.js

`createApp` uses `RenderTarget` for output. For xterm.js:

```typescript
function createXtermRenderTarget(
  terminal: XtermTerminal,
  provider: Provider<TermState, TermEvents>,
): RenderTarget {
  return {
    write(frame: string): void {
      terminal.write(frame)
    },
    getDims(): Dims {
      return provider.getState()
    },
    onResize(handler: (dims: Dims) => void): () => void {
      return provider.subscribe((state) => handler(state))
    },
  }
}
```

### Usage After Unification

```typescript
// Before: renderToXterm (special path, no runtime)
import { renderToXterm } from "@silvery/term/xterm"
const instance = renderToXterm(<App />, xtermTerminal, {
  input: { onKey: ..., onMouse: ..., onFocus: ... },
})

// After: run() with xterm provider (full runtime)
import { run } from "@silvery/term/runtime"
import { createXtermProvider } from "@silvery/term/xterm"

const term = createXtermProvider(xtermTerminal)
const handle = await run(<App />, {
  term,                    // Provider<TermState, TermEvents>
  stdout: ...,             // XtermWriteStream adapter
  // All runtime features work: useInput, useFocusManager, etc.
})
```

### The stdout Adapter Challenge

`createApp` expects `stdout: NodeJS.WriteStream` for:

1. **Terminal output** — `stdout.write(frame)` for ANSI data
2. **Resize detection** — `stdout.on("resize", handler)`, `stdout.columns`, `stdout.rows`
3. **Protocol sequences** — alternate screen, cursor hide/show, Kitty keyboard, mouse tracking, bracketed paste

For xterm.js, we need a lightweight adapter:

```typescript
function createXtermWriteStream(terminal: XtermTerminal): NodeJS.WriteStream {
  // Minimal WriteStream interface that delegates to terminal.write()
  // and provides cols/rows from the terminal
}
```

Alternatively, refactor `initApp` to accept `RenderTarget` directly (avoids the WriteStream adapter entirely). This is the cleaner path but requires more changes to `create-app.tsx`.

## Implementation Plan

### Phase 1: `createXtermProvider()` (new file)

Create `packages/term/src/xterm/xterm-provider.ts`:

- Implements `Provider<TermState, TermEvents>`
- Wraps `terminal.onData` → parses keys/mouse via existing `parseKey`/`parseMouseSequence`
- Wraps `terminal.textarea` focus/blur → focus events
- `getState()` returns `{ cols, rows }` from terminal
- `events()` yields parsed events
- `resize(cols, rows)` method to update state from external resize

### Phase 2: Wire into `run()` / `createApp()`

Two approaches (pick one):

**Option A: RenderTarget refactor** (cleaner, more work)

- Add `target?: RenderTarget` to `AppRunOptions`
- When `target` is provided, skip stdout-based setup (no alternate screen, no raw mode)
- Wire `target.write` for output, `target.onResize` for resize
- Provider events drive the event loop as usual

**Option B: WriteStream adapter** (less invasive, more hacky)

- Create `XtermWriteStream` that wraps `terminal.write()` and emits resize events
- Pass it as `stdout` to `initApp`
- Skip Node.js-specific terminal setup when detecting xterm context

### Phase 3: Migrate showcases

Update `showcase-app.tsx` to use the new API:

```tsx
const provider = createXtermProvider(term)
const handle = await run(<ShowcaseComponent />, { term: provider })

// Resize
window.addEventListener("resize", () => {
  fitAddon.fit()
  provider.resize(term.cols, term.rows)
})
```

### Phase 4: Deprecate `renderToXterm()`

- Mark `renderToXterm` as `@deprecated`
- Keep it working for backwards compatibility
- Eventually remove when all consumers have migrated

## Key Decisions

### Content Phase: Adapter vs Terminal

Currently xterm.js uses `contentPhaseAdapter` (adapter-aware, no incremental rendering).
After unification, it would use the main `contentPhase` (terminal-optimized, incremental).

This is correct because:

- xterm.js is a terminal emulator — it accepts ANSI output
- The terminal adapter (`terminalAdapter`) produces ANSI diff strings
- Incremental rendering benefits xterm.js too (less data per frame = smoother updates)

### Browser Compatibility

`createApp` imports Node.js modules (`node:process`, etc.). For browser:

- Conditional imports or tree-shaking for Node-specific features
- Skip: alternate screen, raw mode, SIGTSTP/SIGCONT handling, Kitty keyboard protocol
- Keep: Provider event loop, focus management, store, render pipeline

### What About Canvas/DOM Adapters?

Canvas and DOM renders are fundamentally different (pixels/DOM nodes vs character cells). Those remain as separate render paths. The xterm.js unification only applies because xterm.js IS a terminal — it speaks ANSI.

## Alternatives Considered

### 1. TerminalIO Abstraction

Create a new `TerminalIO` interface (`{ write, cols, rows, onInput, onResize }`). Rejected because:

- Duplicates the existing Provider pattern
- Adds a new abstraction when one already exists
- Provider has state management built in (getState/subscribe)

### 2. Extend Term Interface for xterm.js

Create `createTerm(xtermTerminal)` overload. Rejected because:

- Term includes styling (chalk proxy), detection, stream access — none of which apply to xterm.js
- Term is a Node.js concept; Provider is the portable abstraction

### 3. Keep renderToXterm as-is

Leave it as a separate lightweight path. Rejected because:

- Showcases can't demonstrate runtime features (useInput, focus management)
- Two parallel content phases is a maintenance burden
- No incremental rendering in browser = worse performance
