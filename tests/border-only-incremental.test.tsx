/**
 * Incremental Rendering: Border-Only Changes
 *
 * Bug: When a Card's borderColor changes (cursor move), the content area
 * should be preserved from the cloned buffer. Only the border characters
 * should update. This test verifies the contentAreaAffected optimization
 * doesn't break content preservation.
 *
 * Scenario:
 * 1. Render Card with borderColor="blackBright" (unselected)
 * 2. Rerender with borderColor="yellow" (selected)
 * 3. Verify content is preserved (incremental matches fresh)
 */

import React, { useState } from "react"
import { describe, expect, test } from "vitest"
import { Box, Text } from "../src/index.js"
import { bufferToText } from "../src/buffer.js"
import { createRenderer, compareBuffers, formatMismatch } from "inkx/testing"

const render = createRenderer({ incremental: true })

function assertBuffersMatch(app: ReturnType<typeof render>): void {
  const fresh = app.freshRender()
  const current = app.lastBuffer()!
  const mismatch = compareBuffers(current, fresh)
  if (mismatch) {
    const msg = formatMismatch(mismatch, {
      incrementalText: bufferToText(current),
      freshText: bufferToText(fresh),
    })
    throw new Error(`Incremental/fresh mismatch:\n${msg}`)
  }
}

