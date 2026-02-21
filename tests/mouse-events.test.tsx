/**
 * Tests for DOM-level mouse events in inkx.
 *
 * Tests hit testing, event dispatch with bubbling, click/double-click detection,
 * mouseenter/mouseleave, wheel events, and the testing API (app.click/wheel/doubleClick).
 */

import { useState } from "react"
import { describe, expect, it, vi } from "vitest"
import { Box, Text } from "../../beorn-inkx/src/index.js"
import type { InkxMouseEvent, InkxWheelEvent } from "../../beorn-inkx/src/mouse-events.js"
import {
  checkDoubleClick,
  computeEnterLeave,
  createDoubleClickState,
  createMouseEvent,
  createMouseEventProcessor,
  createWheelEvent,
  dispatchMouseEvent,
  hitTest,
  processMouseEvent,
} from "../../beorn-inkx/src/mouse-events.js"
import { createFocusManager } from "../../beorn-inkx/src/focus-manager.js"
import { Link } from "../../beorn-inkx/src/components/Link.js"
import type { InkxNode } from "../../beorn-inkx/src/types.js"
import { createRenderer } from "../../beorn-inkx/src/testing/index.js"

// ============================================================================
// Unit Tests: Event Creation
// ============================================================================

describe("createMouseEvent", () => {
  it("creates event with correct fields", () => {
    const fakeNode = { props: {}, children: [], parent: null } as unknown as InkxNode
    const parsed = { button: 0, x: 5, y: 10, action: "down" as const, shift: true, meta: false, ctrl: false }
    const event = createMouseEvent("click", 5, 10, fakeNode, parsed)

    expect(event.type).toBe("click")
    expect(event.clientX).toBe(5)
    expect(event.clientY).toBe(10)
    expect(event.button).toBe(0)
    expect(event.shiftKey).toBe(true)
    expect(event.altKey).toBe(false)
    expect(event.ctrlKey).toBe(false)
    expect(event.target).toBe(fakeNode)
    expect(event.currentTarget).toBe(fakeNode)
    expect(event.nativeEvent).toBe(parsed)
  })

  it("stopPropagation works", () => {
    const fakeNode = { props: {}, children: [], parent: null } as unknown as InkxNode
    const parsed = { button: 0, x: 0, y: 0, action: "down" as const, shift: false, meta: false, ctrl: false }
    const event = createMouseEvent("click", 0, 0, fakeNode, parsed)

    expect(event.propagationStopped).toBe(false)
    event.stopPropagation()
    expect(event.propagationStopped).toBe(true)
  })

  it("preventDefault works", () => {
    const fakeNode = { props: {}, children: [], parent: null } as unknown as InkxNode
    const parsed = { button: 0, x: 0, y: 0, action: "down" as const, shift: false, meta: false, ctrl: false }
    const event = createMouseEvent("click", 0, 0, fakeNode, parsed)

    expect(event.defaultPrevented).toBe(false)
    event.preventDefault()
    expect(event.defaultPrevented).toBe(true)
  })
})

describe("createWheelEvent", () => {
  it("creates wheel event with deltaY", () => {
    const fakeNode = { props: {}, children: [], parent: null } as unknown as InkxNode
    const parsed = {
      button: 0,
      x: 5,
      y: 10,
      action: "wheel" as const,
      delta: -1,
      shift: false,
      meta: false,
      ctrl: false,
    }
    const event = createWheelEvent(5, 10, fakeNode, parsed)

    expect(event.type).toBe("wheel")
    expect(event.deltaY).toBe(-1)
    expect(event.deltaX).toBe(0)
  })
})

// ============================================================================
// Unit Tests: Double-Click Detection
// ============================================================================

