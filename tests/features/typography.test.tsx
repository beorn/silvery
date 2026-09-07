/**
 * Typography Preset Component Tests
 *
 * Tests for all typography components exported from silvery:
 * H1, H2, H3, P, Lead, Muted, Strong, Em, Code, Kbd,
 * Blockquote, CodeBlock, HR, UL, OL, LI
 */

import { describe, test, expect } from "vitest"
import { createRenderer } from "@silvery/test"
import { customInteractionSurface, resolveInteractionTreatment } from "@silvery/ag"
import {
  H1,
  H2,
  H3,
  H4,
  H5,
  H6,
  P,
  Lead,
  Muted,
  Strong,
  Em,
  Code,
  Kbd,
  DecoratedRegion,
  Blockquote,
  CodeBlock,
  HR,
  UL,
  OL,
  LI,
  Box,
  Text,
} from "silvery"

const render = createRenderer({ cols: 80, rows: 10 })

// ============================================================================
// Headings
// ============================================================================

describe("Headings", () => {
  test.each([H1, H2, H3, H4, H5, H6])(
    "%p leaves heading text un-underlined by default",
    (Heading) => {
      const app = render(<Heading>Page Title</Heading>)
      expect(app.text).toContain("Page Title")
      expect(app.cell(0, 0).underline).toBeFalsy()
    },
  )

  test("H1 is bold with $fg-accent color", () => {
    const app = render(<H1>Title</H1>)
    const cell = app.term.buffer.getCell(0, 0)
    expect(cell.char).toBe("T")
    expect(cell.attrs.bold).toBe(true)
    expect(cell.fg).not.toBeNull()
  })

  test("H2 renders text", () => {
    const app = render(<H2>Section</H2>)
    expect(app.text).toContain("Section")
  })

  test("H2 is bold with $fg-accent color", () => {
    const app = render(<H2>Section</H2>)
    const cell = app.term.buffer.getCell(0, 0)
    expect(cell.char).toBe("S")
    expect(cell.attrs.bold).toBe(true)
    expect(cell.fg).not.toBeNull()
  })

  test("H1 and H2 both have foreground colors set", () => {
    const app1 = render(<H1>A</H1>)
    const h1Fg = app1.term.buffer.getCell(0, 0).fg

    const app2 = render(<H2>A</H2>)
    const h2Fg = app2.term.buffer.getCell(0, 0).fg

    // Both use semantic theme colors ($fg-accent for both H1 and H2)
    expect(h1Fg).not.toBeNull()
    expect(h2Fg).not.toBeNull()
  })

  test("H3 renders text", () => {
    const app = render(<H3>Group</H3>)
    expect(app.text).toContain("Group")
  })

  test("H3 is bold with no explicit color (inherits foreground from parent)", () => {
    const app = render(<H3>Group</H3>)
    const cell = app.term.buffer.getCell(0, 0)
    expect(cell.char).toBe("G")
    // h3 variant: { bold: true } — bold emphasis with no default color
    expect(cell.attrs.bold).toBe(true)
    // H3 inherits fg from parent — null when no ancestor sets a color
    expect(cell.fg).toBeNull()
  })

  test("headings accept color override", () => {
    const app = render(<H1 color="$fg-success">OK</H1>)
    const cell = app.term.buffer.getCell(0, 0)
    expect(cell.char).toBe("O")
    expect(cell.attrs.bold).toBe(true)
    // Should have a foreground color (the overridden one)
    expect(cell.fg).not.toBeNull()
  })
})

// ============================================================================
// Body Text
// ============================================================================

