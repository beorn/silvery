/**
 * @failure  Markdown tables render as a fully boxed grid: outer borders,
 *           vertical cell borders, and junction glyphs overpower prose.
 * @invariant Document tables keep one shared track geometry while presenting
 *            only an emphasized header and faint horizontal row separators.
 * @level     l3 — rendered cells prove glyphs and semantic token resolution.
 */

import React from "react"
import { describe, expect, test, vi } from "vitest"
import { parseColor } from "@silvery/ag-term/pipeline/render-helpers"
import { createRenderer } from "@silvery/test"
import { Box } from "../src/components/Box"
import { Text } from "../src/components/Text"
import { Content } from "../src/ui/components/Content"

function resolveRgb(color: string): { r: number; g: number; b: number } {
  const resolved = parseColor(color)
  if (resolved === null || typeof resolved === "number") {
    throw new Error(`expected ${color} to resolve to RGB, got ${JSON.stringify(resolved)}`)
  }
  return resolved
}

function renderDocumentTable() {
  const render = createRenderer({ cols: 80, rows: 20 })
  return render(
    <Box width={80} flexDirection="column">
      <Content.Layout fill={false} prose={80} wide={120}>
        <Content.Row>
          <Content.Body width="auto">
            <Content.Table
              headers={["Name", "Role"]}
              rows={[
                ["Alice", "writer"],
                ["Bob", "reader"],
              ]}
            />
          </Content.Body>
        </Content.Row>
      </Content.Layout>
    </Box>,
  )
}

function parentRect(
  app: ReturnType<ReturnType<typeof createRenderer>>,
  text: string,
): { x: number; y: number; width: number; height: number } {
  const cell = app.getByText(text).first().resolve()?.parent
  if (cell?.boxRect === null || cell?.boxRect === undefined) {
    throw new Error(`expected a measured table cell for ${JSON.stringify(text)}`)
  }
  return cell.boxRect
}

describe("Content.Table document presentation (@km/tui/22807)", () => {
  test("keeps blank header labels distinct from column identity", () => {
    const consoleErrors: unknown[][] = []
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation((...args: unknown[]) => consoleErrors.push(args))

    try {
      const render = createRenderer({ cols: 80, rows: 20 })
      const app = render(<Content.Table headers={["", ""]} rows={[["left", "right"]]} />)

      expect(app.text).toContain("left")
      expect(app.text).toContain("right")
      expect(
        consoleErrors.filter(([message]) =>
          String(message).includes("Encountered two children with the same key"),
        ),
      ).toEqual([])
    } finally {
      consoleError.mockRestore()
    }
  })

  test("uses an emphasized header and faint row rules without a box or junctions", () => {
    const app = renderDocumentTable()
    const visibleLines = app.lines.filter((line) => line.trim().length > 0)

    expect(visibleLines[0]).toContain("Name")
    expect(visibleLines.at(-1)).toContain("Bob")
    expect(app.text).not.toMatch(/[│┌┬┐├┼┤└┴┘]/u)

    const ruleRows = app.lines
      .map((line, row) => ({ line, row }))
      .filter(({ line }) => line.includes("─"))
    expect(ruleRows).toHaveLength(2)

    const faintRule = resolveRgb("$border-muted")
    for (const { line, row } of ruleRows) {
      const ruleColumns = [...line].flatMap((char, column) => (char === "─" ? [column] : []))
      expect(ruleColumns.length).toBeGreaterThan(0)
      for (const column of ruleColumns) expect(app.cell(column, row).fg).toEqual(faintRule)
    }

    const headerRow = app.lines.findIndex((line) => line.includes("Name"))
    const headerColumn = app.lines[headerRow]!.indexOf("Name")
    expect(app.cell(headerColumn, headerRow).bold).toBe(true)
  })

  test("keeps one measured track geometry across Unicode cell shapes", () => {
    const render = createRenderer({ cols: 80, rows: 20 })
    const glyphs = ["ab", "🚀", "中文", "e\u0301", "👨‍👩‍👧"]
    const app = render(
      <Content.Table
        headers={["Kind", "Glyph", "Tail"]}
        rows={glyphs.map((glyph, index) => [`row-${index}`, glyph, `end-${index}`])}
      />,
    )

    const glyphCells = glyphs.map((glyph) => parentRect(app, glyph))
    const tailCells = glyphs.map((_, index) => parentRect(app, `end-${index}`))

    expect(new Set(glyphCells.map(({ x }) => x)).size).toBe(1)
    expect(new Set(glyphCells.map(({ width }) => width)).size).toBe(1)
    expect(new Set(tailCells.map(({ x }) => x)).size).toBe(1)
  })

  test("renders a { text, node } cell as its node, not as its text", () => {
    const label = "@i/29-buckets"
    const render = createRenderer({ cols: 80, rows: 20 })
    const app = render(
      <Content.Table
        headers={["Link", "Note"]}
        rows={[
          [
            {
              text: label,
              node: (
                <Text bold color="$fg-accent">
                  {label}
                </Text>
              ),
            },
            "inline",
          ],
        ]}
      />,
    )
    const rect = app.getByText(label).first().resolve()?.boxRect
    if (rect === null || rect === undefined) {
      throw new Error(`expected a measured cell for ${JSON.stringify(label)}`)
    }
    const painted = app.cell(rect.x, rect.y)

    expect(painted.bold).toBe(true)
    expect(painted.fg).toEqual(resolveRgb("$fg-accent"))

    // Control: the identical table built from the plain string paints neither.
    const plainRender = createRenderer({ cols: 80, rows: 20 })
    const plain = plainRender(
      <Content.Table headers={["Link", "Note"]} rows={[[label, "inline"]]} />,
    )
    const plainRect = plain.getByText(label).first().resolve()?.boxRect
    if (plainRect === null || plainRect === undefined) {
      throw new Error(`expected a measured control cell for ${JSON.stringify(label)}`)
    }
    expect(plain.cell(plainRect.x, plainRect.y).bold).toBe(false)
  })
})
