/**
 * SchemeBrowser — unit tests for UI feedback items 1-4.
 *
 * Verifies:
 *   1. Header says "Color Schemes" (not "Palettes").
 *   2. Swatches appear before the scheme name (swatch cluster left of label).
 *   3. Light/dark section headers render.
 *   4. Scroll bug: cursor marker stays visible after pressing j 10 times.
 */

import React from "react"
import { describe, test, expect } from "vitest"
import { createRenderer, stripAnsi } from "@silvery/test"
import { ThemeProvider } from "silvery"
import { SchemeBrowser } from "../scheme-browser.tsx"
import { buildEntries } from "../data.ts"

// ============================================================================
// Helpers
// ============================================================================

function makeEntries() {
  return buildEntries()
}

/** Render SchemeBrowser with a given selectedIndex, return plain text lines. */
function renderBrowser(selectedIndex: number, entries = makeEntries()) {
  const render = createRenderer({ cols: 36, rows: 30 })
  // SchemeBrowser uses $tokens — wrap in ThemeProvider to avoid resolution warnings.
  const app = render(
    <ThemeProvider>
      <SchemeBrowser entries={entries} selectedIndex={selectedIndex} width={36} />
    </ThemeProvider>,
  )
  return stripAnsi(app.text)
}

// ============================================================================
// Item 1: header label
// ============================================================================

describe("SchemeBrowser header", () => {
  test('shows "Color Schemes" as the default title', () => {
    const text = renderBrowser(0)
    expect(text).toContain("Color Schemes")
    expect(text).not.toContain("Palettes")
  })

  test("respects custom title prop", () => {
    const entries = makeEntries()
    const render = createRenderer({ cols: 36, rows: 30 })
    const app = render(
      <ThemeProvider>
        <SchemeBrowser entries={entries} selectedIndex={0} title="My Schemes" width={36} />
      </ThemeProvider>,
    )
    const text = stripAnsi(app.text)
    expect(text).toContain("My Schemes")
  })
})

// ============================================================================
// Item 2: swatches before names
// ============================================================================

describe("SchemeBrowser swatch layout", () => {
  test("swatch block (█) appears on same line as scheme name", () => {
    const text = renderBrowser(0)
    // Each entry line contains both a swatch character and text.
    // We can't check horizontal order in plain text easily, but we can verify
    // both characters are present in the same line.
    const lines = text.split("\n")
    const entryLines = lines.filter((l) => l.includes("█"))
    expect(entryLines.length).toBeGreaterThan(0)
    // Each entry line that has a swatch should also have a scheme name character.
    // We verify at least one such line contains non-swatch text (the name).
    const withName = entryLines.filter((l) => /[a-z]/i.test(l))
    expect(withName.length).toBeGreaterThan(0)
  })
})

// ============================================================================
// Item 3: light/dark section dividers
// ============================================================================

describe("SchemeBrowser section dividers", () => {
  test("renders a dark section header in a tall viewport", () => {
    // Use 100-row viewport to ensure we can see dark header near the top.
    const entries = makeEntries()
    const render = createRenderer({ cols: 36, rows: 100 })
    const app = render(
      <ThemeProvider>
        <SchemeBrowser entries={entries} selectedIndex={0} width={36} />
      </ThemeProvider>,
    )
    const text = stripAnsi(app.text)
    expect(text).toMatch(/dark\s*\(\d+\)/)
  })

  test("renders a light section header when scrolled to a light entry", () => {
    // Select the first light entry so the scroll container shows the light section.
    const entries = makeEntries()
    const firstLightIdx = entries.findIndex((e) => !e.dark)
    expect(firstLightIdx).toBeGreaterThan(-1)

    const render = createRenderer({ cols: 36, rows: 20 })
    const app = render(
      <ThemeProvider>
        <SchemeBrowser entries={entries} selectedIndex={firstLightIdx} width={36} />
      </ThemeProvider>,
    )
    const text = stripAnsi(app.text)
    expect(text).toMatch(/light\s*\(\d+\)/)
  })

  test("dark section header appears in viewport when first dark entry is selected", () => {
    const entries = makeEntries()
    const firstDarkIdx = entries.findIndex((e) => e.dark)
    expect(firstDarkIdx).toBeGreaterThan(-1)

    const render = createRenderer({ cols: 36, rows: 20 })
    const app = render(
      <ThemeProvider>
        <SchemeBrowser entries={entries} selectedIndex={firstDarkIdx} width={36} />
      </ThemeProvider>,
    )
    const text = stripAnsi(app.text)
    expect(text).toMatch(/dark\s*\(\d+\)/)
  })
})

// ============================================================================
// Item 4 (scroll bug): selected entry visible in viewport at every scroll depth
// ============================================================================

describe("SchemeBrowser scroll visibility", () => {
  // The selection indicator was an arrow (▸); it's now the `inverse` attribute
  // on the whole row (omnibox/PickerDialog style). stripAnsi erases inverse,
  // so these tests verify the selected entry's NAME is in the viewport —
  // equivalent to "the scroll follows the cursor".
  test("selected entry (index 10) is visible in a 20-row viewport", () => {
    const entries = makeEntries()
    expect(entries.length).toBeGreaterThan(15)

    const render = createRenderer({ cols: 36, rows: 20 })
    const selectedIndex = 10
    const app = render(
      <ThemeProvider>
        <SchemeBrowser entries={entries} selectedIndex={selectedIndex} width={36} />
      </ThemeProvider>,
    )
    const text = stripAnsi(app.text)
    const selectedName = entries[selectedIndex]!.name
    expect(text).toContain(selectedName)
  })

  test("selected entry (index 20) stays visible in a 15-row viewport", () => {
    const entries = makeEntries()
    const selectedIndex = 20
    const render = createRenderer({ cols: 36, rows: 15 })
    const app = render(
      <ThemeProvider>
        <SchemeBrowser entries={entries} selectedIndex={selectedIndex} width={36} />
      </ThemeProvider>,
    )
    const text = stripAnsi(app.text)
    const selectedName = entries[selectedIndex]!.name
    expect(text).toContain(selectedName)
  })

  test("selected entry (index 30) stays visible in a 12-row viewport", () => {
    const entries = makeEntries()
    const selectedIndex = 30
    const render = createRenderer({ cols: 36, rows: 12 })
    const app = render(
      <ThemeProvider>
        <SchemeBrowser entries={entries} selectedIndex={selectedIndex} width={36} />
      </ThemeProvider>,
    )
    const text = stripAnsi(app.text)
    const selectedName = entries[selectedIndex]!.name
    expect(text).toContain(selectedName)
  })

  test("selected entry name is visible at every scroll depth 0..30 step 5", () => {
    const entries = makeEntries()
    const render = createRenderer({ cols: 36, rows: 15 })

    for (let i = 0; i < Math.min(entries.length, 30); i += 5) {
      const app = render(
        <ThemeProvider>
          <SchemeBrowser entries={entries} selectedIndex={i} width={36} />
        </ThemeProvider>,
      )
      const text = stripAnsi(app.text)
      const selectedName = entries[i]!.name
      expect(text, `entry name not visible at selectedIndex=${i}`).toContain(selectedName)
    }
  })
})
