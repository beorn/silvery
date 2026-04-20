/**
 * Tests for the Sterling-aware detection wrappers in @silvery/theme.
 *
 * The wrappers run @silvery/ansi's detection results through
 * `inlineSterlingTokens` so consumers can read flat keys like
 * `theme["border-default"]` directly.
 *
 * Ported from the former @silvery/theme-detect package (killed in 0.19.2).
 */

import { describe, expect, it } from "vitest"
import {
  detectTheme,
  detectScheme,
  detectSchemeTheme,
  probeColors,
  detectTerminalScheme,
  nord,
} from "@silvery/theme"

describe("@silvery/theme — detection re-exports", () => {
  it("re-exports probeColors + legacy alias from @silvery/ansi", () => {
    expect(probeColors).toBeTypeOf("function")
    expect(detectTerminalScheme).toBe(probeColors)
  })

  it("re-exports detectTheme, detectScheme, detectSchemeTheme", () => {
    expect(detectTheme).toBeTypeOf("function")
    expect(detectScheme).toBeTypeOf("function")
    expect(detectSchemeTheme).toBeTypeOf("function")
  })
})

describe("@silvery/theme — detectTheme bakes Sterling flat tokens", () => {
  it("returned theme exposes Sterling flat keys", async () => {
    // Non-TTY in vitest → falls back to nord (still Sterling-baked)
    const theme = await detectTheme()
    expect(theme).toBeDefined()
    // Sterling flat tokens should be present as root-level hyphen keys
    const flat = theme as unknown as Record<string, unknown>
    expect(typeof flat["border-default"]).toBe("string")
    expect(typeof flat["fg-muted"]).toBe("string")
    expect(typeof flat["bg-surface-default"]).toBe("string")
  })
})

describe("@silvery/theme — detectScheme returns Sterling-aware theme", () => {
  it("override path returns Sterling-baked theme", async () => {
    const result = await detectScheme({ override: { ...nord, name: "test-scheme" } })
    expect(result.source).toBe("override")
    expect(result.scheme.name).toBe("test-scheme")
    const flat = result.theme as unknown as Record<string, unknown>
    expect(typeof flat["border-default"]).toBe("string")
    expect(typeof flat["fg-muted"]).toBe("string")
  })

  it("detectSchemeTheme returns Sterling-baked theme directly", async () => {
    const theme = await detectSchemeTheme({ override: nord })
    const flat = theme as unknown as Record<string, unknown>
    expect(typeof flat["border-default"]).toBe("string")
  })
})
