/**
 * Production drag-and-drop wiring through run() + real SGR mouse input.
 *
 * The DragFeature unit tests prove the service in isolation. This file pins
 * the public composition boundary: mouse-enabled run() installs the drag
 * capability, a draggable ancestor wins over text selection, React observes
 * live drag state, the source receives start/end/cancel, the target
 * receives enter/over/drop callbacks, an active drag shows the `grabbing`
 * cursor, and a `draggable={false}` child opts out of its parent's drag.
 */

import React, { useState } from "react"
import { describe, expect, test, vi } from "vitest"
import { createTermless } from "@silvery/test"
import "@termless/test/matchers"
import { Box, Text, useDragState } from "../../src/index.js"
import { run } from "../../packages/ag-term/src/runtime/run"

const settle = (ms = 100) => new Promise((resolve) => setTimeout(resolve, ms))

const OSC22_PREFIX = "\x1b]22;"
const BEL = "\x07"

/** OSC 22 cursor shapes the app wrote since the last `term.out.clear()`, in order. */
function emittedCursors(term: { readonly out: { getText(): string } }): string[] {
  return term.out
    .getText()
    .split(OSC22_PREFIX)
    .slice(1)
    .map((chunk) => chunk.slice(0, chunk.indexOf(BEL)))
}

function DragStatus() {
  const drag = useDragState()
  const label =
    drag === undefined
      ? "drag:missing"
      : drag === null
        ? "drag:idle"
        : `drag:${drag.currentPos.x},${drag.currentPos.y}`

  return <Text>{label}</Text>
}

