/**
 * Regression: `$border-default` must resolve to a visible color on every
 * shipped Theme.
 *
 * Prior bug (2026-04-20): km-tui card borders rendered white on dark
 * backgrounds. Root cause: `@silvery/ag-react` re-exported
 * `ansi16DarkTheme` and `detectTheme` from `@silvery/ansi`, which build
 * legacy Theme objects WITHOUT Sterling flat tokens (`border-default`,
 * `fg-muted`, etc.). Looking up `theme["border-default"]` returned
 * `undefined`; `resolveThemeColor` then returned undefined; `parseColor`
 * returned `null`; the renderer painted the default terminal fg (white on
 * most dark terminals).
 *
 * Fix: re-export from `@silvery/theme` instead, where every Theme is run
 * through `inlineSterlingTokens`. This test locks the invariant for every
 * public theme surface that km-tui and other apps consume.
 */

import { describe, expect, test } from "vitest"
import React from "react"
import { Box, Text, ansi16DarkTheme, ansi16LightTheme, detectTheme } from "@silvery/ag-react"
import { createRenderer } from "@silvery/test"
import { defaultDarkTheme, defaultLightTheme } from "@silvery/theme"
import type { Theme } from "@silvery/ansi"

/** Rec. 709 luma — returns 0..1 or -1 if not a hex color. */
function luma(hex: string | undefined): number {
  if (!hex) return -1
  const m = /^#?([0-9a-f]{6})$/i.exec(hex)
  if (!m?.[1]) return -1
  const n = parseInt(m[1], 16)
  const r = (n >> 16) & 0xff
  const g = (n >> 8) & 0xff
  const b = n & 0xff
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
}

function isDarkTheme(theme: Theme): boolean {
  return luma(theme.bg) < 0.5
}

describe("theme: Sterling flat tokens are present on every shipped Theme", () => {
  const cases: Array<[string, Theme]> = [
    ["ansi16DarkTheme (from @silvery/ag-react)", ansi16DarkTheme],
    ["ansi16LightTheme (from @silvery/ag-react)", ansi16LightTheme],
    ["defaultDarkTheme (from @silvery/theme)", defaultDarkTheme],
    ["defaultLightTheme (from @silvery/theme)", defaultLightTheme],
  ]

  for (const [name, theme] of cases) {
    test(`${name} has border-default / border-muted / border-focus`, () => {
      const t = theme as unknown as Record<string, string | undefined>
      expect(t["border-default"], "border-default must be defined").toBeTypeOf("string")
      expect(t["border-muted"], "border-muted must be defined").toBeTypeOf("string")
      expect(t["border-focus"], "border-focus must be defined").toBeTypeOf("string")
    })
  }

  test("detectTheme() returns a Sterling-inlined Theme (fallback path)", async () => {
    // No terminal attached in vitest — detectTheme falls back to the ANSI 16
    // theme derived from caps.darkBackground. The wrapper in @silvery/theme
    // must still run it through inlineSterlingTokens.
    const theme = await detectTheme({ caps: { colorTier: "ansi16", darkBackground: true } })
    const t = theme as unknown as Record<string, string | undefined>
    expect(t["border-default"]).toBeTypeOf("string")
    expect(t["border-muted"]).toBeTypeOf("string")
    expect(t["border-focus"]).toBeTypeOf("string")
  })
})

describe("theme: border-default luminance contrasts with bg", () => {
  // On a dark theme, border-default should NOT be near-white; on a light
  // theme, it should NOT be near-black. This is the user-visible property
  // the original bug violated (white borders on dark bg).
  const darkThemes: Array<[string, Theme]> = [
    ["ansi16DarkTheme", ansi16DarkTheme],
    ["defaultDarkTheme", defaultDarkTheme],
  ]

  for (const [name, theme] of darkThemes) {
    test(`${name}: border-default luma is not near-white`, () => {
      expect(isDarkTheme(theme), `${name} should be a dark theme`).toBe(true)
      const t = theme as unknown as Record<string, string | undefined>
      const borderLuma = luma(t["border-default"])
      // Near-white = luma > 0.85. Sterling derives border-default as
      // blend(bg, fg, 0.18), so on Nord-like palettes it sits around 0.22.
      expect(
        borderLuma,
        `border-default=${t["border-default"]} luma=${borderLuma} should be below 0.5 on a dark theme`,
      ).toBeLessThan(0.5)
    })
  }
})

describe("theme: $border-default renders as a visible border (not terminal-default fg)", () => {
  test("rendered border cell on a dark ANSI-16 Theme has a resolved fg with dark-side luma", () => {
    const render = createRenderer({ cols: 20, rows: 5 })
    const app = render(
      <Box theme={ansi16DarkTheme} borderStyle="round" borderColor="$border-default" padding={0}>
        <Text>x</Text>
      </Box>,
    )
    const corner = app.cell(0, 0) // "╭"
    // Before the fix: fg was null (terminal default) — the painted cell
    // carried no SGR fg → terminal default (usually white on dark).
    // After the fix: fg resolves to Sterling's blend(bg, fg, 0.18)
    // (~#494f5c on Nord, luma ≈ 0.19).
    expect(corner.fg, "border cell fg must be resolved, not terminal default").not.toBeNull()
    expect(
      typeof corner.fg === "object",
      `cell(0,0).fg should be an RGB object, got ${typeof corner.fg}`,
    ).toBe(true)
    const fg = corner.fg as { r: number; g: number; b: number }
    const fgLuma = (0.2126 * fg.r + 0.7152 * fg.g + 0.0722 * fg.b) / 255
    expect(
      fgLuma,
      `border fg RGB=(${fg.r},${fg.g},${fg.b}) luma=${fgLuma} should be below 0.5 on a dark theme`,
    ).toBeLessThan(0.5)
  })
})
