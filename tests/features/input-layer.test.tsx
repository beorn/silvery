/**
 * InputLayerContext Tests
 *
 * Tests for useInputLayer hook and InputLayerProvider from @silvery/ag-react.
 *
 * Covers:
 * - Single layer handling (consume and bubble)
 * - Bubbling order (child-first, matching useLayoutEffect registration order)
 * - Dynamic layers (add, remove, re-register)
 * - Multiple sibling layers
 * - Edge cases (no provider, useInputLayerContext throw, empty stack)
 * - Integration with real key objects (modifiers, special keys)
 */

import React from "react"
import { describe, test, expect, vi } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, Text } from "@silvery/ag-react"
import {
  InputLayerProvider,
  useInputLayer,
  useInputLayerContext,
  type InputLayerHandler,
} from "../../packages/ag-react/src/contexts/InputLayerContext"

// ============================================================================
// Test Components
// ============================================================================

/** Minimal component that registers an input layer */
function Layer({
  id,
  handler,
  children,
}: {
  id: string
  handler: (input: string, key: import("@silvery/ag/keys").Key) => boolean
  children?: React.ReactNode
}) {
  useInputLayer(id, handler)
  return <Text>{children ?? id}</Text>
}

/** Component that conditionally renders a child layer */
function ConditionalLayer({
  id,
  handler,
  show,
}: {
  id: string
  handler: (input: string, key: import("@silvery/ag/keys").Key) => boolean
  show: boolean
}) {
  return show ? <Layer id={id} handler={handler} /> : null
}

/** Component that uses useInputLayerContext (throws outside provider) */
function ContextConsumer() {
  const ctx = useInputLayerContext()
  return <Text>has context: {ctx ? "yes" : "no"}</Text>
}

// ============================================================================
// 1. Basic Layering
// ============================================================================

describe("useInputLayer — basic layering", () => {
  test("single layer receives input events with correct input and key", async () => {
    const handler = vi.fn(() => true)

    function App() {
      return (
        <InputLayerProvider>
          <Layer id="test" handler={handler}>
            hello
          </Layer>
        </InputLayerProvider>
      )
    }

    const render = createRenderer({ cols: 40, rows: 5 })
    const app = render(<App />)

    await app.press("a")
    expect(handler).toHaveBeenCalledTimes(1)
    const [input, key] = handler.mock.calls[0] as unknown as Parameters<InputLayerHandler>
    expect(input).toBe("a")
    expect(key).toBeDefined()
    expect(key.ctrl).toBe(false)
    expect(key.shift).toBe(false)
    expect(key.escape).toBe(false)
  })

  test("single layer returning false does not consume the event — bubbles to parent", async () => {
    const childHandler = vi.fn(() => false)
    const parentHandler = vi.fn(() => true)

    // Parent wraps Child in the React tree — useLayoutEffect order: child first, parent second.
    // Dispatch walks from index 0 (child) to end (parent).
    function Parent() {
      useInputLayer("parent", parentHandler)
      return (
        <Box>
          <Child />
        </Box>
      )
    }

    function Child() {
      useInputLayer("child", childHandler)
      return <Text>child</Text>
    }

    function App() {
      return (
        <InputLayerProvider>
          <Parent />
        </InputLayerProvider>
      )
    }

    const render = createRenderer({ cols: 40, rows: 5 })
    const app = render(<App />)

    await app.press("x")
    // Both handlers should be called because child returned false
    expect(childHandler).toHaveBeenCalledTimes(1)
    expect(parentHandler).toHaveBeenCalledTimes(1)
  })
})

// ============================================================================
// 2. Bubbling Order (child-first)
// ============================================================================

