/**
 * <Terminal> Component Tests
 *
 * Verifies the public renderer for headless terminal cell-grids
 * (`packages/ag-react/src/ui/components/Terminal.tsx`). The component
 * is purely a renderer — owns no PTY, no stdin, no alt-screen toggle —
 * so the tests use plain fake `TerminalReadable` objects rather than
 * spinning up real termless backends.
 *
 * Pairs with the `render({ input: false })` escape hatch tested in
 * `tests/features/render-input-false.test.tsx`. See
 * `docs/design/terminal-component.md` for the API rationale.
 */
import React from "react"
import { describe, expect, test } from "vitest"
import { createRenderer } from "@silvery/test"
import {
  Box,
  encodeTerminalRow,
  Terminal,
  type TerminalCell,
  type TerminalCursor,
  type TerminalReadable,
} from "@silvery/ag-react"

// ────────────────────────────────────────────────────────────────────────────
// Fake terminal — minimal duck-typed TerminalReadable for the tests.
// Each call to `setText` mutates the backing grid; tests typically build a
// fresh fake per case so there's no cross-test bleed.
// ────────────────────────────────────────────────────────────────────────────

function blankCell(char = " "): TerminalCell {
  return {
    char,
    fg: null,
    bg: null,
    bold: false,
    dim: false,
    italic: false,
    underline: false,
    strikethrough: false,
    inverse: false,
  }
}

function fakeTerminal(
  cols: number,
  rows: number,
  initial: string[] = [],
  cursor: TerminalCursor = { x: 0, y: 0, visible: true },
): TerminalReadable & { setText(text: string[]): void } {
  let lines: TerminalCell[][] = initial.map((s) =>
    Array.from({ length: cols }, (_, i) => blankCell(s[i] ?? " ")),
  )
  while (lines.length < rows) lines.push(Array.from({ length: cols }, () => blankCell()))
  return {
    cols,
    rows,
    getLines: () => lines,
    getCursor: () => cursor,
    setText(text: string[]) {
      lines = text.map((s) => Array.from({ length: cols }, (_, i) => blankCell(s[i] ?? " ")))
      while (lines.length < rows) lines.push(Array.from({ length: cols }, () => blankCell()))
    },
  }
}

// ────────────────────────────────────────────────────────────────────────────
// encodeTerminalRow — pure encoder unit tests.
// These run without React or a renderer to lock down the SGR-delta + width
// padding contract that the component depends on.
// ────────────────────────────────────────────────────────────────────────────

