> **See [RENDERING.md](RENDERING.md) for the complete step-by-step rendering algorithm and test coverage map.**
> This file (CLAUDE.md) covers the render phase internals. RENDERING.md covers the full pipeline end-to-end.

# Pipeline Internals

Read this before modifying render-phase.ts, render-text.ts, render-box.ts, or layout-phase.ts. These files implement incremental rendering -- the most complex and bug-prone part of Silvery.

## Mandatory: Test Before Change

**Every pipeline change MUST have a SILVERY_STRICT test that exercises the new behavior before the change is committed.** Write the test first, verify the mismatch, then fix. Pipeline bugs are invisible without STRICT — they produce correct first renders but wrong incremental renders.

**Tests MUST use realistic-scale fixtures (50+ nodes), not 2-3 node toy components.** Many pipeline bugs only compound at scale — false-positive dirty cascades, stack overflows from recursive walks, cumulative paint errors. Synthetic micro-tests pass while real apps crash. See `tests/features/outline-realistic-scale.test.tsx` for the canonical pattern.

**Verification has two layers:**

1. STRICT vendor tests pass (including the realistic-scale fixture)
2. `SILVERY_STRICT=2 bun km view <vault>` (from the host repo root) runs without crashes for 5+ seconds

Skipping layer 2 ships bugs that synthetic tests miss. Both layers are required.

**Agent escalation:** If you are a non-silvery agent editing pipeline files, spawn `Agent(subagent_type: "silvery")` instead. The silvery expert reads this doc + RENDERING.md + LESSONS.md first. Direct pipeline edits without this context cause incremental cascade bugs.

## Pipeline Overview

The render pipeline runs on every frame. Phases execute in strict order:

```
measure -> layout -> scroll -> sticky -> scrollRect -> [notify] -> content -> decoration -> output
```

| Phase          | File                    | What it does                                                                               |
| -------------- | ----------------------- | ------------------------------------------------------------------------------------------ |
| measure        | measure-phase.ts        | Set Yoga constraints for fit-content nodes                                                 |
| layout         | layout-phase.ts         | Run `calculateLayout()`, propagate rects, set `prevLayout` and `subtreeDirty`              |
| scroll         | layout-phase.ts         | Calculate scroll offset, visible children, sticky positions for overflow=scroll containers |
| sticky         | layout-phase.ts         | Calculate sticky render offsets for non-scroll parents with sticky children                |
| scrollRect     | layout-phase.ts         | Compute screen-relative positions (content position minus ancestor scroll offsets)         |
| notify         | layout-phase.ts         | Sync rect signals via `syncRectSignals()` (drives `useBoxRect`/`useScrollRect`)            |
| **content**    | **render-phase.ts**     | **Render nodes to a TerminalBuffer (this is the complex part)**                            |
| **decoration** | **decoration-phase.ts** | **Draw outlines (outside-node overlays) and snapshot under-cells for next-frame restore**  |
| output         | output-phase.ts         | Diff current buffer against previous, emit minimal ANSI escape sequences                   |

The **decoration phase** is separate from content so overlays that draw OUTSIDE their owning node's rect (currently: outlines) don't have to participate in the per-node incremental cascade. Before the content phase runs, `clearPreviousOutlines` restores cells under last frame's outlines from snapshots carried on the `RenderPostState` carrier (see [`render-post-state.ts`](render-post-state.ts)). After content, `renderDecorationPass` walks the tree, draws outlines, and captures fresh snapshots into the same carrier for the next frame. This makes outline removal "just work" — the decoration pass redraws every frame, so there's no false-positive cascade to debug.

### Carrier ownership — load-bearing for per-frame-Ag callers

The `RenderPostState` carrier MUST persist across frames. It defaults to a per-`createAg` instance field (`_postState`), which is correct for **long-lived-Ag callers** that reuse the same `Ag` across frames (`runtime/renderer.ts`, plugin-style hosts).

For **per-frame-Ag callers** that throw away the `Ag` after every render (the test driver `renderer.ts`, `scheduler.ts`), the Ag-internal default fails silently: every frame's carrier starts empty, `clearPreviousOutlines` finds no snapshots to restore, and stale outline pixels carried in via `prevBuffer.clone()` leak through. STRICT diverges immediately (incremental keeps the prior outline, fresh has blanks).

Such callers MUST hold the carrier at the instance level alongside `prevBuffer` and pass it explicitly via `ag.render({ prevBuffer, postState })`:

```ts
// renderer.ts / scheduler.ts pattern:
class RenderInstance {
  prevBuffer: TerminalBuffer | null = null
  postState: RenderPostState = createRenderPostState()
}

// Each frame:
const ag = createAg(this.root)
ag.layout(...)
ag.render({ prevBuffer: this.prevBuffer, postState: this.postState })
//                                       ^^^^^^^^^^^^^^^^^^^^^^^^
// Same reference every frame → snapshots survive Ag recycle.

// On resize / clear / pause:
this.prevBuffer = null
this.postState = createRenderPostState()  // ALWAYS reset together — coordinates
                                          // reference the discarded buffer.
```

Reset rule: `postState` is buffer-coordinate-bound. Whenever `prevBuffer` is cleared (resize, pause, clear, unmount), `postState` MUST be reset alongside, otherwise the next `clearPreviousOutlines` writes at out-of-bounds coordinates from old dimensions.

