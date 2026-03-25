# Rendering Pipeline Algorithm

Complete step-by-step rendering algorithm. This is the definitive reference — all pipeline docs, debugging, and testing should be understood in terms of this flow.

## Trigger → Display

```
State change → React reconciler → dirty flags → scheduler → pipeline → stdout → terminal
```

## Algorithm

### 1. Trigger

React state change fires. Reconciler walks the fiber tree and sets dirty flags on SilveryNode instances:

| Flag              | Meaning                                         | Set by     |
| ----------------- | ----------------------------------------------- | ---------- |
| `contentDirty`    | Text content or content-affecting props changed | Reconciler |
| `stylePropsDirty` | Visual props changed (color, bg, border)        | Reconciler |
| `bgDirty`         | `backgroundColor` specifically changed          | Reconciler |
| `layoutDirty`     | Layout-affecting props changed                  | Reconciler |
| `childrenDirty`   | Direct children added, removed, or reordered    | Reconciler |

Reconciler calls `scheduler.scheduleRender()`.

### 2. Scheduler Batching

```
scheduleRender() → queueMicrotask → frame rate check → executeRender()
```

- Coalesces synchronous updates via queueMicrotask
- Frame rate limiting: 16ms minimum between renders
- Gets terminal dimensions: `width = stdout.columns`, `height = stdout.rows`

### 3. Pipeline Phases

#### Phase 1: Measure (`measure-phase.ts`)

Traverse nodes with `width/height="fit-content"`. Measure intrinsic content size (text length, child arrangement). Set Yoga constraints.

#### Phase 2: Layout (`layout-phase.ts`)

Run `yoga.calculateLayout()`. Propagate computed dimensions to all nodes. Set `layoutChangedThisFrame = true` on nodes whose `contentRect` changed. Set `subtreeDirty` upward from changed nodes to root.

#### Phase 2.5: Scroll (`layout-phase.ts`)

Compute scroll offsets for `overflow="scroll"` containers. Determine which children are visible in the viewport. Calculate sticky header positions within scroll containers.

#### Phase 2.55: Sticky (`layout-phase.ts`)

Compute sticky render offsets for non-scroll parents with `position="sticky"` children.

#### Phase 2.6: Screen Rect (`layout-phase.ts`)

Compute screen-relative positions for each node (content position minus ancestor scroll offsets). Used by `useScreenRect()`.

#### Phase 2.7: Notify (`layout-phase.ts`)

Fire `useContentRect()` and `useScreenRect()` subscriber callbacks. Skipped for STRICT comparison renders to avoid side effects.

#### Phase 3: Content (`render-phase.ts`)

Render the node tree to a `TerminalBuffer` (2D grid of cells).

**First render** (prevBuffer === null):

- Create fresh buffer
- Render ALL nodes (no skip logic)

**Incremental render** (prevBuffer !== null):

