/**
 * Paste Callback Tests
 *
 * Tests for usePasteCallback and usePasteEvents hooks — the two paste
 * subscription mechanisms in silvery.
 *
 * usePasteCallback: simple callback-based paste subscription for run() apps.
 * usePasteEvents: bridge that routes runtime paste events to PasteProvider context.
 *
 * Paste is triggered via bracketed paste sequences (\x1b[200~...\x1b[201~)
 * sent through app.stdin.write(). The renderer's sendInput detects these,
 * parses the content, and emits a "paste" event on the inputEmitter — bypassing
 * the normal key-splitting path entirely.
 */

import React, { useState, useEffect } from "react"
import { describe, test, expect, vi } from "vitest"
import { createRenderer, waitFor } from "@silvery/test"
import { Text, Box } from "../../src/index.js"
import { usePasteCallback } from "../../packages/ag-react/src/hooks/usePasteCallback"
import { usePasteEvents } from "../../packages/ag-react/src/hooks/usePasteEvents"
import { useInput } from "../../packages/ag-react/src/hooks/useInput"
import { PasteProvider, type PasteHandler } from "../../packages/ag-react/src/hooks/usePaste"
import type { PasteEvent } from "../../packages/ag-term/src/copy-extraction"
import { setInternalClipboard } from "../../packages/ag-term/src/copy-extraction"

// ============================================================================
// Helpers
// ============================================================================

/** Wrap content in bracketed paste escape sequences */
function bracketedPaste(content: string): string {
  return `\x1b[200~${content}\x1b[201~`
}

// ============================================================================
// usePasteCallback
// ============================================================================

describe("usePasteCallback", () => {
  test("PC-01: receives bracketed paste as text", () => {
    const onPaste = vi.fn()

    function App() {
      usePasteCallback(onPaste)
      return <Text>ready</Text>
    }

    const render = createRenderer({ cols: 40, rows: 5 })
    const app = render(<App />)

    app.stdin.write(bracketedPaste("hello world"))

    expect(onPaste).toHaveBeenCalledTimes(1)
    expect(onPaste).toHaveBeenCalledWith("hello world")
  })

  test("PC-02: multiple pastes each trigger the callback", () => {
    const onPaste = vi.fn()

    function App() {
      usePasteCallback(onPaste)
      return <Text>ready</Text>
    }

    const render = createRenderer({ cols: 40, rows: 5 })
    const app = render(<App />)

    app.stdin.write(bracketedPaste("first"))
    app.stdin.write(bracketedPaste("second"))
    app.stdin.write(bracketedPaste("third"))

    expect(onPaste).toHaveBeenCalledTimes(3)
    expect(onPaste).toHaveBeenNthCalledWith(1, "first")
    expect(onPaste).toHaveBeenNthCalledWith(2, "second")
    expect(onPaste).toHaveBeenNthCalledWith(3, "third")
  })

  test("PC-03: paste preserves special characters (newlines, tabs, ANSI)", () => {
    const onPaste = vi.fn()

    function App() {
      usePasteCallback(onPaste)
      return <Text>ready</Text>
    }

    const render = createRenderer({ cols: 40, rows: 5 })
    const app = render(<App />)

    const specialContent = "line1\nline2\ttabbed\x1b[31mred\x1b[0m"
    app.stdin.write(bracketedPaste(specialContent))

    expect(onPaste).toHaveBeenCalledTimes(1)
    expect(onPaste).toHaveBeenCalledWith(specialContent)
  })

  test("PC-04: latest callback is used after re-render (ref behavior)", () => {
    const calls: string[] = []

    function App() {
      const [count, setCount] = useState(0)

      usePasteCallback((text) => {
        calls.push(`${count}:${text}`)
      })

      // Force a re-render on mount to update the closure
      useEffect(() => {
        setCount(42)
      }, [])

      return <Text>count:{count}</Text>
    }

    const render = createRenderer({ cols: 40, rows: 5 })
    const app = render(<App />)

    // After mount + effect, count is 42. The ref should hold the latest closure.
    app.stdin.write(bracketedPaste("test"))

    expect(calls).toHaveLength(1)
    expect(calls[0]).toBe("42:test")
  })

  test("PC-05: cleanup on unmount stops paste delivery", () => {
    const onPaste = vi.fn()

    function App() {
      usePasteCallback(onPaste)
      return <Text>ready</Text>
    }

    const render = createRenderer({ cols: 40, rows: 5 })
    const app = render(<App />)

    // Paste works before unmount
    app.stdin.write(bracketedPaste("before"))
    expect(onPaste).toHaveBeenCalledTimes(1)

    // Unmount the component
    app.unmount()

    // After unmount, stdin.write throws (renderer is unmounted)
    expect(() => app.stdin.write(bracketedPaste("after"))).toThrow()

    // Callback was NOT called again
    expect(onPaste).toHaveBeenCalledTimes(1)
  })

  test("PC-06: useInput does NOT receive paste content as keystrokes", () => {
    const onInput = vi.fn()
    const onPaste = vi.fn()

    function App() {
      useInput((input, key) => {
        onInput(input)
      })
      usePasteCallback(onPaste)
      return <Text>ready</Text>
    }

    const render = createRenderer({ cols: 40, rows: 5 })
    const app = render(<App />)

    app.stdin.write(bracketedPaste("hello"))

    // Paste callback received it
    expect(onPaste).toHaveBeenCalledTimes(1)
    expect(onPaste).toHaveBeenCalledWith("hello")

    // useInput did NOT receive individual characters
    expect(onInput).not.toHaveBeenCalled()
  })
})

// ============================================================================
// usePasteEvents (bridge to PasteProvider)
// ============================================================================

