/**
 * Tests for the drag-and-drop system.
 *
 * Covers: draggable resolution, pointer state machine drag gestures,
 * drag effects (startDrag, updateDrag, finishDrag, cancelDrag),
 * drop target detection, and DragState lifecycle.
 */
import { describe, test, expect } from "vitest"
import {
  pointerStateUpdate,
  createPointerState,
  DRAG_THRESHOLD,
  type PointerState,
  type PointerAction,
  type PointerEffect,
} from "@silvery/headless/pointer"
import { resolveNodeDraggable } from "@silvery/ag-term/mouse-events"
import {
  createDragState,
  createDragEvent,
  isDropTarget,
  findDropTarget,
  type DragState,
} from "@silvery/ag-term/drag-events"
import type { AgNode } from "@silvery/ag/types"

// ============================================================================
// Test Helpers
// ============================================================================

/** Create a minimal AgNode stub for testing */
function makeNode(overrides: Partial<AgNode> & { props?: Record<string, unknown> } = {}): AgNode {
  return {
    type: "silvery-box",
    props: {},
    children: [],
    parent: null,
    layoutNode: null as any,
    scrollRect: { x: 0, y: 0, width: 80, height: 24 },
    inlineRects: null,
    contentLines: null,
    textContent: undefined,
    isRawText: false,
    dirty: false,
    prevRenderedContent: null,
    ...overrides,
  } as AgNode
}

/** Run the state machine through a sequence of actions, collecting all effects */
function runSequence(
  actions: PointerAction[],
  initial?: PointerState,
): { state: PointerState; effects: PointerEffect[] } {
  let state = initial ?? createPointerState()
  const allEffects: PointerEffect[] = []

  for (const action of actions) {
    const [next, effects] = pointerStateUpdate(action, state)
    state = next
    allEffects.push(...effects)
  }

  return { state, effects: allEffects }
}

/** Create a pointerDown action with sensible defaults */
function down(
  x: number,
  y: number,
  opts: {
    target?: AgNode | null
    altKey?: boolean
    shiftKey?: boolean
    userSelect?: "text" | "auto" | "none"
    draggable?: boolean
  } = {},
): PointerAction {
  return {
    type: "pointerDown",
    x,
    y,
    altKey: opts.altKey ?? false,
    shiftKey: opts.shiftKey ?? false,
    target: opts.target ?? null,
    targetUserSelect: opts.userSelect ?? "auto",
    targetDraggable: opts.draggable ?? false,
  }
}

function move(x: number, y: number): PointerAction {
  return { type: "pointerMove", x, y }
}

function up(x: number, y: number): PointerAction {
  return { type: "pointerUp", x, y }
}

function cancel(): PointerAction {
  return { type: "cancel" }
}

// ============================================================================
// resolveNodeDraggable
// ============================================================================

describe("resolveNodeDraggable", () => {
  test("returns false for null node", () => {
    expect(resolveNodeDraggable(null)).toBe(false)
  })

  test("returns false for node without draggable prop", () => {
    const node = makeNode()
    expect(resolveNodeDraggable(node)).toBe(false)
  })

  test("returns true for node with draggable=true", () => {
    const node = makeNode({ props: { draggable: true } })
    expect(resolveNodeDraggable(node)).toBe(true)
  })

  test("returns false for node with draggable=false", () => {
    const node = makeNode({ props: { draggable: false } })
    expect(resolveNodeDraggable(node)).toBe(false)
  })

  test("draggable is NOT inherited from parent", () => {
    const parent = makeNode({ props: { draggable: true } })
    const child = makeNode({ parent })
    parent.children = [child]

    expect(resolveNodeDraggable(parent)).toBe(true)
    expect(resolveNodeDraggable(child)).toBe(false)
  })

  test("child can be draggable even if parent is not", () => {
    const parent = makeNode()
    const child = makeNode({ props: { draggable: true }, parent })
    parent.children = [child]

    expect(resolveNodeDraggable(parent)).toBe(false)
    expect(resolveNodeDraggable(child)).toBe(true)
  })
})

// ============================================================================
// Pointer state machine: draggable node -> pointing-node -> dragging-node
// ============================================================================