describe("Body text", () => {
  test("P renders plain text", () => {
    const app = render(<P>Body text here</P>)
    expect(app.text).toContain("Body text here")
  })

  test("P softens foreground by 12.5% without bold or italic", () => {
    const app = render(<P>Plain</P>)
    const expected = createRenderer({ cols: 1, rows: 1 })(
      <Text color="mix($fg, $fg-muted, 12.5%)">P</Text>,
    )
    const cell = app.term.buffer.getCell(0, 0)
    expect(cell.attrs.bold).toBeFalsy()
    expect(cell.attrs.italic).toBeFalsy()
    expect(cell.fg).toEqual(expected.cell(0, 0).fg)
  })

  test("Lead renders text in italic", () => {
    const app = render(<Lead>Intro text</Lead>)
    expect(app.text).toContain("Intro text")
    const cell = app.term.buffer.getCell(0, 0)
    expect(cell.attrs.italic).toBe(true)
  })

  test("Lead uses $fg-muted color by default", () => {
    const app = render(<Lead>Intro</Lead>)
    const cell = app.term.buffer.getCell(0, 0)
    expect(cell.fg).not.toBeNull()
  })

  test("Muted renders text with $fg-muted color", () => {
    const app = render(<Muted>Secondary</Muted>)
    expect(app.text).toContain("Secondary")
    const cell = app.term.buffer.getCell(0, 0)
    expect(cell.fg).not.toBeNull()
  })

  test("Muted is not bold or italic", () => {
    const app = render(<Muted>Secondary</Muted>)
    const cell = app.term.buffer.getCell(0, 0)
    expect(cell.attrs.bold).toBeFalsy()
    expect(cell.attrs.italic).toBeFalsy()
  })

  test("Lead and Muted have the same $fg-muted foreground", () => {
    const app1 = render(<Lead>A</Lead>)
    const leadFg = app1.term.buffer.getCell(0, 0).fg

    const app2 = render(<Muted>A</Muted>)
    const mutedFg = app2.term.buffer.getCell(0, 0).fg

    expect(leadFg).toEqual(mutedFg)
  })
})

// ============================================================================
// Inline Emphasis
// ============================================================================

describe("Inline emphasis", () => {
  test("Strong renders bold text", () => {
    const app = render(<Strong>Important</Strong>)
    const reference = createRenderer({ cols: 1, rows: 1 })(
      <Text color="mix($fg, mix($fg, $fg-muted, 12.5%), 50%)">I</Text>,
    )
    expect(app.text).toContain("Important")
    const cell = app.term.buffer.getCell(0, 0)
    expect(cell.attrs.bold).toBe(true)
    expect(cell.fg).toEqual(reference.cell(0, 0).fg)
  })

  test("Strong is not italic", () => {
    const app = render(<Strong>Bold</Strong>)
    const cell = app.term.buffer.getCell(0, 0)
    expect(cell.attrs.italic).toBeFalsy()
  })

  test("Em renders italic text", () => {
    const app = render(<Em>Emphasis</Em>)
    const reference = createRenderer({ cols: 1, rows: 1 })(
      <Text color="mix($fg, mix($fg, $fg-muted, 12.5%), 50%)">E</Text>,
    )
    expect(app.text).toContain("Emphasis")
    const cell = app.term.buffer.getCell(0, 0)
    expect(cell.attrs.italic).toBe(true)
    expect(cell.fg).toEqual(reference.cell(0, 0).fg)
  })

  test("Em is not bold", () => {
    const app = render(<Em>Italic</Em>)
    const cell = app.term.buffer.getCell(0, 0)
    expect(cell.attrs.bold).toBeFalsy()
  })

  test("Strong and Em accept color override", () => {
    const app1 = render(<Strong color="$fg-success">A</Strong>)
    expect(app1.term.buffer.getCell(0, 0).fg).not.toBeNull()

    const app2 = render(<Em color="$fg-warning">B</Em>)
    expect(app2.term.buffer.getCell(0, 0).fg).not.toBeNull()
  })
})

// ============================================================================
// Inline Code Elements
// ============================================================================

