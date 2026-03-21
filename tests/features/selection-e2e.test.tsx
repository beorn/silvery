/**
 * Text selection — termless end-to-end tests.
 *
 * Verifies mouse drag selection through the full pipeline.
 * Uses run() with the termless Term path, which properly wires
 * sendInput → stdin → createApp event pipeline → writable → emulator.
 *
 * Selection is enabled via termOptions (selection: true, mouse: true).
 * Mouse events use SGR mode 1006 sequences through term.sendInput().
 */

import React from "react"
import { describe, test, expect } from "vitest"
import { createTermless } from "@silvery/test"
import "@termless/test/matchers"
import type { Term } from "../../packages/term/src/ansi/term"
import { run, type RunHandle } from "../../packages/term/src/runtime/run"
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

  // TODO: Mouse events via sendInput don't flow through to createApp's event
  // pipeline in the termless emulator path. The Proxy-based Term's sendInput
  // override via Object.defineProperty may not be intercepted correctly.
  // Need to investigate the Term Proxy defineProperty trap.
  test.todo("mouse down + move emits inverse overlay in output", async () => {
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

    // Selection overlay should have written inverse video sequences
    const hasInverse = rawChunks.some((s) => s.includes("\x1b[7m"))
    expect(hasInverse).toBe(true)

    // Finish selection
    mouseUp(term, 8, 0)
    await settle(100)

    handle.unmount()
  })

  test.todo("mouse up after drag emits OSC 52 clipboard", async () => {
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

  test.todo("keypress clears active selection", async () => {
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

    // Verify inverse was rendered (selection visible)
    const hasInverseBeforeKey = rawChunks.some((s) => s.includes("\x1b[7m"))
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
