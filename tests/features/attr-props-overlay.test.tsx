/**
 * Unified attr-props — feature tests.
 *
 * Bead: km-silvery.text-box-attr-props
 *
 * Exercises the full 5-phase pipeline:
 *  - Each spelled-out underline style ("single"/"double"/"curly"/"dotted"/"dashed")
 *    produces the right SGR 4:x code in the ANSI output AND the right
 *    UnderlineStyle on each cell.
 *  - Box transparent-overlay: `<Box underline>` applies underline to every
 *    cell in its rect WITHOUT overwriting the glyphs/fg/bg of its children.
 *  - Realistic-scale fixture (50+ nodes) per silvery CLAUDE.md — catches
 *    cascade bugs that synthetic micro-tests miss.
 *  - Per-style capability downgrade in output phase — requesting curly on a
 *    profile that only supports "single" emits plain SGR 4.
 *  - Incremental-render invariant (SILVERY_STRICT=1 at the vitest level
 *    catches any incremental-vs-fresh mismatch automatically).
 */

import React, { useState } from "react"
import { describe, test, expect } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, Text } from "@silvery/ag-react"
import { createOutputPhase } from "@silvery/ag-term/pipeline/output-phase"
import { createBuffer } from "@silvery/ag-term/buffer"

// ============================================================================
// Per-style SGR emission through the full pipeline
// ============================================================================

describe("feature: all 5 underline styles emit correct SGR via the pipeline", () => {
  const styles = [
    { name: "single", sgr: "4" },
    { name: "double", sgr: "4:2" },
    { name: "curly", sgr: "4:3" },
    { name: "dotted", sgr: "4:4" },
    { name: "dashed", sgr: "4:5" },
  ] as const

  for (const { name, sgr } of styles) {
    test(`Text underline="${name}" — cell.underline="${name}", ANSI contains ${sgr}`, () => {
      const render = createRenderer({ cols: 20, rows: 3 })
      const app = render(<Text underline={name}>hello</Text>)
      // Cell attr was packed correctly
      expect(app.cell(0, 0).underline).toBe(name)
      expect(app.cell(4, 0).underline).toBe(name)
      // ANSI output contains the correct SGR subparam (or plain 4 for single)
      const ansi = app.ansi
      if (name === "single") {
        expect(ansi).toMatch(/\x1b\[[\d;:]*4[m;]/)
      } else {
        expect(ansi).toContain(sgr)
      }
    })
  }
})

// ============================================================================
// Box transparent-overlay — preserve glyph + fg while adding underline
// ============================================================================

describe("feature: Box attr overlay preserves child content", () => {
  test("Box underline does NOT overwrite child text glyphs", () => {
    const render = createRenderer({ cols: 30, rows: 3 })
    const app = render(
      <Box underline>
        <Text>preserved</Text>
      </Box>,
    )
    // Glyphs survived the merge-attrs pass.
    expect(app.cell(0, 0).char).toBe("p")
    expect(app.cell(1, 0).char).toBe("r")
    expect(app.cell(8, 0).char).toBe("d")
    // Underline was layered on top.
    expect(app.cell(0, 0).underline).toBe("single")
    expect(app.cell(8, 0).underline).toBe("single")
  })

  test("Box underline preserves child fg + bg", () => {
    const render = createRenderer({ cols: 30, rows: 3 })
    const app = render(
      <Box underline="curly">
        <Text color="green" backgroundColor="blue">
          X
        </Text>
      </Box>,
    )
    const cell = app.cell(0, 0)
    expect(cell.char).toBe("X")
    expect(cell.fg).not.toBeNull() // green survived
    expect(cell.bg).not.toBeNull() // blue survived
    expect(cell.underline).toBe("curly")
  })

  test("transparent Box (no bg, only underline) overlays without bleeding sibling cells", () => {
    const render = createRenderer({ cols: 30, rows: 4 })
    const app = render(
      <Box flexDirection="column">
        <Text>top row — untouched</Text>
        <Box underline>
          <Text>middle row — underlined</Text>
        </Box>
        <Text>bottom row — untouched</Text>
      </Box>,
    )
    // Top row: no underline
    expect(app.cell(0, 0).underline).toBe(false)
    expect(app.cell(5, 0).underline).toBe(false)
    // Middle row: underlined
    expect(app.cell(0, 1).underline).toBe("single")
    expect(app.cell(5, 1).underline).toBe("single")
    // Bottom row: no underline
    expect(app.cell(0, 2).underline).toBe(false)
  })
})

// ============================================================================
// Realistic-scale: 50+ nodes with mixed attr props
// ============================================================================

interface Row {
  id: number
  label: string
  emphasis: "none" | "underline" | "strikethrough" | "bold"
}

function ScaleFixture({ rows, selectedId }: { rows: Row[]; selectedId: number }) {
  return (
    <Box flexDirection="column" width={40}>
      {rows.map((row) => (
        <Box
          key={row.id}
          id={`row-${row.id}`}
          underline={row.id === selectedId ? "curly" : row.emphasis === "underline"}
          strikethrough={row.emphasis === "strikethrough"}
          bold={row.emphasis === "bold"}
        >
          <Text>
            {String(row.id).padStart(2, "0")} {row.label}
          </Text>
        </Box>
      ))}
    </Box>
  )
}

function buildRows(count: number): Row[] {
  const emphases = ["none", "underline", "strikethrough", "bold"] as const
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    label: `Item number ${i}`,
    emphasis: emphases[i % emphases.length]!,
  }))
}

