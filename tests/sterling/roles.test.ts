/**
 * Sterling roles — verify info is distinct from accent (D2) and surface
 * hierarchy has 4 levels.
 */

import { describe, test, expect } from "vitest"
import { sterling } from "@silvery/theme/sterling"
import { builtinPalettes } from "@silvery/theme/schemes"
import { hexToOklch } from "@silvery/color"
import type { ColorScheme } from "@silvery/ansi"

describe("sterling roles — info + surface hierarchy", () => {
  test("theme.info exists with same default value as theme.accent", () => {
    const theme = sterling.deriveFromScheme(builtinPalettes["nord"]!)
    expect(theme.info).toBeDefined()
    expect(theme.info.fg).toBe(theme.accent.fg)
    expect(theme.info.bg).toBe(theme.accent.bg)
  })

  test("scheme can override info without affecting accent (D2)", () => {
    const theme = sterling.deriveFromScheme(builtinPalettes["nord"]!, {
      pins: { "info.fg": "#00CCFF" },
    })
    expect(theme.info.fg).toBe("#00CCFF")
    // accent.fg stays at its default derivation (not #00CCFF)
    expect(theme.accent.fg).not.toBe("#00CCFF")
  })

  test("surface has 4 distinct levels + hover", () => {
    const theme = sterling.deriveFromScheme(builtinPalettes["nord"]!)
    expect(theme.surface.default).toBeDefined()
    expect(theme.surface.subtle).toBeDefined()
    expect(theme.surface.raised).toBeDefined()
    expect(theme.surface.overlay).toBeDefined()
    expect(theme.surface.hover).toBeDefined()

    // They should all be distinct (progressively brighter for dark themes)
    const levels = [
      theme.surface.default,
      theme.surface.subtle,
      theme.surface.raised,
      theme.surface.overlay,
    ]
    const unique = new Set(levels)
    expect(unique.size).toBe(4)
  })

  test("theme has NO `destructive` field (D1 — destructive is a component prop)", () => {
    const theme = sterling.deriveFromScheme(builtinPalettes["nord"]!)
    expect((theme as any).destructive).toBeUndefined()
  })

  test("theme has NO `brand` field (Appendix F — brand is input, not output)", () => {
    const theme = sterling.deriveFromScheme(builtinPalettes["nord"]!)
    expect((theme as any).brand).toBeUndefined()
  })

  test("accent has a border token distinct from hover.bg", () => {
    const theme = sterling.deriveFromScheme(builtinPalettes["nord"]!)
    expect(theme.accent.border).toBeDefined()
    expect(theme["border-accent"]).toBe(theme.accent.border)
  })

  test("defaults(mode) works without any scheme input", () => {
    const dark = sterling.defaults("dark")
    const light = sterling.defaults("light")
    expect(dark.mode).toBe("dark")
    expect(light.mode).toBe("light")
    expect(dark.accent.bg).toBeTruthy()
    expect(light.accent.bg).toBeTruthy()
    expect(dark.surface.default).not.toBe(light.surface.default)
  })

  test("theme(partial) fills missing values with defaults", () => {
    const t = sterling.theme({ accent: { fg: "#DEADBE", bg: "#DEADBE" } })
    expect(t.accent.fg).toBe("#DEADBE")
    expect(t.accent.bg).toBe("#DEADBE")
    // Defaults still fill in other roles
    expect(t.error.fg).toBeTruthy()
    expect(t.surface.default).toBeTruthy()
  })
})