For STRICT comparisons, the fresh-render path must NOT read from or write to the incremental path's carrier. Either pass `{ fresh: true }` to `ag.render()` (which substitutes a throw-away empty carrier) or supply a fresh `createRenderPostState()` explicitly. Both renderer.ts (`doFreshRenderFull` → `runPipeline(..., { fresh: true })`) and scheduler.ts (STRICT `doFreshRender` → `freshAg.render({ fresh: true })`) take this path.

**Bead history**: km-silvery.outline-incremental-clear (2026-04-28) — STRICT mismatch when child outline toggled off; root cause was renderer/scheduler creating fresh `Ag` per frame without exposing `_postState`. Fix: `AgRenderOptions.postState` + `AgRenderResult.postState`, instance-level carriers in both call sites. Same shape as km-yej6 (column-resize STRICT mismatch) — a second class of incremental-vs-fresh divergence caused by per-frame state living on a transient object instead of the long-lived caller.

> **Note:** TerminalBuffer is the internal mutable representation. The public read API is `TextFrame` (created via `createTextFrame(buffer)` in `buffer.ts`), which provides an immutable snapshot with resolved RGB colors that preserve palette provenance (`FrameCell.fg`/`bg` = `{ r, g, b, index? }` — indexed colors keep their origin slot so they re-emit as `38;5;N`, not a truecolor bake). App structurally implements TextFrame. `Term.paint(buffer, prev)` wraps the output phase and stores a TextFrame as `term.frame`. `RenderAdapter` is internal — use `term.paint()` for the public paint API.

Orchestrated by `createAg()` in `ag.ts`. Callers (scheduler, renderer, create-app) use `createAg` directly — `ag.layout()` + `ag.render()` — then run the output phase separately.

## Post-Content Fade Passes (backdrop + subtree)

Two fade passes run in `ag.ts` doRender AFTER the content + decoration phases, BEFORE output — NOT inside the render walk:

