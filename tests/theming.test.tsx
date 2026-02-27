/**
 * Tests for the inkx theming system.
 *
 * Verifies:
 * - resolveThemeColor() function (new tokens + palette + backward compat aliases)
 * - ThemeProvider + useTheme() context delivery
 * - $token resolution in Text and Box color props
 * - Default theme values
 * - Theme switching via re-render
 * - generateTheme() function
 */

import React, { useState } from "react"
import { describe, expect, test } from "vitest"
import { Box, Text, useInput } from "../src/index.js"
import { ThemeProvider, useTheme } from "../src/contexts/ThemeContext.js"
import {
  defaultDarkTheme,
  defaultLightTheme,
  ansi16DarkTheme,
  ansi16LightTheme,
  resolveThemeColor,
  generateTheme,
  type Theme,
} from "../src/theme.js"
import { createRenderer, stripAnsi } from "inkx/testing"

const render = createRenderer({ cols: 60, rows: 10 })

// ============================================================================
// resolveThemeColor — new tokens
// ============================================================================

describe("resolveThemeColor", () => {
  test("returns undefined for undefined input", () => {
    expect(resolveThemeColor(undefined, defaultDarkTheme)).toBeUndefined()
  })

  test("returns undefined for empty string", () => {
    expect(resolveThemeColor("", defaultDarkTheme)).toBeUndefined()
  })

  test("passes through non-token strings unchanged", () => {
    expect(resolveThemeColor("red", defaultDarkTheme)).toBe("red")
    expect(resolveThemeColor("#ff0000", defaultDarkTheme)).toBe("#ff0000")
    expect(resolveThemeColor("rgb(255,0,0)", defaultDarkTheme)).toBe("rgb(255,0,0)")
  })

  test("resolves $primary to theme.primary", () => {
    expect(resolveThemeColor("$primary", defaultDarkTheme)).toBe("#EBCB8B")
  })

  test("resolves all 17 named tokens", () => {
    const tokens: Array<[string, string]> = [
      ["$primary", defaultDarkTheme.primary],
      ["$link", defaultDarkTheme.link],
      ["$control", defaultDarkTheme.control],
      ["$selected", defaultDarkTheme.selected],
      ["$selectedfg", defaultDarkTheme.selectedfg],
      ["$focusring", defaultDarkTheme.focusring],
      ["$text", defaultDarkTheme.text],
      ["$text2", defaultDarkTheme.text2],
      ["$text3", defaultDarkTheme.text3],
      ["$text4", defaultDarkTheme.text4],
      ["$bg", defaultDarkTheme.bg],
      ["$raisedbg", defaultDarkTheme.raisedbg],
      ["$separator", defaultDarkTheme.separator],
      ["$error", defaultDarkTheme.error],
      ["$warning", defaultDarkTheme.warning],
      ["$success", defaultDarkTheme.success],
    ]

    for (const [token, expected] of tokens) {
      expect(resolveThemeColor(token, defaultDarkTheme)).toBe(expected)
    }
  })

  test("passes through unknown $tokens as-is", () => {
    expect(resolveThemeColor("$nonexistent", defaultDarkTheme)).toBe("$nonexistent")
  })

  test("does not resolve $name or $dark (non-color metadata)", () => {
    // $name resolves to the string "dark-truecolor" which is a valid string, so it passes
    expect(resolveThemeColor("$name", defaultDarkTheme)).toBe("dark-truecolor")
    // $dark is boolean, not string — falls through
    expect(resolveThemeColor("$dark", defaultDarkTheme)).toBe("$dark")
  })

  test("resolves against light theme", () => {
    expect(resolveThemeColor("$primary", defaultLightTheme)).toBe("#0056B3")
    expect(resolveThemeColor("$text", defaultLightTheme)).toBe("#1A1A1A")
  })
})

// ============================================================================
// resolveThemeColor — palette ($color0-$color15)
// ============================================================================

