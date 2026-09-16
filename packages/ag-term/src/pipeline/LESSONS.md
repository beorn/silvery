# Pipeline Lessons

Postmortems and strategies from past debugging sessions. Read [CLAUDE.md](CLAUDE.md) for the normative pipeline reference first.

## The Big 4 Render-Phase Bugs

`SILVERY_STRICT=1` revealed 402 mismatches across the render phase. Reduced to 47 (88%) by fixing four categories:

1. **Dirty flag propagation failures** — Layout-phase changes weren't propagating `subtreeDirty` to ancestors. Added `markLayoutAncestorDirty()` helper. Without it, ~200 nodes would re-render on every border color change due to misusing `needsOwnRepaint` where `contentAreaAffected` was needed.

2. **Incorrect region clearing** — `clearNodeRegion` used wrong bounds when a node shrank. Excess clearing must clip to the colored ancestor's bounds, not the parent's bounds — otherwise inherited bg bleeds into sibling areas.

3. **Absolute position rendering** — Absolute children rendered in the wrong paint order. A dirty normal-flow sibling would wipe the absolute child's bg. Fixed with two-pass rendering (normal flow first, then absolute children on top).

4. **Text background bleed** — Nested Text `backgroundColor` leaked across wrapped lines via ANSI codes embedded in the text stream. Replaced with `BgSegment` tracking that applies bg per-segment rather than embedding ANSI state.

## Sticky Children Incremental Rendering (2026-02-12)

10/10 fuzz failures in `render-fuzz.fuzz.ts` after sticky children support was added. Three complementary fixes were needed:

1. **Tier 2 viewport clear uses inherited bg; Tier 3 stickyForceRefresh uses `bg: null`** — Originally Tier 2 cleared to `null`, but this was later changed: Tier 2 (`needsViewportClear`) now clears to `scrollBg` (the node's own `backgroundColor` or `nodeState.inheritedBg`), which is correct because children render fresh on top. The separate `stickyForceRefresh` clear (Tier 3 with sticky children) still uses `bg: null` because it must match fresh render state before the sticky second pass. Text bg inheritance uses `nodeState.inheritedBg` (threaded top-down, not `getCellBg` buffer reads), so the viewport bg doesn't affect text rendering — it only matters for cells not covered by any child.

2. **`stickyForceRefresh` in Tier 3** — When sticky children exist and only `subtreeDirty` is set (Tier 3), the cloned buffer has stale content from previous frames' sticky positions. All first-pass items must re-render before the sticky second pass overwrites. Without this, stale content from old sticky positions persists.

3. **Sticky `ancestorCleared=false`** — The second pass renders sticky headers ON TOP of first-pass content. Using `ancestorCleared=true` caused transparent spacer Boxes to clear their region, wiping overlapping sticky headers rendered earlier in the same pass. Fresh render has first-pass content at sticky positions, not "cleared" space.

**Blind paths in this session:**

- Pre-clearing only current sticky positions (missed that OLD positions also had stale content)
- Setting `hasPrevBuffer=false` without clearing buffer (stale content remains in the cloned buffer regardless of hasPrevBuffer flag)
- Attempting to fix with `ancestorCleared=true` for sticky children (broke transparent overlays)

## Output Phase: True Color Row Pre-Check Bug (2026-02-24)

`diffBuffers` had a row-level pre-check: `rowMetadataEquals + rowCharsEquals -> skip`. This only compared packed Uint32Array metadata and chars. When two cells both had the true-color fg/bg flag set but different actual RGB values in the Maps (fgColors/bgColors), the pre-check said "equal" and skipped the row. Result: progressive garble — characters correct but colors stale.

Fix: Added `rowExtrasEquals()` to buffer.ts that checks all Map-based data (true colors, underline colors, hyperlinks). Updated `diffBuffers` to call it as third pre-check: `rowMetadataEquals && rowCharsEquals && rowExtrasEquals -> skip`.

Also fixed latent width-indexing bug: `rowMetadataEquals`/`rowCharsEquals` used `this.width`-based indexing for both buffers, wrong when widths differ (e.g., during resize). Now uses separate `otherStart = y * other.width`.

**Key insight**: `SILVERY_STRICT` verifies both buffer content (render phase) and ANSI output (vt100 backend). It cannot detect bugs where our internal parser agrees with our generator but a real terminal disagrees. Use `SILVERY_STRICT_TERMINAL=xterm` or `SILVERY_STRICT_ACCUMULATE` for those.

## Output Phase: CJK Wide Char Cursor Drift (2026-02-25)

CJK wide characters (e.g., '\u5EC8') occupy 2 terminal columns. In the buffer, col X has `wide=true` and col X+1 should have `continuation=true`. `bufferToAnsi` relies on `continuation` to skip X+1 after writing the wide char — without it, both the wide char AND the non-continuation cell are written, causing every subsequent character on the row to shift right by 1 ("cursor drift").

Two fixes applied to `output-phase.ts`:

1. **`bufferToAnsi` robustness**: After writing a wide char, unconditionally skip X+1 (`if (cell.wide) x++`) instead of relying on the next cell's `continuation` flag. This makes output correct even if the buffer has a corrupted/missing continuation cell.

2. **`diffBuffers` wide->narrow transition**: When prev buffer has `wide=true` at X and next doesn't, explicitly add X+1 to the change pool. Without this, the terminal retains the second half of the wide char at X+1 (which the buffer shows as "unchanged" since both prev and next are ' ').

**Root cause**: Various buffer operations (`clearNodeRegion`, `renderBox` bg fill, scroll viewport clear) use `buffer.fill()` which defaults `continuation=false`. If these operations overlap with a wide char's continuation cell, the continuation flag is erased. Buffer-level STRICT doesn't catch this because both fresh and incremental renders produce the same corrupted buffer — use `SILVERY_STRICT_TERMINAL=xterm` for terminal-level verification.

**vt100 output verification now enabled in CI** via `SILVERY_STRICT=1` (`vitest/setup.ts`) — 3382 vendor + 2090 TUI tests pass with it.

## Text Background Bleed (BgSegment)

ANSI-embedded backgrounds (`chalk.bgBlack("text")`) inside a Box with `backgroundColor` caused bg to leak across wrapped lines. The ANSI bg state persisted across line boundaries.

Fix: `BgSegment` tracking in `render-text.ts` strips ANSI bg from text content and tracks bg ranges separately. Each line's bg is applied independently. The `bgOverride` utility from ansi allows intentional bg override where needed.

## Per-Line ANSI Self-Containment — the bg / OSC 8 / SGR triangle

A nested `<Text>` (e.g. `<Text color>`, `<Text bold>`, `<Link>`) inside a wrapping `<Text wrap>` has its style/href encoded as ANSI inside the parent's collected text. When the styled run soft-wraps, the OPEN sits on the first line and each continuation line is rendered **independently from `baseStyle`** — so any state that lived as inline ANSI is silently dropped on every line after the first. A single (non-nested) `<Text color>` never hits this: its colour is a node-level `style.color` applied to every cell.

Three flavours of this same bug, three fixes — keep them in lockstep:

| State               | Symptom on wrap                                                                           | Fix                                                                                                                   |
| ------------------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| **Background**      | bg bleeds across wrapped lines                                                            | `BgSegment` tracking (buffer-level, NOT inline ANSI) — see above                                                      |
| **OSC 8 hyperlink** | continuation line carries only the CLOSE → `parseAnsiText` leaks `]8;;\` as literal cells | `fixOsc8AcrossWrappedLines` (unicode.ts) — re-open + close per line. Bead `19654-osc-link-leak`                       |
| **SGR fg / attrs**  | continuation line loses colour / bold / italic / underline                                | `fixSgrAcrossWrappedLines` (unicode.ts) — re-open active style + close per line. Bead `19690-status-tuple-wrap-color` |

The OSC 8 and SGR fixes are **siblings** (post-process the wrapped line array so each line stands alone); bg is the odd one out (it dodges inline ANSI entirely via buffer-level segments). Both string-level fixes run inside `wrapTextWithMeasurer` (greedy `wrap`/`even`). When adding a 4th inline-ANSI flavour (e.g. underline-colour SGR 58), wire a matching `fix*AcrossWrappedLines` here — do NOT rely on the unwrapped push/pop balancing, it does not survive the wrap.

## Descendant Overflow Clearing (2026-03-12)

`IncrementalRenderMismatchError` in AI chat status bar: a TextInput node's content shrank from width=91 to width=2, where the old layout overflowed its parent (a `flexGrow` box) and its grandparent (a bordered input box). `clearExcessArea` on the TextInput clipped to the immediate parent's content area, leaving stale pixels in the grandparent's border and padding area.

**First attempt (failed):** `hasChildOverflowChanged` checking only direct children at each level. The immediate parent detected the overflow and ran `clearChildOverflowRegions`, which cleared beyond its rect — including the grandparent's border column. But the grandparent had already drawn its border in parent-first order, so the border was overwritten.

**Fix:** Made overflow detection recursive (`hasDescendantOverflowChanged`). The bordered grandparent now detects the grandchild's overflow directly, clears its own region (restoring borders), and clears overflow beyond its rect. The immediate parent gets `hasPrevBuffer=false` from the grandparent's cascade, so it renders fresh without needing its own overflow clearing.

**Key insight:** Overflow clearing must happen at the level of the ancestor whose border/padding is affected, not at the immediate parent. Parent-first render order means clearing at a child level will overwrite borders that were already drawn by ancestors.

## Output Phase: Flag Emoji Cursor Drift (2026-03-12)

Flag emoji are regional indicator sequences (U+1F1E6..U+1F1FF pairs). Some terminals (xterm.js headless, older terminals) treat them as two width-1 chars instead of one width-2 char. The buffer models them correctly as one wide cell + one continuation cell, but the terminal cursor advances differently.

**Symptom**: After j+l navigation at 200+ cols on a board with flag emoji in the title, the first column shows duplicate card content, stale border fragments, and overlapping cards. Only manifests at wide terminals because the title bar (with flag emoji) is on the same row as the garbled content.

**Why SILVERY_STRICT didn't catch it**: STRICT compares buffer content (render phase) and ANSI output via vt100 backend, which is correct. The vt100 backend uses `replayAnsiWithStyles` which has the same width assumption as the buffer (returns 2 for flag emoji), so it agrees with the buffer. Only feeding ANSI through a real xterm.js terminal emulator (`@termless/xtermjs`) reveals the divergence.

**Fix**: Two complementary changes to `output-phase.ts`:

1. `wrapTextSizing` simplified to wrap ALL `cell.wide` characters in OSC 66 unconditionally — no more per-category detection (PUA, text-presentation emoji, flag emoji). If the buffer says wide, the terminal is told width 2. Eliminates whack-a-mole as Unicode evolves.
2. Cursor re-sync added to `bufferToAnsi` after every wide char — emits explicit CUP to re-sync the terminal cursor, matching the existing re-sync in `changesToAnsi`. After `x++` (skip continuation), CUP targets `x + 2` (1-indexed) = next cell position.

**Testing**: `output-phase-wide-char-matrix.test.ts` (43 tests) verifies both measures across 8 wide char categories (flag emoji, CJK, hangul, fullwidth). Tests OSC 66 presence (with text sizing enabled), CUP re-sync presence, xterm.js cell positions, and incremental vs fresh equivalence. CUP re-sync tests are verified to FAIL without the fix.

**Key insight**: `bufferToAnsi` (full render) creates the initial terminal state. If that state diverges from the buffer due to width disagreement, subsequent `changesToAnsi` (incremental) renders use CUP for changed cells (correct), but unchanged cells retain the shifted positions from the full render — creating visible garble where old and new content overlap.

## Common Blind Paths

| Blind Path                                        | Why It Doesn't Work                                                                   | What to Do Instead                                                                                        |
| ------------------------------------------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Broader viewport clearing                         | Causes 12ms regression (re-renders ~50 children vs 2 dirty ones)                      | Only clear viewport for Tier 2 triggers (childrenDirty, scroll+sticky, childrenNeedFreshRender)           |
| Using `needsOwnRepaint` for cascade               | Includes `stylePropsDirty`; border color changes cascade through ~200 child nodes     | Use `contentAreaAffected` — excludes pure paint changes                                                   |
| Pre-clearing only current sticky positions        | Old positions also have stale content in the buffer                                   | Clear entire viewport to `null` bg                                                                        |
| `hasPrevBuffer=false` without clearing buffer     | Stale content remains in the cloned buffer regardless of hasPrevBuffer flag           | Clear viewport first, then set `hasPrevBuffer=false`                                                      |
| `ancestorCleared=true` for sticky second pass     | Transparent spacer Boxes clear their region, wiping overlapping sticky content        | Use `ancestorCleared=false` — matches fresh render semantics                                              |
| Blaming the terminal emulator                     | If 3 terminals show the same glitch, it's your code                                   | Use `withDiagnostics` + `SILVERY_STRICT=1` first                                                          |
| Hand-rolling VirtualTerminal tests                | Too simple to catch real app complexity                                               | Use `withDiagnostics(createBoardDriver(...))`                                                             |
| Reading code paths without a failing test         | Wastes 20+ turns on theorizing                                                        | Write failing test first, THEN trace code                                                                 |
| Row pre-check: only packed metadata + chars       | Misses true-color Map diffs (fgColors/bgColors) when both cells have TC flag          | Always include `rowExtrasEquals()` in the row pre-check                                                   |
| Clearing overflow at immediate parent only        | Child-level clear overwrites grandparent's border (parent-first render order)         | Use recursive `hasDescendantOverflowChanged` so the bordered ancestor detects and handles it              |
| Blaming the text path for text cut with no `…`    | `truncateText` always emits a marker; the pipeline paints into the box layout gave it | Dump siblings' `getComputedLeft()`/`getComputedWidth()` first — overlapping boxes destroy the marker cell |
| Reproducing a width-dependent glitch at one width | Broken widths INTERLEAVE with correct ones; three samples can all land on good widths | Sweep the full width range one column at a time                                                           |

## Effective Strategies (Priority Order)

1. **`SILVERY_STRICT=1`** — Run the app or tests. Catches any incremental vs fresh render divergence immediately. Always start here.

2. **Write a failing fuzz seed test** — If fuzz found it, extract the seed. If user-reported, construct a `withDiagnostics(createBoardDriver(...))` test with the minimal reproduction steps.

3. **Read the mismatch error output** — The enhanced error includes cell values, node path, dirty flags, scroll context, and fast-path analysis. This tells you exactly which node diverged and why it was skipped.

4. **`SILVERY_INSTRUMENT=1`** — Enables stats collection. View with `DEBUG=silvery:content DEBUG_LOG=/tmp/silvery.log` (loggily output) or programmatically via `globalThis.__silvery_content_detail`. Useful for understanding whether too many or too few nodes rendered.

5. **Check the five critical formulas** — `layoutChanged`, `contentAreaAffected`, `contentRegionCleared`, `skipBgFill`, `childrenNeedFreshRender` in `renderNodeToBuffer`. If any is wrong, the cascade propagates errors to the entire subtree.

6. **Text bg inheritance awareness** — Text nodes inherit bg via `nodeState.inheritedBg` (threaded top-down, O(1)), not buffer reads. However, viewport clears and region clears still affect buffer state, which matters for the `getCellBg` legacy fallback (used by scroll indicators). If your fix clears a region, verify it clears to the correct bg (usually `null` to match fresh render state).

7. **Parallel hypothesis testing** — When multiple hypotheses exist (dirty flag issue vs scroll tier issue vs bg inheritance issue), launch parallel sub-agents to test each with a targeted test.

## Detail Pane "Stale Pixels" — False Alarm (2026-04-08)

**Symptom**: After detail pane open/close, `mcp__tty__text` showed displaced borders, content fragments, garbled patterns.

**Investigation** (8+ TTY sessions, multiple fix attempts at render-phase, output-phase, create-app levels):

- Buffer: STRICT passes (incremental = fresh) ✓
- ANSI: STRICT_TERMINAL passes ✓
- Visual: **Screenshots showed clean rendering** ✓

**Root cause**: TTY MCP text extraction artifact. Unicode characters (📁, ✅, ▸) have width disagreements between silvery and xterm.js headless. `mcp__tty__text` extracts text based on xterm.js cell positions, which diverge from silvery's after emoji/wide chars. The visual rendering is correct.

**Lesson**: For TUI bugs, ALWAYS verify with `mcp__tty__screenshot`, not just `mcp__tty__text`. Text extraction from terminal emulators is unreliable for Unicode-heavy content. Hours were spent debugging a non-existent rendering bug.

## replayAnsiWithStyles missing pending wrap (STRICT_OUTPUT false positives)

**Symptom**: 11 km-tui tests failed with `STRICT_OUTPUT char mismatch` — stale border characters (`╭──╯`) persisted in the incremental terminal state while the fresh render was correct. The content buffer was correct (`next buffer cell` showed the right content), but the ANSI output when replayed through the parser didn't update certain rows.

**Root cause**: `replayAnsiWithStyles` (the internal VT100 parser used by STRICT*OUTPUT verification) immediately wrapped the cursor to the next line when characters filled the full terminal width. Real VT100/xterm terminals use \_pending wrap* — the cursor stays at the last column and only wraps when the next character is written. Without pending wrap:

1. Dense row fills all 120 columns → parser wraps to (0, row+1)
2. `changesToAnsi` emits `\r\n` to advance to next row → parser goes to (0, row+2)
3. Subsequent changes are written one row too late

**Fix**: Implemented VT100 pending wrap semantics in `replayAnsiWithStyles`:

- Character at last column sets `pendingWrap = true`, cursor stays at `(width-1, row)`
- Next character write resolves the wrap first (cursor to `(0, row+1)`)
- `\r`, `\n`, CUP, and cursor movement sequences clear `pendingWrap`

**Why it wasn't in changesToAnsi**: `changesToAnsi` is correct — it matches real terminal behavior. The bug was only in the STRICT verification parser, which caused false STRICT_OUTPUT failures. Production rendering was never affected.

**Lesson**: When STRICT_OUTPUT fails but the content buffer is correct, check the `replayAnsiWithStyles` parser — it may not match real terminal semantics.

## Borderless Overflow Indicator Overwrites Child Content (2026-04-20)

**Symptom**: Scroll container with `overflowIndicator=true`, no `borderStyle`, and `contentHeight = viewportHeight + 1`. The last card renders only its top-border (`╭`), then `▼1` appears on the row where that card's text should be. User sees "lone ╭ stacked above ▼1 — card content gone."

**Root cause**: `scrollPhase` correctly reserves one row for the indicator (`visibleBottom = rawViewportHeight - indicatorReserve` when `hasOverflow && overflowIndicator && !borderStyle`). This controls WHICH children are "visible", but flexbox has already positioned children by the time `layout-phase` ran — a card at flexbox-computed y=viewport-2..viewport+1 still writes its text row at y=viewport-1.

`computeChildClipBounds` in `render-phase.ts` returned the FULL viewport rect (`layout.y..layout.y+layout.height`). Children rendered into that full rect; the `▼N` indicator (drawn afterward in `renderScrollIndicators`) then overwrote whatever the child wrote on the indicator row.

**Fix** (`renderScrollContainerChildren` in `render-phase.ts`): split the clip into `viewportClipBounds` (used by Tier 1 shift / Tier 2 clear / Tier 3 sticky-force-refresh — all of which must span the full viewport so indicator rows repaint correctly) and `childClipBounds` (passed to child renders — reduced by 1 row at each indicator edge).

```typescript
const showBorderlessIndicator = props.overflowIndicator === true && !props.borderStyle
const childClipBounds =
  showBorderlessIndicator && (ss.hiddenAbove > 0 || ss.hiddenBelow > 0)
    ? {
        ...viewportClipBounds,
        top: ss.hiddenAbove > 0 ? viewportClipBounds.top + 1 : viewportClipBounds.top,
        bottom: ss.hiddenBelow > 0 ? viewportClipBounds.bottom - 1 : viewportClipBounds.bottom,
      }
    : viewportClipBounds
```

**Test**: `tests/features/listview-overflow-fits.test.tsx` — "content barely exceeds viewport: indicator reserves its row — last card's content not overwritten". Positive control: `▼N` still renders, but on its own row with no card text beside it.

**Why STRICT didn't catch it**: The bug produces identical incremental and fresh renders (both wrong in the same way — both call `renderScrollIndicators` on top of children). STRICT verifies incremental==fresh, not incremental==intended.

**Lesson**: `scrollPhase` state (visibleTop/visibleBottom, indicatorReserve) and `render-phase`'s child clip bounds must agree on the reserved area. When adding or changing indicator logic, verify that the clip passed to child renders matches the intended content area, not the raw viewport rect.

## Descendant Overflow into a Bordered Ancestor's Border Column (2026-06-28)

**Symptom** (`@si/render/20529-rapid-border`): a Hab deck pane's right border `║` dropped on the interior rows of an incremental render. STRICT `MISMATCH at (149,2): incremental=" " vs fresh="║"` on a render where the prevBuffer was cloned. A one-chord rapid split+rename hit it; the two-step (settle between) path did not, because the settle let the split's border commit before the descendant retreated.

**Root cause** — a sibling of the 2026-03-12 "Descendant Overflow Clearing" lesson, one level subtler. The pane tree was:

```
outer box (double border, rect 27,0 123×40)   — right border `║` at col 149, nodeRight=150
└─ content box (transparent, rect 28,2 121×37) — nodeRight=149
   └─ agent-content child                       — prevRight=150 last frame (painted OVER col 149), then shrank
```

When the child retreats, the **content box** (`nodeRight=149`) sees the child's `prevRight=150 > 149`, so `clearDescendantOverflowRegions` clears the overflow strip at col 149 — which is the OUTER box's right-border column. But the **outer border box** (`nodeRight=150`) ran `_checkDescendantOverflow` against its FULL rect: `prevRight (150) > nodeRight (150)` is `false`, so it never flagged `contentAreaAffected`, never repainted its border, and `needsOwnRepaint` stayed false (clean subtree). The cloned buffer held the child's old content at col 149 (not the border), the content box cleared it to blank, and nothing repainted `║`. The descendant sat EXACTLY on the ancestor's border column — invisible to a strict-`>` full-rect check.

**Fix** (`_hasDescendantOverflowChanged` in `layout-phase.ts`): compare descendants against the node's **content area** (rect minus border + padding), not its full rect:

```typescript
const border = getBorderSize(props)
const padding = getPadding(props)
_checkDescendantOverflow(
  node.children,
  rect.x + border.left + padding.left,
  rect.y + border.top + padding.top,
  rect.x + rect.width - border.right - padding.right,
  rect.y + rect.height - border.bottom - padding.bottom,
)
```

Now the bordered ancestor detects a descendant that reached into its own border/padding ring (`prevRight=150 > contentRight=149`), flags `contentAreaAffected`, repaints its border, and cascades `childrenNeedFreshRender`. The content box then renders fresh (`hasPrevBuffer=false`), so `buildCascadeInputs` returns `descendantOverflowChanged=false` and it does NOT run a second overflow clear over the freshly-painted border. This is exactly the 2026-03-12 design — "the bordered ancestor detects, redraws its border, and the child renders fresh (no overflow clearing needed)" — extended to the case where the overflow lands on the ancestor's OWN border rather than strictly beyond its rect. Borderless, unpadded nodes inset by 0, so the change is a no-op for them (full features suite: 2804 STRICT tests unchanged).

**Test**: `tests/features/descendant-overflow-border-clear.test.tsx` — a height-pinned 52-node subtree whose child reaches the border column then shrinks horizontally; the clearing node keeps `hasPrevBuffer=true` (no ancestor cascade-fresh), mirroring the deck's content box at (28,2). Asserts the right border survives on every interior row AND relies on STRICT's incremental≡fresh auto-check.

**Lesson**: descendant-overflow detection is about which cells a retreating descendant leaves stale. A descendant that painted into an ancestor's **border/padding ring** (not just beyond its rect) leaves stale pixels the ancestor OWNS — so the ancestor must detect it against its CONTENT area, not its full rect. A strict-`>` full-rect check has an off-by-the-border blind spot exactly when a descendant sits on the ancestor's edge.

## Descendant-Overflow Clear Ignored Intermediate Clips → Stomped a Sibling Divider (2026-07-09)

**Symptom** (`@si/render/20989`): a live hab-deck "attaching" repaint dropped the col-26 sidebar divider `│` on two interior rows. STRICT `MISMATCH at (26,30): incremental=" " vs fresh="│"` on the standalone follow-up frame (`renderStandaloneFrame` → `renderer.doRender`). Reproduced identically with `SILVERY_RENDER_PLAN=0`, so the sectioned-plan dual-writer in the first dump was a red herring — a pure incremental-cascade bug.

**Root cause** — a subtler sibling of the 2026-05-07 `@si/render/20598` "descendant overflow clear stomps a sibling" lesson. `clearDescendantOverflowRegions` / `_clearDescendantOverflow` (render-phase.ts) erases a retreating descendant's overflow beyond the clearing node's rect. Two gaps let it null cells the descendant never painted:

1. The overflowing descendant was an OPAQUE `<Text>` ("awaiting" / "@fleet" deck-status nodes) laid out at `x=26`, one column left of the deck at `x=27`. `nodeEmitsOwnPixels(child)` returns `true` for text, so the 20598 gate (which only suppresses TRANSPARENT overflowers) let the clear through.
2. The status text was clipped to the pane content (col 27+) by the pane's nested `overflow:hidden` boxes, so it NEVER painted col 26 — the col-26 divider `│` (a clean sibling subtree of the deck) owned that cell. But the clearing node was the transparent deck with `clipBounds=undefined`; `_clearDescendantOverflow` recursed THROUGH the clipping panes carrying that `undefined` clip, and the left/right overflow strips did not clamp to `clipBounds` at all (unlike the already-clamped below/above strips). When the status text moved (rows 30-31 → 21-22), the clear nulled the divider `│` at (26,30-31) purely from `prevLayout.x=26 < nodeLeft=27` geometry. The divider, clean, never repainted → incremental blank vs fresh `│`.

**Fix** (`_clearDescendantOverflow`, two coordinated parts):

1. **Clamp the left/right overflow strips to `clipBounds`** (`overflowX = Math.max(…, clipBounds?.left ?? 0)`, `overflowWidth` bounded by `clipBounds?.right`), matching the below/above branches. Fixes the case where the CLIPPER is itself the clearing node.
2. **Narrow `clipBounds` through the recursion** at each `overflow:hidden` child via `computeChildClipBounds` (mirrors `renderNormalChildren`'s `effectiveClipBounds`). Fixes the case where the clearing node is a transparent ancestor recursing through an intermediate clipper — the deck→pane→text path here. A clipping ancestor bounds its descendants' PAINT to its content rect, so a descendant whose LAYOUT overflows the clearing node was clipped and never painted those cells; intersecting the clear with the accumulated clip stops it. Current layout is used for the clip (a clipper that itself moved cleans its own vacated cells at its own level).

The change only ever TIGHTENS the clear (never blanks more cells), so it cannot under-clear a descendant's own pixels (those are within the clip). Borderless/unclipped subtrees are unaffected (clip stays `undefined`/pass-through).

**Test**: `tests/features/descendant-overflow-clipped-text-sibling.test.tsx` — a 50+-node fixture: a tall `│` divider sibling + a transparent region wrapping an `overflow:hidden` clipper whose opaque text rows are pushed left of the divider column via negative margin, then retreat. RED on baseline (`incremental=" "` vs `fresh="│"` at the divider column, both STRICT=1 and =2), green with the fix. Real end-to-end verification: `ag/packages/ag-code/tests/regressions/2026-07-08-20600-live-hab-shell.slow.spec.tsx` now passes.

**Lesson**: the descendant-overflow clear clears cells OUTSIDE the clearing node's rect — cells that belong to siblings/ancestors. Its correctness rests on "the descendant actually painted these overflow cells." Two things break that premise: an opaque descendant clipped by an INTERMEDIATE ancestor (never painted the overflow), and horizontal strips that ignore the clip. The clear must be intersected with the clip that bounded the descendant's paint, accumulated across every clipping ancestor between the clearing node and the descendant — not just the clearing node's own `clipBounds`. `nodeEmitsOwnPixels` gates transparency; clip intersection gates clipped-away paint. Both are needed.

## Text Elided but the Marker Never Painted — the Layout Was Overlapping (2026-08-11)

**Symptom**: breadcrumb path segments in a narrow top bar rendered as `m`, `a`, `ap`, `sr` — cut mid-word with NO `…` anywhere on them. Content vanishing, not a marker styled wrong. Reported three times, each time as "breaks in a narrow terminal", which is why it survived: the behaviour is NON-MONOTONIC in width. Over a 1..80 sweep the broken widths INTERLEAVE with correct ones a single column apart (14 broken, 15 fine, 16-18 broken, 19 fine, 20-24 broken, …). Any fix validated at one hand-picked width looks like it worked.

**The blind path**: the text path looks guilty. `renderText` sits behind a `(node, width, wrap, trim)` format cache and in front of `formatTextLines` → `truncateText`, which is where the `…` is inserted; a width-keyed cache in front of the marker-producing code is a natural-looking explanation for width-dependent, non-monotonic output. It is not the cause. `truncateText` never returns a truncated string without a marker — at `width=1` it returns a bare `…`, and the format cache keys on the width it formatted at, so a hit and a miss produce the same string.

**Root cause — flexily, not the pipeline.** Dumping `layoutNode.getComputedLeft()/getComputedWidth()` per child showed adjacent siblings OVERLAPPING: `maddoc@left=6 width=2` immediately followed by `"/"@left=7 width=1`. The pipeline formatted `maddoc` correctly for its own 2-cell box (`m…`) and painted it at cols 6-7; the separator then painted over col 7 — the cell holding the `…`. Elision became a silent drop, and the mirror case (a sibling starting one column late) left a stray blank in the trail.

Flexily derived a `measureFunc` leaf's main-axis SIZE from `Math.round(absChildLeft)` but PLACED it at `Math.floor(absChildLeft)` (a preserved Yoga 3.x text-rounding quirk). Two roundings of one edge: whenever the fractional part of a leaf's absolute start crossed 0.5 it landed a column left of the edge its width had been measured against. Flex shrink is what makes the fractional parts move — so which segment is affected changes with container width, hence the interleaving.

**Fix**: flexily `layout-zero.ts` gives every child the same telescoping main-axis position (`roundedAbsMainStart - roundedAbsParentMainStart`), leaves included. The cross-axis leaf floor (the one Ink center alignment depends on) is untouched. This diverges from real Yoga by one cell for a leaf at a fractional justify offset, deliberately: Yoga rounds to a subpixel grid where the overlap is invisible, and a cell grid has no subpixels.

**Test**: `tests/features/shrunk-row-elision-sweep.test.tsx` — sweeps every width from one-cell-per-element to 80 and asserts each segment painted whole or with a marker (RED at 17 of 70 widths before the fix, on both the `Breadcrumb` component and a bare row of `<Text wrap="truncate">`). The layout invariant itself is pinned upstream in flexily's `tests/main-axis-tiling.test.ts` (RED at 17 of 45 widths).

**Lesson**: when text is cut with no elision marker, check whether the node's neighbours OVERLAP it before touching the text path. The pipeline paints each node into the box layout gave it; a box that overlaps its sibling is destroyed from the outside, and the last cell — the one an elision marker occupies — is exactly the cell a later sibling reaches first. Two symptoms name this class: a cut with no marker, and a stray blank cell in an otherwise contiguous row. And when a rendering defect is width-dependent, SWEEP the widths — a defect whose broken widths interleave with correct ones cannot be characterised, or fixed, from three samples.

## `wrap="truncate"` Escaped Its Bordered Parent — but Only in a COLUMN (2026-08-13)

**Symptom**: on the yrd `watch` RUNNER box, `uncarried 41 of 4784 refs, …` painted straight over the frame's right `│` and was cut by the TERMINAL edge, losing its trailing `as of 4m ago` clause. The same `<Text wrap="truncate">` inside a flex ROW truncated perfectly at the inner width. Call sites worked around it by flipping to `wrap="wrap"`.

**The blind path**: it reads as a paint bug (text overprinting a border) or an auto-min-size bug, and `minWidth={0}` — the canonical escape hatch for a truncate Text pinned at natural width, used by several existing tests — does NOT fix it. Both misread the axis. Dumping `boxRect` settles it in one look: the Text is laid out 49 cells wide inside a 22-cell content box, so layout handed render an out-of-parent box and render painted it faithfully.

**Root cause — the measureFunc, in `ag-react/src/reconciler/nodes.ts`.** For non-wrappable text (`wrap=truncate*|clip|false`) it returned natural width for EVERY query except min-content, on the theory that truncation is a paint-phase concern. Logging the queries shows why that is only half safe:

- ROW (main axis): flexily asks `min-content` → the branch answers 1 → flex-shrink pulls the item to 22. Correct by rescue.
- COLUMN (cross axis): flexily asks `at-most 22` → the branch answers 49 → and NO min-content query is ever issued, so nothing shrinks. Natural width becomes the used width.

The intrinsic-vs-used distinction is the whole bug: `undefined` is a genuine max-content query, but `at-most`/`exactly` is the container stating how much room the item actually GETS. Answering the second with intrinsic width puts the item outside its parent's content box.

**Fix**: the `maxWidth` clamp now applies to non-wrappable text too — `isMinContentQuery ? actualWidth : Math.min(actualWidth, maxWidth)`. It is inert on max-content (`maxWidth` is `Infinity` when `widthMode` is `"undefined"`, so shrink-wrap parents still size to full natural width) and inert on min-content (its own branch). The height branch immediately above had already honored `at-most` for the identical reason — text overflowing into parent border ROWS — so the fix is really the restoration of a symmetry that was only ever half-built. Side effect: silvery's default now matches Ink's historical `min(natural, N)`, so the Ink-compat measureFunc shim became dead and was removed.

**Test**: `tests/features/truncate-clips-to-bordered-parent.test.tsx` — asserts rendered CHARACTERS and the surviving border cell across both axes, `wrap="clip"`, nested columns, plus the two directions the clamp must NOT bite (an unconstrained parent still shrink-wraps to full natural width; a child narrower than its budget is not stretched). RED only on the column cases before the fix.

**Lesson**: a measureFunc is asked two different questions through one callback, and the width mode is the only thing distinguishing them. Answer a DEFINITE budget with an intrinsic size and the error is invisible on the main axis — flex shrink plus the min-content query silently repairs it — and structural on the cross axis, where neither exists. So "works in a row, breaks in a column" is not a curiosity to note and route around; it is the signature of an intrinsic-sizing answer given to a used-size question. Check the other axis before believing a measure bug is fixed, and check the other DIRECTION of the clamp (max, never min) before believing it is safe.

## A Second Renderer Erased the First's Dirty Bits — Residue in the Rightmost Column (2026-08-19)

**Symptom**: in `yrd watch`, stale glyphs accumulated in the rightmost columns of the terminal — content from earlier frames that should have been cleared. Recurring, re-reported, `#undead` class. Tracked as `@km/silvery/render-no-stale-residue-invariant` (P1).

**The blind path**: the residue instrument (`SILVERY_STRICT=residue,2`) is a per-frame sentinel-compare, so the natural move is to hunt for a cascade gap in the frame it flags — a missing `bgRefillNeeded`, an `ancestorCleared` chain that stops early, a clip that under-clears. Every one of those is a property of ONE tree, and the check stays green for a single renderer no matter how the fixture is shaped. Two renderers rendering side by side stay green too, which is what makes this so easy to file as unreproducible: `rerender()` marks dirty and runs the pipeline in one synchronous step, so two interleaved renderers never interleave INSIDE the window that matters.

**Root cause — `renderEpoch`, a module-level counter in `packages/ag/src/epoch.ts`, shared by every render tree in the process.** Dirty flags are not booleans; they are epoch stamps. The reconciler writes `node.dirtyEpoch = <current epoch>`, and `isDirty()` reports true only while that stamp still equals the current epoch. `renderPhase` ends with `advanceRenderEpoch()`, which is exactly what makes clearing O(1) — and, while the counter was global, what let ANY renderer clear EVERY renderer's pending flags.

The window is real because React's commit and the pipeline are separate steps: `updateContainerSync` + `flushSyncWork` stamp the bits, and `doRender()` consumes them afterwards. Anything that renders a second surface in between — a layout effect driving another pane, an async `setState` whose re-render is scheduled, a measurement feedback loop — advances the shared counter first. The victim's changed nodes then read clean, the fast-path skip keeps their pixels from the cloned buffer, and the previous frame survives on screen. `dirty-tracking.ts`'s node sets had the identical shape: `clearDirtyTracking()` was global, and `hasScrollDirty()` gates the layout phase, so a peer's frame could leave a tree painting at stale scroll offsets.

Why the RIGHTMOST column specifically: a skipped repaint keeps whatever the previous frame drew, and the widest thing a row draws is its trailing run — padded filler and the right-edge marker. A cursor highlight that moved off a row left its `#####…<<<<` tail standing at the right edge, while the shorter left-hand text was overwritten by the row that DID repaint.

**Fix**: the epoch moved onto an `EpochOwner` that one tree owns and no other can reach, hung off every node as `node.epochOwner`. The predicates take the node (`isDirty(node, BIT)`, `markDirty(node, BITS)`, `advanceRenderEpoch(root)`) rather than raw `(bits, epoch)` pairs — smaller at the call site, and impossible to answer from the wrong tree. Nodes are born into their tree: `createInstance` / `createTextInstance` read `rootContainer.root.epochOwner`, which React passes and the host config had been discarding as `_rootContainer`. So there is no adoption pass and no window where a node's bits answer to the wrong renderer. The dirty-node sets moved to a `WeakMap` keyed by the same owner.

Structural ownership rather than a scoped save/restore global was deliberate: the framework already bans that shape (root `CLAUDE.md`, the `wasRaw` anti-pattern), and a scope would have reintroduced the same defect the moment a React commit ran outside it.

**Test**: `tests/features/residue-cross-render.test.tsx` — a peer renderer drives a frame from the subject's layout effect, inside the commit→pipeline window. The single-renderer control passes before and after; the subject is red before the fix, reporting `ALL DIRTY FLAGS FALSE - fast-path likely skipped this node` with the previous cursor row's highlight still painted.

**Lesson**: a per-frame instrument answers "was THIS frame self-consistent", so it can only ever see defects living inside one tree's frame. When a check is green in isolation and the report is not, stop reshaping the fixture and start asking what else is in the process — the leak is in state the frame does not own. And a global counter used as a clock is invisible until there are two clocks: an epoch, a frame id, a "current pass" marker is safe exactly as long as one renderer exists, which is a property of the test suite, never of the framework.

## A Second App Restyled the First — the Color Tier Was a Module Global (2026-08-19)

**Symptom**: none reported. This was the remainder flagged while fixing the render-epoch leak above, commissioned on its own and reproduced before any change.

**Root cause — `_activeColorLevel`, a module-level in `pipeline/state.ts`, assigned by `createPipeline()`.** The tier exists so `parseColor()` / `getTextStyle()` can dispatch without an OutputContext: at `"mono"`, `$tokens` resolve to no color and `getTextStyle` injects per-token SGR attrs from `DEFAULT_MONO_ATTRS` so hierarchy survives where color cannot. `createPipeline` runs at app construction and on cap re-detection — never per frame — so nothing re-established the value before a render read it, and in a process with two apps the one constructed LAST chose the tier for BOTH.

**Why this one hides better than the epoch bug.** The output phase ALSO honors `colorLevel`, but holds it per instance in a `createOutputPhase` closure — so it kept stripping color correctly no matter what the global said. A mono app that lost the tier therefore did not emit wrong colors; it emitted _nothing_: no color (output phase stripped it) and no bold/dim/underline (the attrs were never injected). The failure presents as flat, undifferentiated text — legible, plausible, and nothing like a rendering bug. The reverse direction is louder: a truecolor app next to a mono one loses every `$token` color.

**Reproduction shape.** Two `run()` apps over the headless `writable` path with caps differing only in `colorLevel`, plus a `useInput` counter so a keypress forces a second frame — the leak only shows on a render that happens AFTER the peer is constructed. Calibrate the bytes first rather than guessing: `<Text color="$primary">` emits `\x1b[1m` at mono and `\x1b[38;2;235;203;139m` at truecolor. Two traps cost real time here. The incremental diff re-emits only the CHANGED cell, so asserting on the whole token string (`toContain("tick1")`) fails for a reason that has nothing to do with the bug — assert on the SGR and add a `repainted()` guard so a silent no-op frame can't pass. And the first draft failed all three tests including the control, which proved nothing until the control was made to pass.

**Fix**: the tier travels `caps → createPipeline → PipelineConfig → createAg → PipelineContext`, and `parseColor(color, colorLevel)` / `getTextStyle(props, colorLevel)` take it as an argument. The global is deleted, along with `getActiveColorLevel` / `setActiveColorLevel`. `createRenderer({ colorLevel })` exposes it per test renderer, which is what the existing mono tests had been using the global to fake.

**Two things the typechecker could not find.** The tier parameter defaults to `"truecolor"` so leaf helpers stay callable from non-pipeline code, which means every un-threaded call site compiled clean and silently rendered at the wrong tier — the whole mono suite went red at once and had to be walked back file by file. Worse, `isStore()` disambiguates `RenderOptions` from `Store` by a list of `!("x" in obj)` traits; `{ cols, rows, colorLevel }` satisfied every one of them, so `createRenderer({ colorLevel: "mono" })` was classified as a Store and the option was dropped with no error anywhere. The probe that found it printed `NO_CTX` from inside `renderText` — three layers below where the value was lost.

**Test**: `tests/features/color-level-cross-render.test.tsx` — control (one mono app keeps its attrs across frames) plus both directions of the subject.

**Lesson**: when a value is mirrored into module state "so a deep helper can reach it", the mirror is the bug and the depth is the excuse — thread it, or the first second consumer silently inherits someone else's terminal. And when a fix replaces a global with a defaulted parameter, the default is a silent-error surface, not a convenience: the compiler stops helping exactly where the old global used to work by accident, so the migration has to be driven by the tests that exercise the non-default branch. A duplicated capability is worse than an absent one — the output phase's per-instance copy of the SAME field is what made the damage quiet.

## An Island Attached Between Frames and Nothing Marked It Dirty (2026-09-16)

**Symptom**: expanding a completed shell-command row in the ag-code transcript left the body empty. Under `SILVERY_STRICT` the createApp event loop threw `MISMATCH at (25, 23) on render #4 — incremental: char=" " fresh: char="h"`, the fresh write trap naming `renderIsland → emitOpaqueBlit`. The fresh frame painted the guest's cells; the incremental frame painted the body box's fill and nothing else. Tracked as `@si/render/24649`.

**The blind path**: the trap says the island's blit is missing, so the natural move is to hunt for the skip that dropped it — a cascade formula, a scroll tier, a clip. The render-phase stats say otherwise once you read them: on the failing frame `C=0 P=0 L=0 Ch=0 CP=0 AL=0`, i.e. not one node in the tree carried a content, style, layout or children bit. `SILVERY_CELL_DEBUG=25,23` is the instrument that settles it — the incremental walk logged the ancestor chain down to depth 14 and then stopped, with no SKIP line for the island. No SKIP line means `renderNodeToBuffer` was never CALLED: `canSkipChildSubtree` had pruned the branch before descending, correctly, because nothing in it was dirty.

**Root cause — `islandState.handle` goes from null to a live handle BETWEEN frames, and that assignment had no notification.** An island's painted content is `handle.output.buffer`, state the render tree does not own. Before the handle attaches, `renderIsland` paints the rect as blanks; after, it blits guest cells. `createIsland`'s `nodeState.handle = handle` sat in a promise continuation with nothing hanging off it, and the `<Island>` binding compensated from two places that both arrive too late:

- `onSignal({type:"ready"})` fires from INSIDE `guest.init()`, one or more microtasks before the handle exists — it marks a node that still paints blanks, and the frame that consumes that mark paints blanks.
- the output subscription (which marks dirty on attach via `requestIslandPaint`) was reached through `handleReady.then → queueMicrotask(subscribeWhenAttached) → maybe another queueMicrotask`, because `handleReady` resolves inside the guest-init wrapper, ahead of the factory's own `.then` that does the assigning.

Anything in the gap that drives a frame — and React flushes `setState` from a microtask, so the gap is full of them — renders an island whose handle is attached, whose branch is clean, and whose blanks are therefore kept from the clone. The mark that finally lands afterwards is stamped with an epoch the frame already advanced, so it expires unconsumed and nothing repaints the island until unrelated dirtiness happens to reach it. The measured trace: attach between epoch 30 and 31, mismatching frame at 31, the binding's first `markNodeDirty` with a live handle at 34.

**Fix**: `CreateIslandOptions.onAttach`, called synchronously in the same statement that assigns `nodeState.handle`. The `<Island>` binding subscribes to `handle.output` from there, which ends in `requestIslandPaint()` → `markNodeDirty(node)` — so the host node is dirty before control leaves the assignment, and no frame can be rendered in between. It also closes the second half of the window: guest output emitted before the subscription attached had no subscriber at all.

Not fixed in the pipeline, deliberately. A per-node check inside `renderNodeToBuffer` cannot see this — the walk never reaches the island, because pruning a clean subtree at the parent is the whole point of the fast path. The only place the pipeline can learn about external paint state is a dirty mark, at the instant that state changes.

**Test**: `tests/features/islands-attach-incremental-paint.test.tsx` — a transcript inside an `overflow="scroll"` container, rendering one frame per microtask generation of the init chain with only unrelated header state changing. Whichever generation attaches the handle, the next frame is the one asserted on. Red before the fix at frame #4; no `SILVERY_STRICT` needed, though the same frame throws under it.

**Lesson**: the incremental invariant is "a skipped node's pixels in the clone are still correct", and every node whose paint reads state outside the tree owes a dirty mark at the moment that state changes — not one microtask later. A deferral is not a small scheduling detail here: a frame can run inside it, and the epoch that frame advances silently voids whatever mark arrives next. Reach for `SILVERY_CELL_DEBUG=x,y` early on a "which node failed to paint" question; the absence of a SKIP line for a node that covers the cell is the difference between "skipped it" and "never looked at it", and those have opposite fixes.
