/**
 * Shared document geometry: headings keep the prose column, with their
 * marker and gap in the left gutter. Compact mode keeps one trailing cell;
 * framed source still reserves two inner padding cells.
 * Tracking: @si/app/22571-maddoc-doc-viewer-umbrella/22938.
 */

import React from "react"
import { describe, expect, test } from "vitest"
import { createRenderer } from "@silvery/test"
import {
  Content,
  DocumentView,
  PopoverProvider,
  Text,
  ThemeProvider,
  type DocumentBlock,
  type DocumentHeadingBlock,
} from "@silvery/ag-react"

function titleColumn(app: ReturnType<ReturnType<typeof createRenderer>>, title: string): number {
  const row = app.lines.findIndex((line) => line.includes(title))
  expect(row, `row containing "${title}"`).toBeGreaterThanOrEqual(0)
  return app.lines[row]!.indexOf(title)
}

describe("DocumentView heading marker gutter", () => {
  test.each([
    { id: "heading", kind: "heading", level: 2, content: "Embedded heading" },
    { id: "paragraph", kind: "paragraph", content: "Embedded paragraph" },
    {
      id: "item",
      kind: "list-item",
      content: "Embedded item",
      list: { groupId: "g", depth: 0, ordered: false },
    },
    { id: "quote", kind: "quote", content: "Embedded quote" },
    { id: "code", kind: "code", content: "Embedded code" },
    { id: "table", kind: "table", headers: ["Embedded table"], rows: [["value"]] },
    { id: "rule", kind: "rule" },
    { id: "extension", kind: "extension", token: "custom", content: "Embedded extension" },
    { id: "media", kind: "media", content: <Text>Embedded media</Text> },
  ] satisfies DocumentBlock[])(
    "every embedded $kind gets the shared region tint and source marker",
    (block) => {
      const render = createRenderer({ cols: 60, rows: 12 })
      const app = render(<DocumentView blocks={[{ ...block, embed: { source: "source.md" } }]} />)
      expect(app.text).toContain("→")
      const row = app.lines.findIndex((line) =>
        line.includes(block.kind === "rule" ? "─" : "Embedded"),
      )
      expect(row).toBeGreaterThanOrEqual(0)
      const expected = createRenderer({ cols: 1, rows: 1 })(
        <Text backgroundColor="mix($fg-link, $bg, 95%)">x</Text>,
      )
      // The whole lane, not just the inline title or a padded child, is tinted.
      expect(app.cell(8, row).bg).toEqual(expected.cell(0, 0).bg)
      expect(app.cell(50, row).bg).toEqual(expected.cell(0, 0).bg)
      const frame = app.locator(`#${block.id}`).boundingBox()!
      const markerRow = app.lines.findIndex((line) => line.includes("→"))
      expect(app.lines[markerRow]!.indexOf("→")).toBe(frame.x + frame.width - 1)
    },
  )

  test("embed source hover preserves task markers, geometry, and selection priority", async () => {
    const blocks: DocumentBlock[] = [
      {
        id: "task-embed",
        kind: "heading",
        level: 2,
        content: "Task title",
        marker: <Text>◐</Text>,
        embed: { source: "notes.md#task" },
      },
      { id: "after-embed", kind: "paragraph", content: "Following prose" },
    ]
    const app = createRenderer({ cols: 60, rows: 12, autoRender: true })(
      <PopoverProvider>
        <DocumentView blocks={blocks} selectedId="task-embed" />
      </PopoverProvider>,
    )
    const row = app.lines.findIndex((line) => line.includes("Task title"))
    const column = app.lines[row]!.indexOf("Task title")
    expect(app.lines[row]).toContain("→")
    expect(app.lines[row]).toContain("◐ Task title")
    const expected = createRenderer({ cols: 1, rows: 1 })(
      <Text backgroundColor="$bg-selected">x</Text>,
    )
    expect(app.cell(column, row).bg).toEqual(expected.cell(0, 0).bg)
    const followingBox = app.locator("#after-embed").boundingBox()
    expect(app.text).not.toContain("notes.md#task")
    await app.hover(column, row)
    await new Promise((resolve) => setTimeout(resolve, 650))
    expect(app.text).toContain("notes.md#task")
    expect(app.lines.findIndex((line) => line.includes("Task title"))).toBe(row)
    expect(app.locator("#after-embed").boundingBox()).toEqual(followingBox)
  })

  test.each([48, 65, 72, 89, 90, 120])(
    "code preserves every character and right padding at %i columns",
    (cols) => {
      const source = "abcdefghijklmnopqrstuvwxyz_".repeat(5)
      const app = createRenderer({ cols, rows: 16 })(
        <DocumentView blocks={[{ id: "source", kind: "code", content: source }]} />,
      )
      const lines = app.lines.filter((line) => /[a-z_]/.test(line))
      expect(lines.map((line) => line.trim()).join("")).toBe(source)
      const codeStart = lines[0]!.indexOf("a")
      const firstRow = app.lines.indexOf(lines[0]!)
      const background = app.cell(codeStart, firstRow).bg
      let rightEdge = codeStart
      while (
        rightEdge + 1 < cols &&
        JSON.stringify(app.cell(rightEdge + 1, firstRow).bg) === JSON.stringify(background)
      ) {
        rightEdge++
      }
      for (const line of lines) {
        expect(line.slice(rightEdge - 1, rightEdge + 1)).toBe("  ")
      }
    },
  )

  test("code frames fill the prose lane even for a short line", () => {
    const app = createRenderer({ cols: 72, rows: 10 })(
      <DocumentView
        blocks={[
          { id: "prose", kind: "paragraph", content: "Normal prose" },
          { id: "source", kind: "code", content: "x" },
        ]}
      />,
    )
    const row = app.lines.findIndex((line) => line.trim() === "x")
    expect(row).toBeGreaterThanOrEqual(0)
    const x = app.lines[row]!.indexOf("x")
    expect(x).toBe(app.lines[0]!.indexOf("Normal prose"))
    const background = app.cell(x, row).bg
    expect(background).not.toBeNull()
    expect(app.cell(0, row).bg).toEqual(background)
    expect(app.cell(70, row).bg).toEqual(background)
    expect(app.cell(71, row).bg).not.toEqual(background)
  })

  test("auto-width tables keep the compact document gutters", () => {
    const app = createRenderer({ cols: 72, rows: 12 })(
      <DocumentView
        blocks={[
          { id: "prose", kind: "paragraph", content: "Normal prose" },
          {
            id: "table",
            kind: "table",
            lane: "auto",
            headers: ["Name", "Description"],
            rows: [["Sample", "A readable table"]],
          },
        ]}
      />,
    )
    const prose = app.locator("#prose").boundingBox()!
    const table = app.locator("#table").boundingBox()!
    expect(table.x).toBe(prose.x)
    expect(table.width).toBe(prose.width)
    expect(table.x).toBe(2)
    expect(table.x + table.width).toBe(71)
  })

  test.each([
    { metadata: false, firstLevel: 1 },
    { metadata: true, firstLevel: 1 },
    { metadata: false, firstLevel: 2 },
  ] as const)(
    "adds leading space to H1/H2 only after body content ($metadata, $firstLevel)",
    ({ metadata, firstLevel }) => {
      const blocks: DocumentBlock[] = [
        ...(metadata
          ? [{ id: "metadata", kind: "media" as const, content: <Text>Frontmatter</Text> }]
          : []),
        { id: "title", kind: "heading", level: firstLevel, content: "Opening heading" },
        {
          id: "heading-after-heading",
          kind: "heading",
          level: 2,
          content: "Heading after heading",
        },
        { id: "opening", kind: "paragraph", content: "Opening prose" },
        { id: "section", kind: "heading", level: 2, content: "Second-level section" },
        { id: "section-body", kind: "paragraph", content: "Section prose" },
        { id: "later-title", kind: "heading", level: 1, content: "Later first-level heading" },
        { id: "later-body", kind: "paragraph", content: "Later prose" },
        { id: "subsection", kind: "heading", level: 3, content: "Third-level subsection" },
        {
          id: "last-item",
          kind: "list-item",
          list: { groupId: "items", depth: 0, ordered: false },
          content: "Last list item",
        },
        { id: "after-list", kind: "heading", level: 2, content: "Section after list" },
        { id: "divider", kind: "rule" },
        { id: "after-rule", kind: "heading", level: 2, content: "Section after rule" },
        { id: "inline-media", kind: "media", content: <Text>Media content</Text> },
        { id: "after-media", kind: "heading", level: 1, content: "Title after media" },
      ]
      const app = createRenderer({ cols: 72, rows: 48 })(<DocumentView blocks={blocks} />)
      const row = (text: string) => {
        const index = app.lines.findIndex((line) => line.includes(text))
        expect(index, `row containing ${text}`).toBeGreaterThanOrEqual(0)
        return index
      }
      expect(row("Opening heading")).toBe(metadata ? row("Frontmatter") + 2 : 0)
      expect(row("Heading after heading") - row("Opening heading")).toBe(2)
      expect(row("Second-level section") - row("Opening prose")).toBe(3)
      expect(row("Later first-level heading") - row("Section prose")).toBe(3)
      expect(row("Third-level subsection") - row("Later prose")).toBe(2)
      expect(row("Section after list") - row("Last list item")).toBe(3)
      expect(row("Section after rule") - row("─")).toBe(2)
      expect(row("Title after media") - row("Media content")).toBe(2)
    },
  )

  test("the marker hangs to the LEFT of the title column, with a visible gap between them", () => {
    const blocks: DocumentBlock[] = [
      {
        id: "h",
        kind: "heading",
        level: 3,
        content: "PHASE 3a — Git and Yrd",
        marker: <Text color="$fg-warning">◐</Text>,
      } satisfies DocumentHeadingBlock,
    ]
    const app = createRenderer({ cols: 72, rows: 8 })(<DocumentView blocks={blocks} />)
    const row = app.lines.findIndex((line) => line.includes("PHASE 3a"))
    expect(row).toBeGreaterThanOrEqual(0)
    const line = app.lines[row]!
    const markerColumn = line.indexOf("◐")
    const titleColumnIndex = line.indexOf("PHASE 3a")
    expect(markerColumn).toBeGreaterThanOrEqual(0)
    // Hanging indent: the glyph sits in the margin, strictly left of the
    // title's own column.
    expect(markerColumn).toBeLessThan(titleColumnIndex)
    // The operator-required gap: at least one blank cell between the glyph
    // and the title — "◐PHASE 3a" (glued, rev 2's first cut) fails this.
    expect(titleColumnIndex - markerColumn).toBeGreaterThanOrEqual(2)
    expect(line.slice(markerColumn + 1, titleColumnIndex)).toBe(
      " ".repeat(titleColumnIndex - markerColumn - 1),
    )
  })

  test.each([
    [1, "$primary"],
    [2, "mix($primary, $fg, 50%)"],
    [3, "$fg"],
    [4, "$muted"],
    [5, "$muted"],
    [6, "$muted"],
  ] as const)(
    "level %i keeps task/title alignment and gives only non-task headings a subdued #",
    (level, foreground) => {
      const blocks: DocumentBlock[] = [
        {
          id: "task",
          kind: "heading",
          level,
          content: "PHASE 3a — Git and Yrd",
          marker: <Text color="$fg-warning">◐</Text>,
        } satisfies DocumentHeadingBlock,
        { id: "plain", kind: "heading", level, content: "PHASE 3b — Agent management" },
      ]
      const tokens = { fg: "#eeeeee", bg: "#202020" }
      const app = createRenderer({ cols: 72, rows: 10 })(
        <ThemeProvider tokens={tokens}>
          <DocumentView blocks={blocks} />
        </ThemeProvider>,
      )
      expect(titleColumn(app, "PHASE 3a")).toBe(titleColumn(app, "PHASE 3b"))
      const taskRow = app.lines.findIndex((line) => line.includes("PHASE 3a"))
      const plainRow = app.lines.findIndex((line) => line.includes("PHASE 3b"))
      const markerColumn = titleColumn(app, "PHASE 3b") - 2
      expect(app.lines[taskRow]).toContain("◐ PHASE 3a")
      expect(app.lines[taskRow]).not.toContain("#")
      expect(app.lines[plainRow]).toContain("# PHASE 3b")
      const expected = createRenderer({ cols: 1, rows: 1 })(
        <ThemeProvider tokens={tokens}>
          <Text color={`mix(${foreground}, $bg, 75%)`}>#</Text>
        </ThemeProvider>,
      )
      expect(app.cell(markerColumn, plainRow).fg).toEqual(expected.cell(0, 0).fg)
    },
  )

  test("a document with no heading markers renders byte-identical to the same document without the marker field", () => {
    const withoutField: DocumentBlock[] = [
      { id: "h", kind: "heading", level: 2, content: "Untasked section" },
      { id: "body", kind: "paragraph", content: "Body." },
    ]
    const withUndefinedMarker: DocumentBlock[] = [
      { id: "h", kind: "heading", level: 2, content: "Untasked section", marker: undefined },
      { id: "body", kind: "paragraph", content: "Body." },
    ]
    const cols = 60
    const rows = 8
    const a = createRenderer({ cols, rows })(<DocumentView blocks={withoutField} />)
    const b = createRenderer({ cols, rows })(<DocumentView blocks={withUndefinedMarker} />)
    expect(b.text).toBe(a.text)
  })

  test("a marked heading's title lands on the SAME column as the identical heading in a fully marker-less document", () => {
    // The invariant rev 2's per-heading paddingLeft trade explicitly gave
    // up (documented there as operator-approved at the time). Raising the
    // shared gutter floor instead — this revision — restores it for free:
    // nothing about the marked document's OWN geometry differs from the
    // marker-less one's, at any width, because both now use the identical
    // DOCUMENT_MIN_GUTTER floor regardless of whether a marker is present
    // anywhere in the document.
    for (const cols of [40, 60, 82, 120, 200]) {
      const unmarked: DocumentBlock[] = [
        { id: "h", kind: "heading", level: 2, content: "Section Title" },
      ]
      const marked: DocumentBlock[] = [
        {
          id: "h",
          kind: "heading",
          level: 2,
          content: "Section Title",
          marker: <Text color="$fg-warning">◐</Text>,
        } satisfies DocumentHeadingBlock,
      ]
      const unmarkedApp = createRenderer({ cols, rows: 8 })(
        <Content.Layout fill={false} prose={80} wide={120}>
          <DocumentView blocks={unmarked} />
        </Content.Layout>,
      )
      const markedApp = createRenderer({ cols, rows: 8 })(
        <Content.Layout fill={false} prose={80} wide={120}>
          <DocumentView blocks={marked} />
        </Content.Layout>,
      )
      expect(titleColumn(markedApp, "Section Title"), `cols=${cols}`).toBe(
        titleColumn(unmarkedApp, "Section Title"),
      )
    }
  })

  test("title column is width-independent WITHIN a marker-bearing document — task heading matches non-task heading and its own paragraph, at any width", () => {
    // km-tui's DetailView wraps KNodeDocumentView in <Content.Layout prose={80}
    // wide={120}>. Both within-document invariants must hold from a narrow
    // split pane up through a wide terminal, never just in the generous case.
    for (const cols of [40, 60, 82, 120, 200]) {
      const blocks: DocumentBlock[] = [
        {
          id: "task",
          kind: "heading",
          level: 3,
          content: "Task Section",
          marker: <Text color="$fg-warning">◐</Text>,
        } satisfies DocumentHeadingBlock,
        { id: "plain", kind: "heading", level: 3, content: "Plain Section" },
        { id: "body", kind: "paragraph", content: "Plain body text." },
      ]
      const app = createRenderer({ cols, rows: 10 })(
        <Content.Layout fill={false} prose={80} wide={120}>
          <DocumentView blocks={blocks} />
        </Content.Layout>,
      )
      expect(titleColumn(app, "Task Section"), `cols=${cols}`).toBe(
        titleColumn(app, "Plain Section"),
      )
      expect(titleColumn(app, "Task Section"), `cols=${cols}`).toBe(
        titleColumn(app, "Plain body text."),
      )
    }
  })

  test("the marker is visible WITH its gap at every width from a narrow split pane up through a wide terminal — no flush case", () => {
    // The bug this pins: a markerWidth+1 gutter reaching into ProseLane's
    // OLD (1-cell-floor) side gutter rendered ZERO visible glyph at cols
    // 40/60/70/82 under km-tui's prose={80} — the natural gutter pinched to
    // exactly 1 cell, one short of the 2 a "glyph + gap" gutter needs. This
    // revision raises the floor itself, so there is no pinch band left to
    // fall back from — the glyph AND its trailing gap must both be visible
    // at every width, with no narrower "marker glued to the title" case.
    for (const cols of [30, 40, 60, 70, 82, 90, 120, 200]) {
      const marked: DocumentBlock[] = [
        {
          id: "h",
          kind: "heading",
          level: 3,
          content: "Section Title",
          marker: <Text color="$fg-warning">◐</Text>,
        } satisfies DocumentHeadingBlock,
      ]
      const app = createRenderer({ cols, rows: 8 })(
        <Content.Layout fill={false} prose={80} wide={120}>
          <DocumentView blocks={marked} />
        </Content.Layout>,
      )
      expect(app.text, `cols=${cols}`).toContain("◐")
      const row = app.lines.findIndex((line) => line.includes("Section Title"))
      expect(row, `cols=${cols}`).toBeGreaterThanOrEqual(0)
      const line = app.lines[row]!
      const markerColumn = line.indexOf("◐")
      const titleColumnIndex = line.indexOf("Section Title")
      expect(titleColumnIndex - markerColumn, `cols=${cols}`).toBeGreaterThanOrEqual(2)
    }
  })

  test("every document reserves a 2-cell LEFT margin for the heading # and its gap, at any pane width", () => {
    // Operator: "we always make sure there's a 2-space column to the left
    // and right of text" — unconditional, not gated on whether this
    // particular document happens to use heading markers. A plain,
    // marker-free document must show the same 2-cell floor as a
    // marker-bearing one.
    for (const cols of [30, 40, 60, 70, 82, 90, 120, 200]) {
      const blocks: DocumentBlock[] = [
        { id: "h", kind: "heading", level: 2, content: "Plain Heading" },
      ]
      const app = createRenderer({ cols, rows: 8 })(
        <Content.Layout fill={false} prose={80} wide={120}>
          <DocumentView blocks={blocks} />
        </Content.Layout>,
      )
      const row = app.lines.findIndex((line) => line.includes("Plain Heading"))
      expect(row, `cols=${cols}`).toBeGreaterThanOrEqual(0)
      expect(titleColumn(app, "Plain Heading"), `cols=${cols}`).toBeGreaterThanOrEqual(2)
      const titleStart = titleColumn(app, "Plain Heading")
      expect(app.cell(titleStart - 2, row).char, `cols=${cols} outdented marker`).toBe("#")
      expect(app.cell(titleStart - 1, row).char, `cols=${cols} marker gap`).toBe(" ")
    }
  })

  test("compact prose keeps only its marker gutter and one trailing cell below md", () => {
    for (const cols of [40, 60, 82, 89]) {
      const content = Array.from({ length: 200 }, () => "y").join(" ")
      const blocks: DocumentBlock[] = [{ id: "p", kind: "paragraph", content }]
      const app = createRenderer({ cols, rows: 20 })(
        <Content.Layout fill={false} prose={80} wide={120}>
          <DocumentView blocks={blocks} />
        </Content.Layout>,
      )
      expect(app.locator("#p").boundingBox(), `cols=${cols}`).toMatchObject({
        x: 2,
        width: cols - 3,
      })
      expect(app.cell(cols - 1, 0).char).toBe(" ")
    }
  })
})
