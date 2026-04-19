/**
 * ansi16-theme-hex — Phase 1 regression: Theme objects carry hex for ALL tiers.
 *
 * After km-silvery.theme-v4-ansi16-hex, Theme objects must never contain ANSI
 * slot name strings (e.g., "yellow", "blueBright"). All color-valued fields must
 * be "#rrggbb" hex strings. ANSI16 quantization happens at the output phase, not
 * in the Theme object itself.
 *
 * @see packages/ansi/src/theme/default-schemes.ts
 * @see packages/theme/src/generate.ts
 * @see packages/theme/src/schemes/index.ts
 */

import { describe, test, expect } from "vitest"
import { ansi16DarkTheme, ansi16LightTheme, deriveAnsi16Theme } from "@silvery/ansi"
import { nord, catppuccinMocha } from "@silvery/theme"
import { generateTheme } from "@silvery/theme"
import type { Theme } from "@silvery/ansi"

const HEX_RE = /^#[0-9a-f]{6}$/i

/** Fields that are NOT hex strings — excluded from the hex-only check. */
const NON_HEX_FIELDS = new Set<string>(["name", "bg", "variants", "palette"])

function assertAllHex(theme: Theme, label: string): void {
  for (const [key, value] of Object.entries(theme)) {
    if (NON_HEX_FIELDS.has(key)) continue
    if (key === "ring") {
      // ring is an object of hex values
      for (const [ringKey, ringVal] of Object.entries(value as Record<string, string>)) {
        expect(
          HEX_RE.test(ringVal as string),
          `${label}: theme.ring.${ringKey} = ${JSON.stringify(ringVal)} is not hex`,
        ).toBe(true)
      }
      continue
    }
    if (typeof value === "string") {
      expect(
        HEX_RE.test(value),
        `${label}: theme.${key} = ${JSON.stringify(value)} is not hex`,
      ).toBe(true)
    }
  }
}

describe("Theme objects carry pure hex values (no ANSI slot name strings)", () => {
  test("ansi16DarkTheme.primary is hex", () => {
    expect(HEX_RE.test(ansi16DarkTheme.primary)).toBe(true)
  })

  test("ansi16LightTheme.primary is hex", () => {
    expect(HEX_RE.test(ansi16LightTheme.primary)).toBe(true)
  })

  test("ansi16DarkTheme — all color fields are hex", () => {
    assertAllHex(ansi16DarkTheme, "ansi16DarkTheme")
  })

  test("ansi16LightTheme — all color fields are hex", () => {
    assertAllHex(ansi16LightTheme, "ansi16LightTheme")
  })

  test("deriveAnsi16Theme(nord) — all color fields are hex", () => {
    const theme = deriveAnsi16Theme(nord)
    assertAllHex(theme, "deriveAnsi16Theme(nord)")
  })

  test("deriveAnsi16Theme(catppuccinMocha) — all color fields are hex", () => {
    const theme = deriveAnsi16Theme(catppuccinMocha)
    assertAllHex(theme, "deriveAnsi16Theme(catppuccinMocha)")
  })

  test("generateTheme('yellow', true) — all color fields are hex", () => {
    const theme = generateTheme("yellow", true)
    assertAllHex(theme, "generateTheme('yellow', true)")
  })

  test("generateTheme('blue', false) — all color fields are hex", () => {
    const theme = generateTheme("blue", false)
    assertAllHex(theme, "generateTheme('blue', false)")
  })

  test("generateTheme('cyan', true).palette — all entries are hex", () => {
    const theme = generateTheme("cyan", true)
    expect(theme.palette).toHaveLength(16)
    for (let i = 0; i < theme.palette.length; i++) {
      expect(
        HEX_RE.test(theme.palette[i]!),
        `generateTheme('cyan', true).palette[${i}] = ${JSON.stringify(theme.palette[i])} is not hex`,
      ).toBe(true)
    }
  })

  test("no ANSI slot name strings in ansi16DarkTheme (spot check)", () => {
    const slotNames = [
      "black", "red", "green", "yellow", "blue", "magenta", "cyan", "white",
      "blackBright", "redBright", "greenBright", "yellowBright",
      "blueBright", "magentaBright", "cyanBright", "whiteBright",
    ]
    for (const [key, value] of Object.entries(ansi16DarkTheme)) {
      if (typeof value === "string" && !NON_HEX_FIELDS.has(key)) {
        expect(
          slotNames.includes(value),
          `ansi16DarkTheme.${key} = ${JSON.stringify(value)} — ANSI slot name found`,
        ).toBe(false)
      }
    }
  })
})