describe("Incremental rendering: border-only changes", () => {
  /**
   * CORE CASE: Card with border + content. Only borderColor changes.
   * Content should be preserved from cloned buffer.
   */
  test("borderColor change preserves content inside card", () => {
    function App({ selected }: { selected: boolean }) {
      return (
        <Box width={40} height={10}>
          <Box
            flexDirection="column"
            width={38}
            borderStyle="round"
            borderColor={selected ? "yellow" : "blackBright"}
            paddingRight={1}
          >
            <Text>Card Title Here</Text>
            <Text> Child item 1</Text>
            <Text> Child item 2</Text>
            <Text> Status: open</Text>
          </Box>
        </Box>
      )
    }

    const app = render(<App selected={false} />)
    expect(app.text).toContain("Card Title Here")
    expect(app.text).toContain("Child item 1")
    expect(app.text).toContain("Status: open")

    // Select card — only borderColor changes
    app.rerender(<App selected={true} />)
    expect(app.text).toContain("Card Title Here")
    expect(app.text).toContain("Child item 1")
    expect(app.text).toContain("Status: open")
    assertBuffersMatch(app)

    // Deselect card — borderColor changes back
    app.rerender(<App selected={false} />)
    assertBuffersMatch(app)
  })

  /**
   * Multiple cards: old card deselects, new card selects.
   * Simulates cursor j/k in km-tui.
   */
  test("cursor move: old card deselects, new card selects", () => {
    function Card({ title, selected }: { title: string; selected: boolean }) {
      return (
        <Box
          flexDirection="column"
          borderStyle="round"
          borderColor={selected ? "yellow" : "blackBright"}
          paddingRight={1}
        >
          <Text>{title}</Text>
          <Text> content line 1</Text>
          <Text> content line 2</Text>
        </Box>
      )
    }

    function App({ cursor }: { cursor: number }) {
      return (
        <Box width={40} height={20} flexDirection="column">
          <Card title="Card A" selected={cursor === 0} />
          <Card title="Card B" selected={cursor === 1} />
          <Card title="Card C" selected={cursor === 2} />
        </Box>
      )
    }

    const app = render(<App cursor={0} />)
    expect(app.text).toContain("Card A")
    expect(app.text).toContain("Card B")
    expect(app.text).toContain("Card C")

    // Move cursor down
    app.rerender(<App cursor={1} />)
    assertBuffersMatch(app)

    // Move cursor down again
    app.rerender(<App cursor={2} />)
    assertBuffersMatch(app)

    // Move cursor back up
    app.rerender(<App cursor={0} />)
    assertBuffersMatch(app)
  })

  /**
   * Column layout: bordered cards inside a column with header.
   * Simulates km-tui Column component at realistic dimensions.
   */
  test("column with cards: border-only change at 300x120", () => {
    function Card({
      title,
      children,
      selected,
      width,
    }: {
      title: string
      children: string[]
      selected: boolean
      width: number
    }) {
      return (
        <Box
          flexDirection="column"
          width={width}
          borderStyle="round"
          borderColor={selected ? "yellow" : "blackBright"}
          paddingRight={1}
        >
          <Text>{title}</Text>
          {children.map((child, i) => (
            <Text key={i}> {child}</Text>
          ))}
        </Box>
      )
    }

    function Column({
      title,
      cards,
      cursor,
      width,
    }: {
      title: string
      cards: { title: string; children: string[] }[]
      cursor: number
      width: number
    }) {
      return (
        <Box flexDirection="column" width={width} height={60}>
          <Box height={1}>
            <Text bold>
              {" "}
              {title} ({cards.length})
            </Text>
          </Box>
          {cards.map((card, i) => (
            <Card
              key={card.title}
              title={card.title}
              children={card.children}
              selected={i === cursor}
              width={width - 1}
            />
          ))}
        </Box>
      )
    }

    const cards = Array.from({ length: 8 }, (_, i) => ({
      title: `Task ${i + 1}: Some title here`,
      children: [
        `Subtask ${i + 1}.1: First child item`,
        `Subtask ${i + 1}.2: Second child item`,
        `Status: ${i % 2 === 0 ? "open" : "done"}`,
      ],
    }))

    function App({ cursor }: { cursor: number }) {
      return (
        <Box width={300} height={120} flexDirection="row">
          <Column title="Todo" cards={cards.slice(0, 4)} cursor={cursor < 4 ? cursor : -1} width={50} />
          <Column title="In Progress" cards={cards.slice(4)} cursor={cursor >= 4 ? cursor - 4 : -1} width={50} />
        </Box>
      )
    }

    const app = render(<App cursor={0} />)
    // Verify all cards rendered
    for (let i = 0; i < 8; i++) {
      expect(app.text).toContain(`Task ${i + 1}`)
    }

    // Move cursor through cards
    for (let c = 1; c <= 7; c++) {
      app.rerender(<App cursor={c} />)
      assertBuffersMatch(app)
    }
  })

  /**
   * Scroll container with bordered cards — simulates VirtualList.
   * Cards inside overflow="scroll" container.
   */
  test("scroll container with bordered cards", () => {
    function Card({ title, selected }: { title: string; selected: boolean }) {
      return (
        <Box
          flexDirection="column"
          borderStyle="round"
          borderColor={selected ? "yellow" : "blackBright"}
          paddingRight={1}
        >
          <Text>{title}</Text>
          <Text> body line 1</Text>
          <Text> body line 2</Text>
        </Box>
      )
    }

    function App({ cursor }: { cursor: number }) {
      const cards = Array.from({ length: 10 }, (_, i) => `Card ${i}`)
      return (
        <Box width={40} height={25} flexDirection="column">
          <Text bold>Column Header (10)</Text>
          <Box overflow="scroll" flexGrow={1} flexDirection="column">
            {cards.map((title, i) => (
              <Card key={title} title={title} selected={i === cursor} />
            ))}
          </Box>
        </Box>
      )
    }

    const app = render(<App cursor={0} />)
    expect(app.text).toContain("Card 0")

    // Cursor moves within visible area
    app.rerender(<App cursor={1} />)
    assertBuffersMatch(app)

    app.rerender(<App cursor={2} />)
    assertBuffersMatch(app)

    // Back up
    app.rerender(<App cursor={0} />)
    assertBuffersMatch(app)
  })

  /**
   * No-change render: same props, no dirty flags.
   * Buffer should be identical to fresh render.
   */
  test("no-change rerender preserves all content", () => {
    function App() {
      return (
        <Box width={40} height={10}>
          <Box flexDirection="column" borderStyle="round" borderColor="blackBright" paddingRight={1}>
            <Text>Title</Text>
            <Text> Content line</Text>
          </Box>
        </Box>
      )
    }

    const app = render(<App />)

    // Force a rerender with identical props
    app.rerender(<App />)
    assertBuffersMatch(app)
  })

  /**
   * Card with backgroundColor + borderColor change.
   * The bg fill should preserve content.
   */
  test("card with backgroundColor: borderColor change", () => {
    function App({ selected }: { selected: boolean }) {
      return (
        <Box width={40} height={10}>
          <Box
            flexDirection="column"
            width={38}
            borderStyle="round"
            borderColor={selected ? "cyan" : "blackBright"}
            backgroundColor="black"
            paddingRight={1}
          >
            <Text>Title</Text>
            <Text> Content 1</Text>
            <Text> Content 2</Text>
          </Box>
        </Box>
      )
    }

    const app = render(<App selected={false} />)
    expect(app.text).toContain("Title")
    expect(app.text).toContain("Content 1")

    app.rerender(<App selected={true} />)
    assertBuffersMatch(app)
  })
})
