# Ink Compatibility Analysis — Full Failure Breakdown

Date: 2026-03-09
Silvery version: vendor/silvery (HEAD)
Ink test suite: vadimdemedes/ink (master, cloned to /tmp/silvery-compat/ink)

## Executive Summary

| Metric          | Count        |
| --------------- | ------------ |
| Total Ink tests | 845          |
| Passed          | 662          |
| Failed          | 183          |
| Compat rate     | **78.3%**    |
| Chalk tests     | 32/32 (100%) |

The 183 failures break down into 8 categories. ~53 are layout engine differences
(Flexily vs Yoga), ~43 are PTY/process-based tests that crash because silvery's
compat layer doesn't produce a working standalone binary, and the rest are missing
features and implementation gaps in the compat layer.

## Summary by Category

| #   | Category                                  | Count    | Fixable?                                        | Effort       |
| --- | ----------------------------------------- | -------- | ----------------------------------------------- | ------------ |
| 1   | Layout engine (Flexily) gaps              | 53       | Fix in Flexily or expose more LayoutNode API    | Large        |
| 2   | PTY/process-spawn test infrastructure     | 43       | Need fixture executables that work with silvery | Medium       |
| 3   | Screen reader / ARIA (missing feature)    | 18       | Implement in silvery                            | Medium       |
| 4   | Cursor management (missing feature)       | 13       | Implement useCursor / cursor positioning        | Large        |
| 5   | ANSI sanitization (text passthrough)      | 7        | Fix sanitize logic in compat Text               | Small        |
| 6   | Compat layer rendering bugs               | 24       | Fix in compat layer                             | Small-Medium |
| 7   | Kitty keyboard protocol (missing feature) | 8        | Implement kitty protocol detection/mode         | Medium       |
| 8   | Timeouts (cascading from other failures)  | 5        | Fix underlying issues                           | N/A          |
| 9   | Unexpected passes (test marking issue)    | 3        | Remove `.failing()` marks in Ink tests          | Trivial      |
|     | **Unique failures**                       | **~174** |                                                 |              |

Note: Some failures overlap (e.g., timeout failures cascade from earlier test hangs).

---

## Category 1: Layout Engine (Flexily) Gaps — 53 failures

These fail because Flexily's layout computation differs from Yoga's in specific
edge cases. Ink uses Yoga; silvery defaults to Flexily.

### 1a. alignContent (11 tests)

All `flex-align-content` tests fail. Flexily produces different vertical
distribution than Yoga for `alignContent: center/flex-start/flex-end/space-between/space-around/space-evenly`.

**Example**: `alignContent="center"` with 6-row container containing 2 rows of content.

- Yoga: `\n\nAB\nCD\n\n` (content centered vertically)
- Flexily: `AB\n\n\nCD\n\n` (content at top, wrong spacing)

**Tests**: All 11 in `flex-align-content.tsx` (including concurrent variants and rerender/clear tests)

**Ideal solution**: Fix alignContent distribution in Flexily to match Yoga behavior.
**Severity**: 3/5 — alignContent is commonly used for vertical centering.

### 1b. flexBasis (4 tests)

`flexBasis` in both px and percent fails for row and column containers.

**Example**: `flexBasis={3}` with `flexDirection="row"` and 7-column container.

- Yoga: `A  B` (each child gets 3 columns)
- Flexily: `AB` (flexBasis ignored, children are intrinsic width)

**Tests**: 4 in `flex.tsx`

**Ideal solution**: Fix flexBasis computation in Flexily.
**Severity**: 3/5 — flexBasis is fundamental to flexbox layouts.

### 1c. flexWrap (6 tests)

Wrap and wrap-reverse produce wrong layout for both row and column directions.

**Example**: `flexWrap="wrap"` with `width={2}` containing A, B, C:

- Yoga: `A\nBC` (A wraps to next line)
- Flexily: `BC` (content dropped or misplaced)

**Tests**: All 6 in `flex-wrap.tsx`

**Ideal solution**: Fix wrap algorithm in Flexily.
**Severity**: 3/5 — wrap is essential for responsive layouts.

### 1d. Position offsets (10 tests)

