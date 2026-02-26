# Viewport Architecture

How inkx manages fullscreen apps, scrollback-based apps, and virtualized scrolling — using composable root components with a shared virtualization engine.

## Mental Model

A terminal has two regions: the **screen** (the visible grid) and the **scrollback** (lines above the screen that the user can scroll to). Together they form the **history** — the screen is a window into the bottom of history.

History ⊃ Screen. The screen is always the bottom N rows of history.

inkx manages three zones:

```
┌─────────────────────┐
│  Scrollback/static   │  ← rendered final, data dropped
│  (terminal owns it)  │
├ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┤  ← static boundary
│  Scrollback/dynamic  │  ← virtualized, data retained
│  (inkx tracks it)    │
├─────────────────────┤
│  Screen/live         │  ← mounted React components
│                      │
└─────────────────────┘
```

The key insight: **fullscreen vs inline is just a question of which region you render to.** Fullscreen claims the alternate screen buffer (a separate screen with no scrollback). Inline renders to the normal buffer where output accumulates in scrollback.

## Component Taxonomy

Four primitives, two compat wrappers:

### `<Screen>` — Fullscreen

Claims the alternate screen buffer. Provides a full rectangle for flexbox layout. Content is absolutely positioned and incrementally diffed.

```tsx
<Screen>
  <Sidebar />
  <MainContent />
  <StatusBar />
</Screen>
```

This is what km uses today. The entire terminal is your canvas. No scrollback. Mouse events work everywhere. Text selection works normally (no mouse tracking conflicts).

### `<ScrollView>` — Native Scrollback

Uses the normal terminal buffer. Children flow vertically. As items scroll off the top of the screen, they transition through the virtualization lifecycle (Live → Virtualized → Static) and are committed to terminal scrollback.

```tsx
<ScrollView>
  {messages.map(m => <Message key={m.id} data={m} />)}
  <InputBar />
</ScrollView>
```

The user scrolls with their terminal's native scroll (mouse wheel, scrollbar, Shift+PageUp). Text selection is free. Content becomes part of the terminal's permanent history.

**Trade-offs**: No mouse events in scrollback (terminal reports screen coordinates only). Updating content already in scrollback requires rewriting everything below it (expensive). Snap-to-bottom is controlled by the terminal, not the app.

### `<VirtualScrollView>` — App-Managed Scrolling

A scrollable area within a `<Screen>`. Items mount/unmount based on scroll position, managed entirely by the app. Shares the same `useVirtualizer()` engine as ScrollView.

```tsx
<Screen>
  <Header />
  <VirtualScrollView
    items={logs}
    renderItem={(item) => <LogEntry data={item} />}
    estimateHeight={() => 3}
  />
  <StatusBar />
</Screen>
```

**Trade-offs**: Mouse events work (including in scrolled-off items if you scroll back). App controls scroll position (no snap-to-bottom problem). But text selection requires mouse tracking to be off or Shift+drag. Memory lives in the React tree, not the terminal buffer.

### Compat Wrappers

**`<VirtualList>`** — Thin wrapper around `<VirtualScrollView>`. Keeps the existing API for Ink migration.

**`<Static>`** — Thin wrapper around `<ScrollView>` that immediately virtualizes items on mount (render-once semantics). Ink-compatible API (`items` array + render function).

## Compositions

```tsx
// Fullscreen app (km today)
<Screen><App /></Screen>

// Scrollback/inline app (chat UI, CLI tools)
<ScrollView>
  {messages.map(m => <Message key={m.id} data={m} />)}
  <InputBar />
</ScrollView>

// Fullscreen + scrollable region (log viewer, dashboard)
<Screen>
  <Sidebar />
  <VirtualScrollView items={logs} renderItem={...} />
  <StatusBar />
</Screen>

// Fullscreen + native scrollback for history (hybrid)
<ScrollView>
  {history.map(h => <HistoryEntry key={h.id} data={h} />)}
  <Screen>
    <LiveContent />
    <InputBar />
  </Screen>
</ScrollView>
```