describe("checkDoubleClick", () => {
  it("detects double click within time and distance", () => {
    const state = createDoubleClickState()
    const first = checkDoubleClick(state, 10, 10, 0, 1000)
    expect(first).toBe(false)

    const second = checkDoubleClick(state, 10, 10, 0, 1200)
    expect(second).toBe(true)
  })

  it("rejects double click if too slow", () => {
    const state = createDoubleClickState()
    checkDoubleClick(state, 10, 10, 0, 1000)
    const second = checkDoubleClick(state, 10, 10, 0, 1500) // 500ms > 300ms
    expect(second).toBe(false)
  })

  it("rejects double click if too far apart", () => {
    const state = createDoubleClickState()
    checkDoubleClick(state, 10, 10, 0, 1000)
    const second = checkDoubleClick(state, 15, 10, 0, 1100) // 5 cols > 2
    expect(second).toBe(false)
  })

  it("rejects double click if different button", () => {
    const state = createDoubleClickState()
    checkDoubleClick(state, 10, 10, 0, 1000)
    const second = checkDoubleClick(state, 10, 10, 2, 1100)
    expect(second).toBe(false)
  })

  it("triple click does not trigger another double", () => {
    const state = createDoubleClickState()
    checkDoubleClick(state, 10, 10, 0, 1000)
    const second = checkDoubleClick(state, 10, 10, 0, 1100)
    expect(second).toBe(true)
    // After double, lastClickTime is reset to 0
    const third = checkDoubleClick(state, 10, 10, 0, 1200)
    expect(third).toBe(false)
  })
})

// ============================================================================
// Unit Tests: Enter/Leave Computation
// ============================================================================

describe("computeEnterLeave", () => {
  it("computes entered and left nodes", () => {
    const a = { props: {} } as unknown as InkxNode
    const b = { props: {} } as unknown as InkxNode
    const c = { props: {} } as unknown as InkxNode

    const { entered, left } = computeEnterLeave([a, b], [b, c])
    expect(entered).toEqual([c])
    expect(left).toEqual([a])
  })

  it("handles empty prev path (initial hover)", () => {
    const a = { props: {} } as unknown as InkxNode
    const { entered, left } = computeEnterLeave([], [a])
    expect(entered).toEqual([a])
    expect(left).toEqual([])
  })

  it("handles empty next path (mouse leaves all)", () => {
    const a = { props: {} } as unknown as InkxNode
    const { entered, left } = computeEnterLeave([a], [])
    expect(entered).toEqual([])
    expect(left).toEqual([a])
  })
})

// ============================================================================
// Unit Tests: Hit Testing
// ============================================================================

describe("hitTest", () => {
  it("returns null for node with no screenRect", () => {
    const node = { screenRect: null, children: [], props: {} } as unknown as InkxNode
    expect(hitTest(node, 0, 0)).toBeNull()
  })

  it("returns self when point is inside screenRect", () => {
    const node = {
      screenRect: { x: 0, y: 0, width: 10, height: 5 },
      children: [],
      props: {},
    } as unknown as InkxNode
    expect(hitTest(node, 5, 3)).toBe(node)
  })

  it("returns null when point is outside screenRect", () => {
    const node = {
      screenRect: { x: 0, y: 0, width: 10, height: 5 },
      children: [],
      props: {},
    } as unknown as InkxNode
    expect(hitTest(node, 15, 3)).toBeNull()
  })

  it("returns deepest child at point", () => {
    const child = {
      screenRect: { x: 2, y: 1, width: 4, height: 2 },
      children: [],
      props: {},
      parent: null as unknown as InkxNode,
    } as unknown as InkxNode

    const parent = {
      screenRect: { x: 0, y: 0, width: 10, height: 5 },
      children: [child],
      props: {},
    } as unknown as InkxNode
    child.parent = parent

    expect(hitTest(parent, 3, 1)).toBe(child)
  })

  it("last sibling wins (z-order)", () => {
    const child1 = {
      screenRect: { x: 2, y: 1, width: 4, height: 2 },
      children: [],
      props: {},
    } as unknown as InkxNode

    const child2 = {
      screenRect: { x: 2, y: 1, width: 4, height: 2 }, // Same position
      children: [],
      props: {},
    } as unknown as InkxNode

    const parent = {
      screenRect: { x: 0, y: 0, width: 10, height: 5 },
      children: [child1, child2],
      props: {},
    } as unknown as InkxNode

    // child2 is last, so it wins
    expect(hitTest(parent, 3, 1)).toBe(child2)
  })

  it("respects overflow:hidden clipping", () => {
    const child = {
      screenRect: { x: 15, y: 0, width: 4, height: 2 }, // Outside parent
      children: [],
      props: {},
    } as unknown as InkxNode

    const parent = {
      screenRect: { x: 0, y: 0, width: 10, height: 5 },
      children: [child],
      props: { overflow: "hidden" },
    } as unknown as InkxNode

    // Point at (15, 0) is inside child but outside parent with overflow:hidden
    // hitTest won't even enter parent since point is outside its rect
    expect(hitTest(parent, 15, 0)).toBeNull()
  })
})

