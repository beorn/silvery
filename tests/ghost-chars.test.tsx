/**
 * Ghost Character Bug Tests (km-inkx.1)
 *
 * When content in a fixed-size container is replaced with shorter content,
 * ghost characters from the previous render can persist. This happens at the
 * ANSI output level — the buffer is correct but the terminal doesn't receive
 * all the necessary updates.
 *
 * Scenario: Storybook sidebar navigation — switching sections replaces
 * the content area entirely. If the new content is shorter, old text
 * appears at the right edge of lines or in empty rows.
 */

import React, { useState } from "react"
import { describe, expect, test } from "vitest"
import { Box, Text, VirtualTerminal, useInput } from "../src/index.js"
import { outputPhase } from "../src/pipeline.js"
import { createRenderer, stripAnsi } from "../src/testing/index.js"

const render = createRenderer({ incremental: true, cols: 80, rows: 24 })

/**
 * Helper: Verify ANSI replay correctness.
 * Simulates what the terminal sees by applying ANSI diff to previous state.
 */
function verifyAnsiReplay(app: ReturnType<typeof render>) {
  const buffer = app.lastBuffer()
  if (!buffer) throw new Error("No buffer")
  const vterm = new VirtualTerminal(buffer.width, buffer.height)
  // Get the full output (first render gives bufferToAnsi, subsequent gives diff)
  vterm.applyAnsi(app.ansi)
  const mismatches = vterm.compareToBuffer(buffer)
  if (mismatches.length > 0) {
    const details = mismatches
      .slice(0, 10)
      .map(
        (m) =>
          `  (${m.x},${m.y}): expected="${m.expected}" actual="${m.actual}"`,
      )
      .join("\n")
    throw new Error(
      `ANSI replay mismatch: ${mismatches.length} cells differ:\n${details}`,
    )
  }
}