describe("resolveThemeColor palette", () => {
  test("resolves $color0 through $color15", () => {
    for (let i = 0; i < 16; i++) {
      const result = resolveThemeColor(`$color${i}`, defaultDarkTheme)
      expect(result).toBe(defaultDarkTheme.palette[i])
    }
  })

  test("$color16 and beyond pass through as-is", () => {
    expect(resolveThemeColor("$color16", defaultDarkTheme)).toBe("$color16")
    expect(resolveThemeColor("$color99", defaultDarkTheme)).toBe("$color99")
  })

  test("ANSI 16 palette resolves to named colors", () => {
    expect(resolveThemeColor("$color0", ansi16DarkTheme)).toBe("black")
    expect(resolveThemeColor("$color1", ansi16DarkTheme)).toBe("red")
    expect(resolveThemeColor("$color6", ansi16DarkTheme)).toBe("cyan")
    expect(resolveThemeColor("$color15", ansi16DarkTheme)).toBe("whiteBright")
  })

  test("truecolor palette resolves to hex values", () => {
    expect(resolveThemeColor("$color0", defaultDarkTheme)).toBe("#2E3440")
    expect(resolveThemeColor("$color1", defaultDarkTheme)).toBe("#BF616A")
    expect(resolveThemeColor("$color4", defaultDarkTheme)).toBe("#5E81AC")
  })
})

// ============================================================================
// resolveThemeColor — backward compat aliases
// ============================================================================

describe("resolveThemeColor backward compat", () => {
  test("$accent resolves to theme.primary", () => {
    expect(resolveThemeColor("$accent", defaultDarkTheme)).toBe(defaultDarkTheme.primary)
    expect(resolveThemeColor("$accent", ansi16DarkTheme)).toBe(ansi16DarkTheme.primary)
  })

  test("$muted resolves to theme.text2", () => {
    expect(resolveThemeColor("$muted", defaultDarkTheme)).toBe(defaultDarkTheme.text2)
    expect(resolveThemeColor("$muted", ansi16DarkTheme)).toBe(ansi16DarkTheme.text2)
  })

  test("$surface resolves to theme.raisedbg", () => {
    expect(resolveThemeColor("$surface", defaultDarkTheme)).toBe(defaultDarkTheme.raisedbg)
  })

  test("$background resolves to theme.bg", () => {
    expect(resolveThemeColor("$background", defaultDarkTheme)).toBe(defaultDarkTheme.bg)
  })

  test("$border resolves to theme.separator", () => {
    expect(resolveThemeColor("$border", defaultDarkTheme)).toBe(defaultDarkTheme.separator)
    expect(resolveThemeColor("$border", ansi16DarkTheme)).toBe(ansi16DarkTheme.separator)
  })
})

// ============================================================================
// Default themes
// ============================================================================

describe("default themes", () => {
  test("dark truecolor theme has expected metadata", () => {
    expect(defaultDarkTheme.name).toBe("dark-truecolor")
    expect(defaultDarkTheme.dark).toBe(true)
  })

  test("light truecolor theme has expected metadata", () => {
    expect(defaultLightTheme.name).toBe("light-truecolor")
    expect(defaultLightTheme.dark).toBe(false)
  })

  test("dark ANSI 16 theme has expected metadata", () => {
    expect(ansi16DarkTheme.name).toBe("dark-ansi16")
    expect(ansi16DarkTheme.dark).toBe(true)
  })

  test("light ANSI 16 theme has expected metadata", () => {
    expect(ansi16LightTheme.name).toBe("light-ansi16")
    expect(ansi16LightTheme.dark).toBe(false)
  })

  test("all 17 named color tokens are valid strings", () => {
    const colorKeys = [
      "primary",
      "link",
      "control",
      "selected",
      "selectedfg",
      "focusring",
      "text",
      "text2",
      "text3",
      "text4",
      "bg",
      "raisedbg",
      "separator",
      "error",
      "warning",
      "success",
    ] as const

    for (const theme of [defaultDarkTheme, defaultLightTheme, ansi16DarkTheme, ansi16LightTheme]) {
      for (const key of colorKeys) {
        expect(typeof theme[key]).toBe("string")
      }
    }
  })

  test("all themes have 16-element palette", () => {
    for (const theme of [defaultDarkTheme, defaultLightTheme, ansi16DarkTheme, ansi16LightTheme]) {
      expect(theme.palette).toHaveLength(16)
      for (const color of theme.palette) {
        expect(typeof color).toBe("string")
        expect(color.length).toBeGreaterThan(0)
      }
    }
  })
})

