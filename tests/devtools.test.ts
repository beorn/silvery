/**
 * Tests for React DevTools integration.
 *
 * Since react-devtools-core is an optional dependency and not installed
 * in the test environment, these tests verify the graceful degradation
 * behavior and API surface.
 */

import { describe, expect, it, vi } from "vitest"
import { connectDevTools, isDevToolsConnected } from "../src/devtools.js"

describe("devtools", () => {
  it("isDevToolsConnected returns false initially", () => {
    expect(isDevToolsConnected()).toBe(false)
  })

  it("connectDevTools returns false when react-devtools-core is not installed", async () => {
    // Suppress the expected warning
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    try {
      const result = await connectDevTools()
      expect(result).toBe(false)
      expect(isDevToolsConnected()).toBe(false)
    } finally {
      warn.mockRestore()
    }
  })

  it("connectDevTools logs a helpful warning on failure", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    try {
      await connectDevTools()
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("react-devtools-core"))
    } finally {
      warn.mockRestore()
    }
  })
})
