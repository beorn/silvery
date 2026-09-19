import React from "react"
import { describe, expect, test, vi } from "vitest"
import { createRenderer } from "@silvery/test"
import {
  Box,
  CodeBlock,
  ScrollArea,
  SearchProvider,
  SyntaxHighlighter,
  Text,
  useScrollController,
} from "@silvery/ag-react"

const REPRO_CODE = [
  "line one",
  "",
  "line three after one blank",
  "",
  "",
  "line six after two blanks",
].join("\n")

const REPRO2_CODE = [
  "line one",
  " ",
  "line three after a line holding one space",
  "",
  "line five after a truly empty line",
].join("\n")

describe("SyntaxHighlighter blank lines (bead 25017)", () => {
  test("CodeBlock children path preserves blank lines", () => {
    const render = createRenderer({ cols: 80, rows: 12 })
    const app = render(
      <Box width={80} flexDirection="column">
        <CodeBlock label="plain">{REPRO_CODE}</CodeBlock>
      </Box>,
    )

    const lines = app.lines.map((l) => l.trimEnd())
    const row1 = lines.findIndex((l) => l.includes("line one"))
    const row3 = lines.findIndex((l) => l.includes("line three after one blank"))
    const row6 = lines.findIndex((l) => l.includes("line six after two blanks"))

    expect(row1).toBeGreaterThanOrEqual(0)
    expect(row3).toBe(row1 + 2) // 1 blank line between row1 and row3
    expect(row6).toBe(row3 + 3) // 2 blank lines between row3 and row6
  })

  test("plain first frame preserves blank line row count", () => {
    const render = createRenderer({ cols: 80, rows: 12 })
    const app = render(
      <Box width={80} flexDirection="column">
        <SyntaxHighlighter language="plain" code={REPRO_CODE} bare />
      </Box>,
    )

    const lines = app.lines.map((l) => l.trimEnd())
    const row1 = lines.findIndex((l) => l.includes("line one"))
    const row3 = lines.findIndex((l) => l.includes("line three after one blank"))
    const row6 = lines.findIndex((l) => l.includes("line six after two blanks"))

    expect(row1).toBeGreaterThanOrEqual(0)
    expect(row3).toBe(row1 + 2)
    expect(row6).toBe(row3 + 3)
  })

  test("highlighted frame preserves blank line row count", async () => {
    const render = createRenderer({ cols: 80, rows: 12, autoRender: true })
    const app = render(
      <Box width={80} flexDirection="column">
        <SyntaxHighlighter language="typescript" code={REPRO_CODE} bare />
      </Box>,
    )

    await vi.waitFor(
      () => {
        const lines = app.lines.map((l) => l.trimEnd())
        const row1 = lines.findIndex((l) => l.includes("line one"))
        const row3 = lines.findIndex((l) => l.includes("line three after one blank"))
        const row6 = lines.findIndex((l) => l.includes("line six after two blanks"))

        expect(row1).toBeGreaterThanOrEqual(0)
        expect(row3).toBe(row1 + 2)
        expect(row6).toBe(row3 + 3)
      },
      { timeout: 5_000 },
    )
  })

  test("search path (SearchableSyntaxLines) preserves blank line row count and origins", async () => {
    function SearchableSource() {
      const controller = useScrollController()
      return (
        <Box width={80} height={12} flexDirection="column">
          <ScrollArea controller={controller}>
            <SyntaxHighlighter
              language="typescript"
              code={REPRO_CODE}
              bare
              search={{ id: "source", scrollController: controller }}
            />
          </ScrollArea>
        </Box>
      )
    }

    const render = createRenderer({ cols: 80, rows: 12, autoRender: true })
    const app = render(
      <SearchProvider>
        <SearchableSource />
      </SearchProvider>,
    )

    await vi.waitFor(
      () => {
        const lines = app.lines.map((l) => l.trimEnd())
        const row1 = lines.findIndex((l) => l.includes("line one"))
        const row3 = lines.findIndex((l) => l.includes("line three after one blank"))
        const row6 = lines.findIndex((l) => l.includes("line six after two blanks"))

        expect(row1).toBeGreaterThanOrEqual(0)
        expect(row3).toBe(row1 + 2)
        expect(row6).toBe(row3 + 3)
      },
      { timeout: 5_000 },
    )
  })

  test("repro 2: line holding one space keeps its row and truly empty line keeps its row without space", () => {
    const render = createRenderer({ cols: 80, rows: 12 })
    const app = render(
      <Box width={80} flexDirection="column">
        <SyntaxHighlighter language="plain" code={REPRO2_CODE} bare />
      </Box>,
    )

    const lines = app.lines
    const row1 = lines.findIndex((l) => l.includes("line one"))
    const row3 = lines.findIndex((l) => l.includes("line three after a line holding one space"))
    const row5 = lines.findIndex((l) => l.includes("line five after a truly empty line"))

    expect(row1).toBeGreaterThanOrEqual(0)
    expect(row3).toBe(row1 + 2) // row1 + 1 is the line holding one space
    expect(row5).toBe(row3 + 2) // row3 + 1 is the truly empty line

    // The truly empty line must NOT have spaces inserted
    const emptyRow = lines[row3 + 1]!
    expect(emptyRow).toBe("")
  })
})