describe("Inline code elements", () => {
  test("Code renders without padding spaces", () => {
    const app = render(<Code>fn()</Code>)
    expect(app.term.buffer.getCell(0, 0).char).toBe("f")
    expect(app.text).not.toContain(" fn() ")
  })

  test("Code keeps four-fifths muted foreground without a background chip", () => {
    const app = render(<Code>x</Code>)
    const info = createRenderer({ cols: 1, rows: 1 })(
      <Text color="mix($fg-muted, $fg-link, 20%)">x</Text>,
    )
    const cell = app.term.buffer.getCell(0, 0)
    expect(cell.char).toBe("x")
    expect(cell.fg).toEqual(info.term.buffer.getCell(0, 0).fg)
    expect(cell.bg).toBeNull()
  })

  test("Kbd wraps content with padding spaces", () => {
    const app = render(<Kbd>Ctrl+C</Kbd>)
    expect(app.text).toContain(" Ctrl+C ")
  })

  test("Kbd has $bg-muted background and is bold", () => {
    const app = render(<Kbd>K</Kbd>)
    const cell = app.term.buffer.getCell(1, 0)
    expect(cell.char).toBe("K")
    expect(cell.bg).not.toBeNull()
    expect(cell.attrs.bold).toBe(true)
  })

  test("Code is not bold, Kbd is bold", () => {
    const app1 = render(<Code>a</Code>)
    const codeCell = app1.term.buffer.getCell(0, 0)
    expect(codeCell.attrs.bold).toBeFalsy()

    const app2 = render(<Kbd>a</Kbd>)
    const kbdCell = app2.term.buffer.getCell(1, 0)
    expect(kbdCell.attrs.bold).toBe(true)
  })

  test("Code caller color overrides its muted-link foreground", () => {
    const app = render(<Code color="$fg-success">ok</Code>)
    const override = render(<Text color="$fg-success">ok</Text>)
    expect(app.term.buffer.getCell(0, 0).fg).toEqual(override.term.buffer.getCell(0, 0).fg)
  })

  // Tracking: @km/silvery/15086-inline-code-nowrap-default.
  // Inline code is one unbroken token; when it overflows we truncate
  // the middle (GitHub-style) instead of wrapping mid-identifier.
  test("Code defaults to truncate-middle on overflow (long identifier in narrow container)", () => {
    const longId = "getPolygonInterValForBand"
    // 18-wide container: padded " <id> " is 27 chars → must truncate.
    const app = render(
      <Box width={18}>
        <Code>{longId}</Code>
      </Box>,
    )
    // Truncate-middle uses U+2026 (…) ellipsis. The original identifier
    // must NOT appear verbatim (since it's >18 chars including padding),
    // and the rendered text must contain the ellipsis character.
    expect(app.text).toContain("…")
    expect(app.text).not.toContain(longId)
  })

  test("Code on a single line — no mid-identifier wrap", () => {
    // Render Code inside a 12-wide container that would otherwise wrap.
    // truncate-middle is single-line by definition: the rendered output
    // must have at most one row of visible code content (plus surrounding
    // empty rows). Easier assertion: the ellipsis appears, and no row
    // contains a partial-identifier prefix without the ellipsis.
    const longId = "veryLongIdentifierName"
    const app = render(
      <Box width={12}>
        <Code>{longId}</Code>
      </Box>,
    )
    expect(app.text).toContain("…")
    // None of the displayed lines should END with a non-ellipsis
    // continuation of `veryLong…` — i.e. no `veryLong` + newline + `…erName`.
    for (const line of app.text.split("\n")) {
      // A wrapped-mid-identifier symptom would have a line containing
      // a clean prefix of the identifier without the ellipsis.
      if (line.includes("veryLong") && !line.includes("…")) {
        throw new Error(`mid-identifier wrap symptom: ${JSON.stringify(line)}`)
      }
    }
  })

  test("Code caller can override the truncate-middle default", () => {
    // The new default is opt-in: an explicit `wrap="wrap"` still wraps.
    const app = render(
      <Box width={10}>
        <Code wrap="wrap">veryLongIdentifierName</Code>
      </Box>,
    )
    // wrap=wrap with no overflow handling: text should span multiple
    // lines without an ellipsis (greedy hard-wrap fallback).
    expect(app.text).not.toContain("…")
  })
})

// ============================================================================
// Block Elements
// ============================================================================

