/**
 * run() with terminal emulator — render into a termless backend via createTermless().
 *
 * Verifies that createTermless() creates a Term that routes ANSI output
 * to a real terminal emulator, and that handle.press() drives interaction.
 */

import React, { useEffect, useState } from "react"
import { describe, test, expect, afterEach } from "vitest"
import { createTermless } from "@silvery/test"
import "@termless/test/matchers"
import { Box, Text } from "../../src/index.js"
import { run, useInput, type RunHandle } from "../../packages/ag-term/src/runtime/run"
import { useRuntime } from "../../src/index.js"

// ============================================================================
// Test Component
// ============================================================================

function Counter() {
  const [count, setCount] = useState(0)

  useInput((input, key) => {
    if (input === "j") setCount((c) => c + 1)
    if (input === "k") setCount((c) => c - 1)
    if (key.escape) return "exit"
  })

  return (
    <Box flexDirection="column" borderStyle="round" paddingX={1}>
      <Text bold>Counter</Text>
      <Text>Count: {count}</Text>
    </Box>
  )
}

// ============================================================================
// Tests
// ============================================================================

describe("run() with createTermless()", () => {
  test("renders into termless terminal", async () => {
    using term = createTermless({ cols: 40, rows: 10 })
    const handle = await run(<Counter />, term)

    expect(term.screen).toContainText("Counter")
    expect(term.screen).toContainText("Count: 0")
    // Box borders render through real terminal emulation
    expect(term.screen!.getText()).toContain("╭")
    expect(term.screen!.getText()).toContain("╰")

    handle.unmount()
  })

  test("handle.press() triggers re-render into termless", async () => {
    using term = createTermless({ cols: 40, rows: 10 })
    const handle = await run(<Counter />, term)

    expect(term.screen).toContainText("Count: 0")

    await handle.press("j")
    expect(term.screen).toContainText("Count: 1")

    await handle.press("j")
    expect(term.screen).toContainText("Count: 2")

    await handle.press("k")
    expect(term.screen).toContainText("Count: 1")

    handle.unmount()
  })

  test("term.resize() triggers re-render at new dimensions", async () => {
    using term = createTermless({ cols: 40, rows: 10 })
    const handle = await run(<Counter />, term)

    expect(term.screen).toContainText("Counter")
    const initialText = term.screen!.getText()

    // Resize to wider terminal
    term.resize!(80, 10)
    // Wait for re-render
    await new Promise((r) => setTimeout(r, 50))

    expect(term.screen).toContainText("Counter")
    expect(term.screen).toContainText("Count: 0")
    // Box should be wider at 80 cols
    const resizedText = term.screen!.getText()
    const initialBoxLine = initialText.split("\n").find((l) => l.includes("╭"))!
    const resizedBoxLine = resizedText.split("\n").find((l) => l.includes("╭"))!
    expect(resizedBoxLine.length).toBeGreaterThan(initialBoxLine.length)

    handle.unmount()
  })

  test("exit via useInput return", async () => {
    using term = createTermless({ cols: 40, rows: 10 })
    const handle = await run(<Counter />, term)

    expect(term.screen).toContainText("Count: 0")
    await handle.press("Escape")
    // App should have exited cleanly
    await handle.waitUntilExit()
  })
})

// ============================================================================
// Alt Screen + Pause/Resume (3-layer verification: screen, terminal mode, app state)
// ============================================================================

/** Minimal app simulating console toggle via runtime.pause/resume */
function ConsoleToggleApp() {
  const [consoleOpen, setConsoleOpen] = useState(false)
  const runtime = useRuntime()

  useInput((input) => {
    if (input === "`") setConsoleOpen((prev) => !prev)
    if (input === "q") return "exit"
  })

  useEffect(() => {
    if (!consoleOpen) return
    runtime?.pause?.()
    return () => {
      runtime?.resume?.()
    }
  }, [consoleOpen])

  return (
    <Box>
      <Text>{consoleOpen ? "CONSOLE MODE" : "BOARD VIEW"}</Text>
    </Box>
  )
}

describe("run() terminal protocol setup", () => {
  test("alternateScreen enters alt screen", async () => {
    using term = createTermless({ cols: 40, rows: 10 })
    const handle = await run(<Counter />, term)

    expect(term).toBeInMode("altScreen")
    expect(term.screen).toContainText("Counter")

    handle.unmount()
  })

  test("mouse: true enables mouse tracking", async () => {
    using term = createTermless({ cols: 40, rows: 10 })
    const handle = await run(<Counter />, term, { mouse: true })

    expect(term).toBeInMode("mouseTracking")

    handle.unmount()
  })

  test("bracketedPaste enabled by default", async () => {
    using term = createTermless({ cols: 40, rows: 10 })
    const handle = await run(<Counter />, term)

    expect(term).toBeInMode("bracketedPaste")

    handle.unmount()
  })
})

describe("run() pause/resume alt screen", () => {
  let handle: RunHandle

  afterEach(() => {
    handle?.unmount()
  })

  test("initial: board on alt screen", async () => {
    using term = createTermless({ cols: 40, rows: 10 })
    handle = await run(<ConsoleToggleApp />, term)

    expect(term.screen).toContainText("BOARD VIEW")
    expect(term).toBeInMode("altScreen")
  })

  test("pause leaves alt screen, resume re-enters", async () => {
    using term = createTermless({ cols: 40, rows: 10 })
    handle = await run(<ConsoleToggleApp />, term)

    await handle.press("`") // open → pause
    expect(term).not.toBeInMode("altScreen")

    await handle.press("`") // close → resume
    expect(term).toBeInMode("altScreen")
    expect(term.screen).toContainText("BOARD VIEW")
  })
})
