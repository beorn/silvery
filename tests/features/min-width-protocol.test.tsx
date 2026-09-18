/**
 * Contract tests for the minimum-width protocol
 * (@si/apportion-consolidation, item 4 — "document the minimum-width protocol").
 *
 * These pin the behavior that `docs/guide/min-width.md` describes, so the guide
 * cannot drift off the code the way `docs/reference/ansi.md` had. Each test
 * corresponds to a claim the guide makes; if a claim changes, one of these goes
 * red and the guide gets edited in the same change.
 *
 * The protocol is a contract between four parties, not a single function:
 *
 *   1. flexily derives each flex item's automatic minimum size (CSS §4.5) and
 *      asks for intrinsic min-content via `MEASURE_MODE_MIN_CONTENT`.
 *   2. The engine adapter translates that mode (`flexily-zero-adapter`), or
 *      refuses it (`yoga-adapter` — the mode is flexily-only).
 *   3. The reconciler's Text measureFunc ANSWERS the min-content query.
 *   4. `minWidth={0}` is the author-side opt-out from the auto-min floor.
 *
 * flexily documents parts 1 and 2 in its yoga-divergences guide (Divergence 4).
 * These tests cover the silvery-visible surface: parts 3 and 4.
 */

import React from "react"
import { describe, expect, test } from "vitest"
import { createRenderer } from "@silvery/test"
import { intrinsicWidths } from "@silvery/ag-term/unicode"
import { Box } from "../../packages/ag-react/src/components/Box"
import { Text } from "../../packages/ag-react/src/components/Text"

/** A token with no break opportunity — hyphens and soft separators excluded. */
const LONG_TOKEN = "supercalifragilisticexpialidocious" // 34 cells
/** Wrappable prose whose longest unbreakable token is short. */
const PROSE =
  "the allocator distributes width across parallel tracks and reports when the floors do not fit"

function cellWidth(element: React.ReactElement, cols = 60): number {
  const app = createRenderer({ cols, rows: 16 })(element)
  const node = app.locator("#cell").resolve()
  if (!node?.boxRect) throw new Error("no #cell box was laid out")
  return node.boxRect.width
}