describe("feature: attr overlays at 50-node scale", () => {
  test("50 rows with mixed attr props render without STRICT mismatch", () => {
    const render = createRenderer({ cols: 40, rows: 60 })
    const rows = buildRows(50)
    const app = render(<ScaleFixture rows={rows} selectedId={-1} />)
    // Spot-check: row 1 has "underline" emphasis → cells underlined single
    expect(app.cell(0, 1).underline).toBe("single")
    // Row 2 has "strikethrough" emphasis → cells strikethrough
    expect(app.cell(0, 2).strikethrough).toBe(true)
    // Row 3 has "bold" emphasis → cells bold
    expect(app.cell(0, 3).bold).toBe(true)
    // Row 0 has "none" → nothing
    expect(app.cell(0, 0).underline).toBe(false)
    expect(app.cell(0, 0).strikethrough).toBe(false)
    expect(app.cell(0, 0).bold).toBe(false)
  })

  test("moving the 'selected' row curly-underline across 50 items updates incrementally", () => {
    const render = createRenderer({ cols: 40, rows: 60 })
    const rows = buildRows(50)
    const app = render(<ScaleFixture rows={rows} selectedId={0} />)
    expect(app.cell(0, 0).underline).toBe("curly")

    // SILVERY_STRICT=1 (default) auto-verifies incremental = fresh on every rerender.
    // Any cascade bug in applyBoxAttrOverlay would throw here.
    for (let i = 1; i < 50; i++) {
      app.rerender(<ScaleFixture rows={rows} selectedId={i} />)
      // Selected row gets curly
      expect(app.cell(0, i).underline).toBe("curly")
    }
    // After the 49-frame journey the previously-selected rows have reverted
    // to their emphasis default, not stuck on "curly".
    expect(app.cell(0, 0).underline).toBe(false) // row 0 emphasis = "none"
    expect(app.cell(0, 1).underline).toBe("single") // row 1 emphasis = "underline"
  })

  test("removing attr prop clears the cell attrs (underline true → false)", () => {
    const render = createRenderer({ cols: 20, rows: 5 })
    function App({ on }: { on: boolean }) {
      return (
        <Box underline={on}>
          <Text>toggle</Text>
        </Box>
      )
    }
    const app = render(<App on={true} />)
    expect(app.cell(0, 0).underline).toBe("single")
    app.rerender(<App on={false} />)
    expect(app.cell(0, 0).underline).toBe(false)
    app.rerender(<App on={true} />)
    expect(app.cell(0, 0).underline).toBe("single")
  })

  test("stateful toggle across a 50-row list preserves per-row attrs", () => {
    const render = createRenderer({ cols: 40, rows: 60 })
    function App({ rev }: { rev: number }) {
      const [rows] = useState(buildRows(50))
      const selected = rev % 50
      return <ScaleFixture rows={rows} selectedId={selected} />
    }
    const app = render(<App rev={0} />)
    for (let rev = 1; rev < 10; rev++) {
      app.rerender(<App rev={rev} />)
    }
    // After 10 frames: row 9 is selected (curly), rows 0-8 reverted to their emphasis.
    expect(app.cell(0, 9).underline).toBe("curly")
    expect(app.cell(0, 0).underline).toBe(false) // emphasis "none"
    expect(app.cell(0, 1).underline).toBe("single") // emphasis "underline"
  })
})

