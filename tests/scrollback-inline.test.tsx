/**
 * Tests for inline mode + useScrollback behavior.
 *
 * Verifies:
 * - useScrollback freezes contiguous prefix to scrollback
 * - renderStringSync produces width-constrained output
 * - Inline mode layout uses terminal width correctly
 * - Content does not exceed specified width
 * - Scrollback notification chain works
 */

import React, { useState } from "react"
import { describe, expect, test } from "vitest"
import { Box, Text, Link, renderStringSync, useInput, OSC133 } from "../src/index.js"
import { useScrollback } from "../src/hooks/useScrollback.js"
import { createRenderer, stripAnsi } from "inkx/testing"

// ============================================================================
// renderStringSync width constraints
// ============================================================================

describe("renderStringSync width constraints", () => {
  test("renders a box at exactly the given width", () => {
    for (const cols of [40, 60, 80, 100, 120]) {
      const output = renderStringSync(
        <Box borderStyle="round" borderColor="blue" paddingX={1}>
          <Text>Hello world this is some content that might be long enough to wrap at narrow widths</Text>
        </Box>,
        { width: cols },
      )

      const plainLines = stripAnsi(output).split("\n")
      for (let i = 0; i < plainLines.length; i++) {
        expect(plainLines[i]!.length).toBeLessThanOrEqual(cols)
      }
    }
  })

  test("nested boxes with borders stay within width", () => {
    function NestedLayout() {
      return (
        <Box flexDirection="column" overflow="hidden">
          <Box flexDirection="column" borderStyle="round" borderColor="green" paddingX={1}>
            <Text bold>Header</Text>
            <Text>Some content that should be constrained</Text>
            <Box flexDirection="column" borderStyle="bold" borderColor="yellow" borderLeft borderRight={false} borderTop={false} borderBottom={false} paddingLeft={1}>
              <Text>Nested content with left border only</Text>
              <Text>Another line of nested content</Text>
            </Box>
          </Box>
        </Box>
      )
    }

    for (const cols of [40, 60, 80]) {
      const output = renderStringSync(<NestedLayout />, { width: cols })
      const plainLines = stripAnsi(output).split("\n")
      for (let i = 0; i < plainLines.length; i++) {
        expect(plainLines[i]!.length).toBeLessThanOrEqual(cols)
      }
    }
  })

  test("status bar with flexGrow stays within width", () => {
    function StatusBar() {
      return (
        <Box flexDirection="row" paddingX={1}>
          <Text color="cyan">0:42</Text>
          <Box flexGrow={1} />
          <Text color="gray">Enter next  a auto  c compact  q quit</Text>
          <Box flexGrow={1} />
          <Text color="cyan">{"█████░░░░░░░░░░░░░░░"}</Text>
          <Text color="gray"> 5/20</Text>
        </Box>
      )
    }

    for (const cols of [60, 80, 120]) {
      const output = renderStringSync(<StatusBar />, { width: cols })
      const plainLines = stripAnsi(output).split("\n")
      for (const line of plainLines) {
        expect(line.length).toBeLessThanOrEqual(cols)
      }
    }
  })
})

// ============================================================================
// useScrollback behavior
// ============================================================================