describe("pointer state machine: draggable node gestures", () => {
  const draggableNode = makeNode({ props: { draggable: true } })

  test("pointerDown on draggable node -> pointing-node", () => {
    const [state, effects] = pointerStateUpdate(
      down(10, 5, { target: draggableNode, draggable: true }),
      createPointerState(),
    )
    expect(state.type).toBe("pointing-node")
    expect(effects).toEqual([])
  })

  test("move past threshold -> dragging-node with startDrag effect", () => {
    const { state, effects } = runSequence([
      down(10, 5, { target: draggableNode, draggable: true }),
      move(10 + DRAG_THRESHOLD + 1, 5),
    ])

    expect(state.type).toBe("dragging-node")
    expect(effects).toContainEqual({ type: "startDrag", target: draggableNode })
  })

  test("move below threshold stays in pointing-node", () => {
    const { state, effects } = runSequence([
      down(10, 5, { target: draggableNode, draggable: true }),
      move(10 + DRAG_THRESHOLD - 1, 5),
    ])

    expect(state.type).toBe("pointing-node")
    expect(effects).toEqual([])
  })

  test("continued moves in dragging-node emit updateDrag", () => {
    const { effects } = runSequence([
      down(10, 5, { target: draggableNode, draggable: true }),
      move(10 + DRAG_THRESHOLD + 1, 5),
      move(20, 8),
      move(25, 10),
    ])

    const updates = effects.filter((e) => e.type === "updateDrag")
    expect(updates).toHaveLength(2)
    expect(updates[0]).toEqual({ type: "updateDrag", pos: { x: 20, y: 8 } })
    expect(updates[1]).toEqual({ type: "updateDrag", pos: { x: 25, y: 10 } })
  })

  test("pointerUp without crossing threshold -> click (no drag)", () => {
    const { state, effects } = runSequence([
      down(10, 5, { target: draggableNode, draggable: true }),
      up(10, 5),
    ])

    expect(state.type).toBe("idle")
    expect(effects).toContainEqual({ type: "click", target: draggableNode, x: 10, y: 5 })
    expect(effects.filter((e) => e.type === "startDrag")).toHaveLength(0)
  })
})

// ============================================================================
// Drag effects: finishDrag and cancelDrag
// ============================================================================

describe("pointer state machine: drag finish and cancel", () => {
  const draggableNode = makeNode({ props: { draggable: true } })

  test("pointerUp after dragging -> finishDrag with target and position", () => {
    const { state, effects } = runSequence([
      down(10, 5, { target: draggableNode, draggable: true }),
      move(10 + DRAG_THRESHOLD + 1, 5),
      up(20, 8),
    ])

    expect(state.type).toBe("idle")
    const finishEffects = effects.filter((e) => e.type === "finishDrag")
    expect(finishEffects).toHaveLength(1)
    expect(finishEffects[0]).toEqual({
      type: "finishDrag",
      target: draggableNode,
      pos: { x: 20, y: 8 },
    })
  })

  test("cancel from dragging-node -> cancelDrag", () => {
    const { state, effects } = runSequence([
      down(10, 5, { target: draggableNode, draggable: true }),
      move(10 + DRAG_THRESHOLD + 1, 5),
      cancel(),
    ])

    expect(state.type).toBe("idle")
    expect(effects).toContainEqual({ type: "cancelDrag" })
    expect(effects.filter((e) => e.type === "finishDrag")).toHaveLength(0)
  })

  test("cancel from pointing-node -> idle (no drag effects)", () => {
    const { state, effects } = runSequence([
      down(10, 5, { target: draggableNode, draggable: true }),
      cancel(),
    ])

    expect(state.type).toBe("idle")
    expect(effects.filter((e) => e.type === "startDrag")).toHaveLength(0)
    expect(effects.filter((e) => e.type === "cancelDrag")).toHaveLength(0)
    expect(effects.filter((e) => e.type === "finishDrag")).toHaveLength(0)
  })
})

// ============================================================================
// Drop target detection
// ============================================================================

describe("drop target detection", () => {
  test("isDropTarget returns false for null", () => {
    expect(isDropTarget(null)).toBe(false)
  })

  test("isDropTarget returns false for node without drop handlers", () => {
    const node = makeNode()
    expect(isDropTarget(node)).toBe(false)
  })

  test("isDropTarget returns true for node with onDrop", () => {
    const node = makeNode({ props: { onDrop: () => {} } })
    expect(isDropTarget(node)).toBe(true)
  })

  test("isDropTarget returns true for node with onDragEnter", () => {
    const node = makeNode({ props: { onDragEnter: () => {} } })
    expect(isDropTarget(node)).toBe(true)
  })

  test("isDropTarget returns true for node with onDragOver", () => {
    const node = makeNode({ props: { onDragOver: () => {} } })
    expect(isDropTarget(node)).toBe(true)
  })

  test("isDropTarget returns true for node with onDragLeave", () => {
    const node = makeNode({ props: { onDragLeave: () => {} } })
    expect(isDropTarget(node)).toBe(true)
  })

  test("findDropTarget finds self when it has drop handler", () => {
    const node = makeNode({ props: { onDrop: () => {} } })
    expect(findDropTarget(node)).toBe(node)
  })

  test("findDropTarget walks up to ancestor with drop handler", () => {
    const grandparent = makeNode({ props: { onDrop: () => {} } })
    const parent = makeNode({ parent: grandparent })
    grandparent.children = [parent]
    const child = makeNode({ parent })
    parent.children = [child]

    expect(findDropTarget(child)).toBe(grandparent)
  })

  test("findDropTarget returns null when no ancestor accepts drops", () => {
    const parent = makeNode()
    const child = makeNode({ parent })
    parent.children = [child]

    expect(findDropTarget(child)).toBeNull()
  })

  test("findDropTarget returns nearest ancestor, not root", () => {
    const root = makeNode({ props: { onDrop: () => {} } })
    const parent = makeNode({ props: { onDrop: () => {} }, parent: root })
    root.children = [parent]
    const child = makeNode({ parent })
    parent.children = [child]

    expect(findDropTarget(child)).toBe(parent)
  })
})

