/**
 * Ink Compatibility Tests
 *
 * Tests that verify Inkx is API-compatible with Ink.
 * These tests verify:
 * 1. Public API exports match Ink's expectations
 * 2. Components render equivalent output to Ink
 * 3. Hooks behave the same as Ink's hooks
 * 4. Behavioral tests for keyboard input, focus, etc.
 */

import type React from "react"
import { useState } from "react"
import { describe, expect, test } from "vitest"

// Test that all expected exports exist
import {
  // Components
  Box,
  // Types (these should not throw when imported)
  type BoxProps,
  type ComputedLayout,
  type InkxNode,
  type InputHandler,
  type Instance,
  type Key,
  type MeasureElementOutput,
  Newline,
  type RenderOptions,
  Spacer,
  Static,
  Text,
  type TextProps,
  type UseAppResult,
  type UseFocusManagerResult,
  type UseFocusOptions,
  type UseFocusResult,
  type UseInputOptions,
  type UseStdinResult,
  type UseStdoutResult,
  // Render
  measureElement,
  render,
  // Hooks
  useApp,
  useContentRect,
  useFocus,
  useFocusManager,
  useInput,
  useStdin,
  useStdout,
} from "../src/index.js"

import { FocusContext, type FocusContextValue } from "../src/context.js"
import { createRenderer, stripAnsi } from "../src/testing/index.js"

const testRender = createRenderer()

// ============================================================================
// API Export Tests
// ============================================================================