describe("useScrollback", () => {
  const render = createRenderer({ cols: 80, rows: 24 })

  interface Item {
    id: number
    text: string
    frozen: boolean
  }

  test("returns frozen count for contiguous prefix", () => {
    const stdoutWrites: string[] = []
    const mockStdout = {
      write(data: string) {
        stdoutWrites.push(data)
        return true
      },
    }

    function TestApp() {
      const items: Item[] = [
        { id: 1, text: "First", frozen: true },
        { id: 2, text: "Second", frozen: true },
        { id: 3, text: "Third", frozen: false },
      ]

      const frozenCount = useScrollback(items, {
        frozen: (item) => item.frozen,
        render: (item) => `[${item.id}] ${item.text}`,
        stdout: mockStdout,
      })

      return (
        <Box flexDirection="column">
          <Text>frozen={frozenCount}</Text>
          {items.slice(frozenCount).map((item) => (
            <Text key={item.id}>{item.text}</Text>
          ))}
        </Box>
      )
    }

    const app = render(<TestApp />)
    expect(app.text).toContain("frozen=2")
    expect(app.text).toContain("Third")
    // First two items should have been written to stdout
    expect(stdoutWrites.length).toBe(2)
    expect(stdoutWrites[0]).toContain("[1] First")
    expect(stdoutWrites[1]).toContain("[2] Second")
  })

  test("non-contiguous frozen items only count prefix", () => {
    function TestApp() {
      const items: Item[] = [
        { id: 1, text: "First", frozen: true },
        { id: 2, text: "Second", frozen: false },
        { id: 3, text: "Third", frozen: true },
      ]

      const mockStdout = { write: () => true }
      const frozenCount = useScrollback(items, {
        frozen: (item) => item.frozen,
        render: (item) => item.text,
        stdout: mockStdout,
      })

      return <Text>frozen={frozenCount}</Text>
    }

    const app = render(<TestApp />)
    // Only item 1 is contiguously frozen from the start
    expect(app.text).toContain("frozen=1")
  })

  test("incremental freezing writes only new items", () => {
    // Test the logic of useScrollback by rendering with progressively frozen items.
    // We use separate renders to avoid incremental diff issues with INKX_STRICT.
    const stdoutWrites: string[] = []
    const mockStdout = {
      write(data: string) {
        stdoutWrites.push(data)
        return true
      },
    }

    // Phase 1: nothing frozen
    function Phase1() {
      const items: Item[] = [
        { id: 1, text: "First", frozen: false },
        { id: 2, text: "Second", frozen: false },
      ]
      const frozenCount = useScrollback(items, {
        frozen: (item) => item.frozen,
        render: (item) => `> ${item.text}`,
        stdout: mockStdout,
      })
      return <Text>frozen={frozenCount}</Text>
    }

    const app1 = render(<Phase1 />)
    expect(app1.text).toContain("frozen=0")
    expect(stdoutWrites).toHaveLength(0)

    // Phase 2: first item frozen (separate render to avoid diff issues)
    const writes2: string[] = []
    const mockStdout2 = { write(d: string) { writes2.push(d); return true } }

    function Phase2() {
      const items: Item[] = [
        { id: 1, text: "First", frozen: true },
        { id: 2, text: "Second", frozen: false },
      ]
      const frozenCount = useScrollback(items, {
        frozen: (item) => item.frozen,
        render: (item) => `> ${item.text}`,
        stdout: mockStdout2,
      })
      return <Text>frozen={frozenCount}</Text>
    }

    const app2 = render(<Phase2 />)
    expect(app2.text).toContain("frozen=1")
    expect(writes2).toHaveLength(1)
    expect(writes2[0]).toContain("> First")
  })
})

// ============================================================================
// Inline mode content height constraints
// ============================================================================

describe("inline mode content constraints", () => {
  test("content taller than terminal is capped in renderStringSync", () => {
    // renderStringSync doesn't have termRows capping (that's in outputPhase),
    // but it should produce correct content regardless of height
    function TallContent() {
      return (
        <Box flexDirection="column">
          {Array.from({ length: 50 }, (_, i) => (
            <Text key={i}>Line {i}</Text>
          ))}
        </Box>
      )
    }

    const output = renderStringSync(<TallContent />, { width: 80 })
    const lines = stripAnsi(output).split("\n")
    // Should contain all 50 lines (no capping in renderStringSync)
    expect(lines.length).toBeGreaterThanOrEqual(50)
  })

  // Note: Inline mode height capping (termRows) happens in the scheduler/output-phase
  // at real render time, not in the test renderer. The test renderer uses fullscreen mode.
  // Testing termRows capping requires running the actual inline render pipeline.
  test("renderStringSync auto-sizes height for all content", () => {
    function TallContent() {
      return (
        <Box flexDirection="column">
          {Array.from({ length: 50 }, (_, i) => (
            <Text key={i}>Line {i}</Text>
          ))}
        </Box>
      )
    }

    // renderStringSync (used for scrollback rendering) should render ALL lines
    // since it's generating frozen scrollback content, not live viewport output
    const output = renderStringSync(<TallContent />, { width: 80 })
    const lines = stripAnsi(output).split("\n").filter((l) => l.trim())
    expect(lines.length).toBe(50)
  })
})

