# App Composition

How silvery apps are built, piece by piece.

## Why

Silvery's API has grown fragmented:

- **6+ types for the same concept** — TerminalBuffer, TermScreen, RegionView, App.text — different APIs depending on entry point.
- **3 confusing return types** — `render()` returns App, `run()` returns RunHandle, `createApp()` returns AppHandle.
- **Testing API inconsistency** — `createRenderer` (stripped text), `createTermless` (emulator), `run()` (full runtime) — each with a different shape.
- **Monolithic App** — tree, renderer, terminal I/O, state, focus all in one blob.
- **Opaque pipeline** — `runPipeline()` does layout + render + paint in one call.
- **No shared type** — silvery's buffer and termless's screen represent the same data with different APIs.

This redesign also enables:

- **Multi-target** — same ag tree renders to terminal, canvas, or (future) DOM.
- **Framework independence** — ag doesn't know about React. Svelte/Solid adapters are first-class.
- **Testability** — layout without rendering, rendering without paint, input without an event loop.
- **Debuggability** — dispatch/apply are wrappable functions. Pipeline phases are separate inspectable calls.
- **Foundation for era2b** — commands, keymaps, signals build on the dispatch/apply pipeline from this design.

### Before and After

```ts
// BEFORE — fragmented
const r = createRenderer({ cols: 80, rows: 24 })  // returns App
const app = r(<Counter />)
app.text                                            // string (no cell access)
app.lastFrame()                                     // different from .text!

const term = createTermless({ cols: 80, rows: 24 }) // returns RunHandle
const handle = await run(<Counter />, term)
term.screen.getText()                               // different API!
await handle.press("j")                             // different from app.press()

const app = createApp(storeFactory, handlers)       // returns AppHandle
await app.run(<Counter />, { term })

// AFTER — unified (render() includes withTest() for convenience)
const app = render(<Counter />, { cols: 80, rows: 24 })   // headless
const app = render(<Counter />, term)                      // live or emulator
app.press("j")                                             // → dispatch(press("j"))
app.text                                                    // → term.screen.text
term.screen.text                                           // TextFrame everywhere
await app.run()                                            // event loop (if term has events)
```

| Problem                  | Solution                                                 |
| ------------------------ | -------------------------------------------------------- |
| 6+ types for styled text | **TextFrame** everywhere                                 |
| 3 return types           | **One app** from `render()`, capabilities depend on term |
| Testing inconsistency    | **`render(element, term)`** — one function, term varies  |
| Monolithic App           | **ag** (tree), **term** (I/O), **TextFrame** (output)    |
| Opaque pipeline          | **layout → render → paint** — three independent phases   |
| No shared type           | silvery + termless both produce **TextFrame**            |

### Scope

This is era2a (rendering foundation). Commands, keymaps, signals, and domain models are era2b — they build on top of this. See [era2 architecture](../../vendor/silvery-internal/design/era2/00-architecture.md).

## Render Configurations

```
silvery
├── ag                              tree only, toString
│   ├── ag term (headless)          + layout engine → TextFrame
│   ├── ag term (interactive)       + I/O (terminal, termless, canvas)
│   └── ag dom                      tree → DOM nodes (future)
├── react dom                       React's own reconciler, no ag
└── svelte dom                      Svelte's own runtime, no ag
```

The ag tree exists for cell-based rendering. All ag targets are term-like — a headless term is just a term without I/O. The framework adapter (React, Svelte, manual) is orthogonal.

## Core Objects