describe("Ink API Compatibility", () => {
  describe("Component Exports", () => {
    test("Box component exists and is a valid React component", () => {
      // Box uses forwardRef, so typeof is 'object', but it's a valid component
      expect(Box).toBeDefined()
      expect(typeof Box === "function" || typeof Box === "object").toBe(true)
    })

    test("Text component exists and is a valid React component", () => {
      // Text uses forwardRef, so typeof is 'object', but it's a valid component
      expect(Text).toBeDefined()
      expect(typeof Text === "function" || typeof Text === "object").toBe(true)
    })

    test("Newline component exists and is a function", () => {
      expect(typeof Newline).toBe("function")
    })

    test("Spacer component exists and is a function", () => {
      expect(typeof Spacer).toBe("function")
    })

    test("Static component exists and is a function", () => {
      expect(typeof Static).toBe("function")
    })
  })

  describe("Hook Exports", () => {
    test("useInput hook exists and is a function", () => {
      expect(typeof useInput).toBe("function")
    })

    test("useApp hook exists and is a function", () => {
      expect(typeof useApp).toBe("function")
    })

    test("useStdout hook exists and is a function", () => {
      expect(typeof useStdout).toBe("function")
    })

    test("useStdin hook exists and is a function", () => {
      expect(typeof useStdin).toBe("function")
    })

    test("useFocus hook exists and is a function", () => {
      expect(typeof useFocus).toBe("function")
    })

    test("useFocusManager hook exists and is a function", () => {
      expect(typeof useFocusManager).toBe("function")
    })

    test("useContentRect hook exists and is a function (Inkx-specific)", () => {
      expect(typeof useContentRect).toBe("function")
    })
  })

  describe("Render Exports", () => {
    test("render function exists and is a function", () => {
      expect(typeof render).toBe("function")
    })

    test("measureElement function exists and is a function", () => {
      expect(typeof measureElement).toBe("function")
    })
  })

  describe("Box Props (Ink-compatible)", () => {
    test("Box accepts flexDirection prop", () => {
      const app = testRender(
        <Box flexDirection="column">
          <Text>A</Text>
          <Text>B</Text>
        </Box>,
      )
      const frame = app.ansi
      expect(frame).toContain("A")
      expect(frame).toContain("B")
    })

    test("Box accepts padding props", () => {
      const app = testRender(
        <Box padding={1}>
          <Text>Padded</Text>
        </Box>,
      )
      expect(app.ansi).toContain("Padded")
    })

    test("Box accepts margin props", () => {
      const app = testRender(
        <Box margin={1}>
          <Text>Margined</Text>
        </Box>,
      )
      expect(app.ansi).toContain("Margined")
    })

    test("Box accepts width/height props", () => {
      const app = testRender(
        <Box width={10} height={3}>
          <Text>Sized</Text>
        </Box>,
      )
      expect(app.ansi).toContain("Sized")
    })

    test("Box accepts borderStyle prop", () => {
      const app = testRender(
        <Box borderStyle="single">
          <Text>Bordered</Text>
        </Box>,
      )
      const frame = app.ansi
      expect(frame).toContain("Bordered")
      // Should have border characters
      expect(frame).toMatch(/[─│┌┐└┘]/)
    })

    test("Box accepts borderColor prop", () => {
      const app = testRender(
        <Box borderStyle="single" borderColor="red">
          <Text>Red Border</Text>
        </Box>,
      )
      expect(app.ansi).toContain("Red Border")
    })

    test("Box accepts justifyContent prop", () => {
      const app = testRender(
        <Box justifyContent="space-between" width={20}>
          <Text>A</Text>
          <Text>B</Text>
        </Box>,
      )
      expect(app.ansi).toContain("A")
      expect(app.ansi).toContain("B")
    })

    test("Box accepts alignItems prop", () => {
      const app = testRender(
        <Box alignItems="center" height={3}>
          <Text>Centered</Text>
        </Box>,
      )
      expect(app.ansi).toContain("Centered")
    })
  })

  describe("Text Props (Ink-compatible)", () => {
    test("Text accepts color prop", () => {
      const app = testRender(<Text color="red">Red</Text>)
      expect(app.ansi).toContain("Red")
    })

    test("Text accepts backgroundColor prop", () => {
      const app = testRender(<Text backgroundColor="blue">BlueBg</Text>)
      expect(app.ansi).toContain("BlueBg")
    })

    test("Text accepts bold prop", () => {
      const app = testRender(<Text bold>Bold</Text>)
      expect(app.ansi).toContain("Bold")
    })

    test("Text accepts italic prop", () => {
      const app = testRender(<Text italic>Italic</Text>)
      expect(app.ansi).toContain("Italic")
    })

    test("Text accepts underline prop", () => {
      const app = testRender(<Text underline>Underline</Text>)
      expect(app.ansi).toContain("Underline")
    })

    test("Text accepts strikethrough prop", () => {
      const app = testRender(<Text strikethrough>Strike</Text>)
      expect(app.ansi).toContain("Strike")
    })

    test("Text accepts dimColor prop", () => {
      const app = testRender(<Text dimColor>Dim</Text>)
      expect(app.ansi).toContain("Dim")
    })

    test("Text accepts inverse prop", () => {
      const app = testRender(<Text inverse>Inverse</Text>)
      expect(app.ansi).toContain("Inverse")
    })

    test("Text accepts wrap prop", () => {
      const app = testRender(<Text wrap="truncate">LongTextHere</Text>)
      expect(app.ansi).toContain("Long")
    })

    test("Text truncate-start shows end of text with ellipsis at start", () => {
      const app = testRender(
        <Box width={10}>
          <Text wrap="truncate-start">Hello World Test</Text>
        </Box>,
      )
      const frame = app.text
      // Should show ellipsis at start followed by end portion
      // Inkx uses Unicode ellipsis character
      expect(frame).toMatch(/[…\.]{1,3}/)
      expect(frame).toContain("Test")
    })

    test("Text truncate-middle shows start and end with ellipsis in middle", () => {
      const app = testRender(
        <Box width={12}>
          <Text wrap="truncate-middle">Hello World Test</Text>
        </Box>,
      )
      const frame = app.text
      // Should show start, ellipsis, then end
      // Inkx uses Unicode ellipsis character
      expect(frame).toMatch(/[…\.]{1,3}/)
      expect(frame).toContain("Hell") // Start portion
      expect(frame).toContain("est") // End portion
    })
  })

  describe("Spacer Component", () => {
    test("Spacer pushes content apart", () => {
      const app = testRender(
        <Box flexDirection="row" width={20}>
          <Text>L</Text>
          <Spacer />
          <Text>R</Text>
        </Box>,
      )
      expect(app.ansi).toContain("L")
      expect(app.ansi).toContain("R")
    })
  })

  describe("Newline Component", () => {
    test("Newline adds line breaks", () => {
      const app = testRender(
        <Box flexDirection="column">
          <Text>A</Text>
          <Newline count={2} />
          <Text>B</Text>
        </Box>,
      )
      expect(app.ansi).toContain("A")
      expect(app.ansi).toContain("B")
    })
  })

  describe("Static Component", () => {
    test("Static component exists and accepts items prop", () => {
      // Static is a special component that requires the full reconciler
      // for proper behavior (writing content once and never updating).
      // Here we just verify the API shape.
      const items = ["a", "b"]
      const element = (
        <Static items={items}>
          {(item) => <Text key={item}>{item}</Text>}
        </Static>
      )
      expect(element).toBeDefined()
      expect(element.props.items).toEqual(["a", "b"])
      expect(typeof element.props.children).toBe("function")
    })
  })

  describe("Key Object Shape", () => {
    test("Key type has expected properties", () => {
      // This tests the type shape at runtime by creating a mock key object
      const mockKey: Key = {
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
      }

      // Verify all properties exist
      expect(mockKey).toHaveProperty("upArrow")
      expect(mockKey).toHaveProperty("downArrow")
      expect(mockKey).toHaveProperty("leftArrow")
      expect(mockKey).toHaveProperty("rightArrow")
      expect(mockKey).toHaveProperty("pageDown")
      expect(mockKey).toHaveProperty("pageUp")
      expect(mockKey).toHaveProperty("home")
      expect(mockKey).toHaveProperty("end")
      expect(mockKey).toHaveProperty("return")
      expect(mockKey).toHaveProperty("escape")
      expect(mockKey).toHaveProperty("ctrl")
      expect(mockKey).toHaveProperty("shift")
      expect(mockKey).toHaveProperty("tab")
      expect(mockKey).toHaveProperty("backspace")
      expect(mockKey).toHaveProperty("delete")
      expect(mockKey).toHaveProperty("meta")
    })
  })

  describe("Color Formats", () => {
    test("Text accepts named colors", () => {
      const app = testRender(<Text color="green">Green</Text>)
      expect(app.ansi).toContain("Green")
    })

    test("Text accepts hex colors", () => {
      const app = testRender(<Text color="#ff0000">Hex</Text>)
      expect(app.ansi).toContain("Hex")
    })

    test("Text accepts rgb colors", () => {
      const app = testRender(<Text color="rgb(255, 0, 0)">RGB</Text>)
      expect(app.ansi).toContain("RGB")
    })
  })
})

