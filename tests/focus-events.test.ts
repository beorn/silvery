/**
 * Tests for focus-events.ts — event types, factories, and dispatch.
 *
 * Uses fake HighteaNode trees (no React needed) to test:
 * - createKeyEvent / createFocusEvent factories
 * - dispatchKeyEvent capture/target/bubble phases
 * - dispatchFocusEvent target + bubble
 * - stopPropagation halts traversal
 */

import { describe, expect, it, vi } from "vitest"
import {
  createFocusEvent,
  createKeyEvent,
  dispatchFocusEvent,
  dispatchKeyEvent,
  type HighteaFocusEvent,
  type HighteaKeyEvent,
} from "../src/focus-events.js"
import { emptyKey, type Key } from "../src/keys.js"
import type { TeaNode } from "../src/types.js"

// ============================================================================
// Helpers
// ============================================================================

function fakeNode(name: string, props: Record<string, unknown> = {}, parent: TeaNode | null = null): TeaNode {
  const node = {
    type: "hightea-box" as const,
    props: { testID: name, ...props },
    children: [] as TeaNode[],
    parent,
    layoutNode: null,
    layoutDirty: false,
    contentDirty: false,
    paintDirty: false,
    bgDirty: false,
    subtreeDirty: false,
    screenRect: null,
    layoutSubscribers: new Set(),
  } as unknown as TeaNode
  if (parent) {
    parent.children.push(node)
  }
  return node
}

function makeKey(overrides: Partial<Key> = {}): Key {
  return { ...emptyKey(), ...overrides }
}

// ============================================================================
// createKeyEvent
// ============================================================================

describe("createKeyEvent", () => {
  it("creates event with correct fields", () => {
    const target = fakeNode("target")
    const key = makeKey({ ctrl: true, shift: false })
    const event = createKeyEvent("j", key, target)

    expect(event.key).toBe("j")
    expect(event.input).toBe("j")
    expect(event.ctrl).toBe(true)
    expect(event.shift).toBe(false)
    expect(event.meta).toBe(false)
    expect(event.super).toBe(false)
    expect(event.hyper).toBe(false)
    expect(event.target).toBe(target)
    expect(event.currentTarget).toBe(target)
    expect(event.nativeEvent.input).toBe("j")
    expect(event.nativeEvent.key).toBe(key)
  })

  it("propagation control works", () => {
    const target = fakeNode("target")
    const key = makeKey()
    const event = createKeyEvent("a", key, target)

    expect(event.propagationStopped).toBe(false)
    event.stopPropagation()
    expect(event.propagationStopped).toBe(true)
  })

  it("preventDefault works", () => {
    const target = fakeNode("target")
    const key = makeKey()
    const event = createKeyEvent("a", key, target)

    expect(event.defaultPrevented).toBe(false)
    event.preventDefault()
    expect(event.defaultPrevented).toBe(true)
  })

  it("passes through eventType from Key", () => {
    const target = fakeNode("target")
    const key = makeKey({ eventType: 2 })
    const event = createKeyEvent("a", key, target)

    expect(event.eventType).toBe(2)
  })
})

// ============================================================================
// createFocusEvent
// ============================================================================

describe("createFocusEvent", () => {
  it("creates focus event with correct fields", () => {
    const target = fakeNode("target")
    const related = fakeNode("related")
    const event = createFocusEvent("focus", target, related)

    expect(event.type).toBe("focus")
    expect(event.target).toBe(target)
    expect(event.relatedTarget).toBe(related)
    expect(event.currentTarget).toBe(target)
    expect(event.propagationStopped).toBe(false)
  })

  it("blur event with null relatedTarget", () => {
    const target = fakeNode("target")
    const event = createFocusEvent("blur", target, null)

    expect(event.type).toBe("blur")
    expect(event.relatedTarget).toBeNull()
  })

  it("stopPropagation works", () => {
    const target = fakeNode("target")
    const event = createFocusEvent("focus", target, null)

    expect(event.propagationStopped).toBe(false)
    event.stopPropagation()
    expect(event.propagationStopped).toBe(true)
  })
})

// ============================================================================
// dispatchKeyEvent — Capture / Target / Bubble
// ============================================================================

