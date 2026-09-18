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
})
