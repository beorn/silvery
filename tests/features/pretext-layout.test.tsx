/**
 * Pretext layout integration — regression tests.
 *
 * These document two bugs discovered while reviewing the text-layout demo
 * (examples/layout/text-layout.tsx), which visually compares:
 *   - width="fit-content" + wrap="wrap"  (greedy)
 *   - width="snug-content" + wrap="even" (binary-searched shrinkwrap + Knuth-Plass)
 *
 * The pure algorithms have unit tests in tests/pipeline/pretext.test.ts.
 * These tests verify the *integration* with the measure phase and flex layout.
 *
 * Known failures (marked with test.fails):
 *
 *   1. width="fit-content" does not clamp to the parent's available inner
 *      width. CSS fit-content is defined as
 *      min(max-content, max(min-content, available-width)); flexily/silvery's
 *      measure phase sets the intrinsic max-content width on the Yoga node
 *      without the available-width clamp, so a fit-content child overflows
 *      a narrower parent instead of wrapping tighter.
 *
 *   2. As a consequence of (1), two flexGrow=1 columns each containing a
 *      fit-content child with long text overlap when the terminal is narrow
 *      enough that the intrinsic widths exceed half the terminal.
 *
 *   3. width="snug-content" + wrap="even" does not produce a visibly
 *      narrower box than width="fit-content" + wrap="wrap" in the demo.
 *      This is probably downstream of (1) — the binary search seeds from
 *      an unclamped upper bound — but we test it independently so that a
 *      fix to either half of the pipeline flips the expectation.
 *
 * When a bug is fixed, test.fails will itself fail, forcing a flip to
 * plain test() with the real assertion.
 */

import React from "react"
import { describe, test, expect } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, Text } from "silvery"

// ============================================================================
// Fixture text — long enough to force wrapping at demo-like widths.
// ============================================================================

const LONG_TEXT =
  "Typography in terminal applications has always been limited by the character grid, " +
  "but modern algorithms can distribute text across lines for minimum raggedness."

// Short ragged text where greedy wrap leaves visible slack on the last line.
// "the quick brown fox" at content-width 12:
//   greedy: "the quick " (10) + "brown fox" (9)  → widest wrapped line = 10
//   snug:   binary-searches for ≤10 that keeps 2 lines
const RAGGED_TEXT = "the quick brown fox"

// ============================================================================
// Regression 1: width="fit-content" must clamp to parent's inner width.
// ============================================================================

describe("regression: fit-content clamps to parent width", () => {
  test("fit-content child does not overflow a fixed-width parent", () => {
    const render = createRenderer({ cols: 80, rows: 24 })
    const app = render(
      <Box width={20} id="parent">
        <Box width="fit-content" id="child" borderStyle="round">
          <Text wrap="wrap">{LONG_TEXT}</Text>
        </Box>
      </Box>,
    )
    const parent = app.locator("#parent").boundingBox()
    const child = app.locator("#child").boundingBox()
    expect(parent).not.toBeNull()
    expect(child).not.toBeNull()
    // The child must fit inside its parent's content area.
    expect(child!.width).toBeLessThanOrEqual(parent!.width)
  })

  // Investigation dated 2026-04-11: this bug is NOT fit-content-specific.
  // A plain <Box> without any fit-content prop also overflows a fixed-width
  // parent — child measured 161 cols in a 20-col parent. Adding explicit
  // alignItems="stretch" to the parent makes both cases work (child wraps
  // correctly to 20 cols). Root cause is in Flexily's default cross-axis
  // alignment OR in the Silvery Box component's default props — NOT in
  // measure-phase.ts as originally suspected. Fix requires deeper work on
  // the layout engine defaults, not a one-line patch to fit-content.
  test.fails("plain Box child (no fit-content) is clamped by fixed-width parent", () => {
    const render = createRenderer({ cols: 80, rows: 24 })
    const app = render(
      <Box width={20} id="parent">
        <Box id="child">
          <Text wrap="wrap">{LONG_TEXT}</Text>
        </Box>
      </Box>,
    )
    const parent = app.locator("#parent").boundingBox()
    const child = app.locator("#child").boundingBox()
    expect(child!.width).toBeLessThanOrEqual(parent!.width)
  })

  test("fit-content re-clamps after terminal resize", () => {
    const render = createRenderer({ cols: 80, rows: 24 })
    const app = render(
      <Box flexDirection="row">
        <Box width="fit-content" id="box" borderStyle="round">
          <Text wrap="wrap">{LONG_TEXT}</Text>
        </Box>
      </Box>,
    )
    const wide = app.locator("#box").boundingBox()
    expect(wide).not.toBeNull()

    app.resize(30, 24)
    const narrow = app.locator("#box").boundingBox()
    expect(narrow).not.toBeNull()
    // After shrinking the terminal from 80→30, the fit-content box must
    // shrink too — it cannot keep its 80-col intrinsic width.
    expect(narrow!.width).toBeLessThanOrEqual(30)
    expect(narrow!.width).toBeLessThan(wide!.width)
  })
})