// ============================================================================
// Unit Tests: Event Dispatch with Bubbling
// ============================================================================

describe("dispatchMouseEvent", () => {
  it("bubbles from target to root", () => {
    const log: string[] = []

    const root = {
      props: { onClick: () => log.push("root") },
      parent: null,
      children: [],
      screenRect: { x: 0, y: 0, width: 20, height: 10 },
    } as unknown as InkxNode

    const child = {
      props: { onClick: () => log.push("child") },
      parent: root,
      children: [],
      screenRect: { x: 2, y: 2, width: 5, height: 3 },
    } as unknown as InkxNode

    root.children = [child]

    const parsed = { button: 0, x: 3, y: 3, action: "down" as const, shift: false, meta: false, ctrl: false }
    const event = createMouseEvent("click", 3, 3, child, parsed)
    dispatchMouseEvent(event)

    expect(log).toEqual(["child", "root"])
  })

  it("stopPropagation prevents bubbling", () => {
    const log: string[] = []

    const root = {
      props: { onClick: () => log.push("root") },
      parent: null,
      children: [],
      screenRect: { x: 0, y: 0, width: 20, height: 10 },
    } as unknown as InkxNode

    const child = {
      props: {
        onClick: (e: InkxMouseEvent) => {
          log.push("child")
          e.stopPropagation()
        },
      },
      parent: root,
      children: [],
      screenRect: { x: 2, y: 2, width: 5, height: 3 },
    } as unknown as InkxNode

    root.children = [child]

    const parsed = { button: 0, x: 3, y: 3, action: "down" as const, shift: false, meta: false, ctrl: false }
    const event = createMouseEvent("click", 3, 3, child, parsed)
    dispatchMouseEvent(event)

    expect(log).toEqual(["child"])
  })

  it("mouseenter does not bubble", () => {
    const log: string[] = []

    const root = {
      props: { onMouseEnter: () => log.push("root") },
      parent: null,
      children: [],
    } as unknown as InkxNode

    const child = {
      props: { onMouseEnter: () => log.push("child") },
      parent: root,
      children: [],
    } as unknown as InkxNode

    root.children = [child]

    const parsed = { button: 0, x: 0, y: 0, action: "move" as const, shift: false, meta: false, ctrl: false }
    const event = createMouseEvent("mouseenter", 0, 0, child, parsed)
    dispatchMouseEvent(event)

    // Only fires on the target, not the parent
    expect(log).toEqual(["child"])
  })

  it("mouseleave does not bubble", () => {
    const log: string[] = []

    const root = {
      props: { onMouseLeave: () => log.push("root") },
      parent: null,
      children: [],
    } as unknown as InkxNode

    const child = {
      props: { onMouseLeave: () => log.push("child") },
      parent: root,
      children: [],
    } as unknown as InkxNode

    root.children = [child]

    const parsed = { button: 0, x: 0, y: 0, action: "move" as const, shift: false, meta: false, ctrl: false }
    const event = createMouseEvent("mouseleave", 0, 0, child, parsed)
    dispatchMouseEvent(event)

    expect(log).toEqual(["child"])
  })
})

// ============================================================================
// Unit Tests: processMouseEvent (integration of hit-test + dispatch)
// ============================================================================

