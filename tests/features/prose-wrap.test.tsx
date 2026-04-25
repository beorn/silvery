/**
 * Prose primitive — wraps long-form text at the parent container's available
 * width without consumers having to remember the `flexShrink={1} minWidth={0}`
 * incantation.
 *
 * Regression target: the same shape that bit silvercode (commits cdf14b59 +
 * 363deaf6) — a fixed-width ancestor with a wrappable Text descendant. Without
 * the right flex chain, the Text measures at max-content and clips at the
 * container boundary.
 *
 * Test harness note: createRenderer({cols, rows}) does NOT pin root.style
 * width/height. Production silvercode uses `<Screen>` which pins both. This
 * test mirrors that with an explicit Box width/height — see
 * vendor/silvery/CLAUDE.md "Pin root width/height when testing full-app
 * layouts".
 */
import React from "react"
import { describe, test, expect } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, Prose, Text } from "silvery"

const TOTAL_COLS = 80
const TOTAL_ROWS = 30
const SIDE_WIDTH = 40
const LEFT_WIDTH = TOTAL_COLS - SIDE_WIDTH

// 1500-char paragraph (per bead acceptance criterion). Long enough to span
// many visual lines once wrapped at LEFT_WIDTH ≈ 40 cols.
const LONG = (
  "This is km, the Knowledge Machine — a TypeScript and Bun TUI workspace " +
  "for agentic knowledge workers. It unifies notes, tasks, and calendar " +
  "data with full history and bidirectional markdown sync, using SQLite " +
  "for storage and Silvery for the React TUI layer. Long-form prose like " +
  "this is exactly the case the Prose primitive is designed for: a column " +
  "of paragraph text inside a fixed-width card, where the inner Text uses " +
  "wrap='wrap' to soft-wrap onto additional visual lines instead of " +
  "clipping mid-word at the card boundary. Without the flex-shrink and " +
  "min-width zero on every box in the chain from the fixed-width ancestor " +
  "down to the wrappable Text, an intermediate row or column measures at " +
  "the sum of children's max-content widths, which propagates upward and " +
  "the wrappable Text receives that wide measure — and never wraps. The " +
  "Prose component encapsulates the canonical flex chain so consumers can " +
  "drop it in around message bodies, markdown views, and assistant " +
  "responses without thinking about flex-shrink or min-width at all."
).repeat(2)

function findSide(text: string): number | null {
  for (const line of text.split("\n")) {
    const col = line.indexOf("SIDE_PANEL")
    if (col !== -1) return col
  }
  return null
}

/** Non-whitespace, non-side-panel content past the boundary column. */
function contentPastBoundary(text: string, boundary: number): string[] {
  const offenders: string[] = []
  for (const line of text.split("\n")) {
    if (line.length <= boundary) continue
    const right = line.slice(boundary).trim()
    if (right === "" || right.startsWith("SIDE_PANEL")) continue
    offenders.push(line)
  }
  return offenders
}

describe("Prose: text-wrapping container primitive", () => {
  test("wraps long paragraph at parent boundary with no clipping", () => {
    expect(LONG.length).toBeGreaterThanOrEqual(1500)
    const render = createRenderer({ cols: TOTAL_COLS, rows: TOTAL_ROWS })
    const app = render(
      <Box flexDirection="row" width={TOTAL_COLS} height={TOTAL_ROWS}>
        <Box flexDirection="column" flexGrow={1} minHeight={0} overflow="hidden">
          <Prose>
            <Text wrap="wrap">{LONG}</Text>
          </Prose>
        </Box>
        <Box flexShrink={0} flexBasis={SIDE_WIDTH}>
          <Text>SIDE_PANEL</Text>
        </Box>
      </Box>,
    )

    // The side panel must still render at the right edge — i.e. Prose did
    // not push it off the right boundary by claiming max-content width.
    const sideCol = findSide(app.text)
    expect(sideCol).not.toBeNull()
    expect(sideCol).toBeGreaterThanOrEqual(LEFT_WIDTH - 2)

    // No prose content bleeds past the card boundary.
    const boundary = sideCol ?? LEFT_WIDTH
    expect(contentPastBoundary(app.text, boundary)).toEqual([])

    // Text is actually present and wrapped onto multiple lines (not just one
    // truncated head). The phrase "Knowledge Machine" appears verbatim once
    // somewhere in the wrapped output, and we have many non-empty lines of
    // prose to the left of the boundary.
    const lines = app.text.split("\n")
    expect(lines.some((l) => l.includes("Knowledge Machine"))).toBe(true)

    const proseLines = lines.filter((l) => {
      const left = l.slice(0, boundary).trim()
      return left.length > 0 && !left.startsWith("SIDE_PANEL")
    })
    // 3000+ chars at ~40-col width ⇒ should produce >> 5 visual lines.
    expect(proseLines.length).toBeGreaterThan(5)
  })

  test("nested Prose still wraps at outer card boundary", () => {
    // Two levels of Prose — the outer wraps a column of paragraphs, the
    // inner wraps a single paragraph. Mirrors MarkdownView wrapping each
    // paragraph individually inside a Prose-wrapped MarkdownView root.
    const render = createRenderer({ cols: TOTAL_COLS, rows: TOTAL_ROWS })
    const app = render(
      <Box flexDirection="row" width={TOTAL_COLS} height={TOTAL_ROWS}>
        <Box flexDirection="column" flexGrow={1} minHeight={0} overflow="hidden">
          <Prose>
            <Prose>
              <Text wrap="wrap">{LONG}</Text>
            </Prose>
          </Prose>
        </Box>
        <Box flexShrink={0} flexBasis={SIDE_WIDTH}>
          <Text>SIDE_PANEL</Text>
        </Box>
      </Box>,
    )

    const sideCol = findSide(app.text)
    const boundary = sideCol ?? LEFT_WIDTH
    expect(contentPastBoundary(app.text, boundary)).toEqual([])
  })
})