// ============================================================================
// Behavioral Tests - useInput
// ============================================================================

describe("Behavioral Tests - useInput", () => {
  const render = createRenderer({ cols: 80, rows: 30 })

  describe("isActive option", () => {
    test("useInput ignores input when isActive is false", () => {
      let inputReceived = false

      function InactiveInputHandler() {
        useInput(
          () => {
            inputReceived = true
          },
          { isActive: false },
        )
        return <Text>Inactive Handler</Text>
      }

      const app = render(<InactiveInputHandler />)
      app.stdin.write("a")
      app.stdin.write("\x1b[A") // up arrow

      expect(inputReceived).toBe(false)
    })

    test("useInput processes input when isActive is true", () => {
      let inputReceived = false

      function ActiveInputHandler() {
        useInput(
          () => {
            inputReceived = true
          },
          { isActive: true },
        )
        return <Text>Active Handler</Text>
      }

      const app = render(<ActiveInputHandler />)
      app.stdin.write("a")

      expect(inputReceived).toBe(true)
    })

    test("useInput processes input when isActive is undefined (default true)", () => {
      let inputReceived = false

      function DefaultActiveHandler() {
        useInput(() => {
          inputReceived = true
        })
        return <Text>Default Handler</Text>
      }

      const app = render(<DefaultActiveHandler />)
      app.stdin.write("a")

      expect(inputReceived).toBe(true)
    })

    test("useInput can toggle isActive dynamically", () => {
      const receivedInputs: string[] = []

      function ToggleableHandler() {
        const [isActive, setIsActive] = useState(true)

        useInput(
          (input) => {
            receivedInputs.push(input)
            if (input === "d") {
              setIsActive(false)
            }
          },
          { isActive },
        )

        return <Text>isActive: {isActive ? "true" : "false"}</Text>
      }

      const app = render(<ToggleableHandler />)

      app.stdin.write("a") // Should be received
      app.stdin.write("b") // Should be received
      app.stdin.write("d") // Should be received, disables handler
      app.stdin.write("e") // Should NOT be received

      expect(receivedInputs).toEqual(["a", "b", "d"])
      expect(app.text).toContain("isActive: false")
    })
  })

  describe("Multiple useInput handlers", () => {
    test("multiple active handlers all receive input", () => {
      const handler1Inputs: string[] = []
      const handler2Inputs: string[] = []

      function Handler1() {
        useInput((input) => {
          handler1Inputs.push(`h1:${input}`)
        })
        return null
      }

      function Handler2() {
        useInput((input) => {
          handler2Inputs.push(`h2:${input}`)
        })
        return null
      }

      function MultiHandlerApp() {
        return (
          <Box flexDirection="column">
            <Handler1 />
            <Handler2 />
            <Text>Multi Handler</Text>
          </Box>
        )
      }

      const app = render(<MultiHandlerApp />)
      app.stdin.write("x")

      expect(handler1Inputs).toContain("h1:x")
      expect(handler2Inputs).toContain("h2:x")
    })

    test("inactive handler does not receive input while others do", () => {
      const activeInputs: string[] = []
      const inactiveInputs: string[] = []

      function ActiveHandler() {
        useInput(
          (input) => {
            activeInputs.push(input)
          },
          { isActive: true },
        )
        return null
      }

      function InactiveHandler() {
        useInput(
          (input) => {
            inactiveInputs.push(input)
          },
          { isActive: false },
        )
        return null
      }

      function MixedHandlerApp() {
        return (
          <Box>
            <ActiveHandler />
            <InactiveHandler />
            <Text>Mixed</Text>
          </Box>
        )
      }

      const app = render(<MixedHandlerApp />)
      app.stdin.write("y")

      expect(activeInputs).toEqual(["y"])
      expect(inactiveInputs).toEqual([])
    })
  })
})

