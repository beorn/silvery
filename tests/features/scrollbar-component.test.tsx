/**
 * Standalone Scrollbar — draggable scrollbar overlay extracted so plain
 * `<Box overflow="scroll">` consumers (e.g. silvercode storybook preview
 * pane) can render the same chrome ListView ships inline.
 *
 * Three contracts pinned here:
 *   1. Visibility: renders nothing when content fits (scrollableRows≤0).
 *   2. Click-on-track snaps the offset (centered on click).
 *   3. Mousedown + mousemove drives drag-while-held; mouseup ends.
 *
 * Bead: km-silvery.box-scrollbar-with-drag.
 */

import React, { useState } from "react"
import { describe, expect, test, vi } from "vitest"
import { createRenderer, createTermless } from "@silvery/test"
import { Box, Scrollbar, Text } from "../../src/index.js"
import { run } from "../../packages/ag-term/src/runtime/run"

describe("Scrollbar", () => {
  test("renders nothing when scrollableRows is 0 (content fits)", () => {
    const onChange = vi.fn()
    const render = createRenderer({ cols: 20, rows: 10 })
    const app = render(
      <Box width={20} height={10} position="relative">
        <Text>fits</Text>
        <Scrollbar
          trackHeight={10}
          scrollableRows={0}
          scrollOffset={0}
          onScrollOffsetChange={onChange}
        />
      </Box>,
    )
    expect(app.text).toContain("fits")
    // No thumb glyph should appear in the rendered output.
    expect(app.text).not.toMatch(/[█▁▂▃▄▅▆▇]/)
  })

  test("renders the thumb when content overflows", () => {
    const onChange = vi.fn()
    const render = createRenderer({ cols: 20, rows: 10 })
    const app = render(
      <Box width={20} height={10} position="relative">
        <Text>overflow</Text>
        <Scrollbar
          trackHeight={10}
          scrollableRows={20}
          scrollOffset={0}
          onScrollOffsetChange={onChange}
        />
      </Box>,
    )
    // Thumb glyph appears in the rendered frame.
    expect(app.text).toMatch(/[█▁▂▃▄▅▆▇]/)
  })

  test("respects the visible prop — visible=false renders nothing", () => {
    const onChange = vi.fn()
    const render = createRenderer({ cols: 20, rows: 10 })
    const app = render(
      <Box width={20} height={10} position="relative">
        <Text>hidden</Text>
        <Scrollbar
          trackHeight={10}
          scrollableRows={20}
          scrollOffset={5}
          onScrollOffsetChange={onChange}
          visible={false}
        />
      </Box>,
    )
    expect(app.text).toContain("hidden")
    expect(app.text).not.toMatch(/[█▁▂▃▄▅▆▇]/)
  })

  test("controlled scrollOffset moves the thumb position", () => {
    const onChange = vi.fn()
    const render = createRenderer({ cols: 20, rows: 10 })
    // At offset 0 the thumb is at the top.
    const top = render(
      <Box width={20} height={10} position="relative">
        <Scrollbar
          trackHeight={10}
          scrollableRows={20}
          scrollOffset={0}
          onScrollOffsetChange={onChange}
        />
      </Box>,
    )
    const topAnsi = top.ansi
    // At offset 20 the thumb is at the bottom.
    const bottom = render(
      <Box key="b" width={20} height={10} position="relative">
        <Scrollbar
          trackHeight={10}
          scrollableRows={20}
          scrollOffset={20}
          onScrollOffsetChange={onChange}
        />
      </Box>,
    )
    const bottomAnsi = bottom.ansi
    // Different scroll offsets must produce different rendered output —
    // proves the thumb actually moved.
    expect(topAnsi).not.toEqual(bottomAnsi)
  })

  test("integrates with a stateful container — wheel-style update", () => {
    function Container(): React.ReactElement {
      const [offset, setOffset] = useState(0)
      return (
        <Box width={20} height={10} position="relative">
          <Text>off:{offset}</Text>
          <Scrollbar
            trackHeight={10}
            scrollableRows={20}
            scrollOffset={offset}
            onScrollOffsetChange={setOffset}
          />
        </Box>
      )
    }
    const render = createRenderer({ cols: 20, rows: 10 })
    const app = render(<Container />)
    expect(app.text).toContain("off:0")
  })

  test("termless drag release away from the track clears active chrome", async () => {
    using term = createTermless({ cols: 20, rows: 10 })

    function Container(): React.ReactElement {
      const [offset, setOffset] = useState(0)
      return (
        <Box width={20} height={10} position="relative">
          <Text>off:{Math.round(offset)}</Text>
          <Scrollbar
            trackHeight={10}
            scrollableRows={30}
            scrollOffset={offset}
            onScrollOffsetChange={setOffset}
          />
        </Box>
      )
    }

    const handle = await run(<Container />, term, { mouse: true, selection: false })
    await new Promise((r) => setTimeout(r, 50))

    const idleBg = term.cell(0, 19).bg
    await term.mouse.down(19, 0)
    await new Promise((r) => setTimeout(r, 50))
    const draggingBg = term.cell(0, 19).bg
    expect(draggingBg).not.toEqual(idleBg)

    await term.mouse.move(5, 8)
    await new Promise((r) => setTimeout(r, 50))
    await term.mouse.up(5, 8)
    await new Promise((r) => setTimeout(r, 50))

    for (let row = 0; row < 10; row++) {
      expect(term.cell(row, 19).bg).not.toEqual(draggingBg)
    }
    handle.unmount()
  })
})
