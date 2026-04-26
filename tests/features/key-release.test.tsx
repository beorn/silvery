/**
 * Key Release & Modifier-Only Events — press/release filtering in useInput.
 *
 * Verifies that:
 * 1. Release events from Kitty protocol go to onRelease callback
 * 2. Modifier-only key events (Cmd/Shift/Ctrl/Alt alone) are filtered from useInput
 * 3. useModifierKeys still receives modifier-only events
 */

import React, { useState } from "react"
import { describe, test, expect, vi } from "vitest"
import { createRenderer, createTermless } from "@silvery/test"
import { run } from "@silvery/ag-term/runtime"
import "@termless/test/matchers"
import { Text, Box, useModifierKeys } from "@silvery/ag-react"
import { useInput } from "@silvery/ag-react"

describe("useInput onRelease", () => {
  test("onRelease fires on key release events", async () => {
    const onRelease = vi.fn()
    const onPress = vi.fn()

    function App() {
      useInput(onPress, { onRelease })
      return <Text>app</Text>
    }

    const render = createRenderer({ cols: 40, rows: 5, kittyMode: true })
    const app = render(<App />)

    // Send a Kitty release sequence for "a" (codepoint 97, modifier 1=none, eventType 3=release)
    // Format: CSI codepoint ; modifiers : eventType u
    app.stdin.write("\x1b[97;1:3u")
    await Promise.resolve()

    expect(onRelease).toHaveBeenCalledOnce()
    expect(onRelease.mock.calls[0]![0]).toBe("a")
    expect(onRelease.mock.calls[0]![1].eventType).toBe("release")
    expect(onPress).not.toHaveBeenCalled()
  })

  test("press events still go to main handler, not onRelease", async () => {
    const onRelease = vi.fn()
    const onPress = vi.fn()

    function App() {
      useInput(onPress, { onRelease })
      return <Text>app</Text>
    }

    const render = createRenderer({ cols: 40, rows: 5, kittyMode: true })
    const app = render(<App />)

    // Send a Kitty press sequence for "a" (codepoint 97, modifier 1=none, eventType 1=press)
    app.stdin.write("\x1b[97;1:1u")
    await Promise.resolve()

    expect(onPress).toHaveBeenCalledOnce()
    expect(onRelease).not.toHaveBeenCalled()
  })

  test("release events are silently dropped when no onRelease provided", async () => {
    const onPress = vi.fn()

    function App() {
      useInput(onPress)
      return <Text>app</Text>
    }

    const render = createRenderer({ cols: 40, rows: 5, kittyMode: true })
    const app = render(<App />)

    // Send release — should be silently dropped
    app.stdin.write("\x1b[97;1:3u")
    await Promise.resolve()

    expect(onPress).not.toHaveBeenCalled()
  })

  test("onRelease receives correct key metadata", async () => {
    const onRelease = vi.fn()

    function App() {
      useInput(() => {}, { onRelease })
      return <Text>app</Text>
    }

    const render = createRenderer({ cols: 40, rows: 5, kittyMode: true })
    const app = render(<App />)

    // Send Shift+a release (codepoint 97, modifier 2=shift+1, eventType 3=release)
    app.stdin.write("\x1b[97;2:3u")
    await Promise.resolve()

    expect(onRelease).toHaveBeenCalledOnce()
    const key = onRelease.mock.calls[0]![1]
    expect(key.eventType).toBe("release")
    expect(key.shift).toBe(true)
  })

  test("onRelease integrates with component state", async () => {
    function App() {
      const [held, setHeld] = useState(false)

      useInput(
        (_input, key) => {
          if (key.eventType === "press") setHeld(true)
        },
        {
          onRelease: () => {
            setHeld(false)
          },
        },
      )

      return <Text>{held ? "HELD" : "IDLE"}</Text>
    }

    const render = createRenderer({ cols: 40, rows: 5, kittyMode: true })
    const app = render(<App />)

    expect(app.text).toContain("IDLE")

    // Press "a"
    app.stdin.write("\x1b[97;1:1u")
    await Promise.resolve()
    expect(app.text).toContain("HELD")

    // Release "a"
    app.stdin.write("\x1b[97;1:3u")
    await Promise.resolve()
    expect(app.text).toContain("IDLE")
  })

  test("isActive=false disables onRelease too", async () => {
    const onRelease = vi.fn()

    function App() {
      useInput(() => {}, { onRelease, isActive: false })
      return <Text>app</Text>
    }

    const render = createRenderer({ cols: 40, rows: 5, kittyMode: true })
    const app = render(<App />)

    app.stdin.write("\x1b[97;1:3u")
    await Promise.resolve()

    expect(onRelease).not.toHaveBeenCalled()
  })
})

