import { describe, expect, test } from "vitest"
import { enableMouse, disableMouse } from "@silvery/ansi"
import { parseMouseSequence } from "@silvery/ag-term/mouse"
import { createMouseEvent } from "@silvery/ag-term/mouse-events"

describe("SGR mouse coordinates", () => {
  test("mouse protocol enables SGR-Pixels only when requested", () => {
    expect(enableMouse()).toBe("\x1b[?1003h\x1b[?1006h")
    expect(enableMouse({ pixels: true })).toBe("\x1b[?1003h\x1b[?1006h\x1b[?1016h")
    expect(disableMouse()).toBe("\x1b[?1016l\x1b[?1006l\x1b[?1003l")
  })

  test("cell mode reports terminal layout x/y without physical client coordinates", () => {
    const parsed = parseMouseSequence("\x1b[<0;13;9M")

    expect(parsed).toMatchObject({
      x: 12,
      y: 8,
      coordinateMode: "cell",
      action: "down",
      button: 0,
    })
    expect(parsed).not.toHaveProperty("clientX")
    expect(parsed).not.toHaveProperty("clientY")
  })

  test("SGR-Pixels mode reports fractional layout x/y and physical client coordinates", () => {
    const parsed = parseMouseSequence("\x1b[<32;101;141M", {
      coordinateMode: "pixel",
      cellSize: { width: 8, height: 16 },
    })

    expect(parsed).toMatchObject({
      x: 12.5,
      y: 8.75,
      clientX: 100,
      clientY: 140,
      coordinateMode: "pixel",
      action: "move",
      button: 0,
    })
  })

  test("synthetic events expose layout x/y and optional physical client coordinates", () => {
    const target = { props: {}, children: [] } as never
    const parsed = parseMouseSequence("\x1b[<0;101;141M", {
      coordinateMode: "pixel",
      cellSize: { width: 8, height: 16 },
    })
    expect(parsed).not.toBeNull()

    const event = createMouseEvent("mousedown", parsed!.x, parsed!.y, target, parsed!)

    expect(event).toMatchObject({ x: 12.5, y: 8.75, clientX: 100, clientY: 140 })
  })
})
