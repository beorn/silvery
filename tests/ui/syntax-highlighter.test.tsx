import React from "react"
import { describe, expect, test, vi } from "vitest"
import { createRenderer } from "@silvery/test"
import { highlight } from "@silvery/syntax"
import {
  Box,
  ScrollArea,
  SearchProvider,
  SyntaxHighlighter,
  Text,
  type SearchContextValue,
  useScrollController,
  useSearch,
} from "@silvery/ag-react"

describe("SyntaxHighlighter", () => {
  test.each([false, true])(
    "blends syntax tokens halfway toward the code foreground (search=%s)",
    async (searchable) => {
      const code = "const answer = 42"
      function Source() {
        const controller = useScrollController()
        return (
          <SyntaxHighlighter
            language="typescript"
            code={code}
            bare
            search={searchable ? { id: "source", scrollController: controller } : undefined}
          />
        )
      }
      const render = createRenderer({ cols: 48, rows: 8, autoRender: true })
      const app = render(
        <SearchProvider>
          <Source />
        </SearchProvider>,
      )

      expect(app.text).toContain(code)
      const plainForeground = createRenderer({ cols: 1, rows: 1 })(
        <Text color="mix($fg, $fg-muted, 50%)">x</Text>,
      ).cell(0, 0).fg
      const highlighted = await highlight(code, "typescript", "github-dark")
      const keyword = highlighted[0]?.tokens.find((token) => token.text.includes("const"))
      if (!keyword?.color) throw new Error("TypeScript fixture did not produce a colored keyword")
      const expectedForeground = createRenderer({ cols: 1, rows: 1 })(
        <Text color={`mix(${keyword.color}, mix($fg, $fg-muted, 50%), 50%)`}>x</Text>,
      ).cell(0, 0).fg
      expect(expectedForeground).not.toEqual(plainForeground)
      await vi.waitFor(
        () => {
          const row = app.lines.findIndex((line) => line.includes("const answer"))
          const column = app.lines[row]?.indexOf("const") ?? -1
          expect(row).toBeGreaterThanOrEqual(0)
          expect(column).toBeGreaterThanOrEqual(0)
          expect(app.cell(column, row).fg).not.toBeNull()
          expect(app.cell(column, row).fg).toEqual(expectedForeground)
        },
        { timeout: 5_000 },
      )
    },
  )

  test("shows its faint hover label in the padding row without covering code", async () => {
    const code = "const answer = 42"
    const app = createRenderer({ cols: 48, rows: 8, autoRender: true })(
      <SyntaxHighlighter language="typescript" code={code} />,
    )
    expect(app.text).not.toContain("typescript")
    await app.hover(3, 1)
    const labelRow = app.lines.findIndex((line) => line.includes("typescript"))
    const codeRow = app.lines.findIndex((line) => line.includes(code))
    expect(labelRow).toBe(0)
    expect(codeRow).toBe(1)
    const labelColumn = app.lines[labelRow]!.indexOf("typescript")
    const expected = createRenderer({ cols: 1, rows: 1 })(
      <Text color="mix($fg-faint, $bg, 50%)">x</Text>,
    )
    expect(app.cell(labelColumn, labelRow).fg).toEqual(expected.cell(0, 0).fg)
  })

  test("keeps the unconfigured render byte-identical", () => {
    const render = createRenderer({ cols: 80, rows: 8 })
    const code = "const first = true\nconst second = true"

    expect(render(<SyntaxHighlighter language="typescript" code={code} bare />).text).toBe(code)
  })

  test("registers source search and reveals matches by measured wrapped-line origins", async () => {
    const code = Array.from({ length: 18 }, (_, index) =>
      index === 15 ? "const uniqueNeedle = true" : `const row${index} = "${"x".repeat(72)}"`,
    ).join("\n")
    let search: SearchContextValue | null = null
    let observedOffset = 0

    function Inspector() {
      search = useSearch()
      return null
    }

    function SearchableSource() {
      const controller = useScrollController()
      observedOffset = controller.scrollOffset
      return (
        <Box width={40} height={6} flexDirection="column">
          <ScrollArea controller={controller}>
            <SyntaxHighlighter
              language="typescript"
              code={code}
              bare
              search={{ id: "source", scrollController: controller }}
            />
          </ScrollArea>
        </Box>
      )
    }

    const render = createRenderer({ cols: 40, rows: 6, autoRender: true })
    render(
      <SearchProvider>
        <Inspector />
        <SearchableSource />
      </SearchProvider>,
    )

    search!.open()
    for (const char of "uniqueNeedle") search!.input(char)

    await vi.waitFor(() => {
      expect(search!.matches).toEqual([{ row: 15, startCol: 6, endCol: 18 }])
      expect(observedOffset).toBeGreaterThan(15)
    })
  })
})
