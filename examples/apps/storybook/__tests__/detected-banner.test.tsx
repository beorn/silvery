/**
 * Storybook: detected-scheme banner is stable across renders.
 *
 * Feedback report (2026-04-19): user saw the detected line "appear then
 * disappear". Root cause: DetectedLine was inside StatusBar at the bottom
 * of the flex column — could get pushed off-screen when the scheme list's
 * viewport shrunk.
 *
 * Fix: DetectedLine moved to the topmost row, outside the flexGrow area.
 *
 * These tests assert the banner is present on first render AND after a
 * key-press that normally triggers a list re-render.
 */

import React from "react"
import { describe, test, expect } from "vitest"
import { createRenderer, stripAnsi } from "@silvery/test"
import { Storybook } from "../../storybook.tsx"
import { buildEntries } from "../data.ts"

const DETECTED_FINGERPRINT = {
  name: "catppuccin-mocha",
  source: "fingerprint" as const,
  confidence: 0.87,
  matchedName: "catppuccin-mocha",
}

describe("Storybook detected banner", () => {
  test("shows matched scheme name + confidence on first render", () => {
    const render = createRenderer({ cols: 100, rows: 30 })
    const app = render(<Storybook entries={buildEntries()} detected={DETECTED_FINGERPRINT} />)
    const text = stripAnsi(app.text)
    expect(text).toContain("detected")
    expect(text).toContain("catppuccin-mocha")
    expect(text).toContain("87%")
  })

  test("shows '(detection unavailable)' when detected is null", () => {
    const render = createRenderer({ cols: 100, rows: 30 })
    const app = render(<Storybook entries={buildEntries()} detected={null} />)
    const text = stripAnsi(app.text)
    expect(text).toContain("detected")
    expect(text).toContain("detection unavailable")
  })

  test("banner survives a j-press (no flash, no disappearing)", () => {
    const render = createRenderer({ cols: 100, rows: 30 })
    const app = render(<Storybook entries={buildEntries()} detected={DETECTED_FINGERPRINT} />)
    const before = stripAnsi(app.text)
    expect(before).toContain("detected")

    // Press j a few times — this triggers scheme-list re-renders. Before the
    // fix, the detected banner could be pushed off-screen in some viewports.
    app.press("j")
    app.press("j")
    app.press("j")
    const after = stripAnsi(app.text)
    expect(after).toContain("detected")
    expect(after).toContain("catppuccin-mocha")
  })

  test("banner is at the top of the layout (first occurrence above NavBar)", () => {
    const render = createRenderer({ cols: 100, rows: 30 })
    const app = render(<Storybook entries={buildEntries()} detected={DETECTED_FINGERPRINT} />)
    const text = stripAnsi(app.text)
    const detectedPos = text.indexOf("detected")
    // NavBar includes panel labels like "Schemes" / "Swatches" / "Components".
    const navPos = text.indexOf("Schemes")
    expect(detectedPos).toBeGreaterThanOrEqual(0)
    expect(navPos).toBeGreaterThan(detectedPos)
  })
})
