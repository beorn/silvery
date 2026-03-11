/**
 * Scrollback promotion — verifies box borders survive promotion to terminal scrollback
 * and that the screen is never blank after Enter presses.
 *
 * Uses the CodingAgent example to trigger scrollback promotion via repeated Enter presses.
 * Tests the km-7dfxf bug: last promoted box's ╰ bottom border gets truncated.
 * Tests blank-screen-on-Enter bug: screen goes blank after promotion.
 */

import React from "react"
import { describe, test, expect, afterEach } from "vitest"
import { createTermless } from "@silvery/test"
import "@termless/test/matchers"
import type { Term } from "../../packages/term/src/ansi/term"
import { run, type RunHandle } from "../../packages/term/src/runtime/run"
import { CodingAgent, SCRIPT } from "../../examples/interactive/static-scrollback"

describe("scrollback promotion: border preservation", () => {
  let term: Term
  let handle: RunHandle

  afterEach(() => {
    handle?.unmount()
  })

  test("fully promoted boxes retain all border characters", async () => {
    term = createTermless({ cols: 120, rows: 40 })
    handle = await run(<CodingAgent script={SCRIPT} autoStart={false} fastMode={true} />, term)

    // 5 presses: enough content that complete boxes are in scrollback
    for (let i = 0; i < 5; i++) {
      await handle.press("Enter")
    }

    const scrollbackText = term.scrollback!.getText()
    expect(scrollbackText.length).toBeGreaterThan(0)

    expect(scrollbackText).toContain("╭")
    expect(scrollbackText).toContain("│")
    expect(scrollbackText).toContain("╰")
  })

  test("promoted boxes on screen retain ╰ bottom border before entering scrollback", async () => {
    term = createTermless({ cols: 120, rows: 40 })
    handle = await run(<CodingAgent script={SCRIPT} autoStart={false} fastMode={true} />, term)

    // 4 presses: promoted boxes may still be on-screen (not yet scrolled into scrollback).
    // Whether on-screen or in scrollback, ╰ must be present.
    for (let i = 0; i < 4; i++) {
      await handle.press("Enter")
    }

    const screenText = term.screen!.getText()
    const scrollbackText = term.scrollback!.getText()
    const allText = scrollbackText + screenText
    expect(allText).toContain("╭")
    expect(allText).toContain("│")
    expect(allText).toContain("╰")
  })
})

