/**
 * Test: Text wrap="wrap" inside flexGrow Box in a row.
 *
 * Bug: When text wraps to multiple lines inside a flexGrow child,
 * the row and parent containers don't grow to accommodate the extra lines.
 */
import { describe, expect, test } from "vitest"
import { createRenderer } from "../src/testing/index.js"
import React from "react"

const { Box, Text } = await import("../src/index.js")

const render = createRenderer({ cols: 40, rows: 20 })

describe("text wrap in flexGrow container", () => {
  test("bordered box grows when text wraps in flexGrow child", () => {
    const app = render(
      <Box borderStyle="single" width={40}>
        <Box flexDirection="row" testID="row">
          <Box width={3} flexShrink={0}>
            <Text>{"·  "}</Text>
          </Box>
          <Box flexGrow={1} flexShrink={1} testID="content">
            <Text wrap="wrap">Context: Found in inbox old DMV notices from 2019</Text>
          </Box>
        </Box>
      </Box>,
    )

    const lines = app.text.split("\n").filter((l) => l.trim().length > 0)
    // Should have:
    // - top border
    // - "·  Context: Found in inbox old DMV"
    // - "   notices from 2019"  (wrapped line)
    // - bottom border
    // Total: 4 non-empty lines
    expect(lines.length).toBeGreaterThanOrEqual(4)
    // The text "notices from 2019" should appear on its own line, NOT in the border
    expect(app.text).toContain("notices from 2019")
    // Should NOT appear on the border line
    expect(app.text).not.toMatch(/[└┘─].*notices from 2019/)
  })

  test("two stacked bordered cards with URL wrapping at narrow width", () => {
    // Reproduces card-layout regression at 40 cols:
    // URL text wraps to 4+ lines and last line bleeds onto bottom border
    const narrow = createRenderer({ cols: 40, rows: 30 })

    function CardBox({ children }: { children: React.ReactNode }): React.ReactElement {
      return (
        <Box borderStyle="round" paddingRight={1} flexShrink={0}>
          <Box flexDirection="column">
            <Box flexDirection="row" alignItems="flex-start">
              <Box width={3} flexShrink={0}>
                <Text>{"·  "}</Text>
              </Box>
              <Box flexGrow={1} flexShrink={1}>
                {children}
              </Box>
            </Box>
          </Box>
        </Box>
      )
    }

    // Test 1: plain stacking (no overflow container)
    const plain = narrow(
      <Box flexDirection="column" width={19}>
        <CardBox>
          <Text wrap="wrap">AAAA BBBB CCCC DDDD</Text>
        </CardBox>
        <CardBox>
          <Text wrap="wrap">example.com/path/to/some/resource/that/is/quite/long</Text>
        </CardBox>
      </Box>,
    )

    // Test 2: inside overflow="scroll" container (like VirtualList)
    const scrolled = narrow(
      <Box flexDirection="column" width={19} height={20} overflow="scroll">
        <CardBox>
          <Text wrap="wrap">AAAA BBBB CCCC DDDD</Text>
        </CardBox>
        <CardBox>
          <Text wrap="wrap">example.com/path/to/some/resource/that/is/quite/long</Text>
        </CardBox>
      </Box>,
    )

    for (const [label, app] of [
      ["plain", plain],
      ["overflow=scroll", scrolled],
    ] as const) {
      const text = app.text
      const lines = text.split("\n")
      const problems: string[] = []
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!
        const cardMatches = line.matchAll(/│([^│]+)│/g)
        for (const match of cardMatches) {
          const content = match[1]!
          if (/^[─━═]+$/.test(content)) continue
          if (content.length > 0 && content[content.length - 1] !== " ") {
            problems.push(`line ${i}: text touches border: │${content}│`)
          }
        }
        if (/│.*─.*[a-z].*│/.test(line) || /│.*[a-z].*─.*│/.test(line)) {
          if (!/^[╭╰│─╮╯\s]+$/.test(line)) {
            problems.push(`line ${i}: border chars mixed with text: ${line}`)
          }
        }
      }
      if (problems.length > 0) {
        throw new Error(`[${label}] Card border overflow:\n${problems.join("\n")}\n\nFull output:\n${text}`)
      }
    }
  })

  test("board-like two-column row: cards measure correctly at narrow widths", () => {
    // Reproduces the board structure: row of columns, each with overflow="scroll"
    // containing bordered cards with wrapping text.
    // Bug: text always measures as 2 lines regardless of terminal width,
    // because the row layout provides the wrong width to the text measure function.

    function CardBox({
      children,
      width: cardWidth,
      testID,
    }: {
      children: React.ReactNode
      width: number
      testID?: string
    }): React.ReactElement {
      return (
        <Box
          flexDirection="column"
          flexShrink={0}
          width={cardWidth}
          borderStyle="round"
          paddingRight={1}
          testID={testID}
        >
          <Box flexDirection="column" testID={testID ? `${testID}-inner` : undefined}>
            <Box flexDirection="row" alignItems="flex-start" testID={testID ? `${testID}-row` : undefined}>
              <Box width={3} flexShrink={0}>
                <Text>{"·  "}</Text>
              </Box>
              <Box flexGrow={1} flexShrink={1} testID={testID ? `${testID}-content` : undefined}>
                {children}
              </Box>
            </Box>
          </Box>
        </Box>
      )
    }

    for (const cols of [40, 50, 60, 70, 80, 100]) {
      const r = createRenderer({ cols, rows: 20 })

      // Replicate the Board layout: row of 2 columns
      const separatorWidth = 1
      const availableWidth = cols - separatorWidth
      const col1Width = Math.floor(availableWidth / 2) + (availableWidth % 2)
      const col2Width = Math.floor(availableWidth / 2)
      const card1Width = col1Width - 1
      const card2Width = col2Width - 1

      const app = r(
        <Box flexDirection="row" width={cols}>
          {/* Column 1 */}
          <Box flexDirection="column" width={col1Width} overflow="hidden">
            <Box height={1} flexShrink={0}>
              <Text> </Text>
            </Box>
            <Box height={1} flexShrink={0}>
              <Text wrap="truncate">{" · col1 (2)"}</Text>
            </Box>
            <Box flexDirection="column" height={16} overflow="scroll">
              <CardBox width={card1Width} testID="card1">
                <Text wrap="wrap" testID="aaaa-text">
                  AAAA BBBB CCCC DDDD EEEE FFFF GGGG HHHH IIII JJJJ KKKK LLLL
                </Text>
              </CardBox>
              <CardBox width={card1Width} testID="card2">
                <Text wrap="wrap">example.com/path/to/some/resource/that/is/quite/long</Text>
              </CardBox>
            </Box>
          </Box>

          {/* Separator */}
          <Box width={separatorWidth} flexShrink={0}>
            <Text> </Text>
          </Box>

          {/* Column 2 */}
          <Box flexDirection="column" width={col2Width} overflow="hidden">
            <Box height={1} flexShrink={0}>
              <Text> </Text>
            </Box>
            <Box height={1} flexShrink={0}>
              <Text wrap="truncate">{" · col2 (1)"}</Text>
            </Box>
            <Box flexDirection="column" height={16} overflow="scroll">
              <CardBox width={card2Width}>
                <Text wrap="wrap">short</Text>
              </CardBox>
            </Box>
          </Box>
        </Box>,
      )

      const text = app.text
      const lines = text.split("\n")
      const problems: string[] = []

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!
        const cardMatches = line.matchAll(/│([^│]+)│/g)
        for (const match of cardMatches) {
          const content = match[1]!
          if (/^[─━═]+$/.test(content)) continue
          if (content.length > 0 && content[content.length - 1] !== " ") {
            problems.push(`line ${i}: text touches border: │${content}│`)
          }
        }
      }

      if (problems.length > 0) {
        throw new Error(
          `[${cols}-col board layout] Card border overflow:\n${problems.join("\n")}\n\nFull output:\n${text}`,
        )
      }
    }
  })

  test("nested: card with wrapping child text", () => {
    // Matches the actual card structure: card > treenode > row > content > text
    const app = render(
      <Box borderStyle="round" width={39} paddingRight={1}>
        {/* TreeNode wrapper column */}
        <Box flexDirection="column">
          {/* HeadRow wrapper */}
          <Box flexDirection="column">
            {/* Actual row */}
            <Box flexDirection="row" alignItems="flex-start">
              <Box width={3} flexShrink={0}>
                <Text>{"•  "}</Text>
              </Box>
              <Box flexGrow={1} flexShrink={1}>
                <Text wrap="wrap">Title of the card</Text>
              </Box>
            </Box>
          </Box>

          {/* NodeChildren column */}
          <Box flexDirection="column">
            {/* Child TreeNode wrapper */}
            <Box flexDirection="column">
              {/* Child HeadRow */}
              <Box flexDirection="column">
                <Box flexDirection="row" alignItems="flex-start" paddingLeft={1}>
                  <Box width={4} flexShrink={0}>
                    <Text>{" ·  "}</Text>
                  </Box>
                  <Box flexGrow={1} flexShrink={1}>
                    <Text wrap="wrap">Context: Found in inbox old DMV notices from 2019</Text>
                  </Box>
                </Box>
              </Box>
            </Box>
          </Box>
        </Box>
      </Box>,
    )

    const text = app.text
    // The text should wrap and the card should grow
    expect(text).toContain("notices from 2019")
    // "notices from 2019" must NOT appear on a border line
    expect(text).not.toMatch(/[╰╯─].*notices.*[╰╯─]/)

    // Count content lines between borders
    const lines = text.split("\n")
    const borderTop = lines.findIndex((l) => l.includes("╭"))
    const borderBottom = lines.findIndex((l) => l.includes("╰"))
    const contentLines = borderBottom - borderTop - 1
    // Should have: title(1) + context line 1(1) + context line 2(1) = 3
    expect(contentLines).toBeGreaterThanOrEqual(3)
  })
})
