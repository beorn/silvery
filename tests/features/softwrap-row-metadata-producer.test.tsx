/**
 * Soft-wrap row-metadata PRODUCER — the render pipeline must populate
 * `buffer.getRowMeta(row)` with `{ softWrapped, lastContentCol, wrapJoinSpace }`
 * for every rendered text row, so the copy-selection CONSUMER
 * (`extractText` in @silvery/headless) can rejoin soft-wrapped visual rows into
 * their logical line.
 *
 * The end-to-end clipboard behavior is pinned by
 * `selection-copy-margins.test.tsx`; THIS file pins the producer in isolation,
 * asserting the metadata the render phase writes per row. Without the producer,
 * `softWrapped` is always false and wrapped copies wrongly split with "\n".
 *
 * Per the pipeline rule (`packages/ag-term/src/pipeline/AGENTS.md` — "Test
 * Before Change"), this is a STRICT producer test: run under SILVERY_STRICT=2,
 * which auto-verifies incremental≡fresh on every render. Because rowMeta is NOT
 * part of the cell-level STRICT diff, the multi-frame case below ALSO asserts
 * `getRowMeta` explicitly against `freshRender()` so the format-cache replay
 * path (cache hit reuses `lineBreaks`) is locked to the fresh path.
 *
 * Wrap behavior these expectations encode (from formatTextLines):
 *   - width=16, "alpha beta gamma delta epsilon"  → ["alpha beta gamma","delta epsilon"]   (word wrap → space consumed)
 *   - width=18, "supercalifragilisticexpialidocious" → ["supercalifragilist","icexpialidocious"] (mid-word char-break, no space)
 *   - width=20, "one two\nthree four"             → ["one two","three four"]                 (explicit hard break)
 *   - width=20, "short"                           → ["short"]                                (single/final line)
 *   - width=14, "alpha beta gamma delta epsilon"  → ["alpha beta","gamma delta","epsilon"]   (multi-row word wrap)
 */

import React from "react"
import { describe, test, expect } from "vitest"
import { createRenderer, type TerminalBuffer } from "@silvery/test"
import { Box, Text } from "silvery"

// Mirror <Screen>: pin root width/height so the column→Text wrap chain doesn't
// collapse to height=1 under unconstrained max-content sizing (see
// vendor/silvery/AGENTS.md "Pin root width/height when testing full-app
// layouts"). Generous rows so every wrapped line is rendered.
const ROWS = 8

function Para({ width, text }: { width: number; text: string }) {
  return (
    <Box width={width} height={ROWS} flexDirection="column">
      <Text wrap="wrap">{text}</Text>
    </Box>
  )
}

function getBuffer(app: { lastBuffer(): TerminalBuffer | undefined }): TerminalBuffer {
  const buf = app.lastBuffer()
  if (!buf) throw new Error("no buffer rendered")
  return buf
}

