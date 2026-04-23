/**
 * Unified attr-props — defaults contract.
 *
 * Bead: km-silvery.text-box-attr-props
 *
 * Contracts verified here:
 *   1. Omitting `underline` on Box produces cells with no underline (default = false).
 *   2. Omitting `underline` on Text produces cells with no underline.
 *   3. `underline` as a string ("curly") is equivalent to `underline=true` with
 *      the matching `underlineStyle`.
 *   4. `underline: true` resolves to "single".
 *   5. `underline: false` explicitly clears it.
 *   6. Box with no attr props pays zero cost — mergeAttrsInRect is not called
 *      (verified indirectly by checking cells have empty attrs).
 *
 * These contracts exist because `underline: boolean | UnderlineStyleName` is a
 * NEW prop shape — without tests, docstring and behavior drift silently.
 * See tests/contracts/README.md for the convention.
 */

import React from "react"
import { describe, test, expect } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, Text } from "@silvery/ag-react"

const render = createRenderer({ cols: 40, rows: 5 })

describe("contract: underline prop defaults on Text", () => {
  test("omitting underline yields no underline on cells", () => {
    const app = render(<Text>hello</Text>)
    const cell = app.cell(0, 0)
    expect(cell.char).toBe("h")
    expect(cell.underline).toBe(false)
  })

  test("underline={true} resolves to single", () => {
    const app = render(<Text underline>hello</Text>)
    expect(app.cell(0, 0).underline).toBe("single")
  })

  test("underline={false} produces no underline (explicit default)", () => {
    const app = render(<Text underline={false}>hello</Text>)
    expect(app.cell(0, 0).underline).toBe(false)
  })

  test('underline="curly" resolves to curly style', () => {
    const app = render(<Text underline="curly">hello</Text>)
    expect(app.cell(0, 0).underline).toBe("curly")
  })

  test('underline="double" / "dotted" / "dashed" each resolve to their own style', () => {
    expect(render(<Text underline="double">x</Text>).cell(0, 0).underline).toBe("double")
    expect(render(<Text underline="dotted">x</Text>).cell(0, 0).underline).toBe("dotted")
    expect(render(<Text underline="dashed">x</Text>).cell(0, 0).underline).toBe("dashed")
  })

  test("legacy underlineStyle takes precedence over underline boolean", () => {
    // Back-compat: the deprecated underlineStyle prop still wins when both set.
    const app = render(
      <Text underline underlineStyle="curly">
        x
      </Text>,
    )
    expect(app.cell(0, 0).underline).toBe("curly")
  })
})

describe("contract: underline prop defaults on Box", () => {
  test("Box without underline — children cells have no underline", () => {
    const app = render(
      <Box>
        <Text>hello</Text>
      </Box>,
    )
    expect(app.cell(0, 0).char).toBe("h")
    expect(app.cell(0, 0).underline).toBe(false)
  })

  test("Box with underline overlays single underline on every child cell", () => {
    const app = render(
      <Box underline>
        <Text>hello</Text>
      </Box>,
    )
    for (let col = 0; col < 5; col++) {
      expect(app.cell(col, 0).underline).toBe("single")
    }
  })

  test('Box underline="dashed" overlays dashed style (not single)', () => {
    const app = render(
      <Box underline="dashed">
        <Text>world</Text>
      </Box>,
    )
    expect(app.cell(0, 0).underline).toBe("dashed")
  })

  test("Box underline preserves child text glyph and fg", () => {
    const app = render(
      <Box underline="curly">
        <Text color="red">hi</Text>
      </Box>,
    )
    const cell = app.cell(0, 0)
    // Transparent-overlay: the char and fg from <Text color="red"> survive.
    expect(cell.char).toBe("h")
    expect(cell.fg).not.toBeNull() // red resolved
    // Plus the underline from the Box.
    expect(cell.underline).toBe("curly")
  })

  test("Box without attr overlay has zero cost — cell attrs stay empty", () => {
    // Verifies the fast-path short-circuit in applyBoxAttrOverlay.
    const app = render(
      <Box>
        <Text>plain</Text>
      </Box>,
    )
    const cell = app.cell(0, 0)
    expect(cell.bold).toBe(false)
    expect(cell.italic).toBe(false)
    expect(cell.underline).toBe(false)
    expect(cell.strikethrough).toBe(false)
    expect(cell.inverse).toBe(false)
  })
})

describe("contract: box attr overlay cascades to children", () => {
  test("Box bold cascades to every child cell", () => {
    const app = render(
      <Box bold>
        <Text>bold</Text>
      </Box>,
    )
    for (let col = 0; col < 4; col++) {
      expect(app.cell(col, 0).bold).toBe(true)
    }
  })

  test("Box strikethrough cascades to children", () => {
    const app = render(
      <Box strikethrough>
        <Text>gone</Text>
      </Box>,
    )
    expect(app.cell(0, 0).strikethrough).toBe(true)
    expect(app.cell(3, 0).strikethrough).toBe(true)
  })

  test("Box italic OR-combines with Text bold (no overwrite)", () => {
    const app = render(
      <Box italic>
        <Text bold>mix</Text>
      </Box>,
    )
    const cell = app.cell(0, 0)
    expect(cell.bold).toBe(true) // from <Text>
    expect(cell.italic).toBe(true) // from <Box>
  })

  test("nested Box underline — outer overlay wins over inner (parent-last paint order)", () => {
    // Render order is depth-first: inner Box paints first (including its
    // merge-attrs overlay), then the outer Box's overlay runs over every cell
    // in its rect. Last merge wins for the 3-bit underline style field.
    // This matches the Box order of the existing style cascade — the outermost
    // attr-props declaration is the effective one for cells within its rect.
    const app = render(
      <Box underline="single">
        <Box underline="dashed">
          <Text>deep</Text>
        </Box>
      </Box>,
    )
    expect(app.cell(0, 0).underline).toBe("single")
  })
})
