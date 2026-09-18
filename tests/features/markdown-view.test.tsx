/**
 * MarkdownView — minimal Markdown renderer.
 *
 * The load-bearing behavior is paragraph REFLOW: authored hard-wraps inside a
 * paragraph join into one logical line and re-wrap to the container width — the
 * terminal, not the author, decides where lines break. Plus emphasis / inline
 * code / heading / list styling via Typography presets + semantic tokens
 * (`strong`→bold, `em`→italic, `code`→muted/link blend, headings bold).
 *
 * Assertions render the buffer and check what the user sees (The Silvery Way
 * §10); one parser unit test pins the reflow join at the source. Runs at
 * SILVERY_STRICT=2 (default test setup) — incremental renders must match fresh.
 */

import React from "react"
import { describe, test, expect, vi } from "vitest"
import { createRenderer } from "@silvery/test"
import {
  Box,
  Content,
  DocumentView,
  MarkdownView,
  ScrollArea,
  Text,
  type DocumentBlock,
  useScrollController,
} from "silvery"
import { parseMarkdownBlocks } from "../../packages/ag-react/src/ui/components/MarkdownView"

const DEFAULT_WIDTH = 80

// Pin the root width so the column → row → <Text wrap="wrap"> chain reflows to a
// real width instead of collapsing to max-content (silvery CLAUDE.md testing
// note: createRenderer passes cols as *available* width, not root.style.width).
function render(source: string, width = DEFAULT_WIDTH) {
  const r = createRenderer({ cols: width, rows: 24 })
  return r(
    <Box width={width} height={24}>
      <MarkdownView source={source} />
    </Box>,
  )
}

function renderDocument(blocks: readonly DocumentBlock[], width: number) {
  const r = createRenderer({ cols: width, rows: 24 })
  return r(
    <Box width={width} height={24}>
      <Content.Layout fill={false} prose="100%" align="start">
        <DocumentView blocks={blocks} />
      </Content.Layout>
    </Box>,
  )
}

describe("MarkdownView — paragraph reflow", () => {
  test("joins authored hard-wraps and reflows to the container width", () => {
    const source = "This is a long paragraph that the author\nhard-wrapped across two short lines."
    const app = render(source, 80)
    // At width 80 the joined line fits on one row: the authored newline became a
    // space, so the two authored halves sit contiguously.
    expect(app.text).toContain("author hard-wrapped")
  })

  test("re-wraps to a narrow width without losing or reordering words", () => {
    const source = "This is a long paragraph that the author\nhard-wrapped across two short lines."
    const app = render(source, 30)
    const lines = app.text.split("\n").filter((line) => line.trim() !== "")
    expect(lines.length).toBeGreaterThan(1) // forced to wrap at 30 cols
    // Every word survives, in order, re-wrapped at width boundaries (not the
    // authored ones).
    expect(app.text.replace(/\s+/gu, " ").trim()).toContain(
      "This is a long paragraph that the author hard-wrapped across two short lines.",
    )
  })

  test("parseMarkdownBlocks joins wrapped paragraph lines with a space", () => {
    const blocks = parseMarkdownBlocks("alpha beta\ngamma delta")
    expect(blocks).toHaveLength(1)
    expect(blocks[0]).toMatchObject({ kind: "paragraph", text: "alpha beta gamma delta" })
  })

  test("a blank line separates two paragraphs", () => {
    const blocks = parseMarkdownBlocks("one two\n\nthree four")
    expect(blocks.map((block) => (block.kind === "paragraph" ? block.text : block.kind))).toEqual([
      "one two",
      "three four",
    ])
  })
})

describe("MarkdownView — inline emphasis (Typography presets)", () => {
  test("links retain their destination and brighten with an underline on plain hover", async () => {
    const app = render("See [Example](https://example.com) now.")
    const column = app.lines[0]!.indexOf("Example")
    expect(column).toBeGreaterThanOrEqual(0)
    expect(app.term.cell(column, 0).hyperlink).toBe("https://example.com")
    const idle = app.cell(column, 0).fg
    await app.hover(column, 0)
    expect(app.cell(column, 0).fg).not.toEqual(idle)
    expect(app.cell(column, 0).underline).toBe("single")
  })

  test("**bold** renders bold and strips the markers", () => {
    const app = render("**Bold** text")
    const cell = app.cell(0, 0)
    expect(cell.char).toBe("B")
    expect(cell.bold).toBe(true)
    expect(app.text).toContain("Bold")
    expect(app.text).not.toContain("**")
  })

  test("*italic* renders italic and strips the markers", () => {
    const app = render("*Emphasis* here")
    const cell = app.cell(0, 0)
    expect(cell.char).toBe("E")
    expect(cell.italic).toBe(true)
    expect(app.text).not.toContain("*")
  })

  test("`inline code` mixes muted and link foreground without padding or a background chip", () => {
    const app = render("run `bun fix` now")
    const info = createRenderer({ cols: 12, rows: 2 })(
      <Text color="mix($fg-muted, $fg-link, 20%)">b</Text>,
    )
    expect(app.text).toContain("bun fix")
    expect(app.text).not.toContain("`")
    // "run " is cols 0-3; without presentation padding, "b" begins at col 4.
    const codeCell = app.cell(4, 0)
    expect(codeCell.char).toBe("b")
    expect(codeCell.fg).toEqual(info.cell(0, 0).fg)
    expect(codeCell.bg).toBeNull()
  })
})

