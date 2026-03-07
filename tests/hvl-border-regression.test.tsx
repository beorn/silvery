/**
 * HVL Border Regression Test
 *
 * Reproduces the border rendering bug after closing the detail pane.
 * The exact scenario from Board.tsx:
 *
 * 1. Outer container: flex-row with overflow="hidden", maxHeight=contentHeight
 * 2. Inside: HorizontalVirtualList (width=boardWidth) + optional DetailPane
 * 3. When detail pane toggles OFF, boardWidth expands from 72 -> 120
 * 4. HVL re-renders with more columns visible, borders must be correct
 *
 * The bug manifests as border corruption in incremental rendering when the
 * container width grows after the detail pane is removed. compareBuffers
 * detects character-level mismatches between incremental and fresh renders.
 */
import React from "react"
import { describe, expect, test } from "vitest"
import { Box, Text, HorizontalVirtualList } from "../src/index.js"
import { bufferToText } from "../src/buffer.js"
import { createRenderer, compareBuffers, formatMismatch } from "@hightea/term/testing"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TERM_COLS = 120
const TERM_ROWS = 30

function assertBuffersMatch(app: ReturnType<ReturnType<typeof createRenderer>>, label: string): void {
  const fresh = app.freshRender()
  const current = app.lastBuffer()!
  const mismatch = compareBuffers(current, fresh)
  if (mismatch) {
    const msg = formatMismatch(mismatch, {
      incrementalText: bufferToText(current),
      freshText: bufferToText(fresh),
    })
    throw new Error(`[${label}] Incremental/fresh mismatch:\n${msg}`)
  }
}

// ---------------------------------------------------------------------------
// Column data — 8 columns with distinct content for character-level detection
// ---------------------------------------------------------------------------

interface ColumnData {
  name: string
  borderColor: string
  tasks: string[]
}

const ALL_COLUMNS: ColumnData[] = [
  {
    name: "Backlog",
    borderColor: "gray",
    tasks: ["Design new login flow", "Research caching strategies", "Write API documentation"],
  },
  {
    name: "Todo",
    borderColor: "blue",
    tasks: ["Fix password reset bug", "Add unit tests for auth", "Review PR #142"],
  },
  {
    name: "In Progress",
    borderColor: "yellow",
    tasks: ["Implement OAuth2 flow", "Refactor database layer", "Add rate limiting"],
  },
  {
    name: "Review",
    borderColor: "magenta",
    tasks: ["Update deployment scripts", "Migrate to new SDK"],
  },
  {
    name: "Testing",
    borderColor: "cyan",
    tasks: ["Performance benchmarks", "Integration test suite", "Load testing setup", "Security audit"],
  },
  {
    name: "Staging",
    borderColor: "green",
    tasks: ["Release v2.4.0 candidate", "Update changelog"],
  },
  {
    name: "Done",
    borderColor: "greenBright",
    tasks: ["Setup CI pipeline", "Configure monitoring", "Add health checks", "Write runbook"],
  },
  {
    name: "Archived",
    borderColor: "blackBright",
    tasks: ["Legacy migration", "Old API deprecation"],
  },
]

// ---------------------------------------------------------------------------
// Simulated Column component — mirrors the real Column with borderStyle="round"
// ---------------------------------------------------------------------------

function SimColumn({
  col,
  width,
  height,
  isSelected,
}: {
  col: ColumnData
  width: number
  height: number
  isSelected: boolean
}) {
  return (
    <Box flexDirection="column" width={width} height={height}>
      <Box height={1}>
        <Text bold>
          {" "}
          {col.name} ({col.tasks.length})
        </Text>
      </Box>
      <Box flexDirection="column" flexGrow={1} overflow="scroll">
        {col.tasks.map((task, i) => (
          <Box
            key={task}
            flexShrink={0}
            borderStyle="round"
            borderColor={isSelected && i === 0 ? "yellow" : col.borderColor}
            paddingRight={1}
          >
            <Text>{task}</Text>
          </Box>
        ))}
      </Box>
    </Box>
  )
}

// ---------------------------------------------------------------------------
// Simulated DetailPane — mirrors CursorAwareDetailPane
// ---------------------------------------------------------------------------

