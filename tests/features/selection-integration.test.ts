/**
 * SelectionFeature integration tests.
 *
 * Tests the SelectionFeature wiring:
 * - SelectionFeature wraps headless selection machine correctly
 * - Mouse handlers update selection state
 * - Clipboard copy is triggered on mouse up
 * - Invalidation callback is called on state changes
 * - subscribe/dispose lifecycle works
 *
 * These tests use the feature directly (not through withDomEvents)
 * to verify the service layer independently.
 */

import { describe, test, expect, vi } from "vitest"
import {
  createSelectionFeature,
  type SelectionFeature,
} from "../../packages/ag-term/src/features/selection"
import type { ClipboardCapability } from "../../packages/ag-term/src/features/clipboard-capability"
import { createBuffer, type TerminalBuffer } from "../../packages/ag-term/src/buffer"

// ============================================================================
// Helpers
// ============================================================================

/** Create a buffer with text content for selection tests. */
function createTestBuffer(): TerminalBuffer {
  const buffer = createBuffer(40, 10)
  // Write "Hello World" on row 0
  const text = "Hello World"
  for (let i = 0; i < text.length; i++) {
    buffer.setCell(i, 0, { char: text[i]! })
  }
  // Write "Second Line" on row 1
  const text2 = "Second Line"
  for (let i = 0; i < text2.length; i++) {
    buffer.setCell(i, 1, { char: text2[i]! })
  }
  return buffer
}

function createMockClipboard(): ClipboardCapability & { lastCopied: string | null } {
  return {
    lastCopied: null,
    copy(text: string): void {
      this.lastCopied = text
    },
  }
}

// ============================================================================
// SelectionFeature — state management
// ============================================================================

describe("SelectionFeature — state management", () => {
  test("initial state has no selection", () => {
    const buffer = createTestBuffer()
    const feature = createSelectionFeature({
      buffer,
      invalidate: () => {},
    })

    expect(feature.state.range).toBeNull()
    expect(feature.state.selecting).toBe(false)
    expect(feature.state.source).toBeNull()

    feature.dispose()
  })

  test("mousedown starts selection", () => {
    const buffer = createTestBuffer()
    const feature = createSelectionFeature({
      buffer,
      invalidate: () => {},
    })

    feature.handleMouseDown(2, 0, false)

    expect(feature.state.selecting).toBe(true)
    expect(feature.state.source).toBe("mouse")
    expect(feature.state.range).not.toBeNull()
    expect(feature.state.range!.anchor).toEqual({ col: 2, row: 0 })

    feature.dispose()
  })

  test("mousemove extends selection range", () => {
    const buffer = createTestBuffer()
    const feature = createSelectionFeature({
      buffer,
      invalidate: () => {},
    })

    feature.handleMouseDown(0, 0, false)
    feature.handleMouseMove(5, 0)

    expect(feature.state.range!.head).toEqual({ col: 5, row: 0 })
    expect(feature.state.selecting).toBe(true)

    feature.dispose()
  })

  test("mouseup finishes selection (no longer selecting)", () => {
    const buffer = createTestBuffer()
    const feature = createSelectionFeature({
      buffer,
      invalidate: () => {},
    })

    feature.handleMouseDown(0, 0, false)
    feature.handleMouseMove(5, 0)
    feature.handleMouseUp(5, 0)

    expect(feature.state.selecting).toBe(false)
    // Range is preserved
    expect(feature.state.range).not.toBeNull()

    feature.dispose()
  })

  test("clear() removes selection", () => {
    const buffer = createTestBuffer()
    const feature = createSelectionFeature({
      buffer,
      invalidate: () => {},
    })

    feature.handleMouseDown(0, 0, false)
    feature.handleMouseMove(5, 0)
    feature.handleMouseUp(5, 0)
    feature.clear()

    expect(feature.state.range).toBeNull()
    expect(feature.state.selecting).toBe(false)

    feature.dispose()
  })

  test("setRange() programmatically sets a selection", () => {
    const buffer = createTestBuffer()
    const feature = createSelectionFeature({
      buffer,
      invalidate: () => {},
    })

    feature.setRange({
      anchor: { col: 0, row: 0 },
      head: { col: 4, row: 0 },
    })

    expect(feature.state.range).not.toBeNull()
    expect(feature.state.range!.anchor).toEqual({ col: 0, row: 0 })
    expect(feature.state.range!.head).toEqual({ col: 4, row: 0 })
    expect(feature.state.selecting).toBe(false) // setRange finishes immediately

    feature.dispose()
  })

  test("setRange(null) clears selection", () => {
    const buffer = createTestBuffer()
    const feature = createSelectionFeature({
      buffer,
      invalidate: () => {},
    })

    feature.setRange({
      anchor: { col: 0, row: 0 },
      head: { col: 4, row: 0 },
    })
    feature.setRange(null)

    expect(feature.state.range).toBeNull()

    feature.dispose()
  })
})