describe("scrollback promotion: no blank screen on Enter", () => {
  let term: Term
  let handle: RunHandle

  afterEach(() => {
    handle?.unmount()
  })

  /**
   * Check that visible screen has meaningful content — not blank/empty.
   * Returns true if screen has at least some non-whitespace text.
   */
  function screenHasContent(screen: NonNullable<Term["screen"]>): boolean {
    const text = screen.getText()
    // Strip whitespace and check for meaningful content
    return text.replace(/\s/g, "").length > 0
  }

  test("screen is never blank after Enter presses (small terminal)", async () => {
    // Use a small terminal (24 rows) to trigger the issue sooner —
    // content fills the screen faster, making promotion happen earlier.
    term = createTermless({ cols: 120, rows: 24 })
    handle = await run(<CodingAgent script={SCRIPT} autoStart={false} fastMode={true} />, term)

    // Initial render should have content
    expect(screenHasContent(term.screen!)).toBe(true)

    // Press Enter repeatedly — screen must never go blank
    for (let i = 0; i < 8; i++) {
      await handle.press("Enter")
      const hasContent = screenHasContent(term.screen!)
      const screenText = term.screen!.getText()
      const lines = term.screen!.getLines()
      // Count non-blank lines
      const nonBlankLines = lines.filter((l: string) => l.trim().length > 0).length
      expect(
        hasContent,
        `Screen blank after Enter press ${i + 1}.\n` +
          `Non-blank lines: ${nonBlankLines}/${lines.length}\n` +
          `Screen text:\n${screenText}`,
      ).toBe(true)
      // Should always have at least the status bar with "context"
      expect(term.screen).toContainText("context")
      // Should have substantial content — not just 1-2 lines
      expect(
        nonBlankLines,
        `Too few non-blank lines after Enter press ${i + 1}: ${nonBlankLines}`,
      ).toBeGreaterThan(2)
    }
  })

  test("screen is never blank after Enter presses (very small terminal)", async () => {
    // Even smaller terminal to exacerbate the issue
    term = createTermless({ cols: 80, rows: 16 })
    handle = await run(<CodingAgent script={SCRIPT} autoStart={false} fastMode={true} />, term)

    expect(screenHasContent(term.screen!)).toBe(true)

    for (let i = 0; i < 8; i++) {
      await handle.press("Enter")
      const hasContent = screenHasContent(term.screen!)
      const screenText = term.screen!.getText()
      expect(hasContent, `Screen blank after Enter press ${i + 1}. Screen text:\n${screenText}`).toBe(
        true,
      )
      expect(term.screen).toContainText("context")
    }
  })

  test("screen transitions are smooth — content count never drops drastically", async () => {
    // Track non-blank line count across presses.
    // A "blank screen" manifests as a sudden drop in non-blank lines.
    term = createTermless({ cols: 120, rows: 24 })
    handle = await run(<CodingAgent script={SCRIPT} autoStart={false} fastMode={true} />, term)

    let prevNonBlank = 0
    const lines0 = term.screen!.getLines()
    prevNonBlank = lines0.filter((l: string) => l.trim().length > 0).length

    for (let i = 0; i < 10; i++) {
      await handle.press("Enter")

      const lines = term.screen!.getLines()
      const nonBlankLines = lines.filter((l: string) => l.trim().length > 0).length

      // Content should never drop to less than half of what it was (unless it was <3)
      if (prevNonBlank >= 3) {
        expect(
          nonBlankLines,
          `Content dropped from ${prevNonBlank} to ${nonBlankLines} non-blank lines ` +
            `after Enter ${i + 1} (possible blank screen bug)\n` +
            lines.map((l: string, idx: number) => `  ${idx}: "${l.trimEnd().slice(0, 80)}"`).join("\n"),
        ).toBeGreaterThanOrEqual(Math.floor(prevNonBlank / 3))
      }
      prevNonBlank = nonBlankLines
    }
  })

  test("live content always renders in visible area after promotion", async () => {
    // Test that after each promotion the live content occupies the screen correctly.
    // The bug manifests as live content being pushed off-screen or the cursor
    // being at the wrong position, leaving visible area blank.
    term = createTermless({ cols: 120, rows: 20 })
    handle = await run(<CodingAgent script={SCRIPT} autoStart={false} fastMode={true} />, term)

    for (let i = 0; i < 10; i++) {
      await handle.press("Enter")

      const lines = term.screen!.getLines()
      const nonBlankLines = lines.filter((l: string) => l.trim().length > 0).length

      // After a few presses, we expect content to fill most of the screen.
      // The live area should have at least the latest exchange + status bar.
      // If we see fewer than 3 non-blank lines on a 20-row terminal,
      // something went very wrong.
      expect(
        nonBlankLines,
        `After Enter ${i + 1}: only ${nonBlankLines}/${lines.length} non-blank lines\n` +
          lines.map((l: string, idx: number) => `  ${idx}: "${l.trimEnd().slice(0, 80)}"`).join("\n"),
      ).toBeGreaterThan(2)
    }
  })

  test("dump screen state at each step for debugging", async () => {
    term = createTermless({ cols: 80, rows: 12 })
    handle = await run(<CodingAgent script={SCRIPT} autoStart={false} fastMode={true} />, term)

    const snapshots: string[] = []
    const snapshot = (label: string) => {
      const lines = term.screen!.getLines()
      const scrollback = term.scrollback!.getText()
      const nonBlank = lines.filter((l: string) => l.trim().length > 0).length
      snapshots.push(
        `\n=== ${label} (${nonBlank}/${lines.length} non-blank, scrollback=${scrollback.length} chars) ===\n` +
          lines.map((l: string, i: number) => `  ${String(i).padStart(2)}: "${l.trimEnd().slice(0, 75)}"`).join("\n"),
      )
    }

    snapshot("initial")
    for (let i = 0; i < 8; i++) {
      await handle.press("Enter")
      snapshot(`Enter ${i + 1}`)
    }

    // This test always passes — it's for visual inspection of output.
    // Check that we never have a blank screen.
    for (let i = 0; i < 8; i++) {
      const s = snapshots[i + 1]!
      const match = s.match(/\((\d+)\//)
      const nonBlank = parseInt(match![1]!)
      expect(nonBlank, `Blank screen detected:\n${snapshots.join("\n")}`).toBeGreaterThan(0)
    }
  })

  test("content fills screen properly — no excess blank area after promotion", async () => {
    // After promotion, the live content + padding should fill the terminal.
    // The screen should not show content crammed into just 2-3 lines with
    // the rest blank. Verify that the non-blank content area is reasonable.
    term = createTermless({ cols: 120, rows: 24 })
    handle = await run(<CodingAgent script={SCRIPT} autoStart={false} fastMode={true} />, term)

    // Advance to a point where promotion has happened
    for (let i = 0; i < 4; i++) {
      await handle.press("Enter")
    }

    // At this point we should have content from the latest exchanges.
    // With 24 rows and MAX_LIVE_TURNS=3, the live content should be
    // at least 5-10 lines (status bar + latest exchanges with borders).
    const lines = term.screen!.getLines()
    const nonBlankLines = lines.filter((l: string) => l.trim().length > 0).length

    // At least 5 non-blank lines (agent response with border + status bar)
    expect(nonBlankLines).toBeGreaterThanOrEqual(5)

    // The content should start near the top of the screen, not pushed down
    const firstContentLine = lines.findIndex((l: string) => l.trim().length > 0)
    expect(firstContentLine).toBeLessThanOrEqual(3) // Content starts within first 3 rows
  })
})
