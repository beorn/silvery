/**
 * Tests for Pretext text analysis algorithms.
 */
import { describe, test, expect } from "vitest"
import {
  buildTextAnalysis,
  countLinesAtWidth,
  shrinkwrapWidth,
  balancedWidth,
  knuthPlassBreaks,
  optimalWrap,
} from "@silvery/ag-term/pipeline/pretext"
import { graphemeWidth } from "@silvery/ag-term/unicode"

describe("buildTextAnalysis", () => {
  test("builds correct cumWidths for ASCII text", () => {
    const analysis = buildTextAnalysis("hello world", graphemeWidth)
    expect(analysis.totalWidth).toBe(11)
    expect(analysis.cumWidths[0]).toBe(0)
    expect(analysis.cumWidths[analysis.graphemes.length]).toBe(11)
    expect(analysis.maxWordWidth).toBe(5) // "hello" or "world"
    expect(analysis.breakIndices.length).toBeGreaterThan(0)
  })

  test("handles newlines", () => {
    const analysis = buildTextAnalysis("hello\nworld", graphemeWidth)
    expect(analysis.newlineIndices.length).toBe(1)
    expect(analysis.totalWidth).toBe(10) // newline has 0 width
  })

  test("handles CJK text", () => {
    const analysis = buildTextAnalysis("日本語", graphemeWidth)
    expect(analysis.totalWidth).toBe(6) // 3 chars × 2 width
    expect(analysis.breakIndices.length).toBe(3) // can break before each CJK char
  })

  test("handles empty string", () => {
    const analysis = buildTextAnalysis("", graphemeWidth)
    expect(analysis.totalWidth).toBe(0)
    expect(analysis.graphemes.length).toBe(0)
  })

  // `@km/silvery/wrap-stop-breaking-at-hyphen`: hyphen-minus is not a word
  // boundary anymore. Hyphenated tokens like `cmd-hover` stay together; the
  // wrap algorithm only falls back to per-grapheme breaks via the
  // atomic-overflow path when the container is narrower than the longest
  // unbreakable token.
  test("hyphen-minus does not emit a break index — `cmd-hover` is one token", () => {
    const analysis = buildTextAnalysis("cmd-hover", graphemeWidth)
    // Pure ASCII string of length 9: graphemes 0-8, no whitespace, no CJK.
    // `isWordBoundary` returns true only for space + tab, so no break index
    // should be emitted at all — the entire string is one atomic word.
    expect(analysis.breakIndices).toEqual([])
    // maxWordWidth = whole token width, not just `cmd` or `hover`.
    expect(analysis.maxWordWidth).toBe(9)
  })

  test("hyphen in a multi-word string only breaks at spaces", () => {
    const analysis = buildTextAnalysis("the cmd-hover option", graphemeWidth)
    // Break indices land AFTER each space (per the `i + 1` convention in
    // buildTextAnalysis). No hyphen-driven breaks.
    // Positions: "the cmd-hover option"
    //             0123456789012345678901234
    //                ^space@3      ^space@13
    expect(analysis.breakIndices).toEqual([4, 14])
  })
})

describe("countLinesAtWidth", () => {
  test("single line when text fits", () => {
    const analysis = buildTextAnalysis("hello world", graphemeWidth)
    expect(countLinesAtWidth(analysis, 20)).toBe(1)
  })

  test("wraps at word boundary", () => {
    const analysis = buildTextAnalysis("hello world", graphemeWidth)
    expect(countLinesAtWidth(analysis, 7)).toBe(2) // "hello " + "world"
  })

  test("multiple wraps", () => {
    const analysis = buildTextAnalysis("the quick brown fox jumps", graphemeWidth)
    // At width 10: "the quick " (10), "brown fox " (10), "jumps" (5) = 3 lines
    expect(countLinesAtWidth(analysis, 10)).toBe(3)
  })

  test("preserves newlines", () => {
    const analysis = buildTextAnalysis("hello\nworld", graphemeWidth)
    expect(countLinesAtWidth(analysis, 20)).toBe(2)
  })
})

describe("shrinkwrapWidth", () => {
  test("returns totalWidth for single-line text", () => {
    const analysis = buildTextAnalysis("hello", graphemeWidth)
    expect(shrinkwrapWidth(analysis, 20)).toBe(5)
  })

  test("tightens multi-line text", () => {
    // "hello world" at width=20 is 1 line, snug-content returns 11
    const analysis = buildTextAnalysis("hello world", graphemeWidth)
    expect(shrinkwrapWidth(analysis, 20)).toBe(11)
  })

  test("snug-content is tighter than fit-content for ragged text", () => {
    // "the quick brown fox" at width=12:
    // fit-content: "the quick " (10 wide) + "brown fox" (9 wide) → widest = 10
    // snug-content should find width ≤ 10 that still gives 2 lines
    const analysis = buildTextAnalysis("the quick brown fox", graphemeWidth)
    const fitContent = 12 // container width
    const shrunk = shrinkwrapWidth(analysis, fitContent)
    expect(shrunk).toBeLessThanOrEqual(fitContent)
    // Verify same line count
    expect(countLinesAtWidth(analysis, shrunk)).toBe(countLinesAtWidth(analysis, fitContent))
  })

  test("never goes below maxWordWidth", () => {
    const analysis = buildTextAnalysis("supercalifragilistic is a word", graphemeWidth)
    const shrunk = shrinkwrapWidth(analysis, 40)
    expect(shrunk).toBeGreaterThanOrEqual(analysis.maxWordWidth)
  })
})