// ============================================================================
// Regression 2: side-by-side flexGrow columns with fit-content must not overlap.
// ============================================================================

describe("regression: flexGrow columns with fit-content children do not overlap", () => {
  test("two flexGrow=1 columns stay within the terminal width", () => {
    const render = createRenderer({ cols: 40, rows: 24 })
    const app = render(
      <Box flexDirection="row" gap={1}>
        <Box flexGrow={1} flexBasis={0} id="col-left">
          <Box width="fit-content" id="box-left" borderStyle="round">
            <Text wrap="wrap">{LONG_TEXT}</Text>
          </Box>
        </Box>
        <Box flexGrow={1} flexBasis={0} id="col-right">
          <Box width="fit-content" id="box-right" borderStyle="round">
            <Text wrap="wrap">{LONG_TEXT}</Text>
          </Box>
        </Box>
      </Box>,
    )
    const left = app.locator("#box-left").boundingBox()
    const right = app.locator("#box-right").boundingBox()
    expect(left).not.toBeNull()
    expect(right).not.toBeNull()
    // Right box must start at or after the left box ends (no pixel overlap).
    expect(right!.x).toBeGreaterThanOrEqual(left!.x + left!.width)
    // And the total pair must fit inside the 40-col terminal.
    expect(left!.width + right!.width).toBeLessThanOrEqual(40)
  })
})

// ============================================================================
// Regression 3: snug-content + even wrap must be tighter than fit-content + wrap.
// ============================================================================

describe("regression: snug-content + wrap=even is visibly tighter than fit-content + wrap", () => {
  test("identical text renders narrower under snug+even than fit+greedy", () => {
    // Both boxes live inside the same parent so they see identical available
    // width. maxWidth forces wrapping so snug-content can binary-search for
    // a tighter width than fit-content's widest wrapped line.
    const render = createRenderer({ cols: 80, rows: 24 })
    const app = render(
      <Box flexDirection="column" width={60}>
        <Box width="fit-content" id="fit" borderStyle="round" maxWidth={48}>
          <Text wrap="wrap">{LONG_TEXT}</Text>
        </Box>
        <Box width="snug-content" id="snug" borderStyle="round" maxWidth={48}>
          <Text wrap="even">{LONG_TEXT}</Text>
        </Box>
      </Box>,
    )
    const fit = app.locator("#fit").boundingBox()
    const snug = app.locator("#snug").boundingBox()
    expect(fit).not.toBeNull()
    expect(snug).not.toBeNull()
    // The whole pretext value prop is that snug+even can redistribute
    // words so the widest wrapped line is smaller than greedy's.
    expect(snug!.width).toBeLessThan(fit!.width)
  })

  test("snug-content alone is no wider than fit-content for the same text", () => {
    // Weaker claim: even with greedy wrap on both sides, snug's binary
    // search must never exceed fit-content. A passing (non-failing) result
    // here is fine — it's a sanity bound, not the demo's value prop.
    const render = createRenderer({ cols: 80, rows: 24 })
    const app = render(
      <Box flexDirection="column" width={40}>
        <Box width="fit-content" id="fit">
          <Text wrap="wrap">{LONG_TEXT}</Text>
        </Box>
        <Box width="snug-content" id="snug">
          <Text wrap="wrap">{LONG_TEXT}</Text>
        </Box>
      </Box>,
    )
    const fit = app.locator("#fit").boundingBox()
    const snug = app.locator("#snug").boundingBox()
    expect(snug!.width).toBeLessThan(fit!.width)
  })
})