describe("Block elements", () => {
  test("DecoratedRegion renders and treats the regional gutter on hover", async () => {
    const localRender = createRenderer({ cols: 24, rows: 4 })
    const app = localRender(
      <DecoratedRegion interactionSurface="surfaceHover">
        <Text>Region</Text>
      </DecoratedRegion>,
    )
    const firstLine = app.lines[0] ?? ""
    const railColumn = firstLine.indexOf("▏")
    const contentColumn = firstLine.indexOf("Region")
    const idleRail = app.term.buffer.getCell(railColumn, 0).fg
    const idleBackground = app.term.buffer.getCell(contentColumn, 0).bg

    expect(railColumn).toBeGreaterThanOrEqual(0)
    await app.hover(contentColumn, 0)

    expect(app.term.buffer.getCell(railColumn, 0).fg).not.toEqual(idleRail)
    expect(app.term.buffer.getCell(contentColumn, 0).bg).not.toEqual(idleBackground)
  })

  test("DecoratedRegion consumes an externally resolved regional treatment", () => {
    const treatment = resolveInteractionTreatment(
      { hovered: true, armed: false, selected: false, focused: false, dropTarget: false },
      "region",
      customInteractionSurface({ revealed: { gutterColor: "$fg-success" } }),
    )
    const localRender = createRenderer({ cols: 24, rows: 4 })
    const app = localRender(
      <DecoratedRegion interactionTreatment={treatment}>
        <Text>External</Text>
      </DecoratedRegion>,
    )
    const railColumn = (app.lines[0] ?? "").indexOf("▏")
    const success = createRenderer({ cols: 2, rows: 1 })(<Text color="$fg-success">x</Text>)

    expect(app.cell(railColumn, 0).fg).toEqual(success.cell(0, 0).fg)
  })

  test("DecoratedRegion can treat only its gutter and cursor without cascading content styles", async () => {
    const localRender = createRenderer({ cols: 28, rows: 4 })
    const app = localRender(
      <DecoratedRegion
        treatContent={false}
        interactionSurface={customInteractionSurface({
          revealed: {
            color: "$fg-success",
            backgroundColor: "$bg-surface-hover",
            bold: true,
            inverse: true,
            gutterColor: "$fg-warning",
          },
        })}
      >
        <Text>Unstyled content</Text>
      </DecoratedRegion>,
    )
    const row = app.lines.findIndex((line) => line.includes("Unstyled content"))
    const contentColumn = app.lines[row]?.indexOf("Unstyled content") ?? -1
    const railColumn = app.lines[row]?.indexOf("▏") ?? -1
    const contentBefore = app.cell(contentColumn, row)
    const railBefore = app.cell(railColumn, row).fg

    await app.hover(contentColumn, row)

    expect(app.cell(railColumn, row).fg).not.toEqual(railBefore)
    expect(app.cell(contentColumn, row)).toMatchObject({
      fg: contentBefore.fg,
      bg: contentBefore.bg,
      bold: contentBefore.bold,
      inverse: contentBefore.inverse,
    })
    expect(app.getByText("Unstyled content").resolve()?.parent?.props.mouseCursor).toBe("pointer")
  })

  test("DecoratedRegion rejects an external non-regional treatment", () => {
    const treatment = resolveInteractionTreatment(
      { hovered: true, armed: false, selected: false, focused: false, dropTarget: false },
      "control",
      "surfaceHover",
    )
    const localRender = createRenderer({ cols: 24, rows: 4 })

    expect(() =>
      localRender(
        <DecoratedRegion interactionTreatment={treatment}>
          <Text>Invalid</Text>
        </DecoratedRegion>,
      ),
    ).toThrow(/regional treatment/u)
  })

  test("DecoratedRegion rejects conflicting internal and external treatments", () => {
    const treatment = resolveInteractionTreatment(
      { hovered: true, armed: false, selected: false, focused: false, dropTarget: false },
      "region",
      "surfaceHover",
    )
    const localRender = createRenderer({ cols: 24, rows: 4 })

    expect(() =>
      localRender(
        // @ts-expect-error internal and external treatments are mutually exclusive.
        <DecoratedRegion interactionSurface="surfaceHover" interactionTreatment={treatment}>
          <Text>Invalid</Text>
        </DecoratedRegion>,
      ),
    ).toThrow(/interactionSurface or interactionTreatment/u)
  })

  test("DecoratedRegion rejects interaction state without a surface", () => {
    const localRender = createRenderer({ cols: 24, rows: 4 })

    expect(() =>
      localRender(
        // @ts-expect-error interaction state is valid only with interactionSurface.
        <DecoratedRegion interactionState={{ selected: true }}>
          <Text>Invalid</Text>
        </DecoratedRegion>,
      ),
    ).toThrow(/requires interactionSurface/u)
  })

  test("Blockquote is inset two cells without a rail", () => {
    const app = render(<Blockquote>Quoted text</Blockquote>)
    expect(app.text).not.toContain("▏")
    expect(app.text).not.toContain("│")
    expect(app.lines[0]).toMatch(/^  Quoted text/)
  })

  test("Blockquote preserves its two-cell inset on wrapped rows", () => {
    const narrow = createRenderer({ cols: 32, rows: 10 })
    const app = narrow(
      <Box width={32}>
        <Blockquote>Alpha beta gamma delta epsilon zeta eta theta iota kappa lambda.</Blockquote>
      </Box>,
    )
    const rows = app.lines
      .map((line, row) => ({ line, row }))
      .filter(({ line }) => line.trim().length > 0)

    expect(rows.length).toBeGreaterThan(1)
    for (const { line } of rows) {
      expect(line.slice(0, 2)).toBe("  ")
      expect(line[2]).toMatch(/\S/)
      expect(line).not.toMatch(/[▏│]/)
    }
  })

  test("Blockquote content is italic", () => {
    const app = render(<Blockquote>Quote</Blockquote>)
    // Find the first quoted character after the two-cell inset.
    const buffer = app.term.buffer
    let quoteCol = -1
    for (let x = 0; x < 80; x++) {
      if (buffer.getCell(x, 0).char === "Q") {
        quoteCol = x
        break
      }
    }
    expect(quoteCol).toBeGreaterThan(0)
    expect(buffer.getCell(quoteCol, 0).attrs.italic).toBe(true)
  })

  test("Blockquote uses the muted foreground", () => {
    const localRender = createRenderer({ cols: 80, rows: 4 })
    const app = localRender(<Blockquote>Text</Blockquote>)
    const muted = createRenderer({ cols: 4, rows: 2 })(<Text color="$fg-muted">x</Text>)
    const buffer = app.term.buffer
    expect(buffer.getCell(2, 0).char).toBe("T")
    expect(buffer.getCell(2, 0).fg).toEqual(muted.term.buffer.getCell(0, 0).fg)
  })

  test("CodeBlock reveals its label on hover and collapses on a body click", async () => {
    const app = createRenderer({ cols: 40, rows: 8, autoRender: true })(
      <Box width={40} flexDirection="column">
        <CodeBlock label="tsx">const answer = 42</CodeBlock>
        <Text>After</Text>
      </Box>,
    )
    expect(app.text).not.toContain("tsx")
    const expandedBackground = app.cell(0, 0).bg
    expect(app.lines.findIndex((line) => line.includes("After"))).toBe(3)
    await app.hover(3, 1)
    expect(app.lines[0]).toContain("tsx")
    expect(app.cell(0, 0).bg).toEqual(expandedBackground)
    expect(app.text).not.toContain("▾")
    await app.click(3, 1)
    expect(app.text).not.toContain("const answer")
    expect(app.lines[0]).toContain("▸ tsx")
    expect(app.cell(0, 0).char).toBe("▸")
    expect(app.cell(2, 0).char).toBe("t")
    const mutedLabel = createRenderer({ cols: 1, rows: 1 })(<Text color="$fg-muted">t</Text>)
    expect(app.cell(2, 0).fg).toEqual(mutedLabel.cell(0, 0).fg)
    expect(app.lines.findIndex((line) => line.includes("After"))).toBe(1)
    await app.click(3, 0)
    expect(app.text).toContain("const answer = 42")
  })

  test("CodeBlock respects a child that prevents the toggle click", async () => {
    const app = createRenderer({ cols: 40, rows: 8, autoRender: true })(
      <CodeBlock
        label="text"
        content={<Text onClick={(event) => event.preventDefault()}>Keep open</Text>}
      />,
    )
    await app.click(3, 1)
    expect(app.text).toContain("Keep open")
  })

  test("CodeBlock frames code with two-cell sides and one-row padding", () => {
    const app = render(
      <Box width={30} flexDirection="column">
        <Box paddingX={2}>
          <Text>Prose</Text>
        </Box>
        <CodeBlock>{"const x = 1\nnext line"}</CodeBlock>
      </Box>,
    )
    const subtle = createRenderer({ cols: 1, rows: 1 })(
      <Box backgroundColor="$bg-surface-subtle">
        <Text>x</Text>
      </Box>,
    )
    const bg = subtle.cell(0, 0).bg
    const codeForeground = createRenderer({ cols: 1, rows: 1 })(
      <Text color="mix($fg, $fg-muted, 50%)">x</Text>,
    )
    expect(bg).not.toBeNull()
    expect(app.text).not.toMatch(/[▏│]/)
    expect(app.text).toContain("const x = 1")
    expect(app.lines[2]?.indexOf("const")).toBe(app.lines[0]?.indexOf("Prose"))
    for (const row of [1, 2, 3, 4]) {
      for (let col = 0; col < 30; col++) {
        expect(app.cell(col, row).bg).toEqual(bg)
      }
      expect(app.cell(30, row).bg).not.toEqual(bg)
    }
    expect(app.lines[1]?.trim()).toBe("")
    expect(app.lines[4]?.trim()).toBe("")
    expect(app.cell(2, 2).italic).toBe(false)
    expect(app.cell(2, 2).fg).toEqual(codeForeground.cell(0, 0).fg)
    expect(app.cell(2, 2).fg).not.toEqual(app.cell(2, 0).fg)
  })

  test("CodeBlock content is not italic", () => {
    const app = render(<CodeBlock>code</CodeBlock>)
    const row = app.lines.findIndex((line) => line.includes("code"))
    expect(row).toBe(1)
    expect(app.cell(app.lines[row]!.indexOf("code"), row).italic).toBe(false)
  })

  // Tracking: @km/silvery/15087-markdown-code-block-char-wrap-default.
  // Long code lines wrap mid-identifier (CSS `word-break: break-all`)
  // instead of spilling off the right edge — terminal can't honor
  // horizontal scroll like an IDE, so character wrap is the predictable
  // default for fenced code.
  test("CodeBlock defaults to wrap='hard' (long identifier wraps mid-token)", () => {
    const longId = "getPolygonIntervalForBandWithFloatingPointPrecision"
    // The frame shares the 20-column measure with its padding.
    const app = render(
      <Box width={20}>
        <CodeBlock>{longId}</CodeBlock>
      </Box>,
    )
    // All characters of the identifier must appear in the rendered text.
    // (no truncation, no spill). The hard-wrap path slices by display
    // width and re-emits the remainder on the next line.
    expect(app.text).toContain("getPolygonIntervalForBandWithFloatingPointPrecision".slice(0, 5))
    // The identifier is 51 chars — must span multiple rendered rows.
    const linesWithContent = app.text.split("\n").filter((l) => l.trim().length > 0).length
    expect(linesWithContent).toBeGreaterThan(1)
    expect(app.text).not.toMatch(/[▏│]/)
    // Hard-wrap doesn't insert ellipsis — fully visible content.
    expect(app.text).not.toContain("…")
    // All identifier characters preserved on screen.
    expect(app.text.replace(/\s/g, "")).toBe(longId)
  })

  test("CodeBlock short content stays on one line without growing vertically", () => {
    const app = render(
      <Box height={12} flexDirection="column">
        <CodeBlock>{"const x = 1"}</CodeBlock>
        <Text>After</Text>
      </Box>,
    )
    // Single-line content should not wrap.
    const linesWithContent = app.text.split("\n").filter((l) => l.includes("const")).length
    expect(linesWithContent).toBe(1)
    expect(app.lines.findIndex((line) => line.includes("After"))).toBe(3)
  })

  test("CodeBlock honors caller foreground", () => {
    const expected = createRenderer({ cols: 1, rows: 1 })(<Text color="$fg-error">x</Text>)
    const app = render(<CodeBlock color="$fg-error">x</CodeBlock>)
    expect(app.cell(2, 1).fg).toEqual(expected.cell(0, 0).fg)
  })

  test("the code surface does not paint adjacent quote or prose rows", () => {
    const app = render(
      <Box flexDirection="column" width={30} paddingX={2}>
        <Blockquote>Quote</Blockquote>
        <CodeBlock>code</CodeBlock>
        <Text>After</Text>
      </Box>,
    )
    expect(app.cell(4, 0).bg).toEqual(app.cell(2, 4).bg)
    expect(app.cell(2, 2).bg).not.toEqual(app.cell(2, 4).bg)
  })
})

