/**
 * Border Background Color Tests
 *
 * Tests for per-side border background color props:
 * - borderBackgroundColor (shorthand for all sides)
 * - borderTopBackgroundColor, borderBottomBackgroundColor,
 *   borderLeftBackgroundColor, borderRightBackgroundColor (per-side overrides)
 */

import React from "react"
import { describe, test, expect } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, Text } from "@silvery/ag-react"

const RED = { r: 255, g: 0, b: 0 }
const GREEN = { r: 0, g: 255, b: 0 }
const BLUE = { r: 0, g: 0, b: 255 }
const YELLOW = { r: 255, g: 255, b: 0 }
const MAGENTA = { r: 255, g: 0, b: 255 }
const DARK_GRAY = { r: 51, g: 51, b: 51 }

describe("border background color", () => {
  test("borderBackgroundColor applies to all border cells", () => {
    const r = createRenderer({ cols: 20, rows: 5 })
    const app = r(
      <Box borderStyle="single" width={10} height={3} borderBackgroundColor="#ff0000">
        <Text>Hi</Text>
      </Box>,
    )
    // Top-left corner should have red bg
    const topLeft = app.cell(0, 0)
    expect(topLeft.char).toBe("┌")
    expect(topLeft.bg).toEqual(RED)

    // Top horizontal border
    const topH = app.cell(1, 0)
    expect(topH.char).toBe("─")
    expect(topH.bg).toEqual(RED)

    // Left vertical border
    const leftV = app.cell(0, 1)
    expect(leftV.char).toBe("│")
    expect(leftV.bg).toEqual(RED)

    // Right vertical border
    const rightV = app.cell(9, 1)
    expect(rightV.char).toBe("│")
    expect(rightV.bg).toEqual(RED)

    // Bottom border
    const bottomH = app.cell(1, 2)
    expect(bottomH.char).toBe("─")
    expect(bottomH.bg).toEqual(RED)
  })

  test("per-side props override borderBackgroundColor", () => {
    const r = createRenderer({ cols: 20, rows: 5 })
    const app = r(
      <Box
        borderStyle="single"
        width={10}
        height={3}
        borderBackgroundColor="#ff0000"
        borderTopBackgroundColor="#00ff00"
        borderBottomBackgroundColor="#0000ff"
        borderLeftBackgroundColor="#ffff00"
        borderRightBackgroundColor="#ff00ff"
      >
        <Text>Hi</Text>
      </Box>,
    )
    // Top border uses green (overrides red)
    const topH = app.cell(1, 0)
    expect(topH.bg).toEqual(GREEN)

    // Top-left corner uses top's bg color
    const topLeft = app.cell(0, 0)
    expect(topLeft.bg).toEqual(GREEN)

    // Left vertical border uses yellow
    const leftV = app.cell(0, 1)
    expect(leftV.bg).toEqual(YELLOW)

    // Right vertical border uses magenta
    const rightV = app.cell(9, 1)
    expect(rightV.bg).toEqual(MAGENTA)

    // Bottom border uses blue
    const bottomH = app.cell(1, 2)
    expect(bottomH.bg).toEqual(BLUE)

    // Bottom-left corner uses bottom's bg color
    const bottomLeft = app.cell(0, 2)
    expect(bottomLeft.bg).toEqual(BLUE)
  })

  test("per-side without shorthand falls back to box bg", () => {
    const r = createRenderer({ cols: 20, rows: 5 })
    const app = r(
      <Box
        borderStyle="single"
        width={10}
        height={3}
        backgroundColor="#333333"
        borderTopBackgroundColor="#00ff00"
      >
        <Text>Hi</Text>
      </Box>,
    )
    // Top border uses explicit green
    const topH = app.cell(1, 0)
    expect(topH.bg).toEqual(GREEN)

    // Other sides fall back to box backgroundColor
    const leftV = app.cell(0, 1)
    expect(leftV.bg).toEqual(DARK_GRAY)

    const bottomH = app.cell(1, 2)
    expect(bottomH.bg).toEqual(DARK_GRAY)
  })

  test("borderBackgroundColor without borderStyle has no effect", () => {
    const r = createRenderer({ cols: 20, rows: 5 })
    const app = r(
      <Box width={10} height={3} borderBackgroundColor="#ff0000">
        <Text>Hi</Text>
      </Box>,
    )
    // No border rendered, so cell at 0,0 should be content, not border
    const cell = app.cell(0, 0)
    expect(cell.char).not.toBe("┌")
  })
})
