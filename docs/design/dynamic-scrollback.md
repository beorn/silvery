# Dynamic Scrollback

How Silvery manages inline-mode content with a three-zone model: static scrollback, dynamic scrollback, and live screen.

## Terminology

Two parallel naming schemes — **item state** (what Silvery tracks) and **zone** (where content appears):

| Item state      | Zone                                     | Meaning                                                   |
| --------------- | ---------------------------------------- | --------------------------------------------------------- |
| **mounted**     | **live screen**                          | React component in the tree. Normal rendering + hooks.    |
| **virtualized** | **dynamic scrollback** (app-managed)     | Pre-rendered string cached. Data retained. Re-renderable. |
| **gone**        | **static scrollback** (terminal-managed) | Data dropped. Terminal owns the lines (until next ED3).   |

An item's state tracks its lifecycle in Silvery. A zone describes where content physically exists in the terminal. The two align: mounted items are on the live screen, virtualized items are in dynamic scrollback, gone items are in static scrollback.

This maps directly to VirtualList: VirtualList keeps items in memory but only mounts visible ones. ScrollbackView does the same, but writes virtualized items as pre-rendered strings into terminal scrollback instead of dropping them entirely.

## The Problem

Terminal scrollback is opaque. Once content scrolls off the visible screen, the terminal owns it — the application cannot query, modify, or selectively clear it. Most TUI frameworks avoid this by using the alternate screen buffer (no scrollback at all). Silvery's inline mode embraces scrollback, which creates a fundamental tension: the app wants to keep content up-to-date, but the terminal wants scrollback to be permanent.

A naive approach treats virtualized items as permanent: write once to stdout, remove from React tree, re-emit everything on resize. This has limitations:

- **No dynamic zone**: All virtualized items are permanent. The app cannot update items that have merely scrolled off-screen.
- **Virtualization is permanent**: Once virtualized, an item's React component is gone. The data is retained only for resize re-emission.
- **Resize is nuclear**: ED3+ED2 clears ALL scrollback and re-emits everything from scratch.
- **No viewport > screen**: Content can only be "mounted" (on-screen, in React tree) or "virtualized" (in scrollback, not in React tree).

The three-zone model solves these problems.

## The Three-Zone Model

The viewport is larger than the terminal screen. Content above the screen but within the viewport is **dynamic scrollback** — still app-managed, re-renderable on demand.

```
┌─────────────────────┐
│  Static scrollback   │  Terminal-managed. Items gone.
│                      │  Silvery no longer tracks these.
│                      │  Destroyed on next ED3 redraw.
│                      │
├ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┤  ← static boundary (maxHistory lines)
│  Dynamic scrollback  │  App-managed. Items virtualized.
│                      │  Pre-rendered for fast redraw.
│                      │  ED3 + re-emit when content changes.
│                      │
├─────────────────────┤  ← screen top
│  Live screen         │  Items mounted (React components).
│                      │  Normal rendering + incremental diff.
│                      │
│ ┌─────────────────┐ │
│ │  Footer (pinned) │ │
│ └─────────────────┘ │
└─────────────────────┘
```

### Static Scrollback

Items above the static boundary. The terminal owns these lines — until the next ED3 clears them. Silvery has dropped their data (state: **gone**). They exist in the terminal's scrollback buffer and are scrollable by the user, but the app cannot modify them and does not attempt to preserve them across redraws.

The static boundary is controlled by `maxHistory` (in terminal lines). As items accumulate, the oldest ones cross the boundary and become gone. Calling `compact()` forces the boundary down immediately.

### Dynamic Scrollback

Items between the static boundary and the screen top (state: **virtualized**). Silvery retains their data and pre-rendered strings. This is the key innovation: **dynamic scrollback is app-managed content that can be re-rendered on demand.**

When content in the dynamic zone changes (new items added, existing items updated, terminal resized):

