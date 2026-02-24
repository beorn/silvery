/**
 * Tests for Input Layer Stack
 *
 * The input layer stack provides DOM-style event bubbling for keyboard input.
 * Layers register synchronously via useLayoutEffect and receive input in
 * child-first order (like DOM event bubbling from target to ancestors).
 * If a handler returns true, the event is consumed. If false, it bubbles to the next layer.
 *
 * Key ordering rules:
 * - Child components handle input before parent components
 * - Sibling components handle input in render order (first sibling first)
 * - Handlers return true to consume, false to bubble
 *
 * @see docs/future/inkx-command-api-research.md
 */
import React, { useState, useCallback } from "react"
import { describe, expect, test } from "vitest"
import { InputLayerProvider, useInputLayer, useInputLayerContext } from "../src/contexts/InputLayerContext.tsx"
import { Box, Text } from "../src/index.ts"
import { createRenderer } from "inkx/testing"

// ============================================================================
// Test Components
// ============================================================================

/**
 * Simple component that captures input via a layer
 */
function InputCapture({
  layerId,
  consume = false,
  onInput,
}: {
  layerId: string
  consume?: boolean
  onInput?: (input: string) => void
}) {
  const [captured, setCaptured] = useState<string[]>([])

  useInputLayer(
    layerId,
    useCallback(
      (input: string) => {
        setCaptured((prev) => [...prev, input])
        onInput?.(input)
        return consume
      },
      [consume, onInput],
    ),
  )

  return (
    <Text testID={`capture-${layerId}`}>
      {layerId}: [{captured.join(", ")}]
    </Text>
  )
}

/**
 * Component that conditionally consumes based on key
 */
function ConditionalConsumer({ layerId, consumeKeys }: { layerId: string; consumeKeys: string[] }) {
  const [captured, setCaptured] = useState<string[]>([])

  useInputLayer(
    layerId,
    useCallback(
      (input: string) => {
        if (consumeKeys.includes(input)) {
          setCaptured((prev) => [...prev, input])
          return true
        }
        return false
      },
      [consumeKeys],
    ),
  )

  return (
    <Text testID={`capture-${layerId}`}>
      {layerId}: [{captured.join(", ")}]
    </Text>
  )
}

/**
 * Wrapper that provides InputLayerProvider
 */
function TestApp({ children }: { children: React.ReactNode }) {
  return <InputLayerProvider>{children}</InputLayerProvider>
}

// ============================================================================
// Tests: Basic Layer Registration
// ============================================================================