// ============================================================================
// Modifier-only key filtering
// ============================================================================

describe("modifier-only key filtering", () => {
  test("pressing Cmd alone does NOT fire useInput handler", async () => {
    const handler = vi.fn()

    function App() {
      useInput(handler)
      return <Text>app</Text>
    }

    const render = createRenderer({ cols: 40, rows: 5, kittyMode: true })
    const app = render(<App />)

    // leftsuper press: codepoint 57444, modifier 9 (super=8 + 1), eventType 1=press
    app.stdin.write("\x1b[57444;9:1u")
    await Promise.resolve()

    expect(handler).not.toHaveBeenCalled()
  })

  test("pressing Shift alone does NOT fire useInput handler", async () => {
    const handler = vi.fn()

    function App() {
      useInput(handler)
      return <Text>app</Text>
    }

    const render = createRenderer({ cols: 40, rows: 5, kittyMode: true })
    const app = render(<App />)

    // leftshift press: codepoint 57441, modifier 2 (shift=1 + 1), eventType 1=press
    app.stdin.write("\x1b[57441;2:1u")
    await Promise.resolve()

    expect(handler).not.toHaveBeenCalled()
  })

  test("Cmd+a still fires useInput (modifier + regular key)", async () => {
    const handler = vi.fn()

    function App() {
      useInput(handler)
      return <Text>app</Text>
    }

    const render = createRenderer({ cols: 40, rows: 5, kittyMode: true })
    const app = render(<App />)

    // "a" with super modifier: codepoint 97, modifier 9 (super=8 + 1)
    app.stdin.write("\x1b[97;9u")
    await Promise.resolve()

    expect(handler).toHaveBeenCalledOnce()
    expect(handler.mock.calls[0]![1].super).toBe(true)
  })

  test("useModifierKeys tracks Cmd even though useInput filters it", async () => {
    function App() {
      const mods = useModifierKeys()
      return <Text>super={String(mods.super)}</Text>
    }

    const render = createRenderer({ cols: 40, rows: 5, kittyMode: true })
    const app = render(<App />)

    expect(app.text).toContain("super=false")

    // leftsuper press: codepoint 57444, modifier 9 (super=8 + 1), eventType 1=press
    app.stdin.write("\x1b[57444;9:1u")
    await Promise.resolve()

    expect(app.text).toContain("super=true")
  })

  test("Shift+z via REPORT_ALL_KEYS produces uppercase input", async () => {
    const handler = vi.fn()

    function App() {
      useInput(handler)
      return <Text>app</Text>
    }

    const render = createRenderer({ cols: 40, rows: 5, kittyMode: true })
    const app = render(<App />)

    // REPORT_ALL_KEYS sends Shift+z as: codepoint 122 ('z'), modifier 2 (shift+1)
    // Kitty protocol: shifted letters get uppercase input to match legacy terminal behavior,
    // since many components check `input === "G"` directly.
    app.stdin.write("\x1b[122;2u")
    await Promise.resolve()

    expect(handler).toHaveBeenCalledOnce()
    const [input, key] = handler.mock.calls[0]!
    expect(input).toBe("Z") // Uppercase — matches legacy terminal behavior
    expect(key.shift).toBe(true)
  })

  test("modifier release clears useModifierKeys state", async () => {
    function App() {
      const mods = useModifierKeys()
      return <Text>super={String(mods.super)}</Text>
    }

    const render = createRenderer({ cols: 40, rows: 5, kittyMode: true })
    const app = render(<App />)

    // Press Cmd
    app.stdin.write("\x1b[57444;9:1u")
    await Promise.resolve()
    expect(app.text).toContain("super=true")

    // Release Cmd: codepoint 57444, modifier 1 (no modifiers after release), eventType 3=release
    app.stdin.write("\x1b[57444;1:3u")
    await Promise.resolve()
    expect(app.text).toContain("super=false")
  })
})

// ============================================================================
// run.tsx useInput — the simplified version exported from silvery/runtime
// Must also filter release events (bug: double-keypress in examples)
// ============================================================================

// The simplified useInput from run.tsx (same as silvery/runtime) — must also filter releases
import { useInput as useInputSimple } from "../../packages/ag-term/src/runtime/run"