Absolute and relative positioning with `top/left/bottom/right` offsets not supported.
silvery's `BoxProps` don't include these properties. The LayoutNode interface lacks
`setPosition(edge, value)` even though Flexily's Node supports it.

**Example**: `position="absolute" top={1} left={2}`:

- Yoga: `\n  X\n` (X offset by 1 row, 2 columns)
- Flexily/silvery: `X\n\n` (no offset applied)

**Tests**: All 10 in `position.tsx`

**Ideal solution**:

1. Add `setPosition(edge, value)` and `setPositionPercent(edge, value)` to LayoutNode interface
2. Add `top/left/bottom/right` props to BoxProps
3. Wire them through reconciler/nodes.ts

**Severity**: 4/5 — Position offsets are important for overlays, tooltips, absolute positioning.

### 1e. aspectRatio (5 tests)

`aspectRatio` prop not implemented. Flexily supports `setAspectRatio()` but
silvery's LayoutNode interface doesn't expose it, nor do BoxProps include it.

**Example**: `aspectRatio={2}` with `height={3}`:

- Yoga: width=6 (height \* ratio)
- Silvery: width=full-container (falls back to default)

**Tests**: 5 in `width-height.tsx` (aspect ratio with width, height, width+height, maxHeight, clear on rerender)

**Ideal solution**:

1. Add `setAspectRatio(value)` to LayoutNode interface
2. Add `aspectRatio` prop to BoxProps
3. Wire through reconciler

**Severity**: 2/5 — Rarely used in TUI apps.

### 1f. maxWidth / minWidth (3 tests)

`minWidth` applies but produces slightly different sizing. `maxWidth` not properly
constraining in some cases. `maxHeight` percent not working correctly.

**Tests**: 3 in `width-height.tsx` (set min width, set max width, clears maxWidth on rerender, set max height in percent)

**Ideal solution**: Debug specific Flexily min/max computation differences.
**Severity**: 2/5

### 1g. alignSelf baseline (1 test)

`alignSelf="baseline"` produces wrong vertical alignment.

**Test**: 1 in `flex-align-self.tsx`

**Severity**: 1/5 — baseline alignment is rare in TUI.

### 1h. justifyContent space-evenly (1 test)

Space-evenly distribution slightly different (off-by-one in spacing).

**Example**: 7-column container with A and B:

- Yoga: `  A   B` (2-3-2 spacing)
- Flexily: `   A  B` (3-2-2 spacing)

**Test**: 1 in `flex-justify-content.tsx`

**Severity**: 2/5

### 1i. gap combined with column gap (2 tests)

`gap` (combined row+column) missing the column gap component.

**Example**: gap=1 with row+column layout:

- Yoga: `A B\n\nC` (space between A/B AND blank line before C)
- Flexily: `A B` (row gap works, column gap missing)

**Tests**: 2 in `gap.tsx`

**Severity**: 2/5

### 1j. Borders with alignment/partial hiding (10 tests)

Border rendering differs for:

- Boxes with horizontal/vertical alignment inside borders
- Hiding specific border sides (left, right, left+right)
- Custom border styles (arrow style uses wrong characters)
- Wide characters with borders in column direction

**Example (hide left border)**:

- Ink: ` ──────╮\nContent│\n ──────╯`
- silvery: `──────╮\nContent│\n──────╯` (wrong width, missing leading space)

**Example (custom "arrow" border)**:

- Ink: bottom row `↗↑↑↑↑...↖`, right side `←`
- silvery: bottom row `↗↓↓↓↓...↖`, right side `→` (wrong characters for bottom/right)

**Tests**: 10 in `borders.tsx`

**Ideal solution**: Fix border rendering logic in silvery's content phase:

1. Partial border hiding width calculation
2. Custom border style character mapping (bottom/right characters)
3. Border + alignment interaction

**Severity**: 3/5 — borders are commonly used.

---

## Category 2: PTY/Process-Spawn Tests — 43 failures

These tests spawn a real terminal process via `node-pty`, run a fixture file that
imports from `ink`, and communicate via stdin/stdout. They fail because the fixture
process crashes (`Process exited with non-zero exit code: 1`) — the silvery compat
shim doesn't work as a standalone Node.js import without the full silvery runtime.

### Tests affected:

| File                           | Count                    | Feature tested                                 |
| ------------------------------ | ------------------------ | ---------------------------------------------- |
| hooks-use-input.tsx            | 15 (3 fail + 12 timeout) | \r handling, pasted CR/tab, various key inputs |
| hooks-use-input-kitty.tsx      | 8                        | Kitty protocol key events                      |
| hooks-use-input-navigation.tsx | 4                        | Meta + arrow keys                              |
| hooks-use-paste.tsx            | 4                        | Bracketed paste mode                           |
| hooks.tsx                      | 2 (+ 1 timeout)          | MaxListeners, Ctrl+C kitty, useStdout write    |
| components.tsx                 | ~8 (+ timeout)           | Raw mode, stdin ref, alternate screen          |

**Root cause**: The test fixtures do `import {render, useInput} from '../src/index.js'`
and then start an interactive Ink app. The silvery shim redirects this to the compat
bundle, but the bundle lacks proper interactive terminal initialization (it only
handles the test-mode stdout path, not real TTY mode).

**Ideal solution**: Make silvery's interactive render path (`renderSync`) work when
invoked through the compat shim's non-custom-stdout path. This requires the compat
`render()` function's interactive branch to properly initialize stdin, handle raw
mode, and produce the `__READY__` signal the test fixtures expect.

**Severity**: 3/5 — These test real keyboard interaction which is important for
migration, but most apps would test interactively in their own framework.

---

## Category 3: Screen Reader / ARIA — 18 failures

Silvery does not implement screen reader mode. Ink's `renderToString` accepts an
`isScreenReaderEnabled` option that produces accessible text output with ARIA roles,
states, and labels instead of visual rendering.

### Tests affected:

All 18 tests in `screen-reader.tsx`:

- render text for screen readers (basic aria-label)
- render with aria-hidden
- render with aria-role (button, list, listitem, listbox, option)
- render with aria-state (busy, checked, disabled, expanded, multiline, multiselectable, readonly, required, selected)
- render nested row (space-separated)
- render multi-line text with roles
- render listbox with multiselectable options
- render select input for screen readers

**Example**: `<Box aria-role="button"><Text>Click me</Text></Box>` with screen reader:

- Ink: `button: Click me`
- silvery: `Click me` (ignores ARIA, renders visually)

**Ideal solution**: Implement an alternative rendering mode in `renderToString` that:

1. Walks the component tree extracting aria-label, aria-role, aria-state
2. Produces text output following ARIA semantics instead of visual layout
3. Accept `isScreenReaderEnabled` option

**What silvery should actually do**: This is a niche feature. For Ink migration compat,
implement it in the compat layer's `renderToString` only. Silvery-native apps would
likely use a different accessibility approach.

**Severity**: 2/5 — Important for accessibility compliance but rarely used in practice
for TUI apps.

---

## Category 4: Cursor Management — 13 failures

Silvery's compat `useCursor()` is a no-op stub. Ink's cursor system tracks cursor
visibility (show/hide sequences), position, and integrates with useStdout/useStderr
writes.

### Tests affected:

All 13 tests in `cursor.tsx`:

- cursor shown at specified position after render
- cursor not hidden by useEffect after first render
- cursor follows text input
- cursor moves on space input
- cursor cleared when useCursor component unmounts
- screen does not scroll up on subsequent renders
- cursor remains visible after useStdout/useStderr.write()
- debug mode: replay frame after hook write (5 tests)

**Root cause**: The compat layer's `useCursor()` returns `{ setCursorPosition: () => {} }` —
it doesn't actually control cursor visibility or position. Ink's cursor system emits
`\x1b[?25h` (show) and `\x1b[?25l` (hide) sequences and tracks cursor column/row.

**Ideal solution**: Implement cursor tracking in the compat render path:

1. Track cursor show/hide state
2. Emit cursor position sequences when `setCursorPosition` is called
3. Ensure cursor visibility is preserved across useStdout/useStderr writes
4. In debug mode, replay the latest frame content after hook writes

**Severity**: 3/5 — Important for text input components (which silvery handles
differently through its own TextInput).

---

## Category 5: ANSI Sanitization / Text Passthrough — 7 failures

