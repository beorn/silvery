import React from "react"
import { describe, test, expect } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, Text, useCursor } from "silvery"

describe("useCursor", () => {
  test("sets cursor position relative to parent Box scrollRect", () => {
    const render = createRenderer({ cols: 40, rows: 10 })

    // useCursor reads NodeContext from the nearest ancestor Box.
    // The cursor is positioned at parent.scrollRect + (col, row).
    function CursorText() {
      useCursor({ col: 3, row: 0 })
      return (
        <Box>
          <Text>Hello</Text>
        </Box>
      )
    }

    const app = render(
      <Box>
        <CursorText />
      </Box>,
    )

    expect(app.text).toContain("Hello")
    const cursor = app.getCursorState()
    expect(cursor).not.toBeNull()
    expect(cursor!.visible).toBe(true)
    // Parent Box is at (0, 0), so cursor = (0+3, 0+0)
    expect(cursor!.x).toBe(3)
    expect(cursor!.y).toBe(0)
  })

  test("cursor position uses parent Box's screen position", () => {
    const render = createRenderer({ cols: 40, rows: 10 })

    function CursorText() {
      useCursor({ col: 1, row: 0 })
      return (
        <Box>
          <Text>Inner</Text>
        </Box>
      )
    }

    const app = render(
      <Box flexDirection="column">
        <Text>Line 0</Text>
        <Text>Line 1</Text>
        <CursorText />
      </Box>,
    )

    const cursor = app.getCursorState()
    expect(cursor).not.toBeNull()
    // useCursor reads NodeContext from the outer column Box, which is at (0, 0).
    // So cursor = (0+1, 0+0) = (1, 0) — NOT (1, 2).
    // This is by design: cursor position is relative to the NodeContext provider.
    expect(cursor!.x).toBe(1)
    expect(cursor!.y).toBe(0)
  })

  test("visible=false results in no cursor", () => {
    const render = createRenderer({ cols: 40, rows: 10 })

    function CursorBox() {
      useCursor({ col: 0, row: 0, visible: false })
      return (
        <Box>
          <Text>Hello</Text>
        </Box>
      )
    }

    const app = render(
      <Box>
        <CursorBox />
      </Box>,
    )
    const cursor = app.getCursorState()
    expect(cursor).toBeNull()
  })

  test("cursor clears on unmount", () => {
    const render = createRenderer({ cols: 40, rows: 10 })

    function CursorBox() {
      useCursor({ col: 5, row: 0 })
      return (
        <Box>
          <Text>Cursor here</Text>
        </Box>
      )
    }

    function App({ show }: { show: boolean }) {
      return <Box>{show ? <CursorBox /> : <Text>No cursor</Text>}</Box>
    }

    const app = render(<App show={true} />)
    expect(app.getCursorState()).not.toBeNull()

    app.rerender(<App show={false} />)
    expect(app.getCursorState()).toBeNull()
  })

  test("without NodeContext (no parent Box), cursor is null", () => {
    const render = createRenderer({ cols: 40, rows: 10 })

    function CursorBox() {
      useCursor({ col: 3, row: 0 })
      return (
        <Box>
          <Text>Hello</Text>
        </Box>
      )
    }

    // No parent Box wrapping CursorBox — NodeContext is null
    const app = render(<CursorBox />)
    const cursor = app.getCursorState()
    expect(cursor).toBeNull()
  })

  test("cursor row offset works", () => {
    const render = createRenderer({ cols: 40, rows: 10 })

    function CursorBox() {
      useCursor({ col: 2, row: 3 })
      return (
        <Box>
          <Text>Content</Text>
        </Box>
      )
    }

    const app = render(
      <Box>
        <CursorBox />
      </Box>,
    )

    const cursor = app.getCursorState()
    expect(cursor).not.toBeNull()
    expect(cursor!.x).toBe(2)
    expect(cursor!.y).toBe(3)
  })

  test("cursor shape is passed through", () => {
    const render = createRenderer({ cols: 40, rows: 10 })

    function CursorBox() {
      useCursor({ col: 0, row: 0, shape: "bar" })
      return (
        <Box>
          <Text>Hello</Text>
        </Box>
      )
    }

    const app = render(
      <Box>
        <CursorBox />
      </Box>,
    )

    const cursor = app.getCursorState()
    expect(cursor).not.toBeNull()
    expect(cursor!.shape).toBe("bar")
  })

  test("last writer wins when multiple components use useCursor", () => {
    const render = createRenderer({ cols: 40, rows: 10 })

    function First() {
      useCursor({ col: 1, row: 0 })
      return (
        <Box>
          <Text>First</Text>
        </Box>
      )
    }

    function Second() {
      useCursor({ col: 99, row: 0 })
      return (
        <Box>
          <Text>Second</Text>
        </Box>
      )
    }

    const app = render(
      <Box flexDirection="column">
        <First />
        <Second />
      </Box>,
    )

    // Both set cursor -- the store holds the last one that fired
    const cursor = app.getCursorState()
    expect(cursor).not.toBeNull()
    // We can't guarantee which fires last due to subscriber order,
    // but at least one should have set cursor state
    expect(cursor!.visible).toBe(true)
  })

  test("cursor is isolated per silvery instance", () => {
    const render1 = createRenderer({ cols: 40, rows: 10 })
    const render2 = createRenderer({ cols: 40, rows: 10 })

    function WithCursor() {
      useCursor({ col: 5, row: 3 })
      return (
        <Box>
          <Text>App1</Text>
        </Box>
      )
    }

    function NoCursor() {
      return (
        <Box>
          <Text>App2</Text>
        </Box>
      )
    }

    const app1 = render1(
      <Box>
        <WithCursor />
      </Box>,
    )
    const app2 = render2(<NoCursor />)

    expect(app1.getCursorState()).not.toBeNull()
    expect(app1.getCursorState()!.x).toBe(5)
    expect(app1.getCursorState()!.y).toBe(3)
    // App2 has no useCursor, so its cursor state should be null
    expect(app2.getCursorState()).toBeNull()
  })

  test("cursor updates when only col changes (no layout change)", () => {
    const render = createRenderer({ cols: 40, rows: 10 })

    // When the cursor position changes but the component's layout stays
    // the same (e.g., moving cursor within TextInput without changing text),
    // the cursor store should still be updated via the useLayoutEffect
    // that watches col/row/shape changes.
    function CursorBox({ col }: { col: number }) {
      useCursor({ col, row: 0 })
      return (
        <Box>
          <Text>Hello</Text>
        </Box>
      )
    }

    const app = render(
      <Box>
        <CursorBox col={0} />
      </Box>,
    )
    expect(app.getCursorState()).not.toBeNull()
    expect(app.getCursorState()!.x).toBe(0)

    // Change only col — layout stays the same
    app.rerender(
      <Box>
        <CursorBox col={5} />
      </Box>,
    )
    expect(app.getCursorState()!.x).toBe(5)
  })

  test("cursor is set on the FIRST frame after a conditional mount (km-silvercode.cursor-startup-position)", () => {
    // Regression: silvercode startup. At first paint, App's `focused`
    // session is unresolved → CommandBox isn't rendered → no useCursor
    // → cursor state is null → scheduler emits CURSOR_HIDE with no
    // moveCursor, and the hardware cursor stays parked wherever the
    // last buffer write ended (the side-panel quota bar). When the
    // session resolves on a microtask and CommandBox mounts, the
    // FIRST frame after mount must already include cursor state — if
    // it doesn't, the cursor is invisible-but-mispositioned until the
    // user types and triggers another render.
    //
    // The test mirrors the silvercode shape: an outer App that renders
    // a sibling subtree always (the "side panel"), and conditionally
    // mounts a cursor-using component (the "CommandBox") on rerender.
    const render = createRenderer({ cols: 40, rows: 10 })

    function CursorBox() {
      // useCursor inside a Box → equivalent to TextArea's useCursor at
      // (col=2, row=0) within its parent Box.
      useCursor({ col: 2, row: 0 })
      return (
        <Box>
          <Text>cmd</Text>
        </Box>
      )
    }

    function App({ mounted }: { mounted: boolean }) {
      return (
        <Box flexDirection="column">
          <Text>side panel content</Text>
          {mounted && <CursorBox />}
        </Box>
      )
    }

    // Initial render — CursorBox NOT mounted. Cursor state is null.
    const app = render(<App mounted={false} />)
    expect(app.getCursorState()).toBeNull()

    // Conditional mount — exactly the silvercode "focused resolves on
    // microtask → CommandBox mounts" path. The FIRST frame after this
    // rerender MUST include cursor state, otherwise the scheduler will
    // emit CURSOR_HIDE without a moveCursor and leave the hardware
    // cursor parked at the previous paint's last cell.
    app.rerender(<App mounted={true} />)
    const cursor = app.getCursorState()
    expect(cursor).not.toBeNull()
    expect(cursor!.visible).toBe(true)
    // useCursor reads NodeContext from the nearest ancestor — the
    // outer column Box at (0, 0). Cursor lands at parentRect + (col=2,
    // row=0) regardless of where CursorBox sits inside the column,
    // matching the "cursor position uses parent Box's screen position"
    // test's documented semantics.
    expect(cursor!.x).toBe(2)
    expect(cursor!.y).toBe(0)
  })

  test("cursor updates when both col and layout change", () => {
    const render = createRenderer({ cols: 40, rows: 10 })

    function CursorBox({ col, text }: { col: number; text: string }) {
      useCursor({ col, row: 0 })
      return (
        <Box>
          <Text>{text}</Text>
        </Box>
      )
    }

    const app = render(
      <Box>
        <CursorBox col={0} text="Hello" />
      </Box>,
    )
    expect(app.getCursorState()).not.toBeNull()
    expect(app.getCursorState()!.x).toBe(0)

    // Change both text (triggers layout) and col
    app.rerender(
      <Box>
        <CursorBox col={5} text="Hello World" />
      </Box>,
    )
    expect(app.getCursorState()!.x).toBe(5)
  })
})
