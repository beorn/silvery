/**
 * Regression test: incremental render mismatch after new children added
 *
 * Bug: km-hightea.zoom-mismatch
 *
 * When React creates new children (e.g., after terminal resize triggers
 * re-layout), the incremental render clears regions via ancestorCleared
 * cascade while the fresh render does not (no stale pixels to clear).
 * The two should produce identical buffers.
 *
 * The crash shows a link character (fg=6/cyan, dim, underline) in the
 * fresh render but an empty space in the incremental render at the same
 * position, after a zoom-out/zoom-in sequence.
 */

import React, { useState } from "react"
import { describe, expect, test } from "vitest"
import { Box, Text, Link } from "../src/index.js"
import { bufferToText, cellEquals } from "../src/buffer.js"
import { createRenderer, compareBuffers, formatMismatch } from "@hightea/term/testing"

const render = createRenderer({ cols: 60, rows: 20, incremental: true })

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

describe("Incremental rendering: zoom mismatch", () => {
  /**
   * New children with link-styled text should not cause a mismatch.
   *
   * Simulates the zoom scenario: after a resize, React re-renders with
   * more/different children. The new children have link-styled text
   * (dim, underline, colored) that must appear correctly in both
   * incremental and fresh renders.
   */
  test("new children with styled text after rerender", () => {
    function CardRow({ text, hasLink }: { text: string; hasLink?: boolean }) {
      return (
        <Box height={1}>
          <Text>
            {text}
            {hasLink && (
              <Text dimColor underline color="cyan">
                {" "}
                example.com/path
              </Text>
            )}
          </Text>
        </Box>
      )
    }

    function App({ rows }: { rows: { text: string; hasLink?: boolean }[] }) {
      return (
        <Box flexDirection="column">
          <Box flexDirection="column">
            {rows.map((r, i) => (
              <CardRow key={i} text={r.text} hasLink={r.hasLink} />
            ))}
          </Box>
        </Box>
      )
    }

    const initialRows = [{ text: "Task A" }, { text: "Task B" }]

    const app = render(<App rows={initialRows} />)
    expect(app.text).toContain("Task A")

    // Simulate zoom: re-render with new children (more rows, some with links)
    const newRows = [
      { text: "Task A" },
      { text: "Task B" },
      { text: "See link:", hasLink: true },
      { text: "Task C" },
      { text: "Another link:", hasLink: true },
    ]

    app.rerender(<App rows={newRows} />)

    // This should NOT throw IncrementalRenderMismatchError
    assertBuffersMatch(app)
  })

  /**
   * Deep nesting with new children — models the column/card/row structure.
   * The ancestor chain has transparent boxes (no backgroundColor), causing
   * the ancestorCleared cascade to propagate deeply.
   */
  test("deep nesting with new link children triggers cascade", () => {
    function TextSegment({ text, isLink }: { text: string; isLink?: boolean }) {
      return isLink ? (
        <Text dimColor underline color="cyan">
          {text}
        </Text>
      ) : (
        <Text>{text}</Text>
      )
    }

    function Row({ segments }: { segments: { text: string; isLink?: boolean }[] }) {
      return (
        <Box height={1}>
          <Text>
            {segments.map((s, i) => (
              <TextSegment key={i} text={s.text} isLink={s.isLink} />
            ))}
          </Text>
        </Box>
      )
    }

    function Column({ rows }: { rows: { segments: { text: string; isLink?: boolean }[] }[] }) {
      return (
        <Box flexDirection="column" width={58}>
          {/* Header */}
          <Box height={1}>
            <Text>Column Header</Text>
          </Box>
          {/* Body - wraps content in extra containers like a real layout */}
          <Box flexDirection="column">
            <Box flexDirection="column">
              {rows.map((r, i) => (
                <Row key={i} segments={r.segments} />
              ))}
            </Box>
          </Box>
        </Box>
      )
    }

    function App({ rowCount }: { rowCount: number }) {
      const rows = Array.from({ length: rowCount }, (_, i) => ({
        segments: [{ text: `Task ${i}: ` }, { text: `example.com/task/${i}`, isLink: i % 3 === 0 }],
      }))

      return (
        <Box width={60} height={20}>
          <Column rows={rows} />
        </Box>
      )
    }

    // Initial render
    const app = render(<App rowCount={3} />)
    expect(app.text).toContain("Task 0")

    // Rerender with more children (simulates zoom adding visible rows)
    app.rerender(<App rowCount={8} />)

    // Check that incremental matches fresh
    assertBuffersMatch(app)
  })

  /**
   * Scroll container with new children after zoom.
   * Models the real structure: column body is a scroll container,
   * cards mount/unmount as visible range changes.
   */
  test("scroll container with new children and links", () => {
    function Card({ title, link }: { title: string; link?: string }) {
      return (
        <Box flexDirection="column">
          <Box height={1}>
            <Text bold>{title}</Text>
          </Box>
          {link && (
            <Box height={1}>
              <Text>
                See:{" "}
                <Text dimColor underline color="cyan">
                  {link}
                </Text>
              </Text>
            </Box>
          )}
        </Box>
      )
    }

    function App({ cards }: { cards: { title: string; link?: string }[] }) {
      return (
        <Box width={60} height={15} flexDirection="column">
          <Box flexDirection="column" overflow="scroll" flexGrow={1}>
            {cards.map((c, i) => (
              <Card key={i} title={c.title} link={c.link} />
            ))}
          </Box>
        </Box>
      )
    }

    const initialCards = [{ title: "Card 1" }, { title: "Card 2", link: "example.com/card2" }]

    const app = render(<App cards={initialCards} />)
    expect(app.text).toContain("Card 1")

    // Add more cards (simulates zoom showing more content)
    const newCards = [
      { title: "Card 1" },
      { title: "Card 2", link: "example.com/card2" },
      { title: "Card 3", link: "bitbucket.org/blog/sunsetting-mercurial-support" },
      { title: "Card 4" },
      { title: "Card 5", link: "github.com/important-repo" },
    ]

    app.rerender(<App cards={newCards} />)

    assertBuffersMatch(app)
  })

  /**
   * Multiple columns side by side with child changes.
   * Models the board layout where each column is independent.
   */
  test("multi-column layout with child changes and links", () => {
    function Column({ name, items }: { name: string; items: string[] }) {
      return (
        <Box flexDirection="column" flexGrow={1}>
          <Box height={1}>
            <Text bold>{name}</Text>
          </Box>
          <Box flexDirection="column" overflow="scroll" flexGrow={1}>
            {items.map((item, i) => (
              <Box key={i} height={1}>
                <Text>
                  {item.startsWith("http") ? (
                    <Text dimColor underline color="cyan">
                      {item}
                    </Text>
                  ) : (
                    item
                  )}
                </Text>
              </Box>
            ))}
          </Box>
        </Box>
      )
    }

    function App({ columns }: { columns: { name: string; items: string[] }[] }) {
      return (
        <Box width={60} height={15} flexDirection="row">
          {columns.map((col, i) => (
            <Column key={i} name={col.name} items={col.items} />
          ))}
        </Box>
      )
    }

    const initial = [
      { name: "Todo", items: ["Task A", "Task B"] },
      { name: "Done", items: ["Task C"] },
    ]

    const app = render(<App columns={initial} />)
    expect(app.text).toContain("Todo")

    // Rerender with more items including links
    const updated = [
      { name: "Todo", items: ["Task A", "Task B", "https://example.com", "Task D"] },
      { name: "Done", items: ["Task C", "https://github.com/repo", "Task E"] },
    ]

    app.rerender(<App columns={updated} />)

    assertBuffersMatch(app)
  })
})
