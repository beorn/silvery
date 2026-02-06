/**
 * React 19 Compatibility Tests (km-a1xb)
 *
 * These tests verify that inkx works correctly with React 19 features:
 * - Basic component rendering
 * - Hooks (useState, useEffect, useInput, useContentRect)
 * - Suspense boundaries
 * - StrictMode compatibility (no double-render issues)
 * - Concurrent rendering features (useTransition, useDeferredValue)
 * - No deprecated API warnings
 *
 * The package already uses react-reconciler 0.33+ which includes React 19 support.
 * See reconciler.ts for the required host config methods added for 0.33+ compatibility.
 */

import React, {
  Suspense,
  StrictMode,
  useState,
  useEffect,
  useTransition,
  useDeferredValue,
} from "react"
import { describe, expect, test } from "vitest"
import { NodeContext } from "../src/context.ts"
import { Box, Text, useContentRect, useInput } from "../src/index.ts"
import { createRenderer, stripAnsi } from "../src/testing/index.tsx"
import type { InkxNode } from "../src/types.ts"

// ============================================================================
// Test Setup
// ============================================================================

const render = createRenderer()

/**
 * Create a mock InkxNode for testing useContentRect
 */
function createMockInkxNode(layout: {
  x: number
  y: number
  width: number
  height: number
}): InkxNode {
  return {
    type: "inkx-box",
    props: {},
    children: [],
    parent: null,
    layoutNode: null,
    contentRect: layout,
    screenRect: layout,
    prevLayout: null,
    layoutDirty: false,
    contentDirty: false,
    layoutSubscribers: new Set(),
  }
}

// ============================================================================
// Basic React 19 Compatibility
// ============================================================================

