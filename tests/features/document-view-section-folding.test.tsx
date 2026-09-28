/**
 * @failure Section headings do not show disclosure triangles on hover, or clicking/toggling them fails to fold/unfold sections.
 * @level l1
 * @consumer 25026 maddoc section folding on heading hover
 * @testonly none
 */

import React, { useState } from "react"
import { describe, expect, test } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, DISCLOSURE_MARKERS, DocumentView, Text, type DocumentBlock } from "@silvery/ag-react"
import { HeadingRow } from "../../packages/ag-react/src/ui/components/HeadingRow"

describe("HeadingRow section folding disclosure", () => {
  test("foldable heading without hover shows no triangle when open", () => {
    const render = createRenderer({ cols: 60, rows: 5 })
    const app = render(
      <Box paddingLeft={4}>
        <HeadingRow level={1} foldable={true} expanded={true}>
          <Text>Overview Section</Text>
        </HeadingRow>
      </Box>,
    )
    expect(app.text).toContain("Overview Section")
    expect(app.text).toContain("#")
    expect(app.text).not.toContain(DISCLOSURE_MARKERS.expanded)
    expect(app.text).not.toContain(DISCLOSURE_MARKERS.collapsed)
  })

  test("foldable heading when folded always shows collapsed triangle without hover", () => {
    const render = createRenderer({ cols: 60, rows: 5 })
    const app = render(
      <Box paddingLeft={4}>
        <HeadingRow level={1} foldable={true} expanded={false}>
          <Text>Overview Section</Text>
        </HeadingRow>
      </Box>,
    )
    expect(app.text).toContain("Overview Section")
    expect(app.text).toContain(DISCLOSURE_MARKERS.collapsed)
    expect(app.text).not.toContain(DISCLOSURE_MARKERS.expanded)

    const row = app.lines.findIndex((line) => line.includes("Overview Section"))
    const titleCol = app.lines[row]!.indexOf("Overview Section")
    const hashCol = app.lines[row]!.indexOf("#")
    const triangleCol = app.lines[row]!.indexOf(DISCLOSURE_MARKERS.collapsed)

    // Triangle is to the left of '#' with one space between: <triangle> <space> # <space> <Title>
    expect(triangleCol).toBeLessThan(hashCol)
    expect(hashCol).toBeLessThan(titleCol)
    expect(hashCol - triangleCol).toBe(2)
  })

  test("foldable heading on hover shows expanded triangle when open", async () => {
    const render = createRenderer({ cols: 60, rows: 5 })
    const app = render(
      <Box paddingLeft={4}>
        <HeadingRow level={1} foldable={true} expanded={true}>
          <Text>Overview Section</Text>
        </HeadingRow>
      </Box>,
    )
    const row = app.lines.findIndex((line) => line.includes("Overview Section"))
    expect(row).toBeGreaterThanOrEqual(0)
    const col = app.lines[row]!.indexOf("Overview Section")
    await app.hover(col + 2, row)

    expect(app.text).toContain("Overview Section")
    expect(app.text).toContain(DISCLOSURE_MARKERS.expanded)
    expect(app.text).not.toContain(DISCLOSURE_MARKERS.collapsed)

    const titleCol = app.lines[row]!.indexOf("Overview Section")
    const hashCol = app.lines[row]!.indexOf("#")
    const triangleCol = app.lines[row]!.indexOf(DISCLOSURE_MARKERS.expanded)

    expect(triangleCol).toBeLessThan(hashCol)
    expect(hashCol).toBeLessThan(titleCol)
    expect(hashCol - triangleCol).toBe(2)
  })

  test("hovering margin to left of heading shows expanded triangle when open", async () => {
    const render = createRenderer({ cols: 60, rows: 5 })
    const app = render(
      <Box paddingLeft={4}>
        <HeadingRow level={1} foldable={true} expanded={true}>
          <Text>Overview Section</Text>
        </HeadingRow>
      </Box>,
    )
    const row = app.lines.findIndex((line) => line.includes("Overview Section"))
    expect(row).toBeGreaterThanOrEqual(0)
    // Hover at margin to the left of '#'
    await app.hover(0, row)

    expect(app.text).toContain("Overview Section")
    expect(app.text).toContain(DISCLOSURE_MARKERS.expanded)
  })

  test("non-foldable heading on hover never shows triangle", async () => {
    const render = createRenderer({ cols: 60, rows: 5 })
    const app = render(
      <Box paddingLeft={4}>
        <HeadingRow level={1} foldable={false}>
          <Text>Leaf Heading</Text>
        </HeadingRow>
      </Box>,
    )
    const row = app.lines.findIndex((line) => line.includes("Leaf Heading"))
    expect(row).toBeGreaterThanOrEqual(0)
    const col = app.lines[row]!.indexOf("Leaf Heading")
    await app.hover(col + 2, row)

    expect(app.text).toContain("Leaf Heading")
    expect(app.text).not.toContain(DISCLOSURE_MARKERS.expanded)
    expect(app.text).not.toContain(DISCLOSURE_MARKERS.collapsed)
  })

  test("clicking triangle calls onToggleFold", async () => {
    let toggled = false
    const render = createRenderer({ cols: 60, rows: 5 })
    const app = render(
      <Box paddingLeft={4}>
        <HeadingRow
          level={1}
          foldable={true}
          expanded={true}
          onToggleFold={() => {
            toggled = true
          }}
        >
          <Text>Overview Section</Text>
        </HeadingRow>
      </Box>,
    )
    const row = app.lines.findIndex((line) => line.includes("Overview Section"))
    expect(row).toBeGreaterThanOrEqual(0)
    const col = app.lines[row]!.indexOf("Overview Section")
    await app.hover(col + 2, row)
    expect(app.text).toContain(DISCLOSURE_MARKERS.expanded)

    const triangleCol = app.lines[row]!.indexOf(DISCLOSURE_MARKERS.expanded)
    expect(triangleCol).toBeLessThan(col)
    await app.click(triangleCol, row)
    expect(toggled).toBe(true)
  })
})