// ============================================================================
// Horizontal Rule
// ============================================================================

describe("HR", () => {
  test("renders ─ characters", () => {
    const app = render(<HR />)
    expect(app.text).toContain("─")
  })

  test("uses $border-muted color", () => {
    const app = render(<HR />)
    const ruleStart = app.lines[0]!.indexOf("─")
    const cell = app.term.buffer.getCell(ruleStart, 0)
    expect(cell.char).toBe("─")
    expect(cell.fg).not.toBeNull()
  })

  test("accepts color override", () => {
    const app = render(<HR color="$fg-success" />)
    const ruleStart = app.lines[0]!.indexOf("─")
    const cell = app.term.buffer.getCell(ruleStart, 0)
    expect(cell.fg).not.toBeNull()
  })

  /**
   * HR is INSET, not full-bleed (@km/tui/22744): it renders at
   * `min(container * 0.67, 60)`, so asserting every column is a rule character
   * pins the pre-22744 behaviour and fails by design. This asserts the property
   * instead — the rule is continuous, centred, and stops SHORT of the
   * container — which survives any retune of the measure fraction.
   */
  test("draws a continuous rule that is inset from the container", () => {
    const cols = 20
    const narrowRender = createRenderer({ cols, rows: 5 })
    const app = narrowRender(<HR />)

    const row = Array.from({ length: cols }, (_, x) => app.term.buffer.getCell(x, 0).char)
    const ruleStart = row.findIndex((ch) => ch === "─")
    const ruleEnd = row.findLastIndex((ch) => ch === "─")
    const ruleLength = ruleEnd - ruleStart + 1

    // Non-empty, continuous, and centred rather than attached to either edge.
    expect(ruleStart).toBeGreaterThan(0)
    expect(row.slice(ruleStart, ruleEnd + 1).every((ch) => ch === "─")).toBe(true)
    expect(Math.abs(ruleStart - (cols - ruleEnd - 1))).toBeLessThanOrEqual(1)
    // Inset: it must not reach the container edge, which is the whole point.
    expect(ruleLength).toBeLessThan(cols)
    // Everything past the rule is blank, never a truncation ellipsis: a rule
    // has no content to lose, so an ellipsis would be claiming otherwise.
    expect(row.slice(0, ruleStart).every((ch) => ch === " ")).toBe(true)
    expect(row.slice(ruleEnd + 1).every((ch) => ch === " ")).toBe(true)
  })
})

