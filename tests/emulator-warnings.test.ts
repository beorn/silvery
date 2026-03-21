/**
 * Emulator warning capture and test failure routing.
 *
 * Verifies that terminal emulator warnings (e.g., "unsupported OSC") are
 * captured as structured EmulatorWarning objects and routed to test failures
 * via the global warning registry, rather than being silently ignored.
 */
import { describe, test, expect, beforeAll, afterEach } from "vitest"
// @ts-expect-error ghostty-web is an optional dependency (only available when installed)
import { Ghostty } from "ghostty-web"
import { createGhosttyBackend, initGhostty } from "@termless/ghostty"
import { drainWarnings, clearWarnings } from "@termless/core"

let ghostty: Ghostty

beforeAll(async () => {
  ghostty = await initGhostty()
})

afterEach(() => {
  // Drain any warnings accumulated during the test so they don't
  // trip the vitest setup's afterEach warning check
  drainWarnings()
})

function createBackend(cols = 80, rows = 24) {
  const backend = createGhosttyBackend(undefined, ghostty)
  backend.init({ cols, rows })
  return backend
}

function feedText(backend: ReturnType<typeof createGhosttyBackend>, text: string): void {
  backend.feed(new TextEncoder().encode(text))
}

describe("emulator warning capture", () => {
  test("captures unsupported OSC as UNSUPPORTED_OSC warning", () => {
    const backend = createBackend()

    // OSC 66 (text sizing) — not supported by Ghostty WASM
    feedText(backend, "\x1b]66;w=2;X\x07")

    const warnings = backend.getWarnings()
    expect(warnings.length).toBeGreaterThanOrEqual(1)

    const oscWarning = warnings.find((w) => w.code === "UNSUPPORTED_OSC")
    expect(oscWarning).toBeDefined()
    expect(oscWarning!.backend).toBe("ghostty")
    expect(oscWarning!.message).toMatch(/osc/i)

    backend.destroy()
  })

  test("pushes warnings to global registry", () => {
    const backend = createBackend()
    clearWarnings()

    // Feed an unsupported OSC
    feedText(backend, "\x1b]66;w=2;X\x07")

    const globalWarnings = drainWarnings()
    expect(globalWarnings.length).toBeGreaterThanOrEqual(1)
    expect(globalWarnings.some((w) => w.code === "UNSUPPORTED_OSC")).toBe(true)

    backend.destroy()
  })

  test("clearWarnings resets backend warning list", () => {
    const backend = createBackend()

    feedText(backend, "\x1b]66;w=2;X\x07")
    expect(backend.getWarnings().length).toBeGreaterThanOrEqual(1)

    backend.clearWarnings()
    expect(backend.getWarnings()).toHaveLength(0)

    backend.destroy()
  })

  test("normal sequences produce no warnings", () => {
    const backend = createBackend()
    clearWarnings()

    // Standard sequences: text, SGR color, cursor positioning
    feedText(backend, "Hello, world!")
    feedText(backend, "\x1b[38;2;255;0;0mRed text\x1b[0m")
    feedText(backend, "\x1b[3;5HPositioned")

    expect(backend.getWarnings()).toHaveLength(0)
    expect(drainWarnings()).toHaveLength(0)

    backend.destroy()
  })

  test("warning has structured fields", () => {
    const backend = createBackend()

    feedText(backend, "\x1b]66;w=2;X\x07")

    const warnings = backend.getWarnings()
    for (const w of warnings) {
      expect(w).toHaveProperty("code")
      expect(w).toHaveProperty("message")
      expect(w).toHaveProperty("backend")
      expect(typeof w.code).toBe("string")
      expect(typeof w.message).toBe("string")
      expect(w.backend).toBe("ghostty")
    }

    backend.destroy()
  })

  test("multiple unsupported sequences accumulate separately", () => {
    const backend = createBackend()

    // Feed two different unsupported OSC sequences
    feedText(backend, "\x1b]66;w=2;A\x07")
    feedText(backend, "\x1b]66;w=2;B\x07")

    const warnings = backend.getWarnings()
    // Each feed should produce at least one warning
    expect(warnings.length).toBeGreaterThanOrEqual(2)

    backend.destroy()
  })

  test("capabilities include warnings extension", () => {
    const backend = createBackend()
    expect(backend.capabilities.extensions.has("warnings")).toBe(true)
    backend.destroy()
  })
})
