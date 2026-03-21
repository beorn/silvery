/**
 * Scrollback fill — verifies that ScrollbackList footer pins to the bottom
 * of the terminal in inline mode, even when content is shorter than the screen.
 *
 * Bug: Without flexGrow on the ScrollbackView outer/content boxes, the footer
 * sits right after the content instead of at the terminal bottom.
 */

import React, { useState } from "react"
import { describe, test, expect, afterEach } from "vitest"
import { createTermless } from "@silvery/test"
import "@termless/test/matchers"
import type { Term } from "../../packages/term/src/ansi/term"
import { run, useInput, type RunHandle } from "../../packages/term/src/runtime/run"
import { Box, Text, ScrollbackList } from "../../src/index"

/** Minimal app with ScrollbackList and footer, short content. */
function ShortContentApp() {
  const [items, setItems] = useState([
    { id: 1, text: "Item one", done: false },
    { id: 2, text: "Item two", done: false },
  ])

  useInput((input) => {
    if (input === "a") {
      setItems((prev) => [...prev, { id: prev.length + 1, text: `Item ${prev.length + 1}`, done: false }])
    }
    if (input === "q") return "exit"
  })

  return (
    <ScrollbackList
      items={items}
      keyExtractor={(item) => item.id}
      isFrozen={(item) => item.done}
      footer={
        <Box flexDirection="column">
          <Text>--- footer status bar ---</Text>
        </Box>
      }
    >
      {(item) => <Text>{item.text}</Text>}
    </ScrollbackList>
  )
}

describe("scrollback fill: footer pins to terminal bottom", () => {
  let term: Term
  let handle: RunHandle

  afterEach(() => {
    handle?.unmount()
  })

  test("footer at bottom with short content (2 items on 24-row terminal)", async () => {
    term = createTermless({ cols: 80, rows: 24 })
    handle = await run(<ShortContentApp />, term)

    const lines = term.screen!.getLines()

    // Find footer row
    let footerRow = -1
    for (let y = 0; y < lines.length; y++) {
      if (lines[y]!.includes("footer status bar")) {
        footerRow = y
        break
      }
    }

    // Footer should be at the last row (row 23 for 24-row terminal)
    expect(footerRow).toBeGreaterThanOrEqual(22)
  })

  test("content at top, footer at bottom, empty space in between", async () => {
    term = createTermless({ cols: 80, rows: 24 })
    handle = await run(<ShortContentApp />, term)

    const lines = term.screen!.getLines()

    // Find content and footer positions
    let lastContentRow = -1
    let footerRow = -1
    for (let y = 0; y < lines.length; y++) {
      if (lines[y]!.includes("Item")) lastContentRow = y
      if (lines[y]!.includes("footer status bar")) footerRow = y
    }

    // Content at top (items on rows 0-1)
    expect(lastContentRow).toBeLessThanOrEqual(1)
    // Footer at bottom
    expect(footerRow).toBeGreaterThanOrEqual(22)
    // There's space in between (content doesn't abut footer)
    expect(footerRow - lastContentRow).toBeGreaterThan(10)
  })
})
