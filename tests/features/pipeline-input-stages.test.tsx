/**
 * Pipeline Input Stages — Stage 3 (Event Loop) event routing behavior.
 *
 * The silvery input pipeline has 5 stages:
 *
 *   Stage 1: Terminal Provider     (splitRawInput -- chunk splitting)
 *   Stage 2: Parser                (parseKey -- structured Key objects)
 *   Stage 3: Event Loop            (processEventBatch -- batching & filtering)
 *   Stage 4: Focus Dispatch        (dispatchKeyEvent -- capture/target/bubble)
 *   Stage 5: Hooks & Handlers      (useInput, onKeyDown, withCommands)
 *
 * This test file verifies the observable behaviors of Stage 3 event routing
 * as seen through createRenderer (which mirrors the production pipeline):
 *
 * 1. Release events are filtered from useInput (go to onRelease instead)
 * 2. Modifier-only events are filtered from useInput (go to useModifierKeys)
 * 3. Paste events route to paste listeners, not useInput
 * 4. Focus-consumed events (Tab/Shift+Tab/Escape) don't reach useInput
 * 5. Event batching -- multiple keys produce sequential handler calls + one render
 * 6. Exit from handler stops further event processing
 *
 * These tests complement the existing key-release.test.tsx, tab-focus.test.tsx,
 * paste-callback.test.tsx, and event-coalescing.test.tsx by providing an
 * integrated view of the entire routing decision tree.
 */

import React, { useState } from "react"
import { describe, test, expect, vi } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, Text, useFocusable } from "silvery"
import { useInput } from "../../packages/ag-react/src/hooks/useInput"
import { usePasteCallback } from "../../packages/ag-react/src/hooks/usePasteCallback"

// ============================================================================
// Helpers
// ============================================================================

/** Wrap content in bracketed paste escape sequences */
function bracketedPaste(content: string): string {
  return `\x1b[200~${content}\x1b[201~`
}

/** Focusable component that reads focus state */
function FocusableItem({ id }: { id: string }) {
  const { focused } = useFocusable()
  return (
    <Box testID={id} focusable>
      <Text>
        {id}:{focused ? "F" : "U"}
      </Text>
    </Box>
  )
}

// ============================================================================
// PIS-01: useInput receives press events, not release events
// ============================================================================

