/**
 * Tests for the pointer state machine.
 *
 * Covers gesture disambiguation: text selection, node drag, area selection,
 * click, double-click, modifier keys, drag threshold, and cancel.
 */
import { describe, test, expect } from "vitest"
import {
  pointerStateUpdate,
  createPointerState,
  createPointerDoubleClickState,
  checkPointerDoubleClick,
  DRAG_THRESHOLD,
  type PointerState,
  type PointerAction,
  type PointerEffect,
} from "@silvery/headless/pointer"
import type { AgNode } from "@silvery/ag/types"

// ============================================================================
// Test Helpers
// ============================================================================

/** Create a minimal AgNode stub for testing */
function makeNode(overrides: Partial<AgNode> = {}): AgNode {
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
// Idle State
// ============================================================================

describe("pointer state machine: idle", () => {
  test("initial state is idle", () => {
    const state = createPointerState()
    expect(state.type).toBe("idle")
  })

  test("pointerMove in idle is no-op", () => {
    const [state, effects] = pointerStateUpdate(move(5, 5), createPointerState())
    expect(state.type).toBe("idle")
    expect(effects).toEqual([])
  })

  test("pointerUp in idle is no-op", () => {
    const [state, effects] = pointerStateUpdate(up(5, 5), createPointerState())
    expect(state.type).toBe("idle")
    expect(effects).toEqual([])
  })

  test("cancel in idle is no-op", () => {
    const [state, effects] = pointerStateUpdate(cancel(), createPointerState())
    expect(state.type).toBe("idle")
    expect(effects).toEqual([])
  })
})

// ============================================================================
// Pointing → Text Selection (userSelect="text" or "auto")
// ============================================================================

describe("pointer state machine: text selection", () => {
  const textNode = makeNode()

  test("pointerDown on selectable text -> pointing-text", () => {
    const [state, effects] = pointerStateUpdate(
      down(10, 5, { target: textNode, userSelect: "text" }),
      createPointerState(),
    )
    expect(state.type).toBe("pointing-text")
    expect(effects).toEqual([])
  })

  test("pointerDown on auto userSelect -> pointing-text", () => {
    const [state] = pointerStateUpdate(
      down(10, 5, { target: textNode, userSelect: "auto" }),
      createPointerState(),
    )
    expect(state.type).toBe("pointing-text")
  })

  test("move past threshold -> dragging-text with selection effects", () => {
    const { state, effects } = runSequence([
      down(10, 5, { target: textNode, userSelect: "text" }),
      move(10 + DRAG_THRESHOLD + 1, 5),
    ])

    expect(state.type).toBe("dragging-text")
    expect(effects).toContainEqual({
      type: "startSelection",
      anchor: { x: 10, y: 5 },
      scope: textNode.scrollRect,
    })
    expect(effects).toContainEqual({
      type: "extendSelection",
      head: { x: 10 + DRAG_THRESHOLD + 1, y: 5 },
    })
  })

  test("move below threshold stays in pointing-text", () => {
    const { state, effects } = runSequence([
      down(10, 5, { target: textNode, userSelect: "text" }),
      move(10 + DRAG_THRESHOLD - 1, 5),
    ])

    expect(state.type).toBe("pointing-text")
    expect(effects).toEqual([])
  })

  test("continued moves in dragging-text emit extendSelection", () => {
    const { state, effects } = runSequence([
      down(10, 5, { target: textNode, userSelect: "text" }),
      move(10 + DRAG_THRESHOLD + 1, 5), // triggers drag
      move(20, 8), // extend
      move(25, 10), // extend more
    ])

    expect(state.type).toBe("dragging-text")
    if (state.type === "dragging-text") {
      expect(state.head).toEqual({ x: 25, y: 10 })
    }
    // Effects: startSelection + 3 extendSelections
    const extends_ = effects.filter((e) => e.type === "extendSelection")
    expect(extends_.length).toBe(3)
  })

  test("pointerUp after dragging-text -> idle with finishSelection", () => {
    const { state, effects } = runSequence([
      down(10, 5, { target: textNode, userSelect: "text" }),
      move(10 + DRAG_THRESHOLD + 1, 5),
      up(20, 5),
    ])

    expect(state.type).toBe("idle")
    expect(effects).toContainEqual({ type: "finishSelection" })
  })

  test("pointerUp before threshold -> click (no drag)", () => {
    const { state, effects } = runSequence([
      down(10, 5, { target: textNode, userSelect: "text" }),
      up(10, 5),
    ])

    expect(state.type).toBe("idle")
    expect(effects).toContainEqual({ type: "click", target: textNode, x: 10, y: 5 })
    // No startSelection or extendSelection
    expect(effects.filter((e) => e.type === "startSelection")).toHaveLength(0)
  })
})

// ============================================================================
// Pointing → Node (non-selectable)
// ============================================================================

describe("pointer state machine: node interaction", () => {
  const nodeElement = makeNode()

  test("pointerDown on non-selectable node -> pointing-node", () => {
    const [state] = pointerStateUpdate(
      down(10, 5, { target: nodeElement, userSelect: "none" }),
      createPointerState(),
    )
    expect(state.type).toBe("pointing-node")
  })

  test("pointerUp on pointing-node -> click effect", () => {
    const { state, effects } = runSequence([
      down(10, 5, { target: nodeElement, userSelect: "none" }),
      up(10, 5),
    ])

    expect(state.type).toBe("idle")
    expect(effects).toContainEqual({ type: "click", target: nodeElement, x: 10, y: 5 })
  })

  test("draggable node: pointerDown -> pointing-node", () => {
    const [state] = pointerStateUpdate(
      down(10, 5, { target: nodeElement, draggable: true }),
      createPointerState(),
    )
    expect(state.type).toBe("pointing-node")
  })

  test("draggable node: move past threshold -> dragging-node with startDrag", () => {
    const { state, effects } = runSequence([
      down(10, 5, { target: nodeElement, draggable: true }),
      move(10 + DRAG_THRESHOLD + 1, 5),
    ])

    expect(state.type).toBe("dragging-node")
    expect(effects).toContainEqual({ type: "startDrag", target: nodeElement })
  })

  test("dragging-node: continued moves emit updateDrag", () => {
    const { effects } = runSequence([
      down(10, 5, { target: nodeElement, draggable: true }),
      move(10 + DRAG_THRESHOLD + 1, 5),
      move(20, 8),
    ])

    expect(effects).toContainEqual({ type: "updateDrag", pos: { x: 20, y: 8 } })
  })

  test("pointerUp on dragging-node -> idle with finishDrag", () => {
    const { state, effects } = runSequence([
      down(10, 5, { target: nodeElement, draggable: true }),
      move(10 + DRAG_THRESHOLD + 1, 5),
      up(20, 5),
    ])

    expect(state.type).toBe("idle")
    // Phase 7 added finishDrag effect — pointerUp now finishes the drag (drop),
    // while cancelDrag is reserved for Escape/cancel action.
    expect(effects.some((e) => e.type === "finishDrag")).toBe(true)
  })
})

// ============================================================================
// Pointing → Empty (area select)
// ============================================================================

describe("pointer state machine: empty area", () => {
  test("pointerDown with no target -> pointing-empty", () => {
    const [state] = pointerStateUpdate(down(10, 5), createPointerState())
    expect(state.type).toBe("pointing-empty")
  })

  test("pointerUp on pointing-empty -> idle with clearSelection", () => {
    const { state, effects } = runSequence([down(10, 5), up(10, 5)])

    expect(state.type).toBe("idle")
    expect(effects).toContainEqual({ type: "clearSelection" })
  })

  test("move past threshold -> dragging-area", () => {
    const { state, effects } = runSequence([down(10, 5), move(10 + DRAG_THRESHOLD + 1, 5)])

    expect(state.type).toBe("dragging-area")
    expect(effects).toContainEqual({ type: "clearSelection" })
  })

  test("pointerUp on dragging-area -> idle", () => {
    const { state } = runSequence([down(10, 5), move(10 + DRAG_THRESHOLD + 1, 5), up(20, 5)])

    expect(state.type).toBe("idle")
  })
})

// ============================================================================
// Alt Key Override (always text selection)
// ============================================================================

describe("pointer state machine: alt key override", () => {
  const nonSelectableNode = makeNode()

  test("Alt + pointerDown on non-selectable -> pointing-text (override)", () => {
    const [state] = pointerStateUpdate(
      down(10, 5, { target: nonSelectableNode, userSelect: "none", altKey: true }),
      createPointerState(),
    )
    expect(state.type).toBe("pointing-text")
  })

  test("Alt + drag on non-selectable -> text selection", () => {
    const { state, effects } = runSequence([
      down(10, 5, { target: nonSelectableNode, userSelect: "none", altKey: true }),
      move(10 + DRAG_THRESHOLD + 1, 5),
    ])

    expect(state.type).toBe("dragging-text")
    expect(effects).toContainEqual({
      type: "startSelection",
      anchor: { x: 10, y: 5 },
      scope: nonSelectableNode.scrollRect,
    })
  })
})

// ============================================================================
// Cancel (Escape)
// ============================================================================

describe("pointer state machine: cancel", () => {
  const textNode = makeNode()
  const nodeElement = makeNode()

  test("cancel from pointing-text -> idle (no effects)", () => {
    const { state, effects } = runSequence([
      down(10, 5, { target: textNode, userSelect: "text" }),
      cancel(),
    ])

    expect(state.type).toBe("idle")
    expect(effects).toEqual([])
  })

  test("cancel from pointing-node -> idle (no effects)", () => {
    const { state, effects } = runSequence([
      down(10, 5, { target: nodeElement, userSelect: "none" }),
      cancel(),
    ])

    expect(state.type).toBe("idle")
    expect(effects).toEqual([])
  })

  test("cancel from pointing-empty -> idle (no effects)", () => {
    const { state, effects } = runSequence([down(10, 5), cancel()])

    expect(state.type).toBe("idle")
    expect(effects).toEqual([])
  })

  test("cancel from dragging-text -> idle with clearSelection", () => {
    const { state, effects } = runSequence([
      down(10, 5, { target: textNode, userSelect: "text" }),
      move(10 + DRAG_THRESHOLD + 1, 5),
      cancel(),
    ])

    expect(state.type).toBe("idle")
    expect(effects).toContainEqual({ type: "clearSelection" })
  })

  test("cancel from dragging-node -> idle with cancelDrag", () => {
    const { state, effects } = runSequence([
      down(10, 5, { target: nodeElement, draggable: true }),
      move(10 + DRAG_THRESHOLD + 1, 5),
      cancel(),
    ])

    expect(state.type).toBe("idle")
    expect(effects).toContainEqual({ type: "cancelDrag" })
  })

  test("cancel from dragging-area -> idle with clearSelection", () => {
    const { state, effects } = runSequence([
      down(10, 5),
      move(10 + DRAG_THRESHOLD + 1, 5),
      cancel(),
    ])

    expect(state.type).toBe("idle")
    expect(effects).toContainEqual({ type: "clearSelection" })
  })
})

// ============================================================================
// Drag Threshold
// ============================================================================

describe("pointer state machine: drag threshold", () => {
  const textNode = makeNode()

  test("exact threshold distance does NOT transition", () => {
    const { state } = runSequence([
      down(10, 5, { target: textNode, userSelect: "text" }),
      move(10 + DRAG_THRESHOLD, 5),
    ])

    expect(state.type).toBe("pointing-text")
  })

  test("one past threshold DOES transition", () => {
    const { state } = runSequence([
      down(10, 5, { target: textNode, userSelect: "text" }),
      move(10 + DRAG_THRESHOLD + 1, 5),
    ])

    expect(state.type).toBe("dragging-text")
  })

  test("diagonal distance uses Chebyshev (max of dx, dy)", () => {
    // Diagonal: dx=2, dy=2 -> distance = max(2,2) = 2 = DRAG_THRESHOLD -> no transition
    const { state: state1 } = runSequence([
      down(10, 5, { target: textNode, userSelect: "text" }),
      move(12, 7),
    ])
    expect(state1.type).toBe("pointing-text")

    // Diagonal: dx=3, dy=1 -> distance = max(3,1) = 3 > DRAG_THRESHOLD -> transition
    const { state: state2 } = runSequence([
      down(10, 5, { target: textNode, userSelect: "text" }),
      move(13, 6),
    ])
    expect(state2.type).toBe("dragging-text")
  })

  test("vertical-only threshold works", () => {
    const { state } = runSequence([
      down(10, 5, { target: textNode, userSelect: "text" }),
      move(10, 5 + DRAG_THRESHOLD + 1),
    ])

    expect(state.type).toBe("dragging-text")
  })
})

// ============================================================================
// Double-Click Detection
// ============================================================================

describe("pointer double-click detection", () => {
  test("two rapid clicks at same position -> double-click", () => {
    const state = createPointerDoubleClickState()

    const first = checkPointerDoubleClick(state, 10, 5, 1000)
    expect(first).toBe(false)

    const second = checkPointerDoubleClick(state, 10, 5, 1100) // 100ms later
    expect(second).toBe(true)
  })

  test("clicks too far apart in time -> not double-click", () => {
    const state = createPointerDoubleClickState()

    checkPointerDoubleClick(state, 10, 5, 1000)
    const second = checkPointerDoubleClick(state, 10, 5, 1400) // 400ms later (> 300ms)
    expect(second).toBe(false)
  })

  test("clicks too far apart in space -> not double-click", () => {
    const state = createPointerDoubleClickState()

    checkPointerDoubleClick(state, 10, 5, 1000)
    const second = checkPointerDoubleClick(state, 15, 5, 1100) // 5 cells away (> 2)
    expect(second).toBe(false)
  })

  test("triple-click does not register as another double", () => {
    const state = createPointerDoubleClickState()

    checkPointerDoubleClick(state, 10, 5, 1000)
    const second = checkPointerDoubleClick(state, 10, 5, 1100)
    expect(second).toBe(true)

    // Third click — timer was reset after double-click
    const third = checkPointerDoubleClick(state, 10, 5, 1200)
    expect(third).toBe(false)
  })

  test("nearby position (within threshold) counts", () => {
    const state = createPointerDoubleClickState()

    checkPointerDoubleClick(state, 10, 5, 1000)
    const second = checkPointerDoubleClick(state, 11, 6, 1100) // 1 cell each direction
    expect(second).toBe(true)
  })
})

// ============================================================================
// Edge Cases
// ============================================================================

describe("pointer state machine: edge cases", () => {
  const textNode = makeNode()

  test("multiple sequential gestures return to idle correctly", () => {
    // First gesture: click
    const { state } = runSequence([
      down(10, 5, { target: textNode, userSelect: "text" }),
      up(10, 5),
    ])
    expect(state.type).toBe("idle")

    // Second gesture: drag
    const result = runSequence(
      [
        down(20, 10, { target: textNode, userSelect: "text" }),
        move(20 + DRAG_THRESHOLD + 1, 10),
        up(30, 10),
      ],
      state,
    )
    expect(result.state.type).toBe("idle")
  })

  test("pointerDown with draggable takes priority over userSelect text", () => {
    const [state] = pointerStateUpdate(
      down(10, 5, { target: textNode, userSelect: "text", draggable: true }),
      createPointerState(),
    )
    // draggable takes priority
    expect(state.type).toBe("pointing-node")
  })

  test("altKey overrides even draggable", () => {
    const [state] = pointerStateUpdate(
      down(10, 5, { target: textNode, userSelect: "none", draggable: true, altKey: true }),
      createPointerState(),
    )
    // altKey forces text mode
    expect(state.type).toBe("pointing-text")
  })

  test("scope captures target scrollRect", () => {
    const nodeWithRect = makeNode({ scrollRect: { x: 5, y: 3, width: 20, height: 10 } })
    const [state] = pointerStateUpdate(
      down(10, 5, { target: nodeWithRect, userSelect: "text" }),
      createPointerState(),
    )

    expect(state.type).toBe("pointing-text")
    if (state.type === "pointing-text") {
      expect(state.scope).toEqual({ x: 5, y: 3, width: 20, height: 10 })
    }
  })

  test("target with no scrollRect -> scope is null", () => {
    const nodeNoRect = makeNode({ scrollRect: null })
    const [state] = pointerStateUpdate(
      down(10, 5, { target: nodeNoRect, userSelect: "text" }),
      createPointerState(),
    )

    expect(state.type).toBe("pointing-text")
    if (state.type === "pointing-text") {
      expect(state.scope).toBeNull()
    }
  })
})

// ============================================================================
// Modifier Key Matrix
// ============================================================================

describe("pointer state machine: modifier keys", () => {
  const node = makeNode()

  test("shift + pointerDown on text target -> pointing-text", () => {
    const [state] = pointerStateUpdate(
      down(10, 5, { target: node, userSelect: "text", shiftKey: true }),
      createPointerState(),
    )
    // Shift in idle just starts a normal pointing-text (extend needs existing context)
    expect(state.type).toBe("pointing-text")
  })
})

// ============================================================================
// Full Gesture Scenarios
// ============================================================================

describe("pointer state machine: full scenarios", () => {
  const textNode = makeNode()
  const emptyTarget = null

  test("scenario: click on text node", () => {
    const { state, effects } = runSequence([
      down(10, 5, { target: textNode, userSelect: "text" }),
      up(10, 5),
    ])

    expect(state.type).toBe("idle")
    // Should produce exactly one click effect
    const clicks = effects.filter((e) => e.type === "click")
    expect(clicks).toHaveLength(1)
    expect(clicks[0]).toEqual({ type: "click", target: textNode, x: 10, y: 5 })
  })

  test("scenario: drag-select text", () => {
    const { state, effects } = runSequence([
      down(10, 5, { target: textNode, userSelect: "text" }),
      move(15, 5),
      move(20, 5),
      move(25, 5),
      up(25, 5),
    ])

    expect(state.type).toBe("idle")

    // Should have: startSelection, 3x extendSelection, finishSelection
    expect(effects.filter((e) => e.type === "startSelection")).toHaveLength(1)
    expect(effects.filter((e) => e.type === "extendSelection")).toHaveLength(3)
    expect(effects.filter((e) => e.type === "finishSelection")).toHaveLength(1)
  })

  test("scenario: click on empty then click on text", () => {
    const { state } = runSequence([down(50, 50), up(50, 50)])
    expect(state.type).toBe("idle")

    const result = runSequence(
      [down(10, 5, { target: textNode, userSelect: "text" }), up(10, 5)],
      state,
    )
    expect(result.state.type).toBe("idle")
    expect(result.effects.filter((e) => e.type === "click")).toHaveLength(1)
  })

  test("scenario: alt+drag on non-selectable for text selection", () => {
    const nonSelectNode = makeNode()
    const { state, effects } = runSequence([
      down(10, 5, { target: nonSelectNode, userSelect: "none", altKey: true }),
      move(20, 5),
      move(30, 5),
      up(30, 5),
    ])

    expect(state.type).toBe("idle")
    expect(effects.filter((e) => e.type === "startSelection")).toHaveLength(1)
    expect(effects.filter((e) => e.type === "finishSelection")).toHaveLength(1)
  })

  test("scenario: escape cancels active text drag", () => {
    const { state, effects } = runSequence([
      down(10, 5, { target: textNode, userSelect: "text" }),
      move(20, 5),
      cancel(),
    ])

    expect(state.type).toBe("idle")
    expect(effects).toContainEqual({ type: "clearSelection" })
  })
})
