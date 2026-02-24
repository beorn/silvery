/**
 * Test: React.memo card re-render isolation.
 *
 * km-tui uses React.memo on Card components, so only the selected/deselected
 * cards re-render. Test if partial re-render causes layout issues.
 */
import { describe, expect, test } from "vitest"
import { createRenderer } from "inkx/testing"
import React, { useState, createContext, useContext, type Dispatch, type SetStateAction } from "react"

const { Box, Text } = await import("../src/index.js")

function hasTextInBorder(text: string): boolean {
  const lines = text.split("\n")
  for (const line of lines) {
    const m = line.matchAll(/[╰╭]([^╯╮]+)[╯╮]/g)
    for (const match of m) {
      if (/[a-zA-Z0-9]/.test(match[1]!)) return true
    }
  }
  return false
}

// Selection context (like CursorStore)
const SelectionContext = createContext<{ selected: number }>({ selected: 0 })

function useIsSelected(index: number): boolean {
  const { selected } = useContext(SelectionContext)
  return selected === index
}

// Memoized card that only re-renders when its own selection state changes
const MemoCard = React.memo(
  function MemoCard({ text, index, width }: { text: string; index: number; width: number }) {
    const isSelected = useIsSelected(index)

    return (
      <Box
        flexDirection="column"
        flexShrink={0}
        width={width}
        borderStyle="round"
        borderColor={isSelected ? "yellow" : "blackBright"}
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
  },
  (prev, next) => {
    // Only re-render if card props change (NOT selection — that's via context)
    return prev.text === next.text && prev.index === next.index && prev.width === next.width
  },
)

describe("React.memo card re-render isolation", () => {
  test("memoized cards in overflow=scroll maintain height on selection change", () => {
    let setSelected: Dispatch<SetStateAction<number>>

    const cards = [
      "AAAA BBBB CCCC DDDD EEEE FFFF GGGG HHHH IIII JJJJ KKKK LLLL",
      "example.com/path/to/some/resource/that/is/quite/long",
      "Short task 1",
      "Another medium-length task description here",
    ]

    function Column() {
      const [selected, _setSelected] = useState(0)
      setSelected = _setSelected

      return (
        <SelectionContext.Provider value={{ selected }}>
          <Box flexDirection="column" width={39} maxHeight={24} overflow="hidden">
            <Box height={1} flexShrink={0}>
              <Text> · col1 ({cards.length})</Text>
            </Box>
            <Box flexDirection="column" height={20} overflow="scroll">
              {cards.map((text, i) => (
                <MemoCard key={i} text={text} index={i} width={37} />
              ))}
            </Box>
          </Box>
        </SelectionContext.Provider>
      )
    }

    const render = createRenderer({ cols: 80, rows: 30 })
    const app = render(<Column />)

    const initial = app.text
    expect(hasTextInBorder(initial)).toBe(false)

    // Change selection (only cards 0 and 1 should re-render via context)
    React.act(() => {
      setSelected!(1)
    })

    const after = app.text
    if (hasTextInBorder(after)) {
      throw new Error(`Text in border after selection change with memo!\n\nBefore:\n${initial}\n\nAfter:\n${after}`)
    }
  })

  test("two-column board with memo cards", () => {
    let setSelectedCol: Dispatch<SetStateAction<number>>

    const col1Cards = [
      "AAAA BBBB CCCC DDDD EEEE FFFF GGGG HHHH IIII JJJJ KKKK LLLL",
      "example.com/path/to/some/resource/that/is/quite/long",
      "Short task 1",
      "Another medium-length task description here",
    ]
    const col2Cards = ["Task in col2", "Second task in col2 with more detail"]

    // Selection context that also tracks column
    const ColSelectionContext = createContext<{ colIdx: number }>({ colIdx: 0 })

    const ColMemoCard = React.memo(
      function ColMemoCard({
        text,
        colIdx,
        cardIdx,
        width,
      }: {
        text: string
        colIdx: number
        cardIdx: number
        width: number
      }) {
        const { colIdx: selectedCol } = useContext(ColSelectionContext)
        const isSelected = colIdx === selectedCol && cardIdx === 0

        return (
          <Box
            flexDirection="column"
            flexShrink={0}
            width={width}
            borderStyle="round"
            borderColor={isSelected ? "yellow" : "blackBright"}
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
      },
      (prev, next) =>
        prev.text === next.text &&
        prev.colIdx === next.colIdx &&
        prev.cardIdx === next.cardIdx &&
        prev.width === next.width,
    )

    function Board() {
      const [selectedCol, _setSelectedCol] = useState(0)
      setSelectedCol = _setSelectedCol

      const renderCol = (cards: string[], colIdx: number, width: number) => (
        <Box flexDirection="column" width={width} maxHeight={24} overflow="hidden">
          <Box height={1} flexShrink={0}>
            <Text>
              {" "}
              · col{colIdx + 1} ({cards.length})
            </Text>
          </Box>
          <Box flexDirection="column" height={20} overflow="scroll">
            {cards.map((text, i) => (
              <ColMemoCard key={i} text={text} colIdx={colIdx} cardIdx={i} width={width - 2} />
            ))}
          </Box>
        </Box>
      )

      return (
        <ColSelectionContext.Provider value={{ colIdx: selectedCol }}>
          <Box flexDirection="row" width={80}>
            {renderCol(col1Cards, 0, 39)}
            <Box width={2} flexShrink={0}>
              <Text>{"  "}</Text>
            </Box>
            {renderCol(col2Cards, 1, 39)}
          </Box>
        </ColSelectionContext.Provider>
      )
    }

    const render = createRenderer({ cols: 80, rows: 30 })
    const app = render(<Board />)

    const initial = app.text
    expect(hasTextInBorder(initial)).toBe(false)

    // Move cursor right
    React.act(() => {
      setSelectedCol!(1)
    })

    const after = app.text
    if (hasTextInBorder(after)) {
      throw new Error(`Text in border after cursor right with memo cards!\n\nBefore:\n${initial}\n\nAfter:\n${after}`)
    }
  })
})