- Clone prevBuffer (previous frame's pixels are the starting point)
- Walk tree, evaluate dirty flags on each node
- Skip clean subtrees (all flags false → pixels in clone are correct)
- Re-render only dirty nodes and their affected descendants
- Three-tier scroll container strategy:
  - Tier 1 (scroll only): Buffer shift + edge re-render
  - Tier 2 (children changed): Full viewport clear + re-render all visible
  - Tier 3 (subtree dirty): Only dirty descendants re-render
- Multi-pass rendering: normal flow → sticky → absolute

**Key invariant**: Incremental render MUST produce identical buffer to fresh render. `SILVERY_STRICT` verifies this.

Output: `TerminalBuffer` — the correct pixel state for this frame.

**Cascade predicates** — 6 computed outputs from 14 boolean inputs control the entire incremental cascade. Pure logic extracted to `cascade-predicates.ts` for exhaustive testing (2^14 = 16,384 cases). See `CLAUDE.md` "The Critical Formulas" for detailed semantics.

```
canSkipEntireSubtree          = hasPrevBuffer && !contentDirty && !stylePropsDirty && !layoutChanged
                        && !subtreeDirty && !childrenDirty && !childPositionChanged
                        && !ancestorLayoutChanged && !scrollOffsetChanged

textPaintDirty        = isTextNode && stylePropsDirty                                        (intermediate)

contentAreaAffected   = contentDirty || layoutChanged || childPositionChanged
                        || childrenDirty || bgDirty || textPaintDirty
                        || absoluteChildMutated || descendantOverflowChanged

bgRefillNeeded    = hasPrevBuffer && !contentAreaAffected && subtreeDirty && hasBgColor

contentRegionCleared   = (hasPrevBuffer || ancestorCleared) && contentAreaAffected && !hasBgColor

skipBgFill            = hasPrevBuffer && !ancestorCleared && !contentAreaAffected && !bgRefillNeeded

childrenNeedFreshRender   = (hasPrevBuffer || ancestorCleared) && (contentAreaAffected || bgRefillNeeded)
```

Invariants: (1) contentAreaAffected ∧ bgRefillNeeded → ⊥, (2) contentRegionCleared ∧ skipBgFill → ⊥, (3-4) ¬hasPrevBuffer ∧ ¬ancestorCleared → contentRegionCleared=⊥ ∧ childrenNeedFreshRender=⊥, (5) canSkipEntireSubtree → hasPrevBuffer.

#### Phase 4: Output (`output-phase.ts`)

Diff the current buffer against the previous buffer and emit minimal ANSI escape sequences.

**First render** (prev === null):

- `bufferToAnsi(next)` — full sequential render:
  1. `\x1b[H` (home cursor to top-left)
  2. For each row: CUP to row start (row > 0), write all cells with SGR style transitions, `\x1b[K` (clear to EOL)
  3. Wide chars: skip continuation cell, emit CUP re-sync after each wide char
  4. OSC 66 text sizing for terminals that support it

**Incremental render** (prev !== null):

1. **diffBuffers**: Compare prev and next cell-by-cell
   - Dirty row bounding box narrows the scan range
   - Row-level pre-check: packed metadata + chars + extras (true colors, hyperlinks)
   - Per-cell comparison for dirty rows
   - Wide→narrow transition: emit continuation cell as extra change
   - Size growth/shrink: add strips for new/removed areas
   - Output: change pool (pre-allocated, no allocation) + count

2. **changesToAnsi**: Emit ANSI for changed cells
   - Sort changes by position (y × maxWidth + x)
   - For each change:
     - Cursor movement: CUP `\x1b[row;colH` (fullscreen) or relative `\x1b[nA/B/C` (inline)
     - Optimizations: `\r\n` for next-row-col-0, CUF for same-row-forward
     - SGR style delta: only emit changed attributes
     - Character output with OSC 66 wrapping for wide chars
     - CUP re-sync after each wide char (terminal width disagreement defense)
   - Output: minimal ANSI string

**Verification** (during incremental render):

- STRICT (buffer): Compare incremental buffer cell-by-cell against fresh render buffer
- STRICT_TERMINAL=vt100: Replay output through internal ANSI parser, compare against fresh render replay
- STRICT_TERMINAL=xterm: Feed output to xterm.js terminal emulator, compare cell-by-cell
- STRICT_TERMINAL=ghostty: Feed output to Ghostty WASM emulator, compare cell-by-cell
- STRICT_ACCUMULATE: Replay ALL accumulated output (O(N²)) against fresh render

### 4. Scheduler Output

1. Build cursor suffix (position + show/hide + cursor shape via CSI q)
2. DEC 2026 sync markers are NOT used (scheduler has them disabled; sync fallback was removed)
3. `stdout.write(fullOutput)` — ANSI bytes sent to terminal process
4. Save buffer as `prevBuffer` for next frame's diff
5. STRICT buffer comparison: run full pipeline with null prevBuffer, compare cell-by-cell

### 5. Terminal Interpretation

The terminal process (Ghostty, iTerm2, etc.) receives the ANSI byte stream and:

1. Parses escape sequences
2. Updates its internal cell grid
3. Renders the cell grid to the screen

**This step is NOT verified by any test system.** STRICT_TERMINAL verifies against xterm.js (a reference implementation), not the actual terminal.

## Test Coverage Map

| Step                               | Test System                             | What It Verifies                          | Limitations                                            |
| ---------------------------------- | --------------------------------------- | ----------------------------------------- | ------------------------------------------------------ |
| Dirty flags → content              | **STRICT** (buffer comparison)          | Incremental buffer === fresh buffer       | Only buffer state, not ANSI output                     |
| Measure/Layout                     | Flexily tests, STRICT                   | Yoga constraints and computed rects       | -                                                      |
| Scroll/Sticky                      | Fuzz tests, STRICT                      | Scroll tier selection, sticky positioning | -                                                      |
| Render phase                       | **STRICT**                              | Buffer correctness                        | Excellent — catches ALL content bugs                   |
| diffBuffers                        | diff-buffers.test.ts, STRICT_TERMINAL   | Change detection completeness             | -                                                      |
| bufferToAnsi                       | STRICT_TERMINAL=vt100                   | Full render ANSI correctness              | vt100 uses internal parser; use =xterm for independent |
| changesToAnsi                      | STRICT_TERMINAL=vt100, wide char matrix | Incremental ANSI correctness              | vt100 uses internal parser; use =xterm for independent |
| Terminal interpretation (xterm.js) | **STRICT_TERMINAL=xterm**               | xterm.js agrees with buffer               | Only xterm.js, not Ghostty                             |
| Terminal interpretation (Ghostty)  | **STRICT_TERMINAL=ghostty**             | Ghostty agrees with buffer                | Known grapheme bugs; allow-fail in CI                  |
| stdout delivery                    | **NONE**                                | -                                         | No pipe buffer split detection                         |
| DEC 2026 sync interaction          | N/A (removed)                           | -                                         | Sync fallback removed; scheduler sync also disabled    |

### STRICT Modes: What Each Catches (and Misses)

See **[debugging.md](../../../docs/guide/debugging.md)** for the full table, diagnostic workflow, and symptom→check cross-reference.

## Key ANSI Sequences

| Sequence             | Name                 | Used In                                             | Terminal-Dependent?                                           |
| -------------------- | -------------------- | --------------------------------------------------- | ------------------------------------------------------------- |
| `\x1b[H`             | CUP Home             | bufferToAnsi (first row)                            | No                                                            |
| `\x1b[row;colH`      | CUP                  | bufferToAnsi (rows), changesToAnsi                  | No — always unambiguous                                       |
| `\x1b[K`             | EL (Erase to EOL)    | bufferToAnsi, changesToAnsi                         | **Yes — behavior in pending-wrap state varies**               |
| `\n` (LF)            | Newline              | bufferToAnsi (inline only; removed from fullscreen) | **Yes — double-advance in pending-wrap; fullscreen uses CUP** |
| `\r` (CR)            | Carriage Return      | bufferToAnsi (inline), changesToAnsi                | Mostly safe — goes to col 0, resolves pending-wrap            |
| `\r\n`               | CR+LF                | changesToAnsi (next-row optimization)               | Safe — \r resolves pending-wrap, \n advances one row          |
| `\x1b[nC`            | CUF (Cursor Forward) | changesToAnsi (same-row forward)                    | Some terminals apply current bg to traversed cells            |
| `\x1b[?2026h/l`      | DEC Sync             | Not used (scheduler disabled, fallback removed)     | Removed — caused garble in Ghostty                            |
| `\x1b]66;w=N;...BEL` | OSC 66 Text Sizing   | Wide char wrapping                                  | Terminal support varies                                       |

## File Map

| File                        | Lines  | Responsibility                                                     |
| --------------------------- | ------ | ------------------------------------------------------------------ |
| `scheduler.ts`              | ~725   | Batching, frame timing, stdout.write, STRICT comparison            |
| `pipeline/index.ts`         | ~417   | Phase orchestration (measure → layout → scroll → content → output) |
| `pipeline/measure-phase.ts` | -      | Intrinsic size measurement                                         |
| `pipeline/layout-phase.ts`  | -      | Yoga layout, scroll, sticky, screen rects                          |
| `pipeline/render-phase.ts`  | -      | Node→buffer rendering (the complex part)                           |
| `pipeline/output-phase.ts`  | ~2900+ | Buffer diff, ANSI generation, all verification modes               |
