# `<Terminal>` — render a headless terminal inside silvery

Status: **shipped (Phase 2)** — API + implementation locked. Public exports
live in `packages/ag-react/src/exports.ts` and `packages/ag-react/src/ui/components.ts`.

## What it is

`<Terminal>` is a silvery component that renders the visible grid of a
headless terminal (a `TerminalReadable` — termless, xterm.js-headless,
vt100, vterm, or any backend that exposes `getLines() / getCursor()`)
as a positioned block inside a silvery layout.

It is purely a **renderer**. It owns no PTY, no stdin, no alt-screen
toggle. The host process is responsible for feeding its child terminal
— typically from a pty's stdout — and pumping its rendered cell grid
into `<Terminal>`.

It is the silvery-native replacement for any place where the application
would otherwise hand-roll `rowToAnsi` + `ansiCursorTo` against
`process.stdout`. The original motivating consumer was `termless rec`'s
[`rec-live-overlay.ts`](../../../termless/packages/cli/src/rec-live-overlay.ts),
a direct-ANSI painter that mirrored a recording terminal into a centred
frame on the host. The live recording path has since moved to
`<Island guest={xtermGuest}>`; `<Terminal>` remains the reusable
read-only grid renderer for in-process terminal snapshots, debugger
views, and tests.

## Goals

1. **Drop the hand-rolled ANSI painter.** Any silvery app that needs to
   embed a recording / replay / pty-mirror view stops writing its own
   SGR state machine and gets the silvery rendering pipeline
   (incremental diffs, dirty-flag cascades, SILVERY_STRICT verifiers)
   for free.
2. **Make the recording overlay testable.** Termless tests can mount
   the overlay inside `createTermless` and assert the rendered grid,
   the chrome border, the status line, the cursor — without spawning a
   child process or writing to a real stdout.
3. **Be honest about what we own.** The component renders. The host
   owns stdin → child PTY routing. The host owns alt-screen state.
   Mixing those concerns was exactly what made `rec-live-overlay.ts`
   exist as a parallel direct-ANSI painter in the first place.

## Non-goals

- Driving a pty. The component takes a `TerminalReadable`; how that
  terminal got fed is the host's problem.
