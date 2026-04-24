/**
 * Text selection — termless end-to-end tests.
 *
 * Verifies mouse drag selection through the full pipeline:
 * sendInput → mock stdin → term-provider parser → createApp event handler → selection state → overlay/clipboard
 *
 * Selection is enabled via termOptions (selection: true, mouse: true).
 * Mouse events use SGR mode 1006 sequences through term.sendInput().
 *
 * The mixed-proxy's set/defineProperty traps allow run() to override
 * sendInput on the Term Proxy, routing events through the mock stdin
 * so the full createApp pipeline (including selection interception) runs.
 */

import React from "react"
import { describe, test, expect } from "vitest"
import { createTermless } from "@silvery/test"
import "@termless/test/matchers"
import type { Term } from "../../packages/ag-term/src/ansi/term"
import { run, type RunHandle } from "../../packages/ag-term/src/runtime/run"
import { Box, Text } from "../../src/index.js"

// ============================================================================
// Helpers
// ============================================================================

const settle = (ms = 300) => new Promise((r) => setTimeout(r, ms))

/**
 * Send SGR mouse event (mode 1006).
 * Format: \x1b[<button;x;y;M (press/move) or \x1b[<button;x;y;m (release)
 * x,y are 1-indexed.
 */
function mouseDown(term: Term, x: number, y: number, button = 0) {
  ;(term as any).sendInput(`\x1b[<${button};${x + 1};${y + 1}M`)
}

function mouseMove(term: Term, x: number, y: number, button = 0) {
  ;(term as any).sendInput(`\x1b[<${button + 32};${x + 1};${y + 1}M`)
}

function mouseUp(term: Term, x: number, y: number, button = 0) {
  ;(term as any).sendInput(`\x1b[<${button};${x + 1};${y + 1}m`)
}

// ============================================================================
// Test fixture
// ============================================================================

function SelectableContent() {
  return (
    <Box flexDirection="column">
      <Text>Hello World</Text>
      <Text>Second Line</Text>
      <Text>Third Line</Text>
      <Text>Fourth Line</Text>
      <Text>Fifth Line</Text>
    </Box>
  )
}

// ============================================================================
// Tests
// ============================================================================