// ============================================================================
// ThemeProvider + useTheme
// ============================================================================

describe("ThemeProvider + useTheme", () => {
  test("useTheme returns defaultDarkTheme without provider", () => {
    function ThemeDisplay() {
      const theme = useTheme()
      return <Text>{theme.name}</Text>
    }

    const app = render(<ThemeDisplay />)
    expect(app.text).toContain("dark-truecolor")
  })

  test("useTheme returns provided theme", () => {
    function ThemeDisplay() {
      const theme = useTheme()
      return <Text>{theme.name}</Text>
    }

    const app = render(
      <ThemeProvider theme={defaultLightTheme}>
        <ThemeDisplay />
      </ThemeProvider>,
    )
    expect(app.text).toContain("light-truecolor")
  })

  test("custom theme is accessible via useTheme", () => {
    const custom: Theme = {
      ...defaultDarkTheme,
      name: "solarized",
      primary: "#268BD2",
    }

    function ThemeDisplay() {
      const theme = useTheme()
      return (
        <Text>
          {theme.name}:{theme.primary}
        </Text>
      )
    }

    const app = render(
      <ThemeProvider theme={custom}>
        <ThemeDisplay />
      </ThemeProvider>,
    )
    expect(app.text).toContain("solarized")
    expect(app.text).toContain("#268BD2")
  })
})

// ============================================================================
// $token resolution (explicit resolveThemeColor)
// ============================================================================

/**
 * Convert a hex color to its RGB components.
 */
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const n = parseInt(hex.slice(1), 16)
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff }
}

describe("$token resolution via explicit resolveThemeColor", () => {
  test("Text with resolved color uses theme primary color", () => {
    function ThemedText() {
      const theme = useTheme()
      return <Text color={resolveThemeColor("$primary", theme)}>Hello</Text>
    }

    const app = render(
      <ThemeProvider theme={defaultDarkTheme}>
        <ThemedText />
      </ThemeProvider>,
    )

    const frame = app.ansi
    const { r, g, b } = hexToRgb(defaultDarkTheme.primary)
    expect(frame).toContain(`38;2;${r};${g};${b}`)
    expect(stripAnsi(frame)).toContain("Hello")
  })

  test("Box with resolved borderColor uses theme separator color", () => {
    function ThemedBox() {
      const theme = useTheme()
      return (
        <Box borderStyle="single" borderColor={resolveThemeColor("$separator", theme)}>
          <Text>inside</Text>
        </Box>
      )
    }

    const app = render(
      <ThemeProvider theme={defaultDarkTheme}>
        <ThemedBox />
      </ThemeProvider>,
    )

    const frame = app.ansi
    const { r, g, b } = hexToRgb(defaultDarkTheme.separator)
    expect(frame).toContain(`38;2;${r};${g};${b}`)
    expect(stripAnsi(frame)).toContain("inside")
  })

  test("backward compat: $border resolves same as $separator", () => {
    function ThemedBox() {
      const theme = useTheme()
      return (
        <Box borderStyle="single" borderColor={resolveThemeColor("$border", theme)}>
          <Text>inside</Text>
        </Box>
      )
    }

    const app = render(
      <ThemeProvider theme={defaultDarkTheme}>
        <ThemedBox />
      </ThemeProvider>,
    )

    const frame = app.ansi
    const { r, g, b } = hexToRgb(defaultDarkTheme.separator)
    expect(frame).toContain(`38;2;${r};${g};${b}`)
  })

  test("literal colors pass through Box/Text unchanged", () => {
    const app = render(
      <Box borderStyle="single" borderColor="green">
        <Text color="red">Hello</Text>
      </Box>,
    )

    expect(stripAnsi(app.ansi)).toContain("Hello")
  })
})