- Mapping host stdin to the child terminal. The host owns stdin
  (typically with `term.input` disabled via the new `input: false`
  escape hatch — see [§render-input-false](#render-input-false)) and
  pipes its own bytes to the pty.
- Implementing a terminal emulator. The component is downstream of
  termless's emulator backends.

## API

```tsx
import { Terminal } from "silvery"
import type { TerminalReadable } from "silvery" // duck-typed
;<Terminal
  terminal={readable} // TerminalReadable — required
  cursor // publish cursor via cursorOffset (default true)
  cols={readable.cols} // grid width in cells (default: terminal.cols)
  rows={readable.rows} // grid height in cells (default: terminal.rows)
  revision={tick} // bump to force a re-read
  onMouse={(e) => pty.write(encodeMouse(e))}
  onResize={(cols, rows) => pty.resize(cols, rows)}
  selectable // participate in silvery selection (default true)
  testID="rec-grid" // AutoLocator hook
/>
```

### Props

| Prop         | Type                                   | Default         | Why it exists                                                                                                                                                                                                           |
| ------------ | -------------------------------------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `terminal`   | `TerminalReadable`                     | —               | The read-only protocol every termless backend implements. Component never mutates the terminal; consumer feeds it elsewhere.                                                                                            |
| `cursor`     | `boolean`                              | `true`          | Publishes the terminal's `getCursor()` into the underlying `<Box>`'s `cursorOffset` prop. The layout phase resolves it into absolute caret coordinates on the very first frame after mount.                             |
| `cols`       | `number`                               | `terminal.cols` | Explicit width override.                                                                                                                                                                                                |
| `rows`       | `number`                               | `terminal.rows` | Explicit height override.                                                                                                                                                                                               |
| `revision`   | `number`                               | `0`             | The component is structurally stable across paints. The host bumps `revision` (typically from a polling timer that listens to the headless terminal) to invalidate the row-string memo. See [§reactivity](#reactivity). |
| `onMouse`    | `(e: TerminalMouseEvent) => void`      | `undefined`     | Forwards mouse events translated to cell `(col, row)`. Consumers SGR-encode and write to the child PTY. `undefined` → events pass through to whatever is underneath.                                                    |
| `onResize`   | `(cols: number, rows: number) => void` | `undefined`     | Fires when the silvery `<Box>`'s measured size diverges from the underlying terminal's `cols × rows`. Consumers call `terminal.resize()` and/or push the new size to the child PTY.                                     |
| `selectable` | `boolean`                              | `true`          | When `true`, the grid `<Box>` has `userSelect="text"` — silvery's selection model takes care of drag-select + OSC 52 copy.                                                                                              |
| `testID`     | `string`                               | `undefined`     | AutoLocator hook for tests.                                                                                                                                                                                             |

### Returned shape

`<Terminal>` is a `<Box>` subtree with explicit `width={cols}` and
`height={rows}`. It does **not** self-position — the consumer composes
it inside whatever flexbox layout makes sense (centred via
`justifyContent: "center"`, padded inside a border `<Box>`, stacked
above a status `<Text>`, …).

### Each prop ties to a recording-system pain point

| Prop                             | Pain point in `rec-live-overlay.ts`                                                                                                                                                                                                                                                                                                 |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `terminal`                       | Today, the painter is hard-coupled to termless's `Terminal` interface. Accepting `TerminalReadable` widens the consumer surface to every backend in the termless family and any future "looks like a headless terminal" adapter.                                                                                                    |
| `cursor`                         | Today, the painter hard-disables the terminal cursor (`CSI_HIDE_CURSOR`) on entry. The user's reported bug was "cursor doesn't track the recorded child program inside the centred frame." With `cursor` defaulting `true` and silvery's `cursorOffset` owning caret positioning, the cursor lands inside the grid by construction. |
| `revision`                       | The painter coalesces bursty PTY output via a `dirty` flag + 30 fps `setInterval`. `revision` is the silvery-native shape of the same idea: the consumer's polling timer bumps a number and React re-renders. Coalescing happens in React batching + the silvery convergence loop + the incremental skip rules.                     |
| `onMouse`                        | The painter does not forward mouse events. Recordings of interactive child programs (e.g. `nvim`, `htop`) need mouse pass-through. silvery already has a hit-registry and `<Box onMouseDown>` — `<Terminal>` is the place to wire it.                                                                                               |
| `onResize`                       | The painter watches `process.stdout.resize`. When silvery owns the layout, the resize signal is `useAgNode().signals.boxRect()` — single source of truth, no double-subscription.                                                                                                                                                   |
| `selectable`                     | The painter writes raw cells. There is no way to select-and-copy from inside the grid. silvery has a selection model; opting in is free.                                                                                                                                                                                            |
| stdin (intentionally not a prop) | The painter explicitly does not touch stdin, but it lives outside silvery's process model — so the only way to compose it with silvery in the same process is to disable silvery's stdin ownership. That motivates `render({ input: false })` — see [§render-input-false](#render-input-false).                                     |

## Architecture

The component composes existing silvery primitives. No new pipeline
code.

```tsx
<Box width={cols} height={rows} flexDirection="column" cursorOffset={…} userSelect="text">
  {rowStrings.map((line, r) => <Text key={r}>{line}</Text>)}
</Box>
```

Where `rowStrings` is computed by `encodeTerminalRow(terminal.getLine(r), cols)`
— a small per-row ANSI encoder shipped inline in the component file.
silvery's `<Text>` ingests strings containing embedded SGR escapes —
`parseAnsiText` runs at measure time, and the output phase preserves
attributes per-cell. This matches how silvery already handles
`chalk`-styled strings.

### Why per-row ANSI passthrough, not per-cell `<Text>`

At a 30 fps refresh in an 80×30 grid, that's 2400 cells × 30 fps = 72k
React re-renders / second under a per-cell `<Text>` approach. Per-row
is 30 × 30 = 900 / second — well below the silvery render budget on
practical hardware. The deduplicated SGR encoding in `encodeTerminalRow`
already minimises the bytes flowing through the pipeline, and silvery's
incremental renderer drops the cost further by diffing only changed
rows.

Per-cell would buy us pixel-accurate selection, per-cell hit testing,
and per-cell `data-*` attributes. Neither selection nor hit-testing
actually requires per-cell components — they only need the bounding
rect, which silvery layout already gives us via `useAgNode().signals.boxRect`.
So per-row passthrough is the right default. We can add a
`mode="per-cell"` escape hatch in a follow-up if a consumer needs
per-cell DOM-style queries.

### Cursor

When `cursor: true`, the component reads `terminal.getCursor()` on every
render (gated by `revision`) and passes the result through to the
grid `<Box>`'s `cursorOffset` prop. The layout phase resolves the
offset into absolute caret coordinates synchronously — first frame
after mount emits correct cursor ANSI. This bypasses the deprecated
`useCursor` effect-chain that previous direct-ANSI painters worked
around.

When `cursor: false`, the component does not set `cursorOffset`; the
ambient silvery cursor logic applies.

### Mouse

The grid `<Box>` accepts `onMouseDown`, `onMouseUp`, `onMouseMove`,
`onWheel` props (silvery's `MouseEventProps`). When an event lands
inside the grid:

1. Translate `(e.x, e.y)` from silvery layout coordinates to grid
   `(col, row)` via the box's `boxRect`.
2. Map the event type (`mousedown` → `press`, `mouseup` → `release`,
   etc.) and button (`0/1/2` → `left/middle/right`, deltas → wheel).
3. Call `onMouse({ type, x, y, button, modifiers })`.

Consumers SGR-encode and `pty.write` the bytes. The component does NOT
write SGR mouse-mode toggle sequences (`CSI ? 1003 h` etc.) — the host
process is responsible for those, layered around the silvery render.

### Selection

By default the grid `<Box>` is `userSelect="text"`. silvery's existing
selection model handles the rest — drag highlighting, mouse-up OSC 52,
clipboard backends. No custom selection implementation lives in
`<Terminal>`.

### Stdin

The component does NOT touch `process.stdin` or any sub-owner of it.
Input is the host's problem (see [§render-input-false](#render-input-false)).

## Reactivity

`<Terminal>` renders against `terminal.getLines()`, which is a snapshot
read. The component does not subscribe to changes on the underlying
terminal — that subscription mechanism varies per backend (some emit
events, some don't, some are CPU-expensive). Instead, consumers drive
re-renders via the `revision` prop.

The canonical consumer pattern, lifted from `rec-live-overlay.ts`:

```tsx
const [tick, setTick] = useState(0)
useScopeEffect(
  (scope) => {
    // Termless terminals expose `onUpdate` (or equivalent); when the child
    // PTY writes anything, bump the revision.
    const off = terminal.onUpdate(() => setTick((t) => t + 1))
    scope.defer(off)
  },
  [terminal],
)

return <Terminal terminal={terminal} revision={tick} />
```

This places the "when do we repaint" decision in the consumer, which is
where it belongs — different recording systems have different cadences
(burst-coalescing in `rec`, immediate in a debugger view, on-demand in
a test harness).

## `render({ input: false })` — the stdin escape hatch <a id="render-input-false"></a>

Silvery's default contract is "silvery owns terminal I/O" (see [The
Silvery Way principle 11](../guide/the-silvery-way.md#_11-let-the-term-own-i-o)).
`term.input` is the single mediator for stdin, and the lazy
`InputOwner` attaches a `stdin.on("data", …)` listener for the
session's life. This is correct for every standalone silvery app.

The recording overlay is the unusual case where two consumers need
stdin in the same process:

1. The host's stdin → child PTY pipe (the recorded program needs
   Ctrl-D / Ctrl-C / typed input).
2. silvery's overlay UI (would ordinarily want to render with focus
   navigation, paste support, etc.).

The host's pipe is not optional — without it, the recorded child can't
receive input and the recording is useless. silvery's input ownership
is optional for the overlay use case, because the overlay is
non-interactive (it's a status display + chrome around the child's
grid).

So we add an explicit opt-out, exposed in three places:

```tsx
using term = createTerm({ input: false }) // term.input is undefined
await render(<App />, term, { input: false }) // mirror at render level
// or directly via createApp:
const handle = await app.run(<App />, { ...opts, input: false })
```

### Contract

- `createTerm({ input: false })` returns a `Term` whose `input`
  accessor yields `undefined`. The lazy `InputOwner` is never
  constructed: raw mode is never flipped, no listener is attached to
  `process.stdin`.
- `render(element, term, { input: false })` is defence-in-depth: even
  if a future `term.input` access tried to construct an owner, the
  render pipeline would refuse to wire it. `pumpEvents` skips the
  text-sizing + width-detection probes and never attaches its own
  stdin listener.
- Cleanup paths that ordinarily remove stdin listeners or flip raw
  mode back to `false` are also gated — the host owns stdin and may
  want raw mode for its child PTY pipe; flipping it would break the
  host.
- A hook (`useInput`, `usePaste`, `useFocus`'s Tab cycling) that
  requires stdin becomes a no-op when called inside an `input: false`
  render. The hook still registers, but never fires — same behavior as
  emulator-backed terms where stdin is a mock.
- `term.output`, `term.modes`, `term.size`, `term.signals`, and
  `term.console` are unaffected. The render pipeline still owns
  stdout (alt screen, cursor, paint).

### What changed in the silvery code

- `CreateTermOptions` gained `input?: false`
  (`packages/ag-term/src/ansi/types.ts`).
- `AppRunOptions` gained `input?: false`
  (`packages/ag-term/src/runtime/create-app.tsx`).
- `RunOptions` gained `input?: false`
  (`packages/ag-term/src/runtime/run.tsx`).
- The lazy `getInput()` accessor on `Term` reads the new flag and
  returns `undefined` when set (`packages/ag-term/src/ansi/term.ts`).
- The text-sizing + DEC width-detection probes (`needsProbe`,
  `needsWidthDetection`) gate on `!inputDisabled` so they never run.
- `drainBufferedStdinBytes`, `drainLateStdinBytes`, the cleanup
  `removeAllListeners` + `setRawMode(false)` calls all gate on
  `!inputDisabled`.
- `run()` skips constructing the transient probe `InputOwner` when
  `input: false` is set in either entry point.

### Why a flag and not a separate factory

`createTerm({ input: false })` is one line in the caller. A separate
`createHeadlessTerm()` or `createStdinAgnosticTerm()` factory would
split the surface in two and force every consumer that wants
alt-screen + no-stdin to learn a third entry point. The flag is the
cheapest way to let one factory cover both modes — same shape as
`mouse: false`, `focusReporting: false`, etc.

### Why `false` only and not `true`

`input: true` would imply "create the owner eagerly" which the
codebase already does lazily. The only knob we need is the opt-out. We
type the prop as `input?: false` precisely so the type system rejects
truthy values, leaving only the opt-out semantics.

## Testing

Tests live at
`vendor/silvery/tests/features/terminal-component.test.tsx`. The
canonical setup mirrors the recording overlay:

```tsx
import { createRenderer } from "@silvery/test"
import { Terminal, encodeTerminalRow } from "silvery"

// Pure encoder unit tests — no React, no terminal.
test("encodeTerminalRow pads to cols", () => {
  expect(encodeTerminalRow([], 5)).toBe("     ")
})

// Component render tests — pass a fake TerminalReadable.
test("renders the grid", () => {
  const fake = { cols: 5, rows: 2, getLines, getCursor }
  const app = createRenderer({ cols: 20, rows: 5 })(<Terminal terminal={fake} />)
  expect(app.text).toContain("hello")
})
```

Coverage matrix:

- **Grid passthrough**: ANSI styling (colour, bold), wide chars (CJK),
  emoji, empty rows all reach the outer renderer.
- **Cursor**: `cursorOffset` is set when `cursor: true`; unset when
  `cursor: false`.
- **Mouse**: `onMouse` receives correct `(col, row)` for events inside
  the grid; events outside don't fire.
- **Resize**: `onResize` fires when the silvery `<Box>` containing
  `<Terminal>` is laid out at a different size.
- **Revision**: changing `revision` re-renders without changing
  `terminal`.
- **STRICT compliance**: tests run under `SILVERY_STRICT=2` (the
  default for `bun run test:fast`), so the incremental ≡ fresh
  invariant catches dirty-flag bugs in the new component for free.

A separate test file
`tests/features/render-input-false.test.tsx` covers:

- `createTerm({ input: false })` produces a term whose `input` is
  `undefined`.
- A run with `input: false` does not flip `stdin` raw mode.
- A `useInput` hook inside the rendered tree registers but never
  fires.
- `term.modes`, `term.size` still work.

## Open questions

- **Wide-character cursor**: when the cursor lands on a wide cell's
  continuation byte, silvery's cursor logic and termless's
  `getCursor()` may disagree on the column. Spec'd behaviour: clamp to
  the wide cell's leading column. Resolution: assertion in tests.
- **Mouse coordinate quantization**: silvery has SGR-Pixels support
  (`coordinateMode: "pixel"`); the consumer's PTY-side encoder needs
  cell coordinates. The component always emits cell coordinates to
  `onMouse`. Consumers wanting pixel mode keep their own pixel→cell
  conversion (or, more honestly, do not enable pixel mode at the
  host level for a recording UI).
- **Sub-cell scrolling**: when `rows < terminal.rows`, the component
  shows the last `rows` lines of the terminal (matches
  `rec-live-overlay`'s current behaviour). Configurable via a future
  `viewport` prop if needed.

## Provenance

This component was originally discussed as `<TerminalMirror>` in the
/plat report on the recording system. The user renamed it to
`<Terminal>` because the broader name covers the future cases
(replay, in-app shell, debugger panes) better than "mirror." All
public references (export name, doc filename, prop docs, test labels)
use `<Terminal>`.
