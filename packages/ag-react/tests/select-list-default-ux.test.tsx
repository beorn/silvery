/**
 * SelectList default UX — omnibox-style: no arrow, full-row selection bg,
 * hover moves cursor, click confirms selection.
 *
 * Verifies:
 * 1. Default indicator="" renders without arrow prefix
 * 2. Selected row has $cursor-bg background and $cursor fg at cell level
 * 3. Click on row fires onSelect with that item + moves cursor there
 * 4. Mouse enter on row moves cursor (without firing onSelect)
 * 5. indicator="▸ " keeps old arrow behavior (backward compat)
 */

import React from "react"
import { describe, test, expect, vi } from "vitest"
import { createRenderer } from "@silvery/test"
import { SelectList } from "../src/ui/components/SelectList"
import type { SelectOption } from "../src/ui/components/SelectList"

// ============================================================================
// Test fixtures — 6 items for realistic behavior
// ============================================================================

const OPTIONS: SelectOption[] = [
  { label: "Apple", value: "apple" },
  { label: "Banana", value: "banana" },
  { label: "Cherry", value: "cherry" },
  { label: "Durian", value: "durian" },
  { label: "Elderberry", value: "elderberry" },
  { label: "Fig", value: "fig" },
]

// ============================================================================
// 1. Default indicator="" renders without arrow prefix
// ============================================================================

describe("SelectList default UX: no arrow indicator", () => {
  test("renders without '▸' arrow on any row", () => {
    const render = createRenderer({ cols: 40, rows: 8 })
    const app = render(<SelectList items={OPTIONS} />)

    expect(app.text).not.toContain("▸")
  })

  test("item text rendered without leading indicator spaces", () => {
    const render = createRenderer({ cols: 40, rows: 8 })
    const app = render(<SelectList items={OPTIONS} />)

    // All items should appear; no leading "▸ " or extra indent
    expect(app.text).toContain("Apple")
    expect(app.text).toContain("Banana")
    expect(app.text).toContain("Cherry")
  })

  test("renders all visible items", () => {
    const render = createRenderer({ cols: 40, rows: 10 })
    const app = render(<SelectList items={OPTIONS} />)

    for (const opt of OPTIONS) {
      expect(app.text).toContain(opt.label)
    }
  })
})

// ============================================================================
// 2. Selected row has $cursor-bg background at cell level
// ============================================================================

describe("SelectList default UX: full-row bg on cursor", () => {
  test("cursor row (row 0) has non-null bg color (cursor-bg)", () => {
    const render = createRenderer({ cols: 40, rows: 10 })
    const app = render(<SelectList items={OPTIONS} />)

    // First item is cursor by default — cell at (0, 0) should have bg
    const cell = app.cell(0, 0)
    expect(cell.bg).not.toBeNull()
  })

  test("non-cursor row has no cursor bg color", () => {
    const render = createRenderer({ cols: 40, rows: 10 })
    const app = render(<SelectList items={OPTIONS} />)

    // Row 1 (Banana) is not the cursor row — should have null bg
    const cell = app.cell(0, 1)
    expect(cell.bg).toBeNull()
  })

  test("cursor row fg uses cursor color token", () => {
    const r = createRenderer({ cols: 40, rows: 10 })

    // Get what $cursor resolves to via direct reference
    const { Text } = require("../src/components/Text")
    const React2 = require("react")
    const appDirect = r(React2.createElement(Text, { color: "$cursor" }, "X"))
    const expectedFg = appDirect.cell(0, 0).fg

    const app = r(<SelectList items={OPTIONS} />)
    const cell = app.cell(0, 0)
    expect(cell.fg).toEqual(expectedFg)
  })
})

// ============================================================================
// 3. Click on row fires onSelect + moves cursor
// ============================================================================