describe("useInputLayer — bubbling order", () => {
  test("child handler is called before parent handler", async () => {
    const callOrder: string[] = []

    const parentHandler = vi.fn(() => {
      callOrder.push("parent")
      return false
    })

    const childHandler = vi.fn(() => {
      callOrder.push("child")
      return false
    })

    // In React useLayoutEffect, child fires first, so child is pushed first.
    // Stack processes from index 0 = child-first.
    function Parent() {
      useInputLayer("parent", parentHandler)
      return (
        <Box flexDirection="column">
          <Text>parent</Text>
          <Child />
        </Box>
      )
    }

    function Child() {
      useInputLayer("child", childHandler)
      return <Text>child</Text>
    }

    function App() {
      return (
        <InputLayerProvider>
          <Parent />
        </InputLayerProvider>
      )
    }

    const render = createRenderer({ cols: 40, rows: 5 })
    const app = render(<App />)

    await app.press("a")

    expect(callOrder).toEqual(["child", "parent"])
  })

  test("child consuming event prevents parent from being called", async () => {
    const parentHandler = vi.fn(() => true)
    const childHandler = vi.fn(() => true) // consumes

    function Parent() {
      useInputLayer("parent", parentHandler)
      return (
        <Box>
          <Child />
        </Box>
      )
    }

    function Child() {
      useInputLayer("child", childHandler)
      return <Text>child</Text>
    }

    function App() {
      return (
        <InputLayerProvider>
          <Parent />
        </InputLayerProvider>
      )
    }

    const render = createRenderer({ cols: 40, rows: 5 })
    const app = render(<App />)

    await app.press("b")

    expect(childHandler).toHaveBeenCalledTimes(1)
    expect(parentHandler).not.toHaveBeenCalled()
  })

  test("child not consuming event allows parent to handle it", async () => {
    const parentHandler = vi.fn(() => true)
    const childHandler = vi.fn(() => false) // bubbles

    function Parent() {
      useInputLayer("parent", parentHandler)
      return (
        <Box>
          <Child />
        </Box>
      )
    }

    function Child() {
      useInputLayer("child", childHandler)
      return <Text>child</Text>
    }

    function App() {
      return (
        <InputLayerProvider>
          <Parent />
        </InputLayerProvider>
      )
    }

    const render = createRenderer({ cols: 40, rows: 5 })
    const app = render(<App />)

    await app.press("c")

    expect(childHandler).toHaveBeenCalledTimes(1)
    expect(parentHandler).toHaveBeenCalledTimes(1)
  })

  test("three layers: grandchild -> child -> parent ordering", async () => {
    const callOrder: string[] = []

    function Grandparent() {
      useInputLayer("grandparent", () => {
        callOrder.push("grandparent")
        return false
      })
      return (
        <Box>
          <ParentLayer />
        </Box>
      )
    }

    function ParentLayer() {
      useInputLayer("parent", () => {
        callOrder.push("parent")
        return false
      })
      return (
        <Box>
          <Grandchild />
        </Box>
      )
    }

    function Grandchild() {
      useInputLayer("grandchild", () => {
        callOrder.push("grandchild")
        return false
      })
      return <Text>grandchild</Text>
    }

    function App() {
      return (
        <InputLayerProvider>
          <Grandparent />
        </InputLayerProvider>
      )
    }

    const render = createRenderer({ cols: 40, rows: 5 })
    const app = render(<App />)

    await app.press("d")

    expect(callOrder).toEqual(["grandchild", "parent", "grandparent"])
  })

  test("middle layer consuming stops bubbling to grandparent", async () => {
    const callOrder: string[] = []

    function Grandparent() {
      useInputLayer("grandparent", () => {
        callOrder.push("grandparent")
        return true
      })
      return (
        <Box>
          <ParentLayer />
        </Box>
      )
    }

    function ParentLayer() {
      useInputLayer("parent", () => {
        callOrder.push("parent")
        return true // consumes — grandparent should not be called
      })
      return (
        <Box>
          <Grandchild />
        </Box>
      )
    }

    function Grandchild() {
      useInputLayer("grandchild", () => {
        callOrder.push("grandchild")
        return false // bubbles to parent
      })
      return <Text>grandchild</Text>
    }

    function App() {
      return (
        <InputLayerProvider>
          <Grandparent />
        </InputLayerProvider>
      )
    }

    const render = createRenderer({ cols: 40, rows: 5 })
    const app = render(<App />)

    await app.press("e")

    expect(callOrder).toEqual(["grandchild", "parent"])
  })
})

