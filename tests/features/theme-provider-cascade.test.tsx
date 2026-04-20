/**
 * ThemeProvider cascade tests.
 *
 * Verifies that nested ThemeProviders scope their themes correctly:
 * inner provider tokens apply only to the inner subtree, and outer
 * subtree continues to use the outer theme.
 *
 * This tests the AgNode cascade mechanism: ThemeProvider renders a
 * <Box theme={merged}> wrapper, which pushes the theme onto the
 * context stack during the render phase. Nested providers produce
 * nested stack entries. When the inner Box finishes rendering, its
 * theme is popped — outer tokens resume for subsequent siblings.
 *
 * Runs at SILVERY_STRICT=1 (default test setup) — incremental renders
 * must match fresh renders cell-for-cell.
 *
 * Bead: km-silvery.theme-v3-r2-agnode-cascade
 */

import React from "react"
import { describe, test, expect } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, Text, ThemeProvider } from "silvery"

const r = createRenderer({ cols: 40, rows: 4 })

// =============================================================================
// Nested ThemeProvider isolation
// =============================================================================

describe("nested ThemeProvider isolation", () => {
  /**
   * Layout:
   *   <outer ThemeProvider fg-accent="#FF0000">   row 0
   *     <Text color="$fg-accent">Outer</Text>      → should be red
   *     <inner ThemeProvider fg-accent="#0000FF">  row 1
   *       <Text color="$fg-accent">Inner</Text>    → should be blue
   *     </inner>
   *     <Text color="$fg-accent">After</Text>      row 2 → should be red again
   *   </outer>
   */
  test("inner provider fg-accent overrides outer; outer resumes after inner", () => {
    // Each ThemeProvider Box has flexGrow=1 so we pin each content row to
    // height=1 via an explicit Box wrapper — otherwise the inner provider
    // consumes all remaining column space and pushes siblings to later rows.
    const app = r(
      <ThemeProvider tokens={{ "fg-accent": "#FF0000" }}>
        <Box flexDirection="column">
          <Box height={1}>
            <Text color="$fg-accent">Outer</Text>
          </Box>
          <Box height={1}>
            <ThemeProvider tokens={{ "fg-accent": "#0000FF" }}>
              <Text color="$fg-accent">Inner</Text>
            </ThemeProvider>
          </Box>
          <Box height={1}>
            <Text color="$fg-accent">After</Text>
          </Box>
        </Box>
      </ThemeProvider>,
    )

    const RED = { r: 255, g: 0, b: 0 }
    const BLUE = { r: 0, g: 0, b: 255 }

    // Row 0: "Outer" — outer theme ($fg-accent = red)
    expect(app.cell(0, 0).char).toBe("O")
    expect(app.cell(0, 0).fg).toEqual(RED)

    // Row 1: "Inner" — inner theme ($fg-accent = blue)
    expect(app.cell(0, 1).char).toBe("I")
    expect(app.cell(0, 1).fg).toEqual(BLUE)

    // Row 2: "After" — outer theme resumes ($fg-accent = red again)
    expect(app.cell(0, 2).char).toBe("A")
    expect(app.cell(0, 2).fg).toEqual(RED)
  })

  /**
   * Incremental stability: rerender with changed inner theme, verify outer
   * subtree is unaffected.
   */
  test("outer subtree unchanged after inner theme update", () => {
    function App({ innerColor }: { innerColor: string }) {
      return (
        <ThemeProvider tokens={{ "fg-accent": "#FF0000" }}>
          <Box flexDirection="column">
            <Text color="$fg-accent">Outer</Text>
            <ThemeProvider tokens={{ "fg-accent": innerColor }}>
              <Text color="$fg-accent">Inner</Text>
            </ThemeProvider>
          </Box>
        </ThemeProvider>
      )
    }

    const app = r(<App innerColor="#0000FF" />)

    const RED = { r: 255, g: 0, b: 0 }
    const BLUE = { r: 0, g: 0, b: 255 }
    const GREEN = { r: 0, g: 128, b: 0 }

    // Initial state
    expect(app.cell(0, 0).fg).toEqual(RED)
    expect(app.cell(0, 1).fg).toEqual(BLUE)

    // Update inner theme — outer must remain red
    app.rerender(<App innerColor="#008000" />)

    expect(app.cell(0, 0).fg).toEqual(RED) // outer unchanged
    expect(app.cell(0, 1).fg).toEqual(GREEN) // inner updated
  })

  /**
   * Three levels deep: each provider scopes only its own subtree.
   */
  test("three-level nesting: each level gets its own fg-accent", () => {
    const app = r(
      <ThemeProvider tokens={{ "fg-accent": "#FF0000" }}>
        <Box flexDirection="column">
          <Text color="$fg-accent">L1</Text>
          <ThemeProvider tokens={{ "fg-accent": "#00FF00" }}>
            <Box flexDirection="column">
              <Text color="$fg-accent">L2</Text>
              <ThemeProvider tokens={{ "fg-accent": "#0000FF" }}>
                <Text color="$fg-accent">L3</Text>
              </ThemeProvider>
            </Box>
          </ThemeProvider>
        </Box>
      </ThemeProvider>,
    )

    const RED = { r: 255, g: 0, b: 0 }
    const GREEN = { r: 0, g: 255, b: 0 }
    const BLUE = { r: 0, g: 0, b: 255 }

    expect(app.cell(0, 0).fg).toEqual(RED) // L1
    expect(app.cell(0, 1).fg).toEqual(GREEN) // L2
    expect(app.cell(0, 2).fg).toEqual(BLUE) // L3
  })
})
