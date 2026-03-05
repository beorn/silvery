/**
 * Ad-hoc test: Status bar must not leak into scrollback after resize.
 *
 * User report: after resizing the terminal, scrolling up reveals the
 * status bar (bottom bar) duplicated in the scrollback buffer.
 *
 * This test spawns the static-scrollback demo, builds up scrollback,
 * resizes multiple times, interacts after each resize, and verifies
 * that the scrollback buffer never contains status bar content.
 */

import { describe, expect, test } from "vitest"
import { createTerminalFixture } from "@termless/test"

// Status bar signature strings that should NEVER appear in scrollback.
// These are unique to the status bar — exchange content won't contain them.
const STATUS_SIGNATURES = ["esc quit", "tab auto", "^L clear"]

function assertNoStatusBarInScrollback(term: ReturnType<typeof createTerminalFixture>, context: string) {
  const scrollback = term.scrollback.getText()
  for (const sig of STATUS_SIGNATURES) {
    expect(scrollback, `"${sig}" leaked into scrollback ${context}`).not.toContain(sig)
  }
}

describe("scrollback: status bar must not leak on resize", () => {
  test("resize shrink + expand + interact", async () => {
    const term = createTerminalFixture({
      cols: 100,
      rows: 30,
      scrollbackLimit: 1000,
    })

    await term.spawn(["bun", "examples/interactive/static-scrollback.tsx", "--fast"], {
      cwd: "/Users/beorn/Code/pim/km/vendor/hightea",
    })

    // Wait for initial render
    await term.waitFor("send", 10000)
    await new Promise((r) => setTimeout(r, 1500))

    // Build up scrollback: 5 exchanges
    for (let i = 0; i < 5; i++) {
      term.press("Enter")
      await new Promise((r) => setTimeout(r, 2000))
    }

    // Verify pre-conditions
    const screen = term.screen.getText()
    expect(screen).toContain("send")
    expect(screen).toContain("scrollback")

    // === Resize 1: shrink ===
    term.resize(70, 25)
    await new Promise((r) => setTimeout(r, 2000))
    assertNoStatusBarInScrollback(term, "after shrink to 70x25")

    // Interact after resize — press Enter twice
    for (let i = 0; i < 2; i++) {
      term.press("Enter")
      await new Promise((r) => setTimeout(r, 2000))
      assertNoStatusBarInScrollback(term, `after Enter #${i + 1} post-shrink`)
    }

    // === Resize 2: expand ===
    term.resize(120, 35)
    await new Promise((r) => setTimeout(r, 2000))
    assertNoStatusBarInScrollback(term, "after expand to 120x35")

    // Interact after expand
    for (let i = 0; i < 2; i++) {
      term.press("Enter")
      await new Promise((r) => setTimeout(r, 2000))
      assertNoStatusBarInScrollback(term, `after Enter #${i + 1} post-expand`)
    }

    // === Resize 3: back to original ===
    term.resize(100, 30)
    await new Promise((r) => setTimeout(r, 2000))
    assertNoStatusBarInScrollback(term, "after restore to 100x30")

    // Final interactions
    term.press("Enter")
    await new Promise((r) => setTimeout(r, 2000))
    assertNoStatusBarInScrollback(term, "after final Enter")

    // Also verify visible screen still works
    const finalScreen = term.screen.getText()
    expect(finalScreen).toContain("send")
  }, 60000)
})