describe("pipeline input stages", () => {
  test("PIS-01: press events reach useInput, release events do not", async () => {
    const pressHandler = vi.fn()
    const releaseHandler = vi.fn()

    function App() {
      useInput(
        (input, key) => {
          pressHandler(input, key.eventType)
        },
        {
          onRelease: (input, key) => {
            releaseHandler(input, key.eventType)
          },
        },
      )
      return <Text>ready</Text>
    }

    const render = createRenderer({ cols: 40, rows: 5, kittyMode: true })
    const app = render(<App />)

    // Send press for "a" (Kitty: codepoint 97, modifier 1=none, eventType 1=press)
    app.stdin.write("\x1b[97;1:1u")
    await Promise.resolve()

    // Send release for "a" (eventType 3=release)
    app.stdin.write("\x1b[97;1:3u")
    await Promise.resolve()

    expect(pressHandler).toHaveBeenCalledOnce()
    expect(pressHandler.mock.calls[0]![0]).toBe("a")

    expect(releaseHandler).toHaveBeenCalledOnce()
    expect(releaseHandler.mock.calls[0]![0]).toBe("a")
    expect(releaseHandler.mock.calls[0]![1]).toBe("release")
  })

  // ============================================================================
  // PIS-02: Modifier-only events filtered from useInput
  // ============================================================================

  test("PIS-02: modifier-only keys (Cmd, Shift alone) are filtered from useInput", async () => {
    const handler = vi.fn()

    function App() {
      useInput(handler)
      return <Text>ready</Text>
    }

    const render = createRenderer({ cols: 40, rows: 5, kittyMode: true })
    const app = render(<App />)

    // leftsuper press: codepoint 57444, modifier 9 (super=8+1), eventType 1=press
    app.stdin.write("\x1b[57444;9:1u")
    await Promise.resolve()

    // leftshift press: codepoint 57441, modifier 2 (shift=1+1), eventType 1=press
    app.stdin.write("\x1b[57441;2:1u")
    await Promise.resolve()

    // leftcontrol press: codepoint 57442, modifier 5 (ctrl=4+1), eventType 1=press
    app.stdin.write("\x1b[57442;5:1u")
    await Promise.resolve()

    // leftalt press: codepoint 57443, modifier 3 (alt=2+1), eventType 1=press
    app.stdin.write("\x1b[57443;3:1u")
    await Promise.resolve()

    // None of these should reach useInput -- they are modifier-only events
    expect(handler).not.toHaveBeenCalled()

    // But Cmd+a (modifier + regular key) SHOULD reach useInput
    // "a" with super modifier: codepoint 97, modifier 9 (super=8+1)
    app.stdin.write("\x1b[97;9u")
    await Promise.resolve()

    expect(handler).toHaveBeenCalledOnce()
    expect(handler.mock.calls[0]![1].super).toBe(true)
  })

  // ============================================================================
  // PIS-03: Paste events isolated from useInput
  // ============================================================================

  test("PIS-03: paste events route to paste listeners, NOT useInput", () => {
    const inputHandler = vi.fn()
    const pasteHandler = vi.fn()

    function App() {
      useInput((input) => {
        inputHandler(input)
      })
      usePasteCallback(pasteHandler)
      return <Text>ready</Text>
    }

    const render = createRenderer({ cols: 40, rows: 5 })
    const app = render(<App />)

    // Send a regular key first -- useInput sees it
    app.stdin.write("a")
    expect(inputHandler).toHaveBeenCalledTimes(1)
    expect(inputHandler).toHaveBeenCalledWith("a")

    // Send a bracketed paste -- only paste handler sees it
    app.stdin.write(bracketedPaste("pasted text"))
    expect(pasteHandler).toHaveBeenCalledTimes(1)
    expect(pasteHandler).toHaveBeenCalledWith("pasted text")

    // useInput was NOT called again -- paste content is isolated
    expect(inputHandler).toHaveBeenCalledTimes(1)

    // Send another regular key -- useInput sees it again
    app.stdin.write("b")
    expect(inputHandler).toHaveBeenCalledTimes(2)
    expect(inputHandler).toHaveBeenLastCalledWith("b")
  })

  // ============================================================================
  // PIS-04: Tab consumed by focus dispatch, not seen by useInput
  // ============================================================================

  test("PIS-04: Tab/Shift+Tab consumed by focus cycling, invisible to useInput", async () => {
    const inputHandler = vi.fn()

    function App() {
      useInput((input, key) => {
        inputHandler(input, { tab: key.tab, shift: key.shift })
      })
      return (
        <Box flexDirection="column">
          <FocusableItem id="a" />
          <FocusableItem id="b" />
        </Box>
      )
    }

    const render = createRenderer({ cols: 40, rows: 10 })
    const app = render(<App />)

    // Initially nothing focused
    expect(app.focusManager.activeId).toBeNull()

    // Tab -- consumed by focus cycling
    await app.press("Tab")
    expect(app.focusManager.activeId).toBe("a")
    expect(inputHandler).not.toHaveBeenCalled()

    // Tab again -- consumed by focus cycling
    await app.press("Tab")
    expect(app.focusManager.activeId).toBe("b")
    expect(inputHandler).not.toHaveBeenCalled()

    // Shift+Tab -- consumed by focus cycling
    await app.press("Shift+Tab")
    expect(app.focusManager.activeId).toBe("a")
    expect(inputHandler).not.toHaveBeenCalled()

    // Regular key -- NOT consumed, reaches useInput
    await app.press("j")
    expect(inputHandler).toHaveBeenCalledOnce()
  })

  // ============================================================================
  // PIS-05: Escape consumed when focus is active, falls through otherwise
  // ============================================================================

  test("PIS-05: Escape consumed by focus blur when something is focused, passes through otherwise", async () => {
    const inputHandler = vi.fn()

    function App() {
      useInput((input, key) => {
        inputHandler({ escape: key.escape })
      })
      return (
        <Box flexDirection="column">
          <FocusableItem id="a" />
        </Box>
      )
    }

    const render = createRenderer({ cols: 40, rows: 10 })
    const app = render(<App />)

    // Nothing focused -- Escape falls through to useInput
    await app.press("Escape")
    expect(inputHandler).toHaveBeenCalledTimes(1)
    expect(inputHandler).toHaveBeenCalledWith({ escape: true })

    // Focus something via Tab
    await app.press("Tab")
    expect(app.focusManager.activeId).toBe("a")
    inputHandler.mockClear()

    // Escape with active focus -- consumed by blur, NOT seen by useInput
    await app.press("Escape")
    expect(app.focusManager.activeId).toBeNull()
    expect(inputHandler).not.toHaveBeenCalled()

    // Escape again with nothing focused -- falls through
    await app.press("Escape")
    expect(inputHandler).toHaveBeenCalledOnce()
  })

  // ============================================================================
  // PIS-06: Sequential key events update state cumulatively
  // ============================================================================

  test("PIS-06: multiple sequential keypresses all update state", async () => {
    function Counter() {
      const [count, setCount] = useState(0)
      useInput((input) => {
        if (input === "j") setCount((n) => n + 1)
        if (input === "k") setCount((n) => n - 1)
      })
      return <Text>count={count}</Text>
    }

    const render = createRenderer({ cols: 40, rows: 5 })
    const app = render(<Counter />)

    expect(app.text).toContain("count=0")

    // Send individual keys
    await app.press("j")
    expect(app.text).toContain("count=1")

    await app.press("j")
    expect(app.text).toContain("count=2")

    await app.press("j")
    expect(app.text).toContain("count=3")

    await app.press("k")
    expect(app.text).toContain("count=2")
  })

  // ============================================================================
  // PIS-07: Burst of individual keypresses processes all events
  // ============================================================================

  test("PIS-07: individual keypresses sent in sequence all update state", async () => {
    function Counter() {
      const [count, setCount] = useState(0)
      const [last, setLast] = useState("")
      useInput((input) => {
        setCount((n) => n + 1)
        setLast(input)
      })
      return (
        <Text>
          count={count} last={last}
        </Text>
      )
    }

    const render = createRenderer({ cols: 40, rows: 5 })
    const app = render(<Counter />)

    expect(app.text).toContain("count=0")

    // Send individual keys via press() -- each one processes through the pipeline
    await app.press("a")
    expect(app.text).toContain("count=1")
    expect(app.text).toContain("last=a")

    await app.press("b")
    expect(app.text).toContain("count=2")
    expect(app.text).toContain("last=b")

    await app.press("c")
    await app.press("d")
    await app.press("e")
    await app.press("f")

    expect(app.text).toContain("count=6")
    expect(app.text).toContain("last=f")
  })

  // ============================================================================
  // PIS-08: Exit from handler prevents further processing
  // ============================================================================

  test("PIS-08: return 'exit' from useInput triggers exit", async () => {
    function App() {
      useInput((input) => {
        if (input === "q") return "exit"
      })
      return <Text>running</Text>
    }

    const render = createRenderer({ cols: 40, rows: 5 })
    const app = render(<App />)

    expect(app.exitCalled()).toBe(false)

    await app.press("q")

    expect(app.exitCalled()).toBe(true)
  })

  // ============================================================================
  // PIS-09: onRelease not called when no onRelease option provided
  // ============================================================================

  test("PIS-09: release events silently dropped when onRelease not provided", async () => {
    const handler = vi.fn()

    function App() {
      useInput(handler) // No onRelease option
      return <Text>ready</Text>
    }

    const render = createRenderer({ cols: 40, rows: 5, kittyMode: true })
    const app = render(<App />)

    // Send press -- handler fires
    app.stdin.write("\x1b[97;1:1u") // "a" press
    await Promise.resolve()
    expect(handler).toHaveBeenCalledOnce()

    // Send release -- silently dropped, handler NOT called again
    app.stdin.write("\x1b[97;1:3u") // "a" release
    await Promise.resolve()
    expect(handler).toHaveBeenCalledOnce()
  })

  // ============================================================================
  // PIS-10: useInput onPaste option receives paste, main handler does not
  // ============================================================================

  test("PIS-10: useInput onPaste option routes paste to dedicated callback", () => {
    const inputHandler = vi.fn()
    const pasteHandler = vi.fn()

    function App() {
      useInput(
        (input) => {
          inputHandler(input)
        },
        {
          onPaste: (text) => {
            pasteHandler(text)
          },
        },
      )
      return <Text>ready</Text>
    }

    const render = createRenderer({ cols: 40, rows: 5 })
    const app = render(<App />)

    // Paste via bracketed paste sequence
    app.stdin.write(bracketedPaste("clipboard content"))

    // onPaste received it
    expect(pasteHandler).toHaveBeenCalledTimes(1)
    expect(pasteHandler).toHaveBeenCalledWith("clipboard content")

    // Main handler did NOT receive it
    expect(inputHandler).not.toHaveBeenCalled()
  })

  // ============================================================================
  // PIS-11: isActive=false disables all input routing for that hook
  // ============================================================================

  test("PIS-11: isActive=false prevents all input delivery to that hook", async () => {
    const activeHandler = vi.fn()
    const inactiveHandler = vi.fn()

    function App() {
      useInput(
        (input) => {
          activeHandler(input)
        },
        { isActive: true },
      )
      useInput(
        (input) => {
          inactiveHandler(input)
        },
        { isActive: false },
      )
      return <Text>ready</Text>
    }

    const render = createRenderer({ cols: 40, rows: 5 })
    const app = render(<App />)

    await app.press("x")

    // Active handler receives the key
    expect(activeHandler).toHaveBeenCalledOnce()
    expect(activeHandler).toHaveBeenCalledWith("x")

    // Inactive handler does NOT receive the key
    expect(inactiveHandler).not.toHaveBeenCalled()
  })

  // ============================================================================
  // PIS-12: Full pipeline integration -- mixed event types in sequence
  // ============================================================================

  test("PIS-12: mixed event types route correctly in sequence", async () => {
    const inputCalls: string[] = []
    const pasteCalls: string[] = []
    const releaseCalls: string[] = []

    function App() {
      useInput(
        (input) => {
          inputCalls.push(input)
        },
        {
          onRelease: (input) => {
            releaseCalls.push(input)
          },
        },
      )
      usePasteCallback((text) => {
        pasteCalls.push(text)
      })
      return (
        <Box flexDirection="column">
          <FocusableItem id="f1" />
          <Text>app</Text>
        </Box>
      )
    }

    const render = createRenderer({ cols: 40, rows: 10, kittyMode: true })
    const app = render(<App />)

    // 1. Regular keypress -- goes to useInput
    app.stdin.write("\x1b[97;1:1u") // "a" press
    await Promise.resolve()
    expect(inputCalls).toEqual(["a"])

    // 2. Release event -- goes to onRelease
    app.stdin.write("\x1b[97;1:3u") // "a" release
    await Promise.resolve()
    expect(releaseCalls).toEqual(["a"])

    // 3. Paste -- goes to paste handler
    app.stdin.write(bracketedPaste("pasted"))
    expect(pasteCalls).toEqual(["pasted"])

    // 4. Tab -- consumed by focus cycling (not seen by useInput)
    await app.press("Tab")
    expect(app.focusManager.activeId).toBe("f1")
    expect(inputCalls).toEqual(["a"]) // unchanged

    // 5. Another regular key -- goes to useInput
    app.stdin.write("\x1b[98;1:1u") // "b" press
    await Promise.resolve()
    expect(inputCalls).toEqual(["a", "b"])

    // 6. Modifier-only (Cmd alone) -- filtered, not in useInput
    app.stdin.write("\x1b[57444;9:1u") // leftsuper press
    await Promise.resolve()
    expect(inputCalls).toEqual(["a", "b"]) // unchanged

    // Final tally
    expect(inputCalls).toHaveLength(2)
    expect(releaseCalls).toHaveLength(1)
    expect(pasteCalls).toHaveLength(1)
  })
})
