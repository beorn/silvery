/**
 * Document style precedence.
 *
 * Structural foreground and selection background are stronger semantic
 * layers than inline-element styling. Links remain un-underlined by default.
 */

import React from "react"
import { describe, expect, test } from "vitest"
import { createRenderer } from "@silvery/test"
import { Code, DocumentView, Text, type DocumentBlock } from "@silvery/ag-react"

function cellAt(
  app: ReturnType<ReturnType<typeof createRenderer>>,
  text: string,
): ReturnType<typeof app.cell> {
  const row = app.lines.findIndex((line) => line.includes(text))
  const column = app.lines[row]?.indexOf(text) ?? -1
  expect(row, `row containing ${text}`).toBeGreaterThanOrEqual(0)
  expect(column, `column containing ${text}`).toBeGreaterThanOrEqual(0)
  return app.cell(column, row)
}

describe("DocumentView style precedence", () => {
  test("structural foreground beats link color without adding an underline", () => {
    const blocks: DocumentBlock[] = [
      {
        id: "heading",
        kind: "heading",
        level: 2,
        content: (
          <>
            Heading <Text variant="link">linked-span</Text>
          </>
        ),
      },
    ]
    const render = createRenderer({ cols: 60, rows: 8 })
    const app = render(<DocumentView blocks={blocks} />)

    expect(cellAt(app, "linked-span").fg).toEqual(cellAt(app, "Heading").fg)
    expect(cellAt(app, "linked-span").underline).toBe(false)
  })

  test("selected background beats inline code background", () => {
    const blocks: DocumentBlock[] = [
      {
        id: "selected",
        kind: "paragraph",
        content: (
          <>
            plain-span <Code>code-span</Code>
          </>
        ),
      },
    ]
    const render = createRenderer({ cols: 60, rows: 8 })
    const app = render(<DocumentView blocks={blocks} selectedId="selected" />)

    expect(cellAt(app, "code-span").bg).toEqual(cellAt(app, "plain-span").bg)
  })

  test("block.color styles heading and list-item foreground, yielding to selection", () => {
    const blocks: DocumentBlock[] = [
      {
        id: "muted-heading",
        kind: "heading",
        level: 2,
        color: "$fg-muted",
        content: "Muted heading",
      },
      {
        id: "muted-item",
        kind: "list-item",
        list: { groupId: "list", depth: 0, ordered: false },
        color: "$fg-muted",
        content: "Muted item",
      },
      {
        id: "selected-heading",
        kind: "heading",
        level: 2,
        color: "$fg-muted",
        content: "Selected heading",
      },
    ]
    const render = createRenderer({ cols: 60, rows: 10 })
    const app = render(<DocumentView blocks={blocks} selectedId="selected-heading" />)

    const mutedCell = createRenderer({ cols: 1, rows: 1 })(<Text color="$fg-muted">x</Text>).cell(
      0,
      0,
    )
    const selectedCell = createRenderer({ cols: 1, rows: 1 })(
      <Text color="$fg-on-selected">x</Text>,
    ).cell(0, 0)

    expect(cellAt(app, "Muted heading").fg).toEqual(mutedCell.fg)
    expect(cellAt(app, "Muted item").fg).toEqual(mutedCell.fg)
    expect(cellAt(app, "Selected heading").fg).toEqual(selectedCell.fg)
  })
})
