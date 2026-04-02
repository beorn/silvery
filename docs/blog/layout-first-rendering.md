---
title: "Layout-First Rendering: Why Terminal Components Need Their Width"
description: "The architectural decision behind Silvery's rendering pipeline — what problem it solves, how it actually works, and what it costs."
date: 2026-04-02
---

# Layout-First Rendering: Why Terminal Components Need Their Width

I was building a kanban board in the terminal. Three columns on a wide terminal, two on narrow, one on very narrow. Each column needed to truncate card titles to fit. Each card needed to know how wide it was to decide between a compact and full layout.

In Ink, I couldn't find a clean way to do this. The column component doesn't know its width during render.

## The Standard Pipeline

Every React terminal renderer I've looked at follows the same pipeline:

1. **React renders** -- components produce a virtual tree
2. **Layout engine runs** -- Yoga computes positions and sizes
3. **Output** -- the renderer writes characters to the terminal

The problem is step 1. When React calls your component function, layout hasn't happened yet. Your component doesn't know how wide it is. It doesn't know how tall its parent is. It renders blind and hopes for the best.

```tsx
// Ink: how wide am I? Nobody knows yet.
function Card({ item }: { item: Item }) {
  // Can't truncate title -- don't know the width
  // Can't choose compact layout -- don't know the height
  // Can't hide secondary text -- don't know if there's room
  return (
    <Box>
      <Text>{item.title}</Text>
      <Text>{item.description}</Text>
    </Box>
  )
}
```

Ink added `measureElement()` in response to this problem. It works like the browser's `ResizeObserver` -- you can read dimensions after render:

```tsx
// Ink: measure after render, then re-render
function Card({ item }: { item: Item }) {
  const ref = useRef()
  const [width, setWidth] = useState(0)

  useEffect(() => {
    setWidth(measureElement(ref.current).width)
  })

  return (
    <Box ref={ref}>
      <Text>{width > 0 ? truncate(item.title, width) : item.title}</Text>
    </Box>
  )
}
```

This works, but the component renders twice -- first with `width=0`, then with the real width. With nested responsive components (board -> column -> card), each level goes through its own measure-rerender cycle. Three levels of nesting means three cascading updates before the layout settles. In my tests, this produced a visible flash on first paint.

