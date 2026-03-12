# Dynamic Scrollback

How Silvery manages inline-mode content with a three-zone model: static scrollback, dynamic scrollback, and live screen.

## The Problem

Terminal scrollback is opaque. Once content scrolls off the visible screen, the terminal owns it — the application cannot query, modify, or selectively clear it. Most TUI frameworks avoid this by using the alternate screen buffer (no scrollback at all). Silvery's inline mode embraces scrollback, which creates a fundamental tension: the app wants to keep content up-to-date, but the terminal wants scrollback to be permanent.

The current implementation treats frozen items as permanent: write once to stdout, remove from React tree, re-emit everything on resize. This works but has limitations:

- **No dynamic zone**: All frozen items are permanent. The app can't update items that have merely scrolled off-screen.
- **Freeze is a lifecycle event**: Once frozen, an item's React component is gone. The data is retained only for resize re-emission.
- **Resize is nuclear**: ED3+ED2 clears ALL scrollback and re-emits everything from scratch.
- **No viewport > screen**: Content can only be "live" (on-screen, in React tree) or "frozen" (in scrollback, not in React tree).

## The Three-Zone Model

The viewport is larger than the terminal screen. Content above the screen but within the viewport is **dynamic scrollback** — still app-managed, re-renderable on demand.

```
┌─────────────────────┐
│  Static scrollback   │  Terminal owns it. Data dropped.
│                      │  Silvery no longer tracks these items.
│                      │
├ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┤  ← static boundary (maxHistory lines)
│  Dynamic scrollback  │  App-managed. Data retained.
│                      │  Pre-rendered (frozen) for fast redraw.
│                      │  Clear + redraw when content changes.
│                      │
├─────────────────────┤  ← screen top
│  Screen / live       │  Mounted React components.
│                      │  Normal rendering + incremental diff.
│                      │
│ ┌─────────────────┐ │
│ │  Footer (pinned) │ │
│ └─────────────────┘ │
└─────────────────────┘
```

### Static Scrollback

Items above the static boundary. The terminal owns these lines. Silvery has dropped their data — it no longer tracks, re-renders, or references them. They exist in the terminal's scrollback buffer and are scrollable by the user, but the app cannot modify them.

