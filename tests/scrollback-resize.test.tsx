/**
 * Tests for inline mode scrollback resize re-emission.
 *
 * When the terminal width changes, useScrollback clears the entire terminal
 * (scrollback + screen via ED3 + ED2) and re-emits ALL frozen items at the
 * new width. This eliminates drift from terminal reflow guessing.
 *
 * Covers:
 * 1. Resize re-emits when content wraps differently at new width
 * 2. Resize re-emits even when content is identical at both widths
 * 3. No re-emission when there are no frozen items
 * 4. Clear sequence is correct (ED3 + ED2)
 * 5. resetInlineCursor is called before re-emission
 * 6. notifyScrollback is NOT called during resize (only on initial freeze)
 * 7. Normal scrollback still works after resize
 * 8. Markers are preserved during re-emission
 */

import React, { useCallback } from "react"
import { describe, expect, test, vi } from "vitest"
import { Box, Text, renderStringSync } from "../src/index.js"
import { StdoutContext, type StdoutContextValue } from "../src/context.js"
import { useScrollback } from "../src/hooks/useScrollback.js"
import { createRenderer } from "inkx/testing"

// ============================================================================
// ANSI constants (readable names for escape sequences)
// ============================================================================

/** ED3 — Erase Saved Lines (clear scrollback buffer) */
const CLEAR_SCROLLBACK = "\x1b[3J"
/** ED2 — Erase entire screen */
const CLEAR_SCREEN = "\x1b[2J"

// ============================================================================
// Helpers
// ============================================================================

interface Item {
  id: number
  text: string
  frozen: boolean
}

/** Create a mock stdout that captures writes */
function createMockStdout() {
  const writes: string[] = []
  return {
    mock: {
      write(data: string) {
        writes.push(data)
        return true
      },
    },
    writes,
    clear() {
      writes.length = 0
    },
  }
}

/**
 * Wrapper that provides a custom StdoutContext so we can mock
 * resetInlineCursor and notifyScrollback.
 */
function StdoutContextWrapper({
  children,
  resetInlineCursor,
  notifyScrollback,
}: {
  children: React.ReactNode
  resetInlineCursor?: () => void
  notifyScrollback?: (lines: number) => void
}) {
  const value: StdoutContextValue = {
    stdout: process.stdout as unknown as NodeJS.WriteStream,
    write: () => {},
    resetInlineCursor,
    notifyScrollback,
  }
  return <StdoutContext.Provider value={value}>{children}</StdoutContext.Provider>
}

/**
 * Width-dependent render function that uses renderStringSync.
 * This simulates what ScrollbackView does — content wraps differently
 * at different widths, producing different rendered strings.
 */
function renderItemAtWidth(item: Item, _index: number, width: number): string {
  return renderStringSync(
    <Box>
      <Text>
        [{item.id}] {item.text}
      </Text>
    </Box>,
    { width, plain: false },
  )
}

// ============================================================================
// Tests
// ============================================================================

