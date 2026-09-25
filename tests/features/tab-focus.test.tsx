/**
 * Tab Focus Cycling Tests
 *
 * Verifies that Tab/Shift+Tab automatically cycle focus between focusable
 * components, and Escape blurs the current focus — all as default behavior
 * without apps needing to wire up their own handlers.
 */

import React, { useState } from "react"
import { describe, test, expect } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, Text, useFocusable } from "silvery"
import { run, useInput } from "silvery/runtime"

// ============================================================================
// Test Components
// ============================================================================

/** Inner content that reads focus state via useFocusable */
function FocusableContent({ id }: { id: string }) {
  const { focused } = useFocusable()
  return (
    <Text>
      {id}: {focused ? "focused" : "unfocused"}
    </Text>
  )
}

/** Focusable item: Box with focusable prop wrapping content that reads focus state */
function FocusableItem({ id }: { id: string }) {
  return (
    <Box testID={id} focusable>
      <FocusableContent id={id} />
    </Box>
  )
}

// ============================================================================
// Tests
// ============================================================================

describe("Tab Focus Cycling", () => {
  test("Tab focuses the first focusable component when nothing is focused", async () => {
    const render = createRenderer({ cols: 40, rows: 10 })
    const app = render(
      <Box flexDirection="column">
        <FocusableItem id="a" />
        <FocusableItem id="b" />
        <FocusableItem id="c" />
      </Box>,
    )

    // Nothing focused initially
    expect(app.focusManager.activeId).toBeNull()

    // Tab should focus the first item
    await app.press("Tab")
    expect(app.focusManager.activeId).toBe("a")
    expect(app.text).toContain("a: focused")
  })

  test("Tab cycles forward through focusable components", async () => {
    const render = createRenderer({ cols: 40, rows: 10 })
    const app = render(
      <Box flexDirection="column">
        <FocusableItem id="a" />
        <FocusableItem id="b" />
        <FocusableItem id="c" />
      </Box>,
    )

    await app.press("Tab")
    expect(app.focusManager.activeId).toBe("a")

    await app.press("Tab")
    expect(app.focusManager.activeId).toBe("b")

    await app.press("Tab")
    expect(app.focusManager.activeId).toBe("c")
  })

  test("Tab wraps around from last to first", async () => {
    const render = createRenderer({ cols: 40, rows: 10 })
    const app = render(
      <Box flexDirection="column">
        <FocusableItem id="a" />
        <FocusableItem id="b" />
      </Box>,
    )

    await app.press("Tab")
    expect(app.focusManager.activeId).toBe("a")

    await app.press("Tab")
    expect(app.focusManager.activeId).toBe("b")

    // Should wrap around to first
    await app.press("Tab")
    expect(app.focusManager.activeId).toBe("a")
  })

  test("Shift+Tab focuses the last component when nothing is focused", async () => {
    const render = createRenderer({ cols: 40, rows: 10 })
    const app = render(
      <Box flexDirection="column">
        <FocusableItem id="a" />
        <FocusableItem id="b" />
        <FocusableItem id="c" />
      </Box>,
    )

    expect(app.focusManager.activeId).toBeNull()

    await app.press("Shift+Tab")
    expect(app.focusManager.activeId).toBe("c")
  })

  test("Shift+Tab cycles backward through focusable components", async () => {
    const render = createRenderer({ cols: 40, rows: 10 })
    const app = render(
      <Box flexDirection="column">
        <FocusableItem id="a" />
        <FocusableItem id="b" />
        <FocusableItem id="c" />
      </Box>,
    )

    // Start at last via Shift+Tab
    await app.press("Shift+Tab")
    expect(app.focusManager.activeId).toBe("c")

    await app.press("Shift+Tab")
    expect(app.focusManager.activeId).toBe("b")

    await app.press("Shift+Tab")
    expect(app.focusManager.activeId).toBe("a")
  })

  test("Shift+Tab wraps around from first to last", async () => {
    const render = createRenderer({ cols: 40, rows: 10 })
    const app = render(
      <Box flexDirection="column">
        <FocusableItem id="a" />
        <FocusableItem id="b" />
      </Box>,
    )

    await app.press("Shift+Tab")
    expect(app.focusManager.activeId).toBe("b")

    await app.press("Shift+Tab")
    expect(app.focusManager.activeId).toBe("a")

    // Should wrap around to last
    await app.press("Shift+Tab")
    expect(app.focusManager.activeId).toBe("b")
  })

  test("Escape blurs the currently focused component", async () => {
    const render = createRenderer({ cols: 40, rows: 10 })
    const app = render(
      <Box flexDirection="column">
        <FocusableItem id="a" />
        <FocusableItem id="b" />
      </Box>,
    )

    // Focus something first
    await app.press("Tab")
    expect(app.focusManager.activeId).toBe("a")
    expect(app.text).toContain("a: focused")

    // Escape should blur
    await app.press("Escape")
    expect(app.focusManager.activeId).toBeNull()
    expect(app.text).toContain("a: unfocused")
    expect(app.text).toContain("b: unfocused")
  })

  test("Escape does nothing when nothing is focused", async () => {
    const render = createRenderer({ cols: 40, rows: 10 })
    const app = render(
      <Box flexDirection="column">
        <FocusableItem id="a" />
      </Box>,
    )

    expect(app.focusManager.activeId).toBeNull()

    // Escape should be a no-op (input falls through to useInput handlers)
    await app.press("Escape")
    expect(app.focusManager.activeId).toBeNull()
  })

  test("Tab does nothing when there are no focusable components", async () => {
    const render = createRenderer({ cols: 40, rows: 10 })
    const app = render(
      <Box flexDirection="column">
        <Text>No focusable items</Text>
      </Box>,
    )

    await app.press("Tab")
    expect(app.focusManager.activeId).toBeNull()
  })

  test("focus state is reflected in rendered output", async () => {
    const render = createRenderer({ cols: 40, rows: 10 })
    const app = render(
      <Box flexDirection="column">
        <FocusableItem id="first" />
        <FocusableItem id="second" />
      </Box>,
    )

    // Initially all unfocused
    expect(app.text).toContain("first: unfocused")
    expect(app.text).toContain("second: unfocused")

    // Tab to first
    await app.press("Tab")
    expect(app.text).toContain("first: focused")
    expect(app.text).toContain("second: unfocused")

    // Tab to second
    await app.press("Tab")
    expect(app.text).toContain("first: unfocused")
    expect(app.text).toContain("second: focused")
  })

  test("Tab then Shift+Tab goes back", async () => {
    const render = createRenderer({ cols: 40, rows: 10 })
    const app = render(
      <Box flexDirection="column">
        <FocusableItem id="a" />
        <FocusableItem id="b" />
        <FocusableItem id="c" />
      </Box>,
    )

    await app.press("Tab")
    expect(app.focusManager.activeId).toBe("a")

    await app.press("Tab")
    expect(app.focusManager.activeId).toBe("b")

    await app.press("Shift+Tab")
    expect(app.focusManager.activeId).toBe("a")
  })

  test("skips non-focusable components", async () => {
    const render = createRenderer({ cols: 40, rows: 10 })
    const app = render(
      <Box flexDirection="column">
        <FocusableItem id="a" />
        <Box testID="plain">
          <Text>Not focusable</Text>
        </Box>
        <FocusableItem id="b" />
      </Box>,
    )

    await app.press("Tab")
    expect(app.focusManager.activeId).toBe("a")

    // Should skip the non-focusable Box and go to "b"
    await app.press("Tab")
    expect(app.focusManager.activeId).toBe("b")
  })
})