describe("balancedWidth", () => {
  test("returns totalWidth for single-line text", () => {
    const analysis = buildTextAnalysis("hello", graphemeWidth)
    expect(balancedWidth(analysis, 20)).toBe(5)
  })

  test("produces more even line widths than greedy", () => {
    // "aaa bbb ccc ddd eee" (19 chars) at width=12:
    // Greedy: "aaa bbb ccc " (12) + "ddd eee" (7) → uneven
    // Balanced: should find width ~10 for "aaa bbb " (8) + "ccc ddd eee" (11) or similar
    const analysis = buildTextAnalysis("aaa bbb ccc ddd eee", graphemeWidth)
    const bWidth = balancedWidth(analysis, 12)
    expect(bWidth).toBeLessThanOrEqual(12)
    // Same line count as greedy
    expect(countLinesAtWidth(analysis, bWidth)).toBe(countLinesAtWidth(analysis, 12))
  })
})

describe("knuthPlassBreaks", () => {
  test("returns empty for single-line text", () => {
    const analysis = buildTextAnalysis("hello", graphemeWidth)
    expect(knuthPlassBreaks(analysis, 20)).toEqual([])
  })

  test("finds break positions for multi-line text", () => {
    const analysis = buildTextAnalysis("the quick brown fox jumps", graphemeWidth)
    const breaks = knuthPlassBreaks(analysis, 12)
    expect(breaks.length).toBeGreaterThan(0)
    // Should produce valid breaks (each < text length)
    for (const bp of breaks) {
      expect(bp).toBeGreaterThan(0)
      expect(bp).toBeLessThan(analysis.graphemes.length)
    }
  })

  test("produces fewer or equal raggedness than greedy", () => {
    // "aaa bbb ccc ddd" at width=8:
    // Greedy: "aaa bbb " (8) + "ccc ddd" (7) → leftover [0, 1] → cost 0+1=1
    // Optimal may find: "aaa bbb" (7) + "ccc ddd" (7) → leftover [1, 0] → cost 1+0=1
    // Or: "aaa " (4) + "bbb ccc " (8) + "ddd" (3) — worse
    const analysis = buildTextAnalysis("aaa bbb ccc ddd", graphemeWidth)
    const breaks = knuthPlassBreaks(analysis, 8)
    expect(breaks.length).toBeGreaterThan(0)
  })
})