The compat `Text` component sanitizes ANSI sequences in children. But the
sanitization is stripping sequences that should be preserved, or the rendered
output doesn't contain the original sequences because silvery's renderer
processes them differently.

### Tests affected:

7 tests in `text.tsx`:

- preserve SGR color sequences in text
- preserve OSC hyperlink sequences (BEL terminator)
- preserve OSC hyperlink sequences (ST terminator)
- preserve C1 OSC sequences
- preserve C1 OSC hyperlink sequences with ST terminator
- preserve SGR sequences with colon parameters (e.g., `\x1b[38:2::255:100:0m`)
- preserve SGR sequences around stripped SOS control strings

**Root cause**: silvery's renderer processes text content through its own styling
pipeline. When text contains raw ANSI sequences (like pre-colored text or hyperlinks),
silvery's renderer either:

1. Strips them during its own ANSI processing
2. Re-encodes them in silvery's format (losing the original sequences)
3. The `FORCE_COLOR=0` env causes all ANSI to be stripped

The issue is architectural: silvery uses a cell-based buffer where each cell has
structured style data. Raw ANSI sequences in text content would need to be parsed
into cell styles and then re-emitted, which may not round-trip perfectly.

**Ideal solution**: In the compat Text component, detect pre-styled text content
(containing ANSI sequences) and either:

1. Parse the sequences into silvery's style model (preserving them through rendering)
2. Pass them through unmodified as "raw" content that bypasses the styling pipeline

Option 2 is simpler but breaks the cell-buffer model. Option 1 is correct but
requires silvery's renderer to support "inherited ANSI styles" on text nodes.

For hyperlinks specifically, silvery would need to support OSC 8 sequences in its
style model.

**Severity**: 4/5 — Pre-styled text (e.g., chalk-colored strings, hyperlinks) is
extremely common in CLI apps. This is a significant migration blocker.

---

## Category 6: Compat Layer Rendering Bugs — 24 failures

These are bugs in the compat layer itself, not in silvery's core.

### 6a. Transform / squash text (4 tests)

The Transform component and text squashing (multiple adjacent text nodes) render
incorrectly. Transform output gets truncated or loses inner structure.

**Example** (squash multiple text nodes):