describe("SelectList default UX: click-to-confirm", () => {
  test("clicking row 2 (index 2) fires onSelect with item at index 2", async () => {
    const onSelect = vi.fn()
    const render = createRenderer({ cols: 40, rows: 10 })
    const app = render(<SelectList items={OPTIONS} onSelect={onSelect} />)

    // Row 2 is "Cherry" (OPTIONS[2]). Click at (0, 2) — start of row 2.
    await app.click(0, 2)

    expect(onSelect).toHaveBeenCalledTimes(1)
    const [item, index] = onSelect.mock.calls[0]!
    expect(item.value).toBe("cherry")
    expect(index).toBe(2)
  })

  test("clicking row 2 moves cursor bg to row 2", async () => {
    const render = createRenderer({ cols: 40, rows: 10 })
    const app = render(<SelectList items={OPTIONS} />)

    // Initially row 0 has cursor bg
    expect(app.cell(0, 0).bg).not.toBeNull()
    expect(app.cell(0, 2).bg).toBeNull()

    // Click row 2
    await app.click(0, 2)

    // Row 0 should lose cursor bg, row 2 should gain it
    expect(app.cell(0, 0).bg).toBeNull()
    expect(app.cell(0, 2).bg).not.toBeNull()
  })
})

// ============================================================================
// 4. Mouse enter moves cursor without firing onSelect
// ============================================================================

describe("SelectList default UX: hover-to-focus", () => {
  test("hovering row 2 moves cursor to index 2 without firing onSelect", async () => {
    const onSelect = vi.fn()
    const render = createRenderer({ cols: 40, rows: 10 })
    const app = render(<SelectList items={OPTIONS} onSelect={onSelect} />)

    // Hover row 2
    await app.hover(0, 2)

    // onSelect must NOT have been called
    expect(onSelect).not.toHaveBeenCalled()

    // Cursor bg should now be on row 2
    expect(app.cell(0, 2).bg).not.toBeNull()
  })

  test("hover does not fire onSelect (all rows)", async () => {
    const onSelect = vi.fn()
    const render = createRenderer({ cols: 40, rows: 10 })
    const app = render(<SelectList items={OPTIONS} onSelect={onSelect} />)

    for (let row = 0; row < OPTIONS.length; row++) {
      await app.hover(0, row)
    }

    expect(onSelect).not.toHaveBeenCalled()
  })

  test("hovering row 3 moves cursor bg from row 0 to row 3", async () => {
    const render = createRenderer({ cols: 40, rows: 10 })
    const app = render(<SelectList items={OPTIONS} />)

    expect(app.cell(0, 0).bg).not.toBeNull()
    expect(app.cell(0, 3).bg).toBeNull()

    await app.hover(0, 3)

    expect(app.cell(0, 0).bg).toBeNull()
    expect(app.cell(0, 3).bg).not.toBeNull()
  })
})

// ============================================================================
// 5. indicator="▸ " backward compatibility
// ============================================================================

describe("SelectList backward compat: indicator prop", () => {
  test("indicator='▸ ' shows arrow on selected item (row 0)", () => {
    const render = createRenderer({ cols: 40, rows: 10 })
    const app = render(<SelectList items={OPTIONS} indicator="▸ " />)

    // Arrow should appear in the first row
    const lines = app.lines
    expect(lines[0]).toContain("▸")
  })

  test("indicator='▸ ' non-cursor rows have equal-width spaces", () => {
    const render = createRenderer({ cols: 40, rows: 10 })
    const app = render(<SelectList items={OPTIONS} indicator="▸ " />)

    const lines = app.lines
    // Row 1 (Banana) should not have "▸" but should have indent spaces
    expect(lines[1]).not.toContain("▸")
    expect(lines[1]).toContain("  Banana")
  })

  test("indicator mode cursor row still has bg color", () => {
    const render = createRenderer({ cols: 40, rows: 10 })
    const app = render(<SelectList items={OPTIONS} indicator="▸ " />)

    // Cursor row (row 0) should still have bg set
    expect(app.cell(0, 0).bg).not.toBeNull()
  })

  test("indicator mode non-cursor row has no bg color", () => {
    const render = createRenderer({ cols: 40, rows: 10 })
    const app = render(<SelectList items={OPTIONS} indicator="▸ " />)

    // Non-cursor row (row 1) should have no bg
    expect(app.cell(0, 1).bg).toBeNull()
  })
})
