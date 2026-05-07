# Layout Coordinate Systems

Every silvery node has three rects. They differ only in how scroll and sticky offsets are applied. Picking the right one is the difference between a hover that lands on the right pixel and one that lands on the wrong row when a sticky header is visible.

## The three rects

| Rect         | Hook              | What it represents                                                      | CSS analogue                 |
| ------------ | ----------------- | ----------------------------------------------------------------------- | ---------------------------- |
| `boxRect`    | `useBoxRect()`    | Layout position within the node's flow. Border-box sized.               | `offsetLeft/Top` + size      |
| `scrollRect` | `useScrollRect()` | Scroll-adjusted position **before** sticky clamping. Can go off-screen. | _(no direct CSS equivalent)_ |
| `screenRect` | `useScreenRect()` | Actual paint position on the terminal screen.                           | `getBoundingClientRect()`    |

All three are `{ x, y, width, height }`. The width and height are identical across all three (they're the same box, just in different coordinate systems). Only `x` and `y` change between them.

## When to use each

Use `useBoxRect()` when you need the node's **own layout dimensions** — width/height for responsive rendering, position within the parent for relative math. This is the most common hook.

```tsx
function Header() {
  const { width } = useBoxRect()
  return <Text>{"=".repeat(width)}</Text>
}
```

Use `useScrollRect()` when you need the node's **scroll-adjusted logical position** — where it "would be" in the scrolled document. Useful for scroll calculations and virtual lists that need to reason about the full document flow.

Use `useScreenRect()` when you need the **actual paint position** on the terminal. This is the right choice for:

- Hit testing (which node did the mouse click?)
- Cursor positioning (where does IME composition go?)
- Cross-component visual navigation (arrow-key traversal across columns)
- Anything that cares about where pixels actually land

```tsx
function Card({ id, onLayout }) {
  // Register the card's screen position so arrow-key navigation
  // can find "the card visually closest to row N". useEffect runs
  // after each commit boundary; the rect is the deferred (committed)
  // value, idempotent across convergence passes.
  const rect = useScreenRect()
  useEffect(() => {
    onLayout(id, rect.y)
  }, [id, rect.y])
  return <Box>...</Box>
}
```

## Deferred semantics

Each hook returns the rect as of the most recent event-batch commit boundary. Within one batch, every render sees the same value — so a render that branches on the rect (responsive layout, sized children) is structurally idempotent and can't form a feedback loop with the renderer's convergence loop.

The cost is **one frame late on mount**: the first paint shows `{0,0,0,0}`, and the measured rect arrives one batch later. For application-level responsive layout where this flash is visible, prefer [`useResponsiveBoxProps`](/api/use-responsive-box-props) — it reads the global viewport directly with no layout-pass dependency.

## Why the distinction exists — sticky nodes

For most nodes, `scrollRect` and `screenRect` are identical. The distinction only matters for `position="sticky"` nodes.

Imagine a scrollable column with a sticky header. After scrolling down 5 rows, the sticky header's logical flow position moves off-screen — but the sticky behavior pins it to the top of the viewport:

```
Before scroll:                  After scroll 5 rows:

┌─ Column ───────┐              ┌─ Column ───────┐
│ Sticky Header  │  ← row 0     │ Sticky Header  │  ← pinned at row 0
│ Card A         │  ← row 1     │ Card F         │  ← row 1
│ Card B         │  ← row 2     │ Card G         │  ← row 2
│ ...            │              │ ...            │
└────────────────┘              └────────────────┘
```

For the sticky header after scrolling:

```ts
scrollRect.y = -5 // flow position, would be off-screen
screenRect.y = 0 // actual paint position, clamped to top
boxRect.y = 0 // position within parent container (unchanged)
```

That's the whole reason for having two hooks. `scrollRect` gives you the "true" document position (so you can check _is this node scrolled past?_), `screenRect` gives you the paint position (so your hit test doesn't click through a sticky header).

## Comparison with other frameworks

Silvery is the only React TUI framework that distinguishes all three coordinate systems:

| Framework        | Size                          | Layout position               | Scroll-adjusted            | Paint position         |
| ---------------- | ----------------------------- | ----------------------------- | -------------------------- | ---------------------- |
| **Silvery**      | `useBoxRect()` (width/height) | `useBoxRect()` (x/y)          | `useScrollRect()`          | `useScreenRect()`      |
| Ink (7.0)        | `useBoxMetrics(ref)`          | `useBoxMetrics(ref)`          | _(no scroll)_              | _(no scroll)_          |
| Textual (Python) | `Size`                        | `Widget.region`               | `Widget.virtual_region`    | `Widget.window_region` |
| blessed          | `.width`/`.height`            | `.left`/`.top` + `.atop` etc. | `.childBase` + `.childOff` | `.aleft`/`.atop`       |
| Ratatui (Rust)   | `Rect`                        | `Rect`                        | per-widget `offset`        | —                      |
| Bubble Tea       | `WindowSizeMsg`               | _(manual)_                    | `viewport.YOffset`         | _(manual)_             |

Ink has no scroll concept, so its single `useBoxMetrics` hook is equivalent to silvery's `useBoxRect` in unscrolled contexts. Textual has the closest vocabulary to silvery's, with distinct types for each coordinate system.

## Design notes

### Why `boxRect` instead of `contentRect`

The property is border-box sized — it includes padding and border, matching Yoga's `getComputedWidth/Height`. The CSS "content-box" is inside padding and border, so "contentRect" was a CSS-misleading name. Matching Ink 7.0's `useBoxMetrics` terminology avoids the box-model ambiguity.

### Why `screenRect` is the paint position

"Screen" in terminal-land means the visible viewport — the terminal window. It maps cleanly to CSS `getBoundingClientRect()` for anyone coming from the web, and it's the name most terminal developers reach for first. The CSS "screen" (physical monitor) is not a concept that exists in terminal rendering.

When silvery grows beyond the terminal (canvas, DOM), `screenRect` may be reconsidered — canvas has no fixed "screen" coordinate system. But for terminal-first work, it's the clearest name.
