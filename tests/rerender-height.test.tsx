/**
 * Test: Box height stability after re-render with borderColor change.
 *
 * Bug: When a Box with borderStyle="round" and wrapping text content
 * changes borderColor (e.g., from "yellow" to "blackBright"), multi-line
 * cards lose their last content line — text bleeds into the bottom border.
 */
import { describe, expect, test } from "vitest"
import { createRenderer } from "inkx/testing"
import React, { useState, type Dispatch, type SetStateAction } from "react"

const { Box, Text } = await import("../src/index.js")

describe("box height stability on re-render", () => {
  test("borderColor change does not alter card height", () => {
    let setColor: Dispatch<SetStateAction<string>>

    function Card() {
      const [color, _setColor] = useState("yellow")
      setColor = _setColor

      return (
        <Box flexDirection="column" flexShrink={0} width={37} borderStyle="round" borderColor={color} paddingRight={1}>
          <Box flexDirection="row" alignItems="flex-start">
            <Box width={3} flexShrink={0}>
              <Text>{"·  "}</Text>
            </Box>
            <Box flexGrow={1} flexShrink={1}>
              <Text wrap="wrap">example.com/path/to/some/resource/that/is/quite/long</Text>
            </Box>
          </Box>
        </Box>
      )
    }

    const render = createRenderer({ cols: 80, rows: 20 })
    const app = render(
      <Box flexDirection="column">
        <Card />
      </Box>,
    )

    const initial = app.text
    const initialLines = initial.split("\n").filter((l) => l.trim())

    // Change borderColor (simulates cursor moving away)
    React.act(() => {
      setColor!("blackBright")
    })

    const after = app.text
    const afterLines = after.split("\n").filter((l) => l.trim())

    // Height must not change — only color should differ
    expect(afterLines.length).toBe(initialLines.length)

    // Text should NOT appear in border line
    for (const line of after.split("\n")) {
      const m = [...line.matchAll(/[╰╭]([^╯╮]+)[╯╮]/g)]
      for (const match of m) {
        expect(match[1]).not.toMatch(/[a-zA-Z0-9]/, `Text in border: ${match[0]}`)
      }
    }
  })

  test("two cards in column - borderColor change preserves heights", () => {
    let setSelected: Dispatch<SetStateAction<number>>

    function CardColumn() {
      const [selected, _setSelected] = useState(0)
      setSelected = _setSelected

      const cards = [
        "AAAA BBBB CCCC DDDD EEEE FFFF GGGG HHHH IIII JJJJ KKKK LLLL",
        "example.com/path/to/some/resource/that/is/quite/long",
        "Short task",
        "Another medium-length task description here",
      ]

      return (
        <Box flexDirection="column" width={37}>
          {cards.map((text, i) => (
            <Box
              key={i}
              flexDirection="column"
              flexShrink={0}
              width={37}
              borderStyle="round"
              borderColor={i === selected ? "yellow" : "blackBright"}
              paddingRight={1}
            >
              <Box flexDirection="row" alignItems="flex-start">
                <Box width={3} flexShrink={0}>
                  <Text>{"·  "}</Text>
                </Box>
                <Box flexGrow={1} flexShrink={1}>
                  <Text wrap="wrap">{text}</Text>
                </Box>
              </Box>
            </Box>
          ))}
        </Box>
      )
    }

    const render = createRenderer({ cols: 80, rows: 30 })
    const app = render(<CardColumn />)

    const initial = app.text

    // Change selection (simulates cursor movement)
    React.act(() => {
      setSelected!(1)
    })

    const after = app.text

    // Count non-empty lines — should be same
    const initialNonEmpty = initial.split("\n").filter((l) => l.trim()).length
    const afterNonEmpty = after.split("\n").filter((l) => l.trim()).length
    expect(afterNonEmpty).toBe(initialNonEmpty)

    // No text in borders
    for (const line of after.split("\n")) {
      const m = [...line.matchAll(/[╰╭]([^╯╮]+)[╯╮]/g)]
      for (const match of m) {
        expect(match[1]).not.toMatch(/[a-zA-Z0-9]/, `Text in border after selection change: ${match[0]}`)
      }
    }
  })

  test("two-column row - cursor right simulation", () => {
    let setSelectedCol: Dispatch<SetStateAction<number>>

    function Board() {
      const [selectedCol, _setSelectedCol] = useState(0)
      setSelectedCol = _setSelectedCol

      const col1Cards = [
        "AAAA BBBB CCCC DDDD EEEE FFFF GGGG HHHH",
        "example.com/path/to/some/resource/long",
        "Short task 1",
      ]
      const col2Cards = ["Task in col2", "Second task in col2 with more detail"]

      const renderCard = (text: string, colIdx: number, cardIdx: number) => (
        <Box
          key={`${colIdx}-${cardIdx}`}
          flexDirection="column"
          flexShrink={0}
          width={37}
          borderStyle="round"
          borderColor={colIdx === selectedCol && cardIdx === 0 ? "yellow" : "blackBright"}
          paddingRight={1}
        >
          <Box flexDirection="row" alignItems="flex-start">
            <Box width={3} flexShrink={0}>
              <Text>{"·  "}</Text>
            </Box>
            <Box flexGrow={1} flexShrink={1}>
              <Text wrap="wrap">{text}</Text>
            </Box>
          </Box>
        </Box>
      )

      return (
        <Box flexDirection="row" width={80}>
          <Box flexDirection="column" width={39} overflow="hidden">
            {col1Cards.map((t, i) => renderCard(t, 0, i))}
          </Box>
          <Box width={2} flexShrink={0}>
            <Text>{"  "}</Text>
          </Box>
          <Box flexDirection="column" width={39} overflow="hidden">
            {col2Cards.map((t, i) => renderCard(t, 1, i))}
          </Box>
        </Box>
      )
    }

    const render = createRenderer({ cols: 80, rows: 24 })
    const app = render(<Board />)

    const initial = app.text

    // Move cursor right (col0 -> col1)
    React.act(() => {
      setSelectedCol!(1)
    })

    const after = app.text

    // Check: no text in border lines
    const problems: string[] = []
    for (const [label, output] of [
      ["initial", initial],
      ["after-right", after],
    ] as const) {
      for (const line of output.split("\n")) {
        const m = [...line.matchAll(/[╰╭]([^╯╮]+)[╯╮]/g)]
        for (const match of m) {
          if (/[a-zA-Z0-9]/.test(match[1]!)) {
            problems.push(`[${label}] Text in border: ${match[0]}`)
          }
        }
      }
    }

    if (problems.length > 0) {
      throw new Error(`Card border problems:\n${problems.join("\n")}\n\nInitial:\n${initial}\n\nAfter:\n${after}`)
    }
  })
})