function DetailPane({ width, height }: { width: number; height: number }) {
  return (
    <Box
      flexDirection="column"
      width={width}
      height={height}
      borderStyle="round"
      borderColor="white"
      paddingLeft={1}
      paddingRight={1}
    >
      <Text bold>Detail Pane</Text>
      <Text>Selected: Implement OAuth2 flow</Text>
      <Text dimColor>Status: in-progress</Text>
      <Text dimColor>Priority: high</Text>
      <Text dimColor>Assignee: beorn</Text>
      <Text> </Text>
      <Text>Description:</Text>
      <Text wrap="wrap">
        Implement the full OAuth2 authorization code flow with PKCE. This includes the authorization endpoint, token
        endpoint, and refresh token rotation.
      </Text>
    </Box>
  )
}

// ---------------------------------------------------------------------------
// Simulated HorizontalVirtualList — the key piece: overflow="hidden" outer Box
// with flexShrink={0} children rendered based on available width
// ---------------------------------------------------------------------------

function SimHVL({
  columns,
  width,
  height,
  scrollIndex,
  selectedCol,
  gap,
}: {
  columns: ColumnData[]
  width: number
  height: number
  scrollIndex: number
  selectedCol: number
  gap: number
}) {
  // Calculate how many columns fit (simplified HVL logic)
  const colWidth = Math.max(20, Math.floor((width - (columns.length - 1) * gap) / Math.min(columns.length, 4)))
  const maxVisible = Math.max(1, Math.floor((width + gap) / (colWidth + gap)))

  // Determine visible range based on scrollIndex
  const start = Math.min(scrollIndex, Math.max(0, columns.length - maxVisible))
  const end = Math.min(columns.length, start + maxVisible)
  const visible = columns.slice(start, end)

  return (
    <Box flexDirection="row" width={width} height={height} overflow="hidden">
      {visible.map((col, i) => {
        const actualIndex = start + i
        return (
          <React.Fragment key={col.name}>
            {i > 0 && <Box width={gap} flexShrink={0} />}
            <Box flexShrink={0}>
              <SimColumn col={col} width={colWidth} height={height} isSelected={actualIndex === selectedCol} />
            </Box>
          </React.Fragment>
        )
      })}
    </Box>
  )
}

// ---------------------------------------------------------------------------
// Board — the full simulated layout
// ---------------------------------------------------------------------------

function Board({
  showDetailPane,
  scrollIndex,
  selectedCol,
}: {
  showDetailPane: boolean
  scrollIndex: number
  selectedCol: number
}) {
  const termWidth = TERM_COLS
  const contentHeight = TERM_ROWS - 4 // top bar + spacer + bottom bar

  const detailPaneWidth = showDetailPane ? Math.floor(termWidth * 0.4) : 0
  const boardWidth = termWidth - detailPaneWidth

  return (
    <Box flexDirection="column" width={termWidth} height={TERM_ROWS}>
      {/* Top bar */}
      <Box height={1}>
        <Text bold> Board View</Text>
      </Box>
      <Box height={1} flexShrink={0} />

      {/* Main content area — the key structure from Board.tsx */}
      <Box flexGrow={1} flexDirection="row" minHeight={1} maxHeight={contentHeight} overflow="hidden">
        <SimHVL
          columns={ALL_COLUMNS}
          width={boardWidth}
          height={contentHeight}
          scrollIndex={scrollIndex}
          selectedCol={selectedCol}
          gap={1}
        />
        {showDetailPane && <DetailPane width={detailPaneWidth} height={contentHeight} />}
      </Box>

      {/* Bottom bar */}
      <Box height={1}>
        <Text dimColor> [h/l] navigate [Space] detail pane [q] quit</Text>
      </Box>
    </Box>
  )
}

// ===========================================================================
// Tests
// ===========================================================================