The static boundary is controlled by `maxHistory` (in terminal lines). As items accumulate, the oldest ones cross the boundary and become static. Calling `compact()` forces the boundary down immediately (like Claude Code's context compaction).

### Dynamic Scrollback

Items between the static boundary and the screen top. Silvery retains their data and pre-rendered strings. This is the key innovation: **dynamic scrollback is app-managed scrollback that lives in the terminal's scrollback buffer but can be re-rendered.**

When content in the dynamic zone changes (new items added, existing items updated, terminal resized):

1. Clear from the dynamic scrollback boundary down (screen + visible dynamic content)
2. Re-emit all dynamic items (fast — they're pre-rendered unless a re-render is needed)
3. Render live screen content below

This is cheap because pre-rendered items are just string writes — no React rendering, no layout, no diffing. Only items that actually changed need re-rendering.

### Screen / Live

The visible terminal screen. Mounted React components with normal rendering, incremental diffing, and layout. The footer is pinned at the bottom via flex layout (not DECSTBM — scroll regions discard scrollback).

## Item Lifecycle

```
Live ──────→ Frozen ──────→ Static
(mounted)    (pre-rendered,   (data dropped,
              data retained)   terminal owns)
```

### Live

The component is mounted in the React tree. It participates in layout, receives props, and runs hooks. This is the normal React component lifecycle. Items are live when they're visible on the screen.

### Frozen (Dynamic Scrollback)

The item has scrolled off the visible screen into dynamic scrollback. Silvery:

1. Renders it to a string snapshot (pre-rendering)
2. Removes it from the React tree
3. Retains the item's data and pre-rendered string in memory
4. Writes the pre-rendered string to terminal output as part of the dynamic scrollback zone

**Freeze is an optimization, not a permanent commitment.** A frozen item can be:

- **Re-rendered** at a new width on resize (thaw → re-freeze)
- **Updated** if its data changes (thaw → re-render → re-freeze)
- **Promoted** to static when it crosses the maxHistory boundary

The pre-rendered string is a cache. The data is the source of truth.

### Static

The item crosses the static boundary (maxHistory). Its data is dropped. The pre-rendered string may still exist in the terminal's scrollback buffer, but Silvery no longer tracks it.

This is truly permanent — there is no way to modify or remove static content from terminal scrollback (except ED3, which clears ALL scrollback).

## The "Clear To" Concept

The key operation in dynamic scrollback is **clear-to**: clear from a specific boundary down to the bottom of the screen, then redraw everything below that boundary.

```
Before:                          After clear-to(boundary):
┌──────────────────┐             ┌──────────────────┐
│ Static           │             │ Static           │ (untouched)
├ ─ ─ ─ ─ ─ ─ ─ ─ ┤             ├ ─ ─ ─ ─ ─ ─ ─ ─ ┤
│ Dynamic item A   │             │ Dynamic item A'  │ ← re-emitted
│ Dynamic item B   │             │ Dynamic item B'  │ ← re-emitted
│ Dynamic item C   │             │ Dynamic item C'  │ ← re-emitted
├──────────────────┤             ├──────────────────┤
│ Live content     │             │ Live content'    │ ← re-rendered
└──────────────────┘             └──────────────────┘
```

The sequence:

1. Position cursor at the clear-to boundary (CUP to first dynamic line)
2. Erase from cursor to end of screen (ED0: `\x1b[J`)
3. Write all dynamic items (pre-rendered strings — fast)
4. Render live content below (normal React pipeline)

**This does NOT clear terminal scrollback (no ED3).** Static items above the boundary are untouched. Only the dynamic zone + screen are redrawn.

### When Clear-To Fires

- **New item added**: New item pushes content up; clear-to and redraw
- **Item updated**: Re-render the changed item; clear-to and redraw
- **Terminal resize**: Re-render all dynamic items at new width; clear-to and redraw
- **Compaction**: Move static boundary down; the cleared zone shrinks

### Why Not Just Diff?

In fullscreen mode, the output phase diffs buffers cell-by-cell and emits minimal ANSI updates. In inline mode with dynamic scrollback, this doesn't work because:

- Terminal scrollback is opaque — we can't read what's there to diff against
- Content displacement (new items pushing everything up) means every cell's position changes
- The pre-rendered strings ARE the output — there's nothing to diff against

Clear-to-and-redraw is the correct primitive for dynamic scrollback. It's fast because pre-rendered items are just string writes (no React, no layout, no diffing).

## Automatic Freezing

Items that scroll off the visible screen are automatically frozen. The app doesn't need to call `freeze()` or set `isFrozen` — scrolling past the screen top is sufficient.

```tsx
// This just works. Items freeze as they scroll off-screen.
<ScrollbackView maxHeight={500} footer={<StatusBar />}>
  {messages.map((m) => (
    <Message key={m.id} data={m} />
  ))}
</ScrollbackView>
```

The `isFrozen` prop and `freeze()` callback become **hints** rather than requirements:

- `isFrozen`: "This item will never change again — safe to pre-render immediately even while on-screen"
- `freeze()`: "I'm done — pre-render me now so clear+redraw is fast when I scroll off"

Without either hint, items are pre-rendered when they scroll off-screen (slightly more work at freeze time, but no app coordination needed).

## Resize Strategy

Resize changes the rendering width, which affects line wrapping and item heights. The strategy differs by zone:

| Zone    | Resize behavior                                                       |
| ------- | --------------------------------------------------------------------- |
| Static  | Nothing — terminal reflows it (imperfectly), silvery doesn't track it |
| Dynamic | Thaw → re-render at new width → re-freeze. Clear-to and redraw.       |
| Live    | Normal React re-render at new width                                   |

The dynamic zone re-render is O(N) `renderStringSync` calls, but N is bounded by `maxHistory` lines and the calls are fast (no React reconciliation, just string generation).

**No ED3 needed.** Dynamic scrollback doesn't need to nuke all terminal scrollback on resize — it only redraws its own zone. Static content above the boundary is left alone (the terminal's reflow is imperfect but acceptable for old content).

## maxHeight and the Virtual Viewport

`maxHeight` controls the size of the virtual viewport — how many lines of dynamic scrollback silvery maintains above the screen.

```tsx
<ScrollbackView
  maxHeight={500} // 500 lines of dynamic scrollback
  footer={<StatusBar />}
>
  {items.map((item) => (
    <Item key={item.id} data={item} />
  ))}
</ScrollbackView>
```

When dynamic scrollback exceeds `maxHeight`, the oldest items are promoted to static (data dropped, terminal owns them).

The total viewport is: `maxHeight + screen height`. This is the maximum content silvery can re-render on demand.

## API (Proposed)

```tsx
interface ScrollbackViewProps<T> {
  items: T[]
  children: (item: T, index: number) => ReactNode
  keyExtractor: (item: T, index: number) => string | number

  // Freeze hints (optional — auto-freeze works without these)
  isFrozen?: (item: T, index: number) => boolean

  // Dynamic scrollback size (in terminal lines). Default: 500
  maxHeight?: number

  // Footer pinned at bottom of screen
  footer?: ReactNode

  // OSC 133 markers for terminal navigation
  markers?: boolean | ScrollbackMarkerCallbacks<T>
}
```

## Comparison with Current Implementation

| Aspect           | Current                                       | Proposed                                                |
| ---------------- | --------------------------------------------- | ------------------------------------------------------- |
| Zones            | 2 (live, frozen)                              | 3 (live, dynamic, static)                               |
| Freeze semantics | Permanent (write to stdout, remove from tree) | Optimization (pre-render cache, data retained)          |
| Resize           | ED3 nuke all scrollback + re-emit everything  | Clear-to dynamic boundary + re-render dynamic zone only |
| Viewport         | = screen height                               | = maxHeight + screen height                             |
| Auto-freeze      | No (app must set isFrozen or call freeze())   | Yes (scroll off screen = auto-freeze)                   |
| Data lifetime    | Retained until static promotion               | Same, but static boundary is explicit (maxHistory)      |

## DECSTBM: Why Not

DECSTBM (Set Top and Bottom Margins) creates a scroll region within the screen. Lines that scroll out of the region are **discarded** — they never enter terminal scrollback. This has been confirmed across multiple terminals (xterm, iTerm2, Ghostty, Kitty, WezTerm).

This makes DECSTBM unsuitable for pinning footers in inline mode: content scrolling past the footer would vanish from history. The footer is instead pinned via flex layout (flexShrink={0}).

## Implementation Notes

### Terminal Capabilities

- **ED3 (`\x1b[3J`)**: Clears terminal scrollback buffer. Supported by Ghostty, iTerm2, xterm, Alacritty, WezTerm, Kitty, VTE terminals, Windows Terminal.
- **ED0 (`\x1b[J`)**: Clears from cursor to end of screen. Universal support.
- **CUP (`\x1b[H`)**: Cursor position. Universal.
- **`\r\n`**: Line endings for scrollback writes (avoids DECAWM double-advance).

### OSC 133 Semantic Markers

Each frozen item in dynamic scrollback gets OSC 133 prompt markers, enabling Cmd+Up/Down navigation in supported terminals (iTerm2, Kitty, WezTerm, Ghostty).

### Content in Terminal Scrollback

Pre-rendered strings written to dynamic scrollback include full ANSI styling: colors, bold, italic, borders, OSC 8 hyperlinks. When the user scrolls up in their terminal, they see fully styled content.

## Open Questions

1. **Tall items spanning zones**: An item may be tall enough that its top is in dynamic scrollback while its bottom is on-screen. How to handle this? Current approach: keep it live until fully off-screen.

2. **Scroll position detection**: No terminal protocol exists to detect whether the user has scrolled up. The app can't show "new content below" indicators.

3. **React `<Activity>`**: If React ships offscreen rendering, frozen items could potentially be "paused" instead of unmounted, preserving hook state.

## Reference

- Original design: `git show fff9add -- docs/design/viewport-architecture.md` (302 lines, deleted in docs cleanup)
- Current implementation: `packages/react/src/hooks/useScrollback.ts`
- Bead: km-3edn9 (ScrollbackView v2)