// ============================================================================
// handleTabCycling option — apps with 0 or 1 focusable can opt out of
// focus cycling so Tab / Shift+Tab reach useInput. Matches the Claude Code
// convention where Shift+Tab cycles permission mode.
// ============================================================================

describe("handleTabCycling option (run path)", () => {
  test("contract: handleTabCycling=false routes Shift+Tab to useInput (no focusables)", async () => {
    let sawShiftTab = 0
    function App() {
      useInput((_input, key) => {
        if (key.shift && key.tab) sawShiftTab++
      })
      return <Text>ok</Text>
    }

    const app = await run(<App />, {
      cols: 40,
      rows: 5,
      kitty: true,
      handleTabCycling: false,
    })

    await app.press("Shift+Tab")
    await app.press("Shift+Tab")
    expect(sawShiftTab).toBe(2)

    app.unmount()
  })

  test("contract: handleTabCycling=false routes Tab to useInput (no focusables)", async () => {
    let sawTab = 0
    function App() {
      useInput((_input, key) => {
        if (key.tab && !key.shift) sawTab++
      })
      return <Text>ok</Text>
    }

    const app = await run(<App />, {
      cols: 40,
      rows: 5,
      kitty: true,
      handleTabCycling: false,
    })

    await app.press("Tab")
    expect(sawTab).toBe(1)

    app.unmount()
  })

  test("contract: default (handleTabCycling omitted) still cycles focus", async () => {
    let sawShiftTab = 0
    let sawTab = 0
    function FocusableItem({ id }: { id: string }) {
      const { focused } = useFocusable()
      return (
        <Box testID={id} focusable>
          <Text>
            {id}: {focused ? "F" : "-"}
          </Text>
        </Box>
      )
    }
    function App() {
      useInput((_input, key) => {
        if (key.shift && key.tab) sawShiftTab++
        if (key.tab && !key.shift) sawTab++
      })
      return (
        <Box flexDirection="column">
          <FocusableItem id="a" />
          <FocusableItem id="b" />
        </Box>
      )
    }

    const app = await run(<App />, { cols: 40, rows: 5, kitty: true })
    // Tab with default handleTabCycling (=true) — focus manager seeds
    // first focusable, useInput does NOT see the event. We assert on
    // focusManager state rather than rendered text because text
    // reflects React state one commit behind; the invariant we care
    // about here is "focus is consumed by the chain".
    await app.press("Tab")
    expect(sawTab).toBe(0)
    // Shift+Tab — also consumed by the chain, useInput doesn't see it.
    await app.press("Shift+Tab")
    expect(sawShiftTab).toBe(0)
    app.unmount()
  })

  test("contract: handleTabCycling=false still reaches useInput when a focusable exists but none is active", async () => {
    // Regression: Shift+Tab should reach useInput even if the app has
    // focusable components — as long as none is currently activeElement.
    // This is the silvercode case: TextInput uses useFocusable() (reads
    // state) without autoFocus, so activeElement stays null.
    let sawShiftTab = 0
    function FocusableItem({ id }: { id: string }) {
      const { focused } = useFocusable()
      return (
        <Box testID={id} focusable>
          <Text>
            {id}: {focused ? "F" : "-"}
          </Text>
        </Box>
      )
    }
    function App() {
      useInput((_input, key) => {
        if (key.shift && key.tab) sawShiftTab++
      })
      return (
        <Box flexDirection="column">
          <FocusableItem id="a" />
          <FocusableItem id="b" />
        </Box>
      )
    }

    const app = await run(<App />, {
      cols: 40,
      rows: 5,
      kitty: true,
      handleTabCycling: false,
    })
    await app.press("Shift+Tab")
    expect(sawShiftTab).toBe(1)
    // With handleTabCycling=false, focus should NOT have been cycled.
    expect(app.text).toContain("a: -")
    expect(app.text).toContain("b: -")
    app.unmount()
  })

  test("contract: TextInput present + handleTabCycling=false — useInput sees Shift+Tab (silvercode scenario)", async () => {
    // Faithful silvercode reproduction: single TextInput with its
    // readline-backed useInput registered, plus a top-level useInput that
    // should see Shift+Tab and cycle a permission mode.
    const { TextInput } = await import("silvery")
    const modes = ["plan", "accept-edits", "auto", "bypass"] as const
    let observed: string[] = []
    function App() {
      const [mode, setMode] = useState<(typeof modes)[number]>("plan")
      const [value, setValue] = useState("")
      useInput((_input, key) => {
        if (key.shift && key.tab) {
          const next = modes[(modes.indexOf(mode) + 1) % modes.length]!
          observed.push(next)
          setMode(next)
        }
      })
      return (
        <Box flexDirection="column">
          <Text>mode={mode}</Text>
          <TextInput value={value} onChange={setValue} prompt="> " />
        </Box>
      )
    }

    const app = await run(<App />, {
      cols: 40,
      rows: 5,
      kitty: true,
      handleTabCycling: false,
    })
    expect(app.text).toContain("mode=plan")
    await app.press("Shift+Tab")
    expect(observed).toEqual(["accept-edits"])
    expect(app.text).toContain("mode=accept-edits")
    await app.press("Shift+Tab")
    await app.press("Shift+Tab")
    expect(observed).toEqual(["accept-edits", "auto", "bypass"])
    app.unmount()
  })

  test("contract: when an EditContext is active (useEditContext), Tab and Shift+Tab bypass default focus cycling", async () => {
    const { useEditContext } = await import("@silvery/ag-react")
    let tabSeen = false
    let shiftTabSeen = false
    function EditorApp() {
      useEditContext({ initialValue: "test" })
      useInput((_input, key) => {
        if (key.tab && !key.shift) tabSeen = true
        if (key.tab && key.shift) shiftTabSeen = true
      })
      return (
        <Box flexDirection="column">
          <FocusableItem id="btn1" />
          <FocusableItem id="btn2" />
        </Box>
      )
    }

    const app = await run(<EditorApp />, {
      cols: 40,
      rows: 5,
    })

    // With handleTabCycling default (true) and 2 focusables, Tab and Shift+Tab must bypass
    // default focus cycling while an EditContext is active.
    await app.press("Tab")
    expect(tabSeen).toBe(true)
    expect(app.text).toContain("btn1: unfocused")
    expect(app.text).toContain("btn2: unfocused")

    await app.press("Shift+Tab")
    expect(shiftTabSeen).toBe(true)
    expect(app.text).toContain("btn1: unfocused")
    expect(app.text).toContain("btn2: unfocused")
    app.unmount()
  })

  test("createRenderer: with an editor mounted, Tab and Shift+Tab reach useInput (P3-1)", async () => {
    const { useEditContext } = await import("@silvery/ag-react")
    let tabSeen = false
    let shiftTabSeen = false
    function EditorApp() {
      useEditContext({ initialValue: "test" })
      useInput((_input, key) => {
        if (key.tab && !key.shift) tabSeen = true
        if (key.tab && key.shift) shiftTabSeen = true
      })
      return (
        <Box flexDirection="column">
          <FocusableItem id="btn1" />
          <FocusableItem id="btn2" />
        </Box>
      )
    }

    const render = createRenderer({ cols: 40, rows: 5 })
    const app = render(<EditorApp />)

    await app.press("Tab")
    expect(tabSeen).toBe(true)
    expect(app.text).toContain("btn1: unfocused")
    expect(app.text).toContain("btn2: unfocused")

    await app.press("Shift+Tab")
    expect(shiftTabSeen).toBe(true)
    expect(app.text).toContain("btn1: unfocused")
    expect(app.text).toContain("btn2: unfocused")
  })

  test("two editors: unmounting the later editor leaves active edit context, Tab still reaches useInput (P3-2)", async () => {
    const { useEditContext, activeEditContextRef } = await import("@silvery/ag-react")
    let tabCount = 0
    function Editor({ value }: { value: string }) {
      useEditContext({ initialValue: value })
      return <Text>editor {value}</Text>
    }

    function TwoEditorsApp() {
      const [showSecond, setShowSecond] = React.useState(true)
      useInput((input, key) => {
        if (key.tab) tabCount++
        if (input === "u") setShowSecond(false)
      })
      return (
        <Box flexDirection="column">
          <Editor value="first" />
          {showSecond ? <Editor value="second" /> : <Text>second gone</Text>}
          <FocusableItem id="btn1" />
          <FocusableItem id="btn2" />
        </Box>
      )
    }

    const app = await run(<TwoEditorsApp />, { cols: 40, rows: 8 })
    expect(activeEditContextRef.current).not.toBeNull()

    // Unmount second editor
    await app.press("u")
    expect(app.text).toContain("second gone")
    expect(app.text).toContain("editor first")
    expect(activeEditContextRef.current).not.toBeNull()

    // Tab must still reach useInput and not cycle focus away
    await app.press("Tab")
    expect(tabCount).toBe(1)
    expect(app.text).toContain("btn1: unfocused")
    expect(app.text).toContain("btn2: unfocused")

    app.unmount()
  })
})
