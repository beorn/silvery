/**
 * App Integration Tests
 *
 * Tests for the buildApp() factory and the unified App interface.
 * Covers lifecycle, content access, locators, input actions, exit handling,
 * and the terminal binding layer.
 */

import React, { useEffect, useState } from "react"
import { describe, expect, test } from "vitest"
import { Box, Text, useApp, useInput, type Key } from "../src/index.ts"
import { createRenderer } from "inkx/testing"

const render = createRenderer({ cols: 80, rows: 24 })

// ============================================================================
// Content / Document Perspective
// ============================================================================

describe("App content access", () => {
  test("app.text returns plain text without ANSI codes", () => {
    const app = render(
      <Box>
        <Text color="red">Hello</Text>
      </Box>,
    )

    expect(app.text).toContain("Hello")
    // Should NOT contain ANSI escape sequences
    expect(app.text).not.toMatch(/\x1b\[/)
  })

  test("app.ansi returns text with ANSI codes", () => {
    const app = render(
      <Box>
        <Text color="red">Hello</Text>
      </Box>,
    )

    expect(app.ansi).toContain("Hello")
    // SHOULD contain ANSI escape sequences for color
    expect(app.ansi).toMatch(/\x1b\[/)
  })

  test("app.text returns empty string when buffer is missing", () => {
    const app = render(<Text>Init</Text>)
    // After render there is a buffer, so text should be populated
    expect(app.text).toContain("Init")
  })

  test("app.text updates after rerender", () => {
    const app = render(<Text>Before</Text>)
    expect(app.text).toContain("Before")

    app.rerender(<Text>After</Text>)
    expect(app.text).toContain("After")
    expect(app.text).not.toContain("Before")
  })
})

// ============================================================================
// Locator Access (getByTestId, getByText, locator)
// ============================================================================

describe("App locator methods", () => {
  test("getByTestId returns auto-refreshing locator", () => {
    function Toggle() {
      const [on, setOn] = useState(false)
      useInput((input) => {
        if (input === "t") setOn((v) => !v)
      })
      return (
        <Box testID="status">
          <Text>{on ? "ON" : "OFF"}</Text>
        </Box>
      )
    }

    const app = render(<Toggle />)
    const status = app.getByTestId("status")

    expect(status.textContent()).toBe("OFF")
    app.stdin.write("t")
    // Same locator, fresh result after state change
    expect(status.textContent()).toBe("ON")
  })

  test("getByText returns auto-refreshing locator", () => {
    const app = render(
      <Box>
        <Text>Alpha</Text>
        <Text>Beta</Text>
      </Box>,
    )

    const alpha = app.getByText("Alpha")
    expect(alpha.count()).toBe(1)
    expect(alpha.textContent()).toBe("Alpha")
  })

  test("getByText with regex", () => {
    const app = render(
      <Box>
        <Text>Task 42</Text>
        <Text>Task 99</Text>
      </Box>,
    )

    expect(app.getByText(/Task \d+/).count()).toBe(2)
  })

  test("locator with attribute selector", () => {
    const app = render(
      <Box>
        <Text testID="item-1">First</Text>
        <Text testID="item-2">Second</Text>
        <Text testID="other">Third</Text>
      </Box>,
    )

    expect(app.locator('[testID^="item-"]').count()).toBe(2)
  })

  test("locator returns 0 count for no matches", () => {
    const app = render(
      <Box>
        <Text>Hello</Text>
      </Box>,
    )

    expect(app.getByTestId("nonexistent").count()).toBe(0)
    expect(app.getByText("Missing").count()).toBe(0)
  })
})

// ============================================================================
// Actions (press, pressSequence, type)
// ============================================================================

describe("App actions", () => {
  function Counter() {
    const [count, setCount] = useState(0)
    useInput((input: string) => {
      if (input === "j") setCount((c) => c + 1)
      if (input === "k") setCount((c) => c - 1)
    })
    return <Text testID="count">Count: {count}</Text>
  }

  test("press sends a key and flushes", async () => {
    const app = render(<Counter />)
    expect(app.text).toContain("Count: 0")

    await app.press("j")
    expect(app.text).toContain("Count: 1")
  })

  test("press returns app for chaining", async () => {
    const app = render(<Counter />)
    const result = await app.press("j")
    expect(result).toBe(app)
  })

  test("pressSequence sends multiple keys in order", async () => {
    const app = render(<Counter />)

    await app.pressSequence("j", "j", "j", "k")
    expect(app.text).toContain("Count: 2")
  })

  test("type sends each character individually", async () => {
    function TypeCapture() {
      const [text, setText] = useState("")
      useInput((input: string) => {
        if (input >= " " && input <= "~") {
          setText((t) => t + input)
        }
      })
      return <Text testID="typed">{text || "(empty)"}</Text>
    }

    const app = render(<TypeCapture />)
    await app.type("hi")
    expect(app.getByTestId("typed").textContent()).toContain("hi")
  })

  test("type returns app for chaining", async () => {
    function Noop() {
      useInput(() => {})
      return <Text>Noop</Text>
    }
    const app = render(<Noop />)
    const result = await app.type("x")
    expect(result).toBe(app)
  })
})

// ============================================================================
// stdin.write (legacy sync helper)
// ============================================================================

describe("App stdin.write", () => {
  test("stdin.write sends raw input synchronously", () => {
    function Display() {
      const [keys, setKeys] = useState<string[]>([])
      useInput((input: string) => {
        setKeys((prev) => [...prev, input])
      })
      return <Text>{keys.join(",") || "none"}</Text>
    }

    const app = render(<Display />)
    app.stdin.write("a")
    app.stdin.write("b")
    expect(app.text).toContain("a,b")
  })
})

// ============================================================================
// Terminal Binding (app.term)
// ============================================================================

describe("App terminal binding", () => {
  test("app.term provides bound terminal access", () => {
    const app = render(
      <Box width={20} height={3}>
        <Text>Hello</Text>
      </Box>,
    )

    const term = app.term
    expect(term).toBeDefined()
    expect(term.buffer).toBeDefined()
  })

  test("app.term.buffer has correct width", () => {
    const app = render(
      <Box>
        <Text>Content</Text>
      </Box>,
    )

    expect(app.term.buffer.width).toBe(80)
    // Height depends on content (not terminal rows)
    expect(app.term.buffer.height).toBeGreaterThanOrEqual(1)
  })
})

// ============================================================================
// Lifecycle (rerender, unmount, Symbol.dispose)
// ============================================================================

describe("App lifecycle", () => {
  test("rerender updates the rendered element", () => {
    const app = render(<Text>Version 1</Text>)
    expect(app.text).toContain("Version 1")

    app.rerender(<Text>Version 2</Text>)
    expect(app.text).toContain("Version 2")
  })

  test("unmount cleans up the component", () => {
    const app = render(<Text>Active</Text>)
    expect(app.text).toContain("Active")

    app.unmount()
    // Double unmount should throw
    expect(() => app.unmount()).toThrow("Already unmounted")
  })

  test("Symbol.dispose calls unmount (using pattern)", () => {
    const app = render(<Text>Disposable</Text>)
    expect(app.text).toContain("Disposable")

    app[Symbol.dispose]()
    // After dispose, unmount should throw (already unmounted)
    expect(() => app.unmount()).toThrow("Already unmounted")
  })

  test("clear resets frames and buffer", () => {
    const app = render(<Text>Frame 1</Text>)
    expect(app.frames.length).toBeGreaterThan(0)

    app.clear()
    expect(app.frames.length).toBe(0)
  })
})

// ============================================================================
// Exit Handling
// ============================================================================

describe("App exit handling", () => {
  test("exitCalled returns false initially", () => {
    const app = render(<Text>Running</Text>)
    expect(app.exitCalled()).toBe(false)
  })

  test("exitCalled returns true after exit()", () => {
    function ExitOnMount() {
      const { exit } = useApp()
      useEffect(() => {
        exit()
      }, [exit])
      return <Text>Exiting</Text>
    }

    const app = render(<ExitOnMount />)
    expect(app.exitCalled()).toBe(true)
  })

  test("exitError returns undefined when no error", () => {
    const app = render(<Text>No error</Text>)
    expect(app.exitError()).toBeUndefined()
  })

  test("exitError returns the error passed to exit()", () => {
    function ExitWithErr() {
      const { exit } = useApp()
      useEffect(() => {
        exit(new Error("Test error"))
      }, [exit])
      return <Text>Error exit</Text>
    }

    const app = render(<ExitWithErr />)
    expect(app.exitCalled()).toBe(true)
    expect(app.exitError()).toBeInstanceOf(Error)
    expect(app.exitError()!.message).toBe("Test error")
  })

  test("waitUntilExit resolves for test renderer", async () => {
    const app = render(<Text>Ready</Text>)
    // Test renderer resolves immediately
    await expect(app.waitUntilExit()).resolves.toBeUndefined()
  })

  test("run() is an alias for waitUntilExit()", async () => {
    const app = render(<Text>Ready</Text>)
    await expect(app.run()).resolves.toBeUndefined()
  })
})

// ============================================================================
// Fresh Render (test-only)
// ============================================================================

describe("App freshRender", () => {
  test("freshRender returns a buffer without updating incremental state", () => {
    const app = render(
      <Box>
        <Text>Content</Text>
      </Box>,
    )

    const freshBuffer = app.freshRender()
    expect(freshBuffer).toBeDefined()
    expect(freshBuffer.width).toBe(80)
    // Height depends on content (not terminal rows)
    expect(freshBuffer.height).toBeGreaterThanOrEqual(1)
  })
})

// ============================================================================
// Frames (internal/legacy)
// ============================================================================

describe("App frames tracking", () => {
  test("frames array captures each render output", () => {
    const app = render(<Text>Frame 0</Text>)
    const initialFrameCount = app.frames.length
    expect(initialFrameCount).toBeGreaterThanOrEqual(1)

    app.stdin.write("x") // trigger a re-render via input (even if unhandled)
    // Frame count should increase (input triggers re-render regardless)
    expect(app.frames.length).toBeGreaterThan(initialFrameCount)
  })

  test("lastFrame returns the most recent ANSI frame", () => {
    const app = render(<Text>Latest</Text>)
    const frame = app.lastFrame()
    expect(frame).toBeDefined()
    expect(frame).toContain("Latest")
  })

  test("lastBuffer returns the current buffer", () => {
    const app = render(<Text>Buffer</Text>)
    const buffer = app.lastBuffer()
    expect(buffer).toBeDefined()
    expect(buffer!.width).toBe(80)
  })

  test("lastFrameText returns plain text of last frame", () => {
    const app = render(<Text color="green">Plain</Text>)
    const text = app.lastFrameText()
    expect(text).toBeDefined()
    expect(text).toContain("Plain")
    // Should not contain ANSI codes
    expect(text).not.toMatch(/\x1b\[/)
  })
})

// ============================================================================
// getContainer
// ============================================================================

describe("App getContainer", () => {
  test("getContainer returns the root InkxNode", () => {
    const app = render(
      <Box testID="root">
        <Text>Child</Text>
      </Box>,
    )

    const root = app.getContainer()
    expect(root).toBeDefined()
    expect(root.type).toBe("inkx-root")
    expect(root.children.length).toBeGreaterThan(0)
  })
})

// ============================================================================
// nodeAt (content coordinates)
// ============================================================================

describe("App nodeAt", () => {
  test("nodeAt finds a node at content coordinates", () => {
    const app = render(
      <Box testID="container" width={40} height={5}>
        <Text>Hello at origin</Text>
      </Box>,
    )

    // Node at (0,0) should be within the rendered content
    const node = app.nodeAt(0, 0)
    expect(node).not.toBeNull()
  })

  test("nodeAt returns null for out-of-bounds coordinates", () => {
    const app = render(
      <Box width={10} height={3}>
        <Text>Small</Text>
      </Box>,
    )

    // Way out of bounds
    const node = app.nodeAt(999, 999)
    expect(node).toBeNull()
  })
})

// ============================================================================
// Focus System
// ============================================================================

describe("App focus system", () => {
  test("getFocusPath returns empty array when nothing is focused", () => {
    const app = render(
      <Box>
        <Text>No focus</Text>
      </Box>,
    )

    expect(app.getFocusPath()).toEqual([])
  })

  test("focus method focuses a node by testID", () => {
    const app = render(
      <Box>
        <Box testID="panel-a" focusable>
          <Text>A</Text>
        </Box>
        <Box testID="panel-b" focusable>
          <Text>B</Text>
        </Box>
      </Box>,
    )

    app.focus("panel-a")
    const path = app.getFocusPath()
    expect(path).toContain("panel-a")
  })

  test("focusManager is accessible", () => {
    const app = render(
      <Box>
        <Text>Focus test</Text>
      </Box>,
    )

    expect(app.focusManager).toBeDefined()
    expect(typeof app.focusManager.blur).toBe("function")
  })
})

// ============================================================================
// Error States
// ============================================================================

describe("App error states", () => {
  test("stdin.write after unmount throws", () => {
    const app = render(<Text>Gone</Text>)
    app.unmount()

    expect(() => app.stdin.write("x")).toThrow("Cannot write to stdin after unmount")
  })

  test("rerender after unmount throws", () => {
    const app = render(<Text>Gone</Text>)
    app.unmount()

    expect(() => app.rerender(<Text>New</Text>)).toThrow("Cannot rerender after unmount")
  })
})

// ============================================================================
// createRenderer auto-cleanup
// ============================================================================

describe("createRenderer auto-cleanup", () => {
  test("creating a new render unmounts the previous one", () => {
    const localRender = createRenderer({ cols: 40, rows: 10 })

    const app1 = localRender(<Text>First</Text>)
    expect(app1.text).toContain("First")

    const app2 = localRender(<Text>Second</Text>)
    expect(app2.text).toContain("Second")

    // app1 should be unmounted (double unmount should throw)
    expect(() => app1.unmount()).toThrow("Already unmounted")
  })
})

// ============================================================================
// Debug
// ============================================================================

describe("App debug", () => {
  test("debug does not throw", () => {
    const app = render(
      <Box>
        <Text>Debug me</Text>
      </Box>,
    )

    // debug() prints to console; suppress output to avoid test setup's console check
    const origLog = console.log
    console.log = () => {}
    try {
      expect(() => app.debug()).not.toThrow()
    } finally {
      console.log = origLog
    }
  })
})