describe("processMouseEvent", () => {
  it("fires mousedown and mouseup", () => {
    const log: string[] = []

    const node = {
      screenRect: { x: 0, y: 0, width: 10, height: 5 },
      children: [],
      props: {
        onMouseDown: () => log.push("down"),
        onMouseUp: () => log.push("up"),
      },
      parent: null,
    } as unknown as InkxNode

    const state = createMouseEventProcessor()
    const down = { button: 0, x: 5, y: 2, action: "down" as const, shift: false, meta: false, ctrl: false }
    processMouseEvent(state, down, node)
    expect(log).toEqual(["down"])

    const up = { button: 0, x: 5, y: 2, action: "up" as const, shift: false, meta: false, ctrl: false }
    processMouseEvent(state, up, node)
    expect(log).toContain("up")
  })

  it("fires click on mouseup after mousedown", () => {
    const log: string[] = []

    const node = {
      screenRect: { x: 0, y: 0, width: 10, height: 5 },
      children: [],
      props: {
        onClick: () => log.push("click"),
        onMouseDown: () => log.push("down"),
        onMouseUp: () => log.push("up"),
      },
      parent: null,
    } as unknown as InkxNode

    const state = createMouseEventProcessor()
    processMouseEvent(
      state,
      { button: 0, x: 5, y: 2, action: "down" as const, shift: false, meta: false, ctrl: false },
      node,
    )
    processMouseEvent(
      state,
      { button: 0, x: 5, y: 2, action: "up" as const, shift: false, meta: false, ctrl: false },
      node,
    )

    expect(log).toEqual(["down", "up", "click"])
  })

  it("fires wheel event", () => {
    const log: number[] = []

    const node = {
      screenRect: { x: 0, y: 0, width: 10, height: 5 },
      children: [],
      props: {
        onWheel: (e: InkxWheelEvent) => log.push(e.deltaY),
      },
      parent: null,
    } as unknown as InkxNode

    const state = createMouseEventProcessor()
    processMouseEvent(
      state,
      { button: 0, x: 5, y: 2, action: "wheel" as const, delta: -1, shift: false, meta: false, ctrl: false },
      node,
    )
    processMouseEvent(
      state,
      { button: 0, x: 5, y: 2, action: "wheel" as const, delta: 1, shift: false, meta: false, ctrl: false },
      node,
    )

    expect(log).toEqual([-1, 1])
  })
})

// ============================================================================
// Integration Tests: Testing API (app.click, app.wheel, app.doubleClick)
// ============================================================================

const render = createRenderer({ cols: 40, rows: 10 })

describe("app.click()", () => {
  it("fires onClick on component at coordinates", async () => {
    const onClick = vi.fn()

    function App() {
      return (
        <Box width={40} height={10}>
          <Box width={10} height={3} onClick={onClick}>
            <Text>Click me</Text>
          </Box>
        </Box>
      )
    }

    const app = render(<App />)
    await app.click(3, 1)

    expect(onClick).toHaveBeenCalledTimes(1)
    const event = onClick.mock.calls[0]![0] as InkxMouseEvent
    expect(event.type).toBe("click")
    expect(event.clientX).toBe(3)
    expect(event.clientY).toBe(1)
  })

  it("does not fire onClick on component outside coordinates", async () => {
    const onClick = vi.fn()

    function App() {
      return (
        <Box width={40} height={10}>
          <Box width={10} height={3} onClick={onClick}>
            <Text>Click me</Text>
          </Box>
        </Box>
      )
    }

    const app = render(<App />)
    await app.click(35, 8) // Far from the box

    expect(onClick).not.toHaveBeenCalled()
  })

  it("bubbles click from child to parent", async () => {
    const log: string[] = []

    function App() {
      return (
        <Box width={40} height={10} onClick={() => log.push("parent")}>
          <Box width={10} height={3} onClick={() => log.push("child")}>
            <Text>Nested</Text>
          </Box>
        </Box>
      )
    }

    const app = render(<App />)
    await app.click(3, 1)

    expect(log).toEqual(["child", "parent"])
  })

  it("stopPropagation in child prevents parent from receiving click", async () => {
    const log: string[] = []

    function App() {
      return (
        <Box width={40} height={10} onClick={() => log.push("parent")}>
          <Box
            width={10}
            height={3}
            onClick={(e) => {
              log.push("child")
              e.stopPropagation()
            }}
          >
            <Text>Nested</Text>
          </Box>
        </Box>
      )
    }

    const app = render(<App />)
    await app.click(3, 1)

    expect(log).toEqual(["child"])
  })
})