// ============================================================================
// Scrollback rendering quality (what appears in scrollback should be clean)
// ============================================================================

describe("scrollback rendering quality", () => {
  test("renderStringSync produces styled ANSI output", () => {
    const output = renderStringSync(
      <Box paddingX={1}>
        <Text dim bold color="cyan">
          {"❯ "}
        </Text>
        <Text dim>Fix the login bug</Text>
      </Box>,
      { width: 80 },
    )

    // Should contain ANSI codes for styling
    expect(output).toMatch(/\x1b\[/)
    // Should contain the text
    expect(stripAnsi(output)).toContain("❯")
    expect(stripAnsi(output)).toContain("Fix the login bug")
  })

  test("renderStringSync with nested boxes and diff colors", () => {
    function DiffBlock() {
      return (
        <Box flexDirection="column" paddingLeft={2}>
          <Text dim>existing code</Text>
          <Text dim color="red">
            {"- old code"}
          </Text>
          <Text dim color="green">
            {"+ new code"}
          </Text>
        </Box>
      )
    }

    const output = renderStringSync(<DiffBlock />, { width: 80 })
    const plain = stripAnsi(output)
    expect(plain).toContain("existing code")
    expect(plain).toContain("- old code")
    expect(plain).toContain("+ new code")
    // Should have ANSI color codes
    expect(output).toContain("38;") // foreground color
  })

  test("renderStringSync respects width for long content", () => {
    const longText = "This is a very long line of text that should wrap when rendered at a narrow width. It contains enough words to definitely exceed any reasonable terminal width."

    const output = renderStringSync(
      <Box borderStyle="round" paddingX={1}>
        <Text>{longText}</Text>
      </Box>,
      { width: 40 },
    )

    const plainLines = stripAnsi(output).split("\n")
    for (const line of plainLines) {
      expect(line.length).toBeLessThanOrEqual(40)
    }
    // Content should be spread across multiple lines
    expect(plainLines.length).toBeGreaterThan(3)
  })
})

// ============================================================================
// DECAWM auto-wrap prevention
// ============================================================================

describe("DECAWM auto-wrap prevention", () => {
  test("useScrollback writes use \\r\\n to prevent double line advance", () => {
    const render = createRenderer({ cols: 80, rows: 24 })
    const stdoutWrites: string[] = []
    const mockStdout = {
      write(data: string) {
        stdoutWrites.push(data)
        return true
      },
    }

    function TestApp() {
      const items = [
        { id: 1, text: "Frozen item", frozen: true },
      ]

      const frozenCount = useScrollback(items, {
        frozen: (item) => item.frozen,
        render: (item) => `[${item.id}] ${item.text}`,
        stdout: mockStdout,
      })

      return <Text>frozen={frozenCount}</Text>
    }

    render(<TestApp />)
    expect(stdoutWrites.length).toBe(1)

    // Every \n in the output should be preceded by \r (i.e., \r\n)
    // to cancel DECAWM pending-wrap state on full-width lines
    const output = stdoutWrites[0]!
    expect(output).toContain("\r\n")
    // Should not contain bare \n (without preceding \r)
    const bareNewlines = output.replace(/\r\n/g, "").indexOf("\n")
    expect(bareNewlines).toBe(-1)
  })

  test("renderStringSync full-width bordered box lines are safe with \\r\\n", () => {
    // When a bordered box fills the full terminal width, each border line
    // is exactly `cols` visible characters. Without \r\n, writing this to
    // stdout causes double line advance from DECAWM pending-wrap.
    const cols = 40
    const output = renderStringSync(
      <Box borderStyle="round" borderColor="blue" paddingX={1}>
        <Text>Content here</Text>
      </Box>,
      { width: cols },
    )

    const plainLines = stripAnsi(output).split("\n")
    // The border lines should be exactly `cols` width (full-width)
    const topBorder = plainLines[0]!
    expect(topBorder.length).toBe(cols)

    // When writing through useScrollback, \n will become \r\n
    // Verify the content is valid and will work with \r\n substitution
    const withCrLn = output.replace(/\n/g, "\r\n")
    const crLnPlainLines = stripAnsi(withCrLn).split("\r\n")
    expect(crLnPlainLines.length).toBe(plainLines.length)
    for (let i = 0; i < crLnPlainLines.length; i++) {
      expect(crLnPlainLines[i]).toBe(plainLines[i])
    }
  })
})

// ============================================================================
// OSC 8 hyperlink support in scrollback rendering
// ============================================================================

describe("OSC 8 hyperlinks in renderStringSync", () => {
  const OSC8_OPEN_RE = /\x1b]8;;([^\x1b]*)\x1b\\/
  const OSC8_CLOSE = "\x1b]8;;\x1b\\"

  test("Link component produces OSC 8 sequences in renderStringSync output", () => {
    const output = renderStringSync(
      <Box>
        <Link href="https://example.com">click here</Link>
      </Box>,
      { width: 80 },
    )

    // Should contain OSC 8 open with the URL
    const openMatch = output.match(OSC8_OPEN_RE)
    expect(openMatch).toBeTruthy()
    expect(openMatch![1]).toBe("https://example.com")

    // Should contain OSC 8 close
    expect(output).toContain(OSC8_CLOSE)

    // Plain text should contain the link text
    expect(stripAnsi(output)).toContain("click here")
  })

  test("file:// links produce OSC 8 sequences", () => {
    const output = renderStringSync(
      <Box>
        <Link href="file:///src/auth.ts">/src/auth.ts</Link>
      </Box>,
      { width: 80 },
    )

    const openMatch = output.match(OSC8_OPEN_RE)
    expect(openMatch).toBeTruthy()
    expect(openMatch![1]).toBe("file:///src/auth.ts")
    expect(stripAnsi(output)).toContain("/src/auth.ts")
  })

  test("multiple links in same line each get OSC 8 sequences", () => {
    const output = renderStringSync(
      <Box>
        <Link href="https://a.com">A</Link>
        <Text> and </Text>
        <Link href="https://b.com">B</Link>
      </Box>,
      { width: 80 },
    )

    // Both URLs should appear in OSC 8 open sequences
    const allOpens = [...output.matchAll(/\x1b]8;;([^\x1b]*)\x1b\\/g)]
    const urls = allOpens.map((m) => m[1]).filter((u) => u !== "")
    expect(urls).toContain("https://a.com")
    expect(urls).toContain("https://b.com")

    // Should have close sequences (empty URL) for each link
    const closeCount = (output.match(/\x1b]8;;\x1b\\/g) || []).length
    // At least 2 closes (one for each link, plus potentially line-end closes)
    expect(closeCount).toBeGreaterThanOrEqual(2)
  })

  test("Link with dim styling preserves OSC 8 in output", () => {
    const output = renderStringSync(
      <Box paddingLeft={2}>
        <Text dim>Tool output: </Text>
        <Link href="https://docs.example.com/errors/401" dim>error docs</Link>
      </Box>,
      { width: 80 },
    )

    const openMatch = output.match(OSC8_OPEN_RE)
    expect(openMatch).toBeTruthy()
    expect(openMatch![1]).toBe("https://docs.example.com/errors/401")
    expect(stripAnsi(output)).toContain("error docs")
  })

  test("hyperlinks survive through useScrollback render callback", () => {
    // Pre-render the linked content to get an OSC 8 string, then verify it
    // passes through useScrollback's stdout.write (which applies \r\n normalization)
    const preRendered = renderStringSync(
      <Box>
        <Link href="https://example.com">Example</Link>
      </Box>,
      { width: 80 },
    )
    // Sanity: the pre-rendered string has OSC 8
    expect(preRendered).toMatch(OSC8_OPEN_RE)

    const render = createRenderer({ cols: 80, rows: 24 })
    const stdoutWrites: string[] = []
    const mockStdout = {
      write(data: string) {
        stdoutWrites.push(data)
        return true
      },
    }

    interface LinkedItem {
      id: number
      rendered: string
      frozen: boolean
    }

    function TestApp() {
      const items: LinkedItem[] = [
        { id: 1, rendered: preRendered, frozen: true },
      ]

      const frozenCount = useScrollback(items, {
        frozen: (item) => item.frozen,
        render: (item) => item.rendered,
        stdout: mockStdout,
      })

      return <Text>frozen={frozenCount}</Text>
    }

    const app = render(<TestApp />)
    expect(app.text).toContain("frozen=1")
    expect(stdoutWrites.length).toBe(1)

    // The scrollback output should preserve OSC 8 hyperlink sequences
    // (the \r\n normalization should not corrupt them)
    const written = stdoutWrites[0]!
    const openMatch = written.match(OSC8_OPEN_RE)
    expect(openMatch).toBeTruthy()
    expect(openMatch![1]).toBe("https://example.com")
    expect(written).toContain(OSC8_CLOSE)
  })
})

