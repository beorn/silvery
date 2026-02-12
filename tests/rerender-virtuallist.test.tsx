/**
 * Test: VirtualList card height stability on re-render.
 *
 * The km-tui board uses VirtualList inside overflow="scroll" containers.
 * Pure inkx borderColor change tests pass, but km-tui fails.
 * This test isolates whether VirtualList + overflow is the trigger.
 */
import { describe, expect, test } from "vitest"
import { createRenderer } from "../src/testing/index.js"
import React, { useState, type Dispatch, type SetStateAction } from "react"

const { Box, Text, VirtualList } = await import("../src/index.js")

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

describe("VirtualList card height on re-render", () => {
  test("cards in overflow=scroll container maintain height after prop change", () => {
    let setSelected: Dispatch<SetStateAction<number>>

    const cards = [
      "AAAA BBBB CCCC DDDD EEEE FFFF GGGG HHHH IIII JJJJ KKKK LLLL",
      "example.com/path/to/some/resource/that/is/quite/long",
      "Short task 1",
      "Another medium-length task description here",
    ]

    function CardColumn() {
      const [selected, _setSelected] = useState(0)
      setSelected = _setSelected

      return (
        <Box flexDirection="column" width={39} maxHeight={24} overflow="hidden">
          <Box height={1} flexShrink={0}>
            <Text> · col1 (4)</Text>
          </Box>
          <Box flexDirection="column" height={20} overflow="scroll">
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
        </Box>
      )
    }

    const render = createRenderer({ cols: 80, rows: 30 })
    const app = render(<CardColumn />)

    const initial = app.text
    expect(hasTextInBorder(initial)).toBe(false)

    // Change selection
    React.act(() => {
      setSelected!(1)
    })

    const after = app.text
    if (hasTextInBorder(after)) {
      throw new Error(`Text in border after selection change!\n\nBefore:\n${initial}\n\nAfter:\n${after}`)
    }
  })

  test("two-column board with overflow=scroll - cursor right simulation", () => {
    let setSelectedCol: Dispatch<SetStateAction<number>>

    const col1Cards = [
      "AAAA BBBB CCCC DDDD EEEE FFFF GGGG HHHH IIII JJJJ KKKK LLLL",
      "example.com/path/to/some/resource/that/is/quite/long",
      "Short task 1",
      "Another medium-length task description here",
    ]
    const col2Cards = ["Task in col2", "Second task in col2 with more detail"]

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
              <Box
                key={i}
                flexDirection="column"
                flexShrink={0}
                width={width - 2}
                borderStyle="round"
                borderColor={colIdx === selectedCol && i === 0 ? "yellow" : "blackBright"}
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
        </Box>
      )

      return (
        <Box flexDirection="row" width={80}>
          {renderCol(col1Cards, 0, 39)}
          <Box width={2} flexShrink={0}>
            <Text>{"  "}</Text>
          </Box>
          {renderCol(col2Cards, 1, 39)}
        </Box>
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
      throw new Error(`Text in border after cursor right!\n\nBefore:\n${initial}\n\nAfter:\n${after}`)
    }
  })

  test("text change forces calculateLayout, borderColor change corrupts card heights", () => {
    // KEY TEST: This mimics km-tui where a text change (top bar breadcrumb)
    // triggers calculateLayout(), while borderColor changes on cards don't
    // themselves trigger layout. The re-layout exposes a bug where cards
    // that didn't change get incorrect heights.
    let setSelectedCol: Dispatch<SetStateAction<number>>

    const col1Cards = [
      "AAAA BBBB CCCC DDDD EEEE FFFF GGGG HHHH IIII JJJJ KKKK LLLL",
      "example.com/path/to/some/resource/that/is/quite/long",
      "Short task 1",
      "Another medium-length task description here",
    ]
    const col2Cards = ["Task in col2", "Second task in col2 with more detail"]

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
              <Box
                key={i}
                flexDirection="column"
                flexShrink={0}
                width={width - 2}
                borderStyle="round"
                borderColor={colIdx === selectedCol && i === 0 ? "yellow" : "blackBright"}
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
        </Box>
      )

      return (
        <Box flexDirection="column" width={80} height={24}>
          {/* Top bar with CHANGING text — forces calculateLayout() */}
          <Box flexShrink={0} width={80}>
            <Text wrap="truncate">
              {selectedCol === 0 ? " / col1 / some-breadcrumb-path-that-is-different" : " / col2"}
            </Text>
          </Box>
          <Box flexGrow={1} flexDirection="row" minHeight={1} maxHeight={22} overflow="hidden">
            {renderCol(col1Cards, 0, 40)}
            <Box width={1} alignSelf="stretch" />
            {renderCol(col2Cards, 1, 39)}
          </Box>
          {/* Bottom bar */}
          <Box flexShrink={0} width={80}>
            <Text dimColor>MEM CARDS VIEW</Text>
          </Box>
        </Box>
      )
    }

    const render = createRenderer({ cols: 80, rows: 24 })
    const app = render(<Board />)

    const initial = app.text
    expect(hasTextInBorder(initial)).toBe(false)

    // Move cursor right — changes text AND borderColor
    React.act(() => {
      setSelectedCol!(1)
    })

    const after = app.text
    if (hasTextInBorder(after)) {
      throw new Error(`Text in border after cursor right with text change!\n\nBefore:\n${initial}\n\nAfter:\n${after}`)
    }
  })

  test("React.memo cards + text change forcing calculateLayout", () => {
    // The critical combination: React.memo prevents commitUpdate on unchanged
    // cards, while text change forces calculateLayout(). Without commitUpdate,
    // contentDirty is NOT set on the text nodes, so measure cache is used.
    let setSelectedCol: Dispatch<SetStateAction<number>>

    const col1Cards = [
      "AAAA BBBB CCCC DDDD EEEE FFFF GGGG HHHH IIII JJJJ KKKK LLLL",
      "example.com/path/to/some/resource/that/is/quite/long",
      "Short task 1",
      "Another medium-length task description here",
    ]
    const col2Cards = ["Task in col2", "Second task in col2 with more detail"]

    const MemoCard = React.memo(
      function MemoCard({ text, isSelected, width }: { text: string; isSelected: boolean; width: number }) {
        return (
          <Box
            flexDirection="column"
            flexShrink={0}
            width={width}
            borderStyle="round"
            borderColor={isSelected ? "yellow" : "blackBright"}
            paddingRight={1}
          >
            <Box flexDirection="column">
              <Box flexDirection="column">
                <Box
                  flexDirection="row"
                  alignItems="flex-start"
                  paddingLeft={0}
                  backgroundColor={isSelected ? "yellow" : undefined}
                >
                  <Box width={3} flexShrink={0}>
                    <Text wrap="truncate">{"· "}</Text>
                  </Box>
                  <Box flexGrow={1} flexShrink={1}>
                    <Text wrap="wrap">{text}</Text>
                  </Box>
                </Box>
              </Box>
            </Box>
          </Box>
        )
      },
      (prev, next) => prev.text === next.text && prev.isSelected === next.isSelected && prev.width === next.width,
    )

    function Board() {
      const [selectedCol, _setSelectedCol] = useState(0)
      setSelectedCol = _setSelectedCol

      return (
        <Box flexDirection="column" width={80} height={24} minHeight={3} overflow="hidden">
          <Box flexShrink={0} width={80} backgroundColor="white">
            <Text color="gray" wrap="truncate">
              {selectedCol === 0 ? " / col1 / long-breadcrumb-path-here" : " / col2"}
            </Text>
          </Box>
          <Box flexGrow={1} flexDirection="row" minHeight={1} maxHeight={22} overflow="hidden">
            <Box flexDirection="row" width={80} height={22}>
              <Box flexDirection="column" width={40} maxHeight={22} overflow="hidden">
                <Box height={1} flexShrink={0}>
                  <Text> </Text>
                </Box>
                <Box height={1} flexShrink={0} width={40}>
                  <Text bold color={selectedCol === 0 ? "yellow" : "white"} wrap="truncate">
                    {" · col1 (4)                             "}
                  </Text>
                </Box>
                <Box flexDirection="column" height={20} overflow="scroll" scrollTo={0}>
                  {col1Cards.map((text, i) => (
                    <MemoCard key={i} text={text} isSelected={selectedCol === 0 && i === 0} width={39} />
                  ))}
                </Box>
              </Box>
              <Box width={1} alignSelf="stretch" />
              <Box flexDirection="column" width={39} maxHeight={22} overflow="hidden">
                <Box height={1} flexShrink={0}>
                  <Text> </Text>
                </Box>
                <Box height={1} flexShrink={0} width={39}>
                  <Text bold color={selectedCol === 1 ? "yellow" : "white"} wrap="truncate">
                    {" · col2 (2)                            "}
                  </Text>
                </Box>
                <Box flexDirection="column" height={20} overflow="scroll" scrollTo={0}>
                  {col2Cards.map((text, i) => (
                    <MemoCard key={i} text={text} isSelected={selectedCol === 1 && i === 0} width={38} />
                  ))}
                </Box>
              </Box>
            </Box>
          </Box>
          <Box flexDirection="row" flexShrink={0} width={80}>
            <Text dimColor>MEM CARDS VIEW</Text>
          </Box>
        </Box>
      )
    }

    const render = createRenderer({ cols: 80, rows: 24 })
    const app = render(<Board />)

    const initial = app.text
    expect(hasTextInBorder(initial)).toBe(false)

    React.act(() => {
      setSelectedCol!(1)
    })

    const after = app.text
    if (hasTextInBorder(after)) {
      throw new Error(`Text in border with React.memo + text change!\n\nBefore:\n${initial}\n\nAfter:\n${after}`)
    }
  })

  test("exact km-tui structure: column-row wrapper with height=22", () => {
    // Matches km-tui's tree exactly: board → top-bar → flexGrow container →
    // column-row (width=80 height=22) → col1/col2
    let setSelectedCol: Dispatch<SetStateAction<number>>

    const col1Cards = [
      "AAAA BBBB CCCC DDDD EEEE FFFF GGGG HHHH IIII JJJJ KKKK LLLL",
      "example.com/path/to/some/resource/that/is/quite/long",
      "Short task 1",
      "Another medium-length task description here",
    ]
    const col2Cards = ["Task in col2", "Second task in col2 with more detail"]

    function Board() {
      const [selectedCol, _setSelectedCol] = useState(0)
      setSelectedCol = _setSelectedCol

      return (
        <Box flexDirection="column" width={80} height={24} minHeight={3} overflow="hidden">
          {/* Top bar — text CHANGES to force calculateLayout() */}
          <Box flexShrink={0} width={80} backgroundColor="white">
            <Text color="gray" wrap="truncate">
              {selectedCol === 0 ? " / col1 / long-breadcrumb-path-here" : " / col2"}
            </Text>
          </Box>
          {/* Column container with flexGrow */}
          <Box flexGrow={1} flexDirection="row" minHeight={1} maxHeight={22} overflow="hidden">
            {/* column-row wrapper with explicit width and height — km-tui has this */}
            <Box flexDirection="row" width={80} height={22}>
              {/* Col 1 */}
              <Box flexDirection="column" width={40} maxHeight={22} overflow="hidden">
                <Box height={1} flexShrink={0}>
                  <Text> </Text>
                </Box>
                <Box height={1} flexShrink={0} width={40}>
                  <Text bold color={selectedCol === 0 ? "yellow" : "white"} wrap="truncate">
                    {" · col1 (4)                             "}
                  </Text>
                </Box>
                <Box flexDirection="column" height={20} overflow="scroll" scrollTo={0}>
                  {col1Cards.map((text, i) => (
                    <Box
                      key={i}
                      flexDirection="column"
                      flexShrink={0}
                      width={39}
                      borderStyle="round"
                      borderColor={selectedCol === 0 && i === 0 ? "yellow" : "blackBright"}
                      paddingRight={1}
                    >
                      <Box flexDirection="column">
                        <Box flexDirection="column">
                          <Box
                            flexDirection="row"
                            alignItems="flex-start"
                            paddingLeft={0}
                            backgroundColor={selectedCol === 0 && i === 0 ? "yellow" : undefined}
                          >
                            <Box width={3} flexShrink={0}>
                              <Text wrap="truncate">{"· "}</Text>
                            </Box>
                            <Box flexGrow={1} flexShrink={1}>
                              <Text wrap="wrap">{text}</Text>
                            </Box>
                          </Box>
                        </Box>
                      </Box>
                    </Box>
                  ))}
                </Box>
              </Box>
              {/* Divider */}
              <Box width={1} alignSelf="stretch" />
              {/* Col 2 */}
              <Box flexDirection="column" width={39} maxHeight={22} overflow="hidden">
                <Box height={1} flexShrink={0}>
                  <Text> </Text>
                </Box>
                <Box height={1} flexShrink={0} width={39}>
                  <Text bold color={selectedCol === 1 ? "yellow" : "white"} wrap="truncate">
                    {" · col2 (2)                            "}
                  </Text>
                </Box>
                <Box flexDirection="column" height={20} overflow="scroll" scrollTo={0}>
                  {col2Cards.map((text, i) => (
                    <Box
                      key={i}
                      flexDirection="column"
                      flexShrink={0}
                      width={38}
                      borderStyle="round"
                      borderColor={selectedCol === 1 && i === 0 ? "yellow" : "blackBright"}
                      paddingRight={1}
                    >
                      <Box flexDirection="column">
                        <Box flexDirection="column">
                          <Box
                            flexDirection="row"
                            alignItems="flex-start"
                            paddingLeft={0}
                            backgroundColor={selectedCol === 1 && i === 0 ? "yellow" : undefined}
                          >
                            <Box width={3} flexShrink={0}>
                              <Text wrap="truncate">{"· "}</Text>
                            </Box>
                            <Box flexGrow={1} flexShrink={1}>
                              <Text wrap="wrap">{text}</Text>
                            </Box>
                          </Box>
                        </Box>
                      </Box>
                    </Box>
                  ))}
                </Box>
              </Box>
            </Box>
          </Box>
          {/* Bottom bar */}
          <Box flexDirection="row" flexShrink={0} width={80}>
            <Text dimColor>MEM CARDS VIEW</Text>
          </Box>
        </Box>
      )
    }

    const render = createRenderer({ cols: 80, rows: 24 })
    const app = render(<Board />)

    const initial = app.text
    expect(hasTextInBorder(initial)).toBe(false)

    // Move cursor right — changes text AND borderColor
    React.act(() => {
      setSelectedCol!(1)
    })

    const after = app.text
    if (hasTextInBorder(after)) {
      throw new Error(
        `Text in border after cursor right with exact km-tui structure!\n\nBefore:\n${initial}\n\nAfter:\n${after}`,
      )
    }
  })
})