// ============================================================================
// 3. Dynamic Layers
// ============================================================================

describe("useInputLayer — dynamic layers", () => {
  test("layer added after mount via conditional rendering receives events", async () => {
    const dynamicHandler = vi.fn(() => true)

    function App({ showDynamic }: { showDynamic: boolean }) {
      return (
        <InputLayerProvider>
          <Box flexDirection="column">
            <Text>show: {showDynamic ? "yes" : "no"}</Text>
            <ConditionalLayer id="dynamic" handler={dynamicHandler} show={showDynamic} />
          </Box>
        </InputLayerProvider>
      )
    }

    const render = createRenderer({ cols: 40, rows: 5 })

    // Initially the dynamic layer is not mounted
    const app = render(<App showDynamic={false} />)
    expect(app.text).toContain("show: no")

    // Press a key — dynamic handler should not be called
    await app.press("x")
    expect(dynamicHandler).not.toHaveBeenCalled()

    // Re-render with the dynamic layer mounted
    render(<App showDynamic={true} />)
    expect(app.text).toContain("show: yes")

    // Now the dynamic layer should receive events
    await app.press("x")
    expect(dynamicHandler).toHaveBeenCalledTimes(1)
  })

  test("layer removed via unmount no longer receives events", async () => {
    const dynamicHandler = vi.fn(() => true)

    function App({ showDynamic }: { showDynamic: boolean }) {
      return (
        <InputLayerProvider>
          <ConditionalLayer id="dynamic" handler={dynamicHandler} show={showDynamic} />
        </InputLayerProvider>
      )
    }

    const render = createRenderer({ cols: 40, rows: 5 })

    // Mount with layer active
    const app = render(<App showDynamic={true} />)
    await app.press("x")
    expect(dynamicHandler).toHaveBeenCalledTimes(1)

    // Unmount the layer
    render(<App showDynamic={false} />)

    // Press again — dynamic handler should not be called
    dynamicHandler.mockClear()
    await app.press("x")
    expect(dynamicHandler).not.toHaveBeenCalled()
  })

  test("re-registering same ID updates handler in place (preserves position)", async () => {
    const handlerV1 = vi.fn(() => true)
    const handlerV2 = vi.fn(() => true)

    function App({ handler }: { handler: (input: string, key: import("@silvery/ag/keys").Key) => boolean }) {
      return (
        <InputLayerProvider>
          <Layer id="switchable" handler={handler} />
        </InputLayerProvider>
      )
    }

    const render = createRenderer({ cols: 40, rows: 5 })

    // Render with v1 handler
    const app = render(<App handler={handlerV1} />)
    await app.press("a")
    expect(handlerV1).toHaveBeenCalledTimes(1)
    expect(handlerV2).not.toHaveBeenCalled()

    // Re-render with v2 handler (same layer ID)
    render(<App handler={handlerV2} />)
    handlerV1.mockClear()

    await app.press("a")
    expect(handlerV2).toHaveBeenCalledTimes(1)
    expect(handlerV1).not.toHaveBeenCalled()
  })
})

// ============================================================================
// 4. Multiple Independent Layers
// ============================================================================