describe("MarkdownView — block elements", () => {
  test.each([
    ["# Title", 0],
    ["Before\n\n# Title", 3],
    ["## Title", 0],
    ["Before\n\n## Title", 3],
    ["Before\n\n### Title", 2],
    ["# Before\n\n## Title", 2],
    ["## Before\n\n# Title", 2],
    ["---\n\n## Title", 2],
    ["- Before\n\n## Title", 3],
    ["> Before\n\n## Title", 3],
  ])("heading spacing for %j places the title on row %i", (source, expectedRow) => {
    const app = render(source)
    const titleRow = app.lines.findIndex((line) => line.includes("Title"))
    expect(titleRow).toBe(expectedRow)
    const beforeRow = app.lines.findIndex((line) => line.includes("Before") || line.includes("─"))
    expect(app.lines.slice(beforeRow + 1, titleRow).every((line) => line.trim() === "")).toBe(true)
  })

  test("headings render one outdented # while titles stay aligned with prose", () => {
    const app = createRenderer({ cols: 80, rows: 8 })(
      <Box width={80} paddingX={2}>
        <MarkdownView source={"### Title\n\nBody text"} />
      </Box>,
    )
    const headingRow = app.lines.findIndex((line) => line.includes("Title"))
    const bodyRow = app.lines.findIndex((line) => line.includes("Body text"))
    const titleStart = app.lines[headingRow]!.indexOf("Title")
    const cell = app.cell(titleStart, headingRow)
    expect(cell.char).toBe("T")
    expect(cell.bold).toBe(true)
    expect(app.text).toContain("Title")
    expect(app.text).toContain("Body text")
    expect(titleStart).toBe(app.lines[bodyRow]!.indexOf("Body text"))
    expect(app.cell(titleStart - 2, headingRow).char).toBe("#")
    expect(app.cell(titleStart - 1, headingRow).char).toBe(" ")
    expect(app.text.match(/#/gu)).toHaveLength(1)
    expect(cell.underline).toBeFalsy()
  })

  test("bullet list renders one marked row per item", () => {
    const app = render("- Apple\n- Banana\n- Cherry")
    expect(app.text).toContain("• Apple")
    expect(app.text).toContain("• Banana")
    expect(app.text).toContain("• Cherry")
    expect(app.text).not.toMatch(/^-\s/mu) // raw dash marker gone
  })

  test("ordered list renders sequential numbers", () => {
    const app = render("1. First\n2. Second\n3. Third")
    expect(app.text).toContain("1. First")
    expect(app.text).toContain("2. Second")
    expect(app.text).toContain("3. Third")
  })

  test("list item text reflows under a hanging indent", () => {
    const source = "- This single bullet item was authored\n  wrapped onto a second physical line."
    const blocks = parseMarkdownBlocks(source)
    expect(blocks).toHaveLength(1)
    expect(blocks[0]).toMatchObject({ kind: "list" })
    if (blocks[0]?.kind === "list") {
      expect(blocks[0].list.items[0]?.text).toBe(
        "This single bullet item was authored wrapped onto a second physical line.",
      )
    }
  })

  test("fenced code preserves line breaks and forwards its language for highlighting", async () => {
    const app = createRenderer({ cols: 80, rows: 24, autoRender: true })(
      <Box width={80} height={24}>
        <MarkdownView source={"```typescript\nconst a = 1\nconst b = 2\n```"} />
      </Box>,
    )
    expect(app.text).toContain("const a = 1")
    expect(app.text).toContain("const b = 2")
    expect(app.text).not.toContain("const a = 1 const b = 2") // stayed on two lines
    expect(app.text).not.toContain("```") // fence markers stripped
    const sourceRow = app.lines.findIndex((line) => line.includes("const a = 1"))
    const sourceColumn = app.lines[sourceRow]!.indexOf("const")
    await app.hover(sourceColumn, sourceRow)
    expect(app.text).toContain("typescript")
    const plainForeground = createRenderer({ cols: 1, rows: 1 })(
      <Text color="mix($fg, $fg-muted, 50%)">x</Text>,
    ).cell(0, 0).fg
    await vi.waitFor(
      () => {
        const row = app.lines.findIndex((line) => line.includes("const a = 1"))
        const column = app.lines[row]!.indexOf("const")
        expect(app.cell(column, row).fg).not.toBeNull()
        expect(app.cell(column, row).fg).not.toEqual(plainForeground)
      },
      { timeout: 5_000 },
    )
  })
})

describe("DocumentView — shared document geometry", () => {
  test("renders geometric media as a block without nesting its Box inside Text", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined)
    try {
      const app = renderDocument(
        [
          {
            id: "diagram",
            kind: "media",
            content: (
              <Box testID="diagram-media" width={12} height={3}>
                <Text>diagram fallback</Text>
              </Box>
            ),
          },
        ],
        32,
      )

      expect(app.getByTestId("diagram-media").first().boundingBox()).toMatchObject({
        width: 12,
        height: 3,
      })
      expect(warn).not.toHaveBeenCalledWith(
        expect.stringContaining("<Box> cannot be nested inside <Text>"),
      )
    } finally {
      warn.mockRestore()
    }
  })

  test("reveals an off-screen block from its measured wrapped-row origin", async () => {
    const blocks: readonly DocumentBlock[] = [
      {
        id: "wrapped",
        kind: "paragraph",
        content:
          "This deliberately long paragraph wraps across several terminal rows so a semantic block index cannot stand in for measured geometry.",
      },
      { id: "target", kind: "heading", level: 2, content: "Measured target" },
    ]
    let observedOffset = 0
    function RevealedDocument(): React.ReactElement {
      const scrollController = useScrollController()
      observedOffset = scrollController.scrollOffset
      return (
        <Box width={24} height={4}>
          <ScrollArea controller={scrollController}>
            <Content.Layout fill={false} prose="100%" align="start">
              <DocumentView
                blocks={blocks}
                reveal={{ operationId: 1, blockId: "target", scrollController }}
              />
            </Content.Layout>
          </ScrollArea>
        </Box>
      )
    }

    const render = createRenderer({ cols: 24, rows: 4, autoRender: true })
    render(<RevealedDocument />)

    await expect.poll(() => observedOffset).toBeGreaterThan(1)
  })

  test("ordered counters advance while every body shares one hanging-indent column", () => {
    const list = {
      groupId: "steps",
      depth: 0,
      ordered: true,
      start: 9,
    } as const
    const app = renderDocument(
      [
        { id: "step-9", kind: "list-item", list, content: "Nine" },
        {
          id: "step-10",
          kind: "list-item",
          list,
          content: "Ten has enough words to wrap at this narrow width",
        },
        { id: "step-11", kind: "list-item", list, content: "Eleven" },
      ],
      24,
    )
    const lines = app.text.split("\n")
    const nine = lines.findIndex((line) => line.includes("9."))
    const ten = lines.findIndex((line) => line.includes("10."))
    const eleven = lines.findIndex((line) => line.includes("11."))
    const continuation = lines.findIndex((line) => line.includes("wrap at"))

    expect(nine).toBeGreaterThanOrEqual(0)
    expect(ten).toBeGreaterThan(nine)
    expect(eleven).toBeGreaterThan(ten)
    expect(continuation).toBeGreaterThan(ten)
    expect(lines[nine]?.indexOf("Nine")).toBe(lines[ten]?.indexOf("Ten"))
    expect(lines[ten]?.indexOf("Ten")).toBe(lines[eleven]?.indexOf("Eleven"))
    expect(lines[continuation]?.search(/\S/u)).toBe(lines[ten]?.indexOf("Ten"))
  })

  test("tight list rows stay adjacent and leave block rhythm before following prose", () => {
    const list = {
      groupId: "bullets",
      depth: 0,
      ordered: false,
    } as const
    const app = renderDocument(
      [
        { id: "alpha", kind: "list-item", list, content: "Alpha" },
        { id: "beta", kind: "list-item", list, content: "Beta" },
        { id: "after", kind: "paragraph", content: "After the list" },
      ],
      32,
    )
    const lines = app.text.split("\n")
    const alpha = lines.findIndex((line) => line.includes("Alpha"))
    const beta = lines.findIndex((line) => line.includes("Beta"))
    const after = lines.findIndex((line) => line.includes("After the list"))

    expect(beta).toBe(alpha + 1)
    expect(after).toBe(beta + 2)
    expect(lines[alpha]).toMatch(/•\s+Alpha/u)
    expect(lines[beta]).toMatch(/•\s+Beta/u)
  })
})

describe("MarkdownView — realistic PR description", () => {
  test("reflows the body, renders the list, and styles bold — no raw markers", () => {
    const source = [
      "Refactors the queue admission path so submissions",
      "and check-requests share one causal clock.",
      "",
      "Key changes:",
      "",
      "- **Dedupe** the trailing issue line",
      "- Reflow paragraphs to the pane width",
      "",
      "Issue: @yrd/core/21096",
    ].join("\n")
    const app = render(source, 80)
    expect(app.text).toContain("submissions and check-requests") // paragraph reflow
    expect(app.text).toContain("• ") // list rendered
    expect(app.text).toContain("Dedupe") // bold content present
    expect(app.text).toContain("Issue: @yrd/core/21096") // trailer preserved verbatim
    expect(app.text).not.toContain("**") // emphasis markers stripped
  })
})