describe("InputLayerContext", () => {
  const render = createRenderer({ cols: 80, rows: 24 })

  describe("basic registration", () => {
    test("registers a single layer", () => {
      const app = render(
        <TestApp>
          <InputCapture layerId="layer1" />
        </TestApp>,
      )

      expect(app.text).toContain("layer1: []")
    })

    test("single layer receives input", () => {
      const app = render(
        <TestApp>
          <InputCapture layerId="layer1" consume />
        </TestApp>,
      )

      app.stdin.write("a")
      app.stdin.write("b")
      app.stdin.write("c")

      expect(app.text).toContain("layer1: [a, b, c]")
    })
  })

  // ==========================================================================
  // Tests: Layer Ordering
  // ==========================================================================

  describe("layer ordering", () => {
    test("sibling layers receive input in render order (first sibling first)", () => {
      const received: string[] = []

      function App() {
        return (
          <TestApp>
            <InputCapture layerId="first" consume onInput={(i) => received.push(`first:${i}`)} />
            <InputCapture layerId="second" consume onInput={(i) => received.push(`second:${i}`)} />
          </TestApp>
        )
      }

      const app = render(<App />)
      app.stdin.write("x")

      // First rendered layer receives first (useLayoutEffect order)
      expect(received[0]).toBe("first:x")
    })

    test("child layers receive input before parent layers", () => {
      const received: string[] = []

      function Parent({ children }: { children: React.ReactNode }) {
        useInputLayer(
          "parent",
          useCallback((input) => {
            received.push(`parent:${input}`)
            return true
          }, []),
        )
        return <Box>{children}</Box>
      }

      function Child() {
        useInputLayer(
          "child",
          useCallback((input) => {
            received.push(`child:${input}`)
            return true
          }, []),
        )
        return <Text>Child</Text>
      }

      const app = render(
        <TestApp>
          <Parent>
            <Child />
          </Parent>
        </TestApp>,
      )

      app.stdin.write("y")

      // Child's useLayoutEffect runs before parent's,
      // so child is registered first and handles first
      expect(received[0]).toBe("child:y")
      // Parent doesn't receive because child consumed
      expect(received).toEqual(["child:y"])
    })

    test("deeply nested child handles before all ancestors", () => {
      const received: string[] = []

      function Level({ name, children }: { name: string; children?: React.ReactNode }) {
        useInputLayer(
          name,
          useCallback(
            (input) => {
              received.push(`${name}:${input}`)
              return false // Don't consume, let it bubble
            },
            [name],
          ),
        )
        return <Box>{children}</Box>
      }

      const app = render(
        <TestApp>
          <Level name="grandparent">
            <Level name="parent">
              <Level name="child" />
            </Level>
          </Level>
        </TestApp>,
      )

      app.stdin.write("z")

      // Order should be: deepest first, then up to root
      expect(received).toEqual(["child:z", "parent:z", "grandparent:z"])
    })
  })

  // ==========================================================================
  // Tests: Event Bubbling
  // ==========================================================================

  describe("event bubbling", () => {
    test("event bubbles when handler returns false", () => {
      const app = render(
        <TestApp>
          <InputCapture layerId="first" consume={false} />
          <InputCapture layerId="second" consume />
        </TestApp>,
      )

      app.stdin.write("a")

      // First doesn't consume, so second also receives
      expect(app.text).toContain("first: [a]")
      expect(app.text).toContain("second: [a]")
    })

    test("event stops bubbling when handler returns true", () => {
      const app = render(
        <TestApp>
          <InputCapture layerId="first" consume />
          <InputCapture layerId="second" consume />
        </TestApp>,
      )

      app.stdin.write("a")

      // First consumes, so second doesn't receive
      expect(app.text).toContain("first: [a]")
      expect(app.text).toContain("second: []")
    })

    test("conditional consumption allows selective bubbling", () => {
      const app = render(
        <TestApp>
          <ConditionalConsumer layerId="first" consumeKeys={["a"]} />
          <ConditionalConsumer layerId="second" consumeKeys={["b"]} />
        </TestApp>,
      )

      // 'a' consumed by first
      app.stdin.write("a")
      expect(app.text).toContain("first: [a]")
      expect(app.text).toContain("second: []")

      // 'b' passes through first, consumed by second
      app.stdin.write("b")
      expect(app.text).toContain("second: [b]")
    })
  })

  // ==========================================================================
  // Tests: Dynamic Layer Addition/Removal
  // ==========================================================================

  describe("dynamic layer management", () => {
    test("layer removal updates stack", () => {
      // Test that when a layer is unmounted, it's properly removed from the stack
      // and input flows to the next available layer.
      function App() {
        const [showDialog, setShowDialog] = useState(true)
        const [appReceived, setAppReceived] = useState<string[]>([])
        const [dialogReceived, setDialogReceived] = useState<string[]>([])

        // App layer - handles 't' to toggle dialog
        useInputLayer(
          "app",
          useCallback((input: string) => {
            if (input === "t") {
              setShowDialog((v) => !v)
              return true
            }
            setAppReceived((r) => [...r, input])
            return true
          }, []),
        )

        // Dialog as a child component
        const Dialog = () => {
          useInputLayer(
            "dialog",
            useCallback((input: string) => {
              // Let 't' bubble up to toggle handler
              if (input === "t") return false
              setDialogReceived((r) => [...r, input])
              return true
            }, []),
          )
          return <Text>Dialog visible</Text>
        }

        return (
          <Box flexDirection="column">
            {showDialog && <Dialog />}
            <Text>App: [{appReceived.join(", ")}]</Text>
            <Text>Dialog: [{dialogReceived.join(", ")}]</Text>
            <Text>showDialog: {showDialog ? "yes" : "no"}</Text>
          </Box>
        )
      }

      const app = render(
        <TestApp>
          <App />
        </TestApp>,
      )

      // Initially dialog is shown
      expect(app.text).toContain("showDialog: yes")

      // Press 'a' - dialog receives (it's a child, so registered first)
      app.stdin.write("a")
      expect(app.text).toContain("Dialog: [a]")
      expect(app.text).toContain("App: []")

      // Press 't' to toggle - dialog layer bubbles 't' to app which toggles
      app.stdin.write("t")
      expect(app.text).toContain("showDialog: no")

      // Press 'b' - dialog is gone, app now receives directly
      app.stdin.write("b")
      expect(app.text).toContain("App: [b]")
    })

    test("conditionally rendered layer intercepts input when present", () => {
      function App() {
        const [dialogOpen, setDialogOpen] = useState(false)
        const [received, setReceived] = useState<string[]>([])

        // App layer - handles 'd' to toggle dialog, captures other input
        useInputLayer(
          "app",
          useCallback(
            (input: string) => {
              if (input === "d") {
                setDialogOpen((v) => !v)
                return true
              }
              if (!dialogOpen) {
                setReceived((r) => [...r, `app:${input}`])
                return true
              }
              return false
            },
            [dialogOpen],
          ),
        )

        // Dialog layer - when present, captures input
        const DialogLayer = () => {
          useInputLayer(
            "dialog",
            useCallback((input: string) => {
              setReceived((r) => [...r, `dialog:${input}`])
              return true
            }, []),
          )
          return <Text>Dialog open</Text>
        }

        return (
          <Box flexDirection="column">
            {dialogOpen && <DialogLayer />}
            <Text>Received: {received.join(", ")}</Text>
          </Box>
        )
      }

      const app = render(
        <TestApp>
          <App />
        </TestApp>,
      )

      // Initially dialog is closed - app receives input
      app.stdin.write("a")
      expect(app.text).toContain("Received: app:a")

      // Open dialog
      app.stdin.write("d")

      // Now dialog should receive input (it's a child, so registered first)
      app.stdin.write("b")
      expect(app.text).toContain("dialog:b")

      // Close dialog
      app.stdin.write("d")

      // App should receive again
      app.stdin.write("c")
      expect(app.text).toContain("app:c")
    })
  })

  // ==========================================================================
  // Tests: Context Access
  // ==========================================================================

  describe("context access", () => {
    test("useInputLayerContext provides dispatch function", () => {
      // Test that the context provides a working dispatch function
      // by using stdin.write which internally dispatches to the layer stack
      const app = render(
        <TestApp>
          <InputCapture layerId="layer1" consume />
        </TestApp>,
      )

      // stdin.write triggers dispatch through the InputLayerProvider's useInput
      app.stdin.write("x")

      expect(app.text).toContain("layer1: [x]")
    })

    test("layers can access dispatch to programmatically send input", () => {
      function DispatchOnMount() {
        const ctx = useInputLayerContext()

        // Dispatch in useLayoutEffect to test programmatic dispatch
        React.useLayoutEffect(() => {
          ctx.dispatch("auto", {
            upArrow: false,
            downArrow: false,
            leftArrow: false,
            rightArrow: false,
            pageDown: false,
            pageUp: false,
            home: false,
            end: false,
            return: false,
            escape: false,
            ctrl: false,
            shift: false,
            tab: false,
            backspace: false,
            delete: false,
            meta: false,
          })
        }, [ctx])

        return null
      }

      const app = render(
        <TestApp>
          <InputCapture layerId="receiver" consume />
          <DispatchOnMount />
        </TestApp>,
      )

      expect(app.text).toContain("receiver: [auto]")
    })
  })

  // ==========================================================================
  // Tests: Real-world Dialog Pattern
  // ==========================================================================

  describe("dialog pattern", () => {
    test("dialog input field captures typing, escape bubbles to close dialog", () => {
      function Dialog({ onClose, onSubmit }: { onClose: () => void; onSubmit: (value: string) => void }) {
        const [value, setValue] = useState("")

        // Dialog layer - handles escape to close
        useInputLayer(
          "dialog",
          useCallback(
            (_input: string, key) => {
              if (key.escape) {
                onClose()
                return true
              }
              if (key.return) {
                onSubmit(value)
                return true
              }
              return false
            },
            [onClose, onSubmit, value],
          ),
        )

        // Input layer - handles text input
        useInputLayer(
          "dialog-input",
          useCallback(
            (input: string, key) => {
              if (key.backspace && value.length > 0) {
                setValue((v) => v.slice(0, -1))
                return true
              }
              if (input.length === 1 && input >= " ") {
                setValue((v) => v + input)
                return true
              }
              return false
            },
            [value],
          ),
        )

        return (
          <Box flexDirection="column" testID="dialog">
            <Text>Search: {value}</Text>
          </Box>
        )
      }

      function App() {
        const [dialogOpen, setDialogOpen] = useState(true)
        const [result, setResult] = useState("")

        return (
          <Box flexDirection="column">
            {dialogOpen && (
              <Dialog
                onClose={() => setDialogOpen(false)}
                onSubmit={(v) => {
                  setResult(v)
                  setDialogOpen(false)
                }}
              />
            )}
            <Text>Dialog: {dialogOpen ? "open" : "closed"}</Text>
            <Text>Result: {result}</Text>
          </Box>
        )
      }

      const app = render(
        <TestApp>
          <App />
        </TestApp>,
      )

      expect(app.text).toContain("Dialog: open")

      // Type some text
      app.stdin.write("h")
      app.stdin.write("e")
      app.stdin.write("l")
      app.stdin.write("l")
      app.stdin.write("o")

      expect(app.text).toContain("Search: hello")

      // Press Enter to submit
      app.stdin.write("\r")

      expect(app.text).toContain("Dialog: closed")
      expect(app.text).toContain("Result: hello")
    })

    test("typing in search box does not trigger board navigation", () => {
      const boardActions: string[] = []
      const searchReceived: string[] = []

      function Board({ children }: { children?: React.ReactNode }) {
        useInputLayer(
          "board",
          useCallback((input: string, key) => {
            if (input === "j" || key.downArrow) {
              boardActions.push("move_down")
              return true
            }
            if (input === "k" || key.upArrow) {
              boardActions.push("move_up")
              return true
            }
            return false
          }, []),
        )

        return <Box flexDirection="column">{children}</Box>
      }

      function SearchBox() {
        const [value, setValue] = useState("")

        // Use a ref to avoid stale closure issues with the handler
        const valueRef = React.useRef(value)
        valueRef.current = value

        useInputLayer(
          "search-input",
          useCallback((input: string, key) => {
            searchReceived.push(input)
            if (key.backspace && valueRef.current.length > 0) {
              setValue((v) => v.slice(0, -1))
              return true
            }
            if (input.length === 1 && input >= " ") {
              setValue((v) => v + input)
              return true
            }
            return false
          }, []), // No deps - uses ref for stable handler
        )

        return <Text testID="search">Search: {value}</Text>
      }

      const app = render(
        <TestApp>
          <Board>
            <SearchBox />
          </Board>
        </TestApp>,
      )

      // Type 'jk' - should be captured by search box, not board
      // SearchBox is a child of Board, so its useLayoutEffect runs first
      // This means SearchBox layer handles input before Board layer
      app.stdin.write("j")
      expect(searchReceived).toContain("j")

      app.stdin.write("k")
      expect(searchReceived).toContain("k")

      expect(app.text).toContain("Search: jk")
      expect(boardActions).toEqual([])
    })
  })
})
