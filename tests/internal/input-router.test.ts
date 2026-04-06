/**
 * Tests for InputRouter — priority-based event dispatcher.
 *
 * Covers:
 * - Priority dispatch order (higher priority first)
 * - Event claiming (handler returns true blocks lower priority)
 * - Same-priority tie-breaking (first registered wins)
 * - invalidate() calls injected callback
 * - Unregister removes handler
 * - Overlay ordering by priority
 */
import { describe, test, expect, vi } from "vitest"
import {
  createInputRouter,
  type RouterMouseEvent,
  type RouterKeyEvent,
} from "../../packages/create/src/internal/input-router.ts"

// ============================================================================
// Helpers
// ============================================================================

function mouseEvent(overrides?: Partial<RouterMouseEvent>): RouterMouseEvent {
  return {
    x: 10,
    y: 5,
    button: 0,
    type: "mousedown",
    ...overrides,
  }
}

function keyEvent(overrides?: Partial<RouterKeyEvent>): RouterKeyEvent {
  return {
    key: "a",
    ...overrides,
  }
}

// ============================================================================
// Mouse handler tests
// ============================================================================

describe("InputRouter — mouse handlers", () => {
  test("higher priority handler receives event first", () => {
    const calls: string[] = []
    const router = createInputRouter({ invalidate: () => {} })

    router.registerMouseHandler(10, () => {
      calls.push("low")
      return false
    })
    router.registerMouseHandler(20, () => {
      calls.push("high")
      return false
    })

    router.dispatchMouse(mouseEvent())

    expect(calls).toEqual(["high", "low"])
  })

  test("handler claiming event prevents lower priority from running", () => {
    const calls: string[] = []
    const router = createInputRouter({ invalidate: () => {} })

    router.registerMouseHandler(10, () => {
      calls.push("low")
      return false
    })
    router.registerMouseHandler(20, () => {
      calls.push("high")
      return true // claim
    })

    const consumed = router.dispatchMouse(mouseEvent())

    expect(consumed).toBe(true)
    expect(calls).toEqual(["high"])
  })

  test("same priority: first registered wins (dispatches first)", () => {
    const calls: string[] = []
    const router = createInputRouter({ invalidate: () => {} })

    router.registerMouseHandler(10, () => {
      calls.push("first")
      return false
    })
    router.registerMouseHandler(10, () => {
      calls.push("second")
      return false
    })

    router.dispatchMouse(mouseEvent())

    expect(calls).toEqual(["first", "second"])
  })

  test("unregister removes handler", () => {
    const calls: string[] = []
    const router = createInputRouter({ invalidate: () => {} })

    const unregister = router.registerMouseHandler(10, () => {
      calls.push("removed")
      return false
    })
    router.registerMouseHandler(10, () => {
      calls.push("kept")
      return false
    })

    unregister()
    router.dispatchMouse(mouseEvent())

    expect(calls).toEqual(["kept"])
  })

  test("dispatchMouse returns false when no handler claims", () => {
    const router = createInputRouter({ invalidate: () => {} })

    router.registerMouseHandler(10, () => false)

    expect(router.dispatchMouse(mouseEvent())).toBe(false)
  })

  test("dispatchMouse returns false with no handlers", () => {
    const router = createInputRouter({ invalidate: () => {} })
    expect(router.dispatchMouse(mouseEvent())).toBe(false)
  })
})

// ============================================================================
// Key handler tests
// ============================================================================

describe("InputRouter — key handlers", () => {
  test("higher priority handler receives event first", () => {
    const calls: string[] = []
    const router = createInputRouter({ invalidate: () => {} })

    router.registerKeyHandler(5, () => {
      calls.push("low")
      return false
    })
    router.registerKeyHandler(15, () => {
      calls.push("high")
      return false
    })

    router.dispatchKey(keyEvent())

    expect(calls).toEqual(["high", "low"])
  })

  test("handler claiming event prevents lower priority from running", () => {
    const calls: string[] = []
    const router = createInputRouter({ invalidate: () => {} })

    router.registerKeyHandler(5, () => {
      calls.push("low")
      return false
    })
    router.registerKeyHandler(15, () => {
      calls.push("high")
      return true // claim
    })

    const consumed = router.dispatchKey(keyEvent())

    expect(consumed).toBe(true)
    expect(calls).toEqual(["high"])
  })

  test("same priority: first registered wins", () => {
    const calls: string[] = []
    const router = createInputRouter({ invalidate: () => {} })

    router.registerKeyHandler(10, () => {
      calls.push("first")
      return false
    })
    router.registerKeyHandler(10, () => {
      calls.push("second")
      return false
    })

    router.dispatchKey(keyEvent())

    expect(calls).toEqual(["first", "second"])
  })

  test("unregister removes handler", () => {
    const calls: string[] = []
    const router = createInputRouter({ invalidate: () => {} })

    const unregister = router.registerKeyHandler(10, () => {
      calls.push("removed")
      return false
    })

    unregister()
    router.dispatchKey(keyEvent())

    expect(calls).toEqual([])
  })
})

// ============================================================================
// Invalidation tests
// ============================================================================

describe("InputRouter — invalidation", () => {
  test("invalidate() calls the injected callback", () => {
    const invalidate = vi.fn()
    const router = createInputRouter({ invalidate })

    router.invalidate()

    expect(invalidate).toHaveBeenCalledTimes(1)
  })

  test("invalidate() can be called multiple times", () => {
    const invalidate = vi.fn()
    const router = createInputRouter({ invalidate })

    router.invalidate()
    router.invalidate()
    router.invalidate()

    expect(invalidate).toHaveBeenCalledTimes(3)
  })
})

// ============================================================================
// Overlay tests
// ============================================================================

describe("InputRouter — overlays", () => {
  test("overlays returned in priority order (highest first)", () => {
    const router = createInputRouter({ invalidate: () => {} })

    const r1 = vi.fn()
    const r2 = vi.fn()
    const r3 = vi.fn()

    router.registerOverlay(5, r1)
    router.registerOverlay(20, r2)
    router.registerOverlay(10, r3)

    const overlays = router.getOverlays()

    expect(overlays).toEqual([r2, r3, r1])
  })

  test("same-priority overlays: first registered comes first", () => {
    const router = createInputRouter({ invalidate: () => {} })

    const r1 = vi.fn()
    const r2 = vi.fn()

    router.registerOverlay(10, r1)
    router.registerOverlay(10, r2)

    const overlays = router.getOverlays()

    expect(overlays).toEqual([r1, r2])
  })

  test("unregister removes overlay", () => {
    const router = createInputRouter({ invalidate: () => {} })

    const r1 = vi.fn()
    const r2 = vi.fn()

    const unregister = router.registerOverlay(10, r1)
    router.registerOverlay(10, r2)

    unregister()

    expect(router.getOverlays()).toEqual([r2])
  })

  test("getOverlays returns empty array with no overlays", () => {
    const router = createInputRouter({ invalidate: () => {} })
    expect(router.getOverlays()).toEqual([])
  })
})