// ============================================================================
// Lists
// ============================================================================

describe("Lists", () => {
  describe("Unordered lists", () => {
    test("UL + LI renders bullet marker", () => {
      const app = render(
        <UL>
          <LI>First</LI>
        </UL>,
      )
      expect(app.text).toContain("•")
      expect(app.text).toContain("First")
    })

    test("UL + multiple LI renders all items", () => {
      const app = render(
        <UL>
          <LI>Alpha</LI>
          <LI>Beta</LI>
          <LI>Gamma</LI>
        </UL>,
      )
      expect(app.text).toContain("Alpha")
      expect(app.text).toContain("Beta")
      expect(app.text).toContain("Gamma")
    })

    test("nested UL keeps the same filled bullet at level 2", () => {
      // Nesting UL/OL as sibling elements (not inside LI children text)
      // to avoid Box-in-Text warning

      const app = render(
        <Box flexDirection="column">
          <UL>
            <LI>Outer</LI>
          </UL>
          <UL>
            <UL>
              <LI>Inner</LI>
            </UL>
          </UL>
        </Box>,
      )
      expect(app.text).toContain("•")
      expect(app.text.match(/•/g)).toHaveLength(2)
      expect(app.text).toContain("Outer")
      expect(app.text).toContain("Inner")
    })

    test("deeply nested UL uses one filled bullet at every depth", () => {
      const app = render(
        <Box flexDirection="column">
          <UL>
            <LI>L1</LI>
          </UL>
          <UL>
            <UL>
              <LI>L2</LI>
            </UL>
          </UL>
          <UL>
            <UL>
              <UL>
                <LI>L3</LI>
              </UL>
            </UL>
          </UL>
          <UL>
            <UL>
              <UL>
                <UL>
                  <LI>L4</LI>
                </UL>
              </UL>
            </UL>
          </UL>
        </Box>,
      )
      expect(app.text.match(/•/g)).toHaveLength(4)
      expect(app.text).not.toMatch(/[◦■]/)
      // A triangle is the fold affordance; a static list never wears one.
      expect(app.text).not.toContain("▸")
    })

    test("nested list increases indent", () => {
      const app = render(
        <Box flexDirection="column">
          <UL>
            <LI>Top</LI>
          </UL>
          <UL>
            <UL>
              <LI>Nested</LI>
            </UL>
          </UL>
        </Box>,
      )
      const buffer = app.term.buffer
      // Find the same filled bullet at each level; indentation carries depth.
      let bulletCol1 = -1
      let bulletCol2 = -1
      for (let y = 0; y < 10; y++) {
        for (let x = 0; x < 80; x++) {
          const ch = buffer.getCell(x, y).char
          if (ch === "•") {
            if (bulletCol1 === -1) bulletCol1 = x
            else if (bulletCol2 === -1) bulletCol2 = x
          }
        }
      }
      expect(bulletCol1).toBeGreaterThanOrEqual(0)
      expect(bulletCol2).toBeGreaterThan(bulletCol1)
    })
  })

  describe("Ordered lists", () => {
    test("OL + LI renders numbered markers", () => {
      const app = render(
        <OL>
          <LI>First</LI>
          <LI>Second</LI>
          <LI>Third</LI>
        </OL>,
      )
      expect(app.text).toContain("1.")
      expect(app.text).toContain("2.")
      expect(app.text).toContain("3.")
      expect(app.text).toContain("First")
      expect(app.text).toContain("Second")
      expect(app.text).toContain("Third")
    })

    test("OL auto-numbers only LI children", () => {
      const app = render(
        <OL>
          <LI>One</LI>
          <LI>Two</LI>
        </OL>,
      )
      expect(app.text).toContain("1.")
      expect(app.text).toContain("2.")
      // Should not have "3."
      expect(app.text).not.toContain("3.")
    })
  })

  describe("LI styling", () => {
    test("LI marker uses $fg-muted color by default", () => {
      const app = render(
        <UL>
          <LI>Item</LI>
        </UL>,
      )
      const buffer = app.term.buffer
      // Find the bullet character
      let bulletCol = -1
      let bulletRow = -1
      for (let y = 0; y < 10; y++) {
        for (let x = 0; x < 80; x++) {
          if (buffer.getCell(x, y).char === "•") {
            bulletCol = x
            bulletRow = y
            break
          }
        }
        if (bulletCol >= 0) break
      }
      expect(bulletCol).toBeGreaterThanOrEqual(0)
      expect(buffer.getCell(bulletCol, bulletRow).fg).not.toBeNull()
    })

    test("LI accepts color override", () => {
      const app = render(
        <UL>
          <LI color="$fg-success">Green item</LI>
        </UL>,
      )
      expect(app.text).toContain("Green item")
      // Both marker and text should have the override color
      const buffer = app.term.buffer
      let bulletCol = -1
      let bulletRow = -1
      for (let y = 0; y < 10; y++) {
        for (let x = 0; x < 80; x++) {
          if (buffer.getCell(x, y).char === "•") {
            bulletCol = x
            bulletRow = y
            break
          }
        }
        if (bulletCol >= 0) break
      }
      expect(bulletCol).toBeGreaterThanOrEqual(0)
      expect(buffer.getCell(bulletCol, bulletRow).fg).not.toBeNull()
    })
  })

  describe("Mixed list types", () => {
    test("OL nested inside UL context", () => {
      const app = render(
        <Box flexDirection="column">
          <UL>
            <LI>Bullet</LI>
          </UL>
          <UL>
            <OL>
              <LI>Numbered</LI>
            </OL>
          </UL>
        </Box>,
      )
      expect(app.text).toContain("•")
      expect(app.text).toContain("1.")
      expect(app.text).toContain("Bullet")
      expect(app.text).toContain("Numbered")
    })

    test("UL nested inside OL context", () => {
      const app = render(
        <Box flexDirection="column">
          <OL>
            <LI>First</LI>
          </OL>
          <OL>
            <UL>
              <LI>Sub-bullet</LI>
            </UL>
          </OL>
        </Box>,
      )
      expect(app.text).toContain("1.")
      expect(app.text).toContain("•")
      expect(app.text).toContain("First")
      expect(app.text).toContain("Sub-bullet")
    })
  })
})

// ============================================================================
// Color override (cross-cutting)
// ============================================================================

describe("Color override", () => {
  test.each([
    ["H1", <H1 color="$fg-success">X</H1>],
    ["H2", <H2 color="$fg-success">X</H2>],
    ["H3", <H3 color="$fg-success">X</H3>],
    ["P", <P color="$fg-success">X</P>],
    ["Lead", <Lead color="$fg-success">X</Lead>],
    ["Muted", <Muted color="$fg-success">X</Muted>],
    ["Strong", <Strong color="$fg-success">X</Strong>],
    ["Em", <Em color="$fg-success">X</Em>],
  ] as const)("%s accepts color override", (_name, element) => {
    const app = render(element)
    expect(app.text).toContain("X")
    // Find the X character and verify it has a foreground color
    const buffer = app.term.buffer
    let found = false
    for (let x = 0; x < 80; x++) {
      if (buffer.getCell(x, 0).char === "X") {
        expect(buffer.getCell(x, 0).fg).not.toBeNull()
        found = true
        break
      }
    }
    expect(found).toBe(true)
  })
})
