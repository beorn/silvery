# Islands

_One primitive for mounting any cell-grid content in a silvery tree_

A silvery app sometimes needs to compose content it doesn't draw itself: a PTY child running `nvim`, a snapshot of a previously-recorded session, a replay stream, a Vue or Solid cell-grid component, an embedded silvery sub-instance. The host can't paint these — they own their own cells. But they have to live inside the host's layout, share the screen with chrome, route input when focused, and clean up when unmounted.

`<Island>` is silvery's answer. It's a leaf node in the render tree whose content comes from a runtime-agnostic [`IslandGuest`](#the-islandguest-contract). Mount the island, hand it a guest, the host paints around it; the guest paints inside. One primitive, any content.

```tsx
import { Island, snapshotGuest } from "silvery"
;<Island
  guest={snapshotGuest({
    cells: [
      ["H", "i"],
      ["▮", " "],
    ],
  })}
  cols={2}
  rows={2}
/>
```

This guide is the conceptual model and the migration path. If you have ad-hoc xterm.js embedding, hand-rolled foreign-source wiring, or per-app chrome-overlay logic, this is how to convert.

## What is an Island?

An island is a rectangular region in the silvery render tree with a parallel paint contract. The host owns layout, focus routing, mode aggregation, and lifecycle. The guest owns content — every cell inside the island's rect comes from `guest.handle.output.buffer`.

The split is intentional:

- **Host responsibilities**: where the island sits (flexily layout), whether it can receive focus (`focusable` prop), which terminal protocol modes get enabled when it's focused (the [host aggregator](#mode-aggregation)), when the guest's `init()` fires (the [hydration policy](#hydration)), and how the guest tears down (Scope-managed cleanup).
- **Guest responsibilities**: what cells to paint, what cursor shape it wants, what protocol modes it needs, how to handle input forwarded by the host, when to emit `ready` / `exit` / `error` lifecycle signals.

Neither side has to know the other's internals. Silvery never reads the guest's process; the guest never queries the host's terminal. The boundary is the [`IslandGuest`](#the-islandguest-contract) contract — six sub-owner interfaces and one async `init()`.

## Mounting an Island

The minimum to paint cells with an island:

```tsx
import { Island, snapshotGuest, createCellBuffer } from "silvery"

const buffer = createCellBuffer(20, 5)
buffer.setCell(0, 0, { char: "H", fg: null, bg: null, attrs: {}, wide: false, continuation: false })
// … populate more cells …

function App() {
  return (
    <Box padding={1}>
      <Island guest={snapshotGuest({ buffer })} cols={20} rows={5} />
    </Box>
  )
}
```

The island is a leaf — no React children. Its cell grid is the guest's `output.buffer`. The reconciler creates a `silvery-island` AgNode under the hood; the pipeline's render phase blits the guest's buffer at the node's `boxRect` each frame.

### `cols`/`rows` versus flex props

`cols` and `rows` describe the **guest's cell grid** — the dimensions the guest renders at. They're required at the React surface because every shipped guest needs them to initialize (PTY children pass them to `spawn`, snapshot guests use them as the frame size, replay first-frame matches them).

`width`, `height`, `flexGrow`, `flexShrink`, `flexBasis`, `alignSelf`, `min*`, `max*` describe the **layout slot** — how the island participates in flexily layout. They're optional; when present, they override `cols`/`rows` for layout purposes.

When the two diverge, the host calls `handle.size.requestResize(layoutCols, layoutRows)` and the guest acknowledges via the two-phase protocol (see [Resize](#resize)).

```tsx
// Fixed 80×24 slot, guest renders at 80×24
<Island guest={g} cols={80} rows={24} />

// Guest spawns at 80×24; flex grows the slot; host requests resize to new dims
<Box width={120} flexDirection="row">
  <Island guest={g} cols={80} rows={24} flexGrow={1} />
</Box>

// Guest spawns at 80×24; slot is exactly 120 wide; host requests resize
<Island guest={g} cols={80} rows={24} width={120} />
```

## The IslandGuest contract

An `IslandGuest` is a runtime-agnostic content producer. Any framework (React, Vue, Solid, Svelte, vanilla TypeScript) can implement it; silvery doesn't ship per-framework adapters because the contract is the integration surface.

```ts
interface IslandGuest {
  init(ctx: IslandContext): Promise<IslandHandle>
  capabilities?: IslandCapabilities
}
```

That's it. Two members. `init()` is called once per mount (or on first focus for `hydrate: "only-on-focus"` islands) and returns an [`IslandHandle`](#islandhandle-sub-owners) the host renders against. `capabilities` declares what the guest CAN provide; the host won't ask for input routing if the guest didn't declare `input: true`.

### IslandContext

```ts
interface IslandContext {
  readonly cols: number
  readonly rows: number
  emit(signal: IslandSignal): void
  requestResize(cols: number, rows: number): void
  execOSC(command: string): Promise<string | void>
  readonly abortSignal: AbortSignal
  now(): number
}
```

The context is the guest's interface to the host:

- `cols` / `rows` — initial dimensions. The guest uses these to spawn / render / size its first frame.
- `emit(signal)` — lifecycle signals (`{ type: "ready" }`, `{ type: "exit", code, reason }`, `{ type: "error", error }`). The host forwards to `onSignal` prop.
- `requestResize(cols, rows)` — ask the host to resize the island. Host confirms via the `size` sub-owner on the next layout tick; the guest must wait for confirmation before writing content at new dims (see [Resize](#resize)).
- `execOSC(command)` — host-fulfilled OS side-effect (e.g., OSC 52 clipboard write). The guest sends the OSC, the host parses + executes + returns the response.
- `abortSignal` — fires on unmount or focus-loss for `hydrate: "only-on-focus"`. The guest MUST release resources on signal: close FDs, clear timers, abort sockets.
- `now()` — monotonic time source. Replay guests use this for deterministic playback; live guests can call `performance.now()` directly.

### IslandCapabilities

```ts
interface IslandCapabilities {
  input?: boolean // accepts key / mouse / paste from host
  modes?: boolean // owns terminal protocol modes (Kitty kb, mouse SGR, etc.)
  resize?: boolean // can resize dynamically
  palette?: boolean // owns palette (OSC 4 / 10 / 11)
}
```

Per-island prop overrides intersect with the guest's declarations. Overrides can only narrow (drop a capability), never add one the guest didn't declare. A `<Island capabilities={{ input: false }} guest={ptyGuest({ ... })} />` gives a read-only mirror view of a PTY child even when the guest itself could take input.

## IslandHandle: sub-owners

`init()` returns a handle with up to six sub-owners. Some are required (`size`, `output`); the rest are gated on the guest's `capabilities` declaration.

```ts
interface IslandHandle {
  readonly size: IslandSizeOwner
  readonly output: IslandOutputOwner
  readonly input?: IslandInputOwner // when capabilities.input
  readonly modes?: IslandModesOwner // when capabilities.modes
  readonly signals?: IslandSignalsOwner // for PTY-backed guests
  readonly palette?: IslandPaletteOwner // when capabilities.palette
  dispose(): void | Promise<void>
}
```

The sub-owner shape mirrors silvery's existing `Term` interface: `term.input` / `term.output` / `term.modes` / `term.size` / `term.signals` / `term.console`. **One pattern, recursively applied** — at the app level for the real terminal, at the island level for guests.

### size

```ts
interface IslandSizeOwner {
  readonly cols: number
  readonly rows: number
  subscribe(listener): () => void
  requestResize(cols, rows): void
}
```

Reports current guest dimensions. The host calls `requestResize` when the layout slot changes; the guest acknowledges by writing content at new dims on its next `output` update. The host reads the new `cols`/`rows` after the ack — never assumes the request was honored synchronously.

### output

```ts
interface IslandOutputOwner {
  readonly buffer: CellBuffer
  readonly cursor: IslandCursorState | null
  readonly cursorVisible: boolean
  subscribe(listener): () => void
  writeCells(dirtyRects, buffer): void
  invalidateAll(): void
}
```

The guest's cell grid. The host reads `buffer` each frame and blits it at the island's `boxRect`. `subscribe` notifies the host when content changes so the next frame re-paints. `writeCells` is the guest's API for batched cell updates; `invalidateAll()` forces a full re-blit.

### input

```ts
interface IslandInputOwner {
  onKey?(handler): () => void
  onMouse?(handler): () => void
  onPaste?(handler): () => void
  feed?(bytes): void
  events?(): AsyncIterable<IslandInputEvent>
  sendEof?(): void
}
```

Host routes input events to the focused-subtree guest. Coordinates are **island-local** (origin = top-left of the island's content area) — the host translates from absolute terminal coords before delivery.

Both typed `on*` callbacks and an `events()` AsyncIterable are exposed. Pure ergonomic wrapper over the typed callbacks; pick whichever shape fits.

**`sendEof()` is distinct from `signals.sendSigint()` is distinct from `signals.sendSigtstp()`.** Ctrl-D closes stdin (EOT, U+0004); Ctrl-C delivers SIGINT; Ctrl-Z delivers SIGTSTP. Don't conflate them — wiring Ctrl-D as "interrupt" produces real bugs (PTY children that lose `Ctrl-D` for read-line completion).

### modes

```ts
interface IslandModesOwner {
  readonly modes: IslandProtocolModes
  subscribe(listener): () => void
}

interface IslandProtocolModes {
  altScreen?: boolean
  bracketedPaste?: boolean
  mouseTracking?: "off" | "click" | "drag" | "any"
  kittyKeyboard?: boolean
  focusReporting?: boolean
  cursor?: { shape: "block" | "underline" | "bar"; visible: boolean }
}
```

The guest's protocol-mode requests. The host aggregates from all focused-subtree islands and enables a unified set on the real terminal (see [Mode aggregation](#mode-aggregation)). When the island loses focus, the host disables modes only that island wanted.

The `cursor` field also goes through this owner — when the focused island wants a block-shape underline-cursor, that's a mode request, un-applied when the island blurs.

### signals

```ts
interface IslandSignalsOwner {
  sendSigint(): void
  sendSigtstp(): void
  sendSigterm(): void
  sendSigkill(): void
  readonly exit: Promise<{ code?: number; reason?: string }>
}
```

POSIX-signal delivery. PTY guests forward to the child process; snapshot / replay guests typically don't expose this (capabilities.input = false hides it from the host).

### palette

```ts
interface IslandPaletteOwner {
  readonly palette: ViewportPalette
  subscribe(listener): () => void
  respondToQuery?(query): string | undefined
}
```

Present only when `capabilities.palette = true` AND `palettePolicy !== "freeze"`. Frozen-palette islands get a snapshot at mount; the host responds to inside-guest palette queries from the snapshot, the guest never sees the real host palette.

## Built-in guests

`@silvery/ag` ships two built-in guests. Heavier guests (PTY, replay player, embedded silvery sub-instance) live in their own packages.

### snapshotGuest

Pre-built `CellBuffer` → guest. No input, no modes, no signals — pure cell content.

```ts
import { snapshotGuest } from "silvery"

// From dimensions (empty buffer the caller populates):
const guest = snapshotGuest({ cols: 80, rows: 24 })

// From a pre-built buffer (reference preserved):
const buf = createCellBuffer(20, 5)
const guest = snapshotGuest({ buffer: buf })

// From a cells literal:
const guest = snapshotGuest({
  cells: [
    ["H", "i"],
    ["▮", " "],
  ],
})
```

Useful for: tests, static demos, frozen frames, GIF playback (call `handle.setBuffer(newFrame)` for each frame), and as the composition base for `sandbox(snapshotGuest(...))` smoke tests.

### sandbox

`sandbox(inner, options?)` wraps any guest and neutralizes 8 query families: OSC 4 / 10 / 11, DSR 5 / 6, DA1 / DA2, window-title. The wrapped guest sees synthetic responses; the host terminal is never touched.

```ts
import { sandbox, snapshotGuest } from "silvery"

// Wrap a snapshot — the wrapped guest's queries get canned responses
// (palette indices, default fg/bg, device attributes, cursor pos).
const guest = sandbox(snapshotGuest({ cols: 80, rows: 24 }), {
  background: "#1e1e1e", // shape OSC 11 responses to align with host theme
  foreground: "#cccccc",
})

// Wrap a PTY guest (Phase 3 of @km/silvery/15646-islands):
const guest = sandbox(ptyGuest({ cmd: ["nvim"] }))
```

Unknown OSC sequences pass through to the host's real `execOSC` so guests retain access to side-effects they need (OSC 52 clipboard stays functional). The wrapper is purely query-neutralization; it doesn't modify cell content or change the guest's capabilities.

The motivation: a PTY child running inside silvery can probe the host terminal via OSC queries (xterm.js does this on init to detect color scheme). Without `sandbox`, those responses leak back into silvery's render frame as visible text garble.

## Hydration

Per-island hydration controls when `guest.init()` fires. Default: `"load"` (init at mount time).

```ts
type IslandHydrate = "load" | "idle" | "visible" | "only-on-focus"
```

- **`"load"`** — synchronous init at mount. The guest is alive the moment the island appears.
- **`"idle"`** — defer until the next `requestIdleCallback` (or microtask fallback). Good for guests whose init is expensive but the user is unlikely to need them immediately.
- **`"visible"`** — defer until the island's rect intersects the viewport. The guest only runs when the user can see it.
- **`"only-on-focus"`** — defer until first focus; tear down on blur. The cheapest mode for multi-pane hosts where most panes sit idle most of the time.

Phase 1 ships `"load"` only. The other three modes are accepted but currently behave as `"load"` (the deferred-hydrate scheduler arrives in Phase 2 — see `@km/silvery/15646-islands`).

## Palette policy

Per-island ownership of palette resolution. Default depends on the guest's `capabilities.palette`.

```ts
type IslandPalettePolicy =
  | "freeze" // default for non-palette guests
  | "inherit" // default for palette guests
  | { custom: ViewportPalette }
```

- **`"freeze"`** — host snapshots the current theme palette at mount; the guest sees a frozen view. Palette queries from inside the guest are answered from the snapshot, not the live host. Default for PTY / snapshot guests (compositing isolation; theme drift cannot leak into recorded content).
- **`"inherit"`** — guest inherits the host theme palette; theme changes cascade live. Default for sub-silvery / Vue / Solid guests (semantic theme coherence is the point).
- **`{ custom: palette }`** — explicit `ViewportPalette`. Overrides both.

## Mode aggregation

When an island is focused, the host enables the terminal protocol modes the guest wants. When focus moves elsewhere, the host disables modes only that island wanted. The aggregation walks the focus subtree — from the focused leaf to root — and unions every `silvery-island` ancestor's `handle.modes.modes`:

```ts
// vendor/silvery/packages/ag-term/src/runtime/island-aggregator.ts
const aggregated = deriveProtocolModesFromFocusSubtree(focusManager.activeElement)
// → { kittyKeyboard: true, mouseTracking: "drag", focusReporting: true }
```

OR-merge for boolean modes. Mouse tracking uses precedence (higher granularity wins). Cursor is first-island-wins (deepest = focused island; only one cursor on screen).

When the focused island has no `modes` owner, the aggregator returns `{}` and the host falls back to app-level mode flags (the existing `silveryRun({ mouse: true, focusReporting: true, ... })` props still drive when no island claims modes).

## Resize

Resize follows a strict two-phase protocol so the host and guest never disagree about dimensions:

1. **Host requests**: `handle.size.requestResize(cols, rows)`.
2. **Guest acknowledges**: on its next `output.writeCells()`, the guest writes content at the new dimensions.
3. **Host confirms**: reads `handle.size.cols` / `handle.size.rows` after the ack.

The STRICT slug `island-resize-race` (tier 2) catches violations — a guest writing content at new dims BEFORE the host confirms produces visible-text garble when the layout settles at the old dims.

## Lifecycle and error handling

Three terminal states for an island, set by the guest emitting via `ctx.emit`:

- `{ type: "ready" }` — first paint is good. The host has a usable `handle.output.buffer`.
- `{ type: "exit", code?, reason? }` — the guest finished cleanly. Host runs `handle.dispose()` and removes the island from the focus tree.
- `{ type: "error", error }` — the guest hit an unrecoverable condition. Routed to `onError` if present; otherwise raised to the surrounding silvery `ErrorBoundary`.

For init-time failures (`guest.init()` rejects), the same routing applies: `onError` prop catches; absent that, the error propagates to the React error boundary.

```tsx
<Island
  guest={ptyGuest({ cmd: ["nvim"] })}
  cols={80}
  rows={24}
  onSignal={(sig) => {
    if (sig.type === "exit") console.log("nvim exited", sig.code)
  }}
  onError={(err) => console.error("nvim crashed:", err)}
/>
```

## STRICT mode

Seven runtime invariants ship at tier 2 of the canonical `SILVERY_STRICT` gate (see [debugging.md](./debugging.md)):

| Slug                     | Tier | Catches                                                                       |
| ------------------------ | ---- | ----------------------------------------------------------------------------- |
| `island-paint-oob`       | 2    | Guest writes cells outside the island's rect.                                 |
| `island-grapheme-width`  | 2    | Wide-cluster width disagreement with host `wcwidth`.                          |
| `island-resize-race`     | 2    | Guest writes at new dims before host confirms (two-phase protocol violation). |
| `island-mode-leak`       | 2    | Terminal protocol mode stuck after the requesting island unmounts / blurs.    |
| `island-dispose-leak`    | 2    | Guest retains timers / sockets / FDs past `dispose()`.                        |
| `island-paint-budget`    | 2    | Per-island byte cadence exceeds budget (runaway guest paint).                 |
| `island-boundary-limits` | 2    | Host-translated mouse / focus coordinates leak past island borders.           |

Enable with `SILVERY_STRICT=2` (turns all 7 on); individual control via `SILVERY_STRICT=island-paint-oob` or `SILVERY_STRICT=2,!island-mode-leak`.

## Writing a custom guest

Implement the contract. The shape is the same whether you're wrapping a PTY child, a CRDT-backed text editor, a Vue cellgrid, or a recorded `.cast` file.

```ts
import type { IslandContext, IslandGuest, IslandHandle } from "silvery"

function myGuest(options: MyOptions): IslandGuest {
  return {
    capabilities: { input: true, modes: true },
    async init(ctx) {
      // 1. Acquire resources (spawn process, open socket, parse file, …).
      //    Tie them to ctx.abortSignal so unmount cleans up.
      const session = await spawnSession(options.url, ctx.abortSignal)

      // 2. Build sub-owners. Each one wraps the corresponding piece of your
      //    backend with silvery's expected interface.
      const buffer = createCellBuffer(ctx.cols, ctx.rows)
      const subscribers = new Set<() => void>()

      const output = {
        get buffer() {
          return buffer
        },
        cursor: session.cursor,
        cursorVisible: true,
        subscribe(cb) {
          subscribers.add(cb)
          return () => subscribers.delete(cb)
        },
        writeCells(_rects, _src) {
          /* your delta-paint path */
        },
        invalidateAll() {
          for (const cb of subscribers) cb()
        },
      }

      const input = {
        onKey(handler) {
          return session.onKey(handler)
        },
        onPaste(handler) {
          return session.onPaste(handler)
        },
      }

      // 3. Wire your backend's data flow into output.invalidateAll
      //    so the host knows to re-paint.
      session.onUpdate(() => output.invalidateAll())

      // 4. Signal ready when the first paint is good.
      ctx.emit({ type: "ready" })

      // 5. Return the handle.
      return {
        size: {
          get cols() {
            return buffer.cols
          },
          get rows() {
            return buffer.rows
          },
          subscribe() {
            return () => {}
          },
          requestResize(cols, rows) {
            session.resize(cols, rows)
          },
        },
        output,
        input,
        dispose: () => session.close(),
      } satisfies IslandHandle
    },
  }
}
```

Best practices:

- **Honor `ctx.abortSignal`.** Every long-lived resource (timer, socket, FD) should react to the signal so unmount cleanup is automatic.
- **Don't snapshot `cols`/`rows`.** Read from `handle.size` so resize-after-mount works.
- **OR your invalidations.** `subscribers.forEach(cb => cb())` after any change the host needs to see — buffer mutations, cursor moves, mode requests.
- **Emit `ready` once.** Don't double-emit; subsequent renders are implicit via output subscriptions.
- **Distinguish EOT / SIGINT / SIGTSTP.** If you expose `input.sendEof`, make it close stdin (write `\x04` to the PTY's stdin or call `process.stdin.end()`). Don't wire it as "interrupt."

## Composition patterns

Sandbox + PTY is the canonical termless-rec pattern:

```tsx
<Island guest={sandbox(ptyGuest({ cmd: ["nvim"] }))} cols={80} rows={24} focusable />
```

Snapshot + sandbox + setBuffer is the GIF-playback pattern:

```tsx
const guest = sandbox(snapshotGuest({ buffer: frames[0] }))
const ref = useRef<SnapshotGuestHandle | null>(null)
useEffect(() => {
  const id = setInterval(() => {
    const frame = frames[index++ % frames.length]
    ref.current?.setBuffer(frame)
  }, 100)
  return () => clearInterval(id)
}, [])
return <Island guest={guest} cols={frames[0].cols} rows={frames[0].rows} ref={ref} />
```

Nested islands are possible by construction. The aggregator walks every island on the focus chain; recursive blits clip correctly. v1 doesn't ship an explicit nesting test, but the architecture supports it.

## Designed for cross-target

`<Island>` is silvery's canonical multi-target composition primitive. The terminal target is what ships today; the canvas and DOM targets reuse the same contract (cell-grid buffers map naturally to canvas `ImageData` and DOM grid layouts). When you write a guest, you're targeting silvery itself — not a particular paint backend.

## See also

- [docs/guide/term.md](./term.md) — the parent `Term.input` / `Term.output` / `Term.modes` pattern islands recursively implement
- [docs/guide/scope.md](./scope.md) — the Scope primitive `<Island>` uses for lifecycle (`useScopeEffect` + `ctx.abortSignal`)
- [docs/guide/debugging.md](./debugging.md) — full SILVERY_STRICT slug table including the 7 island slugs
- `@km/silvery/15646-islands` — the full epic body (design, P0 landmines, /pro decisions, phases)