// ============================================================================
// Theme switching
// ============================================================================

describe("theme switching", () => {
  test("switching theme changes resolved colors (explicit)", async () => {
    function ThemedText() {
      const theme = useTheme()
      return <Text color={resolveThemeColor("$primary", theme)}>Hello</Text>
    }

    function ThemeSwitcher() {
      const [dark, setDark] = useState(true)
      const theme = dark ? defaultDarkTheme : defaultLightTheme

      useInput((input: string) => {
        if (input === "t") setDark((d) => !d)
      })

      return (
        <ThemeProvider theme={theme}>
          <ThemedText />
        </ThemeProvider>
      )
    }

    const app = render(<ThemeSwitcher />)

    // Initially dark theme: primary = #EBCB8B
    const darkRgb = hexToRgb(defaultDarkTheme.primary)
    expect(app.ansi).toContain(`38;2;${darkRgb.r};${darkRgb.g};${darkRgb.b}`)

    // Switch to light
    await app.press("t")

    // Light theme: primary = #0056B3
    const lightRgb = hexToRgb(defaultLightTheme.primary)
    expect(app.ansi).toContain(`38;2;${lightRgb.r};${lightRgb.g};${lightRgb.b}`)

    // Dark color should no longer be present
    expect(app.ansi).not.toContain(`38;2;${darkRgb.r};${darkRgb.g};${darkRgb.b}`)
  })
})

// ============================================================================
// $token auto-resolution (direct on props, no manual resolveThemeColor)
// ============================================================================

describe("$token auto-resolution in color props", () => {
  test("Text color='$primary' resolves against ThemeProvider theme", () => {
    const app = render(
      <ThemeProvider theme={defaultDarkTheme}>
        <Text color="$primary">Hello</Text>
      </ThemeProvider>,
    )

    const { r, g, b } = hexToRgb(defaultDarkTheme.primary)
    expect(app.ansi).toContain(`38;2;${r};${g};${b}`)
    expect(stripAnsi(app.ansi)).toContain("Hello")
  })

  test("Box borderColor='$separator' resolves against theme", () => {
    const app = render(
      <ThemeProvider theme={defaultDarkTheme}>
        <Box borderStyle="single" borderColor="$separator">
          <Text>inside</Text>
        </Box>
      </ThemeProvider>,
    )

    const { r, g, b } = hexToRgb(defaultDarkTheme.separator)
    expect(app.ansi).toContain(`38;2;${r};${g};${b}`)
    expect(stripAnsi(app.ansi)).toContain("inside")
  })

  test("backward compat: $border auto-resolves to separator", () => {
    const app = render(
      <ThemeProvider theme={defaultDarkTheme}>
        <Box borderStyle="single" borderColor="$border">
          <Text>inside</Text>
        </Box>
      </ThemeProvider>,
    )

    const { r, g, b } = hexToRgb(defaultDarkTheme.separator)
    expect(app.ansi).toContain(`38;2;${r};${g};${b}`)
  })

  test("backward compat: $surface auto-resolves to raisedbg", () => {
    const app = render(
      <ThemeProvider theme={defaultDarkTheme}>
        <Box backgroundColor="$surface">
          <Text>content</Text>
        </Box>
      </ThemeProvider>,
    )

    const { r, g, b } = hexToRgb(defaultDarkTheme.raisedbg)
    // Background uses 48;2;r;g;b
    expect(app.ansi).toContain(`48;2;${r};${g};${b}`)
    expect(stripAnsi(app.ansi)).toContain("content")
  })

  test("Box backgroundColor='$raisedbg' resolves against theme", () => {
    const app = render(
      <ThemeProvider theme={defaultDarkTheme}>
        <Box backgroundColor="$raisedbg">
          <Text>content</Text>
        </Box>
      </ThemeProvider>,
    )

    const { r, g, b } = hexToRgb(defaultDarkTheme.raisedbg)
    expect(app.ansi).toContain(`48;2;${r};${g};${b}`)
    expect(stripAnsi(app.ansi)).toContain("content")
  })

  test("ANSI16 theme resolves $tokens to named colors", () => {
    const app = render(
      <ThemeProvider theme={ansi16DarkTheme}>
        <Text color="$primary">Hello</Text>
      </ThemeProvider>,
    )

    // ansi16DarkTheme.primary = "yellow" → resolves via parseColor's namedColors
    // chalkx encodes "yellow" as 38;5;3 (256-color palette index for yellow)
    expect(app.ansi).toContain("38;5;3")
    expect(stripAnsi(app.ansi)).toContain("Hello")
  })

  test("unknown $token renders without color (null)", () => {
    const app = render(
      <ThemeProvider theme={defaultDarkTheme}>
        <Text color="$nonexistent">Hello</Text>
      </ThemeProvider>,
    )

    // Should still render text, just without a color
    expect(stripAnsi(app.ansi)).toContain("Hello")
  })
})

