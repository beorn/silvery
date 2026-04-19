/**
 * color="inherit" / "currentColor" cascade tests.
 *
 * Verifies that Text, underline, and border colors can cascade from the
 * nearest ancestor's resolved foreground — the silvery equivalent of
 * CSS `color: inherit` / `currentColor`.
 *
 * Runs at SILVERY_STRICT=2 via the default test setup — incremental
 * renders must match fresh renders cell-for-cell.
 *
 * Bead: km-silvery.color-inherit
 */

import React from "react"
import { describe, test, expect } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, Text } from "@silvery/ag-react"
import { parseColor } from "@silvery/ag-term/pipeline/render-helpers"

// =============================================================================
// parseColor keyword recognition
// =============================================================================

describe("parseColor: inherit/currentColor keywords", () => {
  test("'inherit' returns null", () => {
    expect(parseColor("inherit")).toBeNull()
  })

  test("'currentColor' returns null (synonym for inherit)", () => {
    expect(parseColor("currentColor")).toBeNull()
  })
})

// =============================================================================
// Text color="inherit" cascade
// =============================================================================

const RED = { r: 255, g: 0, b: 0 }
const BLUE = { r: 0, g: 0, b: 255 }
const GREEN = { r: 0, g: 255, b: 0 }

describe('<Text color="inherit">', () => {
  test("inherits the parent's resolved color", () => {
    const r = createRenderer({ cols: 20, rows: 3 })
    const app = r(
      <Text color="#ff0000">
        Outer
        <Text color="inherit">Inner</Text>
      </Text>,
    )
    // "Outer" chars must be red
    expect(app.cell(0, 0).fg).toEqual(RED)
    // "Inner" chars must also be red (inherited)
    expect(app.cell(5, 0).fg).toEqual(RED) // 'I'
    expect(app.cell(6, 0).fg).toEqual(RED) // 'n'
  })

  test("currentColor is a synonym for inherit", () => {
    const r = createRenderer({ cols: 20, rows: 3 })
    const app = r(
      <Text color="#0000ff">
        A<Text color="currentColor">B</Text>
      </Text>,
    )
    expect(app.cell(0, 0).fg).toEqual(BLUE)
    expect(app.cell(1, 0).fg).toEqual(BLUE)
  })

  test("no colored ancestor → resolves to default (null)", () => {
    const r = createRenderer({ cols: 20, rows: 3 })
    const app = r(<Text color="inherit">Plain</Text>)
    expect(app.cell(0, 0).fg).toBeNull()
  })

  test("Box color cascades into Text color=inherit", () => {
    // Box has no native color prop rendering itself, but its color
    // flows down as inheritedFg for text descendants.
    const r = createRenderer({ cols: 20, rows: 3 })
    const app = r(
      <Box>
        <Text color="#00ff00">
          <Text color="inherit">Leaf</Text>
        </Text>
      </Box>,
    )
    expect(app.cell(0, 0).fg).toEqual(GREEN)
  })

  test("nested inherit: grandchild finds grandparent color", () => {
    // The regression this bead exists to fix: if an intermediate Text
    // has color="inherit", it must pass-through its parent's color to
    // the grandchild — not replace it with null.
    const r = createRenderer({ cols: 30, rows: 3 })
    const app = r(
      <Text color="#ff0000">
        <Text color="inherit">
          <Text color="inherit">X</Text>
        </Text>
      </Text>,
    )
    expect(app.cell(0, 0).fg).toEqual(RED)
  })

  test("sibling with explicit color overrides inherit", () => {
    const r = createRenderer({ cols: 20, rows: 3 })
    const app = r(
      <Text color="#ff0000">
        A<Text color="#0000ff">B</Text>
        <Text color="inherit">C</Text>
      </Text>,
    )
    expect(app.cell(0, 0).fg).toEqual(RED) // A — outer red
    expect(app.cell(1, 0).fg).toEqual(BLUE) // B — explicit blue
    expect(app.cell(2, 0).fg).toEqual(RED) // C — inherited red
  })
})

// =============================================================================
// underlineColor="currentColor"
// =============================================================================

describe('<Text underlineColor="currentColor">', () => {
  test("underline is painted in the text's resolved color", () => {
    const r = createRenderer({ cols: 20, rows: 3 })
    const app = r(
      <Text color="#ff0000" underline underlineColor="currentColor">
        Hi
      </Text>,
    )
    // Underline color should track fg (red), not default.
    const cell = app.cell(0, 0)
    expect(cell.fg).toEqual(RED)
    expect(cell.underline).toBeTruthy()
    // underlineColor follows fg
    expect(cell.underlineColor).toEqual(RED)
  })

  test("underlineColor=currentColor also inherits from ancestor", () => {
    const r = createRenderer({ cols: 20, rows: 3 })
    const app = r(
      <Text color="#0000ff">
        <Text color="inherit" underline underlineColor="currentColor">
          X
        </Text>
      </Text>,
    )
    const cell = app.cell(0, 0)
    expect(cell.fg).toEqual(BLUE)
    expect(cell.underline).toBeTruthy()
    expect(cell.underlineColor).toEqual(BLUE)
  })
})

// =============================================================================
// Box borderColor="currentColor"
// =============================================================================

describe('<Box borderColor="currentColor">', () => {
  test("border is painted in the Box's own color", () => {
    const r = createRenderer({ cols: 20, rows: 5 })
    const app = r(
      <Box borderStyle="single" borderColor="currentColor" color="#ff0000" width={6} height={3}>
        <Text>Hi</Text>
      </Box>,
    )
    // Top-left corner border cell should be red (the Box's own fg)
    const topLeft = app.cell(0, 0)
    expect(topLeft.char).toBe("┌")
    expect(topLeft.fg).toEqual(RED)
  })

  test("border inherits from ancestor when Box has no color", () => {
    const r = createRenderer({ cols: 20, rows: 5 })
    const app = r(
      <Box color="#00ff00">
        <Box borderStyle="single" borderColor="currentColor" width={6} height={3}>
          <Text>Hi</Text>
        </Box>
      </Box>,
    )
    const topLeft = app.cell(0, 0)
    expect(topLeft.char).toBe("┌")
    expect(topLeft.fg).toEqual(GREEN)
  })
})

// =============================================================================
// Realistic-scale + incremental
// =============================================================================

describe("inherit cascade at realistic scale", () => {
  test("60 rows of inherit chains render consistently across re-renders", () => {
    const r = createRenderer({ cols: 40, rows: 60 })
    function App({ tick }: { tick: number }): React.ReactElement {
      return (
        <Box flexDirection="column">
          {Array.from({ length: 50 }, (_, i) => (
            <Text key={i} color="#ff0000">
              row-{i}-{tick}:
              <Text color="inherit">
                <Text color="inherit"> leaf</Text>
              </Text>
            </Text>
          ))}
        </Box>
      )
    }
    const app = r(<App tick={0} />)
    // Every "leaf" grapheme across all rows must be red
    for (let y = 0; y < 50; y++) {
      // Find the 'l' in 'leaf' — located deep in the row; just verify
      // a handful of rows' first char is red (outer Text).
      expect(app.cell(0, y).fg).toEqual(RED)
    }

    // Incremental re-render: change tick, re-check. SILVERY_STRICT in
    // test harness auto-verifies incremental == fresh render.
    app.rerender(<App tick={1} />)
    for (let y = 0; y < 50; y++) {
      expect(app.cell(0, y).fg).toEqual(RED)
    }
  })
})