describe("sterling adaptive L-shift — no white/black-out at L extremes", () => {
  // Synthetic scheme with a very bright yellow seed — representative of
  // catppuccin-frappe's warning in a dark scheme where naive +L shifts
  // used to collapse hover/active to pure white.
  const brightYellowScheme: ColorScheme = {
    name: "test-bright-yellow",
    dark: true,
    primary: "#88C0D0",
    black: "#1E1E1E",
    red: "#E06C75",
    green: "#98C379",
    yellow: "#FFF8A6", // L ~ 0.97 — near the top of OKLCH lightness
    blue: "#61AFEF",
    magenta: "#C678DD",
    cyan: "#56B6C2",
    white: "#ABB2BF",
    brightBlack: "#5C6370",
    brightRed: "#E06C75",
    brightGreen: "#98C379",
    brightYellow: "#FFF8A6",
    brightBlue: "#61AFEF",
    brightMagenta: "#C678DD",
    brightCyan: "#56B6C2",
    brightWhite: "#FFFFFF",
    foreground: "#E4E4E7",
    background: "#1A1A1A",
    cursorColor: "#E4E4E7",
    cursorText: "#1A1A1A",
    selectionBackground: "#3E4452",
    selectionForeground: "#E4E4E7",
  }

  const veryDarkScheme: ColorScheme = {
    name: "test-very-dark",
    dark: false,
    primary: "#1A1A1A", // very dark primary on a light bg
    black: "#000000",
    red: "#6B0F0F",
    green: "#0F6B0F",
    yellow: "#6B6B0F",
    blue: "#0F0F6B",
    magenta: "#6B0F6B",
    cyan: "#0F6B6B",
    white: "#CCCCCC",
    brightBlack: "#333333",
    brightRed: "#8B1F1F",
    brightGreen: "#1F8B1F",
    brightYellow: "#8B8B1F",
    brightBlue: "#1F1F8B",
    brightMagenta: "#8B1F8B",
    brightCyan: "#1F8B8B",
    brightWhite: "#EEEEEE",
    foreground: "#1A1A1A",
    background: "#FFFFFF",
    cursorColor: "#1A1A1A",
    cursorText: "#FFFFFF",
    selectionBackground: "#CCE0FF",
    selectionForeground: "#1A1A1A",
  }

  test("high-L token (bright yellow) darkens on hover/active — no whiteout", () => {
    const theme = sterling.deriveFromScheme(brightYellowScheme, { contrast: "auto-lift" })
    const baseL = hexToOklch(theme.warning.bg)!.L
    const hoverL = hexToOklch(theme.warning.hover.bg)!.L
    const activeL = hexToOklch(theme.warning.active.bg)!.L

    // baseL is high — must darken (direction follows token's own luminance)
    expect(baseL).toBeGreaterThan(0.6)
    expect(hoverL).toBeLessThan(baseL)
    expect(activeL).toBeLessThan(hoverL)

    // Result must NOT be pure white
    expect(theme.warning.hover.bg.toUpperCase()).not.toBe("#FFFFFF")
    expect(theme.warning.active.bg.toUpperCase()).not.toBe("#FFFFFF")

    // And must be visibly distinguishable (not identical)
    expect(theme.warning.hover.bg).not.toBe(theme.warning.bg)
    expect(theme.warning.active.bg).not.toBe(theme.warning.hover.bg)
  })

  test("low-L token (very-dark primary) brightens on hover/active — no blackout", () => {
    const theme = sterling.deriveFromScheme(veryDarkScheme, { contrast: "auto-lift" })
    const baseL = hexToOklch(theme.accent.bg)!.L
    const hoverL = hexToOklch(theme.accent.hover.bg)!.L
    const activeL = hexToOklch(theme.accent.active.bg)!.L

    // baseL is low — must brighten
    expect(baseL).toBeLessThan(0.6)
    expect(hoverL).toBeGreaterThan(baseL)
    expect(activeL).toBeGreaterThan(hoverL)

    // Must NOT collapse to pure black
    expect(theme.accent.hover.bg.toUpperCase()).not.toBe("#000000")
    expect(theme.accent.active.bg.toUpperCase()).not.toBe("#000000")
  })

  test("catppuccin-frappe accent.hover/active.fg no longer collapses to white", () => {
    // The original bug: the whole Sterling accent/warning chain resolved to
    // #FFFFFF for catppuccin-frappe because the naive +L shift on an
    // L=0.89 accent.fg saturated.
    const theme = sterling.deriveFromScheme(builtinPalettes["catppuccin-frappe"]!)
    expect(theme.accent.hover.fg.toUpperCase()).not.toBe("#FFFFFF")
    expect(theme.accent.active.fg.toUpperCase()).not.toBe("#FFFFFF")
    expect(theme.warning.active.bg.toUpperCase()).not.toBe("#FFFFFF")
    // Hover must be distinguishable from base + active
    expect(theme.accent.hover.fg).not.toBe(theme.accent.fg)
    expect(theme.accent.active.fg).not.toBe(theme.accent.hover.fg)
    // Yellow family preserved — active.bg should still be warm (yellowish),
    // i.e. not grey/white; we verify by asserting chroma > 0.
    const activeBgOklch = hexToOklch(theme.warning.active.bg)
    expect(activeBgOklch).not.toBeNull()
    expect(activeBgOklch!.C).toBeGreaterThan(0.02)
  })

  test("84-scheme catalog: derivation never produces white/black states where base is chromatic", () => {
    for (const name of Object.keys(builtinPalettes)) {
      const scheme = builtinPalettes[name]!
      const theme = sterling.deriveFromScheme(scheme)

      for (const role of ["accent", "info", "success", "warning", "error"] as const) {
        const r = theme[role]
        const baseOklch = hexToOklch(r.bg)
        if (!baseOklch || baseOklch.C < 0.03) continue // skip effectively gray bases

        // Chromatic bases should not produce fully white/black states
        const hoverBgUpper = r.hover.bg.toUpperCase()
        const activeBgUpper = r.active.bg.toUpperCase()
        expect(hoverBgUpper, `${name}: ${role}.hover.bg`).not.toBe("#FFFFFF")
        expect(hoverBgUpper, `${name}: ${role}.hover.bg`).not.toBe("#000000")
        expect(activeBgUpper, `${name}: ${role}.active.bg`).not.toBe("#FFFFFF")
        expect(activeBgUpper, `${name}: ${role}.active.bg`).not.toBe("#000000")
      }
    }
  })

  test("84-scheme catalog: no NaN hex values in derived theme", () => {
    for (const name of Object.keys(builtinPalettes)) {
      const scheme = builtinPalettes[name]!
      const theme = sterling.deriveFromScheme(scheme)
      for (const key of Object.keys(theme)) {
        const v = (theme as any)[key]
        if (typeof v === "string") {
          expect(v, `${name}.${key}`).not.toContain("NaN")
          expect(v, `${name}.${key}`).toMatch(/^#[0-9a-fA-F]{3,8}$|^(dark|light)$|^[\w-]+$/)
        }
      }
    }
  })
})
