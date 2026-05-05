/**
 * Sterling state-variant token tests.
 *
 * Verifies that the current Sterling tokens derive hover/active colors from
 * their base role colors via OKLCH lightness shift.
 */

import React from "react"
import { describe, expect, test } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, Text } from "silvery"
import { deriveTheme } from "@silvery/ansi"
import { catppuccinLatte, catppuccinMocha, oneDark } from "@silvery/theme"
import { hexToOklch } from "../../packages/color/src/index.ts"

function getL(hex: string): number {
  const parsed = hexToOklch(hex)
  if (!parsed) throw new Error(`hexToOklch() returned null for: ${JSON.stringify(hex)}`)
  return parsed.L
}

describe("dark theme Sterling state variants — OKLCH L shift", () => {
  const theme = deriveTheme(catppuccinMocha, "truecolor")

  test("accent state tokens are present and distinct", () => {
    expect(theme["fg-accent-hover"]).toMatch(/^#[0-9A-F]{6}$/i)
    expect(theme["fg-accent-active"]).toMatch(/^#[0-9A-F]{6}$/i)
    expect(theme["bg-accent-hover"]).toMatch(/^#[0-9A-F]{6}$/i)
    expect(theme["bg-accent-active"]).toMatch(/^#[0-9A-F]{6}$/i)
    expect(theme["fg-accent-hover"]).not.toBe(theme["fg-accent"])
    expect(theme["fg-accent-active"]).not.toBe(theme["fg-accent-hover"])
  })

  test("accent state lightness moves monotonically away from the base", () => {
    const baseL = getL(theme["fg-accent"])
    const hoverL = getL(theme["fg-accent-hover"])
    const activeL = getL(theme["fg-accent-active"])
    if (baseL > 0.6) {
      expect(hoverL).toBeLessThanOrEqual(baseL + 0.001)
      expect(activeL).toBeLessThanOrEqual(hoverL + 0.001)
    } else {
      expect(hoverL).toBeGreaterThanOrEqual(baseL - 0.001)
      expect(activeL).not.toBeCloseTo(baseL, 3)
    }
  })
})

describe("light theme Sterling state variants — OKLCH L shift", () => {
  const theme = deriveTheme(catppuccinLatte, "truecolor")

  test("accent state lightness moves monotonically away from the base", () => {
    const baseL = getL(theme["fg-accent"])
    const hoverL = getL(theme["fg-accent-hover"])
    const activeL = getL(theme["fg-accent-active"])
    if (baseL > 0.6) {
      expect(hoverL).toBeLessThanOrEqual(baseL + 0.001)
      expect(activeL).toBeLessThanOrEqual(hoverL + 0.001)
    } else {
      expect(hoverL).toBeGreaterThanOrEqual(baseL - 0.001)
      expect(activeL).not.toBeCloseTo(baseL, 3)
    }
  })
})

describe("dark theme Sterling state variants — oneDark", () => {
  const theme = deriveTheme(oneDark, "truecolor")

  test("accent state tokens are distinct", () => {
    expect(theme["fg-accent-hover"]).not.toBe(theme["fg-accent"])
    expect(theme["fg-accent-active"]).not.toBe(theme["fg-accent-hover"])
  })
})

const render = createRenderer({ cols: 40, rows: 5 })

describe("Sterling state tokens resolve in JSX", () => {
  test("<Text color='$fg-accent-hover'> renders with theme['fg-accent-hover'] RGB", () => {
    const theme = deriveTheme(catppuccinMocha, "truecolor")
    const app = render(
      <Box theme={theme} width={10} height={1}>
        <Text color="$fg-accent-hover">X</Text>
      </Box>,
    )

    let found = false
    for (let x = 0; x < 40; x++) {
      const cell = app.cell(x, 0)
      if (cell.char === "X") {
        expect(cell.fg).not.toBeNull()
        if (cell.fg) {
          const expected = hexToRgbTest(theme["fg-accent-hover"])
          expect(cell.fg.r).toBe(expected.r)
          expect(cell.fg.g).toBe(expected.g)
          expect(cell.fg.b).toBe(expected.b)
        }
        found = true
        break
      }
    }
    expect(found).toBe(true)
  })

  test("token override sticks to theme['fg-accent-hover']", () => {
    const overrideColor = "#abcdef"
    const mergedTheme = { ...deriveTheme(catppuccinMocha, "truecolor"), "fg-accent-hover": overrideColor }
    const expected = hexToRgbTest(overrideColor)
    const app = render(
      <Box theme={mergedTheme} width={10} height={1}>
        <Text color="$fg-accent-hover">Z</Text>
      </Box>,
    )

    let found = false
    for (let x = 0; x < 40; x++) {
      const cell = app.cell(x, 0)
      if (cell.char === "Z") {
        expect(cell.fg).not.toBeNull()
        if (cell.fg) {
          expect(cell.fg.r).toBe(expected.r)
          expect(cell.fg.g).toBe(expected.g)
          expect(cell.fg.b).toBe(expected.b)
        }
        found = true
        break
      }
    }
    expect(found).toBe(true)
  })
})

function hexToRgbTest(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace("#", "")
  return {
    r: Number.parseInt(h.slice(0, 2), 16),
    g: Number.parseInt(h.slice(2, 4), 16),
    b: Number.parseInt(h.slice(4, 6), 16),
  }
}
