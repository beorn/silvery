/**
 * Tests for detectScheme() — unified scheme detection orchestrator.
 */

import { describe, expect, it } from "vitest"
import {
  detectScheme,
  detectSchemeTheme,
  defaultDarkScheme,
  defaultLightScheme,
} from "@silvery/ansi"
import type { ColorScheme } from "@silvery/ansi"

describe("detectScheme — override path", () => {
  it("override skips probing and returns source=override", async () => {
    const custom: ColorScheme = { ...defaultDarkScheme, name: "my-scheme" }
    const result = await detectScheme({ override: custom })
    expect(result.source).toBe("override")
    expect(result.confidence).toBe(1)
    expect(result.scheme.name).toBe("my-scheme")
    expect(result.matchedName).toBe("my-scheme")
    expect(result.theme.fg).toBeDefined()
  })

  it("override applies enforce + wcag settings", async () => {
    const result = await detectScheme({
      override: defaultDarkScheme,
      enforce: "strict",
      wcag: true,
    })
    expect(result.theme).toBeDefined()
  })
})

describe("detectScheme — fallback path", () => {
  // Non-TTY environment in tests → detectTerminalScheme returns null → fallback
  it("returns defaultDarkScheme when probing fails and darkFallback defaults to true", async () => {
    const result = await detectScheme()
    expect(result.source).toBe("fallback")
    expect(result.confidence).toBe(0)
    expect(result.scheme.name).toBe(defaultDarkScheme.name)
  })

  it("returns defaultLightScheme when darkFallback=false", async () => {
    const result = await detectScheme({ darkFallback: false })
    expect(result.scheme.name).toBe(defaultLightScheme.name)
  })

  it("all slot sources are 'fallback' when probing fails", async () => {
    const result = await detectScheme()
    for (const [, src] of Object.entries(result.slotSources)) {
      expect(src).toBe("fallback")
    }
  })
})

describe("detectScheme — SILVERY_COLOR override", () => {
  it("SILVERY_COLOR=mono triggers override with fallback scheme", async () => {
    const original = process.env.SILVERY_COLOR
    process.env.SILVERY_COLOR = "mono"
    try {
      const result = await detectScheme()
      expect(result.source).toBe("override")
      expect(result.confidence).toBe(1)
    } finally {
      if (original === undefined) delete process.env.SILVERY_COLOR
      else process.env.SILVERY_COLOR = original
    }
  })

  it("SILVERY_COLOR=ansi16 triggers override with fallback scheme", async () => {
    const original = process.env.SILVERY_COLOR
    process.env.SILVERY_COLOR = "ansi16"
    try {
      const result = await detectScheme()
      expect(result.source).toBe("override")
    } finally {
      if (original === undefined) delete process.env.SILVERY_COLOR
      else process.env.SILVERY_COLOR = original
    }
  })

  it("SILVERY_COLOR=auto does NOT force override", async () => {
    const original = process.env.SILVERY_COLOR
    process.env.SILVERY_COLOR = "auto"
    try {
      const result = await detectScheme()
      // Non-TTY → falls through to fallback (not override)
      expect(result.source).toBe("fallback")
    } finally {
      if (original === undefined) delete process.env.SILVERY_COLOR
      else process.env.SILVERY_COLOR = original
    }
  })
})

describe("detectScheme — result shape", () => {
  it("returns DetectSchemeResult with all fields", async () => {
    const result = await detectScheme({ override: defaultDarkScheme })
    expect(result).toHaveProperty("scheme")
    expect(result).toHaveProperty("theme")
    expect(result).toHaveProperty("source")
    expect(result).toHaveProperty("confidence")
    expect(result).toHaveProperty("slotSources")
  })

  it("slotSources keys all present for override path", async () => {
    const result = await detectScheme({ override: defaultDarkScheme })
    // At least the 22 core fields should be in slotSources
    const keys = Object.keys(result.slotSources)
    expect(keys.length).toBeGreaterThanOrEqual(22)
  })
})

describe("detectSchemeTheme — shortcut", () => {
  it("returns just the theme object", async () => {
    const theme = await detectSchemeTheme({ override: defaultDarkScheme })
    expect(theme).toBeDefined()
    expect(theme.fg).toBeDefined()
    expect(theme["fg-accent"]).toBeDefined()
  })

  it("override forwarding works", async () => {
    const custom: ColorScheme = { ...defaultDarkScheme, primary: "#FF5500" }
    const theme = await detectSchemeTheme({ override: custom })
    // Accent came from the override (OKLCH-adjusted for contrast, but within 10 hue degrees)
    expect(theme["fg-accent"]).toMatch(/^#[0-9A-Fa-f]{6}$/)
  })
})
