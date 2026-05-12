/**
 * Hover and wheel modifier-options bag — parity with click/doubleClick.
 *
 * `app.click` and `app.doubleClick` accept `{ shift, meta, ctrl, cmd, button }`
 * options that thread through `mouseState.keyboardModifiers.super` for the
 * duration of the event. `app.hover` and `app.wheel` historically did not
 * — they hardcoded shift/meta/ctrl=false and provided no override, which
 * forced consumers (the silvercode tool-call popover tests, km's
 * `apps/silvercode/src/test/ui-driver.ts` cmdHover helper) to write raw
 * Kitty CSI u modifier-press byte sequences via `app.stdin.write` before
 * issuing a hover.
 *
 * These tests pin the parity contract: the same options bag flows through
 * hover and wheel and reaches the underlying mouse handler with the
 * documented modifier flags, including `cmd` flipping the keyboard-tracked
 * Super for the duration of the synthetic event.
 *
 * Bead: @km/silvery/hover-wheel-modifier-options-parity.
 *
 * Note: this contract covers IMMEDIATE-event modifiers — Shift-hover,
 * Ctrl-wheel, etc. — where the modifier state matters at the moment the
 * mouse event fires. Held-modifier-during-dwell scenarios (e.g. the
 * Cmd-hover popover that opens after a 650 ms dwell) still need the
 * raw-byte path, because dwell is driven by `useModifierKeys` reading the
 * input store, not the mouseState bag — see
 * `tests/features/popover-cmd-hover.test.tsx` for that pattern.
 */

import React from "react"
import { describe, expect, test } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, Text } from "@silvery/ag-react"

type MouseHandlerArgs = Parameters<
  NonNullable<import("@silvery/ag/types").BoxProps["onMouseMove"]>
>[0]

describe("app.hover modifier options", () => {
  test("forwards shift/meta/ctrl flags to onMouseMove handler", async () => {
    const events: MouseHandlerArgs[] = []
    const render = createRenderer({ cols: 40, rows: 6 })
    const app = render(
      <Box flexDirection="column">
        <Box onMouseMove={(e) => events.push(e)}>
          <Text>Hover target</Text>
        </Box>
      </Box>,
    )

    await app.hover(2, 0, { shift: true })
    await app.hover(3, 0, { ctrl: true })
    await app.hover(4, 0, { meta: true })
    await app.hover(5, 0)

    expect(events.length).toBe(4)
    expect(events[0]?.shiftKey).toBe(true)
    expect(events[1]?.ctrlKey).toBe(true)
    // meta in the options bag maps to MouseEvent.altKey in the silvery
    // dispatcher (Alt = Meta in the modifier bitfield, distinct from
    // macOS Cmd which is Super and arrives via cmd:true). See
    // ParsedMouse → MouseEvent translation in mouse-events.ts.
    expect(events[2]?.altKey).toBe(true)
    expect(events[3]?.shiftKey).toBe(false)
    expect(events[3]?.ctrlKey).toBe(false)
    expect(events[3]?.altKey).toBe(false)
  })

  test("cmd flips keyboardModifiers.super for the duration of the hover", async () => {
    const events: MouseHandlerArgs[] = []
    const render = createRenderer({ cols: 40, rows: 6 })
    const app = render(
      <Box flexDirection="column">
        <Box onMouseMove={(e) => events.push(e)}>
          <Text>Hover target</Text>
        </Box>
      </Box>,
    )

    await app.hover(2, 0, { cmd: true })
    await app.hover(3, 0)

    expect(events.length).toBe(2)
    // metaKey on the dispatched MouseEvent reflects keyboardModifiers.super
    // (macOS Cmd convention). cmd:true must register; the next hover
    // without cmd must drop it.
    expect(events[0]?.metaKey).toBe(true)
    expect(events[1]?.metaKey).toBe(false)
  })

  test("omitting options preserves the legacy default (no modifiers)", async () => {
    const events: MouseHandlerArgs[] = []
    const render = createRenderer({ cols: 40, rows: 6 })
    const app = render(
      <Box flexDirection="column">
        <Box onMouseMove={(e) => events.push(e)}>
          <Text>Hover target</Text>
        </Box>
      </Box>,
    )

    await app.hover(2, 0)

    expect(events.length).toBe(1)
    expect(events[0]?.shiftKey).toBe(false)
    expect(events[0]?.ctrlKey).toBe(false)
    expect(events[0]?.altKey).toBe(false)
    expect(events[0]?.metaKey).toBe(false)
  })
})

describe("app.wheel modifier options", () => {
  test("forwards shift/meta/ctrl flags to onWheel handler", async () => {
    type WheelArgs = Parameters<NonNullable<import("@silvery/ag/types").BoxProps["onWheel"]>>[0]
    const events: WheelArgs[] = []
    const render = createRenderer({ cols: 40, rows: 6 })
    const app = render(
      <Box flexDirection="column">
        <Box onWheel={(e) => events.push(e)}>
          <Text>Scroll target</Text>
        </Box>
      </Box>,
    )

    await app.wheel(2, 0, -1, { shift: true })
    await app.wheel(2, 0, 1, { ctrl: true })

    expect(events.length).toBe(2)
    expect(events[0]?.shiftKey).toBe(true)
    expect(events[1]?.ctrlKey).toBe(true)
  })

  test("cmd flips keyboardModifiers.super for the duration of the wheel", async () => {
    type WheelArgs = Parameters<NonNullable<import("@silvery/ag/types").BoxProps["onWheel"]>>[0]
    const events: WheelArgs[] = []
    const render = createRenderer({ cols: 40, rows: 6 })
    const app = render(
      <Box flexDirection="column">
        <Box onWheel={(e) => events.push(e)}>
          <Text>Scroll target</Text>
        </Box>
      </Box>,
    )

    await app.wheel(2, 0, -1, { cmd: true })
    await app.wheel(2, 0, -1)

    expect(events.length).toBe(2)
    expect(events[0]?.metaKey).toBe(true)
    expect(events[1]?.metaKey).toBe(false)
  })
})