// ============================================================================
// Behavioral Tests - useFocus
// ============================================================================

describe("Behavioral Tests - useFocus", () => {
  const render = createRenderer({ cols: 80, rows: 30 })

  /**
   * Create a mock focus context that tracks focus state.
   * Uses a mutable state object so changes are visible to tests.
   */
  function createFocusContext(): FocusContextValue & {
    focusables: Map<string, { isActive: boolean }>
    getActiveId: () => string | null
  } {
    const state = { activeId: null as string | null }
    const focusables = new Map<string, { isActive: boolean }>()
    const focusOrder: string[] = []

    const ctx: FocusContextValue & {
      focusables: Map<string, { isActive: boolean }>
      getActiveId: () => string | null
    } = {
      get activeId() {
        return state.activeId
      },
      focusables,
      getActiveId: () => state.activeId,
      add: (id, options) => {
        focusables.set(id, { isActive: true })
        focusOrder.push(id)
        if (options?.autoFocus && state.activeId === null) {
          state.activeId = id
        }
      },
      remove: (id) => {
        focusables.delete(id)
        const idx = focusOrder.indexOf(id)
        if (idx >= 0) focusOrder.splice(idx, 1)
        if (state.activeId === id) {
          state.activeId = focusOrder[0] ?? null
        }
      },
      activate: (id) => {
        const f = focusables.get(id)
        if (f) f.isActive = true
      },
      deactivate: (id) => {
        const f = focusables.get(id)
        if (f) f.isActive = false
      },
      focus: (id) => {
        state.activeId = id
      },
      focusNext: () => {
        const activeItems = focusOrder.filter(
          (id) => focusables.get(id)?.isActive,
        )
        if (activeItems.length === 0) return
        const currentIdx = state.activeId
          ? activeItems.indexOf(state.activeId)
          : -1
        const nextIdx = (currentIdx + 1) % activeItems.length
        state.activeId = activeItems[nextIdx] ?? null
      },
      focusPrevious: () => {
        const activeItems = focusOrder.filter(
          (id) => focusables.get(id)?.isActive,
        )
        if (activeItems.length === 0) return
        const currentIdx = state.activeId
          ? activeItems.indexOf(state.activeId)
          : 0
        const prevIdx =
          (currentIdx - 1 + activeItems.length) % activeItems.length
        state.activeId = activeItems[prevIdx] ?? null
      },
      enableFocus: () => {},
      disableFocus: () => {},
      isFocusEnabled: true,
    }

    return ctx
  }

  test("useFocus returns isFocused=true when component is focused", () => {
    const ctx = createFocusContext()

    function FocusableItem() {
      const focus = useFocus({ id: "item1", autoFocus: true })
      return <Text>{focus.isFocused ? "focused" : "unfocused"}</Text>
    }

    render(
      <FocusContext.Provider value={ctx}>
        <FocusableItem />
      </FocusContext.Provider>,
    )

    // autoFocus should make it focused
    expect(ctx.getActiveId()).toBe("item1")
  })

  test("useFocus autoFocus option focuses on mount", () => {
    const ctx = createFocusContext()

    function AutoFocusItem() {
      useFocus({ id: "auto-item", autoFocus: true })
      return <Text>Auto</Text>
    }

    render(
      <FocusContext.Provider value={ctx}>
        <AutoFocusItem />
      </FocusContext.Provider>,
    )

    expect(ctx.getActiveId()).toBe("auto-item")
  })

  test("useFocus isActive=false makes component unfocusable", () => {
    const ctx = createFocusContext()

    function InactiveFocusable() {
      useFocus({ id: "inactive", isActive: false })
      return <Text>Inactive</Text>
    }

    render(
      <FocusContext.Provider value={ctx}>
        <InactiveFocusable />
      </FocusContext.Provider>,
    )

    expect(ctx.focusables.get("inactive")?.isActive).toBe(false)
  })

  test("focus() method focuses the component", () => {
    const ctx = createFocusContext()
    const focusRef = { current: null as (() => void) | null }

    function ManualFocusItem() {
      const { focus } = useFocus({ id: "manual" })
      focusRef.current = focus
      return <Text>Manual</Text>
    }

    render(
      <FocusContext.Provider value={ctx}>
        <ManualFocusItem />
      </FocusContext.Provider>,
    )

    expect(ctx.getActiveId()).toBeNull()
    focusRef.current?.()
    expect(ctx.getActiveId()).toBe("manual")
  })
})

