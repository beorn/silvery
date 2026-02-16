/**
 * Regression test: Text with wrap="truncate" must clear remaining width
 * when ANSI-styled content changes from longer to shorter text.
 *
 * Bug (km-axswu): When a Box with backgroundColor contains a Text with
 * wrap="truncate", and the text content includes ANSI codes and gets shorter
 * on re-render, stale characters from the previous render persist.
 */
import { describe, test, expect } from "vitest"
import React from "react"
import { Box, Text, createTerm } from "../src/index.js"
import { createRenderer } from "../src/testing/index.js"

const style = createTerm({ color: "truecolor" })

describe("Text truncate rerender - stale character clearing", () => {
  test("shorter text after rerender clears remaining characters", () => {
    const render = createRenderer({ cols: 40, rows: 3 })

    function App({ text }: { text: string }) {
      return (
        <Box width={40} backgroundColor="white">
          <Text wrap="truncate" color="black">
            {text}
          </Text>
        </Box>
      )
    }

    const app = render(<App text="ABCDEFGHIJKLMNOPQRSTUVWXYZ" />, { incremental: true })
    expect(app.text.trim()).toBe("ABCDEFGHIJKLMNOPQRSTUVWXYZ")

    app.rerender(<App text="SHORT" />)
    const line = app.text.split("\n")[0]!

    expect(line.trim()).toBe("SHORT")
    expect(line).not.toContain("GHIJ")
  })

  test("shorter ANSI text after rerender clears remaining characters", () => {
    const render = createRenderer({ cols: 50, rows: 3 })

    function App({ text }: { text: string }) {
      return (
        <Box width={50} backgroundColor="white">
          <Text wrap="truncate" color="gray">
            {text}
          </Text>
        </Box>
      )
    }

    const bold = style.gray.bold
    const dim = style.gray.dim

    const long = ` ${bold("board")}${dim(" / Next Actions / task-a")}`
    const short = ` ${bold("board")}${dim(" / Short / task-b")}`

    const app = render(<App text={long} />, { incremental: true })
    expect(app.text).toContain("Next Actions")

    app.rerender(<App text={short} />)
    const line = app.text.split("\n")[0]!

    expect(line).toContain("Short")
    expect(line).not.toContain("Next Actions")
    expect(line.trim()).toBe("board / Short / task-b")
  })

  test("emoji breadcrumb - shorter path clears stale characters", () => {
    const render = createRenderer({ cols: 80, rows: 3 })

    function TopBar({ text }: { text: string }) {
      return (
        <Box width={80} backgroundColor="white" flexShrink={0}>
          <Text wrap="truncate" color="gray">
            {text}
          </Text>
        </Box>
      )
    }

    const bold = style.gray.bold
    const dim = style.gray.dim

    // Simulating the exact breadcrumb pattern from board-top-bar.ts
    const longPath = ` ${dim("📁 ")}${bold("board")}${dim(" / LongColumnNameHere / task-a")}`
    const shortPath = ` ${dim("📁 ")}${bold("board")}${dim(" / Short / task-b")}`

    const app = render(<TopBar text={longPath} />, { incremental: true })
    expect(app.text).toContain("LongColumnNameHere")

    app.rerender(<TopBar text={shortPath} />)
    const line = app.text.split("\n")[0]!

    expect(line).toContain("Short")
    expect(line).not.toContain("LongColumnNameHere")
    expect(line).not.toContain("ColumnNameHere")
    // Verify clean trailing content
    const afterTaskB = line.indexOf("task-b") + "task-b".length
    if (afterTaskB > 0) {
      const trailing = line.slice(afterTaskB).trim()
      expect(trailing).toBe("")
    }
  })
})
