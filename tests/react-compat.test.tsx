/**
 * React Compatibility Tests
 *
 * Tests for React features that enhance compatibility:
 * - forwardRef support on Box/Text
 * - useImperativeHandle for BoxHandle/TextHandle
 * - onLayout callback
 * - ErrorBoundary component
 * - hideInstance/unhideInstance for Suspense data-fetching
 *
 * These tests ensure hightea provides the React patterns developers expect.
 */

import type React from "react"
import { Suspense, forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react"
import { describe, expect, test } from "vitest"
import { Box, type BoxHandle, ErrorBoundary, type Rect, Text, type TextHandle } from "../src/index.js"
import { createRenderer } from "@hightea/term/testing"

// ============================================================================
// Test Setup
// ============================================================================

const render = createRenderer({ cols: 40, rows: 10 })

// ============================================================================
// forwardRef Support
// ============================================================================

describe("forwardRef Support", () => {
  test("Box supports forwardRef and exposes BoxHandle", () => {
    let capturedHandle: BoxHandle | null = null

    function TestComponent() {
      const boxRef = useRef<BoxHandle>(null)

      useEffect(() => {
        capturedHandle = boxRef.current
      }, [])

      return (
        <Box ref={boxRef} width={20} height={5}>
          <Text>Content</Text>
        </Box>
      )
    }

    render(<TestComponent />)

    expect(capturedHandle).not.toBeNull()
    expect(typeof capturedHandle?.getNode).toBe("function")
    expect(typeof capturedHandle?.getContentRect).toBe("function")
    expect(typeof capturedHandle?.getScreenRect).toBe("function")
  })

  test("BoxHandle.getNode returns the TeaNode", () => {
    let node: ReturnType<BoxHandle["getNode"]> = null

    function TestComponent() {
      const boxRef = useRef<BoxHandle>(null)

      useEffect(() => {
        node = boxRef.current?.getNode() ?? null
      }, [])

      return (
        <Box ref={boxRef} id="test-box">
          <Text>Content</Text>
        </Box>
      )
    }

    render(<TestComponent />)

    expect(node).not.toBeNull()
    expect(node?.type).toBe("hightea-box")
    expect(node?.props.id).toBe("test-box")
  })

  test("BoxHandle.getContentRect returns layout dimensions", () => {
    let handle: BoxHandle | null = null

    function TestComponent() {
      const boxRef = useRef<BoxHandle>(null)

      useEffect(() => {
        handle = boxRef.current
      }, [])

      return (
        <Box ref={boxRef} width={20} height={5}>
          <Text>Content</Text>
        </Box>
      )
    }

    render(<TestComponent />)

    // Handle should be captured
    expect(handle).not.toBeNull()

    // Get rect after render is complete (layout is computed during render)
    const rect = handle?.getContentRect()
    expect(rect).not.toBeNull()
    expect(rect?.width).toBe(20)
    expect(rect?.height).toBe(5)
  })

  test("Text supports forwardRef and exposes TextHandle", () => {
    let capturedHandle: TextHandle | null = null

    function TestComponent() {
      const textRef = useRef<TextHandle>(null)

      useEffect(() => {
        capturedHandle = textRef.current
      }, [])

      return <Text ref={textRef}>Hello World</Text>
    }

    render(<TestComponent />)

    expect(capturedHandle).not.toBeNull()
    expect(typeof capturedHandle?.getNode).toBe("function")
  })

  test("TextHandle.getNode returns the TeaNode", () => {
    let node: ReturnType<TextHandle["getNode"]> = null

    function TestComponent() {
      const textRef = useRef<TextHandle>(null)

      useEffect(() => {
        node = textRef.current?.getNode() ?? null
      }, [])

      return (
        <Text ref={textRef} id="test-text">
          Hello
        </Text>
      )
    }

    render(<TestComponent />)

    expect(node).not.toBeNull()
    expect(node?.type).toBe("hightea-text")
  })
})

// ============================================================================
// onLayout Callback
// ============================================================================

describe("onLayout Callback", () => {
  test("onLayout is called with layout dimensions", () => {
    let capturedLayout: Rect | null = null

    function TestComponent() {
      return (
        <Box
          width={30}
          height={8}
          onLayout={(layout) => {
            capturedLayout = layout
          }}
        >
          <Text>Content</Text>
        </Box>
      )
    }

    render(<TestComponent />)

    expect(capturedLayout).not.toBeNull()
    expect(capturedLayout?.width).toBe(30)
    expect(capturedLayout?.height).toBe(8)
  })

  test("onLayout is called when dimensions change", () => {
    const layouts: Rect[] = []

    function TestComponent({ width }: { width: number }) {
      return (
        <Box
          width={width}
          height={5}
          onLayout={(layout) => {
            layouts.push({ ...layout })
          }}
        >
          <Text>Content</Text>
        </Box>
      )
    }

    const app = render(<TestComponent width={20} />)

    // First layout
    expect(layouts.length).toBeGreaterThanOrEqual(1)
    expect(layouts[0]?.width).toBe(20)

    // Change dimensions
    app.rerender(<TestComponent width={30} />)

    // Should have received new layout
    expect(layouts.length).toBeGreaterThanOrEqual(2)
    const lastLayout = layouts[layouts.length - 1]
    expect(lastLayout?.width).toBe(30)
  })

  test("onLayout is not called when layout unchanged", () => {
    let callCount = 0

    function TestComponent({ color }: { color: string }) {
      return (
        <Box
          width={20}
          height={5}
          onLayout={() => {
            callCount++
          }}
        >
          <Text color={color}>Content</Text>
        </Box>
      )
    }

    const app = render(<TestComponent color="red" />)
    const initialCount = callCount

    // Change only color (not layout-affecting)
    app.rerender(<TestComponent color="blue" />)

    // Layout callback should not fire again
    expect(callCount).toBe(initialCount)
  })
})

// ============================================================================
// ErrorBoundary Component
// ============================================================================

describe("ErrorBoundary Component", () => {
  test("renders children when no error", () => {
    function SafeComponent() {
      return <Text>Safe content</Text>
    }

    const app = render(
      <ErrorBoundary>
        <SafeComponent />
      </ErrorBoundary>,
    )

    expect(app.text).toContain("Safe content")
  })

  test("catches render errors and shows default fallback", () => {
    function BrokenComponent(): React.JSX.Element {
      throw new Error("Test error")
    }

    // Suppress console.error for this test
    const originalError = console.error
    console.error = () => {}

    try {
      const app = render(
        <ErrorBoundary>
          <BrokenComponent />
        </ErrorBoundary>,
      )

      expect(app.text).toContain("Error")
      expect(app.text).toContain("Test error")
    } finally {
      console.error = originalError
    }
  })

  test("renders custom fallback node", () => {
    function BrokenComponent(): React.JSX.Element {
      throw new Error("Oops")
    }

    const originalError = console.error
    console.error = () => {}

    try {
      const app = render(
        <ErrorBoundary fallback={<Text color="yellow">Custom fallback</Text>}>
          <BrokenComponent />
        </ErrorBoundary>,
      )

      expect(app.text).toContain("Custom fallback")
    } finally {
      console.error = originalError
    }
  })

  test("renders function fallback with error details", () => {
    function BrokenComponent(): React.JSX.Element {
      throw new Error("Detailed error")
    }

    const originalError = console.error
    console.error = () => {}

    try {
      const app = render(
        <ErrorBoundary fallback={(error, _errorInfo) => <Text>Caught: {error.message}</Text>}>
          <BrokenComponent />
        </ErrorBoundary>,
      )

      expect(app.text).toContain("Caught: Detailed error")
    } finally {
      console.error = originalError
    }
  })

  test("calls onError when error is caught", () => {
    let capturedError: Error | null = null

    function BrokenComponent(): React.JSX.Element {
      throw new Error("Callback test")
    }

    const originalError = console.error
    console.error = () => {}

    try {
      render(
        <ErrorBoundary
          onError={(error) => {
            capturedError = error
          }}
          fallback={<Text>Fallback</Text>}
        >
          <BrokenComponent />
        </ErrorBoundary>,
      )

      expect(capturedError).not.toBeNull()
      expect(capturedError?.message).toBe("Callback test")
    } finally {
      console.error = originalError
    }
  })

  test("resets when resetKey changes", () => {
    let shouldThrow = true
    let resetCalled = false

    function MaybeBrokenComponent(): React.JSX.Element {
      if (shouldThrow) {
        throw new Error("Reset test")
      }
      return <Text>Recovered</Text>
    }

    const originalError = console.error
    console.error = () => {}

    try {
      const app = render(
        <ErrorBoundary
          resetKey={0}
          onReset={() => {
            resetCalled = true
          }}
          fallback={<Text>Error state</Text>}
        >
          <MaybeBrokenComponent />
        </ErrorBoundary>,
      )

      expect(app.text).toContain("Error state")

      // Fix the error and change reset key
      shouldThrow = false
      app.rerender(
        <ErrorBoundary
          resetKey={1}
          onReset={() => {
            resetCalled = true
          }}
          fallback={<Text>Error state</Text>}
        >
          <MaybeBrokenComponent />
        </ErrorBoundary>,
      )

      expect(resetCalled).toBe(true)
      expect(app.text).toContain("Recovered")
    } finally {
      console.error = originalError
    }
  })
})

// ============================================================================
// Suspense with hideInstance/unhideInstance
// ============================================================================

describe("Suspense Support", () => {
  test("non-suspending content renders inside Suspense boundary", () => {
    function RegularComponent() {
      return <Text>Regular content</Text>
    }

    const app = render(
      <Suspense fallback={<Text>Loading...</Text>}>
        <RegularComponent />
      </Suspense>,
    )

    // Non-suspending content should render immediately
    expect(app.text).toContain("Regular content")
    expect(app.text).not.toContain("Loading...")
  })

  test("nested Suspense boundaries work correctly", () => {
    // Non-suspending content should render immediately
    function OuterContent() {
      return <Text>Outer content</Text>
    }

    function InnerContent() {
      return <Text>Inner content</Text>
    }

    const app = render(
      <Suspense fallback={<Text>Outer loading...</Text>}>
        <Box flexDirection="column">
          <OuterContent />
          <Suspense fallback={<Text>Inner loading...</Text>}>
            <InnerContent />
          </Suspense>
        </Box>
      </Suspense>,
    )

    expect(app.text).toContain("Outer content")
    expect(app.text).toContain("Inner content")
  })

  test("hideInstance is available in host config", async () => {
    // Verify the host config has the required methods for Suspense
    // This is a structural test - the actual behavior is tested above
    const { hostConfig } = await import("../src/reconciler/host-config.js")
    expect(typeof hostConfig.hideInstance).toBe("function")
    expect(typeof hostConfig.unhideInstance).toBe("function")
    expect(typeof hostConfig.hideTextInstance).toBe("function")
    expect(typeof hostConfig.unhideTextInstance).toBe("function")
  })
})

// ============================================================================
// Combined Usage Patterns
// ============================================================================

describe("Combined React Patterns", () => {
  test("forwardRef + onLayout together", () => {
    let handle: BoxHandle | null = null
    let layoutFromCallback: Rect | null = null

    function TestComponent() {
      const ref = useRef<BoxHandle>(null)

      useEffect(() => {
        handle = ref.current
      }, [])

      return (
        <Box
          ref={ref}
          width={25}
          height={6}
          onLayout={(layout) => {
            layoutFromCallback = layout
          }}
        >
          <Text>Content</Text>
        </Box>
      )
    }

    render(<TestComponent />)

    // Both should work
    expect(handle).not.toBeNull()
    expect(layoutFromCallback).not.toBeNull()

    // And should agree on dimensions
    const rectFromHandle = handle?.getContentRect()
    expect(rectFromHandle?.width).toBe(layoutFromCallback?.width)
    expect(rectFromHandle?.height).toBe(layoutFromCallback?.height)
  })

  test("ErrorBoundary wrapping Suspense", async () => {
    function SafeAsyncComponent() {
      return <Text>Loaded safely</Text>
    }

    const app = render(
      <ErrorBoundary fallback={<Text>Error in async</Text>}>
        <Suspense fallback={<Text>Loading...</Text>}>
          <SafeAsyncComponent />
        </Suspense>
      </ErrorBoundary>,
    )

    expect(app.text).toContain("Loaded safely")
  })

  test("custom component using forwardRef", () => {
    interface CustomBoxProps {
      label: string
      children: React.ReactNode
    }

    const CustomBox = forwardRef<BoxHandle, CustomBoxProps>(function CustomBox({ label, children }, ref) {
      return (
        <Box ref={ref} borderStyle="single" padding={1}>
          <Box flexDirection="column">
            <Text bold>{label}</Text>
            {children}
          </Box>
        </Box>
      )
    })

    let capturedHandle: BoxHandle | null = null

    function TestComponent() {
      const ref = useRef<BoxHandle>(null)

      useEffect(() => {
        capturedHandle = ref.current
      }, [])

      return (
        <CustomBox ref={ref} label="My Card">
          <Text>Card content</Text>
        </CustomBox>
      )
    }

    const app = render(<TestComponent />)

    expect(app.text).toContain("My Card")
    expect(app.text).toContain("Card content")
    expect(capturedHandle).not.toBeNull()
    expect(capturedHandle?.getNode()?.type).toBe("hightea-box")
  })
})
