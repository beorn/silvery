# VirtualColumns Design

> **Status: RFC** — This is a design proposal, not yet implemented. Feedback welcome.

Composable virtualization primitives for 2D grid layouts (kanban boards, spreadsheets) with position tracking and cross-axis navigation.

## Problem

Apps rendering 2D grids (e.g. km-tui's kanban Board) need:

1. **Horizontal virtualization** — only render columns in the viewport
2. **Vertical virtualization** — only render items within each visible column
3. **Position tracking** — know where each rendered item is on screen (x, y, width, height)
4. **Cross-axis navigation** — move between columns at a consistent Y position ("stickyY")

silvery already provides `VirtualList` (vertical) and `HorizontalVirtualList` (horizontal), but these are independent components with no shared position awareness. Currently km-tui bridges them with app-level code spread across four files:

| File                | Responsibility                                                                           | Lines |
| ------------------- | ---------------------------------------------------------------------------------------- | ----- |
| `Board.tsx`         | Horizontal column slicing (`columns.slice(offset, offset + maxCols)`)                    | ~40   |
| `board-layout.ts`   | Column scroll formula (`calcEdgeBasedColumnScrollOffset`)                                | ~50   |
| `card-positions.ts` | `LayoutRegistry` — position tracking, stickyY/X, `findCardAtYVisual`                     | ~460  |
| `CardColumn.tsx`    | `CardLayoutRegistrar` — register/unregister on mount/unmount via `useScreenRectCallback` | ~50   |

### Current bugs and fragility

- **Stale registry entries**: When VirtualList unmounts a card (scroll past), the registry retains its old position. If h/l navigation queries `findCardAtYVisual` before the next render cleans up, it intersects stale bounding boxes and jumps to the wrong card.
- **Index mismatch**: The registry is keyed by `(colIndex, cardIndex)`, but column indices shift when horizontal scroll offset changes. Registration and unregistration must stay perfectly synchronized with the visible window — one missed cleanup corrupts subsequent lookups.
- **Reimplementation burden**: Every new view mode (cards, columns, list, tabs) must independently wire up `ScrollTrackingVirtualList` + `CardLayoutRegistrar` + scroll offset calculation.

## Prior Art

### TanStack Virtual

- Headless virtualizer: one `useVirtualizer()` hook handles any axis.
- Grid = compose two virtualizers (row + column). Each returns virtual items with `start`/`size`/`index`.
- Position-aware by design — `virtualItem.start` gives the pixel offset.
- No built-in cross-axis navigation (it's a web library; keyboard nav is app-level).

### React Native FlatList / SectionList

- `FlatList` has `numColumns` for uniform grids, plus `viewabilityConfig` for tracking visible items.
- `SectionList` groups items into sections (similar to columns) with headers.
- Virtualization is automatic (only visible items mount). Position tracking is via `onViewableItemsChanged` callback.
- No cross-axis navigation primitives.

### Flutter Slivers

- `CustomScrollView` composes `SliverList`, `SliverGrid`, etc. in a single scroll context.
- `SliverGrid` virtualizes both axes: main axis scrolls, cross axis is laid out by a `SliverGridDelegate`.
- Built-in `crossAxisCount` and `maxCrossAxisExtent` delegates handle column count calculation.
- No cross-axis keyboard navigation (it's primarily touch-based).

### Terminal TUIs (ratatui, textual)

- **ratatui** (Rust): Immediate-mode rendering. `List` widget renders all items on every frame — no virtualization. App manages scroll offset manually. No position registry.
- **textual** (Python): `DataTable` widget virtualizes rows in a table. `Grid` container lays out children in CSS Grid, but doesn't virtualize. No built-in cross-axis keyboard nav.

### Key takeaway

No framework provides all four requirements (H+V virtualization, position tracking, cross-axis navigation) out of the box. TanStack Virtual's composable approach (two independent virtualizers) is the closest model. The position registry and cross-axis navigation are novel contributions for terminal UIs.

## Design: Composable Primitives

### Approach: Composition over Monolith

Rather than a single `VirtualGrid` component, provide composable primitives that work together:

```
HorizontalVirtualList          — horizontal axis (sections/columns)
  └─ VirtualList               — vertical axis (items per section)
      └─ usePositionRegistry() — auto-register on mount, unregister on unmount
```

This matches TanStack Virtual's philosophy. Benefits:

- Each axis can be used independently (some views only need vertical)
- Position registry is opt-in (simple lists don't need it)
- Apps compose at any level (custom column headers, mixed item heights, etc.)

### New Components and Hooks

#### 1. `usePositionRegistry()` hook

A React context + hook that manages a Map of `(sectionIndex, itemIndex) -> ScreenRect`. Items auto-register via `useScreenRectCallback` on mount and auto-unregister on unmount.

```tsx
// Provider at the grid root
<PositionRegistryProvider>
  <HorizontalVirtualList ...>
    {(column, colIndex) => (
      <VirtualList ...>
        {(item, itemIndex) => (
          <GridCell sectionIndex={colIndex} itemIndex={itemIndex}>
            {renderItem(item)}
          </GridCell>
        )}
      </VirtualList>
    )}
  </HorizontalVirtualList>
</PositionRegistryProvider>
```

**API:**

```ts
interface ScreenRect {
  x: number
  y: number
  width: number
  height: number
}

interface PositionRegistry {
  // Registration (called automatically by GridCell / useGridPosition)
  register(sectionIndex: number, itemIndex: number, rect: ScreenRect): void
  unregister(sectionIndex: number, itemIndex: number): void

  // Queries
  getPosition(sectionIndex: number, itemIndex: number): ScreenRect | undefined
  hasSection(sectionIndex: number): boolean
  getItemCount(sectionIndex: number): number

  // Cross-axis navigation
  findItemAtY(sectionIndex: number, targetY: number): number
  findInsertionSlot(sectionIndex: number, targetY: number): number

  // Sticky position tracking
  stickyY: number | null
  stickyX: number | null
  setStickyY(y: number): void
  setStickyX(x: number): void
  clearStickyY(): void
  clearStickyX(): void

  // Lifecycle
  clear(): void
}

// Hook
function usePositionRegistry(): PositionRegistry

// Auto-registering wrapper
function useGridPosition(sectionIndex: number, itemIndex: number): void
```

**Key difference from current `LayoutRegistry`:** The hook automatically handles cleanup via `useEffect` return. No manual `unregisterCard` calls needed — when VirtualList unmounts an item, React's cleanup fires and the position is removed. This eliminates the stale-entry bug class entirely.

#### 2. `GridCell` component (convenience wrapper)

Wraps an item and automatically registers its screen position. Minimal overhead — just a Box with `useScreenRectCallback` + `useEffect` cleanup.

```tsx
<GridCell sectionIndex={colIndex} itemIndex={cardIndex} nodeId={node.id}>
  <Card ... />
</GridCell>
```

This replaces `CardLayoutRegistrar` — same functionality, but generic and reusable.

#### 3. Cross-axis navigation helpers

Pure functions (not hooks) that query the position registry:

```ts
// Find the item in targetSection closest to the source item's Y midpoint
function findCrossAxisTarget(
  registry: PositionRegistry,
  sourceSectionIndex: number,
  sourceItemIndex: number,
  targetSectionIndex: number,
): { itemIndex: number; usedStickyY: boolean }

// Get the Y midpoint of an item's "head" region (for stickyY)
function getItemMidY(registry: PositionRegistry, sectionIndex: number, itemIndex: number): number
```

These replace `findCardAtYVisual` and `getCardMidY` from `card-positions.ts`.

### What stays in silvery vs what stays in km-tui

| Concern                                            | Location                                              | Rationale                                         |
| -------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------- |
| `PositionRegistry` (context + hook)                | silvery                                               | Generic — any 2D grid app needs position tracking |
| `GridCell` (auto-registering wrapper)              | silvery                                               | Generic convenience component                     |
| `useGridPosition` (hook)                           | silvery                                               | For apps that don't want the wrapper              |
| `findCrossAxisTarget` / `getItemMidY`              | silvery                                               | Pure functions, reusable navigation logic         |
| `stickyY` / `stickyX` state                        | silvery (inside PositionRegistry)                     | Core to cross-axis navigation UX                  |
| Column scroll offset calculation                   | silvery (already exists: `calcEdgeBasedScrollOffset`) | Already in silvery                                |
| Column width calculation                           | km-tui (`board-layout.ts`)                            | App-specific (indicator widths, separator counts) |
| `ScrollTrackingVirtualList`                        | km-tui                                                | App-specific (CursorStore integration)            |
| View-specific rendering (Board, ColumnsView, etc.) | km-tui                                                | App-level layout decisions                        |

### How HorizontalVirtualList + VirtualList compose

The existing components already compose well. The missing piece is position tracking:

```tsx
// Current km-tui pattern (simplified):
<Box flexDirection="row">
  {visibleColumns.map((col, i) => (
    <Column key={col.id} colIndex={scrollOffset + i} width={colWidth}>
      <VirtualList
        items={col.cards}
        scrollTo={isSelected ? cardIndex : undefined}
        renderItem={(card, idx) => (
          <>
            <CardLayoutRegistrar colIndex={...} cardIndex={idx} nodeId={card.id} />
            <Card ... />
          </>
        )}
      />
    </Column>
  ))}
</Box>

// Proposed pattern:
<PositionRegistryProvider>
  <Box flexDirection="row">
    {visibleColumns.map((col, i) => (
      <Column key={col.id} colIndex={scrollOffset + i} width={colWidth}>
        <VirtualList
          items={col.cards}
          scrollTo={isSelected ? cardIndex : undefined}
          renderItem={(card, idx) => (
            <GridCell sectionIndex={scrollOffset + i} itemIndex={idx}>
              <Card ... />
            </GridCell>
          )}
        />
      </Column>
    ))}
  </Box>
</PositionRegistryProvider>
```

The `GridCell` replaces `CardLayoutRegistrar` with zero behavior change but proper lifecycle management.

### Head measurement

Current code has `updateCardHead(colIndex, cardIndex, headY, headHeight)` for tracking the title row position within a card (used for stickyY calculation). This can be supported via an optional `headRef` on `GridCell`:

```tsx
<GridCell sectionIndex={colIndex} itemIndex={idx}>
  <Box>
    <Box ref={headRef}>
      {" "}
      {/* GridCell tracks this for stickyY */}
      <Text>{card.title}</Text>
    </Box>
    <Text>{card.body}</Text>
  </Box>
</GridCell>
```

Alternatively, apps can call `registry.updateHead(sectionIndex, itemIndex, headY, headHeight)` directly — same as today but with the generic API.

## Migration Path

### Phase 1: Extract PositionRegistry to silvery (non-breaking)

1. Create `src/hooks/usePositionRegistry.ts` in silvery with the `PositionRegistry` interface
2. Create `src/components/GridCell.tsx` in silvery
3. Create `src/navigation/cross-axis.ts` with `findCrossAxisTarget`, `getItemMidY`
4. Export from `silvery` main entry point
5. km-tui continues using its own `LayoutRegistry` — no changes yet

### Phase 2: Migrate km-tui to silvery primitives (incremental)

1. Wrap Board root with `<PositionRegistryProvider>`
2. Replace `CardLayoutRegistrar` with `GridCell` in `CardColumn.tsx`
3. Replace `createLayoutRegistry()` with `usePositionRegistry()` in Board
4. Replace `findCardAtYVisual` calls with `findCrossAxisTarget`
5. Replace `getCardMidY` calls with `getItemMidY`
6. Delete `card-positions.ts` (now fully replaced)

### Phase 3: Optional — Use HorizontalVirtualList for column scrolling

Currently Board.tsx does manual `columns.slice(offset, offset + maxCols)` with custom scroll indicators. This could optionally use `HorizontalVirtualList` for consistency, but it's not required — the current approach works and the manual slice gives full control over indicator rendering.

Each phase is independently shippable and testable. Phase 1 has zero risk (additive only). Phase 2 can be done one view mode at a time (cards first, then columns, then list/tabs).

## Test Strategy

### Unit tests (in silvery)

1. **PositionRegistry lifecycle**: register, unregister, clear. Verify no stale entries after unmount.
2. **findCrossAxisTarget**: Given positions in two sections, verify correct target for various stickyY values. Edge cases: empty section, single item, all items below/above target.
3. **GridCell mount/unmount**: Render a GridCell, verify it registers. Unmount, verify it unregisters. Use `createRenderer` from `silvery/testing`.
4. **Composed grid**: Render a small `HorizontalVirtualList` containing `VirtualList`s with `GridCell`s. Verify all positions are registered. Scroll horizontally, verify unmounted columns' entries are cleaned up.

### Integration tests (in km-tui)

1. **h/l navigation**: Create a board with 3+ columns of varying lengths. Navigate with h/l and verify cursor lands at correct Y position.
2. **Scroll + navigate**: Scroll a column down, then press h to move to adjacent column. Verify the target card is the one visually aligned with the source, not an off-screen card.
3. **Stale entry regression**: Rapidly scroll a column up/down while pressing h/l. Verify no stale-entry crashes or wrong-card jumps.

### Property-based tests

- For any grid configuration (N sections, M items each, variable heights), `findCrossAxisTarget` should always return an index in `[0, itemCount)` or `-1` for empty sections.
- After mounting and unmounting items in any order, the registry should contain exactly the currently-mounted items.

## API Summary

### New exports from `silvery`

```ts
// Context + hook
export { PositionRegistryProvider, usePositionRegistry } from "./hooks/usePositionRegistry"
export type { PositionRegistry, ScreenRect } from "./hooks/usePositionRegistry"

// Auto-registering wrapper
export { GridCell } from "./components/GridCell"

// Per-item hook (alternative to GridCell)
export { useGridPosition } from "./hooks/useGridPosition"

// Cross-axis navigation helpers
export { findCrossAxisTarget, getItemMidY } from "./navigation/cross-axis"
```

### Existing exports (unchanged)

```ts
export { VirtualList } from "./components/VirtualList"
export { HorizontalVirtualList } from "./components/HorizontalVirtualList"
export { calcEdgeBasedScrollOffset } from "./scroll-utils"
```

## Decisions and Trade-offs

### Composable primitives vs VirtualGrid component

**Chosen: Composable primitives.** A monolithic `VirtualGrid` would be easier to use for the simple case but harder to customize. km-tui has four view modes with different column layouts, headers, separators, and item renderers. A component-level API would need dozens of render props to cover all variations. Composable hooks + a thin wrapper component give the same safety guarantees (auto-cleanup) with full flexibility.

### Position registry in silvery vs km-tui

**Chosen: silvery.** The registry is generic infrastructure for any 2D virtualized layout. Keeping it in km-tui means every future silvery consumer must reinvent it. The stickyY/stickyX navigation pattern is terminal-UI-specific but universally useful for keyboard-driven grid navigation.

### Keying by (sectionIndex, itemIndex) vs node ID

**Chosen: (sectionIndex, itemIndex).** This matches how virtualization works — items are identified by their position in the grid, not by domain-specific IDs. The registry also stores node IDs for reverse lookup, but the primary key is positional. This avoids coupling silvery to any particular data model.

### Head measurement (for stickyY)

**Chosen: Optional explicit API.** Most grid apps don't need sub-item position tracking. km-tui does (stickyY uses the card title midpoint, not the card midpoint). Rather than building head-tracking into `GridCell`, the app calls `registry.updateHead()` from a `useScreenRectCallback` on the head element. This keeps `GridCell` simple and the head-tracking opt-in.