describe("HVL border regression: detail pane toggle", () => {
  /**
   * Core reproduction: wide -> narrow (detail pane on) -> scroll -> wide (detail pane off)
   * This is the exact user flow: Space (open detail) -> h (scroll left) -> Space (close detail)
   */
  test("full width -> detail pane open -> scroll -> detail pane close", () => {
    const render = createRenderer({ cols: TERM_COLS, rows: TERM_ROWS })

    // Step 1: Initial render — full width, no detail pane
    const app = render(<Board showDetailPane={false} scrollIndex={0} selectedCol={2} />)
    expect(app.text).toContain("Backlog")
    expect(app.text).toContain("In Progress")
    assertBuffersMatch(app, "Step 1: initial full width")

    // Step 2: Toggle detail pane ON — board shrinks to 72
    app.rerender(<Board showDetailPane={true} scrollIndex={0} selectedCol={2} />)
    expect(app.text).toContain("Detail Pane")
    assertBuffersMatch(app, "Step 2: detail pane open (narrow)")

    // Step 3: Change scroll index (simulate 'h' key — scroll left)
    app.rerender(<Board showDetailPane={true} scrollIndex={1} selectedCol={1} />)
    assertBuffersMatch(app, "Step 3: scroll change while narrow")

    // Step 4: Toggle detail pane OFF — board grows back to 120
    app.rerender(<Board showDetailPane={false} scrollIndex={1} selectedCol={1} />)
    assertBuffersMatch(app, "Step 4: detail pane close (wide again)")
  })

  /**
   * Variant: different scroll positions when closing the detail pane.
   * Tests that columns at different offsets render borders correctly.
   */
  test("detail pane close at different scroll positions", () => {
    const render = createRenderer({ cols: TERM_COLS, rows: TERM_ROWS })

    const app = render(<Board showDetailPane={false} scrollIndex={0} selectedCol={0} />)
    assertBuffersMatch(app, "initial")

    // Open detail pane
    app.rerender(<Board showDetailPane={true} scrollIndex={0} selectedCol={0} />)
    assertBuffersMatch(app, "detail open")

    // Scroll to middle columns
    app.rerender(<Board showDetailPane={true} scrollIndex={3} selectedCol={3} />)
    assertBuffersMatch(app, "scroll to middle while narrow")

    // Close detail pane at scroll position 3
    app.rerender(<Board showDetailPane={false} scrollIndex={3} selectedCol={3} />)
    assertBuffersMatch(app, "detail close at scroll=3")

    // Open again
    app.rerender(<Board showDetailPane={true} scrollIndex={3} selectedCol={3} />)
    assertBuffersMatch(app, "detail reopen at scroll=3")

    // Scroll to end
    app.rerender(<Board showDetailPane={true} scrollIndex={6} selectedCol={6} />)
    assertBuffersMatch(app, "scroll to end while narrow")

    // Close at end
    app.rerender(<Board showDetailPane={false} scrollIndex={6} selectedCol={6} />)
    assertBuffersMatch(app, "detail close at scroll=6")
  })

  /**
   * Variant with different content per column — catches character-level corruption.
   * The distinct text in each column makes it easy to detect if column content
   * bleeds into the wrong position after a width change.
   */
  test("character-level content integrity across width changes", () => {
    const render = createRenderer({ cols: TERM_COLS, rows: TERM_ROWS })

    const app = render(<Board showDetailPane={false} scrollIndex={0} selectedCol={0} />)

    // Verify distinct content renders correctly
    expect(app.text).toContain("Backlog")
    expect(app.text).toContain("Design new login flow")
    assertBuffersMatch(app, "initial content check")

    // Rapid toggle cycle
    app.rerender(<Board showDetailPane={true} scrollIndex={0} selectedCol={0} />)
    assertBuffersMatch(app, "toggle 1: open")

    app.rerender(<Board showDetailPane={false} scrollIndex={0} selectedCol={0} />)
    assertBuffersMatch(app, "toggle 1: close")

    app.rerender(<Board showDetailPane={true} scrollIndex={0} selectedCol={0} />)
    assertBuffersMatch(app, "toggle 2: open")

    app.rerender(<Board showDetailPane={false} scrollIndex={0} selectedCol={0} />)
    assertBuffersMatch(app, "toggle 2: close")

    // Verify content is still correct after multiple toggles
    expect(app.text).toContain("Backlog")
    expect(app.text).toContain("Design new login flow")
  })

  /**
   * Multiple toggle cycles with scroll changes between each.
   * This is the most stressful test — every toggle changes the visible set.
   */
  test("multiple toggle cycles with interleaved scrolling", () => {
    const render = createRenderer({ cols: TERM_COLS, rows: TERM_ROWS })

    const steps: Array<{ detail: boolean; scroll: number; sel: number }> = [
      { detail: false, scroll: 0, sel: 0 },
      { detail: true, scroll: 0, sel: 0 },
      { detail: true, scroll: 1, sel: 1 },
      { detail: false, scroll: 1, sel: 1 },
      { detail: false, scroll: 2, sel: 2 },
      { detail: true, scroll: 2, sel: 2 },
      { detail: true, scroll: 0, sel: 0 },
      { detail: false, scroll: 0, sel: 0 },
      { detail: true, scroll: 4, sel: 4 },
      { detail: false, scroll: 4, sel: 4 },
      { detail: false, scroll: 0, sel: 0 },
      { detail: true, scroll: 6, sel: 7 },
      { detail: false, scroll: 6, sel: 7 },
    ]

    const app = render(
      <Board showDetailPane={steps[0].detail} scrollIndex={steps[0].scroll} selectedCol={steps[0].sel} />,
    )
    assertBuffersMatch(app, `step 0`)

    for (let i = 1; i < steps.length; i++) {
      const s = steps[i]
      app.rerender(<Board showDetailPane={s.detail} scrollIndex={s.scroll} selectedCol={s.sel} />)
      assertBuffersMatch(app, `step ${i}: detail=${s.detail} scroll=${s.scroll} sel=${s.sel}`)
    }
  })
})