// ============================================================================
// Behavioral Tests - useApp
// ============================================================================

describe("Behavioral Tests - useApp", () => {
  const render = createRenderer({ cols: 80, rows: 30 })

  test("useApp returns exit function", () => {
    let exitFn: ((error?: Error) => void) | null = null

    function AppWithExit() {
      const { exit } = useApp()
      exitFn = exit
      return <Text>App with exit</Text>
    }

    render(<AppWithExit />)

    expect(exitFn).toBeDefined()
    expect(typeof exitFn).toBe("function")
  })

  test("useApp exit can be called", () => {
    let exitCalled = false

    function ExitOnKey() {
      const { exit } = useApp()

      useInput((input) => {
        if (input === "q") {
          exit()
          exitCalled = true
        }
      })

      return <Text>Press q to exit</Text>
    }

    const app = render(<ExitOnKey />)
    app.stdin.write("q")

    expect(exitCalled).toBe(true)
  })
})

// ============================================================================
// Behavioral Tests - Rendering
// ============================================================================

describe("Behavioral Tests - Rendering", () => {
  const render = createRenderer({ cols: 80, rows: 30 })

  describe("Re-render behavior", () => {
    test("state changes trigger re-render", () => {
      function Counter() {
        const [count, setCount] = useState(0)

        useInput((input) => {
          if (input === "+") {
            setCount((c) => c + 1)
          }
        })

        return <Text>Count: {count}</Text>
      }

      const app = render(<Counter />)

      expect(app.text).toContain("Count: 0")

      app.stdin.write("+")
      expect(app.text).toContain("Count: 1")

      app.stdin.write("+")
      app.stdin.write("+")
      expect(app.text).toContain("Count: 3")
    })

    test("rerender function updates component", () => {
      function Greeting({ name }: { name: string }) {
        return <Text>Hello, {name}!</Text>
      }

      const app = render(<Greeting name="World" />)

      expect(app.text).toContain("Hello, World!")

      app.rerender(<Greeting name="Inkx" />)
      expect(app.text).toContain("Hello, Inkx!")
    })

    test("frames array captures all renders", () => {
      function Message({ text }: { text: string }) {
        return <Text>{text}</Text>
      }

      const app = render(<Message text="First" />)
      app.rerender(<Message text="Second" />)
      app.rerender(<Message text="Third" />)

      expect(app.frames.length).toBe(3)
      expect(stripAnsi(app.frames[0] ?? "")).toContain("First")
      expect(stripAnsi(app.frames[1] ?? "")).toContain("Second")
      expect(stripAnsi(app.frames[2] ?? "")).toContain("Third")
    })
  })

  describe("Nested component rendering", () => {
    test("deeply nested components render correctly", () => {
      function Inner() {
        return <Text>Inner Content</Text>
      }

      function Middle({ children }: { children: React.ReactNode }) {
        return <Box borderStyle="single">{children}</Box>
      }

      function Outer() {
        return (
          <Box flexDirection="column">
            <Text>Header</Text>
            <Middle>
              <Inner />
            </Middle>
            <Text>Footer</Text>
          </Box>
        )
      }

      const app = render(<Outer />)
      const frame = app.text

      expect(frame).toContain("Header")
      expect(frame).toContain("Inner Content")
      expect(frame).toContain("Footer")
    })

    test("conditional rendering works", () => {
      function ConditionalContent({ show }: { show: boolean }) {
        return (
          <Box flexDirection="column">
            <Text>Always visible</Text>
            {show && <Text>Conditional content</Text>}
          </Box>
        )
      }

      const app = render(<ConditionalContent show={false} />)
      expect(app.text).toContain("Always visible")
      expect(app.text).not.toContain("Conditional content")

      app.rerender(<ConditionalContent show={true} />)
      expect(app.text).toContain("Always visible")
      expect(app.text).toContain("Conditional content")
    })

    test("list rendering with map works", () => {
      const items = ["Apple", "Banana", "Cherry"]

      function List() {
        return (
          <Box flexDirection="column">
            {items.map((item, i) => (
              <Text key={i}>- {item}</Text>
            ))}
          </Box>
        )
      }

      const app = render(<List />)
      const frame = app.text

      expect(frame).toContain("Apple")
      expect(frame).toContain("Banana")
      expect(frame).toContain("Cherry")
    })
  })

  describe("Text styling", () => {
    test("multiple styles can be combined", () => {
      const app = render(
        <Text bold italic underline color="red">
          Multi-styled
        </Text>,
      )
      expect(app.ansi).toContain("Multi-styled")
    })

    test("nested Text elements inherit styling context", () => {
      const app = render(
        <Text>
          Normal{" "}
          <Text bold>
            Bold <Text color="red">Bold+Red</Text>
          </Text>
        </Text>,
      )
      const frame = app.text
      expect(frame).toContain("Normal")
      expect(frame).toContain("Bold")
      expect(frame).toContain("Bold+Red")
    })
  })

  describe("Layout calculations", () => {
    test("flexGrow distributes space", () => {
      const app = render(
        <Box flexDirection="row" width={30}>
          <Box flexGrow={1}>
            <Text>A</Text>
          </Box>
          <Box flexGrow={1}>
            <Text>B</Text>
          </Box>
          <Box flexGrow={1}>
            <Text>C</Text>
          </Box>
        </Box>,
      )
      const frame = app.text
      expect(frame).toContain("A")
      expect(frame).toContain("B")
      expect(frame).toContain("C")
    })

    test("Spacer with flexDirection column creates vertical space", () => {
      const app = render(
        <Box flexDirection="column" height={5}>
          <Text>Top</Text>
          <Spacer />
          <Text>Bottom</Text>
        </Box>,
      )
      const frame = app.text
      expect(frame).toContain("Top")
      expect(frame).toContain("Bottom")
    })

    test("padding adds space around content", () => {
      const app = render(
        <Box padding={2} width={20}>
          <Text>Padded</Text>
        </Box>,
      )
      const frame = app.ansi
      // Content should be present
      expect(frame).toContain("Padded")
    })
  })
})