describe("usePasteEvents", () => {
  test("PE-01: routes paste event to PasteHandler", () => {
    const receivedEvents: PasteEvent[] = []

    const handler: PasteHandler = {
      onPaste(event: PasteEvent) {
        receivedEvents.push(event)
      },
    }

    function App() {
      usePasteEvents()
      return <Text>ready</Text>
    }

    const render = createRenderer({ cols: 40, rows: 5 })
    const app = render(
      <PasteProvider handler={handler}>
        <App />
      </PasteProvider>,
    )

    // Clear any leftover internal clipboard state
    setInternalClipboard(null)

    app.stdin.write(bracketedPaste("pasted text"))

    expect(receivedEvents).toHaveLength(1)
    expect(receivedEvents[0]!.text).toBe("pasted text")
    expect(receivedEvents[0]!.source).toBe("external")
  })

  test("PE-02: no handler means silent ignore (no crash)", () => {
    function App() {
      usePasteEvents()
      return <Text>ready</Text>
    }

    const render = createRenderer({ cols: 40, rows: 5 })
    const app = render(<App />)

    // Should not throw — silently ignores paste when no PasteProvider
    expect(() => {
      app.stdin.write(bracketedPaste("orphan paste"))
    }).not.toThrow()
  })

  test("PE-03: internal paste detected when clipboard matches", () => {
    const receivedEvents: PasteEvent[] = []

    const handler: PasteHandler = {
      onPaste(event: PasteEvent) {
        receivedEvents.push(event)
      },
    }

    function App() {
      usePasteEvents()
      return <Text>ready</Text>
    }

    const render = createRenderer({ cols: 40, rows: 5 })
    const app = render(
      <PasteProvider handler={handler}>
        <App />
      </PasteProvider>,
    )

    // Simulate a prior internal copy
    setInternalClipboard({
      text: "copied internally",
      markdown: "**copied internally**",
    })

    // Paste the same text back — should be detected as internal
    app.stdin.write(bracketedPaste("copied internally"))

    expect(receivedEvents).toHaveLength(1)
    expect(receivedEvents[0]!.source).toBe("internal")
    expect(receivedEvents[0]!.data).toBeDefined()
    expect(receivedEvents[0]!.data!.markdown).toBe("**copied internally**")

    // Clean up
    setInternalClipboard(null)
  })
})

// ============================================================================
// Integration
// ============================================================================

describe("paste integration", () => {
  test("PI-01: regular keypress after paste works independently", () => {
    const onPaste = vi.fn()
    const onInput = vi.fn()

    function App() {
      usePasteCallback(onPaste)
      useInput((input) => {
        onInput(input)
      })
      return <Text>ready</Text>
    }

    const render = createRenderer({ cols: 40, rows: 5 })
    const app = render(<App />)

    // Send a paste
    app.stdin.write(bracketedPaste("pasted"))
    expect(onPaste).toHaveBeenCalledTimes(1)
    expect(onInput).not.toHaveBeenCalled()

    // Send a regular keypress
    app.stdin.write("x")
    expect(onInput).toHaveBeenCalledTimes(1)
    expect(onInput).toHaveBeenCalledWith("x")

    // Paste again
    app.stdin.write(bracketedPaste("more"))
    expect(onPaste).toHaveBeenCalledTimes(2)
    expect(onPaste).toHaveBeenLastCalledWith("more")

    // useInput was not called again (only the one regular keypress)
    expect(onInput).toHaveBeenCalledTimes(1)
  })

  test("PI-02: empty paste sequence handled gracefully", () => {
    const onPaste = vi.fn()

    function App() {
      usePasteCallback(onPaste)
      return <Text>ready</Text>
    }

    const render = createRenderer({ cols: 40, rows: 5 })
    const app = render(<App />)

    // Empty bracketed paste
    app.stdin.write(bracketedPaste(""))

    expect(onPaste).toHaveBeenCalledTimes(1)
    expect(onPaste).toHaveBeenCalledWith("")
  })

  test("PI-03: useInput onPaste option receives paste events", () => {
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

    app.stdin.write(bracketedPaste("via onPaste"))

    // useInput's onPaste option received it
    expect(pasteHandler).toHaveBeenCalledTimes(1)
    expect(pasteHandler).toHaveBeenCalledWith("via onPaste")

    // The main input handler did NOT receive it
    expect(inputHandler).not.toHaveBeenCalled()
  })

  test("PI-04: paste with multiline content delivered as single blob", () => {
    const onPaste = vi.fn()

    function App() {
      usePasteCallback(onPaste)
      return <Text>ready</Text>
    }

    const render = createRenderer({ cols: 40, rows: 5 })
    const app = render(<App />)

    const multiline = "line 1\nline 2\nline 3\nline 4"
    app.stdin.write(bracketedPaste(multiline))

    // Received as a single call with the full text
    expect(onPaste).toHaveBeenCalledTimes(1)
    expect(onPaste).toHaveBeenCalledWith(multiline)
    expect(onPaste.mock.calls[0]![0]).toContain("\n")
  })

  test("PI-05: both usePasteCallback and useInput onPaste receive paste events", () => {
    const callbackPaste = vi.fn()
    const inputPaste = vi.fn()

    function App() {
      usePasteCallback(callbackPaste)
      useInput(() => {}, {
        onPaste: inputPaste,
      })
      return <Text>ready</Text>
    }

    const render = createRenderer({ cols: 40, rows: 5 })
    const app = render(<App />)

    app.stdin.write(bracketedPaste("shared"))

    // Both hooks received the paste
    expect(callbackPaste).toHaveBeenCalledTimes(1)
    expect(callbackPaste).toHaveBeenCalledWith("shared")
    expect(inputPaste).toHaveBeenCalledTimes(1)
    expect(inputPaste).toHaveBeenCalledWith("shared")
  })
})