Three objects. **ag** (the retained cell tree — silvery's equivalent of the DOM) produces TextFrames, **term** consumes them.

```ts
// Ag — tree + layout engine + renderer
const ag = createAg()                      // flexily (default)
const ag = createAg({ engine: "yoga" })    // yoga
ag.root              // AgNode tree root
ag.engine            // LayoutEngine (bound at creation, all nodes use it)
ag.layout(dims)      // flexbox → positions/sizes (mutates layout nodes in place)
ag.render()          // positioned tree → cell grid → TextFrame
ag.toString()        // structural text (no layout — NOT render().text)

// Term — output target (dims + optional capabilities)
type TermDef = { cols: number; rows: number }   // accepted anywhere a Term is
term.dims            // { cols, rows } — always present
term.screen?         // TextFrame — last painted frame
term.scrollback?     // TextFrame — scroll history (emulator only)
term.paint?(frame, prev?)   // present TextFrame to output
term.events?()              // AsyncIterable<Event> — input stream
term.caps?           // { truecolor, hyperlinks, kittyKeyboard, ... }
term.cursor?         // { col, row, visible }
term.write?(data)    // raw escape sequences (setup/teardown only)
term.cols            // convenience → term.dims.cols
term.rows            // convenience → term.dims.rows
term.style           // convenience → derived from term.caps

// TextFrame — rendered cell grid (immutable, backend-neutral)
interface TextFrame {
  readonly text: string              // plain text
  readonly lines: string[]           // per-line plain text
  readonly width: number
  readonly height: number
  cell(col: number, row: number): FrameCell
  containsText(text: string): boolean
}
toAnsi(frame, caps?)               // TextFrame → ANSI string
toAnsi(frame, prev, caps?)         // TextFrame × prev → diff ANSI

// Backends — each provides what it can
createTerm({ cols: 80, rows: 24 })      // headless (just dims)
createTerm(process)                      // real terminal
createTermless(dims, backend?)           // emulator (+ screen/scrollback)
createCanvas(canvasEl)                   // browser canvas
```

## Rendering Pipeline

Three phases, each independently useful:

```ts
ag.layout(term.dims) // 1. flexbox → positions/sizes
const frame = ag.render() // 2. positioned tree → TextFrame
term.paint(frame) // 3. TextFrame → output
```

Use any phase alone: layout without render (inspect sizes), render without paint (headless testing), paint without the others (re-present a saved frame).

`ag.render()` requires a prior `ag.layout()`. On resize, discard the previous frame (paint diffing assumes same dimensions). `toFrame(ag, dims)` combines 1+2 as convenience.

**Invariants:**

- `ag.render()` requires prior `ag.layout()` — calling render without layout is an error
- Mounting triggers one immediate render (withReact calls `app.render()` on first commit)
- `term.screen` is populated after first render, undefined before
- `app.run()` only exists when the term has events
- Resize resets paint diffing (`prev = undefined`)
- Cursor state lives on `term.cursor`, not in TextFrame

## Framework Adapters

Adapters populate the ag tree. External to ag — keeps the tree framework-agnostic.

```ts
const react = mountReact(ag, <Counter />)    // mount into ag.root
react.unmount()
mountSvelte(ag, Counter, { props })          // same pattern
```

Adapters use ag's tree mutation API — never touch layout nodes directly. Ag keeps tree and layout nodes in sync internally:

```ts
ag.createNode(kind, props) // create AgNode + LayoutNode together
ag.insertChild(parent, child, index) // insert in both trees
ag.removeChild(parent, child) // remove from both trees
ag.updateNode(node, props) // update props, mark dirty
ag.setText(node, text) // update text content
```

The adapter owns both directions:

- **Rendering**: reconciler populates ag nodes from component state
- **Input**: `useInput` registers handlers on ag nodes, events reach them via the apply chain

## Input Pipeline

Input flows opposite to rendering: source → dispatch → apply → handlers → state change → re-render.

```ts
// Sources — anything that calls dispatch
term.events(signal?)                               // terminal: parsed keys, mouse, resize
app.dispatch({ type: "input:key", key: "j" })      // manual: testing, scripting

// Dispatch → Apply
// dispatch: public entry (reentry guard). apply: internal chain (plugins wrap it).
app.dispatch(op) → app.apply(op) → useInput handlers
//                   ↑ plugins wrap here (keymap, logging, commands)

// Handlers — registered by components via useInput
function Counter() {
  useInput((op) => {
    if (op.key === "j") setCount(c => c + 1)
    return true  // handled — stop propagation
  })
}
// Depth-first through ag tree — focused/deepest nodes get first chance.

// Debugging — wrap dispatch/apply (plain functions, no special mode)
const { dispatch } = app
app.dispatch = (op) => { console.log(op.type, op); return dispatch(op) }
for (const e of savedEvents) app.dispatch(e)  // replay
```

## Plugin Composition

Plugins wire the primitives together via `pipe()`. Each adds capabilities by wrapping `dispatch`, `apply`, or `run`.

### withTerm and withReact

```ts
function withTerm(term) {
  // Normalizes TermDef → Term: { cols, rows } gets wrapped with dims, screen, etc.
  return (app) => {
    let prev: TextFrame | undefined
    app.render = () => {
      app.ag.layout(term.dims) // 1. positions/sizes
      const frame = app.ag.render() // 2. tree → TextFrame
      term.paint?.(frame, prev) // 3. TextFrame → output
      prev = frame
      term.screen = frame // always set after render
    }
    if (term.events) {
      const { run } = app
      app.run = async () => {
        app.render()
        for await (const event of term.events(app.scope?.signal)) {
          if (event.type === "resize") prev = undefined // reset diffing
          app.dispatch(event)
          // No render here — React commit calls app.render() if state changed
        }
        await run?.()
      }
    }
    // Terminal cleanup: createTerm registers process exit hooks
    // (SIGINT/SIGTERM/exit) that restore terminal state.
    return app
  }
}

function withReact({ view }) {
  return (app) => {
    app.render ??= () => {}
    const reconciler = createReconciler(app.ag.root, app.render)
    reconciler.render(view) // mount immediately — stays alive until dispose
    app.defer(reconciler.unmount)
    return app
  }
}
```

**Key decisions:**

- **withReact mounts immediately** — headless testing works without `run()`.
- **No double-render** — event loop only dispatches; rendering happens via reconciler commit.
- **Scope integration** — `term.events(app.scope?.signal)` terminates on scope cancel.
- **TermDef normalization** — `withTerm` accepts `Term | TermDef`. A bare `{ cols, rows }` works immediately (headless); a full Term adds paint/events/screen.
- **Terminal lifetime** — you dispose what you create. Pre-created Term: caller disposes. Process exit hooks are the safety net.
- **Plugin ordering** — `withAg` → `withTerm` → `withReact`. Validated at compose time.

### App shape after each plugin

```ts
// create()
app = {
  dispatch(op),              // public entry (reentry guard)
  apply(op),                 // plugin chain
  defer(fn),                 // register cleanup (TC39 DisposableStack)
  [Symbol.dispose](),        // deferred cleanups in reverse order
  run: undefined,
}

// + withAg()
app = { ...app,
  ag,                        // { root, engine, layout(dims), render(), toString() }
}

// + withTerm(term)
app = { ...app,
  term,                      // Term or resolved TermDef
  render(),                  // layout → TextFrame → paint → term.screen
  run(),                     // event loop (if term has events)
}

// + withReact({ view })  — reconciler mounted, calls app.render() on commit
// + withTest()           — press(), text, ansi, screen, getByText(), locator()
```

**What gets wired depends on the term:**

```
TermDef (just dims)      → app.render (layout → TextFrame, no paint)
Term with paint          → app.render (layout → TextFrame → paint)
Term with paint + events → app.render + app.run (event loop)
```

### Examples

```ts
// Interactive
const app = pipe(
  create(), withAg(),
  withTerm(createTerm(process)),
  withReact({ view: <Counter /> }),
)
await app.run()

// Headless testing — no run() needed
const app = pipe(
  create(), withAg(),
  withTerm({ cols: 80, rows: 24 }),
  withReact({ view: <Counter /> }),
)
app.dispatch({ type: "input:key", key: "j" })
app.term.screen.text

// Emulator testing
const term = createTermless({ cols: 80, rows: 24 })
const app = pipe(
  create(), withAg(), withTerm(term),
  withReact({ view: <Counter /> }),
)
app.dispatch({ type: "input:key", key: "j" })
term.screen.text
```

## Entry Points and Testing

`render()` is sugar that includes `withTest()` for convenience:

```ts
// render() = pipe(create(), withAg(), withTerm(term), withReact({ view }), withTest())
const app = render(<Counter />, { cols: 80, rows: 24 })   // headless
app.press("j")
app.text                                                    // "Count: 1"

using term = createTerm(process)                            // live
const app = render(<Counter />, term)
await app.run()

using term = createTermless({ cols: 80, rows: 24 })        // emulator
const app = render(<Counter />, term)
app.press("j")
term.screen.text
```

**withTest()** adds convenience accessors (press, click, text, ansi, screen, cols/rows) and locators (getByText, locator — self-refreshing ag tree queries). Live apps via `pipe()` don't get withTest unless explicitly added.

**Locators** query the ag tree (structural). **TextFrame assertions** query rendered output (visual):

```ts
app.getByText("Task 1").textContent() // ag tree query
expect(term.screen).toContainText("Hello") // TextFrame assertion (vitest matcher)
```

## Relationship to Existing Code

The current `RenderAdapter` gets decomposed across `ag` and `term`:

```
RenderAdapter.measurer              → ag.engine
RenderAdapter.createBuffer()        → internal to ag.render()
RenderAdapter.flush(buffer, prev)   → term.paint(frame, prev)
RenderAdapter.getBorderChars()      → ag (glyph profile)
RenderBuffer (write API)            → internal cell grid
TextFrame (read API)                → public output of ag.render()
```

**Migration order** (each phase fully `/complete`d before the next — no dual paths):

1. Extract TextFrame as read API over existing buffer
2. Add `term.paint(frame, prev)` wrapping RenderAdapter.flush
3. Move layout/measurer under ag
4. Replace adapter tree mutations with ag.createNode/insertChild
5. Plugin composition: withAg/withTerm/withReact/withTest
6. Term unification: one Term type, remove createRenderer/RunHandle/AppHandle

## TEA (era2b)

Everything above works with React useState. For complex apps, add TEA plugins (optional):

```ts
const app = pipe(
  create(), withScope(), withAg(), withTerm(term),
  withReact({ view: <App /> }),
  withApp({ providers: { term, storage, ai } }),
  todoDomain(),              // models + commands + keybindings
  editorDomain(),
)
await app.run()

// createApp() bundles the above:
const app = createApp(storeFactory, handlers)
await app.run(<Counter />, { term })
```

See [era2 architecture](../../vendor/silvery-internal/design/era2/00-architecture.md) for commands, signals, scopes, and domain plugins.
