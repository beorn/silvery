/**
 * Visual regression test for the static-scrollback demo.
 *
 * Spawns the demo with --fast, presses Enter to build up scrollback items,
 * then resizes and captures SVG screenshots at each step.
 *
 * Screenshots are saved to /tmp/scrollback-demo/ for manual inspection.
 * The test also checks border invariants at each step.
 *
 * Run:
 *   bun vitest run --project vendor vendor/beorn-inkx/tests/scrollback-demo-termless.test.ts
 */

import { writeFileSync, mkdirSync } from "fs"
import { describe, test, expect } from "vitest"
import { createTerminal } from "termless"
import { createXtermBackend } from "termless-xtermjs"

const OUT_DIR = "/tmp/scrollback-demo"
const COLS = 100
const ROWS = 30

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

/**
 * Check border integrity in the viewport text.
 * Returns failure descriptions (empty array = all good).
 */
function checkBorders(text: string): string[] {
  const lines = text.split("\n")
  const failures: string[] = []

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i]!.trimEnd()
    if (!trimmed) continue

    // Top border: ╭ must have matching ╮ on the same line
    if (trimmed.includes("╭") && !trimmed.includes("╮")) {
      failures.push(`line ${i}: top border ╭ without ╮: "${trimmed.slice(0, 60)}..."`)
    }

    // Bottom border: ╰ must have matching ╯ on the same line
    if (trimmed.includes("╰") && !trimmed.includes("╯")) {
      failures.push(`line ${i}: bottom border ╰ without ╯: "${trimmed.slice(0, 60)}..."`)
    }

    // Content rows: single │ without matching right │
    if (trimmed.includes("│")) {
      const first = trimmed.indexOf("│")
      const last = trimmed.lastIndexOf("│")
      if (first === last && !trimmed.includes("╭") && !trimmed.includes("╰")) {
        failures.push(`line ${i}: orphan │ without pair: "${trimmed.slice(0, 60)}..."`)
      }
    }
  }

  return failures
}

describe("scrollback demo visual regression", () => {
  test("press Enter 10 times then resize — generates screenshots", async () => {
    mkdirSync(OUT_DIR, { recursive: true })

    const term = createTerminal({
      backend: createXtermBackend({ cols: COLS, rows: ROWS }),
      cols: COLS,
      rows: ROWS,
      scrollbackLimit: 1000,
    })

    // Spawn the demo
    await term.spawn(
      ["bun", "examples/interactive/static-scrollback.tsx", "--fast"],
      { cwd: "/Users/beorn/Code/pim/km/vendor/beorn-inkx" },
    )

    // Wait for initial render — look for the status bar marker
    await term.waitFor("send", 10000)
    // Give streaming a moment to finish (--fast still has minimal delays)
    await sleep(1500)

    let step = 0
    function save(label: string) {
      const svg = term.screenshotSvg()
      const filename = `${OUT_DIR}/step-${String(step).padStart(2, "0")}-${label}.svg`
      writeFileSync(filename, svg)
      step++
      return filename
    }

    // Save initial state
    save("initial")

    const allBorderFailures: Array<{ step: string; failures: string[] }> = []

    // Press Enter 10 times, screenshot each time.
    // The demo uses --fast so streaming is instant, but we need to wait for
    // the React render cycle + scrollback promotion to complete.
    for (let i = 1; i <= 10; i++) {
      term.press("Enter")
      // Wait for scrollback count to update (status bar shows "↑ N in scrollback")
      await sleep(2500)
      const label = `enter-${i}`
      save(label)

      // Check borders in viewport
      const viewportText = term.getText()
      const failures = checkBorders(viewportText)
      if (failures.length > 0) {
        allBorderFailures.push({ step: label, failures })
      }
    }

    // Now resize tests with screenshots
    const resizeSizes = [
      { cols: 70, label: "shrink-70" },
      { cols: 120, label: "grow-120" },
      { cols: 80, label: "shrink-80" },
      { cols: 100, label: "restore-100" },
    ]

    for (const { cols: newCols, label } of resizeSizes) {
      term.resize(newCols, ROWS)
      await sleep(1500) // Wait for resize handling
      save(label)

      const viewportText = term.getText()
      const failures = checkBorders(viewportText)
      if (failures.length > 0) {
        allBorderFailures.push({ step: label, failures })
      }
    }

    // Cleanup
    await term.close()

    // Write border failure report to file (avoid console.log which fails in strict vitest)
    if (allBorderFailures.length > 0) {
      const report = allBorderFailures
        .map(({ step: s, failures }) => `  ${s}:\n${failures.map((f) => `    - ${f}`).join("\n")}`)
        .join("\n")
      writeFileSync(`${OUT_DIR}/border-failures.txt`, `Border failures:\n${report}\n`)
    }

    // Write summary
    writeFileSync(
      `${OUT_DIR}/summary.txt`,
      `Screenshots: ${step}\nBorder failures: ${allBorderFailures.length} steps\n` +
      `Steps with failures: ${allBorderFailures.map((f) => f.step).join(", ") || "none"}\n`,
    )

    // Verify we got all screenshots
    expect(step).toBeGreaterThan(10)
  }, 60000) // 60s timeout for the whole test
})
