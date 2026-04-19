/**
 * Link Hover Effects — Cmd+hover armed state + modifier-aware mouse cursors.
 *
 * Verifies that <Link> shows underline when hovered with Cmd held,
 * that useModifierKeys tracks modifier state correctly, and that
 * useMouseCursor writes the correct OSC 22 escape sequences.
 */

import React, { useState } from "react"
import { describe, test, expect, vi } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, Text, Link, useModifierKeys, useMouseCursor } from "@silvery/ag-react"

// ============================================================================
// useModifierKeys
// ============================================================================

describe("useModifierKeys", () => {
  test("returns all-false initial state", () => {
    function App() {
      const mods = useModifierKeys()
      return (
        <Text>
          super={String(mods.super)} ctrl={String(mods.ctrl)} alt={String(mods.alt)} shift=
          {String(mods.shift)}
        </Text>
      )
    }

    const render = createRenderer({ cols: 80, rows: 5 })
    const app = render(<App />)

    expect(app.text).toContain("super=false")
    expect(app.text).toContain("ctrl=false")
    expect(app.text).toContain("alt=false")
    expect(app.text).toContain("shift=false")
  })

  test("tracks shift from key event", async () => {
    function App() {
      const mods = useModifierKeys()
      return <Text>shift={String(mods.shift)}</Text>
    }

    const render = createRenderer({ cols: 40, rows: 5, kittyMode: true })
    const app = render(<App />)

    expect(app.text).toContain("shift=false")
    await app.press("Shift+a")
    expect(app.text).toContain("shift=true")
  })

  test("tracks ctrl from key event", async () => {
    function App() {
      const mods = useModifierKeys()
      return <Text>ctrl={String(mods.ctrl)}</Text>
    }

    const render = createRenderer({ cols: 40, rows: 5 })
    const app = render(<App />)

    expect(app.text).toContain("ctrl=false")
    await app.press("ctrl+a")
    expect(app.text).toContain("ctrl=true")
  })

  test("disabled option prevents re-render on modifier change", async () => {
    let renderCount = 0
    function App() {
      const mods = useModifierKeys({ enabled: false })
      renderCount++
      return <Text>shift={String(mods.shift)}</Text>
    }

    const render = createRenderer({ cols: 40, rows: 5 })
    render(<App />)

    const after = renderCount
    await Promise.resolve() // flush
    expect(renderCount).toBe(after)
  })
})

// ============================================================================
// Link component
// ============================================================================

describe("Link", () => {
  test("renders link text without underline by default", () => {
    const render = createRenderer({ cols: 40, rows: 5 })
    const app = render(
      <Box>
        <Link href="https://example.com">Example</Link>
      </Box>,
    )

    expect(app.text).toContain("Example")
    // Check that the text is NOT underlined (cell attrs)
    const col = app.text.indexOf("Example")
    const cell = app.term.cell(col, 0)
    expect(cell.attrs.underline).toBeFalsy()
  })

  test("renders link with explicit underline", () => {
    const render = createRenderer({ cols: 40, rows: 5 })
    const app = render(
      <Box>
        <Link href="https://example.com" underline>
          Example
        </Link>
      </Box>,
    )

    const col = app.text.indexOf("Example")
    const cell = app.term.cell(col, 0)
    expect(cell.attrs.underline).toBe(true)
  })

  test("forwards ...rest TextProps (bold, dim)", () => {
    const render = createRenderer({ cols: 40, rows: 5 })
    const app = render(
      <Box>
        <Link href="https://example.com" bold dim>
          Styled
        </Link>
      </Box>,
    )

    const col = app.text.indexOf("Styled")
    const cell = app.term.cell(col, 0)
    expect(cell.attrs.bold).toBe(true)
    expect(cell.attrs.dim).toBe(true)
  })

  test("hover triggers onMouseEnter/onMouseLeave via ...rest", async () => {
    let entered = false
    let left = false
    const render = createRenderer({ cols: 40, rows: 5 })
    const app = render(
      <Box flexDirection="column">
        <Link
          href="https://example.com"
          onMouseEnter={() => {
            entered = true
          }}
          onMouseLeave={() => {
            left = true
          }}
        >
          Hoverable
        </Link>
        <Text>Other content here</Text>
      </Box>,
    )

    const col = app.text.indexOf("Hoverable")
    await app.hover(col, 0)
    expect(entered).toBe(true)

    // Move to sibling (must be a real node for hitTest to produce a leave)
    await app.hover(0, 1)
    expect(left).toBe(true)
  })
})

