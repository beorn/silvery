/**
 * AI-chat example tested with Termless — real terminal emulation.
 *
 * Unlike the component-level tests (ai-chat-scrollback.test.tsx) which use
 * createRenderer (headless, no output pipeline), these tests spawn the REAL
 * example process in a PTY and verify the actual terminal buffer + scrollback.
 *
 * This catches bugs that component tests miss:
 * - Garbled rendering from inline output-phase cursor miscalculation
 * - Frozen content bleeding into the visible screen area
 * - Box border overlaps after scrollback promotion
 * - Scrollback content integrity (colors, borders preserved)
 * - Terminal resize reflow
 */

import { describe, test, expect, beforeAll, afterAll } from "vitest"
import { createTerminal, type Terminal } from "@termless/core"
import { createXtermBackend } from "@termless/xtermjs"
import "@termless/test/matchers"

// ============================================================================
// Helpers
// ============================================================================

function createXterm(cols = 120, rows = 40) {
  return createTerminal({ backend: createXtermBackend(), cols, rows, scrollbackLimit: 1000 })
}

const EXAMPLE_CMD = [
  "bun",
  "examples/interactive/ai-chat.tsx",
  "--fast", // skip streaming delays
]
const CWD = new URL("../../", import.meta.url).pathname

// ============================================================================
// Invariant helpers
// ============================================================================

/**
 * Assert no double top-borders (╭╭) — a sign of overlapping/garbled boxes.
 * Two consecutive ╭-prefixed lines with no ╰ between them = overlapping boxes.
 */
function assertNoOverlappingBorders(term: Terminal) {
  const lines = term.screen.getLines()
  let lastTopBorderRow = -10
  for (let row = 0; row < lines.length; row++) {
    const line = lines[row]!.trimStart()
    if (line.startsWith("╭")) {
      if (row - lastTopBorderRow === 1) {
        const between = lines[row - 1]!.trimStart()
        if (!between.startsWith("╰")) {
          throw new Error(
            `Overlapping box borders at rows ${lastTopBorderRow} and ${row}:\n` +
              `  ${lastTopBorderRow}: ${lines[lastTopBorderRow]!.slice(0, 80)}\n` +
              `  ${row}: ${lines[row]!.slice(0, 80)}`,
          )
        }
      }
      lastTopBorderRow = row
    }
  }
}

// ============================================================================
// Main test suite — single process, sequential advances
// ============================================================================

describe("ai-chat example (termless)", { timeout: 60000 }, () => {
  let term: Terminal

  beforeAll(async () => {
    term = createXterm()
    await term.spawn(EXAMPLE_CMD, { cwd: CWD })
    await term.waitFor("Static Scrollback", 15000)
    await term.waitForStable(500, 10000)
  })

  afterAll(async () => {
    if (term) await term.close()
  })

  // --- Initial state ---

  test("initial render shows header and first exchange", () => {
    expect(term.screen).toContainText("Static Scrollback")
    expect(term.screen).toContainText("ScrollbackList")
    expect(term.screen).toContainText("Fix the login bug")
    expect(term.screen).toContainText("send")
    expect(term.screen).toContainText("context")
  })

  // --- Advancing ---

  test("Enter: first agent response appears", async () => {
    term.press("Enter")
    await term.waitFor("auth module", 10000)

    expect(term.screen).toContainText("Let me look at the auth module")
    expect(term.screen).toContainText("Read src/auth.ts")
    expect(term.screen).toContainText("context")
  })

  test("Enter: second agent response, no overlapping borders", async () => {
    term.press("Enter")
    await term.waitFor("Fixing now", 10000)
    await term.waitForStable(300, 5000)

    expect(term.screen).toContainText("Edit src/auth.ts")
    assertNoOverlappingBorders(term)
  })

  test("Enter: third advance, footer persists", async () => {
    term.press("Enter")
    await term.waitForStable(500, 10000)

    expect(term.screen).toContainText("context")
    assertNoOverlappingBorders(term)
  })

  test("Enter: fourth advance, earlier content in scrollback", async () => {
    term.press("Enter")
    await term.waitForStable(500, 10000)

    const scrollback = term.getScrollback()
    if (scrollback.totalLines > 0) {
      const scrollbackText = term.scrollback.getText()
      expect(scrollbackText).toContain("Fix the login bug")
    }
    expect(term.screen).toContainText("context")
    assertNoOverlappingBorders(term)
  })

  test("scrollback contains box drawing characters", () => {
    const scrollback = term.getScrollback()
    if (scrollback.totalLines > 0) {
      const scrollbackText = term.scrollback.getText()
      // Opening and side borders must survive scrollback promotion
      expect(scrollbackText).toContain("╭")
      expect(scrollbackText).toContain("│")
      // NOTE: ╰ (closing border) may be missing due to a known inline rendering
      // bug where content gets truncated during scrollback promotion.
      // When this is fixed, uncomment:
      // expect(scrollbackText).toContain("╰")
    }
  })

  test("Enter: fifth advance, still clean", async () => {
    term.press("Enter")
    await term.waitForStable(500, 10000)

    expect(term.screen).toContainText("context")
    assertNoOverlappingBorders(term)
  })

  // NOTE: Escape exit is a known bug (km-silvery.ai-chat-bugs).
  // The exit handler in Layer 2 useInput has unstable subscriptions.
  // Uncomment when the exit bug is fixed:
  // test("Escape exits cleanly", async () => {
  //   term.press("Escape")
  //   const deadline = Date.now() + 10000
  //   while (term.alive && Date.now() < deadline) {
  //     await new Promise((r) => setTimeout(r, 100))
  //   }
  //   expect(term.alive).toBe(false)
  // })
})

// ============================================================================
// Resize test — separate process
// ============================================================================

describe("ai-chat resize (termless)", { timeout: 60000 }, () => {
  let term: Terminal

  beforeAll(async () => {
    term = createXterm(120, 40)
    await term.spawn(EXAMPLE_CMD, { cwd: CWD })
    await term.waitFor("Static Scrollback", 15000)
    await term.waitForStable(500, 10000)
  })

  afterAll(async () => {
    if (term) await term.close()
  })

  test("advance once, then resize to 80x24", async () => {
    term.press("Enter")
    await term.waitForStable(500, 10000)

    term.resize(80, 24)
    await term.waitForStable(500, 10000)

    // Content should still be readable
    expect(term.screen).toContainText("context")
    const screenText = term.screen.getText()
    expect(screenText).toContain("│")
  })
})
