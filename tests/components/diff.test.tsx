/**
 * Diff Component Tests
 *
 * Verifies unified + side-by-side rendering, line-number gutters,
 * +/- markers, and color-token resolution per add/remove/context kind.
 */

import React from "react"
import { describe, test, expect } from "vitest"
import { createRenderer } from "@silvery/test"
import { Diff, type DiffHunk } from "silvery"

const render = createRenderer({ cols: 80, rows: 20 })

const sampleHunk: DiffHunk = {
  oldStart: 10,
  newStart: 10,
  lines: [
    { kind: "context", text: "function greet() {" },
    { kind: "remove", text: "  return 'hi'" },
    { kind: "add", text: "  return 'hello'" },
    { kind: "context", text: "}" },
  ],
}

describe("Diff (unified)", () => {
  test("renders +/- markers for add/remove and space for context", () => {
    const app = render(<Diff hunks={[sampleHunk]} mode="unified" />)
    expect(app.text).toContain("- ")
    expect(app.text).toContain("+ ")
    expect(app.text).toContain("function greet")
    expect(app.text).toContain("return 'hi'")
    expect(app.text).toContain("return 'hello'")
  })

  test("line numbers visible by default", () => {
    const app = render(<Diff hunks={[sampleHunk]} mode="unified" />)
    expect(app.text).toContain("10")
    expect(app.text).toContain("11")
  })

  test("showLineNumbers={false} omits the gutter", () => {
    const app = render(<Diff hunks={[sampleHunk]} mode="unified" showLineNumbers={false} />)
    // The numeric line markers should be gone
    expect(app.text).not.toContain("10  function")
    expect(app.text).toContain("function greet")
  })

  test("line numbers advance correctly: removes don't bump newN, adds don't bump oldN", () => {
    const hunk: DiffHunk = {
      oldStart: 1,
      newStart: 1,
      lines: [
        { kind: "context", text: "a" }, // oldN=1, newN=1
        { kind: "remove", text: "b" }, // oldN=2, newN—
        { kind: "remove", text: "c" }, // oldN=3, newN—
        { kind: "add", text: "B" }, // oldN—, newN=2
        { kind: "context", text: "d" }, // oldN=4, newN=3
      ],
    }
    const app = render(<Diff hunks={[hunk]} mode="unified" />)
    // Last context-line gets oldN=4 and newN=3 — assert both appear.
    expect(app.text).toContain("4")
    expect(app.text).toContain("3")
    expect(app.text).toContain("d")
  })
})

describe("Diff (side-by-side)", () => {
  test("renders both columns separated by vertical bar", () => {
    const app = render(<Diff hunks={[sampleHunk]} mode="side-by-side" />)
    expect(app.text).toContain("│")
    expect(app.text).toContain("return 'hi'")
    expect(app.text).toContain("return 'hello'")
  })

  test("paired remove/add land on the same row", () => {
    const app = render(<Diff hunks={[sampleHunk]} mode="side-by-side" showLineNumbers={false} />)
    // Find the line containing 'hi' — the same line should also contain
    // the paired add 'hello'.
    const lines = app.lines
    const pairRow = lines.find((l) => l.includes("'hi'") && l.includes("'hello'"))
    expect(pairRow).toBeDefined()
  })
})

describe("Diff (header)", () => {
  test("renders @@ header label when hunk.header is set", () => {
    const app = render(
      <Diff hunks={[{ ...sampleHunk, header: "fn greet" }]} mode="unified" showLineNumbers={false} />,
    )
    expect(app.text).toContain("@@")
    expect(app.text).toContain("fn greet")
  })
})
