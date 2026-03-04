/**
 * Tests for the ErrorBoundary component.
 *
 * Verifies error catching, fallback rendering (node, function, default),
 * onError callback, resetKey, and resetKeys behavior.
 */

import React, { useState } from "react"
import { describe, expect, test, vi } from "vitest"
import { Box, Text, useInput } from "../src/index.js"
import { ErrorBoundary } from "../src/components/ErrorBoundary.js"
import { createRenderer } from "inkx/testing"

// =============================================================================
// Test Helpers
// =============================================================================

/** Component that throws on render. */
function ThrowingComponent({ message = "boom" }: { message?: string }) {
  throw new Error(message)
  return null // unreachable, but satisfies TS
}

/** Component that conditionally throws. */
function ConditionalThrow({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) throw new Error("conditional error")
  return <Text>OK</Text>
}

// =============================================================================
// Basic Error Catching
// =============================================================================

describe("ErrorBoundary", () => {
  const render = createRenderer({ cols: 60, rows: 10 })

  test("renders children when no error", () => {
    const app = render(
      <ErrorBoundary>
        <Text>Hello World</Text>
      </ErrorBoundary>,
    )
    expect(app.text).toContain("Hello World")
  })

  test("catches error and renders default fallback", () => {
    const app = render(
      <ErrorBoundary>
        <ThrowingComponent />
      </ErrorBoundary>,
    )
    expect(app.text).toContain("Error")
    expect(app.text).toContain("boom")
  })

  test("renders custom fallback ReactNode on error", () => {
    const app = render(
      <ErrorBoundary fallback={<Text>Something went wrong</Text>}>
        <ThrowingComponent />
      </ErrorBoundary>,
    )
    expect(app.text).toContain("Something went wrong")
    expect(app.text).not.toContain("boom")
  })

  test("renders function fallback with error details", () => {
    const app = render(
      <ErrorBoundary fallback={(error, _errorInfo) => <Text>Caught: {error.message}</Text>}>
        <ThrowingComponent message="test error" />
      </ErrorBoundary>,
    )
    expect(app.text).toContain("Caught: test error")
  })

  // ── onError callback ──

  test("calls onError when error is caught", () => {
    const onError = vi.fn()
    render(
      <ErrorBoundary onError={onError}>
        <ThrowingComponent message="callback test" />
      </ErrorBoundary>,
    )
    expect(onError).toHaveBeenCalledOnce()
    expect(onError.mock.calls[0]![0]).toBeInstanceOf(Error)
    expect(onError.mock.calls[0]![0].message).toBe("callback test")
  })

  // ── resetKey ──

  test("resets error state when resetKey changes", () => {
    function Wrapper() {
      const [key, setKey] = useState(0)
      const [shouldThrow, setShouldThrow] = useState(true)

      useInput((input) => {
        if (input === "r") {
          setShouldThrow(false)
          setKey((k) => k + 1)
        }
      })

      return (
        <ErrorBoundary resetKey={key} fallback={<Text>Error state</Text>}>
          <ConditionalThrow shouldThrow={shouldThrow} />
        </ErrorBoundary>
      )
    }

    const app = render(<Wrapper />)
    expect(app.text).toContain("Error state")

    // Reset by pressing 'r' -- disables throwing and bumps resetKey
    app.press("r")
    expect(app.text).toContain("OK")
  })

  test("calls onReset when resetKey triggers a reset", () => {
    const onReset = vi.fn()

    function Wrapper() {
      const [key, setKey] = useState(0)
      const [shouldThrow, setShouldThrow] = useState(true)

      useInput((input) => {
        if (input === "r") {
          setShouldThrow(false)
          setKey((k) => k + 1)
        }
      })

      return (
        <ErrorBoundary resetKey={key} onReset={onReset} fallback={<Text>Error state</Text>}>
          <ConditionalThrow shouldThrow={shouldThrow} />
        </ErrorBoundary>
      )
    }

    const app = render(<Wrapper />)
    expect(onReset).not.toHaveBeenCalled()

    app.press("r")
    expect(onReset).toHaveBeenCalledOnce()
  })

  // ── resetKeys (array) ──

  test("resets error state when resetKeys array changes", () => {
    function Wrapper() {
      const [version, setVersion] = useState(0)
      const [shouldThrow, setShouldThrow] = useState(true)

      useInput((input) => {
        if (input === "r") {
          setShouldThrow(false)
          setVersion((v) => v + 1)
        }
      })

      return (
        <ErrorBoundary resetKeys={[version]} fallback={<Text>Error state</Text>}>
          <ConditionalThrow shouldThrow={shouldThrow} />
        </ErrorBoundary>
      )
    }

    const app = render(<Wrapper />)
    expect(app.text).toContain("Error state")

    app.press("r")
    expect(app.text).toContain("OK")
  })

  test("resets when any element in resetKeys changes", () => {
    function Wrapper() {
      const [a, setA] = useState("x")
      const [b] = useState(42)
      const [shouldThrow, setShouldThrow] = useState(true)

      useInput((input) => {
        if (input === "r") {
          setShouldThrow(false)
          setA("y")
        }
      })

      return (
        <ErrorBoundary resetKeys={[a, b]} fallback={<Text>Error state</Text>}>
          <ConditionalThrow shouldThrow={shouldThrow} />
        </ErrorBoundary>
      )
    }

    const app = render(<Wrapper />)
    expect(app.text).toContain("Error state")

    app.press("r")
    expect(app.text).toContain("OK")
  })

  test("calls onReset when resetKeys triggers a reset", () => {
    const onReset = vi.fn()

    function Wrapper() {
      const [keys, setKeys] = useState([1, 2])
      const [shouldThrow, setShouldThrow] = useState(true)

      useInput((input) => {
        if (input === "r") {
          setShouldThrow(false)
          setKeys([1, 3])
        }
      })

      return (
        <ErrorBoundary resetKeys={keys} onReset={onReset} fallback={<Text>Error state</Text>}>
          <ConditionalThrow shouldThrow={shouldThrow} />
        </ErrorBoundary>
      )
    }

    const app = render(<Wrapper />)
    expect(onReset).not.toHaveBeenCalled()

    app.press("r")
    expect(onReset).toHaveBeenCalledOnce()
  })

  test("does not reset when resetKeys array is identical", () => {
    const onReset = vi.fn()
    let renderCount = 0

    function Child() {
      renderCount++
      return <Text>child rendered {renderCount}</Text>
    }

    function Wrapper() {
      const [, forceUpdate] = useState(0)

      useInput((input) => {
        if (input === "u") forceUpdate((c) => c + 1)
      })

      return (
        <ErrorBoundary resetKeys={["stable", 42]} onReset={onReset}>
          <Child />
        </ErrorBoundary>
      )
    }

    const app = render(<Wrapper />)
    expect(app.text).toContain("child rendered")
    expect(onReset).not.toHaveBeenCalled()

    // Force re-render without changing resetKeys
    app.press("u")
    expect(onReset).not.toHaveBeenCalled()
  })

  // ── resetKeys length change ──

  test("resets when resetKeys array length changes", () => {
    function Wrapper() {
      const [keys, setKeys] = useState<unknown[]>([1])
      const [shouldThrow, setShouldThrow] = useState(true)

      useInput((input) => {
        if (input === "r") {
          setShouldThrow(false)
          setKeys([1, 2]) // length changed
        }
      })

      return (
        <ErrorBoundary resetKeys={keys} fallback={<Text>Error state</Text>}>
          <ConditionalThrow shouldThrow={shouldThrow} />
        </ErrorBoundary>
      )
    }

    const app = render(<Wrapper />)
    expect(app.text).toContain("Error state")

    app.press("r")
    expect(app.text).toContain("OK")
  })
})
