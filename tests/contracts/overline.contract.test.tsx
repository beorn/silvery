/**
 * Overline attr prop — defaults contract.
 *
 * Bead: km-silvery.overline-attr
 *
 * Contracts verified here:
 *   1. Omitting `overline` on Box/Text produces cells with `overline: false`.
 *   2. `overline` prop OMITTED → no SGR 53 in ANSI output.
 *   3. `overline={true}` → cells report `overline: true` AND ANSI contains SGR 53.
 *   4. `overline={false}` → explicit default, no SGR 53.
 *   5. Toggling overline on → off across frames emits SGR 53 (set) then SGR 55
 *      (reset) in the diffed ANSI.
 *   6. VISIBLE_SPACE_ATTR_MASK — a Box with only `overline` (no bg, no
 *      children text) still paints the line across the row. Space cells
 *      carrying only overline must NOT be trimmed as "invisible whitespace".
 *   7. Cap gating: when `caps.overline` is false, the cell attr is still
 *      packed but the output phase emits NO SGR 53/55 bytes.
 *   8. Overline is INDEPENDENT of underline — setting one never resolves the
 *      other (mirror relationship for scroll-edge indicators).
 *
 * These contracts exist because `overline` is a NEW prop; without tests the
 * docstring and behaviour drift silently. See tests/contracts/README.md for
 * the convention.
 */

import React from "react"
import { describe, test, expect } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, Text } from "@silvery/ag-react"
import { createOutputPhase } from "@silvery/ag-term/pipeline/output-phase"
import { createBuffer } from "@silvery/ag-term/buffer"