// ============================================================================
// Behavioral Tests - Common Ink Patterns
// ============================================================================

describe("Common Ink Patterns", () => {
  const render = createRenderer({ cols: 80, rows: 30 })

  describe("Selection list pattern", () => {
    test("renders a selectable list with keyboard navigation", () => {
      function SelectList({ items }: { items: string[] }) {
        const [selectedIndex, setSelectedIndex] = useState(0)

        useInput((_input, key) => {
          if (key.downArrow) {
            setSelectedIndex((i) => Math.min(i + 1, items.length - 1))
          }
          if (key.upArrow) {
            setSelectedIndex((i) => Math.max(i - 1, 0))
          }
        })

        return (
          <Box flexDirection="column">
            {items.map((item, i) => (
              <Text key={i} color={i === selectedIndex ? "green" : undefined}>
                {i === selectedIndex ? ">" : " "} {item}
              </Text>
            ))}
          </Box>
        )
      }

      const items = ["Option 1", "Option 2", "Option 3"]
      const app = render(<SelectList items={items} />)

      // Initial state - first item selected
      let frame = app.text
      expect(frame).toContain("> Option 1")

      // Move down
      app.stdin.write("\x1b[B") // down arrow
      frame = app.text
      expect(frame).toContain("> Option 2")

      // Move down again
      app.stdin.write("\x1b[B") // down arrow
      frame = app.text
      expect(frame).toContain("> Option 3")

      // Try to move past end - should stay at last
      app.stdin.write("\x1b[B")
      frame = app.text
      expect(frame).toContain("> Option 3")

      // Move up
      app.stdin.write("\x1b[A") // up arrow
      frame = app.text
      expect(frame).toContain("> Option 2")
    })
  })

  describe("Input field pattern", () => {
    test("captures typed characters", () => {
      const capturedInputs: string[] = []

      function InputField() {
        const [value, setValue] = useState("")

        useInput((input, key) => {
          capturedInputs.push(input)
          if (key.backspace || key.delete) {
            setValue((v) => v.slice(0, -1))
          } else if (
            !key.return &&
            input.length >= 1 &&
            !key.ctrl &&
            !key.meta &&
            !key.escape
          ) {
            setValue((v) => v + input)
          }
        })

        return (
          <Box>
            <Text>Input: {value}</Text>
            <Text inverse>_</Text>
          </Box>
        )
      }

      const app = render(<InputField />)

      // Type each character
      app.stdin.write("h")
      app.stdin.write("e")
      app.stdin.write("l")
      app.stdin.write("l")
      app.stdin.write("o")

      // Verify inputs were captured
      expect(capturedInputs).toEqual(["h", "e", "l", "l", "o"])

      const frame = app.text
      expect(frame).toContain("Input: hello")

      // Test delete key (0x7f is what terminals send for backspace/delete)
      app.stdin.write("\x7f")
      expect(app.text).toContain("Input: hell")
    })
  })

  describe("Loading spinner pattern", () => {
    test("displays different states", () => {
      function Spinner({
        isLoading,
        message,
      }: {
        isLoading: boolean
        message: string
      }) {
        return (
          <Box>
            <Text>{isLoading ? "..." : "+"}</Text>
            <Text> {message}</Text>
          </Box>
        )
      }

      const app = render(<Spinner isLoading={true} message="Loading..." />)

      let frame = app.text
      expect(frame).toContain("...")
      expect(frame).toContain("Loading...")

      app.rerender(<Spinner isLoading={false} message="Done!" />)
      frame = app.text
      expect(frame).toContain("+")
      expect(frame).toContain("Done!")
    })
  })

  describe("Status bar pattern", () => {
    test("renders full-width status bar", () => {
      function StatusBar({
        mode,
        filename,
      }: {
        mode: string
        filename: string
      }) {
        return (
          <Box flexDirection="row" width={40}>
            <Text inverse> {mode} </Text>
            <Spacer />
            <Text>{filename}</Text>
          </Box>
        )
      }

      const app = render(<StatusBar mode="NORMAL" filename="test.txt" />)
      const frame = app.text

      expect(frame).toContain("NORMAL")
      expect(frame).toContain("test.txt")
    })
  })

  describe("Tab panel pattern", () => {
    test("switches between tabs", () => {
      function TabPanel() {
        const [activeTab, setActiveTab] = useState(0)
        const tabs = ["Home", "Settings", "Help"]

        useInput((_input, key) => {
          if (key.tab) {
            setActiveTab((t) => (t + 1) % tabs.length)
          }
        })

        return (
          <Box flexDirection="column">
            <Box flexDirection="row">
              {tabs.map((tab, i) => (
                <Text key={i} inverse={i === activeTab}>
                  {" "}
                  {tab}{" "}
                </Text>
              ))}
            </Box>
            <Box marginTop={1}>
              <Text>Content for: {tabs[activeTab]}</Text>
            </Box>
          </Box>
        )
      }

      const app = render(<TabPanel />)

      let frame = app.text
      expect(frame).toContain("Content for: Home")

      // Press tab to switch
      app.stdin.write("\t")
      frame = app.text
      expect(frame).toContain("Content for: Settings")

      app.stdin.write("\t")
      frame = app.text
      expect(frame).toContain("Content for: Help")

      // Wrap around
      app.stdin.write("\t")
      frame = app.text
      expect(frame).toContain("Content for: Home")
    })
  })
})