| Pass          | Marker               | Geometry                                                                     | Module                     |
| ------------- | -------------------- | ---------------------------------------------------------------------------- | -------------------------- |
| backdrop fade | `data-backdrop-fade` | final-buffer rectangle; `data-backdrop-fade-excluded` cuts a modal hole      | `pipeline/backdrop/`       |
| subtree fade  | `data-subtree-fade`  | tree-scoped (the marked subtree's `screenRect`); foreign overlays stay crisp | `pipeline/subtree-fade.ts` |

**The load-bearing invariant: the carry-forward buffer must be captured PRE-fade.** Both passes are NON-IDEMPOTENT cell transforms (`fadeCell` darkens again on a second application). `ag.ts` snapshots `carryForwardBuffer = buffer.clone()` BEFORE applying either pass and stores it as `_prevBuffer`, so the next incremental frame clones pre-fade pixels and the pass recomputes a single fade. If the carry-forward were post-fade, a dimmed cell that fast-path skips (or a multi-pass convergence iteration) would re-fade the already-faded clone and compound one dim per frame — the `@si/render/20517` signature (STRICT `incremental≠fresh` at a dimmed blank cell). The pass is decoupled from the walk: it runs over tree-collected geometry EVERY frame regardless of which nodes the incremental walk rendered, so skip asymmetry can't make it diverge.

**Why subtree fade is NOT a during-walk paint op (history):** it used to run inside the walk via `sink.emitFadeRegion`, which forced the non-backdrop `else` branch to capture the carry-forward POST-fade. It was reworked into a backdrop-style post-content pass in 20517. Subtree fade's exclude semantics are the INVERSE of backdrop's (`realizeSubtreeFadeToBuffer` SUBTRACTS foreign-overlay painted regions from the pane, vs `forEachBackdropCell` fading OUTSIDE the exclude union). A root overlay crossing a dimmed pane stays crisp because only its PAINTED nodes (bg boxes + text) are excluded — a transparent wrapper paints nothing, so the pane still fades behind it.

## Dirty Flags

The reconciler sets flags on nodes when props/children change. The render phase reads them to decide what to re-render. All are cleared by the render phase after processing.

| Flag              | Set by                    | Meaning                                                                                  |
| ----------------- | ------------------------- | ---------------------------------------------------------------------------------------- |
| `contentDirty`    | Reconciler                | Text content or content-affecting props changed                                          |
| `stylePropsDirty` | Reconciler                | Visual props changed (color, bg, border). Survives measure phase clearing `contentDirty` |
| `bgDirty`         | Reconciler                | `backgroundColor` specifically changed (added, modified, or removed)                     |
| `subtreeDirty`    | Layout phase / reconciler | Some descendant has dirty flags. Node's OWN rendering may be skippable                   |
| `childrenDirty`   | Reconciler                | Direct children added, removed, or reordered                                             |

Layout-affecting prop changes call `node.layoutNode.markDirty()` directly — Flexily's `isDirty()` propagation to root is the sole layout gate. No silvery-side layout dirty flag exists (Phase 1 of reactive-pipeline refactor deleted it).

The layout phase also sets `subtreeDirty` upward when a descendant's `boxRect` changes via `layoutChangedThisFrame`.

### The epoch belongs to ONE tree — never the process

The flags above are not booleans. They are epoch stamps: the reconciler writes `node.dirtyEpoch` with the current epoch, and `isDirty(node, BIT)` only reports true while that stamp still equals the epoch. `renderPhase` ends with `advanceRenderEpoch(root)`, which is what makes clearing O(1).

**That counter lives on the tree's `EpochOwner` (`node.epochOwner`), and two trees must never share one.** A process-global counter is indistinguishable from a correct one while a single renderer runs, and silently wrong the moment a second exists. The window is real because React's commit and the pipeline are separate steps — `updateContainerSync` + `flushSyncWork` stamp the bits, `doRender()` consumes them afterwards. A peer renderer that completes a frame in between advances the shared counter, the victim's changed nodes read clean, the fast-path skip keeps their cloned pixels, and the previous frame survives on screen as residue. `yrd watch` hit exactly this: stale glyphs accumulating in the rightmost columns (`@km/silvery/render-no-stale-residue-invariant`).

The same reasoning covers `dirty-tracking.ts`'s node sets, which are also per-tree and cleared once per pass — `hasScrollDirty(root)` gates the layout phase, so a peer clearing it leaves a tree painting at stale scroll offsets.

Rules for pipeline code:

- Never reintroduce a module-level epoch, dirty set, "current frame" counter, or terminal-capability mirror. Reach per-tree state through the node (`node.epochOwner`) and per-render state through `ctx: PipelineContext`, never through a scoped save/restore global — the framework's structural-ownership rule (root `CLAUDE.md`, `wasRaw` anti-pattern) applies here too.
- Node literals must set `epochOwner`. React-created nodes inherit it from `rootContainer.root.epochOwner` in `createInstance` / `createTextInstance`, so every node is born into the tree that renders it and no adoption pass is needed.
- Regression pin: `tests/features/residue-cross-render.test.tsx` — a peer renderer drives a frame from the subject's layout effect (inside the commit→pipeline window) and STRICT must stay green.

### The color level is per render, for the same reason

`ctx.colorLevel` carries the tier from `caps.colorLevel` through `createPipeline` → `PipelineConfig` → `createAg` → `PipelineContext`, and `parseColor(color, colorLevel)` / `getTextStyle(props, colorLevel)` take it as an argument. It used to be a module-level `_activeColorLevel` that `createPipeline()` assigned.

That assignment happens at app construction and on cap re-detection — never per frame — so nothing re-established it before a render read it, and with two apps in one process the one constructed LAST chose the tier for BOTH. The damage is asymmetric and easy to misread: the OUTPUT phase holds `colorLevel` per instance in a closure and kept stripping color correctly *at mono*, so a mono app that lost the tier also lost the SGR attrs (`$fg-accent` → italic+bold, `$fg-muted` → dim) that carry its hierarchy — flat, undifferentiated output rather than an obviously wrong color. In the other direction a truecolor app next to a mono one lost every `$token` color.

### The output phase owns tier serialization — the render phase never quantizes

Only `"mono"` is visible to the render phase: `parseColor` returns `null` for a `$token` at mono and `getTextStyle` injects the attrs instead. At every other tier the render phase stores the **canonical hex** in the cell, unchanged — a cell painted at `ansi16` and the same cell painted at `truecolor` compare equal, which is what keeps STRICT's incremental≡fresh buffer comparison tier-independent. Choosing truecolor vs. 256 vs. 4-bit SGR is the output phase's job and happens nowhere else.

That split has one failure mode, and it has already fired: `buffer.ts` and `output-phase.ts` each carry a style→SGR serializer pair (`styleToAnsiCodes`/`styleTransitionCodes` and `styleToAnsi`/`styleTransition`), and only the first honored the tier. The pipeline's own pair called `fgColorCode`/`bgColorCode` directly, which always emit `38;2;R;G;B` — so an `ansi16` terminal was sent truecolor it cannot parse, while `bufferToAnsi`'s sibling in `buffer.ts` had been quantizing correctly the whole time. Note the shape: **STRICT cannot see this class.** It compares buffers, and the buffers were identical at every tier; the defect lived entirely downstream of the comparison. `SILVERY_STRICT_TERMINAL` (which replays the emitted ANSI through an emulator) is the only verifier below the buffer.

- Every SGR color emission goes through `foregroundCode` / `backgroundCode` / `underlineColorCode` (exported from `buffer.ts`), which take `colorLevel`. Calling `fgColorCode` / `bgColorCode` from `ansi/sgr-codes` anywhere on a render path is the bug — those are the truecolor-only leaves those three wrap.
- A tier-sensitive change needs a `SILVERY_STRICT_TERMINAL` run, not just `SILVERY_STRICT=1`. Regression pin: `tests/features/run-color-level.test.tsx` asserts no `38;2;`/`38;5;` survives at `ansi16` for inline hex and `$tokens` alike.
- Quantization *quality* is not this layer's problem: `nearestAnsi16` (`packages/ansi/src/color-maps.ts`) picks by plain squared RGB distance, so desaturated colors collapse toward the grey axis (`#bf616a` → SGR 90, `#88c0d0` → SGR 37). Correct tier, debatable color — do not "fix" that here.

- New `parseColor` / `getTextStyle` call sites inside the pipeline must pass `ctx?.colorLevel`. The parameter defaults to `DEFAULT_COLOR_LEVEL` ("truecolor") so leaf helpers stay callable from non-pipeline code (`selection-renderer`, `terminal-adapter`), which means **the typechecker will not catch a forgotten thread** — the mono path is the one that degrades silently.
- Any new `createAg` call on a real render path must thread `colorLevel` from its `PipelineConfig`, or the tier stops at the Ag boundary.
- `createRenderer({ colorLevel })` selects the tier in tests; `isStore()` must keep excluding it, or `{ cols, rows, colorLevel }` is misread as a `Store` and the option is dropped on the floor.
- Regression pin: `tests/features/color-level-cross-render.test.tsx` — a mono app and a truecolor app in one process, each asserted after the other exists.

| Flag                     | Set by       | Meaning                                                                     |
| ------------------------ | ------------ | --------------------------------------------------------------------------- |
| `layoutChangedThisFrame` | Layout phase | Node's boxRect changed this frame; cleared by render phase after processing |

## Style-Only Tracking

The reconciler tracks nodes where ONLY visual style props changed (no content, layout, or children changes) in a module-level `styleOnlyDirtyNodes` set (dirty-tracking.ts). This enables two fast paths in the render phase:

| Tracking set          | Set by                  | Read by                       | Cleared by           |
| --------------------- | ----------------------- | ----------------------------- | -------------------- |
| `styleOnlyDirtyNodes` | Reconciler commitUpdate | Render phase (text fast path) | clearDirtyTracking() |

**Safety:** The reconciler checks `!instance.contentDirty && !instance.childrenDirty` before tracking style-only. React processes children before parents in the commit phase, so a child's `commitTextUpdate` may have already set `contentDirty` on the parent before the parent's `commitUpdate` runs.

## Incremental Rendering Model

This is the core optimization. Instead of rendering every node every frame, the render phase:

1. **Clones** the previous frame's buffer (the buffer the output phase already diffed)
2. **Skips** subtrees where nothing changed (their pixels are already correct in the clone)
3. **Re-renders** only dirty nodes and their affected descendants

The fast-path skip condition (all must be false to skip):

```typescript
!node.contentDirty &&
  !node.stylePropsDirty &&
  !layoutChanged && // node.layoutChangedThisFrame
  !node.subtreeDirty &&
  !node.childrenDirty &&
  !childPositionChanged && // any child's x/y differs from prevLayout
  !ancestorLayoutChanged && // any ancestor had layoutChangedThisFrame
  !scrollOffsetChanged // scroll container offset !== prevOffset (defensive)
```

If `hasPrevBuffer` is false (first render or dimension change), nothing is skipped.

### Key Invariant

**Incremental render must produce identical output to a fresh render.** `SILVERY_STRICT=1` verifies this by running both and comparing cell-by-cell. Every render-phase change must be validated against this invariant.

## The hasPrevBuffer / ancestorCleared / ancestorLayoutChanged Cascade

These three flags propagate down through `renderNodeToBuffer` calls and control whether children treat the buffer as containing valid previous pixels or stale/cleared pixels.

### hasPrevBuffer

Passed to each child. When true, the child can use the fast-path skip (its pixels are intact from the previous frame). When false, the child must render even if its own flags are clean.

A parent sets `childHasPrev = false` when:

- `childrenDirty` is true (children restructured)
- `childPositionChanged` is true (sibling sizes shifted positions)
- `childrenNeedFreshRender` is true (parent's content area was modified)

### ancestorCleared

Tells descendants that an ancestor erased the buffer at their position. This is separate from `hasPrevBuffer` because scroll containers may pass `childHasPrev=false` while the buffer still has stale pixels from the clone -- the parent cleared its own region but descendants may need to clear sub-regions.

### ancestorLayoutChanged

Tells descendants that an ancestor's layout position/size changed this frame. Propagated as `childAncestorLayoutChanged = node.layoutChangedThisFrame || ancestorLayoutChanged`. When true, the descendant's pixels in the cloned buffer may be at wrong coordinates even if its own dirty flags are clean. This is a safety net in the skip condition -- normally the `hasPrevBuffer=false` cascade handles re-rendering, but `ancestorLayoutChanged` catches edge cases where the cascade doesn't fully propagate (e.g., a parent with `backgroundColor` that breaks the `ancestorCleared` chain without setting `childrenNeedFreshRender`).

### The Critical Formulas

These cascade values (plus intermediates such as `textPaintDirty` and
`bgRefillNeeded`) in `renderNodeToBuffer` control the entire incremental
cascade:

```typescript
// Did this node's layout position/size change?
// Uses layoutChangedThisFrame (set by propagateLayout in layout phase)
// instead of the stale !rectEqual(prevLayout, boxRect).
layoutChanged = node.layoutChangedThisFrame

// Did the CONTENT AREA change? (excludes border-only paint changes for BOX nodes)
// textPaintDirty: for TEXT nodes, stylePropsDirty IS a content area change (text has no borders).
//   measure phase may clear contentDirty, so stylePropsDirty is the surviving witness.
// absoluteChildMutated: absolute child had children mount/unmount/reorder, layout change,
//   or child position shift. Forces parent to clear (removes stale overlay pixels in gap areas).
// descendantOverflowChanged: a descendant's prevLayout extended beyond THIS node's rect
//   and its layout changed. Recursive check (follows subtreeDirty paths).
// NOTE: outlines are NOT in contentAreaAffected — they're handled by the
// decoration phase (see decoration-phase.ts) which redraws outlines every
// frame and uses per-cell snapshots to clear previous positions.
textPaintDirty = node.type === "silvery-text" && node.stylePropsDirty

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
contentRegionCleared =
  (hasPrevBuffer || ancestorCleared) && contentAreaAffected && !props.backgroundColor

// Can we skip the bg fill? Only when clone has correct bg already
// bgRefillNeeded: a descendant changed inside a Box with backgroundColor.
// The ancestor bg stays cloned; dirty descendants repaint/clear their own cells.
// Only applies to bg-bearing boxes when contentAreaAffected is false.
bgRefillNeeded =
  hasPrevBuffer && !contentAreaAffected && node.subtreeDirty && !!props.backgroundColor

skipBgFill = hasPrevBuffer && !ancestorCleared && !contentAreaAffected

// bgOnlyChange: bgDirty is the ONLY trigger for contentAreaAffected, node has bg,
// no ancestor changes. Uses fillBg() to preserve child chars — children skip.
bgOnlyAffected =
  bgDirty &&
  !contentDirty &&
  !layoutChanged &&
  !childPositionChanged &&
  !childrenDirty &&
  !textPaintDirty &&
  !absoluteChildMutated &&
  !descendantOverflowChanged
bgOnlyChange =
  hasPrevBuffer && bgOnlyAffected && hasBgColor && !ancestorLayoutChanged && !ancestorCleared

// Must children re-render? Parent content area modification forces child repaint.
// bgRefillNeeded is descendant-only dirtiness: clean children keep cloned cells,
// dirty descendants repaint/clear their own regions.
// Exception: bgOnlyChange uses fillBg() which preserves chars, so children skip.
childrenNeedFreshRender = (hasPrevBuffer || ancestorCleared) && contentAreaAffected && !bgOnlyChange
```

## Style-Only Fast Paths

Two optimizations for style-only changes (cursor move, selection highlight, hover):

### 1. bgOnlyChange — Box Background Fast Path

When ONLY `backgroundColor` changed on a Box node (no content, layout, or children changes):

- `renderBox` uses `buffer.fillBg()` instead of `buffer.fill()` for the bg
- `fillBg()` updates cell bg WITHOUT overwriting chars (preserves child content)
- `childrenNeedFreshRender = false` — clean children keep correct chars from clone
- Children's bg is updated by `fillBg()` (they inherit from parent)

**Disabled when:**

- Any descendant has explicit `backgroundColor` (would be incorrectly overwritten)
- `ancestorLayoutChanged` or `ancestorCleared` (children positions may be wrong)
- Other `contentAreaAffected` triggers (content, layout, children, etc.)

### 2. Text Style-Only Restyle (per-segment)

When a Text node's visual style changed but its rendered content is identical
(cursor/selection color toggle on a colored title), `renderText(styleOnly=true)`
restyles existing cells in place PER CHILD SPAN instead of re-running the
pipeline:

- `restyleTextSegments` (render-text.ts): fills the content region with the
  base style (`mergeAnsiStyle(base, ∅)` — parent's own text + gaps), the
  trailing pad with the clear-cell style, then each nested run's resolved style
  (`mergeAnsiStyle(base, parse(styleToAnsi(span.context)))`) over its cell range.
  Skips `renderGraphemes` (the Intl.Segmenter + per-cell emit). Routes through
  `sink.emitRestyleRegion` so the op is captured by the render plan.
- Each run's resolved style reproduces the full path's `mergeAnsiStyle` exactly,
  so SILVERY_STRICT incremental≡fresh holds — including nested per-run colors,
  which the OLD whole-rect `restyleRegion` clobbered (why it was disabled).

**Why dirty bits can't gate it:** the reconciler re-dirties virtual text
children (CHILDREN + SUBTREE + per-child CONTENT) on a parent style change even
when the text is byte-identical. The gate instead compares a per-node plain-text
signature (`_textContentSigs` in render-phase.ts) to the previous frame's; equal

- `stylePropsDirty` ⇒ a pure restyle.

**Disabled when (falls back to full renderText):**

- Plain text content changed (signature differs) or `!hasPrevBuffer`
- `bgDirty`, `ancestorCleared`, `ancestorLayoutChanged`, or own `layoutChanged`
- A truncate hook / `internal_transform` is present (output not in the signature)
- No nested runs (`childSpans.length === 0`) — plain text keeps base transform
  attrs (`inverse`) via `renderGraphemes`, which `mergeAnsiStyle` would drop
- Nested children with `backgroundColor`, or the Text has its own `backgroundColor`
- An ellipsis truncation marker was inserted (a content cell with a special color)

### How the cascade propagates to children

```typescript
// Normal containers:
childHasPrev =
  childrenDirty || childPositionChanged || childrenNeedFreshRender ? false : hasPrevBuffer
childAncestorCleared = contentRegionCleared || (ancestorCleared && !props.backgroundColor)
childAncestorLayoutChanged = node.layoutChangedThisFrame || ancestorLayoutChanged
```

Key insight: a Box with `backgroundColor` **breaks** the ancestorCleared cascade. Its `renderBox` fill covers stale pixels, so children don't need to know about ancestor clears. Without this, border cells at boundaries get overwritten.

Key insight: `ancestorLayoutChanged` does NOT break at `backgroundColor` boundaries. Unlike `ancestorCleared` (which a bg fill can satisfy), an ancestor layout change means descendants' absolute positions in the cloned buffer are wrong regardless of bg fills.

### Why contentAreaAffected is NOT needsOwnRepaint

`needsOwnRepaint` includes `stylePropsDirty` (e.g., borderColor change). `contentAreaAffected` excludes pure paint changes because a border-only change doesn't affect the content area -- the clone already has the correct bg. Using `needsOwnRepaint` for `childrenNeedFreshRender` caused border color changes to cascade re-renders through ~200 child nodes per Card.

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

Text nodes with no explicit background inherit bg from their nearest ancestor Box with `backgroundColor`. This is done via `inheritedBg` on `NodeRenderState`, threaded top-down from root through every child. Each node computes its children's inherited bg/fg in O(1) — no parent chain walks.

```typescript
// Root initializes with no inheritance:
{ inheritedBg: { color: null, ancestorRect: null }, inheritedFg: null }

// Each node computes children's inherited values:
const childInheritedBg = effectiveBg
  ? { color: parseColor(effectiveBg), ancestorRect: node.boxRect }
  : nodeTheme
    ? { color: parseColor(nodeTheme.bg), ancestorRect: node.boxRect }
    : nodeState.inheritedBg  // pass through from parent

// Text nodes read O(1):
const textInheritedBg = nodeState.inheritedBg.color
const textInheritedFg = nodeState.inheritedFg

// render-text.ts → renderGraphemes: priority chain for bg
// 1) Text's own bg  2) inheritedBg from ancestor Box  3) getCellBg buffer read (legacy fallback)
const existingBg = style.bg !== null ? style.bg : inheritedBg !== undefined ? inheritedBg : buffer.getCellBg(col, y)
```

**Why inheritedBg instead of getCellBg?** The old approach read bg from the buffer (`getCellBg`), creating a coupling between text rendering and buffer state. On incremental renders, the cloned buffer could have stale bg at positions outside the parent's bg-filled region (e.g., overflow text, moved nodes). Using `inheritedBg` from the render tree is deterministic regardless of buffer state. The `getCellBg` fallback remains only for external callers of `renderTextLine` that don't pass `inheritedBg` (e.g., scroll indicators in render-box.ts).

**stickyForceRefresh** exists because sticky headers overwrite first-pass content in a second pass, and the cloned buffer has stale content from previous frames' sticky positions. Tier 3 incremental renders need all first-pass items to re-render (with a pre-clear to null bg) to ensure the buffer matches fresh render state before the sticky pass.

Nested Text `backgroundColor` is handled separately via `BgSegment` tracking (not ANSI codes) to prevent bg bleed across wrapped text lines. Its siblings — nested OSC 8 hyperlinks and nested SGR fg/attrs, which DO live as inline ANSI — stay self-contained per wrapped line via `fixOsc8AcrossWrappedLines` / `fixSgrAcrossWrappedLines` (unicode.ts). See [LESSONS.md](LESSONS.md) "Per-Line ANSI Self-Containment" for the full bg/OSC 8/SGR triangle.

## Normal Container Three-Pass Rendering

`renderNormalChildren` uses three passes (CSS paint order):

1. **First pass**: Normal-flow children (skip sticky + absolute)
2. **Second pass**: `position="sticky"` children at computed `renderOffset` positions (when `node.stickyChildren` is present — set by `stickyPhase` for non-scroll parents)
3. **Third pass**: `position="absolute"` children (rendered on top)

Without two-pass, an absolute child rendered before a dirty normal-flow sibling would get its bg wiped by the sibling's `clearNodeRegion`.

**Second pass always uses `hasPrevBuffer=false, ancestorCleared=false`** for absolute children. The buffer at their position contains first-pass content, not previous-frame content — conceptually a fresh render. This prevents transparent overlays from clearing first-pass content via `contentRegionCleared`.

**Stale overlay pixel cleanup**: When an absolute child's structure changes (children mount/unmount, layout shifts, child positions change), `absoluteChildMutated` triggers the PARENT's `contentAreaAffected=true`. This clears the parent's entire region and forces all normal-flow children to re-render, removing stale overlay pixels from gap areas (positions not covered by any current child). This makes the incremental render match a fresh render. The cost is one full re-render per frame when overlays change — acceptable since overlay changes are user-triggered (dialog open/close) and infrequent.

## Region Clearing

When a node's content area changed but it has no `backgroundColor`, stale pixels from the clone remain visible. `clearNodeRegion` fills the node's rect with inherited bg (from `nodeState.inheritedBg`, threaded top-down — O(1) per node).

When a node shrinks, the excess area (old bounds minus new bounds) is also cleared via `clearExcessArea()`. This excess clearing clips to the colored ancestor's bounds to prevent inherited bg from bleeding into sibling areas.

**Important:** Excess area clearing runs independently of `contentRegionCleared`. Even when `contentRegionCleared=false` (e.g., absolute children with `forceRepaint=true` where `hasPrevBuffer=false` + `ancestorCleared=false`), the cloned buffer still has stale pixels in the old-but-not-new area that must be cleared. This also applies to nodes WITH `backgroundColor` — `renderBox` fills only the new (smaller) region.

### Descendant Overflow Clearing

When a child overflows its parent (e.g., text content extending beyond the parent's rect with `overflow:visible`), `clearExcessArea` on the child clips to the immediate parent's content area (inside border/padding). This leaves stale pixels in ancestor border/padding areas and beyond ancestor rects.

`hasDescendantOverflowChanged()` recursively checks if any descendant's `prevLayout` extended beyond THIS node's rect and had `layoutChangedThisFrame`. When detected, `contentAreaAffected=true` triggers the node to clear its own region (restoring borders) and `clearDescendantOverflowRegions()` clears overflow beyond the node's rect.

**Why recursive?** A grandchild overflowing a child AND the grandparent must be detected at the grandparent level. If only the child detected it, clearing at the child level would overwrite the grandparent's border (parent-first rendering order: grandparent draws border → child clears overflow → border gone). By detecting at the grandparent, the grandparent clears its region, redraws its border, and the child gets `hasPrevBuffer=false` (renders fresh, no overflow clearing needed).

**Performance:** Only runs when `hasPrevBuffer && subtreeDirty`. Follows only `subtreeDirty` paths. Returns early on first match. Overflow is rare, so typically returns false after checking a few direct children.

## prevLayout and layoutChangedThisFrame

`layoutChanged` is now driven by the `layoutChangedThisFrame` flag (set by `propagateLayout` in layout phase, cleared by render phase after processing). This replaces the old `!rectEqual(prevLayout, boxRect)` which was permanently stale when layout phase skipped (no dirty nodes), causing O(N) render phase every frame.

**How it works:**

1. Layout phase: `propagateLayout` saves `node.prevLayout = node.boxRect`, recomputes rect, sets `node.layoutChangedThisFrame = !rectEqual(old, new)`
2. Render phase: reads `node.layoutChangedThisFrame` for skip decisions, clears it after processing
3. End of render phase: `syncPrevLayout` sets `prevLayout = boxRect` for all nodes, ensuring `clearExcessArea` and `hasChildPositionChanged` use correct coordinates on multi-pass doRender iterations

`prevLayout` is still used by `clearExcessArea` (old bounds for excess clearing) and `hasChildPositionChanged` (sibling position shift detection), but NOT for the primary `layoutChanged` decision.

## clearExcessArea Guards

`clearExcessArea` fills old-minus-new bounds when a node shrinks. Two guards prevent border corruption:

1. **Position-change guard**: When a node MOVED (prev.x ≠ layout.x or prev.y ≠ layout.y), clearExcessArea is skipped entirely. The right/bottom excess formulas mix new-x with old-y coordinates, creating phantom rectangles at wrong positions. The parent handles old-pixel cleanup instead.

2. **Parent border inset**: Excess clearing always clips to the immediate parent's content area (inside border/padding), even when the inherited bg comes from a colored ancestor. Without this, a child's bottom excess extends into the parent's border row and overwrites border characters with spaces.

## Common Pitfalls

1. **Transparent Boxes cascade clears.** A Box without `backgroundColor` propagates `ancestorCleared` to all descendants. A Box WITH `backgroundColor` breaks the cascade because its fill covers stale pixels. This is intentional -- don't remove the `!props.backgroundColor` check from `childAncestorCleared`.

2. **Border-only changes must not cascade.** `stylePropsDirty` without `bgDirty` means only the border changed. This must NOT trigger `contentAreaAffected` or `childrenNeedFreshRender`, otherwise every borderColor change cascades through the entire subtree.

3. **Buffer shift + sticky = corruption.** Never use Tier 1 (scrollRegion shift) when sticky children exist. The sticky second pass overwrites pixels that the shift assumed were final.

4. **Scroll Tier 3 + sticky = stale content.** The cloned buffer has stale content from previous frames' sticky positions. Tier 3 (no viewport clear) must force all items to re-render (`stickyForceRefresh`) and pre-clear to null bg to match fresh render state.

5. **Absolute children need ancestorCleared=false in second pass.** After the first pass, the buffer at absolute positions has correct normal-flow content. Setting ancestorCleared=true causes transparent absolute overlays to clear that content.

6. **skipBgFill is critical for subtreeDirty.** When only a descendant changed, the parent's bg fill must be skipped. Re-filling destroys child pixels that won't be repainted (they're clean and will be fast-path skipped).

7. **getCellBg coupling (mostly resolved).** Text bg inheritance uses `nodeState.inheritedBg` (threaded top-down, O(1) per node) instead of reading the buffer via `getCellBg()`. This decouples text rendering from buffer state, fixing mismatches where overflow text read stale bg from the cloned buffer. The `getCellBg` fallback is still used by external callers of `renderTextLine` that don't pass `inheritedBg` (e.g., scroll indicators in render-box.ts).

8. **Descendant overflow must be detected recursively, against the CONTENT area.** When a child overflows its parent and shrinks, `clearExcessArea` clips to the immediate parent's content area. If the overflow extends into a grandparent's border/padding, the grandparent must detect and handle it — otherwise a child-level clear overwrites the grandparent's border (parent-first render order). `_hasDescendantOverflowChanged()` (layout-phase.ts) follows `subtreeDirty` paths and compares descendants against the node's **content area** (rect minus border + padding), NOT its full rect — a descendant that sits EXACTLY on the node's border column (`prevRight === full nodeRight`) still reached into a cell the node owns (its border glyph), so a strict-`>` full-rect check has an off-by-the-border blind spot. See LESSONS.md "Descendant Overflow into a Bordered Ancestor's Border Column (2026-06-28)" (`@si/render/20529`).

9. **The descendant-overflow CLEAR must be intersected with intermediate clips, and its left/right strips must clamp to `clipBounds`.** `_clearDescendantOverflow` erases a retreating descendant's overflow OUTSIDE the clearing node's rect — cells that belong to siblings/ancestors. That is only safe where the descendant actually PAINTED those cells. Two premise-breakers: (a) an OPAQUE descendant clipped by an INTERMEDIATE `overflow:hidden` ancestor never painted the overflow (`nodeEmitsOwnPixels` only gates transparent overflowers, not clipped-away paint), and (b) the left/right strips historically did not clamp to `clipBounds` at all (only above/below did). The clear must narrow `clipBounds` through the recursion at each clipping child (`computeChildClipBounds`, mirroring `renderNormalChildren`'s `effectiveClipBounds`) AND clamp all four strips to it. The change only ever tightens the clear, so it can't under-clear the descendant's own (in-clip) pixels. See LESSONS.md "Descendant-Overflow Clear Ignored Intermediate Clips → Stomped a Sibling Divider (2026-07-09)" (`@si/render/20989`) — the opaque-text sibling of the `@si/render/20598` transparent-box case.

## Debugging

See **[debugging.md](../../../docs/guide/debugging.md)** for the canonical debugging reference: env vars, STRICT mode hierarchy, what each mode catches/misses, diagnostic workflow, and symptom→check cross-reference.

Quick reference:

```bash
SILVERY_STRICT=1 bun km view /path                        # Buffer-level verification
SILVERY_STRICT_TERMINAL=vt100 bun km view /path           # ANSI-level (fast internal parser)
SILVERY_STRICT_TERMINAL=xterm bun km view /path           # Terminal-level (xterm.js emulator)
SILVERY_STRICT_TERMINAL=all bun km view /path             # All backends
DEBUG=silvery:* DEBUG_LOG=/tmp/silvery.log bun km view /path  # All silvery diagnostic output
DEBUG=silvery:content DEBUG_LOG=/tmp/silvery.log bun km view /path  # Render phase stats
DEBUG=silvery:content:cell SILVERY_CELL_DEBUG=77,85 DEBUG_LOG=/tmp/silvery.log bun km view /path  # Per-cell trace
TRACE=silvery:render DEBUG_LOG=/tmp/silvery.log bun km view /path  # Pipeline phase timing
SILVERY_INSTRUMENT=1 bun km view /path                    # Enable stats collection
```

All diagnostic output is routed through loggily structured logging. The render phase has extensive instrumentation gated on `_instrumentEnabled` -- node visit/skip/render counts, cascade diagnostics, scroll container tier decisions, and per-node trace entries. Stats are also exposed on `globalThis.__silvery_content_detail` for programmatic access (STRICT diagnostics, perf profiling).

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

- `SILVERY_STRICT=1` verifies incremental ANSI output produces the same terminal state as a fresh render (vt100 backend)
- Inline incremental tests in `tests/inline-mode.test.ts` (9 tests covering guard conditions, cursor positioning, multi-frame consistency)
- Vitest benchmarks in `tests/inline-output.bench.ts`

## Inline Rects (Virtual Text Hit Testing)

Virtual text nodes (nested `<Text>` inside `<Text>`) don't have layout nodes or screen rects, so standard tree-based hit testing misses them. Inline rects solve this by computing screen-space rectangles during text rendering.

### How it works

1. **Collection phase** (`collectTextWithBg`): Tracks `ChildSpan` entries alongside `BgSegment` entries. Each span maps a virtual text child to its display-width range `[start, end)` in the collected text.

2. **Rendering phase** (`renderText`): After formatting lines and computing `lineOffsets`, calls `computeInlineRects()` which maps each child's display-width span to screen coordinates. For wrapped text, a child spanning multiple lines produces one rect per line fragment.

3. **Hit testing** (`hitTest` in mouse-events.ts, `findNodeAtScreenPosition` in bound-term.ts): After standard DFS finds a `silvery-text` node as the deepest match, also checks its children's `inlineRects`. This enables mouse events (enter/leave/click) on nested interactive elements like `<Link>`.

### Key design decisions

- **Unconditional**: All virtual text nodes get `inlineRects`, not just ones with mouse handlers. TEA mode needs identity-based hit testing.
- **Piggybacked on existing pipeline**: Uses the same `mapLinesToCharOffsets` as bg segments. No extra text measurement passes.
- **One rect per line fragment**: Wrapped text produces multiple rects per child, correctly handling wrapping.

## File Map

| File              | Responsibility                                                                                                             |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------- |
| render-phase.ts   | Tree traversal, dirty-flag evaluation, incremental cascade logic, scroll container tiers, region clearing                  |
| render-box.ts     | Box bg fill (`skipBgFill` aware), border rendering, scroll indicators                                                      |
| render-text.ts    | Text content collection, ANSI parsing, bg segment tracking, `inheritedBg` inheritance, bg conflict detection, inline rects |
| layout-phase.ts   | Layout calculation, scroll state, screen rects, layout subscriber notification                                             |
| measure-phase.ts  | Intrinsic size measurement for fit-content nodes                                                                           |
| output-phase.ts   | Buffer diff, dirty row tracking, minimal ANSI output generation, inline incremental rendering                              |
| render-helpers.ts | Color parsing, text width, border chars, style computation                                                                 |
| helpers.ts        | Border/padding size calculation                                                                                            |

## Lessons & Postmortems

See **[LESSONS.md](LESSONS.md)** for past debugging sessions, case studies (sticky, true color, CJK, text bg bleed, overflow, flag emoji), common blind paths, and effective strategies.

## Symptom → Check Cross-Reference

See **[debugging.md](../../../docs/guide/debugging.md#symptom--check-cross-reference)** for the full symptom→check table (13 entries covering bg, borders, scroll, absolute, overflow, wide chars, etc.).

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
    const nodes = item.root(
      "board",
      item("Column 1", item("Task A"), item("Task B")),
      item("Column 2", item("Task C")),
    )
    using repo = createFakeRepo({ nodes })
    using baseDriver = createBoardDriver(repo, "board")
    const driver = withDiagnostics(baseDriver, {
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