describe("encodeTerminalRow", () => {
  test("returns spaces when row is empty", () => {
    expect(encodeTerminalRow([], 5)).toBe("     ")
  })

  test("pads to cols when row is shorter", () => {
    const row = [blankCell("a"), blankCell("b"), blankCell("c")]
    expect(encodeTerminalRow(row, 6)).toBe("abc   ")
  })

  test("truncates to cols when row is longer", () => {
    const row = "hello world".split("").map((c) => blankCell(c))
    const out = encodeTerminalRow(row, 5)
    // Output contains "hello" — may have trailing SGR-reset bytes but no
    // additional glyph cells.
    expect(out.startsWith("hello")).toBe(true)
    // Strip ANSI to verify visible width.
    const visible = out.replace(/\x1b\[[0-9;]*m/g, "")
    expect(visible).toBe("hello")
  })

  test("emits SGR 1 for bold cell", () => {
    const row = [{ ...blankCell("X"), bold: true }]
    const out = encodeTerminalRow(row, 1)
    expect(out).toContain("\x1b[1m")
    expect(out).toContain("X")
  })

  test("emits truecolor SGR for fg/bg", () => {
    const row = [{ ...blankCell("R"), fg: { r: 255, g: 0, b: 0 } }]
    const out = encodeTerminalRow(row, 1)
    expect(out).toContain("\x1b[38;2;255;0;0m")
    expect(out).toContain("R")
  })

  test("deduplicates SGR across runs of identical-style cells", () => {
    const cells: TerminalCell[] = [
      { ...blankCell("a"), bold: true },
      { ...blankCell("b"), bold: true },
      { ...blankCell("c"), bold: true },
    ]
    const out = encodeTerminalRow(cells, 3)
    // Single SGR 1 prefix (no per-cell repetition).
    expect(out.match(/\x1b\[1m/g)?.length).toBe(1)
    // Visible content is "abc".
    expect(out.replace(/\x1b\[[0-9;]*m/g, "")).toBe("abc")
  })

  test("skips wide-cell continuation column", () => {
    const cells: TerminalCell[] = [
      { ...blankCell("漢"), wide: true },
      { ...blankCell(""), continuation: true },
      blankCell("a"),
    ]
    // The wide cell occupies 2 of the 3 columns; "a" lands at col 2.
    const out = encodeTerminalRow(cells, 3)
    expect(out.replace(/\x1b\[[0-9;]*m/g, "")).toBe("漢a")
  })

  test("treats string-valued underline as on (UnderlineStyle compat)", () => {
    // termless's UnderlineStyle is `false | "single" | "double" | …`; the
    // duck-typed `boolean | string` field accepts both.
    const row = [{ ...blankCell("U"), underline: "curly" }]
    const out = encodeTerminalRow(row, 1)
    expect(out).toContain("\x1b[4m")
  })
})

// ────────────────────────────────────────────────────────────────────────────
// <Terminal> component tests.
// Use `createRenderer` so we hit the full layout + render pipeline, which is
// what catches dirty-flag bugs under SILVERY_STRICT=1 (the default for
// `bun run test:fast`).
// ────────────────────────────────────────────────────────────────────────────

describe("<Terminal> rendering", () => {
  test("renders the grid into the silvery buffer", () => {
    const term = fakeTerminal(5, 2, ["hello", "world"])
    const render = createRenderer({ cols: 20, rows: 4 })
    const app = render(<Terminal terminal={term} />)
    expect(app.text).toContain("hello")
    expect(app.text).toContain("world")
  })

  test("respects cols/rows overrides", () => {
    const term = fakeTerminal(10, 4, ["aaaaaaaaaa", "bbbbbbbbbb", "cccccccccc", "dddddddddd"])
    const render = createRenderer({ cols: 30, rows: 6 })
    const app = render(<Terminal terminal={term} cols={5} rows={2} />)
    // The grid is clipped to 5×2 — rows c/d are hidden by the rows=2
    // override. cols=5 truncates each row to 5 cells.
    expect(app.text).toContain("aaaaa")
    expect(app.text).not.toContain("aaaaaaaaaa")
    expect(app.text).not.toContain("cccccccccc")
  })

  test("composes inside flexbox layouts (centred grid)", () => {
    const term = fakeTerminal(3, 1, ["abc"])
    const render = createRenderer({ cols: 11, rows: 3 })
    const app = render(
      <Box width={11} height={3} justifyContent="center" alignItems="center">
        <Terminal terminal={term} />
      </Box>,
    )
    expect(app.text).toContain("abc")
  })

  test("re-renders when revision changes", () => {
    const term = fakeTerminal(5, 1, ["before"])
    const render = createRenderer({ cols: 10, rows: 3 })
    const app = render(<Terminal terminal={term} revision={0} />)
    expect(app.text).toContain("befor")

    term.setText(["after"])
    app.rerender(<Terminal terminal={term} revision={1} />)
    expect(app.text).toContain("after")
  })

  test("does NOT re-read terminal when revision is unchanged", () => {
    let getLinesCalls = 0
    const grid = [Array.from({ length: 5 }, (_, i) => blankCell("abcde"[i] ?? " "))]
    const term: TerminalReadable = {
      cols: 5,
      rows: 1,
      getLines: () => {
        getLinesCalls++
        return grid
      },
      getCursor: () => ({ x: 0, y: 0, visible: true }),
    }
    const render = createRenderer({ cols: 10, rows: 3 })
    const app = render(<Terminal terminal={term} revision={0} />)
    const baseline = getLinesCalls
    // Rerender with the same revision and same terminal identity —
    // useMemo should keep the encoded rows cached.
    app.rerender(<Terminal terminal={term} revision={0} />)
    expect(getLinesCalls).toBe(baseline)
  })
})

describe("<Terminal> cursor", () => {
  test("default-true cursor surfaces in the rendered output", () => {
    // cursor: true (default) — the underlying Box receives cursorOffset.
    // We cannot directly assert the prop without reaching into the
    // reconciler, but we can verify the component renders correctly with
    // a visible cursor configuration.
    const term = fakeTerminal(5, 2, ["hello", "world"], { x: 2, y: 1, visible: true })
    const render = createRenderer({ cols: 20, rows: 5 })
    const app = render(<Terminal terminal={term} />)
    expect(app.text).toContain("hello")
    expect(app.text).toContain("world")
  })

  test("cursor: false leaves silvery cursor untouched", () => {
    const term = fakeTerminal(5, 2, ["hello", "world"], { x: 3, y: 0, visible: true })
    const render = createRenderer({ cols: 20, rows: 5 })
    const app = render(<Terminal terminal={term} cursor={false} />)
    expect(app.text).toContain("hello")
    // No way to assert "cursor was not set" from outside the buffer,
    // but the render succeeds without errors — which is the contract.
  })
})

describe("<Terminal> selectable prop", () => {
  test("default selectable=true does not break the render", () => {
    const term = fakeTerminal(5, 1, ["aaaaa"])
    const render = createRenderer({ cols: 10, rows: 3 })
    const app = render(<Terminal terminal={term} />)
    expect(app.text).toContain("aaaaa")
  })

  test("selectable=false also renders cleanly", () => {
    const term = fakeTerminal(5, 1, ["bbbbb"])
    const render = createRenderer({ cols: 10, rows: 3 })
    const app = render(<Terminal terminal={term} selectable={false} />)
    expect(app.text).toContain("bbbbb")
  })
})

// ────────────────────────────────────────────────────────────────────────────
// SILVERY_STRICT=1 invariant — the test runner sets this env automatically
// (see vendor/silvery/tests/setup.ts). Each `createRenderer(...).rerender`
// call internally verifies that incremental render ≡ fresh render. If the
// new component breaks the incremental cascade, ANY rerender below would
// throw with an IncrementalRenderMismatchError. The presence of these
// tests passing is the regression guarantee.
// ────────────────────────────────────────────────────────────────────────────
describe("<Terminal> incremental invariants", () => {
  test("revision bumps preserve incremental ≡ fresh", () => {
    const term = fakeTerminal(5, 2, ["aaaaa", "bbbbb"])
    const render = createRenderer({ cols: 20, rows: 5 })
    const app = render(<Terminal terminal={term} revision={0} />)
    for (let i = 1; i < 5; i++) {
      term.setText([`row${i}a`, `row${i}b`])
      app.rerender(<Terminal terminal={term} revision={i} />)
      expect(app.text).toContain(`row${i}a`)
    }
  })

  test("toggling cursor across rerenders preserves incremental ≡ fresh", () => {
    const term = fakeTerminal(5, 1, ["hello"])
    const render = createRenderer({ cols: 20, rows: 5 })
    const app = render(<Terminal terminal={term} cursor={true} />)
    expect(app.text).toContain("hello")
    app.rerender(<Terminal terminal={term} cursor={false} />)
    expect(app.text).toContain("hello")
    app.rerender(<Terminal terminal={term} cursor={true} />)
    expect(app.text).toContain("hello")
  })
})
