# Layout as Output

Silvery's layout engine produces geometry — sizes, positions, scroll offsets,
the cursor, the focused node, the active selection. Components declare
**semantic intent** (props on Box / Text), the layout engine resolves
**geometry**, and the scheduler/output phase consumes that geometry to paint
ANSI to the terminal (or, in the future, to a canvas / DOM target).

This document explains the pattern, what it means for component authors, and
how to migrate code that historically read layout rects at render time.

## The mental model

Three phases, each consuming the previous one's output:

| Phase                   | Consumes      | Produces                                |
| ----------------------- | ------------- | --------------------------------------- |
| **Render** (React)      | props, state  | semantic tree (Box / Text / signals)    |
| **Layout** (Flexily)    | semantic tree | geometry (rects, cursor, focus, scroll) |
| **Output** (ANSI / DOM) | geometry      | painted frame                           |

The pattern is borrowed wholesale from the browser pipeline (DOM →
layout/style → paint), Yoga's `onLayout` callbacks, AppKit/TextKit's
text-layout decorations, and ProseMirror's `Decoration` model — all of
which separate semantic intent from resolved geometry, and let the
geometry layer feed back to consumers as **output**, not as a state
that components have to thread by hand.

The rule for component authors:

> **Render is intent. Layout is output. Don't read geometry during render.**

## What this means for component authors

Six layout outputs are exposed as **declarative props on Box** (or as
signals consumed by the scheduler/renderer). Component authors set them;
the layout engine resolves them; the scheduler/renderer consumes them:

| Signal               | Declared via                                 | Consumed by                                        |
| -------------------- | -------------------------------------------- | -------------------------------------------------- |
| `boxRect`            | (computed from flex / width / height)        | layout-signals → component callbacks (post-layout) |
| `scrollRect`         | (computed from scroll containers)            | scrolling, position registries                     |
| `screenRect`         | (computed including sticky clamping)         | mouse hit-testing, alt-screen output               |
| `cursorRect`         | `<Box cursorOffset={{ col, row, visible }}>` | output phase (DECSCUSR + cursor positioning)       |
| `focusedNodeId`      | `<Box focused={true}>`                       | input dispatch, focus-aware overlays               |
| `selectionFragments` | `<Box selectionIntent={...}>`                | render phase (selection paint walk)                |

You don't read these in render. You declare them, and the layout engine
makes them available post-layout to the consumers that need them.

## Migration patterns

### "I was reading `useBoxRect().width` for sizing" → use flex props

If you wrote:

```tsx
function MyBox() {
  const { width } = useBoxRect() // ⚠ stale-frame zero on first mount
  return <Text>{"─".repeat(width)}</Text>
}
```

…the migration is to let the layout engine size the element via flex props
and avoid the rect read entirely:

```tsx
function MyBox() {
  return (
    <Box flexGrow={1}>
      <Text>{/* fill content */}</Text>
    </Box>
  )
}
```

Use `width="100%"`, `flexGrow={1}`, or explicit `width={N}` props on the
parent Box. Flexily resolves them; the renderer uses the resolved cell
width. No `useBoxRect()` call needed.

### "I was reading rect for hit-test / position registry" → use callback form

If you need a rect to register a position with a coordinator (mouse
hit-test, scroll anchor, drag target), use the **callback form** of
`useBoxRect` / `useScrollRect`. The callback fires **after** layout
resolves, so there's no stale-frame class:

```tsx
useScrollRect((rect) => {
  registry.register(myId, rect)
})
```

The callback form is the canonical post-layout registration pattern —
already correct, no migration needed. The lint rule
`scripts/lint-layout-reads.ts` skips callback-form invocations
automatically.

### "I genuinely need width during render (text wrap, image fit)" → annotate

A small set of components legitimately need a resolved cell dimension
during render — they're producing content whose semantics depend on the
cell count:

- **`TextArea`** runs soft-wrap math inside React (wrappedLines depend on
  `wrapWidth`) before the layout engine ever sees the wrapped output.
- **`Image`** encodes Kitty/Sixel escape sequences with explicit
  pixel/cell dimensions.
- **`Divider`** / **`ProgressBar`** repeat fill characters across a
  resolved cell width to produce string content.

