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

| Blind Path                                    | Why It Doesn't Work                                                               | What to Do Instead                                                                              |
| --------------------------------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Broader viewport clearing                     | Causes 12ms regression (re-renders ~50 children vs 2 dirty ones)                  | Only clear viewport for Tier 2 triggers (childrenDirty, scroll+sticky, childrenNeedFreshRender) |
| Using `needsOwnRepaint` for cascade           | Includes `stylePropsDirty`; border color changes cascade through ~200 child nodes | Use `contentAreaAffected` — excludes pure paint changes                                         |
| Pre-clearing only current sticky positions    | Old positions also have stale content in the buffer                               | Clear entire viewport to `null` bg                                                              |
| `hasPrevBuffer=false` without clearing buffer | Stale content remains in the cloned buffer regardless of hasPrevBuffer flag       | Clear viewport first, then set `hasPrevBuffer=false`                                            |
| `ancestorCleared=true` for sticky second pass | Transparent spacer Boxes clear their region, wiping overlapping sticky content    | Use `ancestorCleared=false` — matches fresh render semantics                                    |
| Blaming the terminal emulator                 | If 3 terminals show the same glitch, it's your code                               | Use `withDiagnostics` + `SILVERY_STRICT=1` first                                                |
| Hand-rolling VirtualTerminal tests            | Too simple to catch real app complexity                                           | Use `withDiagnostics(createBoardDriver(...))`                                                   |
| Reading code paths without a failing test     | Wastes 20+ turns on theorizing                                                    | Write failing test first, THEN trace code                                                       |
| Row pre-check: only packed metadata + chars   | Misses true-color Map diffs (fgColors/bgColors) when both cells have TC flag      | Always include `rowExtrasEquals()` in the row pre-check                                         |
| Clearing overflow at immediate parent only    | Child-level clear overwrites grandparent's border (parent-first render order)     | Use recursive `hasDescendantOverflowChanged` so the bordered ancestor detects and handles it    |

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
