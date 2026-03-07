/**
 * Tests for the Transform component.
 *
 * Verifies:
 * - Basic text transformation (toUpperCase)
 * - Line-by-line transformation (line numbering)
 * - Index parameter is passed correctly
 * - Null/undefined children return null (no render output)
 * - Nested Text within Transform
 * - Transform with styled Text (bold, color)
 * - Empty string handling
 * - Claude Code API compatibility (transform with line + index)
 *
 * Key behaviors:
 * - Transform is applied AFTER layout/wrapping. The text node's layout width is
 *   computed from the original content, so transforms that increase width will
 *   have their output clipped to the original text node's bounding box.
 * - Transform receives the formatted text which may include ANSI escape codes
 *   when child Text elements have style props (bold, color, etc.). Transforms
 *   that modify character case (like toUpperCase) will corrupt ANSI codes.
 *   Use dimension-preserving transforms on unstyled text, or ANSI-aware
 *   transforms when styles are present.
 */

import React from "react"
import { describe, expect, test } from "vitest"
import { Box, Text, Transform } from "../src"
import { createRenderer } from "@hightea/term/testing"

describe("Transform", () => {
  // -------------------------------------------------------------------
  // Basic transforms (dimension-preserving, unstyled)
  // -------------------------------------------------------------------

  test("transforms text to uppercase", () => {
    const render = createRenderer({ cols: 40, rows: 5 })
    const app = render(
      <Transform transform={(line) => line.toUpperCase()}>
        <Text>hello world</Text>
      </Transform>,
    )
    expect(app.text).toContain("HELLO WORLD")
  })

  test("identity transform preserves content", () => {
    const render = createRenderer({ cols: 40, rows: 5 })
    const app = render(
      <Transform transform={(line) => line}>
        <Text>unchanged text</Text>
      </Transform>,
    )
    expect(app.text).toContain("unchanged text")
  })

  test("reverse transform", () => {
    const render = createRenderer({ cols: 40, rows: 5 })
    const app = render(
      <Transform transform={(line) => line.split("").reverse().join("")}>
        <Text>abcde</Text>
      </Transform>,
    )
    expect(app.text).toContain("edcba")
  })

  // -------------------------------------------------------------------
  // Multi-line and index parameter
  // -------------------------------------------------------------------

  test("passes correct index to transform function", () => {
    const indices: number[] = []
    const render = createRenderer({ cols: 40, rows: 5 })
    render(
      <Transform
        transform={(line, index) => {
          indices.push(index)
          return line
        }}
      >
        <Text>{"a\nb\nc"}</Text>
      </Transform>,
    )
    expect(indices).toEqual([0, 1, 2])
  })

  test("transforms each line independently", () => {
    const render = createRenderer({ cols: 40, rows: 5 })
    const app = render(
      <Transform transform={(line) => line.toUpperCase()}>
        <Text>{"first\nsecond\nthird"}</Text>
      </Transform>,
    )
    expect(app.text).toContain("FIRST")
    expect(app.text).toContain("SECOND")
    expect(app.text).toContain("THIRD")
  })

  test("single line gets index 0", () => {
    let receivedIndex = -1
    const render = createRenderer({ cols: 40, rows: 5 })
    render(
      <Transform
        transform={(line, index) => {
          receivedIndex = index
          return line
        }}
      >
        <Text>single line</Text>
      </Transform>,
    )
    expect(receivedIndex).toBe(0)
  })

  // -------------------------------------------------------------------
  // Null/undefined children
  // -------------------------------------------------------------------

  test("returns null for null children", () => {
    const render = createRenderer({ cols: 40, rows: 5 })
    const app = render(<Transform transform={(line) => line}>{null}</Transform>)
    expect(app.text.trim()).toBe("")
  })

  test("returns null for undefined children", () => {
    const render = createRenderer({ cols: 40, rows: 5 })
    const app = render(<Transform transform={(line) => line}>{undefined}</Transform>)
    expect(app.text.trim()).toBe("")
  })

  // -------------------------------------------------------------------
  // Nested Text
  // -------------------------------------------------------------------

  test("works with nested Text elements", () => {
    const render = createRenderer({ cols: 40, rows: 5 })
    const app = render(
      <Transform transform={(line) => line.toUpperCase()}>
        <Text>
          hello <Text>nested</Text> world
        </Text>
      </Transform>,
    )
    expect(app.text).toContain("HELLO NESTED WORLD")
  })

  // -------------------------------------------------------------------
  // Styled Text
  // Transform receives ANSI-encoded text when styles are present, so
  // we use transforms that don't corrupt ANSI escape sequences.
  // -------------------------------------------------------------------

  test("works with styled Text (bold) - identity transform", () => {
    const render = createRenderer({ cols: 40, rows: 5 })
    const app = render(
      <Transform transform={(line) => line}>
        <Text bold>important message</Text>
      </Transform>,
    )
    expect(app.text).toContain("important message")
  })

  test("works with styled Text (color) - identity transform", () => {
    const render = createRenderer({ cols: 40, rows: 5 })
    const app = render(
      <Transform transform={(line) => line}>
        <Text color="green">colored text</Text>
      </Transform>,
    )
    expect(app.text).toContain("colored text")
  })

  test("styled text is passed with ANSI codes to transform", () => {
    // Verify the transform receives ANSI-encoded text when styles are present
    let receivedLine = ""
    const render = createRenderer({ cols: 40, rows: 5 })
    render(
      <Transform
        transform={(line) => {
          receivedLine = line
          return line
        }}
      >
        <Text bold>styled</Text>
      </Transform>,
    )
    // Bold text includes ANSI bold code (\x1b[1m)
    expect(receivedLine).toContain("\x1b[1m")
    expect(receivedLine).toContain("styled")
  })

  // -------------------------------------------------------------------
  // Empty string
  // -------------------------------------------------------------------

  test("handles empty string children", () => {
    const render = createRenderer({ cols: 40, rows: 5 })
    const app = render(
      <Transform transform={(line) => line}>
        <Text>{""}</Text>
      </Transform>,
    )
    expect(app.text.trim()).toBe("")
  })

  // -------------------------------------------------------------------
  // Transform inside containers
  // -------------------------------------------------------------------

  test("Transform inside a Box", () => {
    const render = createRenderer({ cols: 40, rows: 5 })
    const app = render(
      <Box>
        <Transform transform={(line) => line.toUpperCase()}>
          <Text>boxed content</Text>
        </Transform>
      </Box>,
    )
    expect(app.text).toContain("BOXED CONTENT")
  })

  // -------------------------------------------------------------------
  // Claude Code API compatibility
  //
  // The CC fork of Ink uses: <Transform transform={(line, index) => `${index}: ${line}`}>
  // In hightea, the transform is applied after layout, so the output is clipped
  // to the text node's layout width. This means prefixed text gets clipped.
  // The transform function signature (line: string, index: number) => string
  // is fully compatible; the clipping is a layout-level difference.
  // -------------------------------------------------------------------

  test("CC API: transform function receives line and index parameters", () => {
    const calls: Array<{ line: string; index: number }> = []
    const render = createRenderer({ cols: 40, rows: 5 })
    render(
      <Transform
        transform={(line, index) => {
          calls.push({ line, index })
          return line
        }}
      >
        <Text>content</Text>
      </Transform>,
    )
    expect(calls).toHaveLength(1)
    expect(calls[0]).toEqual({ line: "content", index: 0 })
  })

  test("CC API: multi-line transform receives each line with correct index", () => {
    const calls: Array<{ line: string; index: number }> = []
    const render = createRenderer({ cols: 40, rows: 5 })
    render(
      <Transform
        transform={(line, index) => {
          calls.push({ line, index })
          return line
        }}
      >
        <Text>{"alpha\nbeta\ngamma"}</Text>
      </Transform>,
    )
    expect(calls).toEqual([
      { line: "alpha", index: 0 },
      { line: "beta", index: 1 },
      { line: "gamma", index: 2 },
    ])
  })

  test("CC API: dimension-preserving transform with index works end-to-end", () => {
    // Use a transform that replaces content with same-width output
    const render = createRenderer({ cols: 40, rows: 5 })
    const app = render(
      <Transform transform={(line, index) => `${index}${line.slice(1)}`}>
        <Text>{"Xhello\nXworld"}</Text>
      </Transform>,
    )
    expect(app.text).toContain("0hello")
    expect(app.text).toContain("1world")
  })

  test("CC API: transform output clipped to text node width when adding chars", () => {
    // Transforms that increase width are clipped to the original text width.
    // "content" is 7 chars wide. Adding "0: " prefix makes "0: content" (10 chars),
    // but only 7 chars fit in the layout: "0: cont".
    const render = createRenderer({ cols: 80, rows: 5 })
    const app = render(
      <Transform transform={(line, index) => `${index}: ${line}`}>
        <Text>content</Text>
      </Transform>,
    )
    // The transform runs and prepends the prefix, but output is clipped
    expect(app.text).toContain("0: cont")
  })
})