// ============================================================================
// DragState and DragEvent factories
// ============================================================================

describe("DragState and DragEvent factories", () => {
  test("createDragState initializes correctly", () => {
    const source = makeNode({ props: { draggable: true } })
    const startPos = { x: 10, y: 5 }
    const state = createDragState(source, startPos)

    expect(state.active).toBe(true)
    expect(state.source).toBe(source)
    expect(state.startPos).toEqual(startPos)
    expect(state.currentPos).toEqual(startPos)
    expect(state.dropTarget).toBeNull()
  })

  test("createDragEvent creates event payload", () => {
    const source = makeNode({ props: { draggable: true } })
    const dropTarget = makeNode({ props: { onDrop: () => {} } })
    const pos = { x: 20, y: 8 }
    const event = createDragEvent(source, pos, dropTarget)

    expect(event.source).toBe(source)
    expect(event.position).toEqual(pos)
    expect(event.dropTarget).toBe(dropTarget)
  })

  test("createDragEvent with null drop target", () => {
    const source = makeNode({ props: { draggable: true } })
    const event = createDragEvent(source, { x: 10, y: 5 }, null)

    expect(event.dropTarget).toBeNull()
  })
})

// ============================================================================
// Modifier key interactions with draggable
// ============================================================================

describe("modifier key interactions with draggable", () => {
  const draggableNode = makeNode({ props: { draggable: true } })

  test("altKey overrides draggable -> text selection instead of drag", () => {
    const [state] = pointerStateUpdate(
      down(10, 5, {
        target: draggableNode,
        draggable: true,
        altKey: true,
        userSelect: "none",
      }),
      createPointerState(),
    )
    expect(state.type).toBe("pointing-text")
  })

  test("draggable takes priority over userSelect=text", () => {
    const [state] = pointerStateUpdate(
      down(10, 5, {
        target: draggableNode,
        draggable: true,
        userSelect: "text",
      }),
      createPointerState(),
    )
    expect(state.type).toBe("pointing-node")
  })
})

// ============================================================================
// Full drag-and-drop scenario
// ============================================================================

describe("full drag-and-drop scenario", () => {
  const draggableNode = makeNode({ props: { draggable: true } })

  test("complete drag lifecycle: down -> move past threshold -> move -> up", () => {
    const { state, effects } = runSequence([
      down(10, 5, { target: draggableNode, draggable: true }),
      move(10 + DRAG_THRESHOLD + 1, 5), // triggers startDrag
      move(20, 8), // updateDrag
      move(30, 12), // updateDrag
      up(30, 12), // finishDrag
    ])

    expect(state.type).toBe("idle")

    const effectTypes = effects.map((e) => e.type)
    expect(effectTypes).toEqual(["startDrag", "updateDrag", "updateDrag", "finishDrag"])

    // Verify startDrag has the right target
    expect(effects[0]).toEqual({ type: "startDrag", target: draggableNode })

    // Verify finishDrag has correct position
    expect(effects[3]).toEqual({
      type: "finishDrag",
      target: draggableNode,
      pos: { x: 30, y: 12 },
    })
  })

  test("cancelled drag lifecycle: down -> move past threshold -> cancel", () => {
    const { state, effects } = runSequence([
      down(10, 5, { target: draggableNode, draggable: true }),
      move(10 + DRAG_THRESHOLD + 1, 5), // triggers startDrag
      move(20, 8), // updateDrag
      cancel(), // cancelDrag
    ])

    expect(state.type).toBe("idle")

    const effectTypes = effects.map((e) => e.type)
    expect(effectTypes).toEqual(["startDrag", "updateDrag", "cancelDrag"])
  })

  test("aborted drag (up before threshold): produces click, no drag effects", () => {
    const { state, effects } = runSequence([
      down(10, 5, { target: draggableNode, draggable: true }),
      move(11, 5), // below threshold
      up(11, 5),
    ])

    expect(state.type).toBe("idle")

    const effectTypes = effects.map((e) => e.type)
    expect(effectTypes).toEqual(["click"])
    expect(effects[0]).toEqual({ type: "click", target: draggableNode, x: 11, y: 5 })
  })

  test("dragging-node state tracks current position", () => {
    const { state } = runSequence([
      down(10, 5, { target: draggableNode, draggable: true }),
      move(10 + DRAG_THRESHOLD + 1, 5),
      move(25, 15),
    ])

    expect(state.type).toBe("dragging-node")
    if (state.type === "dragging-node") {
      expect(state.target).toBe(draggableNode)
      expect(state.startPos).toEqual({ x: 10, y: 5 })
      expect(state.currentPos).toEqual({ x: 25, y: 15 })
    }
  })
})