These are the (c) class. They keep `useBoxRect()` and tag the call with
an explicit comment marker so the lint rule accepts them:

```tsx
// LAYOUT_READ_AT_RENDER: parentWidth feeds soft-wrap math in useTextArea
const { width: parentWidth } = useBoxRect()
```

The marker can sit on the same line as the call (trailing comment) or
on the immediately preceding comment block — either form is honored
by the lint.

If you reach for this annotation, document **why** the prop-driven path
isn't sufficient. Every (c) caller is a missing layout primitive in
disguise; the annotation is the audit trail.

## Why this is the way

**Stale-frame reads.** The historical pattern — `useBoxRect()` returning
a snapshot of the prior frame's rect at render time — produces a
first-frame zero read across conditional mounts. The same effect-chain
bug class repeatedly broke cursor positioning before Phase 2 of the
migration. Components that mounted conditionally would read `width: 0`
on first render, render zero-width content, then re-render on the next
layout pass with the correct width — a visible flicker / jank on the
first frame.

**Phase separation.** Treating geometry as an output of layout (rather
than as state that components thread back into render) makes the data
flow one-directional: render → layout → output. There's no feedback edge,
no "rect-then-rerender" retry loop, no first-frame zero read.

**Cross-target portability.** The cursor, focus, and selection signals
are semantic inputs (intent props on Box) → geometric outputs (rects on
the layout signals). The same component code runs on:

- Terminal (ANSI escape sequences for cursor positioning)
- Canvas (drawing position computed from rects)
- DOM (CSS `caret-position`, `outline`, `::selection`)

Without React-specific machinery in each consumer.

## The lint rule

`scripts/lint-layout-reads.ts` warns on render-time reads of the layout
hooks. It runs in **warn-only** mode today (exit 0 with a non-empty
report); CI integration and a flip to `--strict` follows once the
remaining (c) callers are documented.

Run it manually:

```bash
bun scripts/lint-layout-reads.ts            # warn-only (exit 0)
bun scripts/lint-layout-reads.ts --strict   # exit 1 on any violation
bun scripts/lint-layout-reads.ts --json     # machine-readable
```

What it flags:

- `useBoxRect()`, `useScrollRect()`, `useScreenRect()` — empty-paren
  snapshot form (callback form is skipped)
- `useCursor()`, `useFocus()`, `useSelection()` — replaced by Box props
  (`cursorOffset`, `focused`, `selectionIntent`) in Phases 2, 4a, 4b

What it skips:

- Callback form: `useBoxRect((rect) => ...)` — fires post-layout
- Hook implementations themselves (`packages/ag-react/src/hooks/`)
- Test files (`tests/**` are exempt by convention — tests intentionally
  read snapshots to assert layout outputs)
- Lines (or preceding comment blocks) tagged with the marker
  `LAYOUT_READ_AT_RENDER: <reason>`

## Cross-target story

The view-as-layout-output substrate is the foundation for silvery's
multi-target ambition. Each of the six signals maps cleanly to a
target-specific paint operation:

| Signal               | Terminal                   | Canvas                     | DOM                                 |
| -------------------- | -------------------------- | -------------------------- | ----------------------------------- |
| `boxRect`            | cell coordinates           | pixel rect                 | `getBoundingClientRect()`           |
| `cursorRect`         | DECSCUSR + cursor position | drawn caret bitmap         | CSS `caret-color` + `<input>` focus |
| `focusedNodeId`      | route input events         | dispatch keyboard listener | DOM `focus` / `blur` / `tabindex`   |
| `selectionFragments` | inverse-paint cell ranges  | filled rect overlays       | `::selection` pseudo + `Range` API  |

A silvery component author writes the same `<Box cursorOffset>` /
`<Box focused>` / `<Box selectionIntent>` code regardless of target. The
target-specific output phase is the only thing that changes.

## See also

- `packages/ag/src/layout-signals.ts` — where the layout-output signals
  are defined and where post-layout consumers subscribe.
- `docs/guide/cursor-api.md` — the cursor signal, declared via the
  `cursorOffset` Box prop (Phase 2 of the migration).
- `docs/guide/layout-engine.md` — Flexily's layout pass, which produces
  the geometry that the output phase consumes.
