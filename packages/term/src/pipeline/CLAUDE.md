# Pipeline Internals

Read this before modifying content-phase.ts, render-text.ts, render-box.ts, or layout-phase.ts. These files implement incremental rendering -- the most complex and bug-prone part of Silvery.

## Pipeline Overview

The render pipeline runs on every frame. Phases execute in strict order:

```
measure -> layout -> scroll -> sticky -> screenRect -> [notify] -> content -> output
```

| Phase       | File                 | What it does                                                                               |
| ----------- | -------------------- | ------------------------------------------------------------------------------------------ |
| measure     | measure-phase.ts     | Set Yoga constraints for fit-content nodes                                                 |
| layout      | layout-phase.ts      | Run `calculateLayout()`, propagate rects, set `prevLayout` and `subtreeDirty`              |
| scroll      | layout-phase.ts      | Calculate scroll offset, visible children, sticky positions for overflow=scroll containers |
| sticky      | layout-phase.ts      | Calculate sticky render offsets for non-scroll parents with sticky children                |
| screenRect  | layout-phase.ts      | Compute screen-relative positions (content position minus ancestor scroll offsets)         |
| notify      | layout-phase.ts      | Fire `layoutSubscribers` callbacks (drives `useContentRect`/`useScreenRect`)               |
| **content** | **content-phase.ts** | **Render nodes to a TerminalBuffer (this is the complex part)**                            |
| output      | output-phase.ts      | Diff current buffer against previous, emit minimal ANSI escape sequences                   |

Orchestrated by `executeRender()` in `pipeline/index.ts`. The scheduler (`scheduler.ts`) calls `executeRender()` and passes the previous frame's buffer for incremental rendering.

## Dirty Flags

The reconciler sets flags on nodes when props/children change. The content phase reads them to decide what to re-render. All are cleared by the content phase after processing.

| Flag            | Set by                    | Meaning                                                                                  |
| --------------- | ------------------------- | ---------------------------------------------------------------------------------------- |
| `contentDirty`  | Reconciler                | Text content or content-affecting props changed                                          |
| `paintDirty`    | Reconciler                | Visual props changed (color, bg, border). Survives measure phase clearing `contentDirty` |
| `bgDirty`       | Reconciler                | `backgroundColor` specifically changed (added, modified, or removed)                     |
| `subtreeDirty`  | Layout phase / reconciler | Some descendant has dirty flags. Node's OWN rendering may be skippable                   |
| `childrenDirty` | Reconciler                | Direct children added, removed, or reordered                                             |
| `layoutDirty`   | Reconciler                | Layout-affecting props changed; triggers Yoga recalculation                              |

The layout phase also sets `subtreeDirty` upward when a descendant's `contentRect` changes via `layoutChangedThisFrame`.

| Flag                     | Set by       | Meaning                                                                          |
| ------------------------ | ------------ | -------------------------------------------------------------------------------- |
| `layoutChangedThisFrame` | Layout phase | Node's contentRect changed this frame; cleared by content phase after processing |

## Incremental Rendering Model

This is the core optimization. Instead of rendering every node every frame, the content phase:

1. **Clones** the previous frame's buffer (the buffer the output phase already diffed)
2. **Skips** subtrees where nothing changed (their pixels are already correct in the clone)
3. **Re-renders** only dirty nodes and their affected descendants

The fast-path skip condition (all must be false to skip):

```typescript
!node.contentDirty &&
  !node.paintDirty &&
  !layoutChanged && // node.layoutChangedThisFrame
  !node.subtreeDirty &&
  !node.childrenDirty &&
  !childPositionChanged // any child's x/y differs from prevLayout
```

If `hasPrevBuffer` is false (first render or dimension change), nothing is skipped.

### Key Invariant

**Incremental render must produce identical output to a fresh render.** `SILVERY_STRICT=1` verifies this by running both and comparing cell-by-cell. Every content-phase change must be validated against this invariant.

## The hasPrevBuffer / ancestorCleared Cascade

These two flags propagate down through `renderNodeToBuffer` calls and control whether children treat the buffer as containing valid previous pixels or stale/cleared pixels.

### hasPrevBuffer

Passed to each child. When true, the child can use the fast-path skip (its pixels are intact from the previous frame). When false, the child must render even if its own flags are clean.

A parent sets `childHasPrev = false` when:

