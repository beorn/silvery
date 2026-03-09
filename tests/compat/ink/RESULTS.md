# Ink Compatibility Audit Results

Date: 2026-03-09
Silvery version: vendor/silvery (HEAD)
Ink version: 5.2.1 (tests adapted from github.com/vadimdemedes/ink)

## Summary

| Category    | Passed | Total | %          |
| ----------- | ------ | ----- | ---------- |
| **Chalk**   | 28     | 28    | **100.0%** |
| **Ink**     | 67     | 122   | **54.9%**  |
| **Overall** | 95     | 150   | **63.3%**  |

## Per-File Results

### Chalk (100% - all pass)

| File             | Pass | Fail | Total | Status |
| ---------------- | ---- | ---- | ----- | ------ |
| chalk.test.ts    | 20   | 0    | 20    | PASS   |
| instance.test.ts | 2    | 0    | 2     | PASS   |
| level.test.ts    | 3    | 0    | 3     | PASS   |
| visible.test.ts  | 3    | 0    | 3     | PASS   |

### Ink

| File                      | Pass | Fail | Total | Status |
| ------------------------- | ---- | ---- | ----- | ------ |
| display.test.tsx          | 4    | 0    | 4     | PASS   |
| flex-direction.test.tsx   | 7    | 0    | 7     | PASS   |
| flex.test.tsx             | 0    | 8    | 8     | FAIL   |
| gap.test.tsx              | 2    | 4    | 6     | FAIL   |
| margin.test.tsx           | 11   | 2    | 13    | FAIL   |
| padding.test.tsx          | 11   | 2    | 13    | FAIL   |
| position.test.tsx         | 0    | 8    | 8     | FAIL   |
| render-to-string.test.tsx | 20   | 8    | 28    | FAIL   |
| text.test.tsx             | 7    | 15   | 22    | FAIL   |
| width-height.test.tsx     | 5    | 8    | 13    | FAIL   |

## Failure Analysis

### Category 1: Layout - flexDirection row not applied (32 failures)

All tests involving `flexDirection="row"` on a parent Box render children vertically
(column layout) instead of horizontally. This affects flex, gap, width-height,
padding/margin X+right, and render-to-string layout tests.

**Root cause**: Silvery's renderStringSync may not apply `flexDirection="row"` the
same way as Ink's Yoga-based layout. Children stack vertically regardless of the
`flexDirection` prop in string rendering mode.

**Affected files**: flex.test.tsx (8/8), gap.test.tsx (4/6), width-height.test.tsx (8/13),
margin.test.tsx (2/13), padding.test.tsx (2/13), render-to-string.test.tsx (4/28)

### Category 2: ANSI code format differences (15 failures)

Silvery uses a different SGR encoding style than chalk:

- Silvery: `\x1b[0;38;5;2m` (reset-prefix style)
- chalk: `\x1b[32m` (direct style)

Both are semantically equivalent (produce the same visual output), but byte-level
comparison fails. Also, Silvery uses `\x1b[0m` as the close sequence for all styles
rather than chalk's per-attribute close codes (`\x1b[39m`, `\x1b[27m`, etc.).

**Affected files**: text.test.tsx (12/15), render-to-string.test.tsx (2/28)

### Category 3: Position (absolute/relative/static) not supported (8 failures)

Silvery does not implement CSS-style absolute/relative/static positioning with
top/left/bottom/right offsets. All positioned elements render in normal flow.

**Affected files**: position.test.tsx (8/8)

### Category 4: ANSI cursor/erase sequence stripping (2 failures)

Silvery does not strip ANSI cursor movement sequences (`\x1b[1A`, `\x1b[2K`,
`\x1b[5;10H`, `\x1b[2J`) from text content. Ink strips these to prevent terminal
corruption.

**Affected files**: text.test.tsx (2/15)

### Category 5: Behavioral differences (3 failures)

- `render empty fragment`: Silvery renders a full-height empty buffer (newlines) instead of empty string
- `captures initial render output before effect-driven state updates`: renderStringSync runs effects synchronously, so it captures final state instead of initial
- `text outside Text component throws`: Silvery does not throw when raw text is placed outside `<Text>`, it renders it

**Affected files**: render-to-string.test.tsx (3/28)

## Ink Test Files Not Yet Ported

The following Ink test files were not converted in this audit. They represent
additional surface area for future compatibility work.

### Layout tests (renderToString-based, portable):

- overflow.tsx (40 tests)
- borders.tsx (52 tests)
- background.tsx (28 tests)
- flex-justify-content.tsx (10 tests)
- flex-align-items.tsx (9 tests)
- flex-align-self.tsx (9 tests)
- flex-align-content.tsx (6 tests)
- flex-wrap.tsx (6 tests)
- text-width.tsx (5 tests)

### Interactive tests (require render() with stdout/stdin, harder to port):

- focus.tsx (27 tests)
- components.tsx (71 tests) - Ink-specific components (Static, Transform, etc.)
- hooks.tsx - useApp, useStdout hooks
- hooks-use-input.tsx - useInput hook
- hooks-use-paste.tsx - usePaste hook
- kitty-keyboard.tsx (64 tests)
- screen-reader.tsx (25 tests)
- measure-element.tsx (4 tests)
- use-box-metrics.tsx (13 tests)

### Utility tests (non-React):

- ansi-tokenizer.ts (26 tests)
- input-parser.ts (43 tests)
- sanitize-ansi.ts (29 tests)
- cursor-helpers.ts (17 tests)

## Methodology

- Ink tests from AVA framework were manually converted to vitest
- `import {render} from 'ink'` replaced with Silvery's `renderToString`/`renderToStringAsync` helpers
- `import chalk from 'chalk'` kept as-is (used directly, not through Silvery compat)
- `strip-ansi` replaced with Silvery's own `stripAnsi` from `@silvery/ansi`
- Silvery's `renderStringSync` wraps output with `\x1b[0m` at start/end; a `stripBufferResets()` helper removes these to match Ink's output format
- Layout engine must be initialized async before string rendering; tests use `beforeAll(async () => await initLayoutEngine())`
- Tests run with `bun vitest run --project vendor vendor/silvery/tests/compat/`

## Recommendations

1. **Fix flexDirection="row" in string rendering** - This single issue would fix ~32 of 55 failures, bringing Ink compat from 55% to ~84%
2. **Normalize SGR output format** - Match chalk's encoding style (or provide a flag) to pass color comparison tests
3. **Port remaining layout tests** - overflow, borders, background, flex-align/justify/wrap, text-width (~165 more tests)
4. **Implement position offsets** - absolute/relative positioning with top/left/bottom/right
5. **Strip cursor/erase ANSI sequences** from text content to match Ink's sanitization behavior
