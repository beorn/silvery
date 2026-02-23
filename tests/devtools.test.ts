/**
 * Tests for React DevTools integration.
 *
 * Since react-devtools-core is an optional dependency and not installed
 * in the test environment, these tests verify the graceful degradation
 * behavior and API surface.
 */

import { describe, expect, it, vi } from "vitest"
import { connectDevTools, isDevToolsConnected, autoConnectDevTools } from "../src/devtools.js"

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

  describe("public API surface (exported from inkx)", () => {
    it("connectDevTools is exported from inkx", async () => {
      const inkx = await import("../src/index.js")
      expect(inkx.connectDevTools).toBeDefined()
      expect(typeof inkx.connectDevTools).toBe("function")
    })

    it("isDevToolsConnected is exported from inkx", async () => {
      const inkx = await import("../src/index.js")
      expect(inkx.isDevToolsConnected).toBeDefined()
      expect(typeof inkx.isDevToolsConnected).toBe("function")
    })
  })

  describe("autoConnectDevTools (internal)", () => {
    it("autoConnectDevTools is a function", () => {
      expect(typeof autoConnectDevTools).toBe("function")
    })

    it("autoConnectDevTools is a no-op when DEBUG_DEVTOOLS is unset", async () => {
      const saved = process.env.DEBUG_DEVTOOLS
      delete process.env.DEBUG_DEVTOOLS
      try {
        // Should resolve without attempting connection
        await autoConnectDevTools()
        expect(isDevToolsConnected()).toBe(false)
      } finally {
        if (saved !== undefined) process.env.DEBUG_DEVTOOLS = saved
      }
    })

    it("autoConnectDevTools attempts connection when DEBUG_DEVTOOLS=1", async () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
      const saved = process.env.DEBUG_DEVTOOLS
      process.env.DEBUG_DEVTOOLS = "1"
      try {
        await autoConnectDevTools()
        // Still false because react-devtools-core is not installed
        expect(isDevToolsConnected()).toBe(false)
        // But it did attempt the connection (warning was logged)
        expect(warn).toHaveBeenCalled()
      } finally {
        if (saved !== undefined) {
          process.env.DEBUG_DEVTOOLS = saved
        } else {
          delete process.env.DEBUG_DEVTOOLS
        }
        warn.mockRestore()
      }
    })
  })
})
