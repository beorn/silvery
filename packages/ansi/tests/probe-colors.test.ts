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
import type { ProbeInputOwner } from "@silvery/ansi"

const ESC = "\x1b"
const BEL = "\x07"

function fakeProbeInputOwner(colors: {
  fg: string
  bg: string
  ansi: readonly string[]
}): ProbeInputOwner {
  return {
    async probe({ query, parse }) {
      let acc = ""
      if (query.includes(`${ESC}]10;?`)) {
        acc = oscColorResponse(10, colors.fg)
      } else if (query.includes(`${ESC}]11;?`)) {
        acc = oscColorResponse(11, colors.bg)
      } else if (query.includes(`${ESC}]4;`)) {
        acc = colors.ansi.map((color, index) => `${ESC}]4;${index};${hexToOscRgb(color)}${BEL}`).join("")
      }
      const parsed = parse(acc)
      return parsed?.result ?? null
    },
  }
}

function oscColorResponse(code: number, hex: string): string {
  return `${ESC}]${code};${hexToOscRgb(hex)}${BEL}`
}

function hexToOscRgb(hex: string): string {
  return `rgb:${hex.slice(1, 3)}/${hex.slice(3, 5)}/${hex.slice(5, 7)}`
}

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

  it("does not infer text selection colors from ANSI blue or default fg", async () => {
    const ansi = [
      "#303030",
      "#cc3333",
      "#33aa33",
      "#cccc33",
      "#005fff",
      "#aa33aa",
      "#33aaaa",
      "#dddddd",
      "#555555",
      "#ff5555",
      "#55ff55",
      "#ffff55",
      "#5599ff",
      "#ff55ff",
      "#55ffff",
      "#ffffff",
    ]
    const result = await probeColors({
      input: fakeProbeInputOwner({
        fg: "#eeeeee",
        bg: "#303030",
        ansi,
      }),
      timeoutMs: 1,
    })

    expect(result).not.toBeNull()
    expect(result!.palette.background).toBe("#303030")
    expect(result!.palette.foreground).toBe("#eeeeee")
    expect(result!.palette.blue).toBe("#005fff")
    expect(result!.palette.selectionBackground).toBeUndefined()
    expect(result!.palette.selectionForeground).toBeUndefined()
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
