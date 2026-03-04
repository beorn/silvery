# inkx Tests

**Layer 0 — TUI Rendering Framework**: React-based terminal UI with incremental rendering, layout feedback, and full input pipeline.

## What to Test Here

- **Buffer**: cell packing, attribute encoding, styled text extraction, buffer equality
- **Output**: ANSI generation, screen control sequences, incremental diff, output phase pipeline
- **Layout**: flexbox grow, nested layout, cache invalidation, measure callbacks, layout equivalence
- **Scroll**: dirty flags, offscreen rendering, visible range changes, scroll regions, virtual lists
- **Input**: key parsing (ANSI, Kitty), input coalescing, input isolation, input layers, bracketed paste, mouse events
- **Components**: Box, Text, VirtualList, ScrollbackView, Screen, Image, Transform, theming
- **Focus**: focus manager, focus scopes, spatial navigation, focus events, click-to-focus
- **Rendering**: incremental vs fresh render (strict mode), rerender memo, reconcile reorder, suspense
- **Terminal**: capabilities detection, color levels, multiplexer support, lifecycle (suspend/resume)
- **Plugins**: withCommands, withDiagnostics, withKeybindings

## What NOT to Test Here

- km-specific command behavior — that's km-commands/km-tui
- Board state logic — that's km-board
- Layout engine internals — that's beorn-flexx (inkx tests layout _integration_)

## Helpers

- `setup.ts`: re-exports `createRenderer`, `normalizeFrame`, `stripAnsi`, `waitFor` from `inkx/testing`; adds `expectFrame()` matcher
- `createRenderer({ cols, rows })`: creates virtual terminal for component rendering
- `app.press(key)` / `app.click(x, y)`: Playwright-style input simulation
- `app.locator(selector)` / `app.getByTestId(id)`: auto-refreshing element queries

## Patterns

```typescript
import { createRenderer } from "inkx/testing"
import { Box, Text } from "../src/index.js"

const render = createRenderer({ cols: 40, rows: 10 })

test("scroll offset marks container dirty", async () => {
  function ScrollList({ scrollTo }: { scrollTo: number }) {
    return (
      <Box height={5} overflow="scroll" scrollTo={scrollTo}>
        {Array.from({ length: 8 }, (_, i) => <Text key={i}>Item {i}</Text>)}
      </Box>
    )
  }
  const app = render(<ScrollList scrollTo={0} />)
  expect(app.text).toContain("Item 0")
  app.rerender(<ScrollList scrollTo={5} />)
  expect(app.text).toContain("Item 5")
})
```

## Subdirectories

- `compat/` — Ink API compatibility tests
- `pipeline/` — Render pipeline phase tests
- `runtime/` — Runtime layer tests (run, createApp, createStore)
- `streams/` — AsyncIterable stream helper tests
- `terminal-compat/` — Terminal emulator compatibility tests

## Ad-Hoc Testing

```bash
bun vitest run vendor/beorn-inkx/tests/                    # All inkx tests (~60s)
bun vitest run vendor/beorn-inkx/tests/buffer.test.ts      # Specific file
bun vitest run vendor/beorn-inkx/tests/ -t "scroll dirty"  # By test name
bun vitest run vendor/beorn-inkx/tests/pipeline/           # Pipeline subdirectory
```

## Efficiency

Test cost varies widely: pure buffer/output tests (~50ms), component rendering tests (~200ms), integration tests with multiple rerenders (~500ms). The `memory.slow.test.tsx` is gated behind `.slow.` for CI. Keep buffer-level tests pure; if a test needs board state, it belongs in km-tui.

## See Also

- [Test layering philosophy](../../.claude/skills/tests/test-layers.md)
