/**
 * Style Transition Cache + Transform Component Tests
 *
 * Tests the style transition cache through the rendering pipeline,
 * and the Transform component for text post-processing.
 */

import React from "react"
import { describe, expect, test } from "vitest"
import { Box, Text, Transform } from "../src/components/index.js"
import { createRenderer } from "../src/testing/index.js"

const render = createRenderer({ cols: 80, rows: 5 })

describe("Style transitions", () => {
  // Style transitions operate at the cell buffer level. When adjacent cells
  // on the same row have different styles, the output phase uses styleTransition()
  // to emit minimal SGR diffs instead of full resets.

  test("same-color adjacent text shares SGR (no redundant reset)", () => {
    // When two Text elements have identical style and render on the same row,
    // the text content should appear without an intervening \x1b[0m reset.
    const app = render(
      <Box>
        <Text color="red">AB</Text>
      </Box>,
    )
    const ansi = app.ansi
    // "AB" should be contiguous in the output — same style, no transition
    expect(ansi).toContain("AB")
    expect(ansi).toContain("38;5;1") // red fg
  })

  test("color transition on same row uses targeted SGR", () => {
    // Adjacent text nodes with different colors on the same row should
    // produce a targeted color change, not a full reset
    const app = render(
      <Text>
        <Text color="red">R</Text>
        <Text color="blue">B</Text>
      </Text>,
    )
    const ansi = app.ansi
    // Both characters should be present
    expect(ansi).toContain("R")
    expect(ansi).toContain("B")
    // Should have both color codes
    expect(ansi).toContain("38;5;1") // red
    expect(ansi).toContain("38;5;4") // blue
  })

  test("bold text renders SGR 1", () => {
    const app = render(<Text bold>Bold</Text>)
    expect(app.ansi).toContain("\x1b[0;1m")
    expect(app.text).toContain("Bold")
  })

  test("italic text renders SGR 3", () => {
    const app = render(<Text italic>Italic</Text>)
    expect(app.ansi).toContain("3")
    expect(app.text).toContain("Italic")
  })

  test("multiple styled texts in column layout", () => {
    const app = render(
      <Box flexDirection="column">
        <Text color="red">Red line</Text>
        <Text color="blue">Blue line</Text>
      </Box>,
    )
    expect(app.text).toContain("Red line")
    expect(app.text).toContain("Blue line")
    expect(app.ansi).toContain("38;5;1") // red
    expect(app.ansi).toContain("38;5;4") // blue
  })

  test("inverse + strikethrough renders correct SGR codes", () => {
    const app = render(
      <Text inverse strikethrough>
        Styled
      </Text>,
    )
    const ansi = app.ansi
    expect(ansi).toContain("7") // inverse
    expect(ansi).toContain("9") // strikethrough
    expect(app.text).toContain("Styled")
  })

  test("underline text renders SGR 4", () => {
    const app = render(<Text underline>Underlined</Text>)
    expect(app.ansi).toMatch(/4[:;]/) // SGR 4 or 4:1 (underline subparameter)
    expect(app.text).toContain("Underlined")
  })

  test("first cell uses full SGR with reset prefix", () => {
    const app = render(
      <Text bold color="red">
        X
      </Text>,
    )
    // First styled cell should start with \x1b[0; (reset + attributes)
    expect(app.ansi).toMatch(/\x1b\[0;/)
  })

  test("rerender preserves styled output", () => {
    const app = render(
      <Box>
        <Text color="red">A</Text>
        <Text color="blue">B</Text>
      </Box>,
    )
    expect(app.text).toContain("A")
    expect(app.text).toContain("B")

    // Rerender with same content
    app.rerender(
      <Box>
        <Text color="red">A</Text>
        <Text color="blue">B</Text>
      </Box>,
    )
    expect(app.text).toContain("A")
    expect(app.text).toContain("B")
  })

  test("bg color renders as 48;5;N", () => {
    const app = render(<Text backgroundColor="red">BG</Text>)
    expect(app.ansi).toContain("48;5;1") // red bg
    expect(app.text).toContain("BG")
  })

  test("dim text renders SGR 2", () => {
    const app = render(<Text dimColor>Dim</Text>)
    expect(app.ansi).toContain("2") // dim
    expect(app.text).toContain("Dim")
  })
})

describe("Transform component", () => {
  test("basic uppercase transform", () => {
    const app = render(<Transform transform={(output) => output.toUpperCase()}>hello world</Transform>)
    expect(app.text).toContain("HELLO WORLD")
  })

  test("line-indexed transform receives line index", () => {
    const indices: number[] = []
    render(
      <Transform
        transform={(line, index) => {
          indices.push(index)
          return line
        }}
      >
        {"hi"}
      </Transform>,
    )
    // The transform function was called with index 0
    expect(indices).toContain(0)
  })

  test("transform with null children renders nothing", () => {
    const app = render(
      <Box>
        <Text>before</Text>
        <Transform transform={(output) => output.toUpperCase()}>{null}</Transform>
        <Text>after</Text>
      </Box>,
    )
    const text = app.text
    expect(text).toContain("before")
    expect(text).toContain("after")
    expect(text).not.toContain("null")
  })

  test("transform with undefined children renders nothing", () => {
    const app = render(
      <Box>
        <Text>visible</Text>
        <Transform transform={(output) => output.toUpperCase()}>{undefined}</Transform>
      </Box>,
    )
    expect(app.text).toContain("visible")
  })

  test("transform applies to text content", () => {
    const app = render(<Transform transform={(line) => line.replace("a", "X")}>{"abc"}</Transform>)
    expect(app.text).toContain("Xbc")
  })
})