describe("Ghost characters when replacing content", () => {
  test("shorter replacement text does not leave ghost chars", () => {
    function App({ long }: { long: boolean }) {
      return (
        <Box flexDirection="column" width={40} height={10}>
          {long ? (
            <Text>This is a very long line of text that fills the width</Text>
          ) : (
            <Text>Short</Text>
          )}
        </Box>
      )
    }

    const app = render(<App long={true} />)
    expect(app.text).toContain("This is a very long line")

    app.rerender(<App long={false} />)
    expect(app.text).toContain("Short")
    expect(app.text).not.toContain("long line")
    expect(app.text).not.toContain("very")
    expect(app.text).not.toContain("fills")
  })

  test("replacing multi-line content with single line clears old lines", () => {
    function App({ section }: { section: "a" | "b" }) {
      return (
        <Box flexDirection="column" width={40} height={10}>
          {section === "a" ? (
            <Box flexDirection="column">
              <Text>Line one from section A</Text>
              <Text>Line two from section A</Text>
              <Text>Line three from section A</Text>
              <Text>Line four from section A</Text>
              <Text>Line five from section A</Text>
            </Box>
          ) : (
            <Box flexDirection="column">
              <Text>Section B only line</Text>
            </Box>
          )}
        </Box>
      )
    }

    const app = render(<App section="a" />)
    expect(app.text).toContain("Line five from section A")

    app.rerender(<App section="b" />)
    expect(app.text).toContain("Section B only line")
    expect(app.text).not.toContain("section A")
    expect(app.text).not.toContain("Line two")
    expect(app.text).not.toContain("Line five")
  })

  test("storybook pattern: sidebar + content switching with useState", async () => {
    const sections = [
      {
        title: "Rich Text",
        content: [
          "Rich Text Rendering Demo",
          "  Bold, italic, underline, strike",
          "  Colors: red, green, blue, cyan",
          "  Background colors and dim text",
        ],
      },
      {
        title: "Tag Pills",
        content: ["Tag Pills", "  Simple content"],
      },
      {
        title: "Fold Markers",
        content: [
          "Fold Markers (Cards Style)",
          "  Fold State Indicators",
          "  Marker Constants",
          "  Colored Fold Markers",
        ],
      },
    ]

    function SidebarApp() {
      const [selectedIndex, setSelectedIndex] = useState(0)

      useInput((input, key) => {
        if (input === "j" || key.downArrow)
          setSelectedIndex((prev) => Math.min(prev + 1, sections.length - 1))
        if (input === "k" || key.upArrow)
          setSelectedIndex((prev) => Math.max(prev - 1, 0))
      })

      const section = sections[selectedIndex]!
      return (
        <Box flexDirection="column" width={70} height={20}>
          <Box flexDirection="row" flexGrow={1}>
            {/* Sidebar */}
            <Box
              flexDirection="column"
              width={20}
              borderStyle="single"
              borderColor="gray"
              paddingX={1}
            >
              <Text bold color="yellow">
                Sections
              </Text>
              {sections.map((s, idx) => (
                <Text
                  key={s.title}
                  backgroundColor={idx === selectedIndex ? "cyan" : undefined}
                  color={idx === selectedIndex ? "black" : "white"}
                >
                  {idx === selectedIndex ? "▸" : " "} {s.title}
                </Text>
              ))}
            </Box>
            {/* Content */}
            <Box
              flexDirection="column"
              flexGrow={1}
              paddingX={1}
              overflow="hidden"
            >
              {section.content.map((line, i) => (
                <Text key={i}>{line}</Text>
              ))}
            </Box>
          </Box>
        </Box>
      )
    }

    const app = render(<SidebarApp />)
    expect(app.text).toContain("Rich Text Rendering Demo")
    expect(app.text).toContain("Background colors and dim text")

    // Navigate down to "Tag Pills" (shorter content)
    await app.press("j")
    expect(app.text).toContain("Tag Pills")
    expect(app.text).toContain("Simple content")
    // Old content must be gone from buffer
    expect(app.text).not.toContain("Rich Text Rendering Demo")
    expect(app.text).not.toContain("Background colors")

    // Navigate down to "Fold Markers" (longer content)
    await app.press("j")
    expect(app.text).toContain("Fold Markers (Cards Style)")

    // Navigate back up to "Tag Pills" (shorter again)
    await app.press("k")
    expect(app.text).toContain("Tag Pills")
    expect(app.text).not.toContain("Colored Fold Markers")
    expect(app.text).not.toContain("Fold State Indicators")
    expect(app.text).not.toContain("Marker Constants")
  })

  test("content does not bleed into bordered sidebar region", async () => {
    // Test that text in the content area (right side) never overwrites
    // cells inside the bordered sidebar (left side)
    function App() {
      const [idx, setIdx] = useState(0)
      useInput((input) => {
        if (input === "j") setIdx(1)
      })

      return (
        <Box flexDirection="row" width={50} height={8}>
          {/* Sidebar: 15 wide with border = 13 inner + 2 border */}
          <Box flexDirection="column" width={15} borderStyle="single">
            <Text>Sidebar</Text>
            <Text>{idx === 0 ? "> Item A" : "  Item A"}</Text>
            <Text>{idx === 1 ? "> Item B" : "  Item B"}</Text>
          </Box>
          {/* Content: flexGrow fills rest (35 wide) */}
          <Box flexDirection="column" flexGrow={1} overflow="hidden">
            {idx === 0 ? (
              <Text>Short content for A</Text>
            ) : (
              <Text>
                This is a much longer content for section B that might overflow
              </Text>
            )}
          </Box>
        </Box>
      )
    }

    const app = render(<App />)

    // Initial render: check sidebar border integrity
    const lines1 = app.text.split("\n")
    // The sidebar right border should be at column 14 (0-indexed)
    // Content should start after the sidebar
    expect(app.text).toContain("Sidebar")
    expect(app.text).toContain("Short content for A")

    // Navigate to section B (longer content)
    await app.press("j")

    // Verify buffer content: sidebar region (cols 0-14) should be unchanged
    // except for the selection markers
    const buffer = app.lastBuffer()!
    for (let y = 0; y < buffer.height; y++) {
      // Check that the sidebar right border column (col 14) is still a border char
      const borderCell = buffer.getCell(14, y)
      if (y === 0 || y === buffer.height - 1 || y >= 7) continue // skip top/bottom/unused rows
      // The border characters are │ for sides
      expect(
        borderCell.char === "│" ||
          borderCell.char === "┐" ||
          borderCell.char === "┘" ||
          borderCell.char === " ",
        `Row ${y} col 14: expected border/space, got "${borderCell.char}"`,
      ).toBe(true)
    }
  })

  test("ANSI replay: sidebar + content switching produces correct terminal output", async () => {
    // Same scenario as above, but verify at the ANSI level (what the terminal sees)
    function SwitchApp() {
      const [idx, setIdx] = useState(0)

      useInput((input) => {
        if (input === "j") setIdx((prev) => Math.min(prev + 1, 2))
        if (input === "k") setIdx((prev) => Math.max(prev - 1, 0))
      })

      const contents = [
        [
          "Section A - Long line of content here that fills up space",
          "A line 2",
          "A line 3",
          "A line 4",
        ],
        ["Section B - Short"],
        ["Section C - Medium content", "C line 2", "C line 3"],
      ]

      return (
        <Box flexDirection="row" width={60} height={10}>
          <Box flexDirection="column" width={15} borderStyle="single">
            {["Sec A", "Sec B", "Sec C"].map((t, i) => (
              <Text
                key={t}
                backgroundColor={i === idx ? "cyan" : undefined}
                color={i === idx ? "black" : "white"}
              >
                {i === idx ? ">" : " "} {t}
              </Text>
            ))}
          </Box>
          <Box flexDirection="column" flexGrow={1} overflow="hidden">
            {contents[idx]!.map((line, i) => (
              <Text key={i}>{line}</Text>
            ))}
          </Box>
        </Box>
      )
    }

    const app = render(<SwitchApp />)
    expect(app.text).toContain("Section A")

    // Save buffer before navigation
    const bufferBefore = app.lastBuffer()
    expect(bufferBefore).toBeDefined()

    // Navigate down to shorter section
    await app.press("j")
    expect(app.text).toContain("Section B - Short")
    expect(app.text).not.toContain("Section A")
    expect(app.text).not.toContain("fills up space")

    // Get the ANSI diff output
    const bufferAfter = app.lastBuffer()!
    const ansiDiff = outputPhase(bufferBefore!, bufferAfter, "fullscreen")

    // Create virtual terminal with previous state, apply diff
    const vterm = new VirtualTerminal(bufferAfter.width, bufferAfter.height)
    vterm.loadFromBuffer(bufferBefore!)
    vterm.applyAnsi(ansiDiff)

    // Compare: terminal should match the buffer exactly
    const mismatches = vterm.compareToBuffer(bufferAfter)
    if (mismatches.length > 0) {
      const details = mismatches
        .slice(0, 20)
        .map(
          (m) =>
            `  (${m.x},${m.y}): expected="${m.expected}" actual="${m.actual}"`,
        )
        .join("\n")
      expect.fail(
        `ANSI replay mismatch: ${mismatches.length} cells differ:\n${details}`,
      )
    }

    // Navigate to section C, then back to B
    await app.press("j")
    const bufferC = app.lastBuffer()!
    await app.press("k")
    const bufferB2 = app.lastBuffer()!
    const ansiDiff2 = outputPhase(bufferC, bufferB2, "fullscreen")

    const vterm2 = new VirtualTerminal(bufferB2.width, bufferB2.height)
    vterm2.loadFromBuffer(bufferC)
    vterm2.applyAnsi(ansiDiff2)

    const mismatches2 = vterm2.compareToBuffer(bufferB2)
    if (mismatches2.length > 0) {
      const details = mismatches2
        .slice(0, 20)
        .map(
          (m) =>
            `  (${m.x},${m.y}): expected="${m.expected}" actual="${m.actual}"`,
        )
        .join("\n")
      expect.fail(
        `ANSI replay mismatch (C→B): ${mismatches2.length} cells differ:\n${details}`,
      )
    }
  })
})
