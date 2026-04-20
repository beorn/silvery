/**
 * Theme Change Rendering Tests
 *
 * Verifies that theme token changes correctly propagate through the render tree:
 * - bgDirty is marked when the `theme` prop changes on a Box
 * - Subtree token inheritance propagates to child Text nodes
 * - Theme changes with skipped (clean) parents still reach dirty children
 */

import React, { useState } from "react"
import { describe, test, expect } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, Text } from "@silvery/ag-react"
import { ansi16DarkTheme, ansi16LightTheme, type Theme } from "@silvery/ansi"

// Two themes with clearly different accent/muted colors for assertions.
// Tests below use Sterling flat tokens in JSX; the inlineSterlingTokens shim
// populates Sterling keys from the legacy palette by default, but explicit
// overrides on the Sterling keys win — that's what these themes pin.
const themeA: Theme = {
  ...ansi16DarkTheme,
  name: "theme-a",
  primary: "#ff0000", // legacy alias
  primaryfg: "#ffffff",
  muted: "#888888",
  "bg-accent": "#ff0000", // red
  "fg-on-accent": "#ffffff",
  "fg-accent": "#ff0000",
  "fg-muted": "#888888",
}

const themeB: Theme = {
  ...ansi16DarkTheme,
  name: "theme-b",
  primary: "#00ff00", // legacy alias
  primaryfg: "#000000",
  muted: "#cccccc",
  "bg-accent": "#00ff00", // green
  "fg-on-accent": "#000000",
  "fg-accent": "#00ff00",
  "fg-muted": "#cccccc",
}