describe("run.tsx useInput release filtering", () => {
  test("release events are filtered from run.tsx useInput", async () => {
    const handler = vi.fn()

    function App() {
      useInputSimple(handler)
      return <Text>app</Text>
    }

    const render = createRenderer({ cols: 40, rows: 5, kittyMode: true })
    const app = render(<App />)

    // Send press for "j" (codepoint 106, modifier 1=none, eventType 1=press)
    app.stdin.write("\x1b[106;1:1u")
    await Promise.resolve()

    // Send release for "j" (eventType 3=release)
    app.stdin.write("\x1b[106;1:3u")
    await Promise.resolve()

    // Handler should fire exactly once (press only, not release)
    expect(handler).toHaveBeenCalledOnce()
    expect(handler.mock.calls[0]![0]).toBe("j")
  })

  test("single keypress produces single callback — no double-move", async () => {
    const calls: string[] = []

    function App() {
      useInputSimple((input: string) => {
        calls.push(input)
      })
      return <Text>app</Text>
    }

    const render = createRenderer({ cols: 40, rows: 5, kittyMode: true })
    const app = render(<App />)

    // Simulate Kitty protocol for a single "j" keypress:
    // press event followed by release event
    app.stdin.write("\x1b[106;1:1u") // press
    app.stdin.write("\x1b[106;1:3u") // release
    await Promise.resolve()

    expect(calls).toEqual(["j"]) // exactly one callback
  })
})

// ============================================================================
// Term.sendInput() — raw bytes through the REAL event pipeline
// ============================================================================

describe("Term.sendInput (production event pipeline)", () => {
  test("sendInput with Kitty modifier-only key updates useModifierKeys", async () => {
    function App() {
      const mods = useModifierKeys()
      return <Text>super={String(mods.super)}</Text>
    }

    using term = createTermless({ cols: 40, rows: 5 })
    const app = await run(<App />, term, { kitty: true, mouse: true })
    try {
      await expect(term.screen).toContainText("super=false")

      // Inject raw Kitty leftsuper press through the REAL pipeline:
      // term.sendInput → eventQueue → term.events() → pumpEvents → processEventBatch
      ;(term as any).sendInput("\x1b[57444;9:1u")

      // Wait for async event loop to process (pump → processEventBatch → render)
      await expect(term.screen).toContainText("super=true", { timeout: 2000 })
    } finally {
      app.unmount()
    }
  })

  test("sendInput modifier release clears state", async () => {
    function App() {
      const mods = useModifierKeys()
      return <Text>super={String(mods.super)}</Text>
    }

    using term = createTermless({ cols: 40, rows: 5 })
    const app = await run(<App />, term, { kitty: true, mouse: true })
    try {
      // Press Cmd
      ;(term as any).sendInput("\x1b[57444;9:1u")
      await expect(term.screen).toContainText("super=true", { timeout: 2000 })

      // Release Cmd
      ;(term as any).sendInput("\x1b[57444;1:3u")
      await expect(term.screen).toContainText("super=false", { timeout: 2000 })
    } finally {
      app.unmount()
    }
  })
})

// ============================================================================
// createApp/run() pipeline — verifies press() encodes modifier keys correctly
// ============================================================================

describe("useModifierKeys via createApp pipeline", () => {
  test("press('leftsuper') updates useModifierKeys via run() pipeline", async () => {
    function App() {
      const mods = useModifierKeys()
      return <Text>super={String(mods.super)}</Text>
    }

    // Use RunOptions path (not Term path) so kitty option is respected
    const app = await run(<App />, { cols: 40, rows: 5, kitty: true })

    expect(app.text).toContain("super=false")

    // press() should use keyToKittyAnsi (auto-derived from kitty: true),
    // encoding leftsuper as CSI 57444;9u (with super modifier bit)
    await app.press("leftsuper")

    expect(app.text).toContain("super=true")

    app.unmount()
  })

  test("press('leftshift') updates useModifierKeys shift state", async () => {
    function App() {
      const mods = useModifierKeys()
      return <Text>shift={String(mods.shift)}</Text>
    }

    const app = await run(<App />, { cols: 40, rows: 5, kitty: true })

    expect(app.text).toContain("shift=false")
    await app.press("leftshift")
    expect(app.text).toContain("shift=true")

    app.unmount()
  })

  test("modifier release clears state via createApp press()", async () => {
    function App() {
      const mods = useModifierKeys()
      return <Text>super={String(mods.super)}</Text>
    }

    const render = createRenderer({ cols: 40, rows: 5, kittyMode: true })
    const app = render(<App />)

    // Press Cmd
    app.stdin.write("\x1b[57444;9:1u")
    await Promise.resolve()
    expect(app.text).toContain("super=true")

    // Release Cmd: codepoint 57444, modifier 1 (no modifiers after release), eventType 3=release
    app.stdin.write("\x1b[57444;1:3u")
    await Promise.resolve()
    expect(app.text).toContain("super=false")
  })
})