## Item Lifecycle

Three states. Transitions are automatic based on visibility.

```
Live ──────→ Virtualized ──────→ Static
(mounted)    (unmounted,         (unmounted,
              data retained)      data dropped)
```

### Scrollback Zones

The scrollback buffer has two zones — **dynamic** and **static**:

```
┌─────────────────────┐
│  Static scrollback   │  ← rendered final, data dropped
│  (terminal owns it)  │     inkx no longer tracks these items
├ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┤  ← static boundary
│  Dynamic scrollback  │  ← virtualized, data retained
│  (inkx tracks it)    │     can re-render on resize
├─────────────────────┤
│  Screen (live)       │  ← mounted React components
│                      │     normal rendering
└─────────────────────┘
```

The static boundary moves down over time as items age past `maxHistory`. Calling `viewport.compact()` forces it down immediately (like Claude Code's compaction).

### Live

The component is mounted in the React tree, rendering normally. It participates in layout, receives props, runs hooks. This is the normal React component lifecycle.

### Virtualized (Dynamic Scrollback)

The component has scrolled out of the visible area into the **dynamic** section of scrollback. inkx:
1. Renders it to a string snapshot
2. Commits the snapshot to terminal scrollback (ScrollView) or unmounts it (VirtualScrollView)
3. Removes it from the React tree
4. Retains the item's data/props in memory

The item can be re-mounted if it scrolls back into view (VirtualScrollView) or re-rendered at a new width if the terminal resizes (ScrollView — nuke-and-redraw).

### Static (Static Scrollback)

The item crosses the static boundary and becomes **rendered final**. Data is dropped — the string snapshot may still exist in the terminal's scrollback buffer, but inkx no longer tracks it. This happens when items age past `maxHistory` (in terminal lines) or when `viewport.compact()` is called.

### No Paused State

We deliberately omit a "paused" state (mounted but not rendering). Most application state lives in external stores (Zustand, jotai, signals), not in React hooks. Unmounting a component that reads from a store loses nothing — remounting picks up the current store state.

If React's `<Activity>` / `<Offscreen>` matures and proves useful for terminal UIs, we can revisit.

### No Negotiation

Items cannot prevent or delay virtualization. This matches the philosophy of TanStack Virtual, react-virtuoso, and react-window: **if unmounting loses state, your state is in the wrong place.**

The framework decides when to virtualize based on visibility. Components are responsible for keeping important state external (stores, refs, context).

## Shared Virtualization Engine: `useVirtualizer()`

Both ScrollView and VirtualScrollView share a headless hook — similar to `@tanstack/react-virtual`:

```tsx
const virtualizer = useVirtualizer({
  count: items.length,
  getItemKey: (index) => items[index].id,
  estimateHeight: (index) => 3,  // lines
  overscan: 5,
})
```

The hook handles:
- Item tracking by key
- Height measurement (actual) and estimation (before mount)
- Visible range calculation
- Overscan buffering (mount items just outside viewport for smooth scroll)
- Mount/unmount decisions

The only difference is the **output adapter**:
- **ScrollView**: virtualized items are rendered to string → written to terminal scrollback → unmounted
- **VirtualScrollView**: virtualized items are simply unmounted (remounted when scrolled back into view)

## Terminal Scrollback Detection

No standard ANSI escape sequence exists to query a terminal's scrollback limit. We use a `TERM_PROGRAM` heuristic with prop override:

| Terminal | Default Scrollback |
|---|---|
| Ghostty | 10,000 lines |
| Kitty | 2,000 lines |
| iTerm2 | unlimited (configurable) |
| WezTerm | 3,500 lines |
| macOS Terminal | 10,000 lines |
| xterm | 1,024 lines |

```tsx
<ScrollView maxHistory={5000}>  {/* override heuristic */}
```

A separate `terminal-caps` utility package (P4) could read actual terminal configs for precise detection. For now, the heuristic + prop override is sufficient.

## Tall Item Re-render Optimization

A live component may span both screen and scrollback (it's tall enough that its top has scrolled off while its bottom is still visible). When it re-renders:

1. Diff the new render against the previous render
2. Partition the diff into scrollback portion and screen portion
3. If only the screen portion changed → incremental update (cheap, normal diffing)
4. If the scrollback portion changed → full rewrite from that point down (expensive, unavoidable)

This is the key performance insight: most updates to a tall item (like a streaming response) append at the bottom (screen portion), so the scrollback portion rarely changes. Only structural changes (editing earlier content) trigger the expensive path.

## Resize Strategy: Nuke-and-Redraw

When the terminal resizes (especially width changes), content in scrollback is at the old width. The terminal won't reflow it. Our options:

1. **Leave it** — scrollback has wrong-width content, live area reflows correctly. Ugly but functional.
2. **Nuke-and-redraw** — `CSI 3J` clears scrollback, then re-render all retained items at new width.

We choose (2) for correctness. `CSI 3J` is supported by all modern terminals (xterm, Ghostty, Kitty, WezTerm, iTerm2, GNOME Terminal). The cost is proportional to the number of retained (virtualized) items, but resizes are infrequent.

For ScrollView with a `maxHistory` of 5,000 lines, a resize reprints at most 5,000 lines — fast enough to be imperceptible.

## Trade-off Matrix

| | ScrollView (native) | VirtualScrollView (app-managed) |
|---|---|---|
| Text selection | Free (terminal handles) | Shift+drag only (mouse tracking) |
| Scroll mechanism | Terminal (mouse wheel, scrollbar) | App (keyboard, mouse wheel events) |
| Scroll position control | Terminal decides | App decides (no snap-to-bottom issue) |
| Mouse in history | No (coordinates are screen-relative) | Yes (app tracks position) |
| Perf: append | O(1) — write to scrollback | O(1) — mount at bottom |
| Perf: update old item | O(lines below it) — rewrite scrollback | O(1) if visible, free if unmounted |
| Memory | Terminal buffer (external) | React tree (in-process) |
| Max items | Terminal scrollback limit | Available memory |
| Content after app exit | Preserved in terminal scrollback | Gone |

## DECSTBM Integration

ScrollView uses DECSTBM (scroll regions) to pin a footer/status bar at the bottom of the screen while content scrolls above it.

**Critical detail**: Lines scrolled out of a DECSTBM region are NOT saved to terminal scrollback by default. The framework must explicitly write frozen content to stdout (outside the scroll region) before the region scroll occurs. The `useScrollback` hook handles this.

**Sequence**:
1. Set scroll region to rows 1..(N-1), excluding the status bar row
2. When freezing an item: temporarily reset region, write item to stdout, re-engage region
3. Issue `CSI S` (scroll up) within the region for the live content area
4. Update status bar on the excluded bottom row via cursor positioning

## Open Questions (Future Work)

1. **Scroll position detection**: No terminal protocol exists to detect whether the user has scrolled up. This means the app can't show "you've scrolled away, new content below" indicators. A future terminal protocol extension could solve this.

2. **OSC 8 hyperlinks in scrollback**: Frozen content could include clickable links (file paths, URLs) that remain functional in scrollback. Worth implementing.

3. **iTerm2/Kitty semantic marks**: Emitting shell integration marks (OSC 133) around each item would enable "jump to previous item" in supporting terminals.

4. **React `<Activity>`/`<Offscreen>`**: If React ships this, it could provide a "paused" state that preserves hook state without rendering. Worth revisiting if it proves useful for terminal UIs.

5. **Streaming items that scroll off**: A long streaming response scrolls its top into scrollback while the bottom is still live. The tall-item optimization handles this, but the UX of having partially-frozen content is worth studying further.