describe("theme change rendering", () => {
  test("theme prop change marks bgDirty and re-renders affected node", () => {
    const render = createRenderer({ cols: 30, rows: 5 })

    function App({ theme }: { theme: Theme }) {
      return (
        <Box theme={theme} backgroundColor="$bg-accent" width={10} height={1}>
          <Text>Hello</Text>
        </Box>
      )
    }

    const app = render(<App theme={themeA} />)
    const buffer1 = app.lastBuffer()!
    // $bg-accent resolves to #ff0000 (red) in themeA
    const cellBefore = buffer1.getCell(0, 0)
    expect(cellBefore.char).toBe("H")
    const bgBefore = cellBefore.bg

    // Switch theme — $bg-accent now resolves to #00ff00 (green)
    app.rerender(<App theme={themeB} />)
    const buffer2 = app.lastBuffer()!
    const cellAfter = buffer2.getCell(0, 0)
    expect(cellAfter.char).toBe("H")
    const bgAfter = cellAfter.bg

    // The bg color should have changed from red to green
    expect(bgBefore).not.toEqual(bgAfter)
    // Verify the new bg is green (#00ff00)
    expect(bgAfter).toEqual({ r: 0, g: 255, b: 0 })
  })

  test("subtree token inheritance propagates to child Text nodes", () => {
    const render = createRenderer({ cols: 30, rows: 5 })

    function App({ theme }: { theme: Theme }) {
      return (
        <Box theme={theme}>
          <Text color="$fg-accent">Colored</Text>
        </Box>
      )
    }

    const app = render(<App theme={themeA} />)
    const buffer1 = app.lastBuffer()!
    // First char "C" should have red fg from themeA.$fg-accent
    const cellBefore = buffer1.getCell(0, 0)
    expect(cellBefore.char).toBe("C")
    const fgBefore = cellBefore.fg

    // Switch to themeB — $fg-accent is now green
    app.rerender(<App theme={themeB} />)
    const buffer2 = app.lastBuffer()!
    const cellAfter = buffer2.getCell(0, 0)
    expect(cellAfter.char).toBe("C")
    const fgAfter = cellAfter.fg

    // The fg color should have changed
    expect(fgBefore).not.toEqual(fgAfter)
    // themeB.$fg-accent = #00ff00 → green
    expect(fgAfter).toEqual({ r: 0, g: 255, b: 0 })
  })

  test("theme changes with skipped (clean) parents still reach dirty children", () => {
    const render = createRenderer({ cols: 40, rows: 5 })

    // Structure: outer Box (theme) → middle Box (no theme, clean) → inner Text ($fg-muted)
    // The middle Box has no theme prop and no changes — it should be "clean".
    // But the theme change on the outer Box must still cascade to the inner Text.
    function App({ theme }: { theme: Theme }) {
      return (
        <Box theme={theme}>
          <Box>
            <Text color="$fg-muted">Deep</Text>
          </Box>
        </Box>
      )
    }

    const app = render(<App theme={themeA} />)
    const buffer1 = app.lastBuffer()!
    const cellBefore = buffer1.getCell(0, 0)
    expect(cellBefore.char).toBe("D")
    const fgBefore = cellBefore.fg

    // Switch theme — $fg-muted changes from #888888 to #cccccc
    app.rerender(<App theme={themeB} />)
    const buffer2 = app.lastBuffer()!
    const cellAfter = buffer2.getCell(0, 0)
    expect(cellAfter.char).toBe("D")
    const fgAfter = cellAfter.fg

    // The fg should have changed because $fg-muted resolved to a different color
    expect(fgBefore).not.toEqual(fgAfter)
    // themeB.$fg-muted = #cccccc
    expect(fgAfter).toEqual({ r: 204, g: 204, b: 204 })
  })

  test("theme change on ancestor updates backgroundColor of nested Box", () => {
    const render = createRenderer({ cols: 30, rows: 5 })

    function App({ theme }: { theme: Theme }) {
      return (
        <Box theme={theme}>
          <Box backgroundColor="$bg-accent" width={8} height={1}>
            <Text color="$fg-on-accent">Item</Text>
          </Box>
        </Box>
      )
    }

    const app = render(<App theme={themeA} />)
    const buf1 = app.lastBuffer()!
    const bgBefore = buf1.getCell(0, 0).bg
    const fgBefore = buf1.getCell(0, 0).fg
    // themeA: $bg-accent=#ff0000, $fg-on-accent=#ffffff
    expect(bgBefore).toEqual({ r: 255, g: 0, b: 0 })
    expect(fgBefore).toEqual({ r: 255, g: 255, b: 255 })

    app.rerender(<App theme={themeB} />)
    const buf2 = app.lastBuffer()!
    const bgAfter = buf2.getCell(0, 0).bg
    const fgAfter = buf2.getCell(0, 0).fg
    // themeB: $bg-accent=#00ff00, $fg-on-accent=#000000
    expect(bgAfter).toEqual({ r: 0, g: 255, b: 0 })
    expect(fgAfter).toEqual({ r: 0, g: 0, b: 0 })
  })

  test("incremental render matches fresh render after theme switch", () => {
    const render = createRenderer({ cols: 40, rows: 8 })

    function App({ theme }: { theme: Theme }) {
      return (
        <Box theme={theme} flexDirection="column">
          <Box backgroundColor="$bg-accent" width={20} height={1}>
            <Text color="$fg-on-accent">Header</Text>
          </Box>
          <Box>
            <Text color="$fg-muted">Body text</Text>
          </Box>
          <Box backgroundColor="$surfacebg" width={20} height={1}>
            <Text color="$surface">Footer</Text>
          </Box>
        </Box>
      )
    }

    const app = render(<App theme={themeA} />)
    expect(app.text).toContain("Header")

    // Switch theme
    app.rerender(<App theme={themeB} />)

    // The incremental render should match a fresh render
    // (SILVERY_STRICT auto-validates this when enabled, but we also
    // do an explicit check via freshRender)
    const incremental = app.lastBuffer()!
    const fresh = app.freshRender()

    // Compare all cells in the rendered area
    for (let y = 0; y < 3; y++) {
      for (let x = 0; x < 20; x++) {
        const incCell = incremental.getCell(x, y)
        const freshCell = fresh.getCell(x, y)
        expect(incCell.char).toBe(freshCell.char)
        expect(incCell.fg).toEqual(freshCell.fg)
        expect(incCell.bg).toEqual(freshCell.bg)
      }
    }
  })
})
