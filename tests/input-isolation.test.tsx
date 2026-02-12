/**
 * Tests for InputBoundary - Input Isolation
 *
 * InputBoundary creates an isolated input scope where child components'
 * useInput/useInputLayer handlers only fire when the boundary is active.
 * This prevents embedded interactive components from interfering with
 * parent input handling.
 */
import React, { useState, useCallback } from "react"
import { describe, expect, test } from "vitest"
import { InputBoundary } from "../src/contexts/InputBoundary.tsx"
import { InputLayerProvider, useInputLayer } from "../src/contexts/InputLayerContext.tsx"
import { Box, Text, useInput } from "../src/index.ts"
import { createRenderer } from "../src/testing/index.tsx"

// ============================================================================
// Test Components
// ============================================================================

/** Component using useInput (the simple hook, not layer-aware) */
function SimpleInputCapture({ id }: { id: string }) {
  const [keys, setKeys] = useState<string[]>([])

  useInput((input) => {
    setKeys((prev) => [...prev, input])
  })

  return (
    <Text testID={`simple-${id}`}>
      {id}: [{keys.join(", ")}]
    </Text>
  )
}

/** Component using useInputLayer */
function LayerInputCapture({ id, consume = true }: { id: string; consume?: boolean }) {
  const [keys, setKeys] = useState<string[]>([])

  useInputLayer(
    id,
    useCallback(
      (input: string) => {
        setKeys((prev) => [...prev, input])
        return consume
      },
      [consume],
    ),
  )

  return (
    <Text testID={`layer-${id}`}>
      {id}: [{keys.join(", ")}]
    </Text>
  )
}

/** Wrapper providing InputLayerProvider */
function TestApp({ children }: { children: React.ReactNode }) {
  return <InputLayerProvider>{children}</InputLayerProvider>
}

// ============================================================================
// Tests
// ============================================================================