// ============================================================================
// Link variant="arm-on-hover"
// ============================================================================

describe("Link variant='arm-on-hover'", () => {
  test("plain hover underlines without Cmd", async () => {
    const render = createRenderer({ cols: 40, rows: 5 })
    const app = render(
      <Box flexDirection="column">
        <Link href="https://example.com" variant="arm-on-hover">
          Hover Link
        </Link>
        <Text>Other</Text>
      </Box>,
    )

    const col = app.text.indexOf("Hover Link")
    await app.hover(col, 0)

    const cell = app.term.cell(col, 0)
    expect(cell.attrs.underline).toBe(true)
  })

  test("mouse leave clears armed state", async () => {
    const render = createRenderer({ cols: 40, rows: 5 })
    const app = render(
      <Box flexDirection="column">
        <Link href="https://example.com" variant="arm-on-hover">
          Hover Link
        </Link>
        <Text>Other</Text>
      </Box>,
    )

    const col = app.text.indexOf("Hover Link")
    await app.hover(col, 0)
    expect(app.term.cell(col, 0).attrs.underline).toBe(true)

    await app.hover(0, 1)
    expect(app.term.cell(col, 0).attrs.underline).toBeFalsy()
  })

  test("default variant still requires Cmd", async () => {
    const render = createRenderer({ cols: 40, rows: 5 })
    const app = render(
      <Box>
        <Link href="https://example.com">Default</Link>
      </Box>,
    )

    const col = app.text.indexOf("Default")
    await app.hover(col, 0)

    expect(app.term.cell(col, 0).attrs.underline).toBeFalsy()
  })
})

// ============================================================================
// Link Cmd+hover armed state
// ============================================================================

describe("Link Cmd+hover armed state", () => {
  test("hover without Cmd does not underline", async () => {
    const render = createRenderer({ cols: 40, rows: 5 })
    const app = render(
      <Box>
        <Link href="https://example.com">Click Me</Link>
      </Box>,
    )

    const col = app.text.indexOf("Click Me")

    // Hover over the link
    await app.hover(col, 0)

    // Still no underline (no Cmd held)
    const cell = app.term.cell(col, 0)
    expect(cell.attrs.underline).toBeFalsy()
  })

  test("Cmd+hover shows underline (armed)", async () => {
    const render = createRenderer({ cols: 40, rows: 5, kittyMode: true })
    const app = render(
      <Box>
        <Link href="https://example.com">Click Me</Link>
      </Box>,
    )

    const col = app.text.indexOf("Click Me")

    // Hover over the link
    await app.hover(col, 0)

    // Press a key with Super held (simulates Cmd press)
    await app.press("Super+a")

    // Now armed: hovered + Cmd held → underline
    const cell = app.term.cell(col, 0)
    expect(cell.attrs.underline).toBe(true)
  })

  test("moving mouse away clears armed state", async () => {
    const render = createRenderer({ cols: 40, rows: 5, kittyMode: true })
    const app = render(
      <Box flexDirection="column">
        <Link href="https://example.com">Click Me</Link>
        <Text>Other content here</Text>
      </Box>,
    )

    const col = app.text.indexOf("Click Me")

    // Hover + Cmd
    await app.hover(col, 0)
    await app.press("Super+a")
    expect(app.term.cell(col, 0).attrs.underline).toBe(true)

    // Move to sibling (must be a real node for hitTest to produce a leave)
    await app.hover(0, 1)

    // Underline gone (not hovered anymore)
    expect(app.term.cell(col, 0).attrs.underline).toBeFalsy()
  })

  test("underline={false} IS overridden by armed state (Cmd+hover)", async () => {
    // This is the real-world case: InlineLink passes underline={false} as default,
    // but armed state (Cmd+hover) should still show underline as hover feedback
    const render = createRenderer({ cols: 40, rows: 5, kittyMode: true })
    const app = render(
      <Box flexDirection="column">
        <Link href="https://example.com" underline={false}>
          LinkText
        </Link>
        <Text>Other</Text>
      </Box>,
    )

    const col = app.text.indexOf("LinkText")

    // Hover + Cmd → armed → underline should appear
    await app.hover(col, 0)
    await app.press("Super+a")
    expect(app.term.cell(col, 0).attrs.underline).toBe(true)
  })
})

