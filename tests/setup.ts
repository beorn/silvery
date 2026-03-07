/**
 * Hightea Test Setup and Utilities
 *
 * Provides test helpers for Hightea component testing.
 * Import this file in tests for common utilities.
 */

import { expect } from "vitest"

// Re-export utilities from the testing module
export { createRenderer, normalizeFrame, stripAnsi, waitFor } from "@hightea/term/testing"

// Import for local use
import { normalizeFrame } from "@hightea/term/testing"

/**
 * Create a matcher for frame content that ignores ANSI codes.
 */
export function expectFrame(actual: string | undefined) {
  const normalized = actual ? normalizeFrame(actual) : ""

  return {
    toContain(expected: string) {
      expect(normalized).toContain(expected)
    },
    toBe(expected: string) {
      expect(normalized).toBe(normalizeFrame(expected))
    },
    toMatch(pattern: RegExp) {
      expect(normalized).toMatch(pattern)
    },
    toBeEmpty() {
      expect(normalized).toBe("")
    },
  }
}

/**
 * Create a simple text component for testing.
 * Useful when you need a minimal component.
 */
export function createTextComponent(text: string) {
  // This will be implemented once we have proper React integration
  return () => text
}

/**
 * Delays execution for a specified number of milliseconds.
 * Useful for waiting for renders to complete.
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