// ===========================================================================
// Variant: columns with backgroundColor
// ===========================================================================

describe("HVL border regression: columns with backgroundColor", () => {
  function BgColumn({
    col,
    width,
    height,
    isSelected,
  }: {
    col: ColumnData
    width: number
    height: number
    isSelected: boolean
  }) {
    return (
      <Box flexDirection="column" width={width} height={height}>
        <Box height={1} backgroundColor={isSelected ? "blue" : undefined}>
          <Text bold>
            {" "}
            {col.name} ({col.tasks.length})
          </Text>
        </Box>
        <Box flexDirection="column" flexGrow={1} overflow="scroll">
          {col.tasks.map((task, i) => (
            <Box
              key={task}
              flexShrink={0}
              borderStyle="round"
              borderColor={isSelected && i === 0 ? "yellow" : col.borderColor}
              backgroundColor={isSelected && i === 0 ? "black" : undefined}
              paddingRight={1}
            >
              <Text>{task}</Text>
            </Box>
          ))}
        </Box>
      </Box>
    )
  }

  function BgBoard({
    showDetailPane,
    scrollIndex,
    selectedCol,
  }: {
    showDetailPane: boolean
    scrollIndex: number
    selectedCol: number
  }) {
    const termWidth = TERM_COLS
    const contentHeight = TERM_ROWS - 4

    const detailPaneWidth = showDetailPane ? Math.floor(termWidth * 0.4) : 0
    const boardWidth = termWidth - detailPaneWidth

    const gap = 1
    const colWidth = Math.max(
      20,
      Math.floor((boardWidth - (ALL_COLUMNS.length - 1) * gap) / Math.min(ALL_COLUMNS.length, 4)),
    )
    const maxVisible = Math.max(1, Math.floor((boardWidth + gap) / (colWidth + gap)))
    const start = Math.min(scrollIndex, Math.max(0, ALL_COLUMNS.length - maxVisible))
    const end = Math.min(ALL_COLUMNS.length, start + maxVisible)

    return (
      <Box flexDirection="column" width={termWidth} height={TERM_ROWS}>
        <Box height={1}>
          <Text bold> Board View (bg variant)</Text>
        </Box>
        <Box height={1} flexShrink={0} />
        <Box flexGrow={1} flexDirection="row" minHeight={1} maxHeight={contentHeight} overflow="hidden">
          <Box flexDirection="row" width={boardWidth} height={contentHeight} overflow="hidden">
            {ALL_COLUMNS.slice(start, end).map((col, i) => {
              const actualIndex = start + i
              return (
                <React.Fragment key={col.name}>
                  {i > 0 && <Box width={gap} flexShrink={0} />}
                  <Box flexShrink={0}>
                    <BgColumn
                      col={col}
                      width={colWidth}
                      height={contentHeight}
                      isSelected={actualIndex === selectedCol}
                    />
                  </Box>
                </React.Fragment>
              )
            })}
          </Box>
          {showDetailPane && <DetailPane width={detailPaneWidth} height={contentHeight} />}
        </Box>
        <Box height={1}>
          <Text dimColor> status bar</Text>
        </Box>
      </Box>
    )
  }

  test("backgroundColor columns survive detail pane toggle", () => {
    const render = createRenderer({ cols: TERM_COLS, rows: TERM_ROWS })

    const app = render(<BgBoard showDetailPane={false} scrollIndex={0} selectedCol={1} />)
    assertBuffersMatch(app, "bg: initial")

    app.rerender(<BgBoard showDetailPane={true} scrollIndex={0} selectedCol={1} />)
    assertBuffersMatch(app, "bg: detail open")

    app.rerender(<BgBoard showDetailPane={true} scrollIndex={1} selectedCol={2} />)
    assertBuffersMatch(app, "bg: scroll while narrow")

    app.rerender(<BgBoard showDetailPane={false} scrollIndex={1} selectedCol={2} />)
    assertBuffersMatch(app, "bg: detail close")

    // Multiple cycles
    for (let i = 0; i < 3; i++) {
      app.rerender(<BgBoard showDetailPane={true} scrollIndex={i} selectedCol={i} />)
      assertBuffersMatch(app, `bg: cycle ${i} open`)

      app.rerender(<BgBoard showDetailPane={false} scrollIndex={i} selectedCol={i} />)
      assertBuffersMatch(app, `bg: cycle ${i} close`)
    }
  })
})

