/**
 * FindFeature integration tests.
 *
 * Tests the FindFeature service wrapper and its integration with withFocus.
 */

import { describe, test, expect, vi } from "vitest"
import { createFindFeature, type FindFeature } from "../../packages/ag-term/src/find-feature"
import { createBuffer } from "../../packages/ag-term/src/buffer"
import type { TerminalBuffer } from "../../packages/ag-term/src/buffer"

// ============================================================================
// Helpers
// ============================================================================

function createTestBuffer(lines: string[]): TerminalBuffer {
  const width = Math.max(...lines.map((l) => l.length), 40)
  const height = lines.length || 10
  const buffer = createBuffer(width, height)
  for (let row = 0; row < lines.length; row++) {
    const line = lines[row]!
    for (let col = 0; col < line.length; col++) {
      buffer.setCell(col, row, { char: line[col]!, fg: null, bg: null })
    }
  }
  return buffer
}

// ============================================================================
// FindFeature state management
// ============================================================================

describe("FindFeature", () => {
  describe("state management", () => {
    test("initial state is inactive with no matches", () => {
      const buffer = createTestBuffer(["hello world"])
      const feature = createFindFeature({
        getBuffer: () => buffer,
        invalidate: vi.fn(),
      })

      expect(feature.state.active).toBe(false)
      expect(feature.state.query).toBe(null)
      expect(feature.state.matches).toEqual([])
      expect(feature.state.currentIndex).toBe(-1)

      feature.dispose()
    })

    test("open() activates find mode", () => {
      const buffer = createTestBuffer(["hello world"])
      const feature = createFindFeature({
        getBuffer: () => buffer,
        invalidate: vi.fn(),
      })

      feature.open()

      expect(feature.state.active).toBe(true)

      feature.dispose()
    })

    test("close() deactivates find mode and clears state", () => {
      const buffer = createTestBuffer(["hello world"])
      const feature = createFindFeature({
        getBuffer: () => buffer,
        invalidate: vi.fn(),
      })

      feature.open()
      feature.setQuery("hello")
      expect(feature.state.active).toBe(true)
      expect(feature.state.matches.length).toBeGreaterThan(0)

      feature.close()

      expect(feature.state.active).toBe(false)
      expect(feature.state.query).toBe(null)
      expect(feature.state.matches).toEqual([])

      feature.dispose()
    })

    test("setQuery() searches the buffer and updates matches", () => {
      const buffer = createTestBuffer(["hello world", "hello again", "goodbye"])
      const feature = createFindFeature({
        getBuffer: () => buffer,
        invalidate: vi.fn(),
      })

      feature.open()
      feature.setQuery("hello")

      expect(feature.state.matches.length).toBe(2)
      expect(feature.state.currentIndex).toBe(0)
      expect(feature.state.matches[0]).toEqual({
        row: 0,
        startCol: 0,
        endCol: 4,
      })
      expect(feature.state.matches[1]).toEqual({
        row: 1,
        startCol: 0,
        endCol: 4,
      })

      feature.dispose()
    })

    test("setQuery() with no matches results in empty matches", () => {
      const buffer = createTestBuffer(["hello world"])
      const feature = createFindFeature({
        getBuffer: () => buffer,
        invalidate: vi.fn(),
      })

      feature.open()
      feature.setQuery("xyz")

      expect(feature.state.matches.length).toBe(0)
      expect(feature.state.currentIndex).toBe(-1)

      feature.dispose()
    })

    test("next() cycles through matches", () => {
      const buffer = createTestBuffer(["aaa", "aaa", "aaa"])
      const feature = createFindFeature({
        getBuffer: () => buffer,
        invalidate: vi.fn(),
      })

      feature.open()
      feature.setQuery("aaa")

      expect(feature.state.currentIndex).toBe(0)

      feature.next()
      expect(feature.state.currentIndex).toBe(1)

      feature.next()
      expect(feature.state.currentIndex).toBe(2)

      // Wraps around
      feature.next()
      expect(feature.state.currentIndex).toBe(0)

      feature.dispose()
    })

    test("prev() cycles through matches in reverse", () => {
      const buffer = createTestBuffer(["aaa", "aaa", "aaa"])
      const feature = createFindFeature({
        getBuffer: () => buffer,
        invalidate: vi.fn(),
      })

      feature.open()
      feature.setQuery("aaa")

      expect(feature.state.currentIndex).toBe(0)

      // Wraps to end
      feature.prev()
      expect(feature.state.currentIndex).toBe(2)

      feature.prev()
      expect(feature.state.currentIndex).toBe(1)

      feature.prev()
      expect(feature.state.currentIndex).toBe(0)

      feature.dispose()
    })
  })

  describe("subscribe", () => {
    test("listeners are notified on state changes", () => {
      const buffer = createTestBuffer(["hello world"])
      const feature = createFindFeature({
        getBuffer: () => buffer,
        invalidate: vi.fn(),
      })

      const listener = vi.fn()
      const unsub = feature.subscribe(listener)

      feature.open()
      expect(listener).toHaveBeenCalledTimes(1)

      feature.setQuery("hello")
      expect(listener).toHaveBeenCalledTimes(2)

      feature.next()
      // next with only 1 match still fires
      expect(listener).toHaveBeenCalledTimes(3)

      unsub()
      feature.close()
      // After unsub, listener should not be called again
      expect(listener).toHaveBeenCalledTimes(3)

      feature.dispose()
    })

    test("dispose clears all listeners", () => {
      const buffer = createTestBuffer(["hello world"])
      const feature = createFindFeature({
        getBuffer: () => buffer,
        invalidate: vi.fn(),
      })

      const listener = vi.fn()
      feature.subscribe(listener)

      feature.open()
      expect(listener).toHaveBeenCalledTimes(1)

      feature.dispose()

      // After dispose, open should not trigger listener
      // (we can still call methods but no notifications)
      feature.open()
      expect(listener).toHaveBeenCalledTimes(1)
    })
  })

  describe("invalidate", () => {
    test("invalidate is called on state changes", () => {
      const buffer = createTestBuffer(["hello world"])
      const invalidate = vi.fn()
      const feature = createFindFeature({
        getBuffer: () => buffer,
        invalidate,
      })

      feature.open()
      expect(invalidate).toHaveBeenCalled()

      invalidate.mockClear()
      feature.setQuery("hello")
      expect(invalidate).toHaveBeenCalled()

      invalidate.mockClear()
      feature.close()
      expect(invalidate).toHaveBeenCalled()

      feature.dispose()
    })
  })

  describe("graceful null buffer handling", () => {
    test("setQuery does nothing when buffer is null", () => {
      const feature = createFindFeature({
        getBuffer: () => null,
        invalidate: vi.fn(),
      })

      feature.open()
      feature.setQuery("test")

      // Should not crash, state should remain as after open()
      expect(feature.state.active).toBe(true)
      expect(feature.state.matches).toEqual([])

      feature.dispose()
    })
  })
})
