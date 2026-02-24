/**
 * Regression test: text content must not overflow into border rows.
 *
 * When a Box has borderStyle, text children should be constrained to the
 * content area (inside the border). The text measure function must respect
 * the height constraint from the layout engine to prevent text lines from
 * rendering into border rows.
 *
 * See: km-inkx.border-text-overflow
 */

import { describe, expect, test } from "vitest"
import { Box, Text } from "../src/index.js"
import { createRenderer } from "inkx/testing"
import { outputPhase } from "../src/pipeline/output-phase.js"
import { VirtualTerminal } from "../src/with-diagnostics.js"

describe("border text overflow", () => {
  test("wrapped text does not bleed into bottom border row", () => {
    const render = createRenderer({ cols: 20, rows: 10 })

    // A 10-wide, 5-high bordered box. Content area = 8x3.
    // "Hello World This Is Long Text" wraps to 5+ lines at width 8,
    // but only 3 should render (the content area height).
    const app = render(
      <Box borderStyle="single" width={10} height={5}>
        <Text>Hello World This Is Long Text</Text>
      </Box>,
    )

    const lines = app.text.split("\n")

    // Line 0: top border
    expect(lines[0]).toMatch(/^┌────────┐/)

    // Lines 1-3: content rows with intact side borders
    expect(lines[1]).toMatch(/^│.{8}│$/)
    expect(lines[2]).toMatch(/^│.{8}│$/)
    expect(lines[3]).toMatch(/^│.{8}│$/)

    // Line 4: bottom border should be intact (no text bleeding in)
    expect(lines[4]).toMatch(/^└────────┘/)
  })

  test("text node height is constrained to content area inside border", () => {
    const render = createRenderer({ cols: 20, rows: 10 })

    const app = render(
      <Box borderStyle="single" width={10} height={5} testID="box">
        <Text testID="text">Hello World This Is Long Text</Text>
      </Box>,
    )

    const textBox = app.getByTestId("text").boundingBox()!
    // Text should be at (1,1) with width=8 (or less) and height<=3
    // The content area is 8 wide and 3 tall (10-2 borders, 5-2 borders)
    expect(textBox.x).toBe(1)
    expect(textBox.y).toBe(1)
    expect(textBox.width).toBeLessThanOrEqual(8)
    expect(textBox.height).toBeLessThanOrEqual(3)
  })

  test("truncated text does not bleed into right border", () => {
    const render = createRenderer({ cols: 20, rows: 5 })

    // wrap=false (truncate mode) — text should truncate at content width
    const app = render(
      <Box borderStyle="single" width={10} height={3}>
        <Text wrap={false}>ABCDEFGHIJ</Text>
      </Box>,
    )

    const lines = app.text.split("\n")
    // Right border should be intact
    expect(lines[1]).toMatch(/│$/)
    // Full text should not appear
    expect(lines[1]).not.toContain("ABCDEFGHIJ")
  })

  test("round border text overflow", () => {
    const render = createRenderer({ cols: 20, rows: 10 })

    const app = render(
      <Box borderStyle="round" width={10} height={5}>
        <Text>Hello World This Is Long Text</Text>
      </Box>,
    )

    const lines = app.text.split("\n")

    // Bottom border should be intact
    expect(lines[4]).toMatch(/^╰────────╯/)
  })

  test("row layout inside bordered box: text does not bleed into right border", () => {
    const render = createRenderer({ cols: 30, rows: 5 })

    // Simulates a card with title text + right-aligned date badge
    // Card width = 25, content area = 23 (25 - 2 borders)
    const app = render(
      <Box borderStyle="round" width={25} height={3} flexDirection="column">
        <Box flexDirection="row">
          <Box flexGrow={1} flexShrink={1}>
            <Text wrap="wrap">After Delei gets ring - change to d@delei.org</Text>
          </Box>
          <Box flexShrink={0}>
            <Text wrap="truncate"> Sep 30</Text>
          </Box>
        </Box>
      </Box>,
    )

    const lines = app.text.split("\n")

    // Top border should be intact
    expect(lines[0]).toMatch(/^╭.*╮$/)

    // Content rows: right border character must be present (not overwritten by text)
    expect(lines[1]).toMatch(/╯$|│$|╮$/)

    // Every non-empty line that should have a right border must end with a border char
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      if (!line || line.trim() === "") continue
      // The line should end with a border character, not with text content
      const lastChar = line[line.length - 1]
      expect(
        ["╭", "╮", "│", "╰", "╯"].includes(lastChar!),
        `Line ${i} ends with "${lastChar}" instead of a border character: "${line}"`,
      ).toBe(true)
    }
  })

  test("text filling exact content width preserves right border", () => {
    const render = createRenderer({ cols: 20, rows: 5 })

    // Box width=12, content area=10.
    // Text "ABCDEFGHIJ" is exactly 10 chars — fills content area perfectly.
    // Right border must still be intact.
    const app = render(
      <Box borderStyle="single" width={12} height={3}>
        <Text>ABCDEFGHIJ</Text>
      </Box>,
    )

    const lines = app.text.split("\n")

    // Content line: text fills exactly, right border intact
    expect(lines[1]).toBe("│ABCDEFGHIJ│")
  })

  test("row layout with flexGrow text + flexShrink=0 date: right border intact", () => {
    const render = createRenderer({ cols: 30, rows: 5 })

    // Simulates card: bordered box with row layout containing
    // growing title text + fixed date badge
    // Width=20, content area=18 (after borders)
    const app = render(
      <Box borderStyle="round" width={20} height={3}>
        <Box flexDirection="row">
          <Box flexGrow={1} flexShrink={1}>
            <Text wrap="truncate">Short title here</Text>
          </Box>
          <Box flexShrink={0}>
            <Text wrap="truncate"> Sep 30</Text>
          </Box>
        </Box>
      </Box>,
    )

    const lines = app.text.split("\n")

    // Top border: 20 chars total = ╭ + 18 horizontal + ╮
    expect(lines[0]!.length).toBe(20)
    expect(lines[0]![0]).toBe("╭")
    expect(lines[0]![19]).toBe("╮")

    // Content row: must end with right border ╮/│
    expect(lines[1]!.length).toBe(20)
    expect(lines[1]![0]).toBe("│")
    expect(lines[1]![19]).toBe("│")

    // Bottom border
    expect(lines[2]!.length).toBe(20)
    expect(lines[2]![0]).toBe("╰")
    expect(lines[2]![19]).toBe("╯")
  })

  test("ANSI-colored text in bordered box preserves right border", () => {
    const render = createRenderer({ cols: 30, rows: 5 })

    // Date badge with ANSI red color (like overdue dates)
    const redText = "\x1b[31mSep 30\x1b[0m"

    const app = render(
      <Box borderStyle="round" width={20} height={3}>
        <Box flexDirection="row">
          <Box flexGrow={1} flexShrink={1}>
            <Text wrap="truncate">Title text</Text>
          </Box>
          <Box flexShrink={0}>
            <Text wrap="truncate"> {redText}</Text>
          </Box>
        </Box>
      </Box>,
    )

    const lines = app.text.split("\n")

    // Content row: must end with right border
    expect(lines[1]!.length).toBe(20)
    expect(lines[1]![0]).toBe("│")
    expect(lines[1]![19]).toBe("│")
  })

  test("card-like layout: prefix + flexGrow title + date badge in bordered box", () => {
    const render = createRenderer({ cols: 30, rows: 5 })

    const app = render(
      <Box borderStyle="round" width={25} height={3}>
        <Box flexDirection="row" height={1}>
          <Box width={2} flexShrink={0}>
            <Text>□ </Text>
          </Box>
          <Box flexGrow={1} flexShrink={1} overflow="hidden">
            <Text wrap="truncate">After Delei gets ring - change to d@delei.org</Text>
          </Box>
          <Box flexShrink={0}>
            <Text wrap="truncate"> Sep 30</Text>
          </Box>
        </Box>
      </Box>,
    )

    const lines = app.text.split("\n")

    // Every line should have correct border characters
    // Top border
    expect(lines[0]![0]).toBe("╭")
    expect(lines[0]![24]).toBe("╮")

    // Content row - right border must be intact
    const contentLine = lines[1]!
    expect(contentLine[0]).toBe("│")
    expect(contentLine[24]).toBe("│")
    expect(contentLine.length).toBe(25)

    // Bottom border
    expect(lines[2]![0]).toBe("╰")
    expect(lines[2]![24]).toBe("╯")
  })

  test("border integrity at various widths with date badge", () => {
    // Test a range of widths to check for edge-based rounding issues
    for (const totalWidth of [20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 35, 40]) {
      const render = createRenderer({ cols: totalWidth + 5, rows: 5 })

      const app = render(
        <Box borderStyle="round" width={totalWidth} height={3}>
          <Box flexDirection="row" height={1}>
            <Box width={2} flexShrink={0}>
              <Text>□ </Text>
            </Box>
            <Box flexGrow={1} flexShrink={1} overflow="hidden">
              <Text wrap="truncate">After Delei gets ring - change to d@delei.org</Text>
            </Box>
            <Box flexShrink={0}>
              <Text color="red" wrap="truncate">
                {" "}
                Sep 30
              </Text>
            </Box>
          </Box>
        </Box>,
      )

      const lines = app.text.split("\n")
      const contentLine = lines[1]!

      expect(contentLine.length, `Width=${totalWidth}: content line length should be ${totalWidth}`).toBe(totalWidth)

      expect(contentLine[0], `Width=${totalWidth}: left border missing`).toBe("│")

      expect(contentLine[totalWidth - 1], `Width=${totalWidth}: right border missing. Line: "${contentLine}"`).toBe("│")
    }
  })

  test("incremental render: cursor move preserves border on row with date badge", () => {
    const render = createRenderer({ cols: 30, rows: 10 })

    // First render: card not selected (no special border color)
    function Card({ selected }: { selected: boolean }) {
      return (
        <Box borderStyle="round" width={25} borderColor={selected ? "yellow" : "gray"}>
          <Box flexDirection="row" height={1}>
            <Box width={2} flexShrink={0}>
              <Text>□ </Text>
            </Box>
            <Box flexGrow={1} flexShrink={1} overflow="hidden">
              <Text wrap="truncate">After Delei gets ring - change to d@delei.org</Text>
            </Box>
            <Box flexShrink={0}>
              <Text color="red" wrap="truncate">
                {" "}
                Sep 30
              </Text>
            </Box>
          </Box>
        </Box>
      )
    }

    const app = render(<Card selected={false} />)

    // First render: check borders
    let lines = app.text.split("\n")
    expect(lines[0]![0]).toBe("╭")
    expect(lines[0]![24]).toBe("╮")
    expect(lines[1]![0]).toBe("│")
    expect(lines[1]![24]).toBe("│")

    // Incremental render: select the card (changes border color)
    app.rerender(<Card selected={true} />)

    // After incremental render: borders must still be intact
    lines = app.text.split("\n")
    expect(lines[0]![0]).toBe("╭")
    expect(lines[0]![24]).toBe("╮")
    expect(lines[1]![0]).toBe("│")
    expect(lines[1]![24]).toBe("│")
    expect(lines[2]![0]).toBe("╰")
    expect(lines[2]![24]).toBe("╯")
  })

  test("exact production card structure: bordered column > column > row with ANSI date badge", () => {
    // This mirrors the EXACT production component tree:
    // Box (border, column) > CardLayoutRegistrar (null) > HeadRow
    //   > Box (column) > HeadLayoutRegistrar (null) > Box (row, bg, height=1, alignItems=flex-start)
    //     > Box (prefix, width=2) > Box (content, flexGrow, overflow=hidden) > Box (badge, flexShrink=0)
    //
    // The date badge text contains ANSI codes (red for overdue dates).
    for (const totalWidth of [25, 30, 35, 38, 40]) {
      const render = createRenderer({ cols: totalWidth + 5, rows: 10 })

      const redDateBadge = "\x1b[31mSep 30\x1b[0m"

      const app = render(
        <Box
          borderStyle="round"
          width={totalWidth}
          borderColor="gray"
          flexDirection="column"
          flexShrink={0}
          testID="card"
        >
          {/* HeadRow wrapper (column direction) */}
          <Box flexDirection="column">
            {/* The actual head row */}
            <Box flexDirection="row" alignItems="flex-start" height={1} testID="headrow">
              {/* Prefix */}
              <Box width={2} flexShrink={0}>
                <Text>□ </Text>
              </Box>
              {/* Content */}
              <Box flexGrow={1} flexShrink={1} overflow="hidden">
                <Text bold wrap="truncate">
                  After Delei gets ring - change to d@delei.org
                </Text>
              </Box>
              {/* Date badge with ANSI color codes */}
              <Box flexShrink={0} testID="badge">
                <Text wrap="truncate"> {redDateBadge}</Text>
              </Box>
            </Box>
          </Box>
        </Box>,
      )

      const lines = app.text.split("\n").filter((l) => l.length > 0)

      // Every non-empty line must have correct border characters
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!
        if (line.length === 0) continue

        expect(line.length, `Width=${totalWidth}: Line ${i} width`).toBe(totalWidth)

        expect(
          ["╭", "│", "╰"].includes(line[0]!),
          `Width=${totalWidth}: Line ${i} left border: "${line[0]}" in "${line}"`,
        ).toBe(true)

        expect(
          ["╮", "│", "╯"].includes(line[totalWidth - 1]!),
          `Width=${totalWidth}: Line ${i} right border: "${line[totalWidth - 1]}" in "${line}"`,
        ).toBe(true)
      }

      // Verify badge doesn't extend into border column
      const badgeBox = app.getByTestId("badge").boundingBox()!
      expect(
        badgeBox.x + badgeBox.width,
        `Width=${totalWidth}: Badge right edge (${badgeBox.x + badgeBox.width}) must be <= ${totalWidth - 1}`,
      ).toBeLessThanOrEqual(totalWidth - 1)
    }
  })

  test("buffer cell inspection: right border character at border column", () => {
    // Check that the border character "│" is present at the right border column
    // in the buffer, not just in the text output (which strips ANSI and could mask issues)
    const render = createRenderer({ cols: 30, rows: 5 })
    const redDateBadge = "\x1b[31mSep 30\x1b[0m"

    const app = render(
      <Box borderStyle="round" width={25} height={3} borderColor="gray" flexDirection="column" flexShrink={0}>
        <Box flexDirection="column">
          <Box flexDirection="row" alignItems="flex-start" height={1}>
            <Box width={2} flexShrink={0}>
              <Text>□ </Text>
            </Box>
            <Box flexGrow={1} flexShrink={1} overflow="hidden">
              <Text bold wrap="truncate">
                After Delei gets ring - change to d@delei.org
              </Text>
            </Box>
            <Box flexShrink={0}>
              <Text wrap="truncate"> {redDateBadge}</Text>
            </Box>
          </Box>
        </Box>
      </Box>,
    )

    const buffer = app.lastBuffer()!
    // Content row (y=1): check each cell
    // Column 0: left border │
    expect(buffer.getCellChar(0, 1)).toBe("│")
    // Column 24: right border │
    expect(buffer.getCellChar(24, 1), `Cell at (24,1) should be │ but is "${buffer.getCellChar(24, 1)}"`).toBe("│")

    // Verify no content cell overwrites the border position
    for (let y = 0; y < 3; y++) {
      const leftChar = buffer.getCellChar(0, y)
      const rightChar = buffer.getCellChar(24, y)
      expect(["╭", "│", "╰"].includes(leftChar!), `Buffer (0,${y}): expected left border, got "${leftChar}"`).toBe(true)
      expect(["╮", "│", "╯"].includes(rightChar!), `Buffer (24,${y}): expected right border, got "${rightChar}"`).toBe(
        true,
      )
    }
  })

  test("singlePassLayout: border intact with ANSI date badge on rerender", () => {
    const render = createRenderer({ cols: 30, rows: 5, singlePassLayout: true })

    const redDateBadge = "\x1b[31mSep 30\x1b[0m"

    function Card({ selected }: { selected: boolean }) {
      return (
        <Box
          borderStyle="round"
          width={25}
          height={3}
          borderColor={selected ? "yellow" : "gray"}
          flexDirection="column"
          flexShrink={0}
        >
          <Box flexDirection="column">
            <Box flexDirection="row" alignItems="flex-start" height={1} backgroundColor={selected ? "blue" : undefined}>
              <Box width={2} flexShrink={0}>
                <Text>□ </Text>
              </Box>
              <Box flexGrow={1} flexShrink={1} overflow="hidden">
                <Text bold wrap="truncate">
                  After Delei gets ring - change to d@delei.org
                </Text>
              </Box>
              <Box flexShrink={0}>
                <Text wrap="truncate"> {redDateBadge}</Text>
              </Box>
            </Box>
          </Box>
        </Box>
      )
    }

    // First render
    const app = render(<Card selected={false} />)
    let lines = app.text.split("\n")

    expect(lines[0]![0]).toBe("╭")
    expect(lines[0]![24]).toBe("╮")
    expect(lines[1]![0]).toBe("│")
    expect(lines[1]![24]).toBe("│")
    expect(lines[1]!.length).toBe(25)
    expect(lines[2]![0]).toBe("╰")
    expect(lines[2]![24]).toBe("╯")

    // Second render (incremental): select the card
    app.rerender(<Card selected={true} />)
    lines = app.text.split("\n")

    expect(lines[0]![0]).toBe("╭")
    expect(lines[0]![24]).toBe("╮")
    expect(lines[1]![0]).toBe("│")
    expect(lines[1]![24], `Right border missing on content row after rerender: "${lines[1]}"`).toBe("│")
    expect(lines[1]!.length).toBe(25)
    expect(lines[2]![0]).toBe("╰")
    expect(lines[2]![24]).toBe("╯")

    // Third render (incremental): deselect
    app.rerender(<Card selected={false} />)
    lines = app.text.split("\n")

    expect(lines[1]![24], `Right border missing after deselect: "${lines[1]}"`).toBe("│")
    expect(lines[1]!.length).toBe(25)
  })

  test("auto-height bordered box with wrapping text and date badge", () => {
    const render = createRenderer({ cols: 30, rows: 10 })

    // Auto-height card (no explicit height on bordered box)
    // Title wraps, date badge on first line
    const app = render(
      <Box borderStyle="round" width={25} testID="card">
        <Box flexDirection="row" alignItems="flex-start" testID="row">
          <Box width={2} flexShrink={0} testID="prefix">
            <Text>□ </Text>
          </Box>
          <Box flexGrow={1} flexShrink={1} testID="content">
            <Text wrap="wrap">After Delei gets ring - change to d@delei.org</Text>
          </Box>
          <Box flexShrink={0} testID="badge">
            <Text wrap="truncate"> Sep 30</Text>
          </Box>
        </Box>
      </Box>,
    )

    // Extra check: verify the badge box doesn't extend into the border column
    const badgeCheck = app.getByTestId("badge").boundingBox()!
    const rightEdge = badgeCheck.x + badgeCheck.width
    // Badge right edge must be <= 24 (column 24 is the right border of the 25-wide box)
    expect(rightEdge, `Badge right edge (${rightEdge}) must not reach border column 24`).toBeLessThanOrEqual(24)

    const lines = app.text.split("\n").filter((l) => l.length > 0)

    // Check bounding boxes to understand layout
    const cardBox = app.getByTestId("card").boundingBox()!
    const rowBox = app.getByTestId("row").boundingBox()!
    const prefixBox = app.getByTestId("prefix").boundingBox()!
    const contentBox = app.getByTestId("content").boundingBox()!
    const badgeBox = app.getByTestId("badge").boundingBox()!

    // Card should be 25 wide
    expect(cardBox.width).toBe(25)

    // Row should be inside border: x=1, width=23
    expect(rowBox.x).toBe(1)
    expect(rowBox.width).toBe(23)

    // Badge's right edge should be within content area (not in border column)
    expect(badgeBox.x + badgeBox.width).toBeLessThanOrEqual(24) // 24 is border column

    // Every non-empty line must have correct border characters
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!
      if (line.length === 0) continue

      // Line should be exactly 25 chars wide (the box width)
      expect(line.length, `Line ${i} width`).toBe(25)

      // First char should be a left border char
      expect(["╭", "│", "╰"].includes(line[0]!), `Line ${i} left border: "${line[0]}" in "${line}"`).toBe(true)

      // Last char should be a right border char
      expect(["╮", "│", "╯"].includes(line[24]!), `Line ${i} right border: "${line[24]}" in "${line}"`).toBe(true)
    }
  })

  test("wrapped text with date badge: border intact on all rows (matches screenshot bug)", () => {
    // Reproduces the exact layout from the screenshot bug:
    // Card root at depth=0 in multiline variant — text wraps, no overflow hidden,
    // no height constraint. Date badge "Sep 30" in red ANSI on first row.
    // Bug: right border │ missing on first content row only.
    const render = createRenderer({ cols: 30, rows: 10 })
    const redDateBadge = "\x1b[31mSep 30\x1b[0m"

    function Card({ selected }: { selected: boolean }) {
      return (
        <Box
          borderStyle="round"
          width={25}
          borderColor={selected ? "yellow" : "gray"}
          flexDirection="column"
          flexShrink={0}
        >
          {/* HeadRow wrapper */}
          <Box flexDirection="column">
            {/* Inner row: prefix + content (wrapping!) + date badge */}
            <Box flexDirection="row" alignItems="flex-start" backgroundColor={selected ? "blue" : undefined}>
              {/* Prefix: fold marker + status icon */}
              <Box width={2} flexShrink={0}>
                <Text>□ </Text>
              </Box>
              {/* Content: NO overflow, NO height constraint, wrap="wrap" */}
              <Box flexGrow={1} flexShrink={1}>
                <Text bold wrap="wrap">
                  After Delei gets ring - change to d@delei.org
                </Text>
              </Box>
              {/* Date badge: flexShrink=0 */}
              <Box flexShrink={0}>
                <Text wrap="truncate"> {redDateBadge}</Text>
              </Box>
            </Box>
          </Box>
        </Box>
      )
    }

    // First render
    const app = render(<Card selected={false} />)
    const lines = app.text.split("\n").filter((l) => l.length > 0)

    // Card should have wrapped text — more than 3 lines (top border + content rows + bottom border)
    expect(lines.length).toBeGreaterThan(3)

    // Check ALL content rows have borders
    const buffer = app.lastBuffer()!
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!
      // Left border at column 0
      expect(["╭", "│", "╰"].includes(line[0]!), `Line ${i} left border: "${line[0]}" in "${line}"`).toBe(true)
      // Right border at column 24
      expect(["╮", "│", "╯"].includes(line[24]!), `Line ${i} right border: "${line[24]}" in "${line}"`).toBe(true)
    }

    // Buffer check: verify right border on ALL rows
    for (let y = 0; y < lines.length; y++) {
      const rightChar = buffer.getCellChar(24, y)
      expect(["╮", "│", "╯"].includes(rightChar!), `Buffer (24,${y}): expected right border, got "${rightChar}"`).toBe(
        true,
      )
    }

    // Incremental render: select the card
    app.rerender(<Card selected={true} />)
    const lines2 = app.text.split("\n").filter((l) => l.length > 0)

    // Verify borders intact after incremental render too
    for (let i = 0; i < lines2.length; i++) {
      const line = lines2[i]!
      expect(
        ["╮", "│", "╯"].includes(line[24]!),
        `After rerender, line ${i} right border: "${line[24]}" in "${line}"`,
      ).toBe(true)
    }
  })

  test("ANSI output replay: border characters survive full and incremental render", () => {
    const cols = 30
    const rows = 10
    const render = createRenderer({ cols, rows })
    const redDateBadge = "\x1b[31mSep 30\x1b[0m"

    function Card({ selected }: { selected: boolean }) {
      return (
        <Box
          borderStyle="round"
          width={25}
          borderColor={selected ? "yellow" : "gray"}
          flexDirection="column"
          flexShrink={0}
        >
          <Box flexDirection="column">
            <Box flexDirection="row" alignItems="flex-start" height={1} backgroundColor={selected ? "blue" : undefined}>
              <Box width={2} flexShrink={0}>
                <Text>□ </Text>
              </Box>
              <Box flexGrow={1} flexShrink={1} overflow="hidden">
                <Text bold wrap="truncate">
                  After Delei gets ring - change to d@delei.org
                </Text>
              </Box>
              <Box flexShrink={0}>
                <Text wrap="truncate"> {redDateBadge}</Text>
              </Box>
            </Box>
          </Box>
        </Box>
      )
    }

    // First render
    const app = render(<Card selected={false} />)
    const firstBuffer = app.lastBuffer()!

    // Get the ANSI output for first render (full buffer render)
    const firstAnsi = outputPhase(null, firstBuffer)

    // Replay on VirtualTerminal
    const vterm = new VirtualTerminal(cols, rows)
    vterm.applyAnsi(firstAnsi)

    // Check border characters in VirtualTerminal
    // Right border at column 24, content rows at y=1
    expect(vterm.getChar(0, 0), `VT first render: top-left border`).toBe("╭")
    expect(vterm.getChar(24, 0), `VT first render: top-right border`).toBe("╮")
    expect(vterm.getChar(0, 1), `VT first render: left border on content row`).toBe("│")
    expect(
      vterm.getChar(24, 1),
      `VT first render: right border on content row. Row chars: ${Array.from({ length: 25 }, (_, x) => vterm.getChar(x, 1)).join("")}`,
    ).toBe("│")
    expect(vterm.getChar(0, 2), `VT first render: bottom-left border`).toBe("╰")
    expect(vterm.getChar(24, 2), `VT first render: bottom-right border`).toBe("╯")

    // Second render (incremental): select the card
    app.rerender(<Card selected={true} />)
    const secondBuffer = app.lastBuffer()!

    // Get incremental ANSI diff
    const incrAnsi = outputPhase(firstBuffer, secondBuffer)

    // Apply incremental to VT (starting from first render state)
    const vterm2 = new VirtualTerminal(cols, rows)
    vterm2.loadFromBuffer(firstBuffer)
    vterm2.applyAnsi(incrAnsi)

    // Check border characters after incremental update
    expect(vterm2.getChar(24, 0), `VT incremental: top-right border`).toBe("╮")
    expect(
      vterm2.getChar(24, 1),
      `VT incremental: right border on content row. Row chars: ${Array.from({ length: 25 }, (_, x) => vterm2.getChar(x, 1)).join("")}`,
    ).toBe("│")
    expect(vterm2.getChar(24, 2), `VT incremental: bottom-right border`).toBe("╯")

    // Compare VT2 against the buffer to check for any mismatches
    const mismatches = vterm2.compareToBuffer(secondBuffer)
    expect(
      mismatches.length,
      `Replay mismatches: ${mismatches
        .slice(0, 5)
        .map((m) => `(${m.x},${m.y}): expected="${m.expected}" actual="${m.actual}"`)
        .join("; ")}`,
    ).toBe(0)
  })
})