// ===========================================================================
// Variant: many columns (10+), pushing overscan and clipping harder
// ===========================================================================

describe("HVL border regression: many columns", () => {
  const MANY_COLUMNS: ColumnData[] = Array.from({ length: 12 }, (_, i) => ({
    name: `Column-${String.fromCharCode(65 + i)}`,
    borderColor: ["gray", "blue", "yellow", "magenta", "cyan", "green", "red", "white"][i % 8],
    tasks: Array.from(
      { length: 2 + (i % 3) },
      (_, j) => `Task ${i + 1}.${j + 1}: ${["Alpha", "Bravo", "Charlie", "Delta", "Echo", "Foxtrot"][j % 6]} operation`,
    ),
  }))

  function ManyColBoard({
    showDetailPane,
    scrollIndex,
    selectedCol,
  }: {
    showDetailPane: boolean
    scrollIndex: number
    selectedCol: number
  }) {
    const termWidth = TERM_COLS
    const contentHeight = TERM_ROWS - 2

    const detailPaneWidth = showDetailPane ? Math.floor(termWidth * 0.4) : 0
    const boardWidth = termWidth - detailPaneWidth

    const gap = 1
    const colWidth = Math.max(20, Math.floor((boardWidth - 3 * gap) / 4))
    const maxVisible = Math.max(1, Math.floor((boardWidth + gap) / (colWidth + gap)))
    const start = Math.min(scrollIndex, Math.max(0, MANY_COLUMNS.length - maxVisible))
    const end = Math.min(MANY_COLUMNS.length, start + maxVisible)

    return (
      <Box flexDirection="column" width={termWidth} height={TERM_ROWS}>
        <Box height={1}>
          <Text bold> Many Columns Board</Text>
        </Box>
        <Box flexGrow={1} flexDirection="row" minHeight={1} maxHeight={contentHeight} overflow="hidden">
          <Box flexDirection="row" width={boardWidth} height={contentHeight} overflow="hidden">
            {MANY_COLUMNS.slice(start, end).map((col, i) => {
              const actualIndex = start + i
              return (
                <React.Fragment key={col.name}>
                  {i > 0 && <Box width={gap} flexShrink={0} />}
                  <Box flexShrink={0}>
                    <SimColumn
                      col={col}
                      width={colWidth}
                      height={contentHeight}
                      isSelected={actualIndex === selectedCol}
                    />
                  </Box>
                </React.Fragment>
              )
            })}
          </Box>
          {showDetailPane && <DetailPane width={detailPaneWidth} height={contentHeight} />}
        </Box>
      </Box>
    )
  }

  test("12 columns: detail pane toggle at various scroll positions", () => {
    const render = createRenderer({ cols: TERM_COLS, rows: TERM_ROWS })

    const app = render(<ManyColBoard showDetailPane={false} scrollIndex={0} selectedCol={0} />)
    assertBuffersMatch(app, "many: initial")

    // Open detail pane at start
    app.rerender(<ManyColBoard showDetailPane={true} scrollIndex={0} selectedCol={0} />)
    assertBuffersMatch(app, "many: detail open at start")

    // Scroll through columns while detail pane is open
    for (let s = 1; s <= 8; s++) {
      app.rerender(<ManyColBoard showDetailPane={true} scrollIndex={s} selectedCol={s} />)
      assertBuffersMatch(app, `many: scroll=${s} while narrow`)
    }

    // Close detail pane at scroll=8
    app.rerender(<ManyColBoard showDetailPane={false} scrollIndex={8} selectedCol={8} />)
    assertBuffersMatch(app, "many: detail close at scroll=8")

    // Scroll back to start while wide
    app.rerender(<ManyColBoard showDetailPane={false} scrollIndex={0} selectedCol={0} />)
    assertBuffersMatch(app, "many: back to start while wide")
  })

  test("12 columns: rapid toggle at every scroll position", () => {
    const render = createRenderer({ cols: TERM_COLS, rows: TERM_ROWS })

    const app = render(<ManyColBoard showDetailPane={false} scrollIndex={0} selectedCol={0} />)

    for (let s = 0; s < MANY_COLUMNS.length; s++) {
      app.rerender(<ManyColBoard showDetailPane={true} scrollIndex={s} selectedCol={s} />)
      assertBuffersMatch(app, `rapid: open at scroll=${s}`)

      app.rerender(<ManyColBoard showDetailPane={false} scrollIndex={s} selectedCol={s} />)
      assertBuffersMatch(app, `rapid: close at scroll=${s}`)
    }
  })
})

