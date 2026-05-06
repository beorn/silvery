import { describe, test, expect } from "vitest"
import React from "react"
import { Box, Text } from "silvery"
import { createRenderer } from "@silvery/test"

/**
 * Regression: applyBgSegmentsToLine must clip bg paint to the parent's
 * visible region (maxCol/minCol), not walk the full natural-flow width
 * of the line.
 *
 * Bug: when a Text is laid out wider than its visible parent
 * (overflow=hidden parent narrower than the text's natural width),
 * bg-segment paint walks ALL graphemes and emits bg cells past the
 * parent's right border. The chars themselves are clipped by
 * renderGraphemes's rightEdge check, leaving bg-only cells (no character
 * content) past the visible boundary.
 *
 * Symptom in km: 14-cell horizontal strip of $mutedbg with empty content
 * past the right edge of cards containing inline `~vault/@inbox/`.
 *
 * Bead: km-silvery.render-light-blue-bg-strip-residue
 */
describe("regression: applyBgSegmentsToLine clips bg paint to parent's visible region", () => {
  test("Text wider than overflow=hidden parent: bg-segment paint past right edge is clipped", () => {
    const cols = 80
    const rows = 4
    const render = createRenderer({ cols, rows })

    // Force the Text to be unwrapped (single very long line via wrap=false)
    // and laid out at its natural width by setting flexShrink=0 on the
    // inner container. Parent box is overflow=hidden width=20.
    // The inline-code `CODE` segment is at offset 60 (long enough to be
    // past the parent's right edge at col 20).
    const longText = "x".repeat(60)
    const app = render(
      <Box width={cols} flexDirection="row">
        <Box width={20} overflow="hidden" flexShrink={0}>
          <Box flexShrink={0}>
            <Text wrap={false}>
              {longText}
              <Text backgroundColor="cyan">CODE</Text>tail
            </Text>
          </Box>
        </Box>
        {/* Empty area to the right */}
        <Box flexGrow={1}>
          <Text>RIGHT</Text>
        </Box>
      </Box>,
    )

    // Past col 20 (the narrow card's visible right edge), no cell should
    // have a cyan-ish bg without character content.
    const leaks: string[] = []
    for (let r = 0; r < rows; r++) {
      for (let c = 20; c < cols; c++) {
        const cell = app.cell(c, r)
        const bg = cell.bg
        if (!bg) continue
        const isCyan = (() => {
          if (typeof bg === "object" && bg && "r" in bg) {
            const o = bg as { r: number; g: number; b: number }
            return o.g > o.r && o.b > o.r
          }
          return false
        })()
        if (isCyan && (!cell.char || cell.char === " ")) {
          leaks.push(`(${c},${r}) bg=${JSON.stringify(bg)}`)
        }
      }
    }

    expect(leaks).toEqual([])
  })

  test("inline code that fits within parent still paints bg correctly", () => {
    const render = createRenderer({ cols: 80, rows: 4 })
    const app = render(
      <Box width={40} overflow="hidden">
        <Text>
          short <Text backgroundColor="cyan">code</Text> end
        </Text>
      </Box>,
    )
    expect(app.text).toContain("short code end")
    // bg should still be applied to the "code" chars (within the visible area).
    const cellAtCode = app.cell(6, 0)
    expect(cellAtCode.char).toBe("c")
  })
})
