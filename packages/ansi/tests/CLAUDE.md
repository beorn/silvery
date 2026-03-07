# ansi Tests

**Layer 0 — Terminal Colors and Styling**: ANSI output, extended underlines, hyperlinks, and terminal capability detection.

## What to Test Here

- **Detection**: `detectExtendedUnderline()` across terminal types (Ghostty, Kitty, WezTerm, iTerm2, TERM_PROGRAM, KITTY_WINDOW_ID)
- **Underlines**: curly, dotted, dashed, double styles; underline color (RGB); styled underline combos
- **Hyperlinks**: OSC 8 hyperlink generation, link text display
- **Utilities**: ANSI regex matching (SGR, OSC 8, extended), `stripAnsi()`, `displayLength()` with wide chars and ANSI codes
- **Integration**: all exports accessible from main index, term API basics, bgOverride for hightea compatibility

## What NOT to Test Here

- Chalk library internals — tests build on chalk's API
- Terminal rendering — tests verify ANSI sequence generation, not visual output
- hightea integration — that's hightea tests

## Patterns

Tests manipulate `process.env` to simulate different terminal environments. Always save/restore env in `afterEach`:

```typescript
const origTerm = process.env.TERM

afterEach(() => {
  if (origTerm !== undefined) process.env.TERM = origTerm
  else delete process.env.TERM
})

test("detects support via TERM=xterm-ghostty", () => {
  process.env.TERM = "xterm-ghostty"
  expect(detectExtendedUnderline()).toBe(true)
})
```

## Ad-Hoc Testing

```bash
bun vitest run vendor/hightea/packages/ansi/tests/                  # All ansi tests
bun vitest run vendor/hightea/packages/ansi/tests/detection.test.ts # Terminal detection
bun vitest run vendor/hightea/packages/ansi/tests/utils.test.ts     # ANSI utilities
```

## Efficiency

Pure string tests (~20ms). No rendering, no I/O. Environment variable manipulation is the only side effect — always restored in `afterEach`.

## See Also

- [Test layering philosophy](../../.claude/skills/tests/test-layers.md)