describe("app.doubleClick()", () => {
  it("fires both onClick and onDoubleClick", async () => {
    const onClick = vi.fn()
    const onDoubleClick = vi.fn()

    function App() {
      return (
        <Box width={40} height={10}>
          <Box width={10} height={3} onClick={onClick} onDoubleClick={onDoubleClick}>
            <Text>DblClick</Text>
          </Box>
        </Box>
      )
    }

    const app = render(<App />)
    await app.doubleClick(3, 1)

    // doubleClick sends 2 full click cycles (down+up, down+up)
    // First cycle: click
    // Second cycle: click + dblclick
    expect(onClick).toHaveBeenCalledTimes(2)
    expect(onDoubleClick).toHaveBeenCalledTimes(1)
  })
})

describe("app.wheel()", () => {
  it("fires onWheel with correct delta", async () => {
    const onWheel = vi.fn()

    function App() {
      return (
        <Box width={40} height={10} onWheel={onWheel}>
          <Text>Scrollable area</Text>
        </Box>
      )
    }

    const app = render(<App />)
    await app.wheel(5, 5, -1)

    expect(onWheel).toHaveBeenCalledTimes(1)
    const event = onWheel.mock.calls[0]![0] as InkxWheelEvent
    expect(event.type).toBe("wheel")
    expect(event.deltaY).toBe(-1)
    expect(event.deltaX).toBe(0)
  })

  it("wheel event bubbles from child to parent", async () => {
    const log: string[] = []

    function App() {
      return (
        <Box width={40} height={10} onWheel={() => log.push("parent")}>
          <Box width={10} height={3} onWheel={() => log.push("child")}>
            <Text>Inner</Text>
          </Box>
        </Box>
      )
    }

    const app = render(<App />)
    await app.wheel(3, 1, 1)

    expect(log).toEqual(["child", "parent"])
  })
})

describe("interactive state updates", () => {
  it("click handler can update React state", async () => {
    function App() {
      const [count, setCount] = useState(0)
      return (
        <Box width={40} height={10}>
          <Box width={20} height={3} onClick={() => setCount((c) => c + 1)}>
            <Text>Count: {count}</Text>
          </Box>
        </Box>
      )
    }

    const app = render(<App />)
    expect(app.text).toContain("Count: 0")

    await app.click(5, 1)
    expect(app.text).toContain("Count: 1")

    await app.click(5, 1)
    expect(app.text).toContain("Count: 2")
  })
})

// ============================================================================
// Click-to-Focus Integration
// ============================================================================