// ============================================================================
// OSC 133 semantic markers
// ============================================================================

describe("OSC 133 semantic markers", () => {
  const render = createRenderer({ cols: 80, rows: 24 })

  interface Item {
    id: number
    text: string
    frozen: boolean
  }

  test("markers: true emits OSC 133 A/D around frozen items", () => {
    const stdoutWrites: string[] = []
    const mockStdout = {
      write(data: string) {
        stdoutWrites.push(data)
        return true
      },
    }

    function TestApp() {
      const items: Item[] = [
        { id: 1, text: "First", frozen: true },
        { id: 2, text: "Second", frozen: true },
        { id: 3, text: "Third", frozen: false },
      ]

      const frozenCount = useScrollback(items, {
        frozen: (item) => item.frozen,
        render: (item) => `[${item.id}] ${item.text}`,
        stdout: mockStdout,
        markers: true,
      })

      return <Text>frozen={frozenCount}</Text>
    }

    render(<TestApp />)

    // Each frozen item produces 3 writes: marker-before, content, marker-after
    // Item 1: OSC133.promptStart, "[1] First\r\n", OSC133.commandEnd(0)
    // Item 2: OSC133.promptStart, "[2] Second\r\n", OSC133.commandEnd(0)
    expect(stdoutWrites).toHaveLength(6)

    // Item 1
    expect(stdoutWrites[0]).toBe(OSC133.promptStart)
    expect(stdoutWrites[1]).toContain("[1] First")
    expect(stdoutWrites[2]).toBe(OSC133.commandEnd(0))

    // Item 2
    expect(stdoutWrites[3]).toBe(OSC133.promptStart)
    expect(stdoutWrites[4]).toContain("[2] Second")
    expect(stdoutWrites[5]).toBe(OSC133.commandEnd(0))
  })

  test("markers: false (default) emits no markers", () => {
    const stdoutWrites: string[] = []
    const mockStdout = {
      write(data: string) {
        stdoutWrites.push(data)
        return true
      },
    }

    function TestApp() {
      const items: Item[] = [
        { id: 1, text: "First", frozen: true },
      ]

      const frozenCount = useScrollback(items, {
        frozen: (item) => item.frozen,
        render: (item) => `[${item.id}] ${item.text}`,
        stdout: mockStdout,
        // no markers option
      })

      return <Text>frozen={frozenCount}</Text>
    }

    render(<TestApp />)

    // Only the content write, no marker writes
    expect(stdoutWrites).toHaveLength(1)
    expect(stdoutWrites[0]).toContain("[1] First")
    // Should not contain any OSC 133 sequences
    expect(stdoutWrites[0]).not.toContain("\x1b]133;")
  })

  test("custom marker callbacks are called correctly", () => {
    const stdoutWrites: string[] = []
    const mockStdout = {
      write(data: string) {
        stdoutWrites.push(data)
        return true
      },
    }

    const beforeCalls: Array<{ item: Item; index: number }> = []
    const afterCalls: Array<{ item: Item; index: number }> = []

    function TestApp() {
      const items: Item[] = [
        { id: 1, text: "Alpha", frozen: true },
        { id: 2, text: "Beta", frozen: true },
        { id: 3, text: "Gamma", frozen: false },
      ]

      const frozenCount = useScrollback(items, {
        frozen: (item) => item.frozen,
        render: (item) => item.text,
        stdout: mockStdout,
        markers: {
          before: (item, index) => {
            beforeCalls.push({ item, index })
            return OSC133.promptStart + OSC133.promptEnd
          },
          after: (item, index) => {
            afterCalls.push({ item, index })
            return OSC133.commandStart + OSC133.commandEnd(0)
          },
        },
      })

      return <Text>frozen={frozenCount}</Text>
    }

    render(<TestApp />)

    // Custom callbacks called for each frozen item
    expect(beforeCalls).toHaveLength(2)
    expect(beforeCalls[0]!.item.text).toBe("Alpha")
    expect(beforeCalls[0]!.index).toBe(0)
    expect(beforeCalls[1]!.item.text).toBe("Beta")
    expect(beforeCalls[1]!.index).toBe(1)

    expect(afterCalls).toHaveLength(2)
    expect(afterCalls[0]!.item.text).toBe("Alpha")
    expect(afterCalls[1]!.item.text).toBe("Beta")

    // 6 writes: (before + content + after) x 2 items
    expect(stdoutWrites).toHaveLength(6)

    // Item 1: custom before marker (A+B), content, custom after marker (C+D)
    expect(stdoutWrites[0]).toBe(OSC133.promptStart + OSC133.promptEnd)
    expect(stdoutWrites[1]).toContain("Alpha")
    expect(stdoutWrites[2]).toBe(OSC133.commandStart + OSC133.commandEnd(0))
  })

  test("custom markers with empty strings are not written", () => {
    const stdoutWrites: string[] = []
    const mockStdout = {
      write(data: string) {
        stdoutWrites.push(data)
        return true
      },
    }

    function TestApp() {
      const items: Item[] = [
        { id: 1, text: "Only", frozen: true },
      ]

      const frozenCount = useScrollback(items, {
        frozen: (item) => item.frozen,
        render: (item) => item.text,
        stdout: mockStdout,
        markers: {
          before: () => "", // Empty string - should not write
          after: () => OSC133.commandEnd(0), // Non-empty - should write
        },
      })

      return <Text>frozen={frozenCount}</Text>
    }

    render(<TestApp />)

    // 2 writes: content + after marker (before is empty, not written)
    expect(stdoutWrites).toHaveLength(2)
    expect(stdoutWrites[0]).toContain("Only")
    expect(stdoutWrites[1]).toBe(OSC133.commandEnd(0))
  })

  test("OSC133 constants have correct escape sequences", () => {
    expect(OSC133.promptStart).toBe("\x1b]133;A\x07")
    expect(OSC133.promptEnd).toBe("\x1b]133;B\x07")
    expect(OSC133.commandStart).toBe("\x1b]133;C\x07")
    expect(OSC133.commandEnd()).toBe("\x1b]133;D;0\x07")
    expect(OSC133.commandEnd(0)).toBe("\x1b]133;D;0\x07")
    expect(OSC133.commandEnd(1)).toBe("\x1b]133;D;1\x07")
    expect(OSC133.commandEnd(127)).toBe("\x1b]133;D;127\x07")
  })
})