This has been a [known limitation since 2016](https://github.com/vadimdemedes/ink/issues/5). It's not a bug in Ink -- it's a consequence of the render-first pipeline.

## Separating Structure from Content

Silvery's pipeline is different. The key idea is separating **structural layout information** from **content rendering**:

1. **Structure pass** -- React creates the component tree. Structural properties (flex direction, padding, borders, min/max sizes) are extracted from JSX props.
2. **Layout** -- Flexily (a Yoga-compatible layout engine) computes positions and sizes from the structural skeleton.
3. **Content render** -- React renders each component's content with its computed dimensions available via `useContentRect()`.
4. **Paint** -- the renderer writes characters to the terminal buffer, diffing against the previous frame.

The question this raises: how can layout run before React renders content? Layout needs to know sizes. React generates the things being sized.

The answer is that layout doesn't need content. It needs structure -- which nodes exist, what flex properties they have, what their constraints are. This is fully determined by the JSX props (flexDirection, padding, borderStyle, width, height, minWidth, maxWidth, etc.). When a component mounts, Silvery extracts these structural properties and builds a layout tree independently of the content.

Content is what goes inside the boxes. A text string, a truncated title, a compact vs. full card layout -- these are content decisions that can vary based on the available space. Because layout runs first, `useContentRect()` returns real values:

```tsx
// Silvery: dimensions are known during content render
function Card({ item }: { item: Item }) {
  const { width, height } = useContentRect()

  return (
    <Box>
      <Text>{truncate(item.title, width - 4)}</Text>
      {height > 3 && <Text color="$muted">{item.description}</Text>}
    </Box>
  )
}
```

No effect. No second render. No flash. `useContentRect()` returns real values on the first content render because layout has already run on the structural skeleton.

## The Content-Sensitive Layout Caveat

There's an honest caveat here. Some layout decisions depend on content. If a paragraph wraps to three lines at width 40 but two lines at width 50, the content affects the layout. Silvery handles the common case -- text that fits in a fixed-height box, content that adapts to a known width -- but it can't handle truly circular dependencies where the content changes the structure which changes the layout which changes the content.

In practice, this rarely comes up in terminal UIs. Terminal layouts are overwhelmingly grid-like: fixed heights, percentage widths, flex proportions. The cases where text wrapping would feed back into layout are situations where you'd typically set a fixed height anyway (a card with `height={4}`, a log region with `flexGrow={1}`).

When it does come up, the workaround is explicit: set a fixed height on the container, or use `minHeight`/`maxHeight` to bound the feedback. This is the same approach CSS uses for intrinsic sizing ambiguities.

## What This Enables

### Responsive Components

Components can adapt to their container, not just the viewport:

```tsx
function Panel() {
  const { width } = useContentRect()

  if (width < 20) return <CompactView />
  if (width < 40) return <MediumView />
  return <FullView />
}
```

This is the terminal equivalent of CSS container queries. The component doesn't care whether it's full-screen or inside a split view -- it adapts to whatever space it's given.

### Automatic Text Truncation

Silvery knows the width of every Box during content render. Text that exceeds its container's width is truncated automatically with ANSI-aware clipping. You don't need to manually measure and truncate -- though you can if you want precise control.

### Scrollable Containers

`overflow="scroll"` works because the framework knows how tall the container is and how tall the children are. Silvery measures all children, determines which are visible in the viewport, and renders only those. Variable-height children work automatically -- no `estimateHeight` function needed.

### The Kanban Board

Back to the original problem:

```tsx
interface Column { id: string; title: string; cards: CardData[] }
interface CardData { id: string; title: string; assignee: string }

function Board({ columns }: { columns: Column[] }) {
  const { width } = useContentRect()
  const visibleCols = width < 60 ? 1 : width < 120 ? 2 : 3

  return (
    <Box flexDirection="row" width="100%">
      {columns.slice(0, visibleCols).map((col) => (
        <Box key={col.id} flexGrow={1} flexDirection="column" borderStyle="single">
          <Text bold>{col.title}</Text>
          <Box overflow="scroll" flexGrow={1} flexDirection="column">
            {col.cards.map((card) => <CardView key={card.id} card={card} />)}
          </Box>
        </Box>
      ))}
    </Box>
  )
}

function CardView({ card }: { card: CardData }) {
  const { width } = useContentRect()
  const maxLen = width - 2
  const title = card.title.length <= maxLen ? card.title : card.title.slice(0, maxLen - 1) + "\u2026"
  return (
    <Box paddingX={1} flexDirection="column">
      <Text bold>{title}</Text>
      {width > 30 && <Text color="$muted">{card.assignee}</Text>}
    </Box>
  )
}
```

The Board shows 1-3 columns based on its width. Each column scrolls its cards. Each card truncates its title to fit and shows/hides the assignee based on available space. No prop drilling. No measurement effects. No flash.

## The Tradeoff

There's a real cost to this architecture. Silvery's pipeline is more complex than Ink's. The four phases (structure extraction, layout, content render, paint) each have their own caching and dirty-tracking infrastructure. More moving parts means more things that can break, more code to maintain, and more concepts for contributors to understand.

This complexity shows up in one specific scenario: **full tree replacement**. When you replace the root element with something completely different -- switching from a settings screen to a chat view, for example -- Silvery is slower than Ink. All the caching infrastructure needs to rebuild from scratch, and the overhead of checking what changed costs more than Ink's approach of just redoing everything.

For incremental updates (pressing a key, scrolling, typing), Silvery is significantly faster. Most of the pipeline is skipped because the caching knows exactly what changed. A typical interactive update -- moving a cursor in a large tree -- takes about 169 microseconds.

The win is not "one pass forever." It's that components can make width/height decisions before the user ever sees the frame. Whether that's worth the extra pipeline machinery depends on your application. If your components need to adapt to their container size, truncate text intelligently, or implement scrollable regions -- the layout-first approach eliminates an entire category of workarounds. If your app redraws everything on every update anyway, Ink's simpler pipeline is an advantage.

## The Web Parallel

The web went through a similar evolution. For years, components couldn't know their container's size during render. CSS container queries (`@container`) finally solved this in 2023 by making container dimensions available during style calculation. `useContentRect()` is the terminal equivalent -- components adapt to their container, not the viewport.

The underlying principle: **components need to know their constraints to make good rendering decisions.** A pipeline that provides that information during render, rather than after, eliminates an entire category of workarounds.