describe("run() drag-and-drop capability", () => {
  test("does not install the capability when mouse tracking is disabled", async () => {
    using term = createTermless({ cols: 20, rows: 2 })
    const handle = await run(<DragStatus />, term, { mouse: false })
    await settle()

    expect(term.screen).toContainText("drag:missing")

    handle.unmount()
  })

  test("drags a content-bearing Box onto a target without starting text selection", async () => {
    const onDragEnter = vi.fn()
    const onDragOver = vi.fn()
    const onDrop = vi.fn()
    const onDragStart = vi.fn()
    const onDragEnd = vi.fn()
    const onDragCancel = vi.fn()
    const onClick = vi.fn()

    using term = createTermless({ cols: 40, rows: 5 })
    const handle = await run(
      <Box width={40} height={5} flexDirection="column">
        <DragStatus />
        <Box flexDirection="row" height={2}>
          <Box
            width={10}
            height={2}
            draggable
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onDragCancel={onDragCancel}
            onClick={onClick}
          >
            <Text>SOURCE</Text>
          </Box>
          <Box
            width={10}
            height={2}
            onDragEnter={onDragEnter}
            onDragOver={onDragOver}
            onDrop={onDrop}
          >
            <Text>TARGET</Text>
          </Box>
        </Box>
      </Box>,
      term,
      { mouse: true },
    )
    await settle()

    expect(term.screen).toContainText("drag:idle")
    term.clipboard.clear()

    // Pointer-down lands on the Text child. The draggable Box ancestor is
    // still the source, matching ordinary card/list-row composition.
    await term.mouse.down(2, 1)
    await term.mouse.move(12, 1)
    await settle()

    expect(term.screen).toContainText("drag:12,1")
    expect(onDragStart).toHaveBeenCalledTimes(1)
    expect(onDragStart).toHaveBeenCalledWith(
      expect.objectContaining({
        source: expect.objectContaining({ props: expect.objectContaining({ draggable: true }) }),
        dropTarget: expect.objectContaining({ props: expect.objectContaining({ onDrop }) }),
        position: { x: 12, y: 1 },
      }),
    )
    expect(onDragEnter).toHaveBeenCalledTimes(1)

    await term.mouse.move(15, 1)
    await settle()

    // useSyncExternalStore requires a fresh snapshot per move. This is the
    // observer contract a cursor-following ghost will consume.
    expect(term.screen).toContainText("drag:15,1")

    await term.mouse.up(15, 1)
    await settle()

    expect(onDragOver).toHaveBeenCalledTimes(1)
    expect(onDrop).toHaveBeenCalledTimes(1)
    expect(onDrop).toHaveBeenCalledWith(
      expect.objectContaining({
        source: expect.objectContaining({ props: expect.objectContaining({ draggable: true }) }),
        dropTarget: expect.objectContaining({ props: expect.objectContaining({ onDrop }) }),
        position: { x: 15, y: 1 },
      }),
    )
    expect(onDragEnd).toHaveBeenCalledTimes(1)
    expect(onDragEnd).toHaveBeenCalledWith(
      expect.objectContaining({
        source: expect.objectContaining({ props: expect.objectContaining({ draggable: true }) }),
        dropTarget: expect.objectContaining({ props: expect.objectContaining({ onDrop }) }),
        position: { x: 15, y: 1 },
      }),
    )
    expect(onDragCancel).not.toHaveBeenCalled()
    expect(onClick).not.toHaveBeenCalled()
    expect(term.clipboard.last).toBeNull()
    expect(term.screen).toContainText("drag:idle")

    onDrop.mockClear()
    onDragStart.mockClear()
    onDragEnd.mockClear()
    await term.mouse.down(2, 1)
    await term.mouse.move(12, 1)
    await settle()
    await handle.press("Escape")
    await settle()

    expect(term.screen).toContainText("drag:idle")
    expect(onDragStart).toHaveBeenCalledTimes(1)
    expect(onDragCancel).toHaveBeenCalledTimes(1)
    expect(onDragCancel).toHaveBeenCalledWith(
      expect.objectContaining({
        source: expect.objectContaining({ props: expect.objectContaining({ draggable: true }) }),
        dropTarget: expect.objectContaining({ props: expect.objectContaining({ onDrop }) }),
        position: { x: 12, y: 1 },
      }),
    )
    expect(onDragEnd).not.toHaveBeenCalled()
    await term.mouse.up(12, 1)
    await settle()

    // After cancellation, the eventual physical release must stay inert — it
    // cannot turn the original mousedown into a delayed click or drop.
    expect(onDrop).not.toHaveBeenCalled()
    expect(onClick).not.toHaveBeenCalled()
    expect(onDragCancel).toHaveBeenCalledTimes(1)
    expect(onDragEnd).not.toHaveBeenCalled()

    await term.mouse.click(2, 1)
    await settle()

    // Owning the pointer sequence must not consume an ordinary click that
    // never crosses the drag threshold.
    expect(onClick).toHaveBeenCalledTimes(1)
    expect(term.screen).toContainText("drag:idle")

    handle.unmount()
  })

  test("shows grabbing while a drag is active and restores the resolved cursor on drop and on Escape", async () => {
    const onDragStart = vi.fn()
    const onDragCancel = vi.fn()
    const onDrop = vi.fn()

    using term = createTermless({ cols: 40, rows: 5 })
    const handle = await run(
      <Box width={40} height={5} flexDirection="column">
        <DragStatus />
        <Box flexDirection="row" height={2}>
          <Box
            width={10}
            height={2}
            draggable
            mouseCursor="grab"
            onDragStart={onDragStart}
            onDragCancel={onDragCancel}
          >
            <Text>SOURCE</Text>
          </Box>
          <Box width={10} height={2} mouseCursor="crosshair" onDrop={onDrop}>
            <Text>TARGET</Text>
          </Box>
        </Box>
      </Box>,
      term,
      { mouse: true },
    )
    await settle()

    await term.mouse.move(2, 1)
    await settle()
    expect(emittedCursors(term).at(-1)).toBe("grab")

    // The drag owns every move and the final release, so component dispatch —
    // the cursor's usual refresh — never sees them. Drag start and end must
    // re-emit the cursor themselves, once each, not once per move.
    term.out.clear()
    await term.mouse.down(2, 1)
    await term.mouse.move(12, 1)
    await settle()
    expect(onDragStart).toHaveBeenCalledTimes(1)
    expect(emittedCursors(term)).toEqual(["grabbing"])

    await term.mouse.move(15, 1)
    await settle()
    expect(emittedCursors(term)).toEqual(["grabbing"])

    await term.mouse.up(15, 1)
    await settle()
    expect(onDrop).toHaveBeenCalledTimes(1)
    expect(term.screen).toContainText("drag:idle")
    // The release lands on the crosshair target: the resolved cursor under
    // the pointer returns, not the source's grab or a hard-coded default.
    expect(emittedCursors(term)).toEqual(["grabbing", "crosshair"])

    // Escape cancels with the pointer still over the target. The cancel
    // itself restores the cursor; the later physical release is not needed.
    // Raw bytes take the production terminal input path; `handle.press()` is
    // the headless key entry and skips the runtime's drag-owned event branch.
    term.out.clear()
    await term.mouse.down(2, 1)
    await term.mouse.move(12, 1)
    await settle()
    expect(emittedCursors(term)).toEqual(["grab", "grabbing"])

    ;(term as unknown as { sendInput(data: string): void }).sendInput("\x1b")
    await settle()
    expect(onDragCancel).toHaveBeenCalledTimes(1)
    expect(term.screen).toContainText("drag:idle")
    expect(emittedCursors(term)).toEqual(["grab", "grabbing", "crosshair"])

    await term.mouse.up(12, 1)
    await settle()
    handle.unmount()
  })

  test("a frame rendered mid-drag does not hover the node under the dragged pointer", async () => {
    const onTargetEnter = vi.fn()
    let tick: (() => void) | undefined
    function Ticker() {
      const [count, setCount] = useState(0)
      tick = () => setCount((n) => n + 1)
      return <Text>tick:{count}</Text>
    }

    using term = createTermless({ cols: 40, rows: 5 })
    const handle = await run(
      <Box width={40} height={5} flexDirection="column">
        <Ticker />
        <Box flexDirection="row" height={2}>
          <Box width={10} height={2} draggable>
            <Text>SOURCE</Text>
          </Box>
          <Box width={10} height={2} onMouseEnter={onTargetEnter} onDrop={() => undefined}>
            <Text>TARGET</Text>
          </Box>
        </Box>
      </Box>,
      term,
      { mouse: true },
    )
    await settle()

    await term.mouse.down(2, 1)
    await term.mouse.move(12, 1)
    await settle()

    // An async update paints outside input handling, and that frame re-checks
    // hover at the last pointer. The drag owns the pointer, so no hover moves.
    tick!()
    await settle()
    expect(term.screen).toContainText("tick:1")
    expect(onTargetEnter).not.toHaveBeenCalled()

    await term.mouse.up(12, 1)
    await settle()
    handle.unmount()
  })

  test("a draggable={false} child opts out of its parent's drag and keeps its click", async () => {
    const onDragStart = vi.fn()
    const onButtonClick = vi.fn()

    using term = createTermless({ cols: 40, rows: 3 })
    const handle = await run(
      <Box width={40} height={3} flexDirection="column">
        <DragStatus />
        <Box width={30} height={1} flexDirection="row" draggable onDragStart={onDragStart}>
          <Box width={10}>
            <Text>TITLE</Text>
          </Box>
          <Box width={5} draggable={false} onClick={onButtonClick}>
            <Text>[x]</Text>
          </Box>
        </Box>
      </Box>,
      term,
      { mouse: true },
    )
    await settle()

    await term.mouse.click(11, 1)
    await settle()
    expect(onButtonClick).toHaveBeenCalledTimes(1)

    // Pressing the opted-out child and moving well past the drag threshold
    // must not start the title bar's drag.
    await term.mouse.down(11, 1)
    await term.mouse.move(20, 1)
    await settle()
    expect(onDragStart).not.toHaveBeenCalled()
    expect(term.screen).toContainText("drag:idle")
    await term.mouse.up(20, 1)
    await settle()
    expect(onDragStart).not.toHaveBeenCalled()

    // Control: the same gesture from the title text still drags the parent.
    await term.mouse.down(2, 1)
    await term.mouse.move(12, 1)
    await settle()
    expect(onDragStart).toHaveBeenCalledTimes(1)
    await term.mouse.up(12, 1)
    await settle()

    handle.unmount()
  })
})
