# Silvery

React framework for modern terminal UIs. Layout feedback, incremental rendering, multi-target (terminal, canvas, DOM). Library works with Bun and Node.js >= 23.6; CLI (`bin/silvery.ts`) requires Bun.

**[The Silvery Way](docs/guide/the-silvery-way.md)** — 10 principles for building canonical Silvery apps. Read it before building with Silvery.

**[Styling Guide](docs/guide/styling.md)** — Semantic colors, typography presets, and component defaults. Read it before styling anything.

## Anti-pattern: `wasRaw` capture/restore on `process.stdin`

**Never write this code in silvery.** It looks polite. It races silently.

```ts
// ❌ TARNISHED — async-unsafe, undoes other consumers' setRawMode(true)
const wasRaw = stdin.isRaw
if (!wasRaw) stdin.setRawMode(true)
try {
  await someAsyncWork()  // any other code path can run here
} finally {
  if (!wasRaw) stdin.setRawMode(false)  // ← undoes whatever ran during the await
}
```

**Why it breaks**: `process.stdin` is a global, multi-tenant resource. The "snapshot at entry, restore at exit" protocol assumes a single consumer. Under async, multiple polite tenants race — and the last finally to run wins, silently disabling input for the host TUI. The same shape reappears for every shared terminal global (stdout writes, protocol modes, resize, signals, `console.*`), which is why the answer is structural ownership — not a more careful snapshot.

**The structural fix is `term.input`.** Stdin has ONE owner per session, exposed as `term.input` on the `Term` interface. Probes never call `stdin.setRawMode` or `stdin.on('data', …)`. They call `term.input.probe({ query, parse, timeoutMs })` and the owner routes matching response bytes back to the caller. Same pattern for every terminal global — `term.output` (stdout), `term.modes` (protocol modes), `term.size` (dimensions), `term.signals` (process signals), `term.console` (`console.*` capture). See [The I/O umbrella](docs/guide/term.md) and [term.input reference](docs/api/term-input.md).

**File layout** — sub-owners live under `packages/ag-term/src/runtime/devices/`:

- `devices/output.ts` — `Output` (stdout / stderr / console.* sink during alt screen)
- `devices/modes.ts` — `Modes` (raw mode, alt screen, bracketed paste, Kitty keyboard, mouse, focus reporting)
- `devices/size.ts` — `Size` (alien-signals-backed cols/rows with 16 ms resize coalescing)
- `devices/signals.ts` — `Signals` (topologically-ordered SIGINT/SIGTERM/exit handler scope)
- `devices/console.ts` — `Console` (console.* tap + replay, complementary to `Output`'s sink)
- `runtime/input-owner.ts` — `Input` (InputOwner — single stdin mediator; file lives one level up for legacy reasons and may move to `devices/` later)

`Term` wires them as `readonly input | output | console: … | undefined` (undefined on headless / emulator-backed terms) and `readonly modes | size: …` (always present — headless gets a no-op variant).

**Still banned**: calling `stdin.setRawMode` / `stdin.on("data", …)` / `stdout.write(…)` directly from app or runtime code. If the sub-owners don't cover what you need, grow the sub-owner — don't punch through it.

## Mandatory: New Props Require Tests

**Every new prop in `packages/ag/src/types.ts` (BoxProps, TextProps, etc.) MUST have at least one test in `tests/` that exercises it through the render pipeline at SILVERY_STRICT=2.**

Tests must use realistic-scale fixtures (50+ nodes), not 2-3 node toy components. Many pipeline bugs only compound at scale — false-positive cascades, stack overflows from recursive walks, cumulative paint errors. Synthetic micro-tests pass while real apps crash.

**Why:** `outlineStyle` was added speculatively without a test. When km finally used it, the entire feature broke (incremental cascade false positives, stack overflow, stale pixels). Hours of debugging. Speculative completeness is the norm in silvery — that's fine, but every speculatively-added prop must have a regression test from day one. See `tests/features/outline-incremental.test.tsx` for the canonical pattern.

## Defaults contract tests

**Every public option with a `@default` or `Default:` docstring MUST have a contract test that omits the option and asserts the documented behavior.**

Three bugs shipped in one week with the same shape:

1. `selectionEnabled = selectionOption ?? false` — docstring said "Default: true when mouse is enabled". Fixed 6c4442ee.
2. `detectTerminalCaps()` ignored `FORCE_COLOR` — docstring listed env precedence, function short-circuited before the canonical helper. Fixed 48143ef0.
3. Mouse drag state machine — no click-vs-drag threshold test; plain click created a 1-char selection + spurious onClick. Fixed 915b4bf9.

All three had the same cause: **every existing test passed the option explicitly, so the default path was never exercised.** Docstring and code drifted silently.

### Convention

- **File placement**: `tests/contracts/<entry-point>-defaults.contract.test.tsx`, one file per public entry point.
- **Naming**: test name starts with `contract:` and names the contract, not the seeding bug. E.g. `contract: selection defaults to true when mouse: true is passed`, not "bug 1 regression test".
- **Shape**: instantiate the consumer with the option **omitted**; assert observable behavior matches the docstring.
- **Ergonomics**: use `term.mouse.*` and `term.clipboard` from `@silvery/test` — never hand-rolled SGR byte strings or `as any` casts.

### When adding a new `@default` option

Your PR adding the option **MUST** include a contract test in the same PR that omits the option and asserts the documented default. Without the test, the docstring is a lie waiting to happen. If the entry point doesn't have a contracts file yet, create one.

Phase 1 (current) seeds the convention with five entry points:

- `run-defaults.contract.test.tsx` — `run(element, term, options?)`
- `create-app-defaults.contract.test.tsx` — `createApp()` + `.run()`
- `render-defaults.contract.test.tsx` — `render()` (lower-level)
- `create-termless-defaults.contract.test.tsx` — `createTermless()` test harness
- `create-term-defaults.contract.test.tsx` — `createTerm()` live terminal

Phase 2 backlogs live in each file as TODO comments — grep for `Phase 2 backlog` to find the outstanding defaults. Phase 3 will add a lint-ish script that flags any `@default` docstring without a matching contract test.

See `tests/contracts/README.md` and bead `km-silvery.defaults-contract-tests`.

## Quick Start

The simplest Silvery app — styled text that exits on any keypress:

```tsx
import React from "react"
import { Box, Text } from "silvery"
import { run } from "silvery/runtime"

function App() {
  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color="$primary">
        Hello, Silvery!
      </Text>
      <Text color="$muted">Press any key to exit.</Text>
    </Box>
  )
}

const handle = await run(<App />)
await handle.waitUntilExit()
```

`run()` handles terminal setup, alternate screen, raw mode, and cleanup automatically. `using` is optional here because `handle.waitUntilExit()` blocks until exit.

## Building Apps

### Simple apps: `run()`

For apps that use React hooks for state and `useInput` for keyboard handling:

```tsx
import React, { useState } from "react"
import { Box, Text, SelectList, TextInput } from "silvery"
import { run, useInput } from "silvery/runtime"

function App() {
  const [query, setQuery] = useState("")

  useInput((input, key) => {
    if (key.escape) return "exit" // return "exit" to quit
  })

  return (
    <Box flexDirection="column" padding={1} gap={1}>
      <TextInput value={query} onChange={setQuery} placeholder="Search..." prompt="> " />
      <SelectList
        items={[
          { label: "TypeScript", value: "ts" },
          { label: "Rust", value: "rs" },
          { label: "Python", value: "py" },
        ]}
        onSelect={(opt) => console.log(opt.value)}
      />
    </Box>
  )
}
```

### Complex apps: `pipe()` composition

For apps with structured state, commands, mouse dispatch, and focus management, compose capabilities via `pipe()`. Each `with*` provider adds one capability:

```tsx
import { pipe, createApp, withReact, withTerminal, withFocus, withDomEvents } from "@silvery/create"

const app = pipe(
  createApp(store), // base app with zustand store
  withReact(<Board />), // React reconciler
  withTerminal(process), // terminal I/O (alt screen, raw mode, resize)
  withFocus(), // Tab/Escape focus + Find (Ctrl+F) + CopyMode (Esc,v)
  withDomEvents(), // mouse dispatch + drag
)
await app.run()
```

See [Providers and Plugins](docs/guide/providers.md) for all built-in providers and how to write custom ones.

## Components

All available from `import { ... } from "silvery"`. They handle keyboard, mouse, theming, and edge cases automatically.

```tsx
<SelectList items={items} onSelect={handleSelect} />       // j/k navigation, mouse, scroll
<TextInput value={v} onChange={setV} placeholder="..." />   // readline keybindings (Ctrl+A/E/K/U, Alt+B/F)
<VirtualList items={data} renderItem={renderRow} interactive /> // virtualized, thousands of items
<ModalDialog title="Confirm" onClose={close}>Are you sure?</ModalDialog>
<Spinner label="Loading..." />
<ProgressBar value={0.7} />
<Tabs items={tabs} selected={activeTab} onSelect={setActiveTab} />
```

Use the built-in components — don't reimplement keyboard navigation, scroll handling, or selection theming.

## Styling

### Semantic tokens — not raw colors

Tokens adapt to any terminal theme automatically. 84 color schemes work out of the box.

```tsx
<Text color="$primary">Selected item</Text>
<Text color="$success">✓ Saved</Text>
<Text color="$error">✗ Failed</Text>
<Text color="$muted">Last modified 2h ago</Text>
<Box borderStyle="round" />  // auto $border color
```

### Typography presets — not manual color+bold combos

```tsx
import { H1, H2, H3, Muted, Small, Code, Blockquote } from "silvery"

<H1>Page Title</H1>          // $primary + bold
<H2>Section</H2>              // $accent + bold
<H3>Group</H3>                // bold
<Muted>Caption text</Muted>   // $muted
<Small>Fine print</Small>     // $muted + dim
<Code>npm install</Code>      // $mutedbg background
```

### Background + text pairing

Every surface background has a matching text token. Set both or set neither.

```tsx
<Box backgroundColor="$surfacebg">
  <Text color="$surface">Dialog content</Text>
</Box>

<Box backgroundColor="$inversebg">
  <Text color="$inverse">Status bar</Text>
</Box>
```

Full styling reference: [Styling Guide](docs/guide/styling.md)

## Input Handling

> **Full architecture**: [docs/guide/input-architecture.md](docs/guide/input-architecture.md) — 5-stage pipeline from stdin to hooks.
> Read that doc before debugging input issues. It covers filtering, Kitty protocol, focus dispatch, and the hook hierarchy.
>
> **Plugin-centric design**: Events are ops that flow through the plugin `apply` chain.
> Plugins own event routing — React hooks are thin store readers. The era2
> plugin composition pattern (dispatch/apply pipeline) is the target model.
> **Any work on events, input handling, or focus dispatch must use the
> apply-chain substrate in `@silvery/create/runtime/`.**
>
> Substrate modules (shipped, tested, stable API):
>
> - `runtime/base-app.ts` — `createBaseApp()` (plugins use raw capture-and-override idiom, no helper)
> - `runtime/with-terminal-chain.ts` — modifier observer + resize/focus
> - `runtime/with-input-chain.ts` — the fallback `useInput` store
> - `runtime/with-paste-chain.ts` — focused-route + global paste handlers
> - `runtime/with-focus-chain.ts` — focused-element key dispatch
> - `runtime/event-loop.ts` — `runEventBatch` (functional processEventBatch)
> - `runtime/lifecycle-effects.ts` — Ctrl+C / Ctrl+Z / exit / suspend as Effects
>
> `processEventBatch` inside `create-app.tsx` still uses the legacy
> `runtimeInputListeners + handleFocusNavigation` pattern; migration onto
> `runEventBatch` is staged in bead `km-silvery.tea-useinput` so each
> commit keeps behavioural equivalence tests green. The ag-react hooks
> (`useInput`, `usePaste*`, `useInputLayer`, `useExit`, `useModifierKeys`)
> still read from `RuntimeContext.on()` pending that migration.

### Single useInput — two import paths, one implementation

`useInput` is defined in `@silvery/ag-react/hooks/useInput.ts` and re-exported from both `silvery` and `silvery/runtime`. Both paths resolve to the same hook.

```tsx
import { useInput } from "silvery" // components, complex apps
import { useInput } from "silvery/runtime" // run() apps, examples
// Both are the SAME function — use whichever matches your import style
```

Features: `isActive`, `onRelease`, `onPaste`, release filtering, modifier filtering, `return "exit"` to quit.

### Key event lifecycle (Kitty keyboard protocol)

When Kitty keyboard protocol is enabled (default in Ghostty, Kitty, WezTerm):

1. **stdin** receives raw bytes → `splitRawInput()` splits buffered chunks into individual sequences
2. **`parseKey()`** (`@silvery/ag/keys`) parses ANSI/Kitty sequences → `{ input, key }` with `key.eventType: "press" | "repeat" | "release"`
3. **Event dispatch** (`create-app.tsx:2301`): ALL events go to `runtimeInputListeners` first (useModifierKeys needs releases)
4. **`useInput` filtering**: both hooks filter `key.eventType === "release"` — handlers see press/repeat only
5. **App handlers** (`runEventHandler`): additionally filter modifier-only events (Cmd/Shift/Alt/Ctrl alone)

### useModifierKeys

Tracks held modifier state (Cmd, Shift, Ctrl, Alt) from Kitty press/release events. Used by `<Link>` for Cmd+click. Does NOT go through useInput — uses a separate modifier store updated at dispatch level.

```tsx
const { super: cmdHeld } = useModifierKeys({ enabled: hovered })
```

### Quick reference

```tsx
import { useInput } from "silvery/runtime"

useInput((input, key) => {
  if (key.escape) return "exit"
  if (input === "j") moveDown()
  if (key.ctrl && input === "s") save()
})
```

For complex apps, use the command system (named, serializable actions) instead of anonymous handlers — see [The Silvery Way, principle 5](docs/guide/the-silvery-way.md#_5-command-system).

## Focus Management

`useFocus()` registers a component in the focus tree. Modals automatically consume input — no guard clauses needed.

```tsx
function SearchBox() {
  const { isFocused } = useFocus()
  return <TextInput value={query} onChange={setQuery} />
}

// Focus navigation
focusNext() // Tab
focusPrev() // Shift-Tab
setFocus(id) // jump to specific component
```

## Layout

CSS flexbox via Flexily. Let the layout engine compute positions and sizes.

```tsx
<Box flexGrow={1}><Text>I expand</Text></Box>
<Box flexDirection="column" gap={1}>
  <Header />
  <Content />
  <Footer />
</Box>
<Box overflow="scroll" scrollTo={selectedIndex} height={20}>
  {items.map((item, i) => <Row key={i} item={item} />)}
</Box>
```

`useBoxRect()` gives synchronous access to a component's size during render — no effects, no 0x0 flash.

### CSS-correct defaults

silvery uses CSS-correct flex defaults (`flexShrink: 1`, `alignContent: stretch`,
plus CSS §4.5 flex-item auto min-size). This matches browser flexbox semantics —
the same code lays out the same way in a browser, on canvas, and in the
terminal. **You don't need to thread `flexShrink={1} minWidth={0}` through wrap
chains** — that ceremony was required under the historical Yoga-flavored
defaults and is no longer load-bearing. `<Prose>` is now optional typography
sugar rather than a wrap-enablement primitive.

The Yoga preset is reachable from flexily directly (`createFlexily({ defaults: "yoga" })`)
for projects that want drop-in Yoga compatibility. silvery's Ink-compat layer
(`@silvery/ink`) uses Yoga semantics internally to match Ink behavior; that's
the only internal user of the Yoga preset. Consumers building silvery apps
should not need to think about presets.

See [vendor/flexily/docs/guide/yoga-divergences.md](../flexily/docs/guide/yoga-divergences.md)
for the full divergence list and beads `km-silvery.flexshrink-flip-silvery-only` +
`km-flexily.auto-min-size-flex-items` for the migration history.

## Testing

Three levels, from fast to full-fidelity:

### createRenderer -- fast, stripped text

Unit tests for silvery components. Tests the virtual buffer (phases 1-4), no ANSI processing. ~5ms/op.

```tsx
import { createRenderer } from "@silvery/test"

const render = createRenderer({ cols: 80, rows: 24 })
const app = render(<MyComponent />)
expect(app.text).toContain("Hello")

app.press("j")
expect(app.text).toContain("▶ Second item")
```

**Pin root width/height when testing full-app layouts.** `createRenderer({cols, rows})` passes `cols`/`rows` as the *available* size to `calculateLayout()` — it does NOT set `root.style.width/height`. Production silvercode uses `<Screen>` which pins both from the terminal. Without that pin, `column → row → <Text wrap=wrap>` chains correctly collapse to `height=1` via CSS max-content sizing (a row's intrinsic cross size is its tallest child's max-content height, and a wrappable Text at unconstrained width is exactly 1 line tall). Tests look broken; production isn't.

For full-app fixtures, mirror `<Screen>`:

```tsx
const TOTAL_COLS = 160, TOTAL_ROWS = 30
const render = createRenderer({ cols: TOTAL_COLS, rows: TOTAL_ROWS })
const app = render(
  <Box width={TOTAL_COLS} height={TOTAL_ROWS} flexDirection="row">
    {/* component under test */}
  </Box>,
)
```

Counter-example (the misdiagnosis trap): `tests/features/wrap-nested-flexgrow.test.tsx` has a `.skip`-ed test that documents the antipattern. The wrap bug filed as `km-silvery.wrap-measurement` was this artifact, not a flexily defect.

### createTermless -- full ANSI, real terminal emulator

Integration tests through xterm.js. Tests the full 5-phase pipeline including ANSI output. ~50ms/op.

```tsx
import { createTermless } from "@silvery/test"
import { run } from "silvery/runtime"
import "@termless/test/matchers"

using term = createTermless({ cols: 80, rows: 24 })
const handle = await run(<App />, term)

expect(term.screen).toContainText("Hello")
await handle.press("j")
expect(term.screen).toContainText("Count: 1")
```

### run() -- real terminal

Full E2E through the actual terminal runtime. For interactive debugging, not automated tests.

```tsx
const handle = await run(<App />)
await handle.waitUntilExit()
```

### Cell-level color assertions

`app.cell(col, row)` returns a `FrameCell` with resolved RGB colors -- useful for asserting styling without parsing ANSI:

```tsx
const cell = app.cell(5, 0)
expect(cell.bold).toBe(true)
expect(cell.fg).toBe("#e0def4") // resolved RGB
```

### AutoLocator CSS Selectors

`app.locator(selector)` returns a self-refreshing AutoLocator that re-evaluates against the current tree on every access. Powered by **css-select** (full CSS3 engine) with a custom AgNode adapter — supports the entire CSS selector spec.

```tsx
// ID selector
app.locator("#my-component").resolve()

// Attribute selectors (presence, value, prefix, suffix, substring)
app.locator("[data-cursor]").resolve()
app.locator("[data-testid='panel']").resolve()
app.locator("[id^='task-']").resolveAll() // starts with

// Combinators — all CSS3 combinators work
app.locator("#parent > #child").resolveAll() // direct child
app.locator("#item1 + #item2").resolve() // adjacent sibling
app.locator("#item1 ~ #item3").resolve() // general sibling
app.locator("#container #nested-item").resolve() // descendant
app.locator("#a > #b > #c").resolve() // multi-level chains

// Pseudo-classes — :first-child, :last-child, :nth-child, :not, :has, :empty, etc.
app.locator("#list > :first-child").resolve()
app.locator(":not(#excluded)").resolveAll()
app.locator("#col > :nth-child(2)").resolve()

// Narrowing
app.locator("#list").getByText("Hello").first()
app.locator("#list").filter({ hasText: "world" }).count()
```

AutoLocator methods: `resolve()`, `resolveAll()`, `count()`, `textContent()`, `getAttribute()`, `boundingBox()`, `isVisible()`, `getByText()`, `getByTestId()`, `locator()`, `filter()`, `first()`, `last()`, `nth()`.

## Anti-Patterns

**Manual key handlers instead of components** — Use `SelectList` for lists, `TextInput` for text entry. Don't reimplement j/k navigation or readline keybindings.

**Hardcoded colors** — Use `$primary`, `$muted`, `$success`, etc. Never `"red"`, `"#ff0000"`, or `"\x1b[31m"`.

**`Box theme={{}}` for bg-only changes** — `theme={{}}` re-resolves ALL `$tokens`. Use `backgroundColor` directly:

```tsx
// Wrong: re-resolves every token for a background change
<Box theme={{ bg: "#1a1a1a" }}>

// Right: only sets background
<Box backgroundColor="$surfacebg">
```

**Status tokens for decoration** — `$success` means success, `$error` means error. Don't use them for headings, borders, or categories. Use `$primary`/`$accent` for emphasis, `$color0`-`$color15` for data categories.

**Specifying default colors** — Components already use correct colors. Don't write `<Text color="$fg">` or `<SelectList color="$primary">`.

---

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

- `ag.layout(dims, opts?)` — measure, layout, scroll, sticky, scrollRect, notify
- `ag.render(opts?)` — incremental content render → TextFrame + TerminalBuffer
- Internal prevBuffer management — no caller tracking needed
- `createAg` is the sole pipeline entry point — all callers use it directly

## Composition Architecture

Silvery apps are assembled via `pipe()` — each **provider** (`with-*` function) adds one capability to the app object. Providers live in `@silvery/create`. Pure state machines live in `@silvery/headless`.

**Public docs** describe the system as-is: [App Composition](docs/design/app-composition.md) — `createApp`, `pipe()`, `with*` plugins, event flow.

**Internal design** (target architecture): `create()` + `pipe()` + plugins wrapping `apply()`. Design docs live in km's private workspace. Tracking bead: `km-silvery.tea`.

- **[Providers and Plugins](docs/guide/providers.md)** — `pipe()` composition, `AppPlugin` type, all built-in providers, how to write custom providers
- **[Headless Machines](docs/guide/headless-machines.md)** — `createMachine()`, pure update functions (readline, select-list), naming conventions, React hooks

### Interactions Runtime

Interactive features (selection, find, copy-mode, drag) are implemented as runtime features in `packages/ag-term/src/features/`. Each feature registers with the **CapabilityRegistry** (`@silvery/create/internal/capability-registry.ts`) for React-side state access.

| Feature            | Activated by      | Trigger                 | Observer hook    |
| ------------------ | ----------------- | ----------------------- | ---------------- |
| `SelectionFeature` | `createApp.run()` | mouse drag              | `useSelection()` |
| `DragFeature`      | `withDomEvents()` | mouse drag on draggable | —                |
| `FindFeature`      | `withFocus()`     | `Ctrl+F`                | —                |
| `CopyModeFeature`  | `withFocus()`     | `Esc, v`                | —                |

Selection is handled by create-app's inline event loop and exposed via a bridge `SelectionFeature` registered in the capability registry. The `useSelection()` hook reads from this bridge — no provider wrapper needed. Copy-mode (`withFocus`) accesses the same bridge to drive keyboard selection.

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

| Package              | What                                                                                                                    |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `silvery`            | Main barrel — components, hooks, render, types, runtime                                                                 |
| `@silvery/create`    | App composition — createApp, pipe, withApp, TEA store                                                                   |
| `@silvery/test`      | Testing utilities — virtual renderer, locators                                                                          |
| `@silvery/headless`  | Pure state machines — SelectList, Readline (no React)                                                                   |
| `@silvery/commands`  | Command registry, keymaps, invocation                                                                                   |
| `@silvery/scope`     | Structured concurrency — createScope, withScope                                                                         |
| `@silvery/signals`   | Reactive signals — thin wrapper around alien-signals                                                                    |
| `@silvery/model`     | Optional DI model factories                                                                                             |
| `@silvery/commander` | Type-safe Commander.js with colorized help, Standard Schema                                                             |
| `@silvery/ansi`      | Everything terminal — styling, ANSI primitives, detection, theme derivation                                             |
| `@silvery/color`     | Color math — OKLCH-native blend, brighten, darken, complement, contrast (hex public API, re-exported by @silvery/theme) |

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

| Package             | What                                                                      |
| ------------------- | ------------------------------------------------------------------------- |
| `@silvery/ag`       | Core types, layout-signals (framework-agnostic reactive layer)            |
| `@silvery/ag-react` | React reconciler, hooks (useSignal, useAgNode, useBoxRect), UI components |
| `@silvery/ag-term`  | Terminal runtime, ANSI output, pipeline, syncRectSignals bridge           |
| `@silvery/theme`    | Theme tokens, 84 color schemes, theme CLI                                 |
| `@silvery/ink`      | Ink/Chalk compatibility layers                                            |

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

| File                                            | What                                                       |
| ----------------------------------------------- | ---------------------------------------------------------- |
| `packages/ag/src/layout-signals.ts`             | All node signals (rects + textContent + focused) — Layer 1 |
| `packages/ag-react/src/hooks/useSignal.ts`      | alien-signals → React bridge — Layer 2                     |
| `packages/ag-react/src/hooks/useLayout.ts`      | useBoxRect, useScrollRect, useScreenRect — Layer 3         |
| `packages/ag-react/src/hooks/useAgNode.ts`      | Raw AgNode + signals access for components                 |
| `packages/ag/src/text-frame.ts`                 | TextFrame + FrameCell type definitions                     |
| `packages/ag-term/src/ansi/term.ts`             | Term type and createTerm() — the central abstraction       |
| `packages/ag-term/src/runtime/term-provider.ts` | Terminal as Provider (state, events, input parsing)        |
| `packages/ag-term/src/runtime/run.tsx`          | Layer 2 entry point — run(<App />, term)                   |
| `packages/ag-term/src/runtime/create-app.tsx`   | Layer 3 — multi-provider apps with zustand store           |
| `packages/ag-term/src/pipeline/render-phase.ts` | Incremental rendering (most complex)                       |
| `packages/ag-term/src/buffer.ts`                | TerminalBuffer + createTextFrame() snapshot factory        |
| `packages/ag-term/src/pipeline/output-phase.ts` | Buffer diff, ANSI output generation                        |
| `packages/ag-term/src/pipeline/layout-phase.ts` | Layout, scroll, sticky, screen rects                       |
| `packages/ag-term/src/pipeline/CLAUDE.md`       | Pipeline internals docs (read before editing)              |

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
npx @silvery/examples
```
````

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

````

This applies to install commands, run commands, and `npx`/`bunx`/`pnpm dlx`/`vp` invocations.

## Code Style

Factory functions, `using` cleanup, no classes, no globals. ESM imports only. TypeScript strict mode.

## Common Tasks

**Need to...** → **Use this:**

| Task                        | Import                                                          | Example                      |
| --------------------------- | --------------------------------------------------------------- | ---------------------------- |
| Blend/mix colors            | `import { blend } from "@silvery/theme"`                        | `blend("#000", "#fff", 0.5)` |
| Brighten/darken             | `import { brighten, darken } from "@silvery/theme"`             | `brighten("#333", 0.2)`      |
| Check contrast              | `import { checkContrast } from "@silvery/theme"`                | `checkContrast(fg, bg)`      |
| Hex↔RGB↔HSL                 | `import { hexToRgb, rgbToHex, hexToHsl } from "@silvery/theme"` |                              |
| Cell-level color assertions | `app.cell(col, row)` or `term.cell(row, col)`                   | `expect(cell.fg).toBe(...)`  |
| Frame-by-frame testing      | `handle.frames` (ANSI strings per render)                       | Iterate all render frames    |
| Cell grid per frame         | termless `TapeFrame[]` via tape executor                        | `frame.cell(r, c)`           |
| Verify incremental = fresh  | `SILVERY_STRICT=1` env var                                      | Auto-diffs every render      |
| Replay all frames           | `SILVERY_STRICT_ACCUMULATE=1` env var                           | O(N²) full replay            |
| Terminal emulator in tests  | `createTermless({ cols, rows })` from `@silvery/test`           | Real ANSI processing         |

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
````