describe("useInputLayer — multiple sibling layers", () => {
  test("two sibling layers both registered — first registered handles first", async () => {
    const callOrder: string[] = []

    function SiblingA() {
      useInputLayer("sibling-a", () => {
        callOrder.push("sibling-a")
        return false
      })
      return <Text>A</Text>
    }

    function SiblingB() {
      useInputLayer("sibling-b", () => {
        callOrder.push("sibling-b")
        return false
      })
      return <Text>B</Text>
    }

    function App() {
      return (
        <InputLayerProvider>
          <Box flexDirection="column">
            <SiblingA />
            <SiblingB />
          </Box>
        </InputLayerProvider>
      )
    }

    const render = createRenderer({ cols: 40, rows: 5 })
    const app = render(<App />)

    await app.press("z")

    // Both called since neither consumes
    expect(callOrder).toHaveLength(2)
    expect(callOrder).toContain("sibling-a")
    expect(callOrder).toContain("sibling-b")
  })

  test("first sibling consuming prevents second sibling from receiving", async () => {
    const handlerA = vi.fn(() => true) // consumes
    const handlerB = vi.fn(() => true)

    // Siblings at the same level — whichever registers first in the layout
    // effect order will handle first.
    function App() {
      return (
        <InputLayerProvider>
          <Box flexDirection="column">
            <Layer id="sibling-a" handler={handlerA} />
            <Layer id="sibling-b" handler={handlerB} />
          </Box>
        </InputLayerProvider>
      )
    }

    const render = createRenderer({ cols: 40, rows: 5 })
    const app = render(<App />)

    await app.press("z")

    // One consumes, the other should not be called
    // The exact order depends on useLayoutEffect order for siblings,
    // but one should consume and the other should not be called.
    const totalCalls = handlerA.mock.calls.length + handlerB.mock.calls.length
    // The first one to fire consumes, so exactly 1 handler is called
    expect(totalCalls).toBe(1)
  })
})

// ============================================================================
// 5. Edge Cases
// ============================================================================

describe("useInputLayer — edge cases", () => {
  test("useInputLayer outside InputLayerProvider is a silent no-op", async () => {
    const handler = vi.fn(() => true)

    function App() {
      // No InputLayerProvider wrapping this — should not crash
      useInputLayer("orphan", handler)
      return <Text>no provider</Text>
    }

    const render = createRenderer({ cols: 40, rows: 5 })
    const app = render(<App />)

    expect(app.text).toContain("no provider")
    // No crash occurred
  })

  test("useInputLayerContext outside provider throws an error", () => {
    function App() {
      return <ContextConsumer />
    }

    const render = createRenderer({ cols: 40, rows: 5 })

    expect(() => render(<App />)).toThrow("useInputLayerContext must be used within an InputLayerProvider")
  })

  test("useInputLayerContext inside provider does not throw", () => {
    function App() {
      return (
        <InputLayerProvider>
          <ContextConsumer />
        </InputLayerProvider>
      )
    }

    const render = createRenderer({ cols: 40, rows: 5 })
    const app = render(<App />)

    expect(app.text).toContain("has context: yes")
  })

  test("empty layer stack — events dispatched without error", async () => {
    function App() {
      return (
        <InputLayerProvider>
          <Text>empty stack</Text>
        </InputLayerProvider>
      )
    }

    const render = createRenderer({ cols: 40, rows: 5 })
    const app = render(<App />)

    // Press should not throw even with no layers registered
    await app.press("a")
    await app.press("Escape")
    expect(app.text).toContain("empty stack")
  })

  test("multiple events dispatch sequentially through the stack", async () => {
    const inputs: string[] = []
    const handler = vi.fn((input: string) => {
      inputs.push(input)
      return true
    })

    function App() {
      return (
        <InputLayerProvider>
          <Layer id="collector" handler={handler} />
        </InputLayerProvider>
      )
    }

    const render = createRenderer({ cols: 40, rows: 5 })
    const app = render(<App />)

    await app.press("a")
    await app.press("b")
    await app.press("c")

    expect(handler).toHaveBeenCalledTimes(3)
    expect(inputs).toEqual(["a", "b", "c"])
  })
})

// ============================================================================
// 6. Integration with Real Keys
// ============================================================================

