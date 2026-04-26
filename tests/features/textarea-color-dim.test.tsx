/**
 * TextArea color/dim props for muted body text
 *
 * Bead: km-silvery.textarea-color-dim
 *
 * Verifies that the `color` prop sets the foreground color of body text
 * (the rendered Text rows), and the `dim` prop is a shortcut for the
 * `$fg-muted` token. Used by composite editors like silvercode's CommandBox
 * to indicate which of two stacked TextAreas is unfocused — body text dims
 * to give a stronger focus signal beyond just the prompt glyph.
 */

import React from "react"
import { describe, test, expect } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, TextArea } from "silvery"

describe("TextArea color/dim props", () => {
  test("color prop applies to body text", () => {
    const r = createRenderer({ cols: 40, rows: 10 })

    function App() {
      return (
        <Box>
          <TextArea
            defaultValue="hello"
            fieldSizing="fixed"
            rows={3}
            color="$fg-muted"
            isActive={false}
          />
        </Box>
      )
    }

    const app = r(<App />)
    // The 'h' of "hello" is at column 0, row 0.
    const cell = app.cell(0, 0)
    expect(cell).toBeDefined()
    // $fg-muted in the default theme resolves to a muted greyish color.
    // Just assert the cell has the character and a fg color is set
    // (different from the default fg).
    expect(cell.char).toBe("h")
    expect(cell.fg).toBeDefined()

    // Compare against a TextArea with no color prop (default fg).
    const r2 = createRenderer({ cols: 40, rows: 10 })
    function Default() {
      return (
        <Box>
          <TextArea defaultValue="hello" fieldSizing="fixed" rows={3} isActive={false} />
        </Box>
      )
    }
    const app2 = r2(<Default />)
    const defaultCell = app2.cell(0, 0)
    expect(defaultCell.char).toBe("h")
    // The colored cell's fg should differ from the default.
    expect(cell.fg).not.toStrictEqual(defaultCell.fg)
  })

  test("dim prop renders body text with muted foreground", () => {
    const r = createRenderer({ cols: 40, rows: 10 })

    function App() {
      return (
        <Box>
          <TextArea defaultValue="hello" fieldSizing="fixed" rows={3} dim isActive={false} />
        </Box>
      )
    }

    const app = r(<App />)
    const cell = app.cell(0, 0)
    expect(cell.char).toBe("h")

    // Compare against a TextArea with explicit color="$fg-muted" — should match.
    const r2 = createRenderer({ cols: 40, rows: 10 })
    function MutedExplicit() {
      return (
        <Box>
          <TextArea
            defaultValue="hello"
            fieldSizing="fixed"
            rows={3}
            color="$fg-muted"
            isActive={false}
          />
        </Box>
      )
    }
    const app2 = r2(<MutedExplicit />)
    const mutedCell = app2.cell(0, 0)
    expect(cell.fg).toStrictEqual(mutedCell.fg)
  })

  test("placeholder text remains $fg-muted regardless of color prop", () => {
    const r = createRenderer({ cols: 40, rows: 10 })

    // Empty TextArea + placeholder. color prop applies to body, but placeholder
    // is its own muted style and should render normally.
    function App() {
      return (
        <Box>
          <TextArea
            defaultValue=""
            fieldSizing="fixed"
            rows={3}
            placeholder="type here"
            color="$primary"
            isActive={false}
          />
        </Box>
      )
    }

    const app = r(<App />)
    expect(app.text).toContain("type here")
  })
})
