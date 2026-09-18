/**
 * Link Hover Effects — Cmd+hover reveal state + modifier-aware mouse cursors.
 *
 * Verifies that <Link> brightens and underlines on hover by default,
 * that useModifierKeys tracks modifier state correctly, and that
 * useMouseCursor writes the correct OSC 22 escape sequences.
 */

import React, { useState } from "react"
import { describe, test, expect, vi } from "vitest"
import { createRenderer, createTermless, waitFor } from "@silvery/test"
import {
  Box,
  ChainAppContext,
  Link,
  Text,
  type ChainAppContextValue,
  useInteractionTreatment,
  useModifierKeys,
  useMouseCursor,
} from "@silvery/ag-react"
import {
  actionFill,
  cardOutline,
  customInteractionSurface,
  interactionSurfaceRecipes,
  resolveInteractionTreatment,
  textPair,
  togglePillSurface,
} from "@silvery/ag"
import { run } from "../../packages/ag-term/src/runtime/run"

// ============================================================================
// Interaction treatment recipes
// ============================================================================

describe("interaction treatment recipes", () => {
  const hovered = {
    hovered: true,
    armed: false,
    selected: false,
    focused: false,
    dropTarget: false,
  }

  test("exports the closed set of named surface recipes", () => {
    expect(Object.keys(interactionSurfaceRecipes)).toEqual([
      "surfaceHover",
      "bare",
      "neutralText",
      "accentText",
      "accentReveal",
      "accentSurface",
      "mutedAccentSurface",
      "inverseWash",
      "inverseText",
      "raisedWash",
      "raisedOverlay",
      "strongText",
      "boldReveal",
      "surfaceHoverFocused",
      "toggleGroup",
      "selectableNav",
      "dragHandle",
      "warningText",
      "cursorSurface",
    ])

    expect(resolveInteractionTreatment(hovered, "control", "accentText")).toMatchObject({
      color: "$fg-accent",
    })
    expect(resolveInteractionTreatment(hovered, "control", "inverseWash")).toMatchObject({
      backgroundColor: "$bg-inverse-hover",
    })
    expect(
      resolveInteractionTreatment(
        { ...hovered, hovered: false, selected: true },
        "control",
        "selectableNav",
      ),
    ).toMatchObject({ backgroundColor: "$bg-selected", color: "$fg-accent", bold: true })
  })

  test("parameterized recipes preserve status fills and caller text pairs", () => {
    expect(actionFill("accent", "transparent")).toEqual({
      idle: {},
      revealed: { backgroundColor: "$fg-accent", color: "$bg" },
    })
    expect(actionFill("info", "transparent")).toEqual({
      idle: {},
      revealed: { backgroundColor: "$fg-info", color: "$bg" },
    })
    expect(actionFill("warning", "inverse")).toEqual({
      idle: { backgroundColor: "$bg-inverse", color: "$fg-on-inverse" },
      revealed: { backgroundColor: "$warning", color: "$bg" },
    })
    expect(actionFill("accent", "quiet")).toEqual({
      idle: { backgroundColor: "$mutedbg", color: "$muted" },
      revealed: { backgroundColor: "$primary", color: "$bg" },
    })
    expect(actionFill("accent", "filled")).toEqual({
      idle: { backgroundColor: "$primary", color: "$bg" },
      revealed: { backgroundColor: "$accent", color: "$bg" },
    })
    expect(actionFill("accent", "selected")).toEqual({
      idle: { backgroundColor: "$fg-accent", color: "$bg" },
      revealed: { backgroundColor: "$fg-accent", color: "$bg" },
    })
    expect(actionFill("info", "selected")).toEqual({
      idle: { backgroundColor: "$fg-info", color: "$bg" },
      revealed: { backgroundColor: "$fg-info", color: "$bg" },
    })
    expect(actionFill("warning", "selected")).toEqual({
      idle: { backgroundColor: "$warning", color: "$bg" },
      revealed: { backgroundColor: "$warning", color: "$bg" },
    })
    expect(
      resolveInteractionTreatment(hovered, "control", textPair("title", "$fg-link")),
    ).toMatchObject({
      color: "$fg-link",
    })
    expect(cardOutline(false)).toEqual({
      revealed: { color: "$fg-muted" },
      pointer: "none",
    })
    expect(cardOutline(true)).toEqual({
      revealed: { color: "$fg-link-hover" },
      pointer: "revealed",
    })
    expect(resolveInteractionTreatment(hovered, "control", cardOutline(false))).toMatchObject({
      color: "$fg-muted",
      mouseCursor: undefined,
    })
    expect(resolveInteractionTreatment(hovered, "control", cardOutline(true))).toMatchObject({
      color: "$fg-link-hover",
      mouseCursor: "pointer",
    })
    expect(togglePillSurface(true, false, "$fg", "$fg-accent")).toEqual({
      idle: { color: "$fg-muted" },
      revealed: { color: "$fg" },
      pointer: "none",
    })
    expect(togglePillSurface(true, true, "$fg", "$fg-accent")).toEqual({
      idle: { color: "$fg-muted" },
      revealed: { color: "$fg-accent", backgroundColor: "$bg-surface-hover" },
      pointer: "none",
    })
    expect(togglePillSurface(false, false, "$fg", "$fg-accent")).toEqual({
      idle: { color: "$border-default" },
      revealed: { color: "$border-default" },
      pointer: "none",
    })
    expect(togglePillSurface(false, true, "$fg", "$fg-accent")).toEqual({
      idle: { color: "$border-default" },
      revealed: { color: "$fg-muted", backgroundColor: "$bg-surface-hover" },
      pointer: "none",
    })
  })

  test("preserves the audited static token families exactly", () => {
    expect(interactionSurfaceRecipes.accentText).toEqual({
      idle: { color: "$fg-muted" },
      revealed: { color: "$fg-accent" },
    })
    expect(interactionSurfaceRecipes.accentReveal).toEqual({
      revealed: { color: "$primary" },
      selected: { color: "$primary" },
    })
    expect(interactionSurfaceRecipes.boldReveal).toEqual({
      idle: { color: "$fg" },
      revealed: { color: "$fg", bold: true },
    })
    expect(interactionSurfaceRecipes.accentSurface).toEqual({
      revealed: { backgroundColor: "$bg-surface-hover", color: "$primary" },
    })
    expect(interactionSurfaceRecipes.mutedAccentSurface).toEqual({
      idle: { color: "$muted" },
      revealed: { backgroundColor: "$bg-surface-hover", color: "$primary" },
    })
    expect(interactionSurfaceRecipes.dragHandle).toEqual({
      idle: { color: "$muted", backgroundColor: "$muted" },
      revealed: { color: "$primary", backgroundColor: "$primary" },
      armed: { color: "$primary", backgroundColor: "$primary" },
    })
    expect(interactionSurfaceRecipes.warningText).toEqual({
      idle: { color: "$fg" },
      revealed: { color: "$fg-warning" },
      selected: { color: "$fg-warning" },
    })
    expect(interactionSurfaceRecipes.cursorSurface).toEqual({
      revealed: { backgroundColor: "$bg-cursor" },
      selected: { backgroundColor: "$bg-cursor" },
    })
  })

  test("regional gutters follow the full focused-selected-armed precedence", () => {
    const treatment = resolveInteractionTreatment(
      { ...hovered, focused: true, selected: true, armed: true },
      "region",
      customInteractionSurface({
        idle: { gutterColor: "idle" },
        revealed: { gutterColor: "revealed" },
        focused: { gutterColor: "focused" },
        selected: { gutterColor: "selected" },
        armed: { gutterColor: "armed" },
      }),
    )

    expect(treatment.gutterColor).toBe("armed")
    expect(
      resolveInteractionTreatment(
        { ...hovered, hovered: false, selected: true },
        "region",
        customInteractionSurface({
          idle: { gutterColor: "idle" },
          selected: { gutterColor: "selected" },
        }),
      ).gutterColor,
    ).toBe("selected")
  })

  test("surface pointer policy defaults to revealed and supports none", () => {
    expect(
      resolveInteractionTreatment(hovered, "control", customInteractionSurface({})).mouseCursor,
    ).toBe("pointer")
    expect(
      resolveInteractionTreatment(
        { ...hovered, armed: true },
        "control",
        customInteractionSurface({ pointer: "none" }),
      ).mouseCursor,
    ).toBeUndefined()
  })

  test("retains an explicit escape for caller-computed dynamic treatments", () => {
    const dynamic = customInteractionSurface({
      idle: { color: "$fg-muted" },
      revealed: { color: "$fg-success" },
    })

    expect(resolveInteractionTreatment(hovered, "content-link", dynamic)).toMatchObject({
      color: "$fg-success",
      reveal: "cmd-hover",
    })
  })
})

