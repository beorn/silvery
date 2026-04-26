/**
 * LineNumber Component Tests
 *
 * Verifies right-aligned padding, auto-width derivation, and the
 * `highlight` styling switch.
 */

import React from "react"
import { describe, test, expect } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, LineNumber } from "silvery"

const render = createRenderer({ cols: 80, rows: 5 })

describe("LineNumber", () => {
  test("auto-width: single-digit number renders as-is", () => {
    const app = render(<LineNumber n={3} />)
    expect(app.text).toContain("3")
    // No padding when width matches digit count
    expect(app.text).not.toContain("  3")
  })

  test("explicit width: pads with spaces from the left", () => {
    const app = render(<LineNumber n={7} width={4} />)
    expect(app.text).toContain("   7")
  })

  test("multiple line numbers stack with consistent gutter", () => {
    const app = render(
      <Box flexDirection="column">
        <LineNumber n={1} width={3} />
        <LineNumber n={42} width={3} />
        <LineNumber n={999} width={3} />
      </Box>,
    )
    expect(app.text).toContain("  1")
    expect(app.text).toContain(" 42")
    expect(app.text).toContain("999")
  })

  test("highlight prop changes the rendered color (cell-level check)", () => {
    const plain = render(<LineNumber n={5} width={2} />)
    const cellPlain = plain.cell(plain.text.indexOf("5"), 0)

    const highlit = render(<LineNumber n={5} width={2} highlight />)
    const cellHi = highlit.cell(highlit.text.indexOf("5"), 0)

    // The two should resolve to different fg colors (muted vs primary).
    expect(cellPlain.fg).not.toEqual(cellHi.fg)
  })
})