- Ink: `[0: {0: hello world}]` (transform sees full concatenated text)
- silvery: `[0: hello w` (truncated, doesn't concatenate before transform)

**Tests**: 4 in `components.tsx` (transform children, transform with multiple lines, squash multiple text nodes, squash multiple nested text nodes)

**Root cause**: silvery's Transform applies to each rendered line independently.
When transform expects the full concatenated text (including text from multiple
child Text nodes), it only sees partial content.

**Severity**: 3/5

### 6b. Static output (3 tests)

Static component output positioning is wrong — static content appears inline
instead of above the main content.

**Example**:

- Ink: `A\nB\nC\n\n\nX` (static items A,B,C above dynamic X)
- silvery: `A\nBX\nC\n` (items merged with dynamic content)

**Tests**: 3 in `components.tsx` (static output, skip previous static, render only new items in final render)

**Root cause**: silvery's Static component is a simple wrapper that renders all items
in a Box. It doesn't implement Ink's "write-once" behavior where static content is
output above the main UI and never re-rendered.

**Severity**: 3/5 — Static is commonly used for logs/progress.

### 6c. Background inheritance (2 tests)

Background color inheritance between Text elements has edge cases.

**Example** (mixed bg inheritance):

- Ink: `\x1b[42mInherited \x1b[49mNo BG \x1b[41mRed BG\x1b[49m`
- silvery: `\x1b[42mInherited No BG \x1b[41mRed BG\x1b[49m` (bg bleeds into "No BG" span)

**Test 2** (Text-only backgroundColor): Text bg should color only the text content,
not fill the full Box width. silvery fills full width but drops trailing space.

**Tests**: 2 in `background.tsx`

**Severity**: 2/5

### 6d. Error display formatting (1 test)

Error boundary output has indentation differences in source code display.

**Example**: Source lines have different whitespace indentation (tab vs spaces).

**Test**: 1 in `errors.tsx`

**Severity**: 1/5 — Cosmetic difference.

### 6e. Reconciler style prop removal (1 test)

When a style prop (like `marginLeft`) is removed on rerender, the old style persists.

**Example**: First render `marginLeft={1}` then rerender without it:

- Ink: ` X` on first render, `X` on rerender (margin removed)
- silvery: empty string on rerender

**Test**: 1 in `reconciler.tsx`

**Severity**: 3/5 — Prop removal should work correctly.

### 6f. renderToString edge cases (2 tests)

1. `renderToString` captures effect-driven state updates instead of initial render
   (silvery runs effects synchronously in renderStringSync)
2. Text outside `<Text>` doesn't throw (silvery allows bare text)

**Tests**: 2 in `render-to-string.tsx`

**Severity**: 2/5

### 6g. Text validation (3 tests)

silvery doesn't enforce Ink's component hierarchy rules:

- Text nodes must be inside `<Text>` (silvery allows bare text in `<Box>`)
- `<Box>` cannot be inside `<Text>` (silvery allows it)

**Tests**: 3 in `components.tsx`

**Severity**: 2/5 — These are developer experience guardrails, not functionality.

### 6h. Overflow edge cases (3 tests)

Overflow clipping has differences:

- Multiple text nodes with border: word breaks differently
- Box intersecting left edge: left border character rendered vs clipped
- Out-of-bounds writes: border rendering broken (no right border, no content fill)

**Tests**: 3 in `overflow.tsx`

**Severity**: 3/5

### 6i. stdin/raw mode stubs (3 tests)

`setRawMode` and stdin ref tracking are stubs. Tests that verify raw mode is set/unset
and stdin is ref'd/unref'd fail.

**Tests**: 3 in `components.tsx`

**Severity**: 2/5 — Only matters for interactive compat.

### 6j. useWindowSize fallback (1 test)

`useWindowSize` falls back to 24 rows when `stdout.rows` is undefined, instead of
checking `terminal-size` package.

**Test**: 1 in `terminal-resize.tsx`

**Severity**: 1/5

### 6k. useBoxMetrics (12 tests)

`useBoxMetrics` is a stub returning zeros. All 12 tests fail because no layout
metrics are ever returned.

**Tests**: All 12 in `use-box-metrics.tsx`

**Ideal solution**: Wire `useBoxMetrics` to silvery's layout system. silvery already
computes layout rects — the hook needs to read `contentRect` from the corresponding
node.

**Severity**: 3/5 — Used for responsive layouts.

### 6l. measureElement (5 tests)

`measureElement` returns stale/zero values after state changes because the compat
layer's layout stabilization doesn't properly re-measure after React state updates.

**Tests**: 5 in `measure-element.tsx`

**Severity**: 3/5

---

## Category 7: Kitty Keyboard Protocol — 8 failures

silvery's compat layer doesn't implement Ink's kitty keyboard protocol detection,
enable/disable sequences, and auto-detection logic.

### Tests affected:

All 8 tests in `kitty-keyboard.tsx`:

- Writes enable sequence on init
- Writes disable sequence on unmount
- Auto detection: handles synchronous/Uint8Array query response
- Auto detection: preserves split UTF-8 input bytes
- Auto detection: timeout preserves query prefix without digits
- Auto detection: ignores query response without digits
- Auto detection: preserves invalid query-like escape sequence

**Root cause**: silvery has its own terminal protocol handling but doesn't implement
Ink's specific kitty keyboard detection/negotiation API.

**Severity**: 2/5 — Kitty protocol is a progressive enhancement. Most terminals
work without it.

---

## Category 8: Timeouts — 5 failures

5 "Timed out while running tests" entries. These cascade from earlier test failures
that leave the test runner stuck:

- components.tsx: 31 tests pending (cascading from alternate screen failures)
- hooks-use-input.tsx: 12 tests pending (cascading from PTY crash)
- hooks.tsx: 1 test pending (cascading from PTY crash)
- 2 additional timeout entries at end of suite

These are not unique failures — they represent tests that never ran due to earlier
hangs.

---

## Category 9: Unexpected Passes — 3

These are tests marked `.failing()` in Ink's test suite that now pass with silvery:

- `flex-justify-content › row - align two text nodes with equal space around them`
- `flex-justify-content › column - align two text nodes with equal space around them`
- `width-height › set min width in percent`

These are Ink/Yoga bugs that Flexily gets right. The `.failing()` marks should be
removed if running against silvery.

---

## Yoga vs Flexily Analysis

**Could not run with Yoga** because the compat layer hardcodes `createFlexilyZeroEngine()`
synchronously. The Yoga adapter requires async WASM initialization (`initYogaEngine()`).
Modifying the compat source was out of scope for this analysis.

### Theoretical Yoga Impact

The following layout failures would likely be fixed by switching to Yoga, since Ink's
test suite was written against Yoga:

| Category             | Tests | Would Yoga fix?                                                                                                              |
| -------------------- | ----- | ---------------------------------------------------------------------------------------------------------------------------- |
| alignContent         | 11    | **Yes** — Yoga is the reference                                                                                              |
| flexBasis            | 4     | **Yes**                                                                                                                      |
| flexWrap             | 6     | **Yes**                                                                                                                      |
| position offsets     | 10    | **Partially** — Yoga supports position offsets, but silvery's LayoutNode interface doesn't expose `setPosition(edge, value)` |
| aspectRatio          | 5     | **Partially** — same interface gap                                                                                           |
| min/max width/height | 3     | **Probably**                                                                                                                 |
| alignSelf baseline   | 1     | **Yes**                                                                                                                      |
| justify space-evenly | 1     | **Yes**                                                                                                                      |
| gap combined         | 2     | **Maybe**                                                                                                                    |
| Borders              | 10    | **No** — border rendering is in silvery's content phase, not the layout engine                                               |

**Estimated Yoga impact**: ~28-33 additional passes (out of 53 layout failures),
bringing compat from 78.3% to ~82%.

The remaining ~20 layout-related failures (position offsets, aspectRatio, borders)
require changes to silvery's LayoutNode interface and rendering pipeline regardless
of which layout engine is used.

### Recommendation for Yoga Testing

To enable Yoga testing, modify `packages/compat/src/ink.ts`:

1. Change `createFlexilyZeroEngine()` calls to use `SILVERY_ENGINE` env var
2. If `SILVERY_ENGINE=yoga`, use `await initYogaEngine()` (requires making render async or using top-level await)
3. Run: `SILVERY_ENGINE=yoga bun run compat ink`

---

## Prioritized Recommendations

### High Priority (would fix most failures)

1. **Fix Flexily layout gaps** (28+ tests) — alignContent, flexBasis, flexWrap, space-evenly, baseline. These are core flexbox features.

2. **Expose position offsets and aspectRatio through LayoutNode** (15 tests) — Both Flexily and Yoga support these; silvery's abstraction layer just doesn't expose them. Add to LayoutNode, BoxProps, and reconciler.

3. **Fix ANSI passthrough in text** (7 tests) — Pre-styled text with chalk colors and hyperlinks is the most common Ink pattern. silvery needs to preserve inline ANSI sequences through its rendering pipeline.

4. **Implement useBoxMetrics** (12 tests) — silvery already computes layout rects. Wire the hook to read them.

### Medium Priority

5. **Fix Static component** (3 tests) — Implement proper write-once semantics.

6. **Fix Transform text concatenation** (4 tests) — Transform should receive full concatenated text, not partial lines.

7. **Fix border edge cases** (10 tests) — Partial border hiding, custom styles, alignment interaction.

8. **Make PTY fixtures work** (43 tests) — Fix interactive render path in compat layer.

### Low Priority

9. **Implement screen reader mode** (18 tests) — ARIA rendering for accessibility.

10. **Implement cursor tracking** (13 tests) — cursor show/hide/position for IME support.

11. **Implement kitty protocol detection** (8 tests) — Progressive enhancement.

12. **Fix remaining compat layer bugs** — error formatting, text validation, reconciler style removal, stdin stubs.

---

## Path to 90% Compatibility

Fixing items 1-4 above would resolve approximately 62 failures, bringing the total
from 662/845 (78.3%) to ~724/845 (85.7%).

Adding items 5-7 would resolve another ~17 failures: ~741/845 (87.7%).

Getting PTY fixtures working (item 8) would add ~43 more: ~784/845 (92.8%).

The remaining ~61 failures (screen reader, cursor, kitty protocol) are specialized
features that could be deprioritized for an initial migration story.
