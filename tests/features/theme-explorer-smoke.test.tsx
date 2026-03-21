/**
 * Theme Explorer Smoke Test
 *
 * Renders the Theme Explorer with every built-in palette to verify
 * none crash. Dynamic: auto-discovers palettes from @silvery/theme.
 */

import React from "react"
import { describe, it, expect } from "vitest"
import { createRenderer } from "@silvery/test"

import { ThemeExplorer, type ThemeEntry } from "../../examples/interactive/theme.tsx"
import { builtinPalettes, deriveTheme, type ThemeAdjustment } from "@silvery/theme"

// Smoke test — disable strict mode (not testing rendering correctness)
const render = createRenderer({ cols: 120, rows: 40 })

// Build entries from all built-in palettes (same as the real demo, minus detectTheme)
const entries: ThemeEntry[] = Object.entries(builtinPalettes).map(([name, palette]) => {
  const adjustments: ThemeAdjustment[] = []
  const theme = deriveTheme(palette, "truecolor", adjustments)
  return { name, palette, theme, adjustments }
})

describe("theme explorer smoke", () => {
  it("renders with all built-in palettes", { timeout: 30_000 }, () => {
    const app = render(<ThemeExplorer entries={entries} />)
    const frame = app.lastFrameText()!
    expect(frame.length).toBeGreaterThan(0)
    expect(frame).toContain("Palettes")
    expect(frame).toContain("Semantic Tokens")
    app.unmount()
  })

  it("renders each palette without error", { timeout: 30_000 }, () => {
    for (const entry of entries) {
      const app = render(<ThemeExplorer entries={[entry]} />)
      const frame = app.lastFrameText()!
      expect(frame).toContain(entry.name)
      app.unmount()
    }
  })
})