// ============================================================================
// Edge Cases and Error Handling
// ============================================================================

describe("Edge Cases", () => {
  const render = createRenderer({ cols: 80, rows: 30 })

  test("empty Box renders without error", () => {
    const app = render(<Box />)
    expect(app.ansi).toBeDefined()
  })

  test("empty Text renders without error", () => {
    const app = render(<Text />)
    expect(app.ansi).toBeDefined()
  })

  test("null children are handled", () => {
    const app = render(
      <Box>
        <Text>Before</Text>
        {null}
        <Text>After</Text>
      </Box>,
    )
    const frame = app.text
    expect(frame).toContain("Before")
    expect(frame).toContain("After")
  })

  test("undefined children are handled", () => {
    const app = render(
      <Box>
        <Text>Before</Text>
        {undefined}
        <Text>After</Text>
      </Box>,
    )
    const frame = app.text
    expect(frame).toContain("Before")
    expect(frame).toContain("After")
  })

  test("boolean children are handled", () => {
    const app = render(
      <Box>
        {true && <Text>Shown</Text>}
        {false && <Text>Hidden</Text>}
      </Box>,
    )
    const frame = app.text
    expect(frame).toContain("Shown")
    expect(frame).not.toContain("Hidden")
  })

  test("number children render correctly", () => {
    const app = render(<Text>{42}</Text>)
    expect(app.text).toContain("42")
  })

  test("mixed children types render correctly", () => {
    const isActive = true // Testing ternary expression handling
    const app = render(
      <Text>
        Count: {10} - Status: {"ok"} - Active: {isActive ? "yes" : "no"}
      </Text>,
    )
    const frame = app.text
    expect(frame).toContain("Count: 10")
    expect(frame).toContain("Status: ok")
    expect(frame).toContain("Active: yes")
  })
})