// ============================================================================
// Per-style capability downgrade (output phase)
// ============================================================================

describe("feature: output phase per-style capability downgrade", () => {
  test("curly style requested on limited caps emits plain SGR 4 (single)", () => {
    // Caps with only "single" supported → requesting curly falls back.
    const outputPhase = createOutputPhase({ underlineStyles: [] })
    const buf = createBuffer(5, 1)
    buf.setCell(0, 0, {
      char: "x",
      attrs: { underline: true, underlineStyle: "curly" },
    })
    const ansi = outputPhase(null, buf, "fullscreen")
    // No 4:3 sequence — just plain 4.
    expect(ansi).not.toContain("4:3")
    expect(ansi).toMatch(/\x1b\[[\d;:]*4[m;]/)
  })

  test("curly style requested on full caps emits SGR 4:3", () => {
    const outputPhase = createOutputPhase({
      underlineStyles: ["single", "double", "curly", "dotted", "dashed"],
    })
    const buf = createBuffer(5, 1)
    buf.setCell(0, 0, {
      char: "x",
      attrs: { underline: true, underlineStyle: "curly" },
    })
    const ansi = outputPhase(null, buf, "fullscreen")
    expect(ansi).toContain("4:3")
  })

  test("selective cap: dashed supported but curly not → curly downgrades, dashed survives", () => {
    const outputPhase = createOutputPhase({ underlineStyles: ["dashed"] })
    // First cell: curly (should downgrade to SGR 4)
    const bufA = createBuffer(3, 1)
    bufA.setCell(0, 0, { char: "x", attrs: { underline: true, underlineStyle: "curly" } })
    const ansiA = outputPhase(null, bufA, "fullscreen")
    expect(ansiA).not.toContain("4:3")

    // Second cell: dashed (should stay 4:5)
    const bufB = createBuffer(3, 1)
    bufB.setCell(0, 0, { char: "x", attrs: { underline: true, underlineStyle: "dashed" } })
    const ansiB = outputPhase(null, bufB, "fullscreen")
    expect(ansiB).toContain("4:5")
  })

  test("underlineColor skipped when caps.underlineColor=false", () => {
    const outputPhase = createOutputPhase({ underlineColor: false })
    const buf = createBuffer(5, 1)
    buf.setCell(0, 0, {
      char: "x",
      attrs: { underline: true, underlineStyle: "single" },
      underlineColor: 9, // red (256-color index)
    })
    const ansi = outputPhase(null, buf, "fullscreen")
    // SGR 58 must not appear when caps.underlineColor is false.
    expect(ansi).not.toContain("58;")
    expect(ansi).not.toContain("58:")
  })
})

// ============================================================================
// Underline color — per-cell SGR 58 emission
// ============================================================================

describe("feature: underlineColor emits SGR 58", () => {
  test("Text underlineColor='red' → SGR 58 in ANSI output", () => {
    const render = createRenderer({ cols: 10, rows: 2 })
    const app = render(
      <Text underline underlineColor="red">
        abc
      </Text>,
    )
    // Red underline color emitted as SGR 58;5;1 (256-color index 1) or 58;2;...
    expect(app.ansi).toMatch(/58;[25];/)
  })

  test("Box underlineColor overlays underline color on every child cell", () => {
    const render = createRenderer({ cols: 10, rows: 2 })
    const app = render(
      <Box underline underlineColor="cyan">
        <Text>XY</Text>
      </Box>,
    )
    // Cell records resolved underlineColor (RGB) via the merge-attrs pass.
    const cell = app.cell(0, 0)
    expect(cell.underline).toBe("single")
    expect(cell.underlineColor).not.toBeNull()
  })
})

// ============================================================================
// Regression: Text's existing underline={true} behavior survives
// ============================================================================

describe("regression: <Text underline> backwards compatibility", () => {
  test("bare underline prop still produces single underline", () => {
    const render = createRenderer({ cols: 10, rows: 2 })
    const app = render(<Text underline>hi</Text>)
    expect(app.cell(0, 0).underline).toBe("single")
    expect(app.cell(1, 0).underline).toBe("single")
  })

  test("legacy underlineStyle prop still wins over underline boolean", () => {
    const render = createRenderer({ cols: 10, rows: 2 })
    const app = render(
      <Text underline underlineStyle="dotted">
        hi
      </Text>,
    )
    expect(app.cell(0, 0).underline).toBe("dotted")
  })
})