describe("useInteractionTreatment content-link policy", () => {
  test("plain hover stays idle until Super/Cmd is held", async () => {
    function ContentLinkTreatment() {
      const interaction = useInteractionTreatment(
        "content-link",
        textPair("$fg-muted", "$fg-success"),
      )
      return (
        <Text
          color={interaction.treatment.color}
          onMouseEnter={interaction.onMouseEnter}
          onMouseLeave={interaction.onMouseLeave}
        >
          Hook link
        </Text>
      )
    }

    const renderer = createRenderer({ cols: 30, rows: 3, kittyMode: true })
    const app = renderer(<ContentLinkTreatment />)
    const column = app.text.indexOf("Hook link")
    const idle = app.cell(column, 0).fg

    await app.hover(column, 0)
    expect(app.cell(column, 0).fg).toEqual(idle)

    await app.keyDown("Super")
    expect(app.cell(column, 0).fg).not.toEqual(idle)
    await app.keyUp("Super")
  })
})

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
  test("action-only links suppress an inherited OSC 8 destination", () => {
    const render = createRenderer({ cols: 40, rows: 5 })
    const app = render(
      <Link href="https://ancestor.example">
        <Link onClick={() => {}}>Action</Link>
      </Link>,
    )
    const column = app.text.indexOf("Action")

    expect(app.term.cell(column, 0).hyperlink).toBeUndefined()
    expect(app.ansi).not.toContain("https://ancestor.example")
    expect(app.ansi).not.toContain("silvery:hyperlink-clear")
  })

  test("supports app-owned actions without painting an OSC 8 destination", async () => {
    const onClick = vi.fn()
    const emit = vi.fn()
    const chain = {
      input: { register: () => () => {}, setActive: () => {} },
      paste: { register: () => () => {} },
      rawKeys: { register: () => () => {} },
      focusEvents: { register: () => () => {} },
      events: { on: () => () => {}, emit },
    } as ChainAppContextValue
    const render = createRenderer({ cols: 40, rows: 5 })
    const app = render(
      <ChainAppContext.Provider value={chain}>
        <Link onClick={onClick}>Action</Link>
      </ChainAppContext.Provider>,
    )
    const column = app.text.indexOf("Action")

    expect(app.term.cell(column, 0).hyperlink).toBeUndefined()
    await app.hover(column, 0)
    await app.click(column, 0)

    expect(onClick).toHaveBeenCalledTimes(1)
    expect(emit).not.toHaveBeenCalled()
  })

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
    expect(cell.hyperlink).toBe("https://example.com")
    expect(app.ansi).toContain("https://example.com")
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

  test("forwards ...rest TextProps (bold, italic)", () => {
    const render = createRenderer({ cols: 40, rows: 5 })
    const app = render(
      <Box>
        <Link href="https://example.com" bold italic>
          Styled
        </Link>
      </Box>,
    )

    const col = app.text.indexOf("Styled")
    const cell = app.term.cell(col, 0)
    expect(cell.attrs.bold).toBe(true)
    expect(cell.attrs.italic).toBe(true)
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
// Role-derived reveal
// ============================================================================

describe("Link role-derived reveal", () => {
  test("action-only links brighten and underline on plain hover", async () => {
    const render = createRenderer({ cols: 40, rows: 5 })
    const app = render(
      <Box flexDirection="column">
        <Link onClick={() => {}}>Hover Link</Link>
        <Text>Other</Text>
      </Box>,
    )

    const col = app.text.indexOf("Hover Link")
    const idleForeground = app.cell(col, 0).fg
    await app.hover(col, 0)

    const cell = app.term.cell(col, 0)
    expect(cell.attrs.underline).toBe(true)
    expect(app.cell(col, 0).fg).not.toEqual(idleForeground)
  })

  test("plain hover repaints through the terminal runtime", async () => {
    using term = createTermless({ cols: 40, rows: 5 })
    using _handle = await run(
      <Box flexDirection="column">
        <Link href="https://example.com" role="control">
          Runtime link
        </Link>
        <Text>Other</Text>
      </Box>,
      term,
      { mouse: true, selection: false },
    )
    await waitFor(() => term.out.containsOutput("Runtime link"))

    term.out.clear()
    await React.act(async () => term.mouse.move(0, 0))

    await waitFor(() => term.out.containsOutput("Runtime link"))
    expect(term.out.getText()).toMatch(/\x1b\[[0-9;:]*4mRuntime link/u)
    expect(term.out.containsOutput("\x1b]22;pointer\x07")).toBe(true)
  })

  test("mouse leave clears armed state", async () => {
    const render = createRenderer({ cols: 40, rows: 5 })
    const app = render(
      <Box flexDirection="column">
        <Link href="https://example.com" role="control">
          Hover Link
        </Link>
        <Text>Other</Text>
      </Box>,
    )

    const col = app.text.indexOf("Hover Link")
    const idleForeground = app.cell(col, 0).fg
    await app.hover(col, 0)
    expect(app.term.cell(col, 0).attrs.underline).toBe(true)
    expect(app.cell(col, 0).fg).not.toEqual(idleForeground)

    await app.hover(0, 1)
    expect(app.term.cell(col, 0).attrs.underline).toBeFalsy()
    expect(app.cell(col, 0).fg).toEqual(idleForeground)
  })

  test.each([
    ["https://example.com", "$fg"],
    ["file:///tmp/diagram.png", "$fg-success"],
  ])(
    "URL %s uses its explicit hover color without changing its destination",
    async (href, revealColor) => {
      const render = createRenderer({ cols: 40, rows: 5 })
      const app = render(
        <Box flexDirection="column">
          <Link href={href} revealColor={revealColor} variant="link">
            Default
          </Link>
          <Text>Other</Text>
        </Box>,
      )

      const col = app.text.indexOf("Default")
      const idleForeground = app.cell(col, 0).fg
      const expected = createRenderer({ cols: 1, rows: 1 })(<Text color={revealColor}>X</Text>)
      await app.hover(col, 0)

      expect(app.cell(col, 0).fg).not.toEqual(idleForeground)
      expect(app.cell(col, 0).fg).toEqual(expected.cell(0, 0).fg)
      expect(app.term.cell(col, 0).attrs.underline).toBe(true)
      expect(app.term.cell(col, 0).hyperlink).toBe(href)

      await app.hover(0, 1)
      expect(app.cell(col, 0).fg).toEqual(idleForeground)
      expect(app.cell(col, 0).underline).toBeFalsy()
    },
  )
})

// ============================================================================
// Link Cmd+hover reveal state
// ============================================================================

describe("Link Cmd+hover reveal state", () => {
  test("plain hover underlines without changing content-link activation policy", async () => {
    const render = createRenderer({ cols: 40, rows: 5 })
    const app = render(
      <Box>
        <Link href="https://example.com">Click Me</Link>
      </Box>,
    )

    const col = app.text.indexOf("Click Me")
    const idleForeground = app.cell(col, 0).fg

    // Hover over the link
    await app.hover(col, 0)

    // Hover is visible even though opening the content link still requires Cmd.
    const cell = app.term.cell(col, 0)
    expect(cell.attrs.underline).toBe(true)
  })

  test("Cmd+hover keeps the content link underlined while arming it", async () => {
    const render = createRenderer({ cols: 40, rows: 5, kittyMode: true })
    const app = render(
      <Box>
        <Link href="https://example.com">Click Me</Link>
      </Box>,
    )

    const col = app.text.indexOf("Click Me")
    const idleForeground = app.cell(col, 0).fg

    // Hover over the link
    await app.hover(col, 0)

    // Press a key with Super held (simulates Cmd press)
    await app.press("Super+a")

    // Cmd changes activation readiness; the hover affordance stays visible.
    const cell = app.term.cell(col, 0)
    expect(cell.attrs.underline).toBe(true)
    expect(app.cell(col, 0).fg).not.toEqual(idleForeground)
  })

  test("moving mouse away clears reveal state", async () => {
    const render = createRenderer({ cols: 40, rows: 5, kittyMode: true })
    const app = render(
      <Box flexDirection="column">
        <Link href="https://example.com">Click Me</Link>
        <Text>Other content here</Text>
      </Box>,
    )

    const col = app.text.indexOf("Click Me")
    const idleForeground = app.cell(col, 0).fg

    // Hover + Cmd
    await app.hover(col, 0)
    await app.press("Super+a")
    expect(app.cell(col, 0).fg).not.toEqual(idleForeground)

    // Move to sibling (must be a real node for hitTest to produce a leave)
    await app.hover(0, 1)

    // The reveal foreground is gone when the pointer leaves.
    expect(app.cell(col, 0).fg).toEqual(idleForeground)
  })

  test("underline={false} remains false during Cmd+hover", async () => {
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

    // An explicit caller choice wins over the hover default.
    await app.hover(col, 0)
    await app.press("Super+a")
    expect(app.term.cell(col, 0).attrs.underline).toBeFalsy()
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
    const idleForeground = app.cell(col, 0).fg

    // Hover over the link
    await app.hover(col, 0)

    // Press a key with Super held (simulates Cmd press)
    await app.press("Super+a")

    expect(app.term.cell(col, 0).attrs.underline).toBe(true)
    expect(app.cell(col, 0).fg).not.toEqual(idleForeground)
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
    const idleForeground = app.cell(col, 0).fg

    // Arm the link
    await app.hover(col, 0)
    await app.press("Super+a")
    expect(app.term.cell(col, 0).attrs.underline).toBe(true)
    expect(app.cell(col, 0).fg).not.toEqual(idleForeground)

    // Move away — disarms, cursor should reset
    await app.hover(0, 1)
    expect(app.term.cell(col, 0).attrs.underline).toBeFalsy()
    expect(app.cell(col, 0).fg).toEqual(idleForeground)
  })
})
