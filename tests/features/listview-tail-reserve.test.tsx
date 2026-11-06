import React from "react"
import { describe, expect, test } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, ListView, Text } from "@silvery/ag-react"

type FocusRow = {
  id: string
  lines: readonly string[]
}

const HISTORY = Array.from({ length: 12 }, (_, index): FocusRow => ({
  id: `history-${index}`,
  lines: [`history ${String(index).padStart(2, "0")}`],
}))

function focusRows(activeLineCount: number): FocusRow[] {
  return [
    ...HISTORY,
    {
      id: "active-tail",
      lines: Array.from({ length: activeLineCount }, (_, index) => `active tail ${index}`),
    },
  ]
}

function FocusTranscript({ activeLineCount }: { activeLineCount: number }): React.ReactElement {
  const items = focusRows(activeLineCount)
  return (
    <Box width={36} height={9} flexDirection="column">
      <ListView<FocusRow>
        items={items}
        height={9}
        follow="end"
        tailReserveRows="auto"
        getKey={(item) => item.id}
        estimateHeight={(index) => items[index]?.lines.length ?? 1}
        renderItem={(item) => (
          <Box flexDirection="column" flexShrink={0}>
            {item.lines.map((line) => (
              <Text key={line}>{line}</Text>
            ))}
          </Box>
        )}
      />
    </Box>
  )
}

async function settle(app: ReturnType<ReturnType<typeof createRenderer>>): Promise<void> {
  await app.waitForLayoutStable({ timeoutMs: 1000, maxPasses: 20 })
  await new Promise<void>((resolve) => setTimeout(resolve, 0))
}

function firstVisibleLine(lines: readonly string[]): string {
  const line = lines.find((candidate) => candidate.trim().length > 0)
  expect(line, lines.join("\n")).toBeDefined()
  return line!.trim()
}

function rowOf(lines: readonly string[], needle: string): number {
  return lines.findIndex((line) => line.includes(needle))
}

function trailingBlankRows(lines: readonly string[]): number {
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (lines[index]!.trim().length > 0) return lines.length - index - 1
  }
  return lines.length
}

describe("ListView follow=end tail reserve", () => {
  test("keeps the viewport origin stable when active-tail shrink fits the reserve", async () => {
    const render = createRenderer({ cols: 36, rows: 9 })
    const app = render(<FocusTranscript activeLineCount={5} />)
    await settle(app)

    const anchor = firstVisibleLine(app.lines)

    app.rerender(<FocusTranscript activeLineCount={3} />)
    await settle(app)

    expect(firstVisibleLine(app.lines), app.text).toBe(anchor)
  })

  test("consumes reserve before moving the viewport when the active focus tail grows", async () => {
    const render = createRenderer({ cols: 36, rows: 9 })
    const app = render(<FocusTranscript activeLineCount={1} />)
    await settle(app)

    const anchor = firstVisibleLine(app.lines)
    const anchorRow = rowOf(app.lines, anchor)

    app.rerender(<FocusTranscript activeLineCount={3} />)
    await settle(app)

    expect(rowOf(app.lines, anchor), app.text).toBe(anchorRow)
  })

  test("caps repeated active-tail shrink reserve to half the viewport", async () => {
    const render = createRenderer({ cols: 36, rows: 9 })
    const app = render(<FocusTranscript activeLineCount={9} />)
    await settle(app)

    for (const activeLineCount of [7, 5, 3, 1]) {
      app.rerender(<FocusTranscript activeLineCount={activeLineCount} />)
      await settle(app)
    }

    expect(trailingBlankRows(app.lines), app.text).toBeLessThanOrEqual(Math.ceil(9 / 2))
    expect(app.text).toContain("active tail 0")
  })
})