describe("producer: soft-wrap row metadata (buffer.getRowMeta)", () => {
  test("(a) word-wrap boundary → softWrapped + wrapJoinSpace, correct lastContentCol", () => {
    const render = createRenderer({ cols: 24, rows: ROWS })
    const app = render(<Para width={16} text="alpha beta gamma delta epsilon" />)

    const buf = getBuffer(app)
    // Row 0 = "alpha beta gamma" (16 chars, cols 0..15). The break to row 1
    // consumed the space before "delta" → soft-space.
    const r0 = buf.getRowMeta(0)
    expect(r0.softWrapped).toBe(true)
    expect(r0.wrapJoinSpace).toBe(true)
    expect(r0.lastContentCol).toBe(15)

    // Row 1 = "delta epsilon" (13 chars, cols 0..12) — final line, not wrapped.
    const r1 = buf.getRowMeta(1)
    expect(r1.softWrapped).toBe(false)
    expect(r1.lastContentCol).toBe(12)
  })

  test("(b) forced mid-word char-break → softWrapped, wrapJoinSpace FALSE", () => {
    const render = createRenderer({ cols: 24, rows: ROWS })
    const app = render(<Para width={18} text="supercalifragilisticexpialidocious" />)

    const buf = getBuffer(app)
    // Row 0 = "supercalifragilist" (18 chars). The token is unbreakable and
    // longer than the box, so word-wrap falls back to a char-break that
    // consumed NO whitespace → soft-break: join must NOT insert a space.
    const r0 = buf.getRowMeta(0)
    expect(r0.softWrapped).toBe(true)
    expect(r0.wrapJoinSpace).toBe(false)
    expect(r0.lastContentCol).toBe(17)

    // Row 1 = "icexpialidocious" (16 chars, cols 0..15) — final line.
    const r1 = buf.getRowMeta(1)
    expect(r1.softWrapped).toBe(false)
    expect(r1.lastContentCol).toBe(15)
  })

  test("(c) explicit \\n hard break → softWrapped FALSE (keep the newline)", () => {
    const render = createRenderer({ cols: 24, rows: ROWS })
    const app = render(<Para width={20} text={"one two\nthree four"} />)

    const buf = getBuffer(app)
    // Row 0 = "one two" — the gap to row 1 is an explicit "\n", so this is a
    // real line break, NOT a soft wrap. The consumer must keep the newline.
    const r0 = buf.getRowMeta(0)
    expect(r0.softWrapped).toBe(false)
    expect(r0.lastContentCol).toBe(6) // "one two" = 7 chars, cols 0..6

    const r1 = buf.getRowMeta(1)
    expect(r1.softWrapped).toBe(false)
    expect(r1.lastContentCol).toBe(9) // "three four" = 10 chars, cols 0..9
  })

  test("(d) final/only line → softWrapped FALSE", () => {
    const render = createRenderer({ cols: 24, rows: ROWS })
    const app = render(<Para width={20} text="short" />)

    const buf = getBuffer(app)
    const r0 = buf.getRowMeta(0)
    expect(r0.softWrapped).toBe(false)
    expect(r0.lastContentCol).toBe(4) // "short" = 5 chars, cols 0..4
  })

  test("multi-row word wrap: every interior row soft-space, last row end; rowMeta ≡ fresh across a rerender", () => {
    const render = createRenderer({ cols: 24, rows: ROWS })
    // width=14 → ["alpha beta","gamma delta","epsilon"]
    const app = render(<Para width={14} text="alpha beta gamma delta epsilon" />)

    const buf = getBuffer(app)
    const r0 = buf.getRowMeta(0) // "alpha beta" (cols 0..9)
    expect(r0.softWrapped).toBe(true)
    expect(r0.wrapJoinSpace).toBe(true)
    expect(r0.lastContentCol).toBe(9)

    const r1 = buf.getRowMeta(1) // "gamma delta" (cols 0..10)
    expect(r1.softWrapped).toBe(true)
    expect(r1.wrapJoinSpace).toBe(true)
    expect(r1.lastContentCol).toBe(10)

    const r2 = buf.getRowMeta(2) // "epsilon" (cols 0..6) — final line
    expect(r2.softWrapped).toBe(false)
    expect(r2.lastContentCol).toBe(6)

    // Re-render the SAME wrapped text (forces a format-cache hit, replaying
    // `lineBreaks` from the cache) and compare the incremental buffer's rowMeta
    // against a from-scratch fresh render. STRICT diffs cells, not rowMeta —
    // this locks the cache-replay path so a stale/omitted lineBreaks replay
    // can't silently regress the producer.
    app.rerender(<Para width={14} text="alpha beta gamma delta epsilon" />)
    const incBuf = getBuffer(app)
    const freshBuf = app.freshRender()
    for (let row = 0; row < 3; row++) {
      const inc = incBuf.getRowMeta(row)
      const fresh = freshBuf.getRowMeta(row)
      expect(inc.softWrapped).toBe(fresh.softWrapped)
      expect(inc.lastContentCol).toBe(fresh.lastContentCol)
      expect(inc.wrapJoinSpace ?? false).toBe(fresh.wrapJoinSpace ?? false)
    }
    // And the values are exactly what the producer should yield.
    expect(incBuf.getRowMeta(0)).toMatchObject({ softWrapped: true, wrapJoinSpace: true })
    expect(incBuf.getRowMeta(2).softWrapped).toBe(false)
  })
})
