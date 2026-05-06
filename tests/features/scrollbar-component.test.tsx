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
import { Box, ScrollArea, Scrollbar, Text } from "../../src/index.js"
import { run } from "../../packages/ag-term/src/runtime/run"

function wheelDown(term: unknown, x: number, y: number): void {
  ;(term as { sendInput: (input: string) => void }).sendInput(`\x1b[<65;${x + 1};${y + 1}M`)
}

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

  test("respects the visible prop — visible=false hides the thumb while idle", () => {
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

  test("visible=false reveals the thumb when hovering the scrollbar column", async () => {
    using term = createTermless({ cols: 20, rows: 10 })
    const onChange = vi.fn()
    const handle = await run(
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
      term,
      { mouse: true, selection: false },
    )
    await new Promise((r) => setTimeout(r, 50))
    for (let row = 0; row < 10; row++) {
      expect(term.cell(row, 19).char).not.toMatch(/[█▁▂▃▄▅▆▇]/)
    }

    await term.mouse.move(19, 4)
    await new Promise((r) => setTimeout(r, 50))

    let found = false
    for (let row = 0; row < 10; row++) {
      if (/[█▁▂▃▄▅▆▇]/.test(term.cell(row, 19).char)) found = true
    }
    expect(found).toBe(true)
    handle.unmount()
  })

  test("track-column hover reveals muted thumb; thumb hover arms it", async () => {
    using term = createTermless({ cols: 20, rows: 10 })
    const onChange = vi.fn()
    const handle = await run(
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
      term,
      { mouse: true, selection: false },
    )
    await new Promise((r) => setTimeout(r, 50))

    await term.mouse.move(19, 8)
    await new Promise((r) => setTimeout(r, 50))

    let thumbRow = -1
    for (let row = 0; row < 10; row++) {
      if (term.cell(row, 19).char === "█") {
        thumbRow = row
        break
      }
    }
    expect(thumbRow).toBeGreaterThanOrEqual(0)
    const columnHoverBg = term.cell(thumbRow, 19).bg

    await term.mouse.move(19, thumbRow)
    await new Promise((r) => setTimeout(r, 50))

    expect(term.cell(thumbRow, 19).bg).not.toEqual(columnHoverBg)
    handle.unmount()
  })

  test("moving outside the terminal clears hover chrome", async () => {
    using term = createTermless({ cols: 20, rows: 10 })
    const onChange = vi.fn()
    const handle = await run(
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
      term,
      { mouse: true, selection: false },
    )
    await new Promise((r) => setTimeout(r, 50))

    await term.mouse.move(19, 4)
    await new Promise((r) => setTimeout(r, 50))
    expect(term.screen!.getText()).toMatch(/[█▁▂▃▄▅▆▇]/)

    await term.mouse.move(40, 4)
    await new Promise((r) => setTimeout(r, 50))

    for (let row = 0; row < 10; row++) {
      expect(term.cell(row, 19).char).not.toMatch(/[█▁▂▃▄▅▆▇]/)
    }
    handle.unmount()
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

  test("moving the controlled thumb clears rows it no longer covers", async () => {
    using term = createTermless({ cols: 20, rows: 10 })
    let setOffset: React.Dispatch<React.SetStateAction<number>> = () => {
      throw new Error("setOffset was not registered")
    }

    function Container(): React.ReactElement {
      const [offset, setOffsetState] = useState(0)
      React.useEffect(() => {
        setOffset = setOffsetState
      }, [])
      return (
        <Box width={20} height={10} position="relative">
          <Scrollbar
            trackHeight={10}
            scrollableRows={30}
            scrollOffset={offset}
            onScrollOffsetChange={setOffsetState}
          />
        </Box>
      )
    }

    const handle = await run(<Container />, term, { mouse: true, selection: false })
    await new Promise((r) => setTimeout(r, 50))
    expect(term.cell(0, 19).char).toMatch(/[█▁▂▃▄▅▆▇]/)

    setOffset(30)
    await new Promise((r) => setTimeout(r, 50))

    expect(term.cell(0, 19).char).toBe(" ")
    expect(term.cell(9, 19).char).toMatch(/[█▁▂▃▄▅▆▇]/)
    handle.unmount()
  })

  test("mousedown inside the thumb starts drag without recentering the viewport", async () => {
    using term = createTermless({ cols: 20, rows: 10 })
    const onChange = vi.fn()
    const handle = await run(
      <Box width={20} height={10} position="relative">
        <Scrollbar
          trackHeight={10}
          scrollableRows={30}
          scrollOffset={15}
          onScrollOffsetChange={onChange}
        />
      </Box>,
      term,
      { mouse: true, selection: false },
    )
    await new Promise((r) => setTimeout(r, 50))

    await term.mouse.down(19, 4)
    await new Promise((r) => setTimeout(r, 50))

    expect(onChange).toHaveBeenLastCalledWith(15, { dragActive: true })
    handle.unmount()
  })

  test("dragging the scrollbar thumb to another row updates the scroll offset", async () => {
    using term = createTermless({ cols: 20, rows: 10 })
    const onChange = vi.fn()
    const handle = await run(
      <Box width={20} height={10} position="relative">
        <Scrollbar
          trackHeight={10}
          scrollableRows={30}
          scrollOffset={15}
          onScrollOffsetChange={onChange}
        />
      </Box>,
      term,
      { mouse: true, selection: false },
    )
    await new Promise((r) => setTimeout(r, 50))

    await term.mouse.down(19, 4)
    await new Promise((r) => setTimeout(r, 50))
    await term.mouse.move(19, 6)
    await new Promise((r) => setTimeout(r, 50))

    expect(onChange).toHaveBeenLastCalledWith(22.5, { dragActive: true })
    handle.unmount()
  })

  test("active drag preserves the grabbed thumb position when max scroll grows", async () => {
    using term = createTermless({ cols: 20, rows: 10 })

    function Container(): React.ReactElement {
      const [rows, setRows] = useState(30)
      const [offset, setOffset] = useState(15)
      const changedRef = React.useRef(false)
      return (
        <Box width={20} height={10} position="relative">
          <Text>off:{Math.round(offset)}</Text>
          <Scrollbar
            trackHeight={10}
            scrollableRows={rows}
            scrollOffset={offset}
            onScrollOffsetChange={(offset) => {
              setOffset(offset)
              if (!changedRef.current) {
                changedRef.current = true
                setRows(60)
              }
            }}
          />
        </Box>
      )
    }

    const handle = await run(<Container />, term, { mouse: true, selection: false })
    await new Promise((r) => setTimeout(r, 50))

    await term.mouse.down(19, 4)
    await new Promise((r) => setTimeout(r, 50))
    await term.mouse.move(19, 4)
    await new Promise((r) => setTimeout(r, 50))

    expect(term.screen).toContainText("off:27")
    expect(term.cell(4, 19).char).toMatch(/[█▁▂▃▄▅▆▇]/)
    handle.unmount()
  })

  test("dragging remains visually at the bottom when max scroll shrinks while held", async () => {
    using term = createTermless({ cols: 20, rows: 10 })

    function Container(): React.ReactElement {
      const [rows, setRows] = useState(40)
      const [offset, setOffset] = useState(40)
      const changedRef = React.useRef(false)
      return (
        <Box width={20} height={10} position="relative">
          <Text>off:{Math.round(offset)}</Text>
          <Scrollbar
            trackHeight={10}
            scrollableRows={rows}
            scrollOffset={offset}
            onScrollOffsetChange={() => {
              if (!changedRef.current) {
                changedRef.current = true
                setRows(30)
                setOffset(30)
              }
            }}
          />
        </Box>
      )
    }

    const handle = await run(<Container />, term, { mouse: true, selection: false })
    await new Promise((r) => setTimeout(r, 50))
    expect(term.cell(9, 19).char).toMatch(/[█▁▂▃▄▅▆▇]/)

    await term.mouse.down(19, 9)
    await new Promise((r) => setTimeout(r, 50))

    expect(term.screen).toContainText("off:30")
    expect(term.cell(9, 19).char).toMatch(/[█▁▂▃▄▅▆▇]/)
    handle.unmount()
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

  test("moving outside the terminal releases an active scrollbar drag after a short grace period", async () => {
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

    await term.mouse.move(40, 0)
    await new Promise((r) => setTimeout(r, 50))
    expect(term.cell(0, 19).bg).toEqual(draggingBg)

    await new Promise((r) => setTimeout(r, 1500))
    expect(term.cell(0, 19).bg).toEqual(draggingBg)

    await new Promise((r) => setTimeout(r, 700))
    expect(term.cell(0, 19).bg).not.toEqual(draggingBg)

    await term.mouse.move(40, 9)
    await new Promise((r) => setTimeout(r, 50))
    expect(term.screen).toContainText("off:0")

    handle.unmount()
  })

  test("re-entering during the outside-terminal grace period keeps scrollbar drag active", async () => {
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

    await term.mouse.down(19, 0)
    await new Promise((r) => setTimeout(r, 50))
    const draggingBg = term.cell(0, 19).bg

    await term.mouse.move(40, 0)
    await new Promise((r) => setTimeout(r, 100))
    await term.mouse.move(19, 3)
    await new Promise((r) => setTimeout(r, 2200))
    await term.mouse.move(19, 6)
    await new Promise((r) => setTimeout(r, 50))

    expect(term.cell(6, 19).bg).toEqual(draggingBg)
    expect(term.screen).not.toContainText("off:0")

    handle.unmount()
  })
})

describe("ScrollArea", () => {
  test("wheel scrolling moves measured content and keeps scrollbar in sync", async () => {
    using term = createTermless({ cols: 30, rows: 8 })

    function Content(): React.ReactElement {
      return (
        <ScrollArea>
          {Array.from({ length: 20 }, (_, i) => (
            <Text key={i}>row {i}</Text>
          ))}
        </ScrollArea>
      )
    }

    const handle = await run(<Content />, term, { mouse: true, selection: false })
    await new Promise((r) => setTimeout(r, 50))

    expect(term.screen).toContainText("row 0")
    expect(term.screen).not.toContainText("row 19")

    for (let i = 0; i < 20; i++) {
      wheelDown(term, 5, 4)
    }
    await new Promise((r) => setTimeout(r, 50))

    expect(term.screen).not.toContainText("row 0")
    expect(term.screen).toContainText("row 19")
    expect(term.cell(7, 29).char).toMatch(/[█▁▂▃▄▅▆▇]/)
    handle.unmount()
  })
})