// ===========================================================================
// Variant: using the REAL HorizontalVirtualList component from hightea
// ===========================================================================
//
// These tests use the REAL HorizontalVirtualList component and expose an
// incremental rendering bug: when HVL adds/removes children (due to width
// changes from detail pane toggle), newly mounted nodes may have prevLayout=null
// and all dirty flags false, causing the incremental renderer to skip painting
// them entirely. The mismatch appears at the boundary where the detail pane's
// border characters should be rendered but are missing in incremental output.
//
// Bug signature:
//   MISMATCH at (73, 2): incremental char=" ", fresh char="─"
//   ALL DIRTY FLAGS FALSE - fast-path likely skipped this node
//   prevLayout is NULL - node may never have been rendered before
//
// ===========================================================================

describe("HVL border regression: real HorizontalVirtualList component", () => {
  const EXPANDED_WIDTH = 29 // Fits ~4 columns at 120 wide

  function RealBoard({
    showDetailPane,
    scrollTo,
    selectedCol,
  }: {
    showDetailPane: boolean
    scrollTo: number
    selectedCol: number
  }) {
    const termWidth = TERM_COLS
    const contentHeight = TERM_ROWS - 2

    const detailPaneWidth = showDetailPane ? Math.floor(termWidth * 0.4) : 0
    const boardWidth = termWidth - detailPaneWidth

    return (
      <Box flexDirection="column" width={termWidth} height={TERM_ROWS}>
        <Box height={1}>
          <Text bold> Real HVL Board</Text>
        </Box>
        <Box flexGrow={1} flexDirection="row" minHeight={1} maxHeight={contentHeight} overflow="hidden">
          <HorizontalVirtualList
            items={ALL_COLUMNS}
            width={boardWidth}
            height={contentHeight}
            itemWidth={EXPANDED_WIDTH}
            gap={1}
            scrollTo={scrollTo}
            keyExtractor={(col) => col.name}
            renderItem={(col, index) => (
              <SimColumn col={col} width={EXPANDED_WIDTH} height={contentHeight} isSelected={index === selectedCol} />
            )}
          />
          {showDetailPane && <DetailPane width={detailPaneWidth} height={contentHeight} />}
        </Box>
      </Box>
    )
  }

  test("real HVL: full detail pane toggle cycle", () => {
    const render = createRenderer({ cols: TERM_COLS, rows: TERM_ROWS })

    // Step 1: Full width, scrollTo=0
    const app = render(<RealBoard showDetailPane={false} scrollTo={0} selectedCol={0} />)
    expect(app.text).toContain("Backlog")
    assertBuffersMatch(app, "real: initial")

    // Step 2: Open detail pane
    app.rerender(<RealBoard showDetailPane={true} scrollTo={0} selectedCol={0} />)
    assertBuffersMatch(app, "real: detail open")

    // Step 3: Scroll while narrow
    app.rerender(<RealBoard showDetailPane={true} scrollTo={2} selectedCol={2} />)
    assertBuffersMatch(app, "real: scroll while narrow")

    // Step 4: Close detail pane
    app.rerender(<RealBoard showDetailPane={false} scrollTo={2} selectedCol={2} />)
    assertBuffersMatch(app, "real: detail close")
  })

  test("real HVL: scroll through all columns with detail pane toggles", () => {
    const render = createRenderer({ cols: TERM_COLS, rows: TERM_ROWS })

    const app = render(<RealBoard showDetailPane={false} scrollTo={0} selectedCol={0} />)
    assertBuffersMatch(app, "real-scroll: initial")

    for (let col = 0; col < ALL_COLUMNS.length; col++) {
      // Scroll to each column
      app.rerender(<RealBoard showDetailPane={false} scrollTo={col} selectedCol={col} />)
      assertBuffersMatch(app, `real-scroll: wide col=${col}`)

      // Toggle detail pane on
      app.rerender(<RealBoard showDetailPane={true} scrollTo={col} selectedCol={col} />)
      assertBuffersMatch(app, `real-scroll: narrow col=${col}`)

      // Toggle detail pane off
      app.rerender(<RealBoard showDetailPane={false} scrollTo={col} selectedCol={col} />)
      assertBuffersMatch(app, `real-scroll: wide-again col=${col}`)
    }
  })

  test("real HVL: exact user flow — Space, h, Space", () => {
    const render = createRenderer({ cols: TERM_COLS, rows: TERM_ROWS })

    // User is looking at column 3 (Review)
    const app = render(<RealBoard showDetailPane={false} scrollTo={3} selectedCol={3} />)
    assertBuffersMatch(app, "flow: initial at col 3")

    // User presses Space -> detail pane opens
    app.rerender(<RealBoard showDetailPane={true} scrollTo={3} selectedCol={3} />)
    assertBuffersMatch(app, "flow: Space (open detail)")

    // User presses h -> move left to col 2
    app.rerender(<RealBoard showDetailPane={true} scrollTo={2} selectedCol={2} />)
    assertBuffersMatch(app, "flow: h (scroll left)")

    // User presses Space -> detail pane closes
    app.rerender(<RealBoard showDetailPane={false} scrollTo={2} selectedCol={2} />)
    assertBuffersMatch(app, "flow: Space (close detail)")

    // User presses l -> move right to col 3
    app.rerender(<RealBoard showDetailPane={false} scrollTo={3} selectedCol={3} />)
    assertBuffersMatch(app, "flow: l (scroll right)")

    // Another cycle: Space, h, h, Space
    app.rerender(<RealBoard showDetailPane={true} scrollTo={3} selectedCol={3} />)
    assertBuffersMatch(app, "flow: Space (open detail again)")

    app.rerender(<RealBoard showDetailPane={true} scrollTo={2} selectedCol={2} />)
    assertBuffersMatch(app, "flow: h (scroll left)")

    app.rerender(<RealBoard showDetailPane={true} scrollTo={1} selectedCol={1} />)
    assertBuffersMatch(app, "flow: h (scroll left again)")

    app.rerender(<RealBoard showDetailPane={false} scrollTo={1} selectedCol={1} />)
    assertBuffersMatch(app, "flow: Space (close detail final)")
  })
})