describe("minimum-width protocol", () => {
  describe("the auto-min floor (CSS §4.5, item side)", () => {
    test.each([LONG_TOKEN, "2026-09-08"])(
      "wrappable Text floors at its unbreakable token (%s)",
      (token) => {
        // A hyphenated date and an ordinary token have the same atomic floor.
        const width = cellWidth(
          <Box width={Math.min(12, token.length - 1)} flexDirection="row">
            <Box id="cell">
              <Text wrap="wrap">{token}</Text>
            </Box>
          </Box>,
        )
        expect(width).toBe(token.length)
        // And that floor is exactly what intrinsicWidths reports as min-content —
        // the same number, from the shared measurement home.
        expect(intrinsicWidths(token, "wrap").minContentWidth).toBe(token.length)
      },
    )

    test("wrappable prose floors at its longest token, not its natural width", () => {
      const longestToken = Math.max(...PROSE.split(" ").map((w) => w.length))
      const width = cellWidth(
        <Box width={20} flexDirection="row">
          <Box id="cell">
            <Text wrap="wrap">{PROSE}</Text>
          </Box>
        </Box>,
      )
      // It wraps into the 20 available rather than pinning at PROSE.length…
      expect(width).toBeLessThan(PROSE.length)
      // …and never below the longest unbreakable token.
      expect(width).toBeGreaterThanOrEqual(longestToken)
      expect(intrinsicWidths(PROSE, "wrap").minContentWidth).toBe(longestToken)
    })
  })

  describe("minWidth={0} — the author-side opt-out", () => {
    test("opts a wrappable-Text wrapper out of the auto-min floor", () => {
      const constrained = 12
      const withoutHatch = cellWidth(
        <Box width={constrained} flexDirection="row">
          <Box id="cell">
            <Text wrap="wrap">{LONG_TOKEN}</Text>
          </Box>
        </Box>,
      )
      const withHatch = cellWidth(
        <Box width={constrained} flexDirection="row">
          <Box id="cell" minWidth={0}>
            <Text wrap="wrap">{LONG_TOKEN}</Text>
          </Box>
        </Box>,
      )
      expect(withoutHatch).toBe(LONG_TOKEN.length)
      expect(withHatch).toBeLessThan(withoutHatch)
      expect(withHatch).toBeLessThanOrEqual(constrained)
    })

    test("non-wrappable Text reports min-content 1 — it can collapse to an ellipsis", () => {
      // truncate/clip/false declare "I fit in any width; overflow becomes an
      // ellipsis", so min-content is 1 cell while max-content stays natural.
      // Changed 2026-05-11 (@km/silvery/text-truncation-mid-word-no-ellipsis):
      // reporting min-content == max-content pinned the parent at natural
      // width, whose overflow="hidden" then hard-clipped mid-word with no
      // ellipsis, because flex never shrank the Text.
      for (const wrap of ["truncate", "clip", false] as const) {
        const iw = intrinsicWidths(LONG_TOKEN, wrap)
        expect(iw.maxContentWidth, `${String(wrap)} max-content`).toBe(LONG_TOKEN.length)
        expect(iw.minContentWidth, `${String(wrap)} min-content`).toBe(1)
      }
    })

    test("non-wrappable Text needs NO escape hatch — minWidth={0} is a no-op there", () => {
      // The counterpart to the min-content=1 report above, at the layout level.
      // A Box wrapping a long truncate-Text already shrinks to its container;
      // adding minWidth={0} changes nothing. Guidance that still prescribes the
      // hatch for this case is describing pre-2026-05-11 behavior.
      const container = 12
      for (const wrap of ["truncate", "clip", false] as const) {
        const bare = cellWidth(
          <Box width={container} flexDirection="row">
            <Box id="cell">
              <Text wrap={wrap}>{LONG_TOKEN}</Text>
            </Box>
          </Box>,
        )
        const hatched = cellWidth(
          <Box width={container} flexDirection="row">
            <Box id="cell" minWidth={0}>
              <Text wrap={wrap}>{LONG_TOKEN}</Text>
            </Box>
          </Box>,
        )
        expect(bare, `${String(wrap)} shrinks to its container unaided`).toBe(container)
        expect(hatched, `${String(wrap)} is unchanged by minWidth={0}`).toBe(bare)
      }
    })

    test("hard wrap reports min-content 1 — any character may break", () => {
      expect(intrinsicWidths(LONG_TOKEN, "hard").minContentWidth).toBe(1)
      expect(intrinsicWidths("", "hard").minContentWidth).toBe(0)
    })

    test("minWidth={0} on the Text itself also releases the row", () => {
      const width = cellWidth(
        <Box width={12} flexDirection="row">
          <Box id="cell">
            <Text minWidth={0} wrap="wrap">
              {LONG_TOKEN}
            </Text>
          </Box>
        </Box>,
      )
      expect(width).toBeLessThanOrEqual(12)
    })
  })

  describe("min-content propagates recursively through container wrappers", () => {
    test("nesting depth does not change the floor", () => {
      // The guide's central claim for component authors: you do not thread
      // anything through a wrap chain. A floor established at the Text is the
      // same floor five wrappers up.
      const nest = (depth: number): React.ReactElement => {
        let node: React.ReactElement = <Text wrap="wrap">{LONG_TOKEN}</Text>
        for (let i = 0; i < depth; i++) node = <Box>{node}</Box>
        return (
          <Box width={12} flexDirection="row">
            <Box id="cell">{node}</Box>
          </Box>
        )
      }
      const widths = [0, 1, 3, 5].map((d) => cellWidth(nest(d)))
      expect(new Set(widths).size, `floors across nesting depths: ${widths.join(", ")}`).toBe(1)
      expect(widths[0]).toBe(LONG_TOKEN.length)
    })
  })
})