describe("InputBoundary", () => {
  const render = createRenderer({ cols: 80, rows: 24 })

  describe("isolation of useInput handlers", () => {
    test("child useInput fires when boundary is active", () => {
      const app = render(
        <TestApp>
          <InputBoundary active={true}>
            <SimpleInputCapture id="child" />
          </InputBoundary>
        </TestApp>,
      )

      app.stdin.write("a")
      app.stdin.write("b")
      expect(app.text).toContain("child: [a, b]")
    })

    test("child useInput does NOT fire when boundary is inactive", () => {
      const app = render(
        <TestApp>
          <InputBoundary active={false}>
            <SimpleInputCapture id="child" />
          </InputBoundary>
        </TestApp>,
      )

      app.stdin.write("a")
      app.stdin.write("b")
      expect(app.text).toContain("child: []")
    })

    test("parent useInput still fires (useInput bypasses layer stack)", () => {
      // useInput subscribes directly to the EventEmitter and does not participate
      // in the InputLayer stack. InputBoundary isolates at the layer level, so
      // parent useInput handlers still fire. Use useInputLayer for full isolation.
      function App() {
        const [parentKeys, setParentKeys] = useState<string[]>([])

        useInput((input) => {
          setParentKeys((prev) => [...prev, input])
        })

        return (
          <Box flexDirection="column">
            <Text testID="parent">parent: [{parentKeys.join(", ")}]</Text>
            <InputBoundary active={true}>
              <SimpleInputCapture id="child" />
            </InputBoundary>
          </Box>
        )
      }

      const app = render(
        <TestApp>
          <App />
        </TestApp>,
      )

      app.stdin.write("j")
      app.stdin.write("k")

      // Child receives forwarded input
      expect(app.text).toContain("child: [j, k]")
      // Parent's useInput also fires (known limitation — use useInputLayer instead)
      expect(app.text).toContain("parent: [j, k]")
    })
  })

  describe("isolation of useInputLayer handlers", () => {
    test("parent layer handler does NOT fire when boundary is active", () => {
      function App() {
        return (
          <Box flexDirection="column">
            <InputBoundary active={true}>
              <LayerInputCapture id="child" />
            </InputBoundary>
            <LayerInputCapture id="parent" />
          </Box>
        )
      }

      const app = render(
        <TestApp>
          <App />
        </TestApp>,
      )

      app.stdin.write("a")
      app.stdin.write("b")

      // Child receives input via isolated scope
      expect(app.text).toContain("child: [a, b]")
      // Parent does NOT receive (boundary consumed the event)
      expect(app.text).toContain("parent: []")
    })

    test("parent layer handler fires when boundary is inactive", () => {
      function App() {
        return (
          <Box flexDirection="column">
            <InputBoundary active={false}>
              <LayerInputCapture id="child" />
            </InputBoundary>
            <LayerInputCapture id="parent" />
          </Box>
        )
      }

      const app = render(
        <TestApp>
          <App />
        </TestApp>,
      )

      app.stdin.write("a")
      app.stdin.write("b")

      // Child does NOT receive (boundary inactive)
      expect(app.text).toContain("child: []")
      // Parent receives normally
      expect(app.text).toContain("parent: [a, b]")
    })
  })

  describe("escape to unfocus", () => {
    test("Escape triggers onEscape callback", () => {
      function App() {
        const [active, setActive] = useState(true)

        return (
          <Box flexDirection="column">
            <Text testID="status">active: {active ? "yes" : "no"}</Text>
            <InputBoundary active={active} onEscape={() => setActive(false)}>
              <LayerInputCapture id="child" />
            </InputBoundary>
          </Box>
        )
      }

      const app = render(
        <TestApp>
          <App />
        </TestApp>,
      )

      expect(app.text).toContain("active: yes")

      // Send input - child receives
      app.stdin.write("a")
      expect(app.text).toContain("child: [a]")

      // Press Escape - triggers onEscape
      app.stdin.write("\x1b")
      expect(app.text).toContain("active: no")
    })

    test("Escape is NOT forwarded to children", () => {
      function App() {
        const [active, setActive] = useState(true)

        return (
          <InputBoundary active={active} onEscape={() => setActive(false)}>
            <LayerInputCapture id="child" />
          </InputBoundary>
        )
      }

      const app = render(
        <TestApp>
          <App />
        </TestApp>,
      )

      app.stdin.write("a")
      app.stdin.write("\x1b")

      // Escape was intercepted, not forwarded
      expect(app.text).toContain("child: [a]")
    })

    test("custom exit key", () => {
      function App() {
        const [active, setActive] = useState(true)

        return (
          <Box flexDirection="column">
            <Text testID="status">active: {active ? "yes" : "no"}</Text>
            <InputBoundary active={active} exitKey="q" onEscape={() => setActive(false)}>
              <LayerInputCapture id="child" />
            </InputBoundary>
          </Box>
        )
      }

      const app = render(
        <TestApp>
          <App />
        </TestApp>,
      )

      // 'q' triggers exit
      app.stdin.write("q")
      expect(app.text).toContain("active: no")
      // 'q' was not forwarded to child
      expect(app.text).toContain("child: []")
    })

    test("exitKey=null disables exit key", () => {
      function App() {
        const [keys, setKeys] = useState<string[]>([])

        return (
          <InputBoundary active={true} exitKey={null}>
            <EscapeCapture onEscape={() => setKeys((k) => [...k, "esc"])} />
            <Text testID="escaped">escaped: [{keys.join(", ")}]</Text>
          </InputBoundary>
        )
      }

      /** Captures escape key via useInputLayer */
      function EscapeCapture({ onEscape }: { onEscape: () => void }) {
        useInputLayer(
          "escape-capture",
          useCallback(
            (_input: string, key) => {
              if (key.escape) {
                onEscape()
                return true
              }
              return false
            },
            [onEscape],
          ),
        )
        return null
      }

      const app = render(
        <TestApp>
          <App />
        </TestApp>,
      )

      // Escape is forwarded to child (no exit key configured)
      app.stdin.write("\x1b")
      expect(app.text).toContain("escaped: [esc]")
    })
  })

  describe("toggle active state", () => {
    test("input routing switches when active toggles", () => {
      function App() {
        const [active, setActive] = useState(false)

        return (
          <Box flexDirection="column">
            <Text testID="status">active: {active ? "yes" : "no"}</Text>
            <FocusToggle onFocus={() => setActive(true)} />
            <InputBoundary active={active} onEscape={() => setActive(false)}>
              <LayerInputCapture id="child" />
            </InputBoundary>
            <LayerInputCapture id="sibling" />
          </Box>
        )
      }

      /** Handles 'f' to toggle focus, lets other keys bubble */
      function FocusToggle({ onFocus }: { onFocus: () => void }) {
        useInputLayer(
          "focus-toggle",
          useCallback(
            (input: string) => {
              if (input === "f") {
                onFocus()
                return true
              }
              return false
            },
            [onFocus],
          ),
        )
        return null
      }

      const app = render(
        <TestApp>
          <App />
        </TestApp>,
      )

      // Initially inactive - sibling gets input
      app.stdin.write("a")
      expect(app.text).toContain("sibling: [a]")
      expect(app.text).toContain("child: []")

      // Activate boundary with 'f'
      app.stdin.write("f")
      expect(app.text).toContain("active: yes")

      // Now child gets input, sibling does not
      app.stdin.write("b")
      expect(app.text).toContain("child: [b]")
      expect(app.text).toContain("sibling: [a]") // Still only 'a'

      // Escape to deactivate
      app.stdin.write("\x1b")
      expect(app.text).toContain("active: no")

      // Sibling gets input again
      app.stdin.write("c")
      expect(app.text).toContain("sibling: [a, c]")
    })
  })

  describe("nested boundaries", () => {
    test("nested boundaries isolate independently", () => {
      function App() {
        const [outerActive, setOuterActive] = useState(true)
        const [innerActive, setInnerActive] = useState(false)

        return (
          <Box flexDirection="column">
            <Text testID="state">
              outer={outerActive ? "on" : "off"} inner=
              {innerActive ? "on" : "off"}
            </Text>
            <InputBoundary active={outerActive} onEscape={() => setOuterActive(false)}>
              <Box flexDirection="column">
                <LayerInputCapture id="outer-child" />
                <InputBoundary active={innerActive} onEscape={() => setInnerActive(false)}>
                  <LayerInputCapture id="inner-child" />
                </InputBoundary>
              </Box>
            </InputBoundary>
            <LayerInputCapture id="root" />
          </Box>
        )
      }

      const app = render(
        <TestApp>
          <App />
        </TestApp>,
      )

      // Outer active, inner inactive - outer-child gets input
      app.stdin.write("a")
      expect(app.text).toContain("outer-child: [a]")
      expect(app.text).toContain("inner-child: []")
      expect(app.text).toContain("root: []")
    })
  })

  describe("special keys", () => {
    test("arrow keys are forwarded to active boundary", () => {
      function App() {
        const [keys, setKeys] = useState<string[]>([])

        useInput((input, key) => {
          if (key.upArrow) setKeys((k) => [...k, "up"])
          if (key.downArrow) setKeys((k) => [...k, "down"])
        })

        return <Text testID="arrows">arrows: [{keys.join(", ")}]</Text>
      }

      const app = render(
        <TestApp>
          <InputBoundary active={true}>
            <App />
          </InputBoundary>
        </TestApp>,
      )

      app.stdin.write("\x1b[A") // Arrow Up
      app.stdin.write("\x1b[B") // Arrow Down
      expect(app.text).toContain("arrows: [up, down]")
    })

    test("Enter key is forwarded to active boundary", () => {
      function App() {
        const [received, setReceived] = useState(false)

        useInput((_input, key) => {
          if (key.return) setReceived(true)
        })

        return <Text testID="enter">enter: {received ? "yes" : "no"}</Text>
      }

      const app = render(
        <TestApp>
          <InputBoundary active={true}>
            <App />
          </InputBoundary>
        </TestApp>,
      )

      app.stdin.write("\r")
      expect(app.text).toContain("enter: yes")
    })
  })
})