describe("DocumentView section folding integration", () => {
  const BLOCKS: DocumentBlock[] = [
    { id: "h1", kind: "heading", level: 1, content: "First Section", foldable: true },
    { id: "p1", kind: "paragraph", content: "Paragraph under first section" },
    { id: "h2", kind: "heading", level: 2, content: "Child Section", foldable: false },
  ]

  test("DocumentView passes foldedHeadingIds and triggers onToggleFoldHeading", async () => {
    let toggledId: string | null = null

    function TestApp() {
      const [folded, setFolded] = useState<ReadonlySet<string>>(new Set(["h1"]))
      return (
        <DocumentView
          blocks={BLOCKS}
          enableSectionFolding={true}
          foldedHeadingIds={folded}
          onToggleFoldHeading={(id) => {
            toggledId = id
            setFolded((prev) => {
              const next = new Set(prev)
              if (next.has(id)) next.delete(id)
              else next.add(id)
              return next
            })
          }}
        />
      )
    }

    const render = createRenderer({ cols: 60, rows: 10 })
    const app = render(<TestApp />)

    const h1Row = app.lines.findIndex((line) => line.includes("First Section"))
    expect(h1Row).toBeGreaterThanOrEqual(0)
    const h1Col = app.lines[h1Row]!.indexOf("First Section")
    const h1HashCol = app.lines[h1Row]!.indexOf("#")

    // h1 is folded, so it ALWAYS shows collapsed marker without hover
    expect(app.text).toContain(DISCLOSURE_MARKERS.collapsed)

    const triangleCol = app.lines[h1Row]!.indexOf(DISCLOSURE_MARKERS.collapsed)
    expect(triangleCol).toBeLessThan(h1HashCol)
    expect(h1HashCol).toBeLessThan(h1Col)
    expect(h1HashCol - triangleCol).toBe(2)

    // Non-foldable child heading aligns its '#' with parent's '#'
    const h2Row = app.lines.findIndex((line) => line.includes("Child Section"))
    expect(h2Row).toBeGreaterThanOrEqual(0)
    const h2HashCol = app.lines[h2Row]!.indexOf("#")
    expect(h2HashCol).toBe(h1HashCol)

    await app.click(triangleCol, h1Row)
    expect(toggledId).toBe("h1")
  })
})