// ============================================================================
// Regression 4: wrap="even" must actually drive Knuth-Plass, not be a no-op.
// ============================================================================

describe('regression: wrap="even" is wired through to the text pipeline', () => {
  // Observed by exercising the text-layout demo in a real TTY at 120x30:
  // demo 2's two paragraphs ("wrap" greedy vs "even" Knuth-Plass) rendered
  // BYTE-FOR-BYTE identical. The pure algorithm passes its unit tests
  // (tests/pipeline/pretext.test.ts), so the regression is in the wiring
  // between <Text wrap="even"> and the render phase's line-breaker.
  //
  // A paragraph with known slack under greedy wrap must produce AT LEAST
  // ONE different line break under "even". This test fixes both boxes to
  // the same width so the only variable is wrap mode.
  test('wrap="even" produces different line breaks than wrap="wrap" for raggable text', () => {
    // "Four score..." at width 20 is verified to produce different breaks
    // under greedy vs Knuth-Plass (see the pretext algorithm unit tests
    // and the tests/pipeline/pretext.test.ts verification). The two
    // rendered outputs must differ at least on one row.
    const text =
      "Four score and seven years ago our fathers brought forth on this continent a new nation"
    const render = createRenderer({ cols: 40, rows: 20 })
    const app = render(
      <Box flexDirection="column">
        <Box width={20} id="greedy">
          <Text wrap="wrap">{text}</Text>
        </Box>
        <Box width={20} id="even">
          <Text wrap="even">{text}</Text>
        </Box>
      </Box>,
    )
    const greedyBox = app.locator("#greedy").boundingBox()!
    const evenBox = app.locator("#even").boundingBox()!
    // Read the rendered rows directly so we compare actual line breaks,
    // not textContent which collapses whitespace across rows.
    type Box = { x: number; y: number; width: number; height: number }
    const readRows = (box: Box): string[] => {
      const rows: string[] = []
      for (let y = box.y; y < box.y + box.height; y++) {
        let row = ""
        for (let x = box.x; x < box.x + box.width; x++) {
          row += app.cell(x, y).char
        }
        rows.push(row)
      }
      return rows
    }
    const greedyRows = readRows(greedyBox)
    const evenRows = readRows(evenBox)
    // Expected (from algorithm unit tests for this exact input/width):
    //   optimal: ["Four score and","seven years ago","our fathers brought", ...]
    //   greedy:  ["Four score and seven","years ago our", ...]
    // The rendered rows must differ somewhere.
    expect(evenRows).not.toEqual(greedyRows)
  })
})

// Note: the "incremental border bleed when switching demos" symptom observed
// in the real-TTY exercise of the text-layout example could not be reproduced
// via createRenderer's rerender() with a simple borderStyle prop change —
// that path correctly updates the border cells. The real bug involves an
// entire component tree swapping at the same position (demo 2 unmounts →
// demo 3 mounts), which is a different dirty-flag cascade path. Tracked
// separately for a proper reproduction (tree-swap incremental test).

// ============================================================================
// Regression 6: maxWidth must feed availableWidth for fit-content/snug-content
// measurement, so text wraps inside the cap and snug-content has room to
// shrink below the widest wrapped line.
//
// Before the fix: measureIntrinsicSize only passed availableWidth when width
// was a fixed number (and height="fit-content"). For <Box width="fit-content"
// maxWidth={N}> the child text was measured at its full unwrapped width,
// which defeated both the maxWidth cap (measure returned intrinsic > N) and
// the snug-content binary search (starting upper bound was unwrapped, so
// shrunk ≈ intrinsic, never smaller than fit-content).
//
// After the fix: maxWidth is used as availableWidth when no fixed width is
// set, so text wraps during measurement and snug-content's binary search
// operates on the wrapped line widths.
// ============================================================================