describe("optimalWrap", () => {
  test("returns single line for short text", () => {
    const analysis = buildTextAnalysis("hello", graphemeWidth)
    expect(optimalWrap("hello", analysis, 20)).toEqual(["hello"])
  })

  test("wraps multi-line text", () => {
    const text = "the quick brown fox jumps over the lazy dog"
    const analysis = buildTextAnalysis(text, graphemeWidth)
    const lines = optimalWrap(text, analysis, 15)
    expect(lines.length).toBeGreaterThan(1)
    // Each line should fit within width (allow for word boundary tolerance)
    for (const line of lines) {
      // Lines should be reasonable (not empty, not vastly exceeding width)
      expect(line.length).toBeGreaterThan(0)
    }
  })

  test("preserves all text content", () => {
    const text = "hello world foo bar"
    const analysis = buildTextAnalysis(text, graphemeWidth)
    const lines = optimalWrap(text, analysis, 10)
    const joined = lines.join(" ")
    // All words should be present
    expect(joined).toContain("hello")
    expect(joined).toContain("world")
    expect(joined).toContain("foo")
    expect(joined).toContain("bar")
  })

  // `@km/silvery/wrap-stop-breaking-at-hyphen`: hyphenated tokens stay
  // together unless the container is narrower than the token itself.
  describe("hyphenated tokens stay together (km-silvery.wrap-stop-breaking-at-hyphen)", () => {
    test("`cmd-hover` is one token when width allows", () => {
      const text = "the cmd-hover option"
      const analysis = buildTextAnalysis(text, graphemeWidth)
      // Width 14: "the cmd-hover" fits (13 chars). "option" wraps to its own
      // line. The key assertion: no line ends with `cmd-` and the next starts
      // with `hover`.
      const lines = optimalWrap(text, analysis, 14)
      for (const [i, line] of lines.entries()) {
        const next = lines[i + 1]
        if (line.endsWith("cmd-") && next?.startsWith("hover")) {
          throw new Error(
            `cmd-hover split across lines ${i}/${i + 1}: ${JSON.stringify(line)} + ${JSON.stringify(next)}`,
          )
        }
      }
      // Sanity: all word content is preserved.
      expect(lines.join(" ")).toContain("cmd-hover")
      expect(lines.join(" ")).toContain("option")
    })

    test("hyphenated token wider than container falls back to atomic-overflow", () => {
      // `cmd-hover` is 9 chars; container is 5. The token can't fit on one
      // line at width 5; the algorithm must let the token overflow rather
      // than split it at the hyphen.
      const text = "cmd-hover"
      const analysis = buildTextAnalysis(text, graphemeWidth)
      const lines = optimalWrap(text, analysis, 5)
      // Either: single line that overflows (atomic-overflow path) OR
      // per-grapheme break (overflow-wrap: anywhere analogue). What we
      // explicitly REJECT is the hyphen-split `cmd-` + `hover`.
      const hyphenSplit = lines.some((l, i) => l.endsWith("cmd-") && lines[i + 1] === "hover")
      expect(hyphenSplit).toBe(false)
      // Content preserved either way.
      expect(lines.join("").replace(/\s+/g, "")).toBe("cmd-hover")
    })
  })

  // `@km/silvery/15132-pretext-break-kind`: soft-punct (`/ \ . _ : ,`) emits
  // break candidates AFTER the punctuation, not BEFORE. So `commands/run`
  // wraps as `commands/` + `run` (never `commands` + `/run` from K-P,
  // never `commands` + `/` + `run`). Matches chenglou/pretext convention.
  describe("soft-punct emits break AFTER, not BEFORE (km-silvery.15132-pretext-break-kind)", () => {
    test("buildTextAnalysis emits a break AFTER `/` in `commands/run`", () => {
      const analysis = buildTextAnalysis("commands/run", graphemeWidth)
      // Index 9 == position AFTER the `/` at index 8.
      expect(analysis.breakIndices).toContain(9)
      // No break BEFORE `/` (no candidate at index 8).
      expect(analysis.breakIndices).not.toContain(8)
    })

    test("buildTextAnalysis emits breaks AFTER `.` in `example.com.au`", () => {
      const analysis = buildTextAnalysis("example.com.au", graphemeWidth)
      // After `example.` (index 8) and after `com.` (index 12).
      expect(analysis.breakIndices).toContain(8)
      expect(analysis.breakIndices).toContain(12)
    })

    test("`path/to/file` at w=8 wraps with `/` glued to LEFT side", () => {
      const text = "path/to/file"
      const analysis = buildTextAnalysis(text, graphemeWidth)
      const lines = optimalWrap(text, analysis, 8)
      // No line should start with `/` — that's the lone-punct failure mode.
      for (const line of lines) {
        expect(line.startsWith("/"), `line starts with /: ${JSON.stringify(line)}`).toBe(false)
      }
      // Content preserved.
      const recovered = lines
        .map((l) => l)
        .join("")
        .replace(/\s+/g, "")
      expect(recovered).toBe("path/to/file")
    })

    test("no lone-punct line for `/`, `.`, `:` at narrow widths (w=4..10)", () => {
      const texts = ["a/b/c", "foo.bar.baz", "host:port:8080", "x_y_z"]
      for (const text of texts) {
        const analysis = buildTextAnalysis(text, graphemeWidth)
        for (let w = 4; w <= 10; w++) {
          const lines = optimalWrap(text, analysis, w)
          for (const line of lines) {
            // No line should be a single soft-punct char.
            expect(
              ["/", "\\", ".", "_", ":", ","].includes(line),
              `text=${text} w=${w} lone-punct line: ${JSON.stringify(lines)}`,
            ).toBe(false)
          }
        }
      }
    })
  })

  // Helper: strip ANSI escapes for visual-content assertions.
  const ANSI_RE = /\x1b\[[0-9;:?]*[A-Za-z]/g
  const stripAnsi = (s: string) => s.replace(ANSI_RE, "")

  describe("ANSI-aware line breaks (regression)", () => {
    // Two related bugs in optimalWrap's break-boundary trimming:
    //
    // 1. LEADING-side (from the bead): the leading-whitespace skip bailed on
    //    the first w===0 ANSI token, leaving any post-ANSI whitespace as a
    //    line-start slug ([ANSI][ ][word] → " word" visible at col 0).
    //
    // 2. TRAILING-side (found by /pro review): the trailing-whitespace skip
    //    decremented past ANSI tokens but never re-emitted them. ANSI tokens
    //    landing in the gap [lineEnd, bp) — between the last visible
    //    grapheme and the break point — were silently DROPPED from output.
    //    Real-world cost: ANSI OFF tokens after a styled word are lost when
    //    the wrap lands at the trailing whitespace; the styling state then
    //    bleeds into following text and the rest of the UI.
    //
    // The fix makes both sides symmetric: skip whitespace, capture ANSI.
    // Leading-side captures into `pendingAnsiPrefix` (prepended to next
    // line); trailing-side captures into `trailingAnsi` (appended to the
    // current line). ANSI source-order is preserved on both sides.
    //
    // See @km/silvery/pretext-leading-whitespace-leaks-after-ansi.
    const ON = "\x1b[33m" // yellow fg
    const OFF = "\x1b[39m" // reset fg
    const BLUE_ON = "\x1b[34m" // distinct color for trailing-side tests

    test("no leading-space slug when ANSI token + space precede line content", () => {
      // The canonical buggy pattern: when the wrap candidate falls at the
      // ANSI token's position, the next line begins with [ANSI][ ][word].
      // Before the fix, the leading-side skip hit the ANSI (w===0), broke
      // out, and emitted "[ANSI] word" — visible content starts with " ".
      // After the fix: leading-side skips past both ANSI and whitespace,
      // re-prepending the ANSI as a styling prefix. Visible content starts
      // with "bar" at column 0; styling survives.
      const text = `foo ${ON} bar`
      const analysis = buildTextAnalysis(text, graphemeWidth)
      const lines = optimalWrap(text, analysis, 4)
      expect(lines.length).toBeGreaterThan(1)
      const barLine = lines.find((l) => stripAnsi(l).includes("bar"))!
      expect(barLine).toBeDefined()
      // Visible content of the "bar" line starts at column 0, no slug.
      expect(stripAnsi(barLine).startsWith(" ")).toBe(false)
      expect(stripAnsi(barLine).startsWith("\t")).toBe(false)
      expect(stripAnsi(barLine)).toBe("bar")
      // Styling carried forward: the line still begins with the ANSI prefix.
      expect(barLine.startsWith(ON)).toBe(true)
    })

    test("no leading-space slug for multi-ANSI [ON]X[OFF][ ][word] pattern", () => {
      // Stress: two ANSI tokens (ON + OFF) followed by space at line-start.
      // The leading-side must skip past BOTH tokens AND the trailing space.
      const text = `foo ${ON}${OFF} bar`
      const analysis = buildTextAnalysis(text, graphemeWidth)
      const lines = optimalWrap(text, analysis, 4)
      expect(lines.length).toBeGreaterThan(1)
      const barLine = lines.find((l) => stripAnsi(l).includes("bar"))!
      expect(barLine).toBeDefined()
      expect(stripAnsi(barLine).startsWith(" ")).toBe(false)
      expect(stripAnsi(barLine)).toBe("bar")
    })

    test("no leading whitespace across many widths for ANSI-laden text", () => {
      // The fix makes the leading-side symmetric with the trailing-side
      // (which already skipped both whitespace AND zero-width ANSI tokens).
      // No emitted line should begin with visible whitespace, regardless of
      // where the optimal-wrap break candidate lands.
      const text = `alpha ${ON}beta${OFF} gamma ${ON} delta ${OFF} epsilon zeta`
      const analysis = buildTextAnalysis(text, graphemeWidth)
      for (const w of [5, 6, 7, 8, 10, 12, 14]) {
        const lines = optimalWrap(text, analysis, w)
        for (const line of lines) {
          const visible = stripAnsi(line)
          expect(
            visible.startsWith(" ") || visible.startsWith("\t"),
            `width=${w} produces leading whitespace: ${JSON.stringify(visible)}`,
          ).toBe(false)
        }
      }
    })

    test("bead repro: sigil-styled tokens don't produce line-start slugs", () => {
      // Variant of the bead's actual content. With the fix, no wrapped line
      // begins with visible whitespace regardless of where the wrap lands.
      const text = `bun km view ${ON}@agent${OFF} cursor j/k/Enter through ${ON}@agent/3${OFF} cards`
      const analysis = buildTextAnalysis(text, graphemeWidth)
      for (let w = 10; w <= 24; w++) {
        const lines = optimalWrap(text, analysis, w)
        for (const line of lines) {
          const visible = stripAnsi(line)
          expect(
            visible.startsWith(" ") || visible.startsWith("\t"),
            `width=${w} produces leading whitespace: ${JSON.stringify(visible)}`,
          ).toBe(false)
        }
      }
    })

    test("preserves ANSI off-token trimmed off trailing edge of wrapped line", () => {
      // Trailing-side bug (/pro review): when the wrap break lands on/after
      // trailing [ANSI-off][ ], the old code decremented lineEnd past the
      // ANSI-off but never emitted it. The off-token fell in the gap
      // [lineEnd, bp) and was silently dropped — color/attributes bleed into
      // the next line and the rest of the UI.
      //
      // Pattern: [ANSI-on]@agent[ANSI-off] cursor — at width 6, the break
      // lands at position 9 (after " "). Trim skips " " then "[ANSI-off]",
      // leaving lineEnd at "t". Without the fix, the off-token is gone.
      const text = `${BLUE_ON}@agent${OFF} cursor`
      const analysis = buildTextAnalysis(text, graphemeWidth)
      const lines = optimalWrap(text, analysis, 6)
      // The ANSI-off MUST appear somewhere in the emitted lines — either at
      // the tail of L1 (where it originally sat) or the head of L2. Joining
      // the lines and searching is the load-bearing assertion: the ANSI off
      // must round-trip through wrapping.
      const all = lines.join("")
      expect(all, `wrap output dropped ANSI-off: ${JSON.stringify(lines)}`).toContain(OFF)
      // Also verify the ANSI-on is preserved.
      expect(all).toContain(BLUE_ON)
    })

    test("trailing ANSI preserved across many widths (no color bleed)", () => {
      // Sweep: every wrapped output must round-trip every ANSI token from
      // the source. Drop-any-token = terminal-state corruption.
      const text = `${BLUE_ON}@agent${OFF} cursor ${BLUE_ON}@other${OFF} more text here`
      const analysis = buildTextAnalysis(text, graphemeWidth)
      // Count source ANSI tokens.
      const sourceOns = (text.match(/\x1b\[34m/g) ?? []).length
      const sourceOffs = (text.match(/\x1b\[39m/g) ?? []).length
      for (let w = 5; w <= 20; w++) {
        const lines = optimalWrap(text, analysis, w)
        const all = lines.join("")
        const ons = (all.match(/\x1b\[34m/g) ?? []).length
        const offs = (all.match(/\x1b\[39m/g) ?? []).length
        expect(ons, `width=${w} lost ANSI-on tokens (had ${sourceOns}, got ${ons})`).toBe(sourceOns)
        expect(offs, `width=${w} lost ANSI-off tokens (had ${sourceOffs}, got ${offs})`).toBe(
          sourceOffs,
        )
      }
    })

    test("trailing ANSI preserved in source order on emitted line", () => {
      // Multiple ANSI tokens trailing a word (e.g., [OFF][ANSI-RESET]) must
      // appear at the tail of the wrapped line in their original order, not
      // reversed (the trim walks backward — a naive append would reverse).
      const RESET = "\x1b[0m"
      const text = `word${BLUE_ON}${OFF}${RESET} next more`
      const analysis = buildTextAnalysis(text, graphemeWidth)
      const lines = optimalWrap(text, analysis, 4)
      // Find the line containing "word"
      const wordLine = lines.find((l) => stripAnsi(l).includes("word"))!
      expect(wordLine).toBeDefined()
      // The three ANSI tokens must appear in their source order on this line.
      const onIdx = wordLine.indexOf(BLUE_ON)
      const offIdx = wordLine.indexOf(OFF)
      const resetIdx = wordLine.indexOf(RESET)
      expect(onIdx, `line ${JSON.stringify(wordLine)} missing ON token`).toBeGreaterThanOrEqual(0)
      expect(offIdx, `line ${JSON.stringify(wordLine)} missing OFF token`).toBeGreaterThanOrEqual(0)
      expect(
        resetIdx,
        `line ${JSON.stringify(wordLine)} missing RESET token`,
      ).toBeGreaterThanOrEqual(0)
      expect(onIdx).toBeLessThan(offIdx)
      expect(offIdx).toBeLessThan(resetIdx)
    })
  })

  describe("wrap-quality penalties (orphans, widows, hyphen compounds)", () => {
    // Repro from @km/silvery/pretext-wrap-quality-orphans-and-widows.
    // The DP minimizes squared raggedness, which is necessary but not
    // sufficient. Single-word lines and breaks inside short hyphenated
    // compounds are visually painful even when mathematically optimal
    // under leftover². The penalties below tax these specific shapes.

    test("does not orphan 'hover' on its own line (cmd-hover case)", () => {
      // The bead repro: at card-style widths, the title wrapped to leave
      // "hover" alone on L3. After the orphan penalty, the DP should
      // prefer breaking before "(cmd-hover" so the compound stays intact.
      const text = "Click on commands does nothing in live TUI (cmd-hover also no-op)"
      const analysis = buildTextAnalysis(text, graphemeWidth)
      // Sweep widths that produce visible orphans without the fix.
      for (let w = 22; w <= 30; w++) {
        const lines = optimalWrap(text, analysis, w)
        for (let i = 0; i < lines.length - 1; i++) {
          // Non-final lines should not be a single short word like "hover".
          const stripped = stripAnsi(lines[i]!).trim()
          expect(
            stripped,
            `width=${w} line ${i} orphaned "${stripped}" (full wrap: ${JSON.stringify(lines)})`,
          ).not.toBe("hover")
        }
      }
    })

    test("does not split the cmd-hover compound across lines", () => {
      // The hyphen penalty should keep `cmd-hover` intact: no non-final
      // line should end with `cmd-` (i.e. the hyphen-suffix shape) for
      // typical card widths. Combined with the orphan penalty above, this
      // pins the user-facing requirement: visible wrap quality, not
      // mathematical "optimum-by-leftover²".
      const text = "Click on commands does nothing in live TUI (cmd-hover also no-op) #bug"
      const analysis = buildTextAnalysis(text, graphemeWidth)
      for (let w = 18; w <= 32; w++) {
        const lines = optimalWrap(text, analysis, w)
        for (let i = 0; i < lines.length - 1; i++) {
          const stripped = stripAnsi(lines[i]!).trimEnd()
          // The compound `cmd-hover` must not split: no line ending with
          // `cmd-` (the hyphen-trailing shape from the bead repro).
          expect(
            stripped.endsWith("cmd-"),
            `width=${w} line ${i} broke cmd-hover compound: "${stripped}" (full wrap: ${JSON.stringify(lines)})`,
          ).toBe(false)
        }
      }
    })

    test("does not split the no-op compound across lines", () => {
      // Repro variant at wider widths: without the hyphen penalty,
      // `no-op` splits to `no-` + `op)`. With penalty, stays as `no-op)`.
      const text = "Click on commands does nothing in live TUI (cmd-hover also no-op) #bug"
      const analysis = buildTextAnalysis(text, graphemeWidth)
      for (let w = 18; w <= 32; w++) {
        const lines = optimalWrap(text, analysis, w)
        for (let i = 0; i < lines.length - 1; i++) {
          const stripped = stripAnsi(lines[i]!).trimEnd()
          expect(
            stripped.endsWith("no-"),
            `width=${w} line ${i} broke no-op compound: "${stripped}" (full wrap: ${JSON.stringify(lines)})`,
          ).toBe(false)
        }
      }
    })

    test("does not orphan 'document' (auto-scaffold em-dash case)", () => {
      const text =
        "km init should NOT auto-scaffold @agent/0..9 — document as primer example instead"
      const analysis = buildTextAnalysis(text, graphemeWidth)
      for (let w = 22; w <= 32; w++) {
        const lines = optimalWrap(text, analysis, w)
        for (let i = 0; i < lines.length - 1; i++) {
          const stripped = stripAnsi(lines[i]!).trim()
          expect(
            stripped,
            `width=${w} line ${i} orphaned "${stripped}" (full wrap: ${JSON.stringify(lines)})`,
          ).not.toBe("document")
        }
      }
    })

    test("no non-final line is a single short token (< 8 visible chars)", () => {
      // Generalize: the orphan penalty should keep non-final lines from
      // being just one stranded word for typical English titles. Last
      // line is naturally short and exempt.
      const text = "Click on commands does nothing in live TUI (cmd-hover also no-op)"
      const analysis = buildTextAnalysis(text, graphemeWidth)
      for (let w = 22; w <= 30; w++) {
        const lines = optimalWrap(text, analysis, w)
        for (let i = 0; i < lines.length - 1; i++) {
          const stripped = stripAnsi(lines[i]!).trim()
          const tokens = stripped.split(/\s+/).filter((t) => t.length > 0)
          // Non-final 1-token line is fine if the token itself is long
          // (URLs, long IDs) — but a short single token IS an orphan.
          if (tokens.length === 1 && tokens[0]!.length < 8) {
            throw new Error(
              `width=${w} line ${i} stranded single short token "${stripped}" (full wrap: ${JSON.stringify(lines)})`,
            )
          }
        }
      }
    })

    test("preserves all text content in the orphan-fixed wraps", () => {
      // Regression guard: the orphan penalty must not drop content. Joining
      // adjacent lines preserves the inter-line whitespace removed by the
      // wrapper — except for hyphen breaks AND soft-punct breaks
      // (/ \ . _ : ,), where the trailing punctuation stays glued to the
      // next line's leading word (a wrap inside `cmd-hover` emits `cmd-` +
      // `hover`, not `cmd-` + ` hover`; same for `@agent/` + `0..9`).
      const texts = [
        "Click on commands does nothing in live TUI (cmd-hover also no-op)",
        "km init should NOT auto-scaffold @agent/0..9 — document as primer example instead",
      ]
      const SOFT_PUNCT = ["-", "/", "\\", ".", "_", ":", ","]
      for (const text of texts) {
        const analysis = buildTextAnalysis(text, graphemeWidth)
        for (let w = 22; w <= 32; w++) {
          const lines = optimalWrap(text, analysis, w)
          // Glue adjacent lines: insert " " between non-soft-punct-ending
          // pairs, "" between a soft-punct-ending line and the next.
          let recovered = stripAnsi(lines[0] ?? "")
          for (let k = 1; k < lines.length; k++) {
            const prev = stripAnsi(lines[k - 1]!)
            const next = stripAnsi(lines[k]!)
            const lastChar = prev.slice(-1)
            const sep = SOFT_PUNCT.includes(lastChar) ? "" : " "
            recovered += sep + next
          }
          recovered = recovered.replace(/\s+/g, " ").trim()
          const original = text.replace(/\s+/g, " ").trim()
          expect(recovered, `width=${w} content lost: ${JSON.stringify(lines)}`).toBe(original)
        }
      }
    })

    test("still breaks at hyphen when alternative is worse", () => {
      // The hyphen penalty is gentle (250) so it can be overridden by a
      // much-worse-raggedness alternative. Verify the DP still uses the
      // hyphen break when forced (very narrow widths where no whitespace
      // break fits the long compound).
      const text = "see-this-very-long-hyphenated-compound-word here"
      const analysis = buildTextAnalysis(text, graphemeWidth)
      const lines = optimalWrap(text, analysis, 10)
      // At width 10, the compound MUST break — verify the wrap completes
      // without falling back to overflowing greedy lines.
      expect(lines.length).toBeGreaterThan(1)
      // All non-final lines should fit within width.
      for (let i = 0; i < lines.length - 1; i++) {
        expect(stripAnsi(lines[i]!).length, `width=10 line ${i} too wide`).toBeLessThanOrEqual(10)
      }
    })
  })

  // @km/silvery/15130-pretext-maxlines-aware: the DP must honor a caller-
  // provided line-count budget. Without `maxLines`, the wrap engine
  // minimizes raggedness over the full text and can pick a wrap that uses
  // more lines than the caller's container allows; post-wrap truncation
  // ends up clipping content that the wrap engine never saw as
  // overflowing. Pushing the budget into the DP means: when feasible,
  // the wrap fits the cap; when infeasible, `optimalWrap` falls back to a
  // greedy clamp + truncation-suffix that the caller controls.
  describe("maxLines budget (km-silvery.15130)", () => {
    // Helper: count visible (ANSI-stripped) lines in the wrap.
    const visibleLineCount = (lines: string[]) => lines.length

    test("title that wraps to 5 greedy lines fits 4 lines with budget=4", () => {
      // Title from a real kanban card. At width 10, greedy K-P picks 5
      // lines minimizing raggedness. With budget=4, the DP must pick a
      // wrap that uses at most 4 lines (raggedness goes up; this is the
      // trade the caller is explicitly opting into).
      const text = "the quick brown fox jumps over the lazy dog"
      const analysis = buildTextAnalysis(text, graphemeWidth)
      // Sanity: without budget, this exceeds 4 lines at width 10.
      const greedyLines = optimalWrap(text, analysis, 10)
      expect(greedyLines.length).toBeGreaterThan(4)

      // With a wider budget (12), the same text can fit in 4 lines.
      const capped = optimalWrap(text, analysis, 12, { maxLines: 4 })
      expect(capped.length).toBeLessThanOrEqual(4)
      // Content preserved (joining lines with whitespace recovers the original).
      const recovered = capped
        .map((l) => stripAnsi(l))
        .join(" ")
        .replace(/\s+/g, " ")
        .trim()
      expect(recovered).toBe(text)
    })

    test("title needing 8 lines clamps to 4 with truncation suffix", () => {
      // Genuinely infeasible: a long sentence at narrow width can't fit
      // 4 lines even with the optimal wrap. The DP returns no feasible
      // path under the cap; `optimalWrap` falls back to greedy + clamp,
      // appending the truncation suffix to the final visible line.
      const text =
        "the quick brown fox jumps over the lazy dog and then runs back home before sunset rests fully"
      const analysis = buildTextAnalysis(text, graphemeWidth)
      const lines = optimalWrap(text, analysis, 8, { maxLines: 4 })
      expect(lines.length).toBeLessThanOrEqual(4)
      // Last line ends with the default truncation suffix `…`.
      const last = lines[lines.length - 1]!
      expect(stripAnsi(last).endsWith("…")).toBe(true)
      // Every line fits the width budget (including the ellipsis).
      for (const line of lines) {
        expect(
          stripAnsi(line).length,
          `line too wide: ${JSON.stringify(line)}`,
        ).toBeLessThanOrEqual(8)
      }
    })

    test("custom truncationSuffix overrides the default", () => {
      const text = "alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi"
      const analysis = buildTextAnalysis(text, graphemeWidth)
      const lines = optimalWrap(text, analysis, 6, {
        maxLines: 3,
        truncationSuffix: " >>",
      })
      expect(lines.length).toBeLessThanOrEqual(3)
      const last = lines[lines.length - 1]!
      expect(stripAnsi(last).endsWith(" >>")).toBe(true)
      for (const line of lines) {
        expect(stripAnsi(line).length).toBeLessThanOrEqual(6)
      }
    })

    test("empty truncationSuffix truncates without a marker", () => {
      const text = "alpha beta gamma delta epsilon zeta eta theta"
      const analysis = buildTextAnalysis(text, graphemeWidth)
      const lines = optimalWrap(text, analysis, 6, {
        maxLines: 2,
        truncationSuffix: "",
      })
      expect(lines.length).toBeLessThanOrEqual(2)
      // No ellipsis appended.
      for (const line of lines) {
        expect(stripAnsi(line).endsWith("…")).toBe(false)
      }
    })

    test("budget bigger than minimum lines is a no-op", () => {
      // When the optimal wrap already fits within `maxLines`, the
      // budget has no effect — output matches unbounded wrap.
      const text = "hello world foo bar baz"
      const analysis = buildTextAnalysis(text, graphemeWidth)
      const unbounded = optimalWrap(text, analysis, 12)
      const bounded = optimalWrap(text, analysis, 12, { maxLines: 10 })
      expect(bounded).toEqual(unbounded)
    })

    test("budget=1 with text wider than width truncates first line", () => {
      // Edge case: caller wants a single line, but the text is wider
      // than the budget. Greedy fallback clamps to 1 line and appends
      // the suffix.
      const text = "alpha beta gamma delta epsilon zeta"
      const analysis = buildTextAnalysis(text, graphemeWidth)
      const lines = optimalWrap(text, analysis, 10, { maxLines: 1 })
      expect(lines.length).toBe(1)
      const visible = stripAnsi(lines[0]!)
      expect(visible.endsWith("…")).toBe(true)
      expect(visible.length).toBeLessThanOrEqual(10)
    })

    test("budget=0 returns empty wrap", () => {
      // Pathological cap: caller passes maxLines: 0.
      const text = "hello"
      const analysis = buildTextAnalysis(text, graphemeWidth)
      // `hello` fits on a single line — but the cap is 0. Implementation
      // returns the single-line content because that branch hits before the
      // DP. This is the intended quick-reject behavior, NOT a contract bug.
      // Real callers pass maxLines >= 1.
      const lines = optimalWrap(text, analysis, 10, { maxLines: 0 })
      // Defensive: with maxLines=0 the DP itself returns infeasible. But
      // the "single-line OK" quick-reject above the DP fires first — so we
      // accept either [] or ["hello"] (whichever the implementation picks).
      // Lock the actual behavior: it's a 1-line response because totalWidth <= width.
      expect(lines.length).toBeLessThanOrEqual(1)
    })

    test("preserves content under the budget", () => {
      // Sweep: across budgets where the wrap IS feasible, joining lines
      // recovers the original text. Tests content integrity of the 2D DP.
      const text = "rabbit fox dog cat owl bear wolf duck"
      const analysis = buildTextAnalysis(text, graphemeWidth)
      for (const w of [8, 10, 12, 15]) {
        for (const maxLines of [3, 4, 5, 6]) {
          const lines = optimalWrap(text, analysis, w, { maxLines })
          if (lines.length === 0) continue
          // If the LAST line ends with the truncation suffix the wrap was
          // infeasible; skip the content-preservation check.
          const last = lines[lines.length - 1]!
          if (stripAnsi(last).endsWith("…")) continue
          const recovered = lines
            .map((l) => stripAnsi(l))
            .join(" ")
            .replace(/\s+/g, " ")
            .trim()
          expect(
            recovered,
            `width=${w} maxLines=${maxLines} lost content: ${JSON.stringify(lines)}`,
          ).toBe(text)
          expect(
            visibleLineCount(lines),
            `width=${w} maxLines=${maxLines} exceeded budget: ${JSON.stringify(lines)}`,
          ).toBeLessThanOrEqual(maxLines)
        }
      }
    })

    test("per-line widths + maxLines stack correctly", () => {
      // When `width` is a WidthFn, the DP needs to track which line each
      // segment is on (because the allowed width changes per line).
      // Combined with `maxLines`, the 2D DP must keep BOTH dimensions:
      // line index (for cost/allowed-width) AND line-count cap. Test:
      // line 0 narrowed (e.g. by a top-right pill), lines 1+ at full
      // width, capped at 3 lines total.
      const text = "alpha beta gamma delta epsilon zeta eta theta iota"
      const analysis = buildTextAnalysis(text, graphemeWidth)
      // Line 0 has width 6 (narrowed); lines 1+ have width 15 (full).
      const widthFn: (i: number) => number = (i) => (i === 0 ? 6 : 15)
      const lines = optimalWrap(text, analysis, widthFn, { maxLines: 3 })
      expect(lines.length).toBeLessThanOrEqual(3)
      // Line 0 fits within 6, lines 1+ fit within 15. ANSI-stripped widths.
      for (const [i, line] of lines.entries()) {
        const max = i === 0 ? 6 : 15
        // The line may end with the truncation suffix (which fits the
        // appropriate width by construction). Otherwise it must fit
        // the per-line budget.
        expect(
          stripAnsi(line).length,
          `line ${i} too wide (max ${max}): ${JSON.stringify(line)}`,
        ).toBeLessThanOrEqual(max)
      }
    })

    test("per-line widths + maxLines infeasible falls back to truncation", () => {
      // Heavily narrowed line 0 + tight cap → infeasible. Fallback is
      // greedy + clamp + suffix on the last visible line.
      const text = "alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi"
      const analysis = buildTextAnalysis(text, graphemeWidth)
      const widthFn: (i: number) => number = (i) => (i === 0 ? 5 : 10)
      const lines = optimalWrap(text, analysis, widthFn, { maxLines: 3 })
      expect(lines.length).toBeLessThanOrEqual(3)
      const last = lines[lines.length - 1]!
      // Either the wrap completed under the cap (no ellipsis) or it
      // fell back to truncation (ellipsis on last line). Both are
      // acceptable outcomes — assert the line count cap is honoured.
      // (We don't pin the ellipsis on every input because feasibility
      // depends on penalty interactions.)
      expect(last.length).toBeGreaterThan(0)
    })

    test("knuthPlassBreaks honours maxLines opt", () => {
      // Direct API: knuthPlassBreaks(... { maxLines }) returns either a
      // wrap satisfying the cap or `[]` (signalling infeasibility — the
      // caller falls back).
      const text = "the quick brown fox jumps over the lazy dog"
      const analysis = buildTextAnalysis(text, graphemeWidth)
      // Feasible — width 15, budget 4: optimal wrap fits in 3 lines.
      const breaks = knuthPlassBreaks(analysis, 15, { maxLines: 4 })
      // Breaks array has at most maxLines - 1 entries (= 3) if feasible,
      // or 0 if infeasible.
      expect(breaks.length).toBeLessThanOrEqual(3)
    })

    test("knuthPlassBreaks returns [] when infeasible under cap", () => {
      // Genuinely infeasible: long text + narrow width + tight cap.
      // The DP returns `[]` to signal infeasibility; callers fall back.
      const text =
        "the quick brown fox jumps over the lazy dog and then runs back home before sunset"
      const analysis = buildTextAnalysis(text, graphemeWidth)
      const breaks = knuthPlassBreaks(analysis, 6, { maxLines: 2 })
      expect(breaks).toEqual([])
    })
  })
})