describe("processMouseEvent with focusManager", () => {
  it("focuses nearest focusable ancestor on mousedown", () => {
    const fm = createFocusManager()

    // Build a tree: root > focusableBox > textChild
    const root: InkxNode = {
      type: "inkx-root",
      props: {},
      children: [],
      parent: null,
      layoutNode: null,
      contentRect: { x: 0, y: 0, width: 40, height: 10 },
      screenRect: { x: 0, y: 0, width: 40, height: 10 },
      prevLayout: null,
      prevScreenRect: null,
      layoutDirty: false,
      contentDirty: false,
      paintDirty: false,
      bgDirty: false,
      subtreeDirty: false,
      childrenDirty: false,
      layoutSubscribers: new Set(),
    }

    const focusableBox: InkxNode = {
      type: "inkx-box",
      props: { focusable: true, testID: "panel" },
      children: [],
      parent: root,
      layoutNode: null,
      contentRect: { x: 0, y: 0, width: 20, height: 5 },
      screenRect: { x: 0, y: 0, width: 20, height: 5 },
      prevLayout: null,
      prevScreenRect: null,
      layoutDirty: false,
      contentDirty: false,
      paintDirty: false,
      bgDirty: false,
      subtreeDirty: false,
      childrenDirty: false,
      layoutSubscribers: new Set(),
    }

    const textChild: InkxNode = {
      type: "inkx-text",
      props: {},
      children: [],
      parent: focusableBox,
      layoutNode: null,
      contentRect: { x: 2, y: 1, width: 10, height: 1 },
      screenRect: { x: 2, y: 1, width: 10, height: 1 },
      prevLayout: null,
      prevScreenRect: null,
      layoutDirty: false,
      contentDirty: false,
      paintDirty: false,
      bgDirty: false,
      subtreeDirty: false,
      childrenDirty: false,
      layoutSubscribers: new Set(),
    }

    root.children = [focusableBox]
    focusableBox.children = [textChild]

    const state = createMouseEventProcessor({ focusManager: fm })

    // Click on the text child — should focus the focusable ancestor
    processMouseEvent(
      state,
      { button: 0, x: 5, y: 1, action: "down", shift: false, meta: false, ctrl: false },
      root,
    )

    expect(fm.activeElement).toBe(focusableBox)
    expect(fm.focusOrigin).toBe("mouse")
  })

  it("does not focus when no focusable ancestor exists", () => {
    const fm = createFocusManager()

    const root: InkxNode = {
      type: "inkx-root",
      props: {},
      children: [],
      parent: null,
      layoutNode: null,
      contentRect: { x: 0, y: 0, width: 40, height: 10 },
      screenRect: { x: 0, y: 0, width: 40, height: 10 },
      prevLayout: null,
      prevScreenRect: null,
      layoutDirty: false,
      contentDirty: false,
      paintDirty: false,
      bgDirty: false,
      subtreeDirty: false,
      childrenDirty: false,
      layoutSubscribers: new Set(),
    }

    const state = createMouseEventProcessor({ focusManager: fm })

    processMouseEvent(
      state,
      { button: 0, x: 5, y: 5, action: "down", shift: false, meta: false, ctrl: false },
      root,
    )

    expect(fm.activeElement).toBeNull()
  })

  it("works without focusManager (backward compatible)", () => {
    const root: InkxNode = {
      type: "inkx-root",
      props: {},
      children: [],
      parent: null,
      layoutNode: null,
      contentRect: { x: 0, y: 0, width: 40, height: 10 },
      screenRect: { x: 0, y: 0, width: 40, height: 10 },
      prevLayout: null,
      prevScreenRect: null,
      layoutDirty: false,
      contentDirty: false,
      paintDirty: false,
      bgDirty: false,
      subtreeDirty: false,
      childrenDirty: false,
      layoutSubscribers: new Set(),
    }

    // No focusManager — should not throw
    const state = createMouseEventProcessor()
    processMouseEvent(
      state,
      { button: 0, x: 5, y: 5, action: "down", shift: false, meta: false, ctrl: false },
      root,
    )
  })
})

// ============================================================================
// Link Component
// ============================================================================

describe("Link component", () => {
  const render = createRenderer({ cols: 40, rows: 5 })

  it("renders text with OSC 8 hyperlink in ANSI output", () => {
    const app = render(
      <Box>
        <Link href="https://example.com">Click me</Link>
      </Box>,
    )

    // Plain text should contain the link text
    expect(app.text).toContain("Click me")

    // ANSI output should contain OSC 8 sequences
    expect(app.ansi).toContain("\x1b]8;;https://example.com\x1b\\")
    expect(app.ansi).toContain("\x1b]8;;\x1b\\")
  })

  it("renders with default blue color and underline", () => {
    const app = render(
      <Box>
        <Link href="https://example.com">Link</Link>
      </Box>,
    )

    expect(app.text).toContain("Link")
  })

  it("supports custom color", () => {
    const app = render(
      <Box>
        <Link href="https://example.com" color="green">Green Link</Link>
      </Box>,
    )

    expect(app.text).toContain("Green Link")
  })

  it("fires onClick handler", async () => {
    const handleClick = vi.fn()

    const app = render(
      <Box>
        <Link href="https://example.com" onClick={handleClick} testID="link">
          Clickable
        </Link>
      </Box>,
    )

    const linkLoc = app.getByTestId("link")
    const box = linkLoc.boundingBox()
    expect(box).not.toBeNull()

    await app.click(box!.x + 1, box!.y)
    expect(handleClick).toHaveBeenCalledTimes(1)
  })
})