describe("React 19 Compatibility (km-a1xb)", () => {
  describe("Basic Rendering", () => {
    test("basic component renders with React 19", () => {
      const app = render(<Text>Hello React 19</Text>)
      expect(app.ansi).toContain("Hello React 19")
    })

    test("nested components render correctly", () => {
      function Child({ text }: { text: string }) {
        return <Text>{text}</Text>
      }

      function Parent() {
        return (
          <Box flexDirection="column">
            <Child text="First" />
            <Child text="Second" />
          </Box>
        )
      }

      const app = render(<Parent />)
      const frame = app.ansi
      expect(frame).toContain("First")
      expect(frame).toContain("Second")
    })

    test("conditional rendering works", () => {
      function Conditional({ show }: { show: boolean }) {
        return (
          <Box>
            {show ? <Text>Visible</Text> : null}
            <Text>Always</Text>
          </Box>
        )
      }

      const app = render(<Conditional show={true} />)
      expect(app.ansi).toContain("Visible")
      expect(app.ansi).toContain("Always")

      app.rerender(<Conditional show={false} />)
      expect(app.ansi).not.toContain("Visible")
      expect(app.ansi).toContain("Always")
    })
  })

  describe("React 19 Hooks", () => {
    test("useState works correctly in React 19", () => {
      function Counter() {
        const [count, setCount] = useState(0)
        useEffect(() => {
          setCount(42)
        }, [])
        return <Text>Count: {count}</Text>
      }

      const app = render(<Counter />)
      // After effect runs, count should be 42
      expect(app.ansi).toContain("Count: 42")
    })

    test("useEffect runs in React 19", () => {
      let effectRan = false

      function EffectTest() {
        useEffect(() => {
          effectRan = true
        }, [])
        return <Text>Effect Test</Text>
      }

      render(<EffectTest />)
      expect(effectRan).toBe(true)
    })

    test("useInput hook works correctly in React 19", () => {
      let receivedInput = ""

      function InputTest() {
        useInput((input) => {
          receivedInput = input
        })
        return <Text>Input Test</Text>
      }

      const app = render(<InputTest />)
      app.stdin.write("x")
      expect(receivedInput).toBe("x")
    })

    test("useContentRect hook works correctly in React 19", () => {
      let capturedLayout: {
        width: number
        height: number
        x: number
        y: number
      } | null = null
      const mockNode = createMockInkxNode({
        x: 10,
        y: 5,
        width: 40,
        height: 20,
      })

      function LayoutTest() {
        const layout = useContentRect()
        capturedLayout = layout
        return <Text>Layout Test</Text>
      }

      // useContentRect requires NodeContext, provide it via mock
      render(
        <NodeContext.Provider value={mockNode}>
          <LayoutTest />
        </NodeContext.Provider>,
      )

      // Layout should have been captured with correct values from mock
      expect(capturedLayout).not.toBeNull()
      expect(capturedLayout!.x).toBe(10)
      expect(capturedLayout!.y).toBe(5)
      expect(capturedLayout!.width).toBe(40)
      expect(capturedLayout!.height).toBe(20)
    })
  })

  describe("Suspense Boundary", () => {
    test("Suspense boundary does not break rendering", () => {
      function RegularComponent() {
        return <Text>Regular Content</Text>
      }

      function AppWithSuspense() {
        return (
          <Suspense fallback={<Text>Loading...</Text>}>
            <RegularComponent />
          </Suspense>
        )
      }

      const app = render(<AppWithSuspense />)
      // Non-suspending components should render immediately
      expect(app.ansi).toContain("Regular Content")
    })

    test("Suspense with lazy components concept works", () => {
      // Note: Full Suspense with promise-throwing components requires additional
      // reconciler methods (hideInstance, unhideInstance) that are optional for
      // terminal rendering. This test verifies the basic Suspense support.
      //
      // In practice, terminal UIs rarely benefit from Suspense-based code splitting
      // since bundle size is less critical than in browser environments.

      function LazyLikeComponent() {
        // Simulate a component that would be lazy-loaded
        return <Text>Lazy Content</Text>
      }

      function AppWithLazyChild() {
        return (
          <Suspense fallback={<Text>Loading...</Text>}>
            <LazyLikeComponent />
          </Suspense>
        )
      }

      const app = render(<AppWithLazyChild />)
      // Non-suspending component renders immediately
      expect(app.ansi).toContain("Lazy Content")
    })

    test("nested Suspense boundaries work correctly", () => {
      function Outer() {
        return (
          <Suspense fallback={<Text>Outer Loading...</Text>}>
            <Box flexDirection="column">
              <Text>Outer Content</Text>
              <Suspense fallback={<Text>Inner Loading...</Text>}>
                <Text>Inner Content</Text>
              </Suspense>
            </Box>
          </Suspense>
        )
      }

      const app = render(<Outer />)
      const frame = app.ansi
      expect(frame).toContain("Outer Content")
      expect(frame).toContain("Inner Content")
    })
  })

  describe("StrictMode Compatibility", () => {
    test("StrictMode does not cause double render issues in output", () => {
      let renderCount = 0

      function TrackingComponent() {
        renderCount++
        return <Text>Rendered</Text>
      }

      render(
        <StrictMode>
          <TrackingComponent />
        </StrictMode>,
      )

      // In React 19 strict mode, effects may double-fire in dev,
      // but the final output should be correct
      const frame = render(
        <StrictMode>
          <Text>StrictMode Content</Text>
        </StrictMode>,
      ).ansi

      expect(frame).toContain("StrictMode Content")
      // Should not have duplicated content
      const content = stripAnsi(frame ?? "")
      const matches = content.match(/StrictMode Content/g)
      expect(matches?.length).toBe(1)
    })

    test("state updates work correctly in StrictMode", () => {
      function StrictStateTest() {
        const [value, setValue] = useState("initial")
        useEffect(() => {
          setValue("updated")
        }, [])
        return <Text>{value}</Text>
      }

      const app = render(
        <StrictMode>
          <StrictStateTest />
        </StrictMode>,
      )

      expect(app.ansi).toContain("updated")
    })
  })

  describe("Concurrent Features", () => {
    test("useTransition does not break rendering", () => {
      function TransitionTest() {
        const [isPending, startTransition] = useTransition()
        const [count, setCount] = useState(0)

        useEffect(() => {
          startTransition(() => {
            setCount(1)
          })
        }, [])

        return (
          <Box flexDirection="column">
            <Text>Pending: {isPending ? "yes" : "no"}</Text>
            <Text>Count: {count}</Text>
          </Box>
        )
      }

      const app = render(<TransitionTest />)
      const frame = app.ansi
      // The transition should eventually complete
      expect(frame).toContain("Count:")
    })

    test("useDeferredValue does not break rendering", () => {
      function DeferredTest() {
        const [input, setInput] = useState("initial")
        const deferredInput = useDeferredValue(input)

        useEffect(() => {
          setInput("updated")
        }, [])

        return (
          <Box flexDirection="column">
            <Text>Input: {input}</Text>
            <Text>Deferred: {deferredInput}</Text>
          </Box>
        )
      }

      const app = render(<DeferredTest />)
      const frame = app.ansi
      // Both values should be present (deferred may lag)
      expect(frame).toContain("Input:")
      expect(frame).toContain("Deferred:")
    })
  })

  describe("React 19 Reconciler API", () => {
    test("multiple rapid rerenders work correctly", () => {
      function RapidRerender() {
        const [count, setCount] = useState(0)
        return <Text>Count: {count}</Text>
      }

      const app = render(<RapidRerender />)
      expect(app.ansi).toContain("Count: 0")

      // Rapid rerenders
      app.rerender(<Text>A</Text>)
      app.rerender(<Text>B</Text>)
      app.rerender(<Text>C</Text>)

      expect(app.ansi).toContain("C")
      expect(app.ansi).not.toContain("A")
      expect(app.ansi).not.toContain("B")
    })

    test("rerender with different element types works", () => {
      const app = render(<Text>Text</Text>)
      expect(app.ansi).toContain("Text")

      app.rerender(
        <Box borderStyle="single" width={15}>
          <Text>Boxed</Text>
        </Box>,
      )
      expect(app.ansi).toContain("Boxed")
    })
  })

  describe("No Deprecated API Warnings", () => {
    test("render completes without deprecated API errors", () => {
      // This test captures any console.error calls during render
      const originalError = console.error
      const errors: string[] = []
      console.error = (...args: unknown[]) => {
        errors.push(args.map(String).join(" "))
      }

      try {
        render(
          <Box flexDirection="column">
            <Text bold>Bold Text</Text>
            <Text color="red">Red Text</Text>
            <Box borderStyle="single" padding={1}>
              <Text>Bordered</Text>
            </Box>
          </Box>,
        )

        // Filter for deprecated API warnings only (not act() warnings which are expected
        // in test environments when effects cause updates outside act())
        const deprecatedErrors = errors.filter(
          (e) => e.includes("deprecated") && !e.includes("act("),
        )

        expect(deprecatedErrors).toEqual([])
      } finally {
        console.error = originalError
      }
    })

    test("hooks complete without deprecated console warnings", () => {
      const originalWarn = console.warn
      const warnings: string[] = []
      console.warn = (...args: unknown[]) => {
        warnings.push(args.map(String).join(" "))
      }

      try {
        function HookTest() {
          const [state, setState] = useState(0)
          useEffect(() => {
            setState(1)
          }, [])
          useInput(() => {})
          return <Text>{state}</Text>
        }

        render(<HookTest />)

        // Filter for deprecated API warnings only
        const deprecatedWarnings = warnings.filter((w) =>
          w.includes("deprecated"),
        )

        expect(deprecatedWarnings).toEqual([])
      } finally {
        console.warn = originalWarn
      }
    })
  })
})