// SGR 53 can appear as the lone param `[53m`, or compounded with others
// (`[1;53m`, `[53;38;5;8m`). A trailing `m` or `;` marks param boundary.
const SGR_53_RE = /\x1b\[[\d;:]*(?<![\d:])53(?=[m;:])/
const SGR_55_RE = /\x1b\[[\d;:]*(?<![\d:])55(?=[m;:])/

describe("contract: overline prop defaults on Text", () => {
  test("omitting overline → cells have overline=false", () => {
    const render = createRenderer({ cols: 20, rows: 2 })
    const app = render(<Text>plain</Text>)
    const cell = app.cell(0, 0)
    expect(cell.char).toBe("p")
    expect(cell.overline).toBe(false)
  })

  test("overline={true} → cells have overline=true + SGR 53 emitted", () => {
    const render = createRenderer({ cols: 20, rows: 2 })
    const app = render(<Text overline>abc</Text>)
    expect(app.cell(0, 0).overline).toBe(true)
    expect(app.cell(1, 0).overline).toBe(true)
    expect(app.cell(2, 0).overline).toBe(true)
    expect(app.ansi).toMatch(SGR_53_RE)
  })

  test("overline={false} → explicit default, no SGR 53", () => {
    const render = createRenderer({ cols: 20, rows: 2 })
    const app = render(<Text overline={false}>abc</Text>)
    expect(app.cell(0, 0).overline).toBe(false)
    expect(app.ansi).not.toMatch(SGR_53_RE)
  })
})

describe("contract: overline prop defaults on Box", () => {
  test("Box without overline → child cells have overline=false", () => {
    const render = createRenderer({ cols: 20, rows: 2 })
    const app = render(
      <Box>
        <Text>hello</Text>
      </Box>,
    )
    expect(app.cell(0, 0).overline).toBe(false)
  })

  test("Box overline overlays overline on every child cell", () => {
    const render = createRenderer({ cols: 20, rows: 2 })
    const app = render(
      <Box overline>
        <Text>hello</Text>
      </Box>,
    )
    for (let col = 0; col < 5; col++) {
      expect(app.cell(col, 0).overline).toBe(true)
    }
  })

  test("Box overline preserves child glyph + fg (transparent overlay)", () => {
    const render = createRenderer({ cols: 20, rows: 2 })
    const app = render(
      <Box overline>
        <Text color="red">hi</Text>
      </Box>,
    )
    const cell = app.cell(0, 0)
    expect(cell.char).toBe("h")
    expect(cell.fg).not.toBeNull()
    expect(cell.overline).toBe(true)
  })
})

describe("contract: overline is independent of underline", () => {
  test("overline without underline → overline=true, underline=false", () => {
    const render = createRenderer({ cols: 10, rows: 2 })
    const app = render(<Text overline>x</Text>)
    expect(app.cell(0, 0).overline).toBe(true)
    expect(app.cell(0, 0).underline).toBe(false)
  })

  test("underline without overline → overline=false, underline='single'", () => {
    const render = createRenderer({ cols: 10, rows: 2 })
    const app = render(<Text underline>x</Text>)
    expect(app.cell(0, 0).overline).toBe(false)
    expect(app.cell(0, 0).underline).toBe("single")
  })

  test("both set → both carry independently; ANSI has both SGR 4 and 53", () => {
    const render = createRenderer({ cols: 10, rows: 2 })
    const app = render(
      <Text underline overline>
        x
      </Text>,
    )
    expect(app.cell(0, 0).underline).toBe("single")
    expect(app.cell(0, 0).overline).toBe(true)
    expect(app.ansi).toMatch(/\x1b\[[\d;:]*(?<![\d:])4(?=[m;:])/)
    expect(app.ansi).toMatch(SGR_53_RE)
  })
})

describe("contract: VISIBLE_SPACE_ATTR_MASK — overline makes spaces visible", () => {
  test("Box with only overline (empty height=1, no text children) still paints the row", () => {
    // The classic overscroll-indicator shape: a height=1 absolute Box with no
    // children and only the `overline` attr. After mergeAttrsInRect runs, the
    // row's space cells carry the ATTR_OVERLINE bit. VISIBLE_SPACE_ATTR_MASK
    // includes it so extractText / trimming logic treats those spaces as
    // meaningful content rather than collapsible whitespace.
    const render = createRenderer({ cols: 20, rows: 3 })
    const app = render(
      <Box flexDirection="column">
        <Box overline height={1} width={10} />
        <Text>after the line</Text>
      </Box>,
    )
    // The first row's space cells carry overline.
    for (let col = 0; col < 10; col++) {
      expect(app.cell(col, 0).overline).toBe(true)
    }
    // The content on row 1 is unaffected.
    expect(app.cell(0, 1).overline).toBe(false)
    expect(app.cell(0, 1).char).toBe("a")
  })
})

describe("contract: SGR 53/55 toggle emits correct diffs", () => {
  test("overline on/off mix in one frame emits BOTH SGR 53 (set) and SGR 55 (reset)", () => {
    // Within a single frame the style serialiser walks cells left→right and
    // emits style transitions as attrs change. A frame with [overline, no,
    // overline, no, overline] cells forces the serialiser to emit 53→55→53
    // transitions between adjacent cells — this is where SGR 55 appears in
    // real output. (Cross-frame reset uses `\x1b[0m` for the whole row, not
    // selective `55`, so cross-frame diffs don't exercise the off-code.)
    const outputPhase = createOutputPhase({ overline: true })
    const buf = createBuffer(5, 1)
    buf.setCell(0, 0, { char: "a", attrs: { overline: true } })
    buf.setCell(1, 0, { char: "b", attrs: {} })
    buf.setCell(2, 0, { char: "c", attrs: { overline: true } })
    buf.setCell(3, 0, { char: "d", attrs: {} })
    buf.setCell(4, 0, { char: "e", attrs: { overline: true } })
    const ansi = outputPhase(null, buf, "fullscreen")
    expect(ansi).toMatch(SGR_53_RE)
    expect(ansi).toMatch(SGR_55_RE)
  })

  test("caps.overline=false → NO SGR 53 or 55 in output even when attr is set", () => {
    const outputPhase = createOutputPhase({ overline: false })
    const buf = createBuffer(5, 1)
    for (let x = 0; x < 5; x++) {
      buf.setCell(x, 0, { char: "x", attrs: { overline: true } })
    }
    const ansi = outputPhase(null, buf, "fullscreen")
    expect(ansi).not.toMatch(SGR_53_RE)
    expect(ansi).not.toMatch(SGR_55_RE)
  })

  test("caps.overline default = true → SGR 53 emitted for overline attr", () => {
    const outputPhase = createOutputPhase({})
    const buf = createBuffer(5, 1)
    for (let x = 0; x < 5; x++) {
      buf.setCell(x, 0, { char: "x", attrs: { overline: true } })
    }
    const ansi = outputPhase(null, buf, "fullscreen")
    expect(ansi).toMatch(SGR_53_RE)
  })
})
