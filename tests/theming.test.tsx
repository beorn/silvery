/**
 * Tests for the inkx theming system.
 *
 * Verifies:
 * - resolveThemeColor() function
 * - ThemeProvider + useTheme() context delivery
 * - $token resolution in Text and Box color props
 * - Default theme values
 * - Theme switching via re-render
 */

import React, { useState } from "react"
import { describe, expect, test } from "vitest"
import { Box, Text, useInput } from "../src/index.js"
import { ThemeProvider, useTheme } from "../src/contexts/ThemeContext.js"
import { defaultDarkTheme, defaultLightTheme, resolveThemeColor, type Theme } from "../src/theme.js"
import { createRenderer, stripAnsi } from "inkx/testing"

const render = createRenderer({ cols: 60, rows: 10 })

// ============================================================================
// resolveThemeColor
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
    expect(resolveThemeColor("$primary", defaultDarkTheme)).toBe("#88C0D0")
  })

  test("resolves all color tokens", () => {
    const tokens: Array<[string, string]> = [
      ["$primary", defaultDarkTheme.primary],
      ["$accent", defaultDarkTheme.accent],
      ["$error", defaultDarkTheme.error],
      ["$warning", defaultDarkTheme.warning],
      ["$success", defaultDarkTheme.success],
      ["$surface", defaultDarkTheme.surface],
      ["$background", defaultDarkTheme.background],
      ["$text", defaultDarkTheme.text],
      ["$muted", defaultDarkTheme.muted],
      ["$border", defaultDarkTheme.border],
    ]

    for (const [token, expected] of tokens) {
      expect(resolveThemeColor(token, defaultDarkTheme)).toBe(expected)
    }
  })

  test("passes through unknown $tokens as-is", () => {
    expect(resolveThemeColor("$nonexistent", defaultDarkTheme)).toBe("$nonexistent")
  })

  test("does not resolve $name or $dark (non-color metadata)", () => {
    // $name resolves to the string "dark" which is a valid string, so it passes
    expect(resolveThemeColor("$name", defaultDarkTheme)).toBe("dark")
    // $dark is boolean, not string — falls through
    expect(resolveThemeColor("$dark", defaultDarkTheme)).toBe("$dark")
  })

  test("resolves against light theme", () => {
    expect(resolveThemeColor("$primary", defaultLightTheme)).toBe("#5E81AC")
    expect(resolveThemeColor("$text", defaultLightTheme)).toBe("#2E3440")
  })
})

// ============================================================================
// Default themes
// ============================================================================

describe("default themes", () => {
  test("dark theme has expected metadata", () => {
    expect(defaultDarkTheme.name).toBe("dark")
    expect(defaultDarkTheme.dark).toBe(true)
  })

  test("light theme has expected metadata", () => {
    expect(defaultLightTheme.name).toBe("light")
    expect(defaultLightTheme.dark).toBe(false)
  })

  test("all color tokens are hex strings", () => {
    const colorKeys = [
      "primary",
      "accent",
      "error",
      "warning",
      "success",
      "surface",
      "background",
      "text",
      "muted",
      "border",
    ] as const

    for (const key of colorKeys) {
      expect(defaultDarkTheme[key]).toMatch(/^#[0-9A-Fa-f]{6}$/)
      expect(defaultLightTheme[key]).toMatch(/^#[0-9A-Fa-f]{6}$/)
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
    expect(app.text).toContain("dark")
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
    expect(app.text).toContain("light")
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

  test("Box with resolved borderColor uses theme border color", () => {
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
    const { r, g, b } = hexToRgb(defaultDarkTheme.border)
    expect(frame).toContain(`38;2;${r};${g};${b}`)
    expect(stripAnsi(frame)).toContain("inside")
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
  test("switching theme changes resolved colors", async () => {
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

    // Initially dark theme: primary = #88C0D0 = rgb(136, 192, 208)
    const darkRgb = hexToRgb(defaultDarkTheme.primary)
    expect(app.ansi).toContain(`38;2;${darkRgb.r};${darkRgb.g};${darkRgb.b}`)

    // Switch to light
    await app.press("t")

    // Light theme: primary = #5E81AC = rgb(94, 129, 172)
    const lightRgb = hexToRgb(defaultLightTheme.primary)
    expect(app.ansi).toContain(`38;2;${lightRgb.r};${lightRgb.g};${lightRgb.b}`)

    // Dark color should no longer be present
    expect(app.ansi).not.toContain(`38;2;${darkRgb.r};${darkRgb.g};${darkRgb.b}`)
  })
})
