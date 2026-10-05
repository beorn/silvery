/**
 * Bounded slicing — @hab/27504 (residual of @hab/dutiful-rss-leak).
 *
 * `sliceByWidth` is on the render path for `wrap="truncate"`: a watcher pane
 * showing 120 columns of one long line. It used to call `splitGraphemes(text)`
 * — which materialises EVERY grapheme of the whole string into an array —
 * before keeping the first 120 columns. Measured on one 2 MB line: ~108 ms per
 * slice, i.e. per frame. It now walks the segmenter lazily and stops at the
 * width (~120x cheaper; the Segmenter's own pre-scan is the floor).
 *
 * The cost guard is RELATIVE (slice vs. the eager split in the same process),
 * so a slow or loaded machine moves both sides together and cannot flake.
 *
 * @failure A watcher pane showing 120 columns of one long line does O(line
 *          length) work per render: silvery materialises every grapheme of the
 *          whole string before slicing (~108 ms for one 2 MB line, per frame).
 * @level l2
 * @consumer @hab/27504-dutiful-long-line-measured-in-full (residual of @hab/dutiful-rss-leak)
 * @testonly none
 */
import { describe, test, expect } from "vitest"
import { sliceByWidth, splitGraphemes, createMeasurer } from "../src/unicode.ts"

/** The pre-fix algorithm, used as the correctness reference. */
function eagerSlice(measure: (g: string) => number, text: string, width: number): string {
  let w = 0
  let out = ""
  for (const grapheme of splitGraphemes(text)) {
    const gw = measure(grapheme)
    if (w + gw > width) break
    out += grapheme
    w += gw
  }
  return out
}

function perCall(fn: () => unknown, iters: number): number {
  for (let i = 0; i < 2; i++) fn()
  const t0 = performance.now()
  for (let i = 0; i < iters; i++) fn()
  return (performance.now() - t0) / iters
}

describe("sliceByWidth: bounded to the requested width", () => {
  test("keeps byte-for-byte the eager slice, on tricky graphemes", () => {
    const measurer = createMeasurer()
    const cases = [
      "hello world",
      "\u65e5\u672c\u8a9e\u306e\u30c6\u30ad\u30b9\u30c8\u3067\u3059", // CJK, 2 cols each
      "cafe\u0301 au lait", // combining accent
      "a\u{1f468}\u200d\u{1f469}\u200d\u{1f467}b", // ZWJ family emoji
      "\u26a0 \u2611 warning", // text-presentation emoji (rendered wide)
    ]
    for (const text of cases) {
      for (const width of [0, 1, 2, 3, 5, 8, 120]) {
        const expected = eagerSlice((g) => measurer.graphemeWidth(g), text, width)
        expect(measurer.sliceByWidth(text, width), `${text} @ ${width}`).toBe(expected)
        expect(sliceByWidth(text, width), `${text} @ ${width}`).toBe(expected)
      }
    }
  })

  test("slicing a huge line does not materialise every grapheme", () => {
    const big = "x".repeat(4 * 1024 * 1024)
    const sliceMs = perCall(() => sliceByWidth(big, 120), 3)
    const eagerMs = perCall(() => splitGraphemes(big).length, 3)
    expect(sliceByWidth(big, 120)).toBe("x".repeat(120))
    // Pre-fix the slice paid the eager split, so the two were ~equal (~1/1);
    // post-fix the slice stops at 120 columns. 8x is a wide safety margin.
    expect(sliceMs).toBeLessThan(eagerMs / 8)
  })
})