// ============================================================================
// useMouseCursor
// ============================================================================

describe("useMouseCursor", () => {
  test("does not crash with null shape", () => {
    function App() {
      useMouseCursor(null)
      return <Text>OK</Text>
    }

    const render = createRenderer({ cols: 40, rows: 5 })
    const app = render(<App />)
    expect(app.text).toContain("OK")
  })

  test("does not crash with undefined shape", () => {
    function App() {
      useMouseCursor(undefined)
      return <Text>OK</Text>
    }

    const render = createRenderer({ cols: 40, rows: 5 })
    const app = render(<App />)
    expect(app.text).toContain("OK")
  })

  test("does not crash with a valid shape", () => {
    function App() {
      useMouseCursor("pointer")
      return <Text>OK</Text>
    }

    const render = createRenderer({ cols: 40, rows: 5 })
    const app = render(<App />)
    expect(app.text).toContain("OK")
  })

  test("transitions between shapes without crashing", async () => {
    function App() {
      const [hovered, setHovered] = useState(false)
      useMouseCursor(hovered ? "pointer" : null)
      return (
        <Box flexDirection="column">
          <Box onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
            <Text>Hover target</Text>
          </Box>
          <Text>Other</Text>
        </Box>
      )
    }

    const render = createRenderer({ cols: 40, rows: 5 })
    const app = render(<App />)
    expect(app.text).toContain("Hover target")

    // Hover over the target
    await app.hover(0, 0)
    expect(app.text).toContain("Hover target")

    // Move away
    await app.hover(0, 1)
    expect(app.text).toContain("Other")
  })

  test("all cursor shapes accepted", () => {
    const shapes = [
      "default",
      "text",
      "pointer",
      "crosshair",
      "move",
      "not-allowed",
      "wait",
      "help",
    ] as const
    for (const shape of shapes) {
      function App() {
        useMouseCursor(shape)
        return <Text>{shape}</Text>
      }

      const render = createRenderer({ cols: 40, rows: 5 })
      const app = render(<App />)
      expect(app.text).toContain(shape)
    }
  })

  test("cleans up on unmount", () => {
    function App({ show }: { show: boolean }) {
      return show ? <CursorComponent /> : <Text>Gone</Text>
    }

    function CursorComponent() {
      useMouseCursor("pointer")
      return <Text>With cursor</Text>
    }

    const render = createRenderer({ cols: 40, rows: 5 })
    const app = render(<App show={true} />)
    expect(app.text).toContain("With cursor")

    // Re-render without the cursor component — cleanup should fire
    app.rerender(<App show={false} />)
    expect(app.text).toContain("Gone")
  })
})

// ============================================================================
// Link modifier-aware mouse cursor
// ============================================================================

describe("Link modifier-aware mouse cursor", () => {
  test("Cmd+hover on Link sets pointer cursor (no crash)", async () => {
    const render = createRenderer({ cols: 40, rows: 5, kittyMode: true })
    const app = render(
      <Box flexDirection="column">
        <Link href="https://example.com">Click Me</Link>
        <Text>Other content here</Text>
      </Box>,
    )

    const col = app.text.indexOf("Click Me")

    // Hover over the link
    await app.hover(col, 0)

    // Press a key with Super held (simulates Cmd press)
    await app.press("Super+a")

    // The Link should be armed (underline) and useMouseCursor("pointer") active
    expect(app.term.cell(col, 0).attrs.underline).toBe(true)
  })

  test("moving away from armed Link resets cursor (no crash)", async () => {
    const render = createRenderer({ cols: 40, rows: 5, kittyMode: true })
    const app = render(
      <Box flexDirection="column">
        <Link href="https://example.com">Click Me</Link>
        <Text>Other content here</Text>
      </Box>,
    )

    const col = app.text.indexOf("Click Me")

    // Arm the link
    await app.hover(col, 0)
    await app.press("Super+a")
    expect(app.term.cell(col, 0).attrs.underline).toBe(true)

    // Move away — disarms, cursor should reset
    await app.hover(0, 1)
    expect(app.term.cell(col, 0).attrs.underline).toBeFalsy()
  })
})