describe("useScrollback resize re-emission", () => {
  test("re-emits when content wraps differently at new width", () => {
    const { mock, writes } = createMockStdout()
    const resetInlineCursor = vi.fn()
    const notifyScrollback = vi.fn()

    // Long text that wraps at narrow width but not at wide width
    const longText =
      "This is a long line of text that will definitely wrap when rendered at a narrow terminal width like 40 columns"

    function TestApp({ width }: { width: number }) {
      const items: Item[] = [{ id: 1, text: longText, frozen: true }]

      // Width-dependent render callback (recreated when width changes)
      const renderFn = useCallback((item: Item, index: number) => renderItemAtWidth(item, index, width), [width])

      const frozenCount = useScrollback(items, {
        frozen: (item) => item.frozen,
        render: renderFn,
        stdout: mock,
        width,
      })

      return <Text>frozen={frozenCount}</Text>
    }

    const render = createRenderer({ cols: 80, rows: 24 })

    // Initial render at width 80
    const app = render(
      <StdoutContextWrapper resetInlineCursor={resetInlineCursor} notifyScrollback={notifyScrollback}>
        <TestApp width={80} />
      </StdoutContextWrapper>,
    )
    expect(app.text).toContain("frozen=1")
    // Initial freeze writes the item
    expect(writes.length).toBeGreaterThan(0)
    const initialWriteCount = writes.length

    // Resize to 40 — content wraps differently
    app.rerender(
      <StdoutContextWrapper resetInlineCursor={resetInlineCursor} notifyScrollback={notifyScrollback}>
        <TestApp width={40} />
      </StdoutContextWrapper>,
    )

    // Should have re-emitted: clear sequence + new content
    expect(writes.length).toBeGreaterThan(initialWriteCount)

    // Should have called resetInlineCursor before re-emission
    expect(resetInlineCursor).toHaveBeenCalled()

    // notifyScrollback: once for initial freeze only (not on resize re-emission)
    expect(notifyScrollback).toHaveBeenCalledTimes(1)

    // The clear sequence should be in the writes
    const allOutput = writes.join("")
    expect(allOutput).toContain(CLEAR_SCROLLBACK)
    expect(allOutput).toContain(CLEAR_SCREEN)
  })

  test("re-emits even when content is identical at both widths", () => {
    const { mock, writes } = createMockStdout()
    const resetInlineCursor = vi.fn()
    const notifyScrollback = vi.fn()

    // Short text that fits at both widths — no wrapping difference
    function TestApp({ width }: { width: number }) {
      const items: Item[] = [{ id: 1, text: "Hello", frozen: true }]

      const renderFn = useCallback((item: Item, index: number) => renderItemAtWidth(item, index, width), [width])

      const frozenCount = useScrollback(items, {
        frozen: (item) => item.frozen,
        render: renderFn,
        stdout: mock,
        width,
      })

      return <Text>frozen={frozenCount}</Text>
    }

    const render = createRenderer({ cols: 80, rows: 24 })

    // Initial render at width 80
    const app = render(
      <StdoutContextWrapper resetInlineCursor={resetInlineCursor} notifyScrollback={notifyScrollback}>
        <TestApp width={80} />
      </StdoutContextWrapper>,
    )
    expect(app.text).toContain("frozen=1")

    // Resize to 40 — "Hello" renders the same at both widths, but we
    // still re-emit because the output phase would clear the visible screen
    app.rerender(
      <StdoutContextWrapper resetInlineCursor={resetInlineCursor} notifyScrollback={notifyScrollback}>
        <TestApp width={40} />
      </StdoutContextWrapper>,
    )

    // Should have re-emitted: clear + frozen item (no notifyScrollback on resize)
    expect(resetInlineCursor).toHaveBeenCalled()
    expect(notifyScrollback).toHaveBeenCalledTimes(1) // once on freeze only

    // The re-emitted content should include the clear sequence and the item
    const allOutput = writes.join("")
    expect(allOutput).toContain(CLEAR_SCROLLBACK)
    expect(allOutput).toContain(CLEAR_SCREEN)
  })

  test("skips when there are no frozen items", () => {
    const { mock, writes } = createMockStdout()
    const resetInlineCursor = vi.fn()

    function TestApp({ width }: { width: number }) {
      const items: Item[] = [{ id: 1, text: "Not frozen", frozen: false }]

      const frozenCount = useScrollback(items, {
        frozen: (item) => item.frozen,
        render: (item) => item.text,
        stdout: mock,
        width,
      })

      return <Text>frozen={frozenCount}</Text>
    }

    const render = createRenderer({ cols: 80, rows: 24 })

    const app = render(
      <StdoutContextWrapper resetInlineCursor={resetInlineCursor}>
        <TestApp width={80} />
      </StdoutContextWrapper>,
    )
    expect(app.text).toContain("frozen=0")
    expect(writes.length).toBe(0)

    // Resize
    app.rerender(
      <StdoutContextWrapper resetInlineCursor={resetInlineCursor}>
        <TestApp width={40} />
      </StdoutContextWrapper>,
    )

    // No writes, no cursor reset
    expect(writes.length).toBe(0)
    expect(resetInlineCursor).not.toHaveBeenCalled()
  })

  test("re-emits multiple frozen items on resize", () => {
    const { mock, writes, clear } = createMockStdout()
    const notifyScrollback = vi.fn()

    // Items of varying lengths — some will wrap, some won't
    const items: Item[] = [
      { id: 1, text: "Short", frozen: true },
      { id: 2, text: "A medium length text that fits at 80 but wraps at 30 columns easily", frozen: true },
      {
        id: 3,
        text: "A very long text line that will definitely wrap differently when the terminal is resized to a narrower width",
        frozen: true,
      },
    ]

    function TestApp({ width }: { width: number }) {
      const renderFn = useCallback((item: Item, index: number) => renderItemAtWidth(item, index, width), [width])

      const frozenCount = useScrollback(items, {
        frozen: (item) => item.frozen,
        render: renderFn,
        stdout: mock,
        width,
      })

      return <Text>frozen={frozenCount}</Text>
    }

    const render = createRenderer({ cols: 80, rows: 24 })

    const app = render(
      <StdoutContextWrapper notifyScrollback={notifyScrollback}>
        <TestApp width={80} />
      </StdoutContextWrapper>,
    )
    expect(app.text).toContain("frozen=3")

    // Clear initial writes to count re-emission writes
    clear()
    notifyScrollback.mockClear()

    // Resize to 30 — at least items 2 and 3 will wrap differently
    app.rerender(
      <StdoutContextWrapper notifyScrollback={notifyScrollback}>
        <TestApp width={30} />
      </StdoutContextWrapper>,
    )

    // Should have clear + re-emitted all 3 items
    const allOutput = writes.join("")
    expect(allOutput).toContain(CLEAR_SCROLLBACK)
    expect(allOutput).toContain(CLEAR_SCREEN)
    expect(allOutput).toContain("[1] Short")
    expect(allOutput).toContain("[2]")
    expect(allOutput).toContain("[3]")

    // notifyScrollback NOT called on resize (only on initial freeze, which was cleared)
    expect(notifyScrollback).toHaveBeenCalledTimes(0)
  })

  test("normal freezing still works after resize", () => {
    const { mock, writes } = createMockStdout()

    function TestApp({ items, width }: { items: Item[]; width: number }) {
      const renderFn = useCallback(
        (item: Item, index: number) => `[${item.id}] ${item.text}`,
        [], // Simple render, not width-dependent
      )

      const frozenCount = useScrollback(items, {
        frozen: (item) => item.frozen,
        render: renderFn,
        stdout: mock,
        width,
      })

      return (
        <Box flexDirection="column">
          <Text>frozen={frozenCount}</Text>
          {items.slice(frozenCount).map((item) => (
            <Text key={item.id}>{item.text}</Text>
          ))}
        </Box>
      )
    }

    const render = createRenderer({ cols: 80, rows: 24 })

    const initialItems: Item[] = [
      { id: 1, text: "First", frozen: true },
      { id: 2, text: "Second", frozen: false },
    ]

    const app = render(<TestApp items={initialItems} width={80} />)
    expect(app.text).toContain("frozen=1")

    // Resize (short text — no re-emission expected)
    app.rerender(<TestApp items={initialItems} width={60} />)

    // Now freeze the second item
    const updatedItems: Item[] = [
      { id: 1, text: "First", frozen: true },
      { id: 2, text: "Second", frozen: true },
    ]
    app.rerender(<TestApp items={updatedItems} width={60} />)
    expect(app.text).toContain("frozen=2")

    // Should have written the second item to scrollback
    const allOutput = writes.join("")
    expect(allOutput).toContain("[2] Second")
  })

  test("no width prop preserves existing behavior (no re-emission on rerender)", () => {
    const { mock, writes } = createMockStdout()

    // Without width prop, no content-change detection on resize
    function TestApp() {
      const items: Item[] = [{ id: 1, text: "Item one", frozen: true }]

      const frozenCount = useScrollback(items, {
        frozen: (item) => item.frozen,
        render: (item) => item.text,
        stdout: mock,
        // no width prop
      })

      return <Text>frozen={frozenCount}</Text>
    }

    const render = createRenderer({ cols: 80, rows: 24 })

    const app = render(<TestApp />)
    expect(app.text).toContain("frozen=1")
    const writeCountAfterFreeze = writes.length

    // Rerender (simulating what would happen on resize)
    app.rerender(<TestApp />)

    // No additional writes — width prop not provided
    expect(writes.length).toBe(writeCountAfterFreeze)
  })

  test("markers are preserved during re-emission", () => {
    const { mock, writes, clear } = createMockStdout()

    const longText = "This is a long line of text that wraps differently at narrow widths causing re-emission"

    function TestApp({ width }: { width: number }) {
      const items: Item[] = [{ id: 1, text: longText, frozen: true }]

      const renderFn = useCallback((item: Item, index: number) => renderItemAtWidth(item, index, width), [width])

      const frozenCount = useScrollback(items, {
        frozen: (item) => item.frozen,
        render: renderFn,
        stdout: mock,
        markers: true,
        width,
      })

      return <Text>frozen={frozenCount}</Text>
    }

    const render = createRenderer({ cols: 80, rows: 24 })

    const app = render(<TestApp width={80} />)
    expect(app.text).toContain("frozen=1")

    clear()

    // Resize to trigger re-emission
    app.rerender(<TestApp width={30} />)

    // Should have marker writes in the re-emission output
    const allOutput = writes.join("")
    // OSC 133 prompt start
    expect(allOutput).toContain("\x1b]133;A\x07")
    // OSC 133 command end
    expect(allOutput).toContain("\x1b]133;D;0\x07")
  })
})