describe("fit-content and snug-content respect maxWidth during measurement", () => {
  // Text chosen so that at inner-width 44 (maxWidth 48 - 2 padding - 2 border)
  // greedy wrap produces widest-line 43 while snug-content binary-searches
  // down to 33 — a 10-col saving. Verified by the pretext pure-algorithm
  // unit tests for shrinkwrapWidth.
  const WRAPPING_TEXT = "OK so in chat bubbles it means no more ugly dead space on the right"

  test("fit-content box stays within maxWidth when text would wrap inside", () => {
    const render = createRenderer({ cols: 80, rows: 24 })
    const app = render(
      <Box width="fit-content" id="fc" maxWidth={48} borderStyle="round" paddingX={1}>
        <Text wrap="wrap">{WRAPPING_TEXT}</Text>
      </Box>,
    )
    const box = app.locator("#fc").boundingBox()
    expect(box).not.toBeNull()
    // The box must not exceed its maxWidth.
    expect(box!.width).toBeLessThanOrEqual(48)
    // And should be wider than one line would need (proving it wrapped).
    expect(box!.height).toBeGreaterThanOrEqual(4)
  })

  test("snug-content box shrinks visibly below fit-content at same maxWidth", () => {
    const render = createRenderer({ cols: 80, rows: 24 })
    const app = render(
      <Box flexDirection="column">
        <Box width="fit-content" id="fc" maxWidth={48} borderStyle="round" paddingX={1}>
          <Text wrap="wrap">{WRAPPING_TEXT}</Text>
        </Box>
        <Box width="snug-content" id="snug" maxWidth={48} borderStyle="round" paddingX={1}>
          <Text wrap="even">{WRAPPING_TEXT}</Text>
        </Box>
      </Box>,
    )
    const fc = app.locator("#fc").boundingBox()
    const snug = app.locator("#snug").boundingBox()
    expect(fc).not.toBeNull()
    expect(snug).not.toBeNull()
    // snug-content must be visibly narrower — this is the whole value prop.
    expect(snug!.width).toBeLessThan(fc!.width)
    // Both must still fit the same text (same line count).
    expect(snug!.height).toBe(fc!.height)
  })

  test("snug-content + even visibly rebalances line widths vs fit-content + greedy", () => {
    // Uses the "Four score" input where optimal and greedy both fit in the
    // same number of lines but with different break positions.
    const text =
      "Four score and seven years ago our fathers brought forth on this continent a new nation"
    const render = createRenderer({ cols: 40, rows: 20 })
    const app = render(
      <Box flexDirection="column">
        <Box width="fit-content" id="fc" maxWidth={22} paddingX={1}>
          <Text wrap="wrap">{text}</Text>
        </Box>
        <Box width="snug-content" id="snug" maxWidth={22} paddingX={1}>
          <Text wrap="even">{text}</Text>
        </Box>
      </Box>,
    )
    const fc = app.locator("#fc").boundingBox()!
    const snug = app.locator("#snug").boundingBox()!
    // Read rendered rows from both boxes.
    const readRows = (box: typeof fc): string[] => {
      const rows: string[] = []
      for (let y = box.y; y < box.y + box.height; y++) {
        let row = ""
        for (let x = box.x; x < box.x + box.width; x++) row += app.cell(x, y).char
        rows.push(row.trimEnd())
      }
      return rows
    }
    const fcRows = readRows(fc).filter((r) => r.length > 0)
    const snugRows = readRows(snug).filter((r) => r.length > 0)
    // At least one row must differ — proves the two pipelines (greedy/even)
    // produced different break positions.
    expect(snugRows).not.toEqual(fcRows)
  })
})