// ============================================================================
// SelectionFeature — clipboard integration
// ============================================================================

describe("SelectionFeature — clipboard integration", () => {
  test("mouseup copies selected text to clipboard", () => {
    const buffer = createTestBuffer()
    const clipboard = createMockClipboard()

    const feature = createSelectionFeature({
      buffer,
      clipboard,
      invalidate: () => {},
    })

    // Select "Hello" (cols 0-4, row 0)
    feature.handleMouseDown(0, 0, false)
    feature.handleMouseMove(4, 0)
    feature.handleMouseUp(4, 0)

    expect(clipboard.lastCopied).toBe("Hello")

    feature.dispose()
  })

  test("mouseup with no clipboard does not error", () => {
    const buffer = createTestBuffer()

    const feature = createSelectionFeature({
      buffer,
      // No clipboard
      invalidate: () => {},
    })

    // Select text
    feature.handleMouseDown(0, 0, false)
    feature.handleMouseMove(4, 0)

    // Should not throw
    expect(() => feature.handleMouseUp(4, 0)).not.toThrow()

    feature.dispose()
  })

  test("multi-line selection copies with newlines", () => {
    const buffer = createTestBuffer()
    const clipboard = createMockClipboard()

    const feature = createSelectionFeature({
      buffer,
      clipboard,
      invalidate: () => {},
    })

    // Select from start of row 0 to end of "Second" on row 1
    feature.handleMouseDown(0, 0, false)
    feature.handleMouseMove(5, 1)
    feature.handleMouseUp(5, 1)

    expect(clipboard.lastCopied).toContain("Hello World")
    expect(clipboard.lastCopied).toContain("\n")
    expect(clipboard.lastCopied).toContain("Second")

    feature.dispose()
  })
})

// ============================================================================
// SelectionFeature — invalidation
// ============================================================================

describe("SelectionFeature — invalidation", () => {
  test("mousedown triggers invalidate", () => {
    const buffer = createTestBuffer()
    const invalidate = vi.fn()

    const feature = createSelectionFeature({
      buffer,
      invalidate,
    })

    feature.handleMouseDown(0, 0, false)

    expect(invalidate).toHaveBeenCalled()

    feature.dispose()
  })

  test("mousemove during selection triggers invalidate", () => {
    const buffer = createTestBuffer()
    const invalidate = vi.fn()

    const feature = createSelectionFeature({
      buffer,
      invalidate,
    })

    feature.handleMouseDown(0, 0, false)
    invalidate.mockClear()

    feature.handleMouseMove(5, 0)

    expect(invalidate).toHaveBeenCalled()

    feature.dispose()
  })

  test("clear triggers invalidate when range exists", () => {
    const buffer = createTestBuffer()
    const invalidate = vi.fn()

    const feature = createSelectionFeature({
      buffer,
      invalidate,
    })

    feature.handleMouseDown(0, 0, false)
    feature.handleMouseMove(5, 0)
    feature.handleMouseUp(5, 0)
    invalidate.mockClear()

    feature.clear()

    expect(invalidate).toHaveBeenCalled()

    feature.dispose()
  })

  test("clear does not trigger invalidate when no range", () => {
    const buffer = createTestBuffer()
    const invalidate = vi.fn()

    const feature = createSelectionFeature({
      buffer,
      invalidate,
    })

    feature.clear()

    expect(invalidate).not.toHaveBeenCalled()

    feature.dispose()
  })
})

// ============================================================================
// SelectionFeature — subscribe/dispose
// ============================================================================

describe("SelectionFeature — subscribe/dispose", () => {
  test("subscribe notifies on state changes", () => {
    const buffer = createTestBuffer()
    const listener = vi.fn()

    const feature = createSelectionFeature({
      buffer,
      invalidate: () => {},
    })

    feature.subscribe(listener)
    feature.handleMouseDown(0, 0, false)

    expect(listener).toHaveBeenCalled()

    feature.dispose()
  })

  test("unsubscribe stops notifications", () => {
    const buffer = createTestBuffer()
    const listener = vi.fn()

    const feature = createSelectionFeature({
      buffer,
      invalidate: () => {},
    })

    const unsub = feature.subscribe(listener)
    unsub()

    feature.handleMouseDown(0, 0, false)

    expect(listener).not.toHaveBeenCalled()

    feature.dispose()
  })

  test("dispose clears all listeners", () => {
    const buffer = createTestBuffer()
    const listener1 = vi.fn()
    const listener2 = vi.fn()

    const feature = createSelectionFeature({
      buffer,
      invalidate: () => {},
    })

    feature.subscribe(listener1)
    feature.subscribe(listener2)
    feature.dispose()

    // Calling state change methods after dispose should not notify
    feature.handleMouseDown(0, 0, false)

    expect(listener1).not.toHaveBeenCalled()
    expect(listener2).not.toHaveBeenCalled()
  })
})
