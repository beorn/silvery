/**
 * Tests for probeColors() — OSC 4/10/11 terminal color probing primitive.
 *
 * Ported from the former @silvery/theme-detect package (killed in 0.19.2 —
 * probe primitive moved here, fingerprint orchestrator moved to @silvery/theme).
 */

import { describe, expect, it } from "vitest"
import {
  probeColors,
  detectTerminalScheme,
  defaultDarkScheme,
  defaultLightScheme,
  fingerprintMatch,
  loadTheme,
  defineTokens,
  resolveCustomToken,
  deriveTheme,
} from "@silvery/ansi"

describe("probeColors — primitive", () => {
  it("is a function", () => {
    expect(probeColors).toBeTypeOf("function")
  })

  it("returns null in non-TTY environment (vitest)", async () => {
    const result = await probeColors(50)
    expect(result).toBeNull()
  })

  it("detectTerminalScheme is the legacy alias for probeColors", () => {
    expect(detectTerminalScheme).toBe(probeColors)
  })
})

describe("probe → fingerprint → loadTheme — end-to-end (synthetic input)", () => {
  it("fingerprintMatch + loadTheme pipeline composes", () => {
    // Simulate a probed scheme by using defaultDarkScheme as input.
    const probed = defaultDarkScheme
    const match = fingerprintMatch(probed, [defaultDarkScheme, defaultLightScheme])
    expect(match).not.toBeNull()
    expect(match!.scheme.name).toBe(defaultDarkScheme.name)

    const theme = loadTheme(match!.scheme, { enforce: "strict" })
    expect(theme.fg).toBeDefined()
    expect(theme["fg-accent"]).toBeDefined()
  })

  it("loadTheme with wcag: true passes for default-dark", () => {
    const theme = loadTheme(defaultDarkScheme, { enforce: "strict", wcag: true })
    expect(theme).toBeDefined()
  })

  it("defineTokens + resolveCustomToken round-trip", () => {
    const tokens = defineTokens({
      "$priority-p0": { derive: (s) => s.brightRed },
      "$app-brand": { rgb: "#5B8DEF", ansi16: "brightBlue", attrs: ["bold"] },
    })
    const theme = deriveTheme(defaultDarkScheme)
    const p0 = resolveCustomToken("$priority-p0", tokens, defaultDarkScheme, theme, "truecolor")
    expect(p0).toBe(defaultDarkScheme.brightRed)
    const brand = resolveCustomToken("$app-brand", tokens, defaultDarkScheme, theme, "ansi16")
    expect(brand).toBe("brightBlue")
  })
})
