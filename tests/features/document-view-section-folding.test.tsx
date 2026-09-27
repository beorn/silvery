/**
 * @failure Section headings do not show disclosure triangles on hover, or clicking/toggling them fails to fold/unfold sections.
 * @level l1
 * @consumer 25026 maddoc section folding on heading hover
 * @testonly none
 */

import React, { useState } from "react"
import { describe, expect, test } from "vitest"
import { createRenderer } from "@silvery/test"
import { DISCLOSURE_MARKERS, DocumentView, Text, type DocumentBlock } from "@silvery/ag-react"
import { HeadingRow } from "../../packages/ag-react/src/ui/components/HeadingRow"

describe("HeadingRow section folding disclosure", () => {
  test("foldable heading without hover shows no triangle", () => {
    const render = createRenderer({ cols: 60, rows: 5 })
    const app = render(
      <HeadingRow level={1} foldable={true} expanded={true}>
        <Text>Overview Section</Text>
      </HeadingRow>,
    )
    expect(app.text).toContain("Overview Section")
    expect(app.text).not.toContain(DISCLOSURE_MARKERS.expanded)
    expect(app.text).not.toContain(DISCLOSURE_MARKERS.collapsed)
  })

  test("foldable heading on hover shows expanded triangle when open", async () => {
    const render = createRenderer({ cols: 60, rows: 5 })
    const app = render(
      <HeadingRow level={1} foldable={true} expanded={true}>
        <Text>Overview Section</Text>
      </HeadingRow>,
    )
    // Find heading position and hover it
    const row = app.lines.findIndex((line) => line.includes("Overview Section"))
    expect(row).toBeGreaterThanOrEqual(0)
    const col = app.lines[row]!.indexOf("Overview Section")
    await app.hover(col + 2, row)

    expect(app.text).toContain("Overview Section")
    expect(app.text).toContain(DISCLOSURE_MARKERS.expanded)
    expect(app.text).not.toContain(DISCLOSURE_MARKERS.collapsed)
  })

  test("foldable heading on hover shows collapsed triangle when folded", async () => {
    const render = createRenderer({ cols: 60, rows: 5 })
    const app = render(
      <HeadingRow level={1} foldable={true} expanded={false}>
        <Text>Overview Section</Text>
      </HeadingRow>,
    )
    const row = app.lines.findIndex((line) => line.includes("Overview Section"))
    expect(row).toBeGreaterThanOrEqual(0)
    const col = app.lines[row]!.indexOf("Overview Section")
    await app.hover(col + 2, row)

    expect(app.text).toContain("Overview Section")
    expect(app.text).toContain(DISCLOSURE_MARKERS.collapsed)
    expect(app.text).not.toContain(DISCLOSURE_MARKERS.expanded)
  })

  test("non-foldable heading on hover never shows triangle", async () => {
    const render = createRenderer({ cols: 60, rows: 5 })
    const app = render(
      <HeadingRow level={1} foldable={false}>
        <Text>Leaf Heading</Text>
      </HeadingRow>,
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
      <HeadingRow
        level={1}
        foldable={true}
        expanded={true}
        onToggleFold={() => {
          toggled = true
        }}
      >
        <Text>Overview Section</Text>
      </HeadingRow>,
    )
    const row = app.lines.findIndex((line) => line.includes("Overview Section"))
    expect(row).toBeGreaterThanOrEqual(0)
    const col = app.lines[row]!.indexOf("Overview Section")
    await app.hover(col + 2, row)
    expect(app.text).toContain(DISCLOSURE_MARKERS.expanded)

    const triangleCol = app.lines[row]!.indexOf(DISCLOSURE_MARKERS.expanded)
    expect(triangleCol).toBeGreaterThan(col)
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

    // Hover over h1 (which is folded)
    const h1Row = app.lines.findIndex((line) => line.includes("First Section"))
    expect(h1Row).toBeGreaterThanOrEqual(0)
    const h1Col = app.lines[h1Row]!.indexOf("First Section")
    await app.hover(h1Col + 2, h1Row)

    // h1 is folded, so it should show collapsed marker on hover
    expect(app.text).toContain(DISCLOSURE_MARKERS.collapsed)

    const triangleCol = app.lines[h1Row]!.indexOf(DISCLOSURE_MARKERS.collapsed)
    await app.click(triangleCol, h1Row)

    expect(toggledId).toBe("h1")
  })
})