describe("useInputLayer — key object integration", () => {
  test("handler receives Escape key with key.escape = true", async () => {
    const handler = vi.fn(() => true)

    function App() {
      return (
        <InputLayerProvider>
          <Layer id="esc-handler" handler={handler} />
        </InputLayerProvider>
      )
    }

    const render = createRenderer({ cols: 40, rows: 5 })
    const app = render(<App />)

    await app.press("Escape")

    expect(handler).toHaveBeenCalledTimes(1)
    const [, key] = handler.mock.calls[0] as unknown as Parameters<InputLayerHandler>
    expect(key.escape).toBe(true)
  })

  test("handler receives Enter key with key.return = true", async () => {
    const handler = vi.fn(() => true)

    function App() {
      return (
        <InputLayerProvider>
          <Layer id="enter-handler" handler={handler} />
        </InputLayerProvider>
      )
    }

    const render = createRenderer({ cols: 40, rows: 5 })
    const app = render(<App />)

    await app.press("Enter")

    expect(handler).toHaveBeenCalledTimes(1)
    const [, key] = handler.mock.calls[0] as unknown as Parameters<InputLayerHandler>
    expect(key.return).toBe(true)
  })

  test("child layer handles navigation keys selectively, unhandled bubbles to parent", async () => {
    const consumed: string[] = []
    const bubbled: string[] = []

    // Parent-child in the React tree ensures child registers first (index 0),
    // parent registers second (index 1). Dispatch walks child-first.
    function ParentFallback() {
      useInputLayer("fallback", (input) => {
        bubbled.push(input)
        return true
      })
      return (
        <Box>
          <ChildNavigation />
        </Box>
      )
    }

    function ChildNavigation() {
      useInputLayer("navigation", (input) => {
        if (input === "j" || input === "k") {
          consumed.push(input)
          return true
        }
        return false
      })
      return <Text>nav</Text>
    }

    function App() {
      return (
        <InputLayerProvider>
          <ParentFallback />
        </InputLayerProvider>
      )
    }

    const render = createRenderer({ cols: 40, rows: 5 })
    const app = render(<App />)

    await app.press("j") // child navigation consumes
    await app.press("k") // child navigation consumes
    await app.press("q") // child navigation bubbles, parent fallback consumes

    expect(consumed).toEqual(["j", "k"])
    expect(bubbled).toEqual(["q"])
  })

  test("layer handles Escape bubbling to parent", async () => {
    const parentEscapeCalls: string[] = []
    const childEscapeCalls: string[] = []

    function Parent() {
      useInputLayer("parent", (_input, key) => {
        if (key.escape) {
          parentEscapeCalls.push("parent-esc")
          return true
        }
        return false
      })
      return (
        <Box>
          <Child />
        </Box>
      )
    }

    function Child() {
      useInputLayer("child", (input, key) => {
        // Child handles letters but not Escape
        if (!key.escape && !key.return && input.length === 1) {
          childEscapeCalls.push(input)
          return true
        }
        return false
      })
      return <Text>child</Text>
    }

    function App() {
      return (
        <InputLayerProvider>
          <Parent />
        </InputLayerProvider>
      )
    }

    const render = createRenderer({ cols: 40, rows: 5 })
    const app = render(<App />)

    await app.press("a") // child consumes
    await app.press("Escape") // child bubbles, parent consumes

    expect(childEscapeCalls).toEqual(["a"])
    expect(parentEscapeCalls).toEqual(["parent-esc"])
  })

  test("Ctrl modifier is passed through to handler", async () => {
    const handler = vi.fn(() => true)

    function App() {
      return (
        <InputLayerProvider>
          <Layer id="ctrl-handler" handler={handler} />
        </InputLayerProvider>
      )
    }

    const render = createRenderer({ cols: 40, rows: 5, kittyMode: true })
    const app = render(<App />)

    await app.press("Ctrl+s")

    expect(handler).toHaveBeenCalledTimes(1)
    const [, key] = handler.mock.calls[0] as unknown as Parameters<InputLayerHandler>
    expect(key.ctrl).toBe(true)
  })
})
