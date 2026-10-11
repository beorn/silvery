/**
 * Pre-enrollment security audit (hh 28598): syntax highlighting of untrusted source.
 *
 * `highlight(code, lang)` hands the whole string to a TextMate grammar with no
 * bound on size or line length. Measures the cost of one large single line and
 * of many lines; the threat model rates a slowdown that ends on its own, needing
 * very large input, as Medium. Thresholds are deliberately generous: a red here
 * means the cost is far outside interactive use.
 */

import { describe, expect, test } from "vitest"
import { highlight } from "../../packages/syntax/src/index"

async function timed(code: string, lang: string): Promise<number> {
  const t0 = performance.now()
  await highlight(code, lang)
  return performance.now() - t0
}

describe("syntax highlighting cost on untrusted input", () => {
  test("warm-up (loads the grammar)", async () => {
    await highlight("const a = 1", "typescript")
  }, 60_000)

  test("one 256 KiB line of an unterminated template literal in typescript", async () => {
    const code = "`" + "${a".repeat(64 * 1024)
    const ms = await timed(code, "typescript")
    console.log(`typescript 256KiB single line: ${ms.toFixed(0)} ms`)
    expect(ms).toBeLessThan(2_000)
  }, 120_000)

  test("one 1 MiB line of plain identifiers in typescript", async () => {
    const code = "a ".repeat(512 * 1024)
    const ms = await timed(code, "typescript")
    console.log(`typescript 1MiB single line: ${ms.toFixed(0)} ms`)
    expect(ms).toBeLessThan(2_000)
  }, 120_000)

  test("10,000 lines of markdown with nested emphasis", async () => {
    const code = ("*".repeat(200) + "a" + "_".repeat(200) + "\n").repeat(10_000)
    const ms = await timed(code, "markdown")
    console.log(`markdown 10k pathological lines: ${ms.toFixed(0)} ms`)
    expect(ms).toBeLessThan(2_000)
  }, 120_000)

  test("scaling: 1,000 lines of the same markdown (linear cost would be ~1/10 of 10,000)", async () => {
    const code = ("*".repeat(200) + "a" + "_".repeat(200) + "\n").repeat(1_000)
    const ms = await timed(code, "markdown")
    console.log(`markdown 1k pathological lines: ${ms.toFixed(0)} ms`)
    expect(ms).toBeLessThan(2_000)
  }, 120_000)

  test("one 100 KiB markdown line of alternating emphasis markers", async () => {
    const code = "*_".repeat(50 * 1024)
    const ms = await timed(code, "markdown")
    console.log(`markdown 100KiB single line: ${ms.toFixed(0)} ms`)
    expect(ms).toBeLessThan(2_000)
  }, 120_000)
})