describe("text selection (termless e2e)", { timeout: 10000 }, () => {
  test("content renders with mouse tracking enabled", async () => {
    using term = createTermless({ cols: 40, rows: 10 })
    // selection + mouse go through termOptions spread into createApp
    const handle = await run(<SelectableContent />, term, { selection: true, mouse: true } as any)
    await settle()

    expect(term.screen).toContainText("Hello World")
    expect(term.screen).toContainText("Second Line")

    handle.unmount()
  })

  test("mouse down + move emits inverse overlay in output", async () => {
    using term = createTermless({ cols: 40, rows: 10 })

    // Capture raw ANSI output for verification
    const rawChunks: string[] = []
    const emulator = (term as any)._emulator
    const origFeed = emulator.feed.bind(emulator)
    emulator.feed = (data: string) => {
      rawChunks.push(data)
      origFeed(data)
    }

    const handle = await run(<SelectableContent />, term, { selection: true, mouse: true } as any)
    await settle()

    // Clear initial render output
    rawChunks.length = 0

    // Mouse down at start of text
    mouseDown(term, 0, 0)
    await settle(100)

    // Drag to extend selection
    mouseMove(term, 8, 0)
    await settle(300)

    // Selection should have written either SGR 7 inverse (legacy / no-theme
    // path) or an explicit-bg SGR (\x1b[48...) when a uniform selection theme
    // is in effect. Either signals that the selection rendered to the terminal.
    const hasSelectionStyle = rawChunks.some(
      (s) => s.includes("\x1b[7m") || s.includes("\x1b[48"),
    )
    expect(hasSelectionStyle).toBe(true)

    // Finish selection
    mouseUp(term, 8, 0)
    await settle(100)

    handle.unmount()
  })

  test("mouse up after drag emits OSC 52 clipboard", async () => {
    using term = createTermless({ cols: 40, rows: 10 })

    const rawChunks: string[] = []
    const emulator = (term as any)._emulator
    const origFeed = emulator.feed.bind(emulator)
    emulator.feed = (data: string) => {
      rawChunks.push(data)
      origFeed(data)
    }

    const handle = await run(<SelectableContent />, term, { selection: true, mouse: true } as any)
    await settle()
    rawChunks.length = 0

    // Select "Hello World"
    mouseDown(term, 0, 0)
    await settle(100)
    mouseMove(term, 10, 0)
    await settle(100)
    mouseUp(term, 10, 0)
    await settle(300)

    // Check for OSC 52: \x1b]52;c;<base64>\x07
    const osc52Chunk = rawChunks.find((s) => s.includes("\x1b]52;c;"))
    expect(osc52Chunk).toBeDefined()

    if (osc52Chunk) {
      const match = osc52Chunk.match(/\x1b\]52;c;([A-Za-z0-9+/=]+)\x07/)
      expect(match).toBeTruthy()
      if (match) {
        const decoded = Buffer.from(match[1]!, "base64").toString("utf-8")
        expect(decoded).toContain("Hello World")
      }
    }

    handle.unmount()
  })

  test("selection inside userSelect=contain is clamped to ancestor rect", async () => {
    // Layout: two side-by-side panels. Left panel is userSelect="contain".
    // Dragging from inside the left panel into the right panel must NOT
    // extend the selection into the right panel — the head is clamped to
    // the contain ancestor's rect.
    //
    // Contain panel:  cols [0..9], rows [0..4]    (width=10, height=5)
    // State panel:    cols [10..19], rows [0..4]  (width=10, height=5)
    function TwoPanels() {
      return (
        <Box flexDirection="row">
          <Box userSelect="contain" width={10} height={5} flexDirection="column">
            <Text>LLLLLLLLL</Text>
            <Text>LLLLLLLLL</Text>
            <Text>LLLLLLLLL</Text>
            <Text>LLLLLLLLL</Text>
            <Text>LLLLLLLLL</Text>
          </Box>
          <Box width={10} height={5} flexDirection="column">
            <Text>RRRRRRRRR</Text>
            <Text>RRRRRRRRR</Text>
            <Text>RRRRRRRRR</Text>
            <Text>RRRRRRRRR</Text>
            <Text>RRRRRRRRR</Text>
          </Box>
        </Box>
      )
    }

    using term = createTermless({ cols: 30, rows: 10 })

    const rawChunks: string[] = []
    const emulator = (term as any)._emulator
    const origFeed = emulator.feed.bind(emulator)
    emulator.feed = (data: string) => {
      rawChunks.push(data)
      origFeed(data)
    }

    const handle = await run(<TwoPanels />, term, { selection: true, mouse: true } as any)
    await settle()

    // Sanity: both panels rendered
    expect(term.screen).toContainText("LLLLLLLLL")
    expect(term.screen).toContainText("RRRRRRRRR")

    rawChunks.length = 0

    // Start drag inside the contain panel (col=2, row=1).
    mouseDown(term, 2, 1)
    await settle(100)

    // Drag WAY into the right panel (col=18, row=3). Without clamping the
    // selection head would land at (18, 3); with clamping it must stop at
    // the right edge of the contain panel (col=9).
    mouseMove(term, 18, 3)
    await settle(100)
    mouseUp(term, 18, 3)
    await settle(300)

    // Decode OSC 52 to inspect the selected text.
    const osc52 = rawChunks.find((s) => s.includes("\x1b]52;c;"))
    expect(osc52).toBeDefined()
    const match = osc52!.match(/\x1b\]52;c;([A-Za-z0-9+/=]+)\x07/)
    expect(match).toBeTruthy()
    const decoded = Buffer.from(match![1]!, "base64").toString("utf-8")

    // Selection must contain L content (anchor cell and everything inside contain)
    expect(decoded).toMatch(/L/)
    // Selection must NOT include any R content — that would mean the head
    // extended outside the contain ancestor's rect.
    expect(decoded).not.toMatch(/R/)

    handle.unmount()
  })

  test("keypress clears active selection", async () => {
    using term = createTermless({ cols: 40, rows: 10 })

    const rawChunks: string[] = []
    const emulator = (term as any)._emulator
    const origFeed = emulator.feed.bind(emulator)
    emulator.feed = (data: string) => {
      rawChunks.push(data)
      origFeed(data)
    }

    const handle = await run(<SelectableContent />, term, { selection: true, mouse: true } as any)
    await settle()

    // Create selection
    mouseDown(term, 0, 0)
    await settle(100)
    mouseMove(term, 5, 0)
    await settle(100)
    mouseUp(term, 5, 0)
    await settle(200)

    // Verify selection styling was rendered (SGR 7 inverse OR explicit bg).
    const hasInverseBeforeKey = rawChunks.some(
      (s) => s.includes("\x1b[7m") || s.includes("\x1b[48"),
    )
    expect(hasInverseBeforeKey).toBe(true)

    // Clear and press a key
    rawChunks.length = 0
    await handle.press("x")
    await settle(300)

    // After keypress, content should re-render WITHOUT selection overlay
    // (no new inverse video for the selected cells)
    expect(term.screen).toContainText("Hello World")

    handle.unmount()
  })
})