- `childrenDirty` is true (children restructured)
- `childPositionChanged` is true (sibling sizes shifted positions)
- `parentRegionChanged` is true (parent's content area was modified)

### ancestorCleared

Tells descendants that an ancestor erased the buffer at their position. This is separate from `hasPrevBuffer` because scroll containers may pass `childHasPrev=false` while the buffer still has stale pixels from the clone -- the parent cleared its own region but descendants may need to clear sub-regions.

### The Critical Formulas

These five computed values (plus two intermediates: `textPaintDirty`, `subtreeDirtyWithBg`) in `renderNodeToBuffer` control the entire incremental cascade:

```typescript
// Did this node's layout position/size change?
// Uses layoutChangedThisFrame (set by propagateLayout in layout phase)
// instead of the stale !rectEqual(prevLayout, contentRect).
layoutChanged = node.layoutChangedThisFrame

// Did the CONTENT AREA change? (excludes border-only paint changes for BOX nodes)
// textPaintDirty: for TEXT nodes, paintDirty IS a content area change (text has no borders).
//   measure phase may clear contentDirty, so paintDirty is the surviving witness.
// absoluteChildMutated: absolute child had children mount/unmount/reorder, layout change,
//   or child position shift. Forces parent to clear (removes stale overlay pixels in gap areas).
// descendantOverflowChanged: a descendant's prevLayout extended beyond THIS node's rect
//   and its layout changed. Recursive check (follows subtreeDirty paths).
textPaintDirty = node.type === "silvery-text" && node.paintDirty

contentAreaAffected =
  node.contentDirty ||
  layoutChanged ||
  childPositionChanged ||
  node.childrenDirty ||
  node.bgDirty ||
  textPaintDirty ||
  absoluteChildMutated ||
  descendantOverflowChanged

// Should we clear this node's region with inherited bg?
// Only when: buffer has stale pixels AND content area changed AND no own bg fill
parentRegionCleared = (hasPrevBuffer || ancestorCleared) && contentAreaAffected && !props.backgroundColor

// Can we skip the bg fill? Only when clone has correct bg already
// subtreeDirtyWithBg: a descendant changed inside a Box with backgroundColor.
// The bg fill must re-run to clear stale child pixels (e.g., trailing chars from
// a shrunk Text). Only applies to bg-bearing boxes when contentAreaAffected is false.
subtreeDirtyWithBg = hasPrevBuffer && !contentAreaAffected && node.subtreeDirty && !!props.backgroundColor

skipBgFill = hasPrevBuffer && !ancestorCleared && !contentAreaAffected && !subtreeDirtyWithBg

// Must children re-render? (content area was modified OR bg needs refresh on a cloned buffer)
// subtreeDirtyWithBg triggers this because bg refill overwrites child pixels — children
// must re-render on top of the fresh fill.
parentRegionChanged = (hasPrevBuffer || ancestorCleared) && (contentAreaAffected || subtreeDirtyWithBg)
```

### How the cascade propagates to children

```typescript
// Normal containers:
childHasPrev = childrenDirty || childPositionChanged || parentRegionChanged ? false : hasPrevBuffer
childAncestorCleared = parentRegionCleared || (ancestorCleared && !props.backgroundColor)
```

Key insight: a Box with `backgroundColor` **breaks** the ancestorCleared cascade. Its `renderBox` fill covers stale pixels, so children don't need to know about ancestor clears. Without this, border cells at boundaries get overwritten.

### Why contentAreaAffected is NOT needsOwnRepaint

`needsOwnRepaint` includes `paintDirty` (e.g., borderColor change). `contentAreaAffected` excludes pure paint changes because a border-only change doesn't affect the content area -- the clone already has the correct bg. Using `needsOwnRepaint` for `parentRegionChanged` caused border color changes to cascade re-renders through ~200 child nodes per Card.

### Why bgDirty exists

When `backgroundColor` changes from `"cyan"` to `undefined`, the current value is falsy but stale cyan pixels remain in the clone. `bgDirty` (set by reconciler specifically for bg changes) ensures `contentAreaAffected` is true so the region gets cleared.

## Scroll Container Three-Tier Strategy

Scroll containers (`overflow="scroll"`) have special rendering logic in `renderScrollContainerChildren`:

### Tier 1: Buffer Shift (scrollOnly)

When ONLY the scroll offset changed (no child/parent changes):

- Shift buffer contents by the scroll delta via `buffer.scrollRegion()`
- Only re-render newly exposed children at the edges
- Previously visible children keep their shifted pixels

**Unsafe with sticky children** -- sticky headers render in a second pass that overwrites first-pass content. After a shift, those overwritten pixels corrupt items at new positions. Falls back to Tier 2.

### Tier 2: Full Viewport Clear (needsViewportClear)

When children restructured, scroll offset changed with sticky children, or parent region changed:

- Clear entire viewport with inherited bg
- Re-render all visible children (childHasPrev=false)

`subtreeDirty` alone does NOT trigger viewport clear. Clearing for subtreeDirty caused a 12ms regression (re-rendering ~50 children vs 2 dirty ones).

### Tier 3: Subtree-Dirty Only

When only some descendants changed:

- Children use `hasPrevBuffer=true` and skip via fast-path if clean
- Only dirty descendants re-render

**Exception with sticky children**: When sticky children exist in Tier 3, all first-pass items are forced to re-render (`stickyForceRefresh`). This is needed because sticky headers overwrite first-pass content in a second pass -- the cloned buffer has stale content from previous frames' sticky positions that must be refreshed before the sticky pass.

## Sticky Children Two-Pass Rendering

Scroll containers with `position="sticky"` children render in two passes:

1. **First pass**: Non-sticky items, rendered with scroll offset
2. **Second pass**: Sticky headers, rendered at their computed sticky positions (hasPrevBuffer=false, ancestorCleared=false)

Order matters: sticky headers render ON TOP of first-pass content. The second pass uses `hasPrevBuffer=false` because the effective scroll offset for a sticky child can change even when the container's doesn't.

Sticky children use `ancestorCleared=false` to match fresh render semantics. On a fresh render, the buffer at sticky positions has first-pass content, not "cleared" space. Using `ancestorCleared=true` would cause transparent spacer Boxes to clear their region, wiping overlapping sticky headers rendered earlier in the second pass.

## Text Background Inheritance (inheritedBg)

Text nodes with no explicit background inherit bg from their nearest ancestor Box with `backgroundColor`. This is now done via explicit `inheritedBg` parameter passed through the render tree, computed by `findInheritedBg()` in content-phase.ts.

```typescript
// content-phase.ts: compute and pass inherited bg
const textInheritedBg = findInheritedBg(node).color
const textInheritedFg = findInheritedFg(node)
renderText(node, buffer, layout, props, nodeState, textInheritedBg, textInheritedFg, ctx)

// render-text.ts → renderGraphemes: priority chain for bg
// 1) Text's own bg  2) inheritedBg from ancestor Box  3) getCellBg buffer read (legacy fallback)
const existingBg = style.bg !== null ? style.bg : inheritedBg !== undefined ? inheritedBg : buffer.getCellBg(col, y)
```

**Why inheritedBg instead of getCellBg?** The old approach read bg from the buffer (`getCellBg`), creating a coupling between text rendering and buffer state. On incremental renders, the cloned buffer could have stale bg at positions outside the parent's bg-filled region (e.g., overflow text, moved nodes). Using `inheritedBg` from the render tree is deterministic regardless of buffer state. The `getCellBg` fallback remains only for external callers of `renderTextLine` that don't pass `inheritedBg` (e.g., scroll indicators in render-box.ts).

**stickyForceRefresh** exists because sticky headers overwrite first-pass content in a second pass, and the cloned buffer has stale content from previous frames' sticky positions. Tier 3 incremental renders need all first-pass items to re-render (with a pre-clear to null bg) to ensure the buffer matches fresh render state before the sticky pass.

Nested Text `backgroundColor` is handled separately via `BgSegment` tracking (not ANSI codes) to prevent bg bleed across wrapped text lines.

## Normal Container Three-Pass Rendering

`renderNormalChildren` uses three passes (CSS paint order):

1. **First pass**: Normal-flow children (skip sticky + absolute)
2. **Second pass**: `position="sticky"` children at computed `renderOffset` positions (when `node.stickyChildren` is present — set by `stickyPhase` for non-scroll parents)
3. **Third pass**: `position="absolute"` children (rendered on top)

Without two-pass, an absolute child rendered before a dirty normal-flow sibling would get its bg wiped by the sibling's `clearNodeRegion`.

**Second pass always uses `hasPrevBuffer=false, ancestorCleared=false`** for absolute children. The buffer at their position contains first-pass content, not previous-frame content — conceptually a fresh render. This prevents transparent overlays from clearing first-pass content via `parentRegionCleared`.

**Stale overlay pixel cleanup**: When an absolute child's structure changes (children mount/unmount, layout shifts, child positions change), `absoluteChildMutated` triggers the PARENT's `contentAreaAffected=true`. This clears the parent's entire region and forces all normal-flow children to re-render, removing stale overlay pixels from gap areas (positions not covered by any current child). This makes the incremental render match a fresh render. The cost is one full re-render per frame when overlays change — acceptable since overlay changes are user-triggered (dialog open/close) and infrequent.

## Region Clearing

When a node's content area changed but it has no `backgroundColor`, stale pixels from the clone remain visible. `clearNodeRegion` fills the node's rect with inherited bg (found by walking up ancestors via `findInheritedBg`).

When a node shrinks, the excess area (old bounds minus new bounds) is also cleared via `clearExcessArea()`. This excess clearing clips to the colored ancestor's bounds to prevent inherited bg from bleeding into sibling areas.

**Important:** Excess area clearing runs independently of `parentRegionCleared`. Even when `parentRegionCleared=false` (e.g., absolute children with `forceRepaint=true` where `hasPrevBuffer=false` + `ancestorCleared=false`), the cloned buffer still has stale pixels in the old-but-not-new area that must be cleared. This also applies to nodes WITH `backgroundColor` — `renderBox` fills only the new (smaller) region.

### Descendant Overflow Clearing

When a child overflows its parent (e.g., text content extending beyond the parent's rect with `overflow:visible`), `clearExcessArea` on the child clips to the immediate parent's content area (inside border/padding). This leaves stale pixels in ancestor border/padding areas and beyond ancestor rects.

`hasDescendantOverflowChanged()` recursively checks if any descendant's `prevLayout` extended beyond THIS node's rect and had `layoutChangedThisFrame`. When detected, `contentAreaAffected=true` triggers the node to clear its own region (restoring borders) and `clearDescendantOverflowRegions()` clears overflow beyond the node's rect.

**Why recursive?** A grandchild overflowing a child AND the grandparent must be detected at the grandparent level. If only the child detected it, clearing at the child level would overwrite the grandparent's border (parent-first rendering order: grandparent draws border → child clears overflow → border gone). By detecting at the grandparent, the grandparent clears its region, redraws its border, and the child gets `hasPrevBuffer=false` (renders fresh, no overflow clearing needed).

**Performance:** Only runs when `hasPrevBuffer && subtreeDirty`. Follows only `subtreeDirty` paths. Returns early on first match. Overflow is rare, so typically returns false after checking a few direct children.

## prevLayout and layoutChangedThisFrame

`layoutChanged` is now driven by the `layoutChangedThisFrame` flag (set by `propagateLayout` in layout phase, cleared by content phase after processing). This replaces the old `!rectEqual(prevLayout, contentRect)` which was permanently stale when layout phase skipped (no dirty nodes), causing O(N) content phase every frame.

**How it works:**

1. Layout phase: `propagateLayout` saves `node.prevLayout = node.contentRect`, recomputes rect, sets `node.layoutChangedThisFrame = !rectEqual(old, new)`
2. Content phase: reads `node.layoutChangedThisFrame` for skip decisions, clears it after processing
3. End of content phase: `syncPrevLayout` sets `prevLayout = contentRect` for all nodes, ensuring `clearExcessArea` and `hasChildPositionChanged` use correct coordinates on multi-pass doRender iterations

`prevLayout` is still used by `clearExcessArea` (old bounds for excess clearing) and `hasChildPositionChanged` (sibling position shift detection), but NOT for the primary `layoutChanged` decision.

## clearExcessArea Guards

`clearExcessArea` fills old-minus-new bounds when a node shrinks. Two guards prevent border corruption:

1. **Position-change guard**: When a node MOVED (prev.x ≠ layout.x or prev.y ≠ layout.y), clearExcessArea is skipped entirely. The right/bottom excess formulas mix new-x with old-y coordinates, creating phantom rectangles at wrong positions. The parent handles old-pixel cleanup instead.

2. **Parent border inset**: Excess clearing always clips to the immediate parent's content area (inside border/padding), even when the inherited bg comes from a colored ancestor. Without this, a child's bottom excess extends into the parent's border row and overwrites border characters with spaces.

## Common Pitfalls

1. **Transparent Boxes cascade clears.** A Box without `backgroundColor` propagates `ancestorCleared` to all descendants. A Box WITH `backgroundColor` breaks the cascade because its fill covers stale pixels. This is intentional -- don't remove the `!props.backgroundColor` check from `childAncestorCleared`.

2. **Border-only changes must not cascade.** `paintDirty` without `bgDirty` means only the border changed. This must NOT trigger `contentAreaAffected` or `parentRegionChanged`, otherwise every borderColor change cascades through the entire subtree.

3. **Buffer shift + sticky = corruption.** Never use Tier 1 (scrollRegion shift) when sticky children exist. The sticky second pass overwrites pixels that the shift assumed were final.

4. **Scroll Tier 3 + sticky = stale content.** The cloned buffer has stale content from previous frames' sticky positions. Tier 3 (no viewport clear) must force all items to re-render (`stickyForceRefresh`) and pre-clear to null bg to match fresh render state.

5. **Absolute children need ancestorCleared=false in second pass.** After the first pass, the buffer at absolute positions has correct normal-flow content. Setting ancestorCleared=true causes transparent absolute overlays to clear that content.

6. **skipBgFill is critical for subtreeDirty.** When only a descendant changed, the parent's bg fill must be skipped. Re-filling destroys child pixels that won't be repainted (they're clean and will be fast-path skipped).

7. **getCellBg coupling (mostly resolved).** Text bg inheritance now uses explicit `inheritedBg` from `findInheritedBg()` instead of reading the buffer via `getCellBg()`. This decouples text rendering from buffer state, fixing mismatches where overflow text read stale bg from the cloned buffer. The `getCellBg` fallback is still used by external callers of `renderTextLine` that don't pass `inheritedBg` (e.g., scroll indicators in render-box.ts).

8. **Descendant overflow must be detected recursively.** When a child overflows its parent and shrinks, `clearExcessArea` clips to the immediate parent's content area. If the overflow extends into a grandparent's border/padding, the grandparent must detect and handle it — otherwise a child-level clear overwrites the grandparent's border (parent-first render order). Use `hasDescendantOverflowChanged()` which follows `subtreeDirty` paths.

## Debugging

```bash
# Verify incremental vs fresh render equivalence
SILVERY_STRICT=1 bun km view /path

# Write pipeline debug output
DEBUG=silvery:* DEBUG_LOG=/tmp/silvery.log bun km view /path

# Enable instrumentation counters (exposed on globalThis.__silvery_content_detail)
SILVERY_INSTRUMENT=1 bun km view /path

# Trace which nodes cover a specific cell during incremental rendering
SILVERY_CELL_DEBUG=77,85 bun km view /path
```

The content phase has extensive instrumentation gated on `_instrumentEnabled` -- node visit/skip/render counts, cascade diagnostics, scroll container tier decisions, and per-node trace entries.

**Enriched STRICT errors**: When `SILVERY_STRICT` detects a mismatch, the `IncrementalRenderMismatchError` automatically captures content-phase stats and mismatch debug context (cell attribution, dirty flags, scroll state, fast-path analysis). The scheduler auto-enables instrumentation for the STRICT comparison render and attaches the results to the error. This eliminates the need for separate `SILVERY_INSTRUMENT` or `SILVERY_CELL_DEBUG` runs when diagnosing STRICT failures.

## Inline Incremental Rendering

In fullscreen mode, the output phase diffs prev/next buffers and emits only changed cells (~21 bytes/keystroke). In inline mode, `inlineFullRender()` regenerated the ENTIRE ANSI output from scratch every frame (~5,848 bytes at 50 items) — 280x more data per keystroke.

`inlineIncrementalRender()` brings inline mode to parity with fullscreen by diffing buffers and emitting only changed cells using relative cursor positioning.

### When incremental runs (all conditions must be met)

- `scrollbackOffset === 0` (no external stdout writes between frames)
- Buffer dimensions unchanged (`prev.width === next.width && prev.height === next.height`)
- Visible window unchanged (`startLine` is the same — when content exceeds `termRows`, the visible window shifts)
- Cursor tracking initialized (`state.prevCursorRow >= 0` — set after first render)

Content height changes (grow/shrink) are handled incrementally:

- **Growth**: `changesToAnsi` writes new content cells. Cursor extends to new bottom row using `\r\n` (which creates terminal lines). CUD (`\x1b[nB`) is NOT used past the old bottom — it's clamped and won't scroll.
- **Shrinkage**: `changesToAnsi` clears old content cells (writes spaces). Orphan lines below new content are erased with `\x1b[K`.

Falls back to `inlineFullRender()` when: scrollback offset > 0, buffer dimensions changed, visible window shifted, or cursor tracking uninitialized.

### Instance-scoped cursor tracking

Inter-frame cursor state (`InlineCursorState`) is captured in the `createOutputPhase()` closure — no module-level globals. Each `createOutputPhase()` call gets its own state. Bare `outputPhase()` calls use fresh state each time (always fall back to full render — safe default for tests).

```typescript
const render = createOutputPhase({ underlineStyles: true })
render(null, buf1, "inline") // first render → inits cursor tracking
render(buf1, buf2, "inline") // incremental (state persists in closure)

outputPhase(buf1, buf2, "inline") // bare → always full render (no shared state)
```

### Relative cursor positioning

`changesToAnsi()` accepts `mode: "inline"` to use relative cursor movement instead of absolute row positioning. Inline mode:

- Filters changes to visible range (`[startLine, startLine + maxOutputLines)`)
- Uses `renderY = y - startLine` for render-region-relative coordinates
- Uses `\x1b[NA` (cursor up), `\x1b[NB` (cursor down), `\r` (carriage return), `\x1b[NC` (cursor forward) instead of `\x1b[row;colH` (absolute)
- Resets style before cursor jumps to prevent bg bleed across gaps

Returns `ChangesResult { output: string, finalY: number }` — the final cursor position is used by `inlineIncrementalRender` to move the cursor to the bottom row before appending the cursor suffix.

### Performance

| Scenario          | Full Render | Incremental | Reduction |
| ----------------- | ----------- | ----------- | --------- |
| 10 rows, 1 change | 1,196 bytes | 42 bytes    | 28x       |
| 30 rows, 1 change | 3,540 bytes | 33 bytes    | 107x      |
| 50 rows, 1 change | 6,324 bytes | 33 bytes    | 192x      |

### Verification

- `SILVERY_STRICT_OUTPUT=1` verifies incremental ANSI output produces the same terminal state as a fresh render
- Inline incremental tests in `tests/inline-mode.test.ts` (9 tests covering guard conditions, cursor positioning, multi-frame consistency)
- Vitest benchmarks in `tests/inline-output.bench.ts`

## File Map

| File              | Responsibility                                                                                               |
| ----------------- | ------------------------------------------------------------------------------------------------------------ |
| content-phase.ts  | Tree traversal, dirty-flag evaluation, incremental cascade logic, scroll container tiers, region clearing    |
| render-box.ts     | Box bg fill (`skipBgFill` aware), border rendering, scroll indicators                                        |
| render-text.ts    | Text content collection, ANSI parsing, bg segment tracking, `inheritedBg` inheritance, bg conflict detection |
| layout-phase.ts   | Layout calculation, scroll state, screen rects, layout subscriber notification                               |
| measure-phase.ts  | Intrinsic size measurement for fit-content nodes                                                             |
| output-phase.ts   | Buffer diff, dirty row tracking, minimal ANSI output generation, inline incremental rendering                |
| render-helpers.ts | Color parsing, text width, border chars, style computation                                                   |
| helpers.ts        | Border/padding size calculation                                                                              |

## Lessons from Past Sessions

### The Big 4 Content-Phase Bugs

`SILVERY_STRICT=1` revealed 402 mismatches across the content phase. Reduced to 47 (88%) by fixing four categories:

1. **Dirty flag propagation failures** — Layout-phase changes weren't propagating `subtreeDirty` to ancestors. Added `markLayoutAncestorDirty()` helper. Without it, ~200 nodes would re-render on every border color change due to misusing `needsOwnRepaint` where `contentAreaAffected` was needed.

2. **Incorrect region clearing** — `clearNodeRegion` used wrong bounds when a node shrank. Excess clearing must clip to the colored ancestor's bounds, not the parent's bounds — otherwise inherited bg bleeds into sibling areas.

3. **Absolute position rendering** — Absolute children rendered in the wrong paint order. A dirty normal-flow sibling would wipe the absolute child's bg. Fixed with two-pass rendering (normal flow first, then absolute children on top).

4. **Text background bleed** — Nested Text `backgroundColor` leaked across wrapped lines via ANSI codes embedded in the text stream. Replaced with `BgSegment` tracking that applies bg per-segment rather than embedding ANSI state.

### Sticky Children Incremental Rendering (2026-02-12)

10/10 fuzz failures in `render-fuzz.fuzz.ts` after sticky children support was added. Three complementary fixes were needed:

1. **Tier 2 viewport clear uses inherited bg; Tier 3 stickyForceRefresh uses `bg: null`** — Originally Tier 2 cleared to `null`, but this was later changed: Tier 2 (`needsViewportClear`) now clears to `scrollBg` (the node's own `backgroundColor` or `findInheritedBg()`), which is correct because children render fresh on top. The separate `stickyForceRefresh` clear (Tier 3 with sticky children) still uses `bg: null` because it must match fresh render state before the sticky second pass. Text bg inheritance uses explicit `inheritedBg` parameter (not `getCellBg` buffer reads), so the viewport bg doesn't affect text rendering — it only matters for cells not covered by any child.

2. **`stickyForceRefresh` in Tier 3** — When sticky children exist and only `subtreeDirty` is set (Tier 3), the cloned buffer has stale content from previous frames' sticky positions. All first-pass items must re-render before the sticky second pass overwrites. Without this, stale content from old sticky positions persists.

3. **Sticky `ancestorCleared=false`** — The second pass renders sticky headers ON TOP of first-pass content. Using `ancestorCleared=true` caused transparent spacer Boxes to clear their region, wiping overlapping sticky headers rendered earlier in the same pass. Fresh render has first-pass content at sticky positions, not "cleared" space.

**Blind paths in this session:**

- Pre-clearing only current sticky positions (missed that OLD positions also had stale content)
- Setting `hasPrevBuffer=false` without clearing buffer (stale content remains in the cloned buffer regardless of hasPrevBuffer flag)
- Attempting to fix with `ancestorCleared=true` for sticky children (broke transparent overlays)

### Output Phase: True Color Row Pre-Check Bug (2026-02-24)

`diffBuffers` had a row-level pre-check: `rowMetadataEquals + rowCharsEquals → skip`. This only compared packed Uint32Array metadata and chars. When two cells both had the true-color fg/bg flag set but different actual RGB values in the Maps (fgColors/bgColors), the pre-check said "equal" and skipped the row. Result: progressive garble — characters correct but colors stale.

Fix: Added `rowExtrasEquals()` to buffer.ts that checks all Map-based data (true colors, underline colors, hyperlinks). Updated `diffBuffers` to call it as third pre-check: `rowMetadataEquals && rowCharsEquals && rowExtrasEquals → skip`.

Also fixed latent width-indexing bug: `rowMetadataEquals`/`rowCharsEquals` used `this.width`-based indexing for both buffers, wrong when widths differ (e.g., during resize). Now uses separate `otherStart = y * other.width`.

**Key insight**: SILVERY_STRICT only verifies buffer content (content phase). It cannot detect output phase bugs where the buffer is correct but ANSI generation is wrong. Use `SILVERY_STRICT_OUTPUT` or `SILVERY_STRICT_ACCUMULATE` for output phase bugs.

### Output Phase: CJK Wide Char Cursor Drift (2026-02-25)

CJK wide characters (e.g., '廈') occupy 2 terminal columns. In the buffer, col X has `wide=true` and col X+1 should have `continuation=true`. `bufferToAnsi` relies on `continuation` to skip X+1 after writing the wide char — without it, both the wide char AND the non-continuation cell are written, causing every subsequent character on the row to shift right by 1 ("cursor drift").

Two fixes applied to `output-phase.ts`:

1. **`bufferToAnsi` robustness**: After writing a wide char, unconditionally skip X+1 (`if (cell.wide) x++`) instead of relying on the next cell's `continuation` flag. This makes output correct even if the buffer has a corrupted/missing continuation cell.

2. **`diffBuffers` wide→narrow transition**: When prev buffer has `wide=true` at X and next doesn't, explicitly add X+1 to the change pool. Without this, the terminal retains the second half of the wide char at X+1 (which the buffer shows as "unchanged" since both prev and next are ' ').

**Root cause**: Various buffer operations (`clearNodeRegion`, `renderBox` bg fill, scroll viewport clear) use `buffer.fill()` which defaults `continuation=false`. If these operations overlap with a wide char's continuation cell, the continuation flag is erased. SILVERY_STRICT doesn't catch this because both fresh and incremental renders produce the same corrupted buffer — use SILVERY_STRICT_OUTPUT for output-level verification.

**SILVERY_STRICT_OUTPUT now enabled in CI** (`vitest/setup.ts`) after this fix — 3382 vendor + 2090 TUI tests pass with it.

### Text Background Bleed (BgSegment)

ANSI-embedded backgrounds (`chalk.bgBlack("text")`) inside a Box with `backgroundColor` caused bg to leak across wrapped lines. The ANSI bg state persisted across line boundaries.

Fix: `BgSegment` tracking in `render-text.ts` strips ANSI bg from text content and tracks bg ranges separately. Each line's bg is applied independently. The `bgOverride` utility from ansi allows intentional bg override where needed.

### Descendant Overflow Clearing (2026-03-12)

`IncrementalRenderMismatchError` in AI chat status bar: a TextInput node's content shrank from width=91 to width=2, where the old layout overflowed its parent (a `flexGrow` box) and its grandparent (a bordered input box). `clearExcessArea` on the TextInput clipped to the immediate parent's content area, leaving stale pixels in the grandparent's border and padding area.

**First attempt (failed):** `hasChildOverflowChanged` checking only direct children at each level. The immediate parent detected the overflow and ran `clearChildOverflowRegions`, which cleared beyond its rect — including the grandparent's border column. But the grandparent had already drawn its border in parent-first order, so the border was overwritten.

**Fix:** Made overflow detection recursive (`hasDescendantOverflowChanged`). The bordered grandparent now detects the grandchild's overflow directly, clears its own region (restoring borders), and clears overflow beyond its rect. The immediate parent gets `hasPrevBuffer=false` from the grandparent's cascade, so it renders fresh without needing its own overflow clearing.

**Key insight:** Overflow clearing must happen at the level of the ancestor whose border/padding is affected, not at the immediate parent. Parent-first render order means clearing at a child level will overwrite borders that were already drawn by ancestors.

### Output Phase: Flag Emoji Cursor Drift (2026-03-12)

Flag emoji (🇨🇦) are regional indicator sequences (U+1F1E6..U+1F1FF pairs). Some terminals (xterm.js headless, older terminals) treat them as two width-1 chars instead of one width-2 char. The buffer models them correctly as one wide cell + one continuation cell, but the terminal cursor advances differently.

**Symptom**: After j+l navigation at 200+ cols on a board with flag emoji in the title, the first column shows duplicate card content, stale border fragments, and overlapping cards. Only manifests at wide terminals because the title bar (with flag emoji) is on the same row as the garbled content.

**Why SILVERY_STRICT didn't catch it**: STRICT compares buffer content (content phase), which is correct. The bug is in the output phase — ANSI generation creates terminal state that diverges from the buffer. SILVERY_STRICT_OUTPUT uses `replayAnsiWithStyles` which has the same width assumption as the buffer (returns 2 for flag emoji), so it agrees with the buffer. Only feeding ANSI through a real xterm.js terminal emulator (`@termless/xtermjs`) reveals the divergence.

**Fix**: Two complementary changes to `output-phase.ts`:
1. `isFlagSequence()` added to `wrapTextSizing` — wraps flag emoji in OSC 66 to force width 2 (for terminals supporting text sizing protocol).
2. Cursor re-sync added to `bufferToAnsi` after every wide char — emits explicit CUP to re-sync the terminal cursor, matching the existing re-sync in `changesToAnsi`. After `x++` (skip continuation), CUP targets `x + 2` (1-indexed) = next cell position.

**Key insight**: `bufferToAnsi` (full render) creates the initial terminal state. If that state diverges from the buffer due to width disagreement, subsequent `changesToAnsi` (incremental) renders use CUP for changed cells (correct), but unchanged cells retain the shifted positions from the full render — creating visible garble where old and new content overlap.

## Common Blind Paths

| Blind Path                                    | Why It Doesn't Work                                                            | What to Do Instead                                                                           |
| --------------------------------------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| Broader viewport clearing                     | Causes 12ms regression (re-renders ~50 children vs 2 dirty ones)               | Only clear viewport for Tier 2 triggers (childrenDirty, scroll+sticky, parentRegionChanged)  |
| Using `needsOwnRepaint` for cascade           | Includes `paintDirty`; border color changes cascade through ~200 child nodes   | Use `contentAreaAffected` — excludes pure paint changes                                      |
| Pre-clearing only current sticky positions    | Old positions also have stale content in the buffer                            | Clear entire viewport to `null` bg                                                           |
| `hasPrevBuffer=false` without clearing buffer | Stale content remains in the cloned buffer regardless of hasPrevBuffer flag    | Clear viewport first, then set `hasPrevBuffer=false`                                         |
| `ancestorCleared=true` for sticky second pass | Transparent spacer Boxes clear their region, wiping overlapping sticky content | Use `ancestorCleared=false` — matches fresh render semantics                                 |
| Blaming the terminal emulator                 | If 3 terminals show the same glitch, it's your code                            | Use `withDiagnostics` + `SILVERY_STRICT=1` first                                             |
| Hand-rolling VirtualTerminal tests            | Too simple to catch real app complexity                                        | Use `withDiagnostics(createBoardDriver(...))`                                                |
| Reading code paths without a failing test     | Wastes 20+ turns on theorizing                                                 | Write failing test first, THEN trace code                                                    |
| Row pre-check: only packed metadata + chars   | Misses true-color Map diffs (fgColors/bgColors) when both cells have TC flag   | Always include `rowExtrasEquals()` in the row pre-check                                      |
| Clearing overflow at immediate parent only    | Child-level clear overwrites grandparent's border (parent-first render order)  | Use recursive `hasDescendantOverflowChanged` so the bordered ancestor detects and handles it |

## Effective Strategies (Priority Order)

1. **`SILVERY_STRICT=1`** — Run the app or tests. Catches any incremental vs fresh render divergence immediately. Always start here.

2. **Write a failing fuzz seed test** — If fuzz found it, extract the seed. If user-reported, construct a `withDiagnostics(createBoardDriver(...))` test with the minimal reproduction steps.

3. **Read the mismatch error output** — The enhanced error includes cell values, node path, dirty flags, scroll context, and fast-path analysis. This tells you exactly which node diverged and why it was skipped.

4. **`SILVERY_INSTRUMENT=1`** — Exposes skip/render counts, cascade depth, scroll tier decisions on `globalThis.__silvery_content_detail`. Useful for understanding whether too many or too few nodes rendered.

5. **Check the five critical formulas** — `layoutChanged`, `contentAreaAffected`, `parentRegionCleared`, `skipBgFill`, `parentRegionChanged` in `renderNodeToBuffer`. If any is wrong, the cascade propagates errors to the entire subtree.

6. **Text bg inheritance awareness** — Text nodes inherit bg via `inheritedBg` (from `findInheritedBg`), not buffer reads. However, viewport clears and region clears still affect buffer state, which matters for the `getCellBg` legacy fallback (used by scroll indicators). If your fix clears a region, verify it clears to the correct bg (usually `null` to match fresh render state).

7. **Parallel hypothesis testing** — When multiple hypotheses exist (dirty flag issue vs scroll tier issue vs bg inheritance issue), launch parallel sub-agents to test each with a targeted test.

## Symptom → Check Cross-Reference

| Symptom                                                    | Check First                                                                                                                    |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Stale background color persists                            | `bgDirty` flag; `inheritedBg` from `findInheritedBg`; is region being cleared?                                                 |
| Border artifacts after color change                        | `paintDirty` vs `contentAreaAffected` distinction; border-only change should NOT cascade                                       |
| Scroll glitch (content jumps/disappears)                   | Scroll tier selection; Tier 1 unsafe with sticky; Tier 3 needs `stickyForceRefresh`                                            |
| Children blank after parent changes                        | `parentRegionChanged` → `childHasPrev=false`; is viewport clear setting `childHasPrev` correctly?                              |
| Absolute child disappears                                  | Two-pass rendering order; absolute children need `ancestorCleared=false` in second pass                                        |
| Content correct initially, wrong after navigation          | Incremental rendering bug; `SILVERY_STRICT=1` will catch it                                                                    |
| Colors wrong but characters correct (garble)               | Output phase: `diffBuffers` row pre-check skipping true-color Map diffs; check `rowExtrasEquals`                               |
| Text bg different from parent Box bg                       | `inheritedBg` from `findInheritedBg`; check if ancestor Box has `backgroundColor`; check region clearing                       |
| Flickering on every render                                 | Check `layoutChangedThisFrame` flag; verify `syncPrevLayout` runs at end of content phase                                      |
| Stale overlay pixels after shrink (black area)             | `clearExcessArea` not called; check `parentRegionCleared` + `forceRepaint` interaction                                         |
| CJK/wide char garble, text shifts right                    | `bufferToAnsi` cursor drift: wide char without continuation at col+1. Run `SILVERY_STRICT_OUTPUT=1`                            |
| Flag emoji garble at wide terminals (200+ cols)            | `bufferToAnsi`/`changesToAnsi` cursor re-sync after wide chars; `wrapTextSizing` must include flag emoji (`isFlagSequence`)    |
| Stale chars in ancestor border/padding after child shrinks | Descendant overflow: `clearExcessArea` clips to immediate parent. Use `hasDescendantOverflowChanged()` for recursive detection |

## Quick Regression Test Template

When a fuzz test or user report identifies a rendering bug, use this template to write a minimal regression test:

```typescript
import { describe, test, expect } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, Text } from "silvery"

describe("regression: <brief description>", () => {
  test("fuzz seed <N> - <what broke>", async () => {
    const render = createRenderer({ cols: 80, rows: 24 })

    // Minimal component that reproduces the layout structure
    function App({ state }: { state: number }) {
      return (
        <Box flexDirection="column">
          {/* Mirror the component structure from the failing scenario */}
          <Box overflow="scroll" height={10}>
            <Box backgroundColor="blue">
              <Text>Header</Text>
            </Box>
            <Text>Content {state}</Text>
          </Box>
        </Box>
      )
    }

    const app = render(<App state={0} />)

    // Step 1: Initial render (establishes buffer for incremental)
    expect(app.text).toContain("Content 0")

    // Step 2: Trigger the state change that caused the mismatch
    app.rerender(<App state={1} />)

    // Step 3: Verify the content is correct (SILVERY_STRICT auto-checks buffer)
    expect(app.text).toContain("Content 1")
  })
})
```

For `withDiagnostics` driver tests (full app):

```typescript
import { describe, test } from "vitest"
import { createBoardDriver } from "@km/tui/driver.ts"
import { createFakeRepo } from "@km/storage"
import { withDiagnostics } from "silvery"
import { item } from "@km/tui/tests/helpers/board-test.ts"

describe("regression: <brief description>", () => {
  test("repro from fuzz/user report", async () => {
    const nodes = item.root("board", item("Column 1", item("Task A"), item("Task B")), item("Column 2", item("Task C")))
    const driver = withDiagnostics(createBoardDriver(createFakeRepo({ nodes }), "board"), {
      checkIncremental: true,
      checkReplay: true,
      checkStability: true,
    })

    // Reproduce the sequence that triggered the bug
    await driver.cmd.down()
    await driver.cmd.down()
    // Diagnostics auto-check after each command — throws on mismatch
  })
})
```