1. ED3: Clear all terminal scrollback (static items are gone — this is accepted)
2. Re-emit all virtualized items (fast — they're pre-rendered strings)
3. Render live screen content below

This is cheap because pre-rendered items are just string writes — no React rendering, no layout, no diffing. Only items that actually changed need re-rendering.

**Tradeoff**: ED3 destroys static scrollback. Gone items are truly gone after a redraw — the user can no longer scroll up to see them. This is the fundamental cost of having a dynamic zone. The `maxHistory` setting controls how much content stays in the dynamic zone (re-emittable) vs. static (accepted as lost on next redraw).

### Live Screen

The visible terminal screen (state: **mounted**). React components with normal rendering, incremental diffing, and layout. The footer is pinned at the bottom via flex layout (not DECSTBM — scroll regions discard scrollback).

## Item Lifecycle

```
Mounted ──────→ Virtualized ──────→ Gone
(React tree)    (pre-rendered,       (data dropped,
                 data retained)       terminal owns)
```

### Mounted

The component is mounted in the React tree. It participates in layout, receives props, and runs hooks. This is the normal React component lifecycle. Items are mounted when they're visible on the screen.

### Virtualized

The item has scrolled off the visible screen into dynamic scrollback. Silvery:

1. Renders it to a string snapshot (pre-rendering)
2. Removes it from the React tree
3. Retains the item's data and pre-rendered string in memory
4. Writes the pre-rendered string to terminal output as part of the dynamic zone

**Virtualization is reversible.** A virtualized item can be:

- **Re-mounted** at a new width on resize
- **Updated** if its data changes (re-render → re-virtualize)
- **Promoted** to gone when it crosses the maxHistory boundary

The pre-rendered string is a cache. The data is the source of truth.

#### Virtualization Resistance

Not all items should be virtualized at the same point. An item that is actively updating (e.g., streaming content, running tool calls) should remain mounted longer than a completed item. Two thresholds control this:

- **Auto-virtualize**: Completed items virtualize immediately when they scroll off the visible screen.
- **Resist virtualization**: Actively-changing items remain mounted until they're `maxDeferLines` past the screen top (default: ~50 lines). This prevents constant mount/unmount churn for items still receiving updates.

The `isFrozen` predicate indicates: "This item is done changing — safe to virtualize eagerly, even while still on-screen."

### Gone

The item crosses the static boundary (maxHistory). Its data is dropped. The pre-rendered string may still exist in the terminal's scrollback buffer, but Silvery no longer tracks it. The next ED3 will destroy it.

## The Redraw

The key operation in dynamic scrollback is a **full redraw**: clear all scrollback and the screen, then re-emit everything the app still tracks.

```
Before:                          After redraw:
┌──────────────────┐             ┌──────────────────┐
│ Static scrollback│             │ (destroyed by ED3)│
├ ─ ─ ─ ─ ─ ─ ─ ─ ┤             ├ ─ ─ ─ ─ ─ ─ ─ ─ ┤
│ Dynamic item A   │             │ Dynamic item A'  │ ← re-emitted
│ Dynamic item B   │             │ Dynamic item B'  │ ← re-emitted
│ Dynamic item C   │             │ Dynamic item C'  │ ← re-emitted
├──────────────────┤             ├──────────────────┤
│ Live content     │             │ Live content'    │ ← re-rendered
└──────────────────┘             └──────────────────┘
```

The sequence:

1. ED3 (`\x1b[3J`): Clear terminal scrollback buffer
2. ED2 (`\x1b[2J`): Clear visible screen
3. Write all virtualized items (pre-rendered strings — fast)
4. Render live content below (normal React pipeline)

**Static items are destroyed.** This is the accepted tradeoff. Gone items have already had their data dropped — Silvery can't re-emit them even if it wanted to. ED3 merely removes the stale terminal lines.

### Why ED3 (Not ED0)?

An alternative approach would be CUP + ED0 to "clear from a boundary" without touching scrollback. This does not work:

- **CUP can't reach scrollback.** CUP coordinates are 1-based within the visible screen. The cursor can never be positioned into scrollback lines.
- **ED0 only affects the visible screen.** It erases from cursor to end of screen — scrollback is untouched.
- **Dynamic items ARE in scrollback.** Once they scroll off the visible screen, they're in terminal scrollback and unreachable by CUP/ED0.

The only way to update content that has scrolled into terminal scrollback is ED3 (nuke it all) + re-emit. This is what the resize implementation does.

### When Redraw Fires

- **New item added**: New item pushes content up; redraw
- **Item updated**: Re-render the changed item; redraw
- **Terminal resize**: Re-render all virtualized items at new width; redraw
- **Compaction**: Move static boundary down; the dynamic zone shrinks

### Why Not Just Diff?

In fullscreen mode, the output phase diffs buffers cell-by-cell and emits minimal ANSI updates. In inline mode with dynamic scrollback, this doesn't work because:

- Terminal scrollback is opaque — we can't read what's there to diff against
- Content displacement (new items pushing everything up) means every cell's position changes
- The pre-rendered strings ARE the output — there's nothing to diff against

ED3 + re-emit is the correct primitive for dynamic scrollback. It's fast because pre-rendered items are just string writes (no React, no layout, no diffing).

## Automatic Virtualization

Items that scroll off the visible screen are automatically virtualized. The app does not need to call `freeze()` or set `isFrozen` — scrolling past the screen top is sufficient.

```tsx
// Items virtualize as they scroll off-screen.
<ScrollbackView items={messages} keyExtractor={(m) => m.id} footer={<StatusBar />}>
  {(m) => <Message data={m} />}
</ScrollbackView>
```

The `isFrozen` prop and `freeze()` callback are **hints** rather than requirements:

- `isFrozen`: "This item will never change again — safe to pre-render immediately even while on-screen"
- `freeze()`: "I'm done — pre-render me now so redraw is fast when I scroll off"

Without either hint, items are pre-rendered when they scroll off-screen (slightly more work at virtualization time, but no app coordination needed).

### Resisting Virtualization

Some items are actively changing — streaming text, running tool calls, updating progress. These items can resist automatic virtualization:

```tsx
<ScrollbackView
  items={exchanges}
  keyExtractor={(e) => e.id}
  isFrozen={(item) => item.status === "done"}
  footer={<StatusBar />}
>
  {(item) => <ExchangeItem exchange={item} />}
</ScrollbackView>
```

Unfrozen items remain mounted (in React tree) until either:

- They become frozen (`isFrozen` returns true) and scroll off-screen → immediate virtualization
- They are explicitly frozen via the `freeze()` callback from `useScrollbackItem`

This prevents churn for items receiving rapid updates while still bounding memory usage.

## Resize Strategy

Resize changes the rendering width, which affects line wrapping and item heights. The strategy differs by zone:

| Zone               | Resize behavior                                         |
| ------------------ | ------------------------------------------------------- |
| Static scrollback  | Destroyed by ED3. Terminal reflow was imperfect anyway. |
| Dynamic scrollback | Re-render at new width → re-virtualize. Full redraw.    |
| Live screen        | Normal React re-render at new width                     |

The dynamic zone re-render is O(N) `renderStringSync` calls, but N is bounded by `maxHistory` lines and the calls are fast (no React reconciliation, just string generation). Items still resisting virtualization go through normal React re-render.

**No selective clear needed.** Full ED3 + re-emit handles resize cleanly. Static content is destroyed (acceptable — the terminal's reflow was imperfect anyway).

## maxHistory and the Virtual Viewport

`maxHistory` controls the size of the virtual viewport — how many lines of dynamic scrollback silvery maintains above the screen. Default: 10000.

```tsx
<ScrollbackView
  items={items}
  keyExtractor={(item) => item.id}
  maxHistory={500} // 500 lines of dynamic scrollback
  footer={<StatusBar />}
>
  {(item) => <Item data={item} />}
</ScrollbackView>
```

When dynamic scrollback exceeds `maxHistory`, the oldest items are promoted to gone (data dropped, terminal owns them until next ED3).

The total viewport is: `maxHistory + screen height`. This is the maximum content silvery can re-render on demand.

## API

```tsx
interface ScrollbackViewProps<T> {
  items: T[]
  children?: (item: T, index: number) => ReactNode
  renderItem?: (item: T, index: number) => ReactNode
  keyExtractor: (item: T, index: number) => string | number

  // Data-driven frozen predicate (optional — items freeze via useScrollbackItem too)
  isFrozen?: (item: T, index: number) => boolean

  // Maximum lines in dynamic scrollback before promoting to static. Default: 10000
  maxHistory?: number

  // Footer pinned at bottom of screen
  footer?: ReactNode

  // OSC 133 markers for terminal navigation
  markers?: boolean | ScrollbackMarkerCallbacks<T>
}
```

## Architecture Summary

| Aspect                    | Behavior                                                   |
| ------------------------- | ---------------------------------------------------------- |
| Zones                     | 3 (live screen, dynamic scrollback, static scrollback)     |
| Virtualize semantics      | Reversible (pre-render cache, data retained)               |
| Resize                    | ED3 + re-emit dynamic zone only (static items dropped)     |
| Viewport                  | = maxHistory + screen height                               |
| Auto-virtualize           | Scroll off screen = auto-virtualize                        |
| Virtualization resistance | `isFrozen` + `maxDeferLines` for actively-changing items   |
| Data lifetime             | Retained until crossing the static boundary (`maxHistory`) |

## DECSTBM: Why Not

DECSTBM (Set Top and Bottom Margins) creates a scroll region within the screen. Lines that scroll out of the region are **discarded** — they never enter terminal scrollback. This has been confirmed across multiple terminals (xterm, iTerm2, Ghostty, Kitty, WezTerm).

This makes DECSTBM unsuitable for pinning footers in inline mode: content scrolling past the footer would vanish from history. The footer is instead pinned via flex layout (flexShrink={0}).

## Implementation Notes

### Terminal Capabilities

- **ED3 (`\x1b[3J`)**: Clears terminal scrollback buffer. Supported by Ghostty, iTerm2, xterm, Alacritty, WezTerm, Kitty, VTE terminals, Windows Terminal.
- **ED2 (`\x1b[2J`)**: Clears entire visible screen. Universal support.
- **ED0 (`\x1b[J`)**: Clears from cursor to end of screen. Universal support. **Cannot reach scrollback** — CUP coordinates are screen-local.
- **CUP (`\x1b[H`)**: Cursor position (1-based, visible screen only). Universal.
- **`\r\n`**: Line endings for scrollback writes (avoids DECAWM double-advance).

### OSC 133 Semantic Markers

Each virtualized item in dynamic scrollback gets OSC 133 prompt markers, enabling Cmd+Up/Down navigation in supported terminals (iTerm2, Kitty, WezTerm, Ghostty).

### Content in Terminal Scrollback

Pre-rendered strings written to dynamic scrollback include full ANSI styling: colors, bold, italic, borders, OSC 8 hyperlinks. When the user scrolls up in their terminal, they see fully styled content — until the next ED3 redraw clears it.

## Future Considerations

1. **Tall items spanning zones**: An item tall enough that its top is in scrollback while its bottom is on-screen is kept mounted until fully off-screen.

2. **Scroll position detection**: No terminal protocol exists to detect whether the user has scrolled up. The app cannot show "new content below" indicators.

3. **React `<Activity>`**: If React ships offscreen rendering, virtualized items could potentially be "paused" instead of unmounted, preserving hook state.

4. **maxDeferLines tuning**: The default of ~50 lines may need adjustment based on real-world measurement. Too low causes churn for streaming items, too high wastes memory keeping many items mounted.

5. **ED3 frequency**: Every redraw destroys static scrollback. If redraws are frequent (e.g., streaming updates), the user may never see content in scrollback because it is constantly being cleared. Batching or debouncing redraws may be beneficial.

## Reference

- Current implementation: `packages/ag-react/src/hooks/useScrollback.ts`
- ScrollbackView component: `packages/ag-react/src/ui/components/ScrollbackView.tsx`