describe("dispatchKeyEvent", () => {
  it("fires onKeyDown on the target", () => {
    const handler = vi.fn()
    const target = fakeNode("target", { onKeyDown: handler })
    const key = makeKey()
    const event = createKeyEvent("j", key, target)

    dispatchKeyEvent(event)

    expect(handler).toHaveBeenCalledOnce()
    expect(handler).toHaveBeenCalledWith(event, undefined)
  })

  it("passes dispatch function to onKeyDown", () => {
    const handler = vi.fn()
    const dispatch = vi.fn()
    const target = fakeNode("target", { onKeyDown: handler })
    const key = makeKey()
    const event = createKeyEvent("j", key, target)

    dispatchKeyEvent(event, dispatch)

    expect(handler).toHaveBeenCalledWith(event, dispatch)
  })

  it("bubbles from target to root", () => {
    const log: string[] = []

    const root = fakeNode("root", { onKeyDown: () => log.push("root") })
    const child = fakeNode("child", { onKeyDown: () => log.push("child") }, root)

    const key = makeKey()
    const event = createKeyEvent("j", key, child)
    dispatchKeyEvent(event)

    expect(log).toEqual(["child", "root"])
  })

  it("capture phase fires before target and bubble", () => {
    const log: string[] = []

    const root = fakeNode("root", {
      onKeyDown: () => log.push("root-bubble"),
      onKeyDownCapture: () => log.push("root-capture"),
    })
    const middle = fakeNode(
      "middle",
      {
        onKeyDown: () => log.push("middle-bubble"),
        onKeyDownCapture: () => log.push("middle-capture"),
      },
      root,
    )
    const target = fakeNode(
      "target",
      {
        onKeyDown: () => log.push("target"),
      },
      middle,
    )

    const key = makeKey()
    const event = createKeyEvent("j", key, target)
    dispatchKeyEvent(event)

    expect(log).toEqual(["root-capture", "middle-capture", "target", "middle-bubble", "root-bubble"])
  })

  it("stopPropagation in capture phase prevents target and bubble", () => {
    const log: string[] = []

    const root = fakeNode("root", {
      onKeyDownCapture: (e: HighteaKeyEvent) => {
        log.push("root-capture")
        e.stopPropagation()
      },
    })
    const target = fakeNode(
      "target",
      {
        onKeyDown: () => log.push("target"),
      },
      root,
    )

    const key = makeKey()
    const event = createKeyEvent("j", key, target)
    dispatchKeyEvent(event)

    expect(log).toEqual(["root-capture"])
  })

  it("stopPropagation in target phase prevents bubble", () => {
    const log: string[] = []

    const root = fakeNode("root", {
      onKeyDown: () => log.push("root"),
    })
    const target = fakeNode(
      "target",
      {
        onKeyDown: (e: HighteaKeyEvent) => {
          log.push("target")
          e.stopPropagation()
        },
      },
      root,
    )

    const key = makeKey()
    const event = createKeyEvent("j", key, target)
    dispatchKeyEvent(event)

    expect(log).toEqual(["target"])
  })

  it("stopPropagation in bubble stops further bubbling", () => {
    const log: string[] = []

    const root = fakeNode("root", { onKeyDown: () => log.push("root") })
    const middle = fakeNode(
      "middle",
      {
        onKeyDown: (e: HighteaKeyEvent) => {
          log.push("middle")
          e.stopPropagation()
        },
      },
      root,
    )
    const target = fakeNode("target", { onKeyDown: () => log.push("target") }, middle)

    const key = makeKey()
    const event = createKeyEvent("j", key, target)
    dispatchKeyEvent(event)

    expect(log).toEqual(["target", "middle"])
  })

  it("currentTarget changes during traversal", () => {
    const targets: TeaNode[] = []

    const root = fakeNode("root", {
      onKeyDown: (e: HighteaKeyEvent) => targets.push(e.currentTarget),
    })
    const child = fakeNode(
      "child",
      {
        onKeyDown: (e: HighteaKeyEvent) => targets.push(e.currentTarget),
      },
      root,
    )

    const key = makeKey()
    const event = createKeyEvent("j", key, child)
    dispatchKeyEvent(event)

    expect(targets[0]).toBe(child)
    expect(targets[1]).toBe(root)
    // target is always the original target
    expect(event.target).toBe(child)
  })

  it("no handlers is a no-op", () => {
    const root = fakeNode("root")
    const target = fakeNode("target", {}, root)

    const key = makeKey()
    const event = createKeyEvent("j", key, target)

    // Should not throw
    dispatchKeyEvent(event)
  })
})

// ============================================================================
// dispatchFocusEvent — Target + Bubble
// ============================================================================

describe("dispatchFocusEvent", () => {
  it("fires onFocus on the target", () => {
    const handler = vi.fn()
    const target = fakeNode("target", { onFocus: handler })
    const event = createFocusEvent("focus", target, null)

    dispatchFocusEvent(event)

    expect(handler).toHaveBeenCalledOnce()
    expect(handler).toHaveBeenCalledWith(event)
  })

  it("fires onBlur on the target", () => {
    const handler = vi.fn()
    const target = fakeNode("target", { onBlur: handler })
    const event = createFocusEvent("blur", target, null)

    dispatchFocusEvent(event)

    expect(handler).toHaveBeenCalledOnce()
  })

  it("bubbles onFocus from target to ancestors", () => {
    const log: string[] = []

    const root = fakeNode("root", { onFocus: () => log.push("root") })
    const child = fakeNode("child", { onFocus: () => log.push("child") }, root)

    const event = createFocusEvent("focus", child, null)
    dispatchFocusEvent(event)

    expect(log).toEqual(["child", "root"])
  })

  it("stopPropagation prevents bubbling", () => {
    const log: string[] = []

    const root = fakeNode("root", { onFocus: () => log.push("root") })
    const child = fakeNode(
      "child",
      {
        onFocus: (e: HighteaFocusEvent) => {
          log.push("child")
          e.stopPropagation()
        },
      },
      root,
    )

    const event = createFocusEvent("focus", child, null)
    dispatchFocusEvent(event)

    expect(log).toEqual(["child"])
  })

  it("currentTarget changes during bubbling", () => {
    const targets: TeaNode[] = []

    const root = fakeNode("root", {
      onFocus: (e: HighteaFocusEvent) => targets.push(e.currentTarget),
    })
    const child = fakeNode(
      "child",
      {
        onFocus: (e: HighteaFocusEvent) => targets.push(e.currentTarget),
      },
      root,
    )

    const event = createFocusEvent("focus", child, null)
    dispatchFocusEvent(event)

    expect(targets[0]).toBe(child)
    expect(targets[1]).toBe(root)
  })
})
