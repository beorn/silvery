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

  test("un-hovered fold triangle uses default marker color matching '#'", () => {
    const render = createRenderer({ cols: 60, rows: 5 })
    const app = render(
      <Box paddingLeft={4}>
        <HeadingRow level={1} foldable={true} expanded={false}>
          <Text>Overview Section</Text>
        </HeadingRow>
      </Box>,
    )
    const row = app.lines.findIndex((line) => line.includes("Overview Section"))
    expect(row).toBeGreaterThanOrEqual(0)
    const hashCol = app.lines[row]!.indexOf("#")
    const triangleCol = app.lines[row]!.indexOf(DISCLOSURE_MARKERS.collapsed)
    expect(triangleCol).toBeGreaterThanOrEqual(0)

    const triangleFg = app.cell(triangleCol, row).fg
    const hashFg = app.cell(hashCol, row).fg
    expect(triangleFg).toBeDefined()
    expect(triangleFg).toEqual(hashFg)
  })

  test("hovering fold triangle applies hover treatment (foreground and hover background)", async () => {
    const render = createRenderer({ cols: 60, rows: 5 })
    const app = render(
      <Box paddingLeft={4}>
        <HeadingRow level={1} foldable={true} expanded={false}>
          <Text>Overview Section</Text>
        </HeadingRow>
      </Box>,
    )
    const row = app.lines.findIndex((line) => line.includes("Overview Section"))
    expect(row).toBeGreaterThanOrEqual(0)
    const titleCol = app.lines[row]!.indexOf("Overview Section")
    const triangleCol = app.lines[row]!.indexOf(DISCLOSURE_MARKERS.collapsed)

    const unhoveredFg = app.cell(triangleCol, row).fg
    const titleFg = app.cell(titleCol, row).fg

    await app.hover(triangleCol, row)
    const hoveredFg = app.cell(triangleCol, row).fg
    const hoveredBg = app.cell(triangleCol, row).bg

    expect(hoveredBg).toBeDefined()
    expect(hoveredFg).toBeDefined()
    expect(hoveredFg).not.toEqual(unhoveredFg)
  })

  test("list item with sub-items folds and unfolds with disclosure triangle", async () => {
    let toggledId: string | null = null
    const BLOCKS: DocumentBlock[] = [
      {
        id: "item1",
        kind: "list-item",
        list: { groupId: "g1", depth: 0, ordered: false },
        content: "Foldable Parent Item",
        foldable: true,
      },
      {
        id: "child1",
        kind: "list-item",
        list: { groupId: "g2", depth: 1, ordered: false },
        content: "Child Item 1",
        foldable: false,
      },
      {
        id: "item2",
        kind: "list-item",
        list: { groupId: "g1", depth: 0, ordered: false },
        content: "Leaf Sibling Item",
        foldable: false,
      },
    ]

    function TestApp() {
      const [folded, setFolded] = useState<ReadonlySet<string>>(new Set(["item1"]))
      return (
        <DocumentView
          blocks={BLOCKS}
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

    const row = app.lines.findIndex((line) => line.includes("Foldable Parent Item"))
    expect(row).toBeGreaterThanOrEqual(0)
    const textCol = app.lines[row]!.indexOf("Foldable Parent Item")
    const bulletCol = app.lines[row]!.indexOf("•")
    const triangleCol = app.lines[row]!.indexOf(DISCLOSURE_MARKERS.collapsed)

    // Folded list item shows collapsed triangle
    expect(triangleCol).toBeGreaterThanOrEqual(0)
    expect(triangleCol).toBeLessThan(bulletCol)
    expect(bulletCol).toBeLessThan(textCol)

    // Sibling non-foldable list item aligns its bullet with parent's bullet
    const item2Row = app.lines.findIndex((line) => line.includes("Leaf Sibling Item"))
    expect(item2Row).toBeGreaterThanOrEqual(0)
    const item2BulletCol = app.lines[item2Row]!.indexOf("•")
    expect(item2BulletCol).toBe(bulletCol)

    // Hovering the fold triangle applies hover treatment
    await app.hover(triangleCol, row)
    expect(app.cell(triangleCol, row).bg).toBeDefined()

    // Clicking triangle toggles fold
    await app.click(triangleCol, row)
    expect(toggledId).toBe("item1")

    // Unhover row: expanded foldable item without hover hides triangle; bullet does not move
    await app.hover(0, 9)
    const unhoveredBulletCol = app.lines[row]!.indexOf("•")
    expect(unhoveredBulletCol).toBe(bulletCol)
    expect(app.lines[row]!.indexOf(DISCLOSURE_MARKERS.expanded)).toBe(-1)

    // Hover row: expanded foldable item reveals triangle; bullet column remains stable (no horizontal jitter)
    await app.hover(textCol, row)
    const hoveredBulletCol = app.lines[row]!.indexOf("•")
    expect(hoveredBulletCol).toBe(bulletCol)
    const expandedTriangleCol = app.lines[row]!.indexOf(DISCLOSURE_MARKERS.expanded)
    expect(expandedTriangleCol).toBe(triangleCol)
  })

  test("near-width task row with subtask summary does not re-wrap or shift subsequent blocks on hover", async () => {
    // 26997: hovering a near-width list-item or heading row must not wrap onto an extra line or shift following rows
    const listBlocks: DocumentBlock[] = [
      {
        id: "task-item",
        kind: "list-item",
        list: { groupId: "g", depth: 0, ordered: false },
        content: "Write the release notes for v2 now",
        foldable: false,
        subtaskSummary: { done: 2, total: 3 },
      },
      {
        id: "next-item",
        kind: "list-item",
        list: { groupId: "g", depth: 0, ordered: false },
        content: "NEXT ITEM",
        foldable: false,
      },
    ]

    const listRender = createRenderer({ cols: 40, rows: 10 })
    const listApp = listRender(<DocumentView blocks={listBlocks} />)

    const listTitleRow0 = listApp.lines.findIndex((l) => l.includes("Write the release"))
    const listNextRow0 = listApp.lines.findIndex((l) => l.includes("NEXT ITEM"))
    expect(listTitleRow0).toBeGreaterThanOrEqual(0)
    expect(listNextRow0).toBeGreaterThanOrEqual(0)
    expect(listApp.lines.some((l) => l.includes("67% (2/3)"))).toBe(false)

    // Hover list item
    await listApp.hover(listApp.lines[listTitleRow0]!.indexOf("Write"), listTitleRow0)
    const listTitleRow1 = listApp.lines.findIndex((l) => l.includes("Write the release"))
    const listNextRow1 = listApp.lines.findIndex((l) => l.includes("NEXT ITEM"))
    expect(listTitleRow1).toBe(listTitleRow0)
    expect(listNextRow1).toBe(listNextRow0)
    expect(listApp.lines.some((l) => l.includes("67% (2/3)"))).toBe(true)

    // Heading near-width test
    const headingBlocks: DocumentBlock[] = [
      {
        id: "task-heading",
        kind: "heading",
        level: 2,
        content: "Prepare the quarterly planning doc",
        subtaskSummary: { done: 1, total: 4 },
      },
      {
        id: "next-paragraph",
        kind: "paragraph",
        content: "BELOW HEADING",
      },
    ]

    const headingRender = createRenderer({ cols: 40, rows: 10 })
    const headingApp = headingRender(<DocumentView blocks={headingBlocks} />)

    const headingTitleRow0 = headingApp.lines.findIndex((l) => l.includes("Prepare the"))
    const headingBelowRow0 = headingApp.lines.findIndex((l) => l.includes("BELOW HEADING"))
    expect(headingTitleRow0).toBeGreaterThanOrEqual(0)
    expect(headingBelowRow0).toBeGreaterThanOrEqual(0)
    expect(headingApp.lines.some((l) => l.includes("25% (1/4)"))).toBe(false)

    // Hover heading
    await headingApp.hover(headingApp.lines[headingTitleRow0]!.indexOf("Prepare"), headingTitleRow0)
    const headingTitleRow1 = headingApp.lines.findIndex((l) => l.includes("Prepare the"))
    const headingBelowRow1 = headingApp.lines.findIndex((l) => l.includes("BELOW HEADING"))
    expect(headingTitleRow1).toBe(headingTitleRow0)
    expect(headingBelowRow1).toBe(headingBelowRow0)
    expect(headingApp.lines.some((l) => l.includes("25% (1/4)"))).toBe(true)
  })

  test("nested list items maintain strictly increasing bullet column across depths even when leaf items are in separate groups", () => {
    const BLOCKS: DocumentBlock[] = [
      {
        id: "l0",
        kind: "list-item",
        list: { groupId: "g0", depth: 0, ordered: false },
        content: "Level 0",
        foldable: true,
      },
      {
        id: "l1",
        kind: "list-item",
        list: { groupId: "g1", depth: 1, ordered: false },
        content: "Level 1",
        foldable: true,
      },
      {
        id: "l2",
        kind: "list-item",
        list: { groupId: "g2", depth: 2, ordered: false },
        content: "Level 2",
        foldable: true,
      },
      {
        id: "l3",
        kind: "list-item",
        list: { groupId: "g3", depth: 3, ordered: false },
        content: "Level 3 Leaf",
        foldable: false,
      },
    ]

    const render = createRenderer({ cols: 60, rows: 10 })
    const app = render(<DocumentView blocks={BLOCKS} />)

    let prevCol = -1
    for (const name of ["Level 0", "Level 1", "Level 2", "Level 3 Leaf"]) {
      const row = app.lines.findIndex((line) => line.includes(name))
      expect(row).toBeGreaterThanOrEqual(0)
      const bulletCol = app.lines[row]!.indexOf("•")
      expect(bulletCol, name).toBeGreaterThan(prevCol)
      prevCol = bulletCol
    }
  })

  test("unrelated non-foldable list items do not shift column when a foldable list exists elsewhere in the document", () => {
    const li = (id: string, g: string, content: string, foldable = false) => ({
      id,
      kind: "list-item" as const,
      list: { groupId: g, depth: 0, ordered: false },
      content,
      foldable,
    })
    const plain: DocumentBlock[] = [
      li("u1", "U", "Unrelated list item"),
      { id: "p", kind: "paragraph", content: "Some paragraph between lists" },
    ]
    const withFold: DocumentBlock[] = [
      ...plain,
      li("f1", "F", "Foldable task", true),
      li("f2", "F", "Sibling task"),
    ]

    const render = createRenderer({ cols: 60, rows: 10 })
    const appPlain = render(<DocumentView blocks={plain} />)
    const appWithFold = render(<DocumentView blocks={withFold} />)

    const rowPlain = appPlain.lines.findIndex((l) => l.includes("Unrelated list item"))
    const rowWithFold = appWithFold.lines.findIndex((l) => l.includes("Unrelated list item"))
    expect(rowPlain).toBeGreaterThanOrEqual(0)
    expect(rowWithFold).toBeGreaterThanOrEqual(0)

    const bulletPlain = appPlain.lines[rowPlain]!.indexOf("•")
    const bulletWithFold = appWithFold.lines[rowWithFold]!.indexOf("•")
    expect(bulletPlain).toBe(2)
    expect(bulletWithFold).toBe(2)
  })

  test("nested child item under foldable parent aligns bullet and keeps tree fold gutter", () => {
    const li = (id: string, g: string, content: string, foldable = false, depth = 0) => ({
      id,
      kind: "list-item" as const,
      list: { groupId: g, depth, ordered: false },
      content,
      foldable,
    })
    const nested: DocumentBlock[] = [
      li("p1", "P", "Foldable parent", true, 0),
      li("c1", "C", "Nested child", false, 1),
      li("p2", "P", "Parent sibling", false, 0),
    ]

    const render = createRenderer({ cols: 60, rows: 10 })
    const app = render(<DocumentView blocks={nested} />)

    const parentRow = app.lines.findIndex((l) => l.includes("Foldable parent"))
    const childRow = app.lines.findIndex((l) => l.includes("Nested child"))
    const siblingRow = app.lines.findIndex((l) => l.includes("Parent sibling"))

    expect(parentRow).toBeGreaterThanOrEqual(0)
    expect(childRow).toBeGreaterThanOrEqual(0)
    expect(siblingRow).toBeGreaterThanOrEqual(0)

    const parentBullet = app.lines[parentRow]!.indexOf("•")
    const childBullet = app.lines[childRow]!.indexOf("•")
    const siblingBullet = app.lines[siblingRow]!.indexOf("•")

    expect(parentBullet).toBe(4)
    expect(siblingBullet).toBe(4)
    expect(childBullet).toBe(6)
  })
})