// ============================================================================
// generateTheme
// ============================================================================

describe("generateTheme", () => {
  test("generates dark yellow theme matching ansi16DarkTheme", () => {
    const theme = generateTheme("yellow", true)
    expect(theme.name).toBe("dark-yellow")
    expect(theme.dark).toBe(true)
    expect(theme.primary).toBe("yellow")
    expect(theme.link).toBe("blueBright")
    expect(theme.control).toBe("yellow")
    expect(theme.selected).toBe("yellow") // selected = primary
    expect(theme.selectedfg).toBe("black")
    expect(theme.focusring).toBe("blueBright") // dark → blueBright
    expect(theme.text).toBe("whiteBright")
    expect(theme.text2).toBe("white")
    expect(theme.text3).toBe("gray")
    expect(theme.text4).toBe("gray")
    expect(theme.bg).toBe("")
    expect(theme.raisedbg).toBe("black")
    expect(theme.separator).toBe("gray")
    expect(theme.error).toBe("redBright")
    expect(theme.warning).toBe("yellow") // same as primary
    expect(theme.success).toBe("greenBright")
    expect(theme.palette).toHaveLength(16)
  })

  test("generates light blue theme matching ansi16LightTheme", () => {
    const theme = generateTheme("blue", false)
    expect(theme.name).toBe("light-blue")
    expect(theme.dark).toBe(false)
    expect(theme.primary).toBe("blue")
    expect(theme.link).toBe("blueBright")
    expect(theme.selected).toBe("blue") // selected = primary
    expect(theme.focusring).toBe("blue") // light → blue
    expect(theme.text).toBe("black")
    expect(theme.text2).toBe("blackBright")
    expect(theme.raisedbg).toBe("white")
    expect(theme.error).toBe("red")
    expect(theme.success).toBe("green")
  })

  test("selected always matches primary", () => {
    for (const primary of ["yellow", "red", "magenta", "green", "white", "cyan", "blue"] as const) {
      const theme = generateTheme(primary, true)
      expect(theme.selected).toBe(primary)
    }
  })

  test("all 7 primary colors produce valid themes", () => {
    const primaries = ["yellow", "cyan", "magenta", "green", "red", "blue", "white"] as const
    for (const primary of primaries) {
      for (const dark of [true, false]) {
        const theme = generateTheme(primary, dark)
        expect(theme.name).toBe(`${dark ? "dark" : "light"}-${primary}`)
        expect(theme.palette).toHaveLength(16)
        // All string fields should be defined
        expect(typeof theme.primary).toBe("string")
        expect(typeof theme.link).toBe("string")
        expect(typeof theme.text).toBe("string")
      }
    }
  })
})
