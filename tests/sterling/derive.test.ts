/**
 * Sterling derivation — per-scheme shape validation.
 *
 * For each of the 84 builtin palettes:
 *   - derive a Theme
 *   - assert all expected token paths exist (nested AND flat)
 *   - assert nested/flat forms are the SAME reference (not just equal)
 *   - assert shape matches Sterling's declared shape
 */

import { describe, test, expect } from "vitest"
import { sterling, STERLING_FLAT_TOKENS } from "@silvery/theme/sterling"
import { builtinPalettes } from "@silvery/theme/schemes"
import { blend, mixSrgb, relativeLuminance } from "@silvery/color"

/** WCAG contrast ratio between two hex colors (1..21). */
function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a) ?? 0
  const lb = relativeLuminance(b) ?? 0
  const hi = Math.max(la, lb)
  const lo = Math.min(la, lb)
  return (hi + 0.05) / (lo + 0.05)
}

describe("sterling.deriveFromScheme — shape", () => {
  const names = Object.keys(builtinPalettes)

  test("catalog has 84 schemes", () => {
    expect(names.length).toBe(84)
  })

  test.each(names)("'%s' — all FlatTokens populated + same-reference invariant", (name) => {
    const scheme = builtinPalettes[name]!
    const theme = sterling.deriveFromScheme(scheme)

    // Every FlatToken must be present
    for (const flat of STERLING_FLAT_TOKENS) {
      expect(theme[flat], `scheme=${name} flat=${flat}`).toMatch(/^#[0-9a-fA-F]{3,8}$/)
    }

    // Nested roles must all exist
    expect(theme.accent).toBeDefined()
    expect(theme.info).toBeDefined()
    expect(theme.success).toBeDefined()
    expect(theme.warning).toBeDefined()
    expect(theme.error).toBeDefined()
    expect(theme.muted).toBeDefined()
    expect(theme.surface).toBeDefined()
    expect(theme.border).toBeDefined()
    expect(theme.cursor).toBeDefined()
    expect(theme.selected).toBeDefined()
    expect(theme.inverse).toBeDefined()
    expect(theme.link).toBeDefined()
    expect(theme.faint).toBeDefined()

    // Same-reference invariant for canonical pairs
    expect(theme.accent.bg, `accent.bg`).toBe(theme["bg-accent"])
    expect(theme.accent.fg, `accent.fg`).toBe(theme["fg-accent"])
    expect(theme.accent.fgOn, `accent.fgOn`).toBe(theme["fg-on-accent"])
    expect(theme.accent.hover.bg).toBe(theme["bg-accent-hover"])
    expect(theme.accent.active.bg).toBe(theme["bg-accent-active"])
    expect(theme.accent.border).toBe(theme["border-accent"])

    expect(theme.info.fg).toBe(theme["fg-info"])
    expect(theme.info.bg).toBe(theme["bg-info"])
    expect(theme.info.fgOn).toBe(theme["fg-on-info"])

    expect(theme.error.fg).toBe(theme["fg-error"])
    expect(theme.error.bg).toBe(theme["bg-error"])
    // Status roles: only bg state variants (fg doesn't hover).
    expect(theme.error.hover.bg).toBe(theme["bg-error-hover"])
    expect(theme.error.active.bg).toBe(theme["bg-error-active"])
    // Prune invariant: fg state variants don't exist on status roles.
    expect((theme.error.hover as { fg?: unknown }).fg).toBeUndefined()
    expect((theme.error.active as { fg?: unknown }).fg).toBeUndefined()
    expect((theme as unknown as Record<string, unknown>)["fg-error-hover"]).toBeUndefined()

    expect(theme.success.fg).toBe(theme["fg-success"])
    expect(theme.warning.fg).toBe(theme["fg-warning"])

    expect(theme.muted.fg).toBe(theme["fg-muted"])
    expect(theme.muted.bg).toBe(theme["bg-muted"])

    expect(theme.surface.default).toBe(theme["bg-surface-default"])
    expect(theme.surface.subtle).toBe(theme["bg-surface-subtle"])
    expect(theme.surface.raised).toBe(theme["bg-surface-raised"])
    expect(theme.surface.overlay).toBe(theme["bg-surface-overlay"])
    expect(theme.surface.hover).toBe(theme["bg-surface-hover"])

    expect(theme.border.default).toBe(theme["border-default"])
    expect(theme.border.focus).toBe(theme["border-focus"])
    expect(theme.border.muted).toBe(theme["border-muted"])

    expect(theme.cursor.fg).toBe(theme["fg-cursor"])
    expect(theme.cursor.bg).toBe(theme["bg-cursor"])

    // Selected — highlight surface (bg + fgOn + hover.bg)
    expect(theme.selected.bg).toBe(theme["bg-selected"])
    expect(theme.selected.fgOn).toBe(theme["fg-on-selected"])
    expect(theme.selected.hover.bg).toBe(theme["bg-selected-hover"])

    // Inverse — flipped surface (bg + fgOn + hover + muted on-fill text)
    expect(theme.inverse.bg).toBe(theme["bg-inverse"])
    expect(theme.inverse.fgOn).toBe(theme["fg-on-inverse"])
    expect(theme.inverse.hover.bg).toBe(theme["bg-inverse-hover"])
    expect(theme.inverse.muted.fgOn).toBe(theme["fg-on-inverse-muted"])

    // Link — idle + hover text colors
    expect(theme.link.fg).toBe(theme["fg-link"])
    expect(theme.link.hover.fg).toBe(theme["fg-link-hover"])

    // Faint — text color only, the deemphasis tier below muted
    expect(theme.faint.fg).toBe(theme["fg-faint"])
  })

  test.each(names)("'%s' — fg-faint reads dimmer than fg-muted (lower contrast vs bg)", (name) => {
    // The faint tier must always resolve strictly fainter than muted: its
    // blend runs further toward bg (0.55 vs 0.4) and its floor sits below
    // muted's (1.5:1 vs 3:1). Compare contrast against the canvas so the
    // relationship holds on light AND dark schemes (raw luminance flips).
    const scheme = builtinPalettes[name]!
    const theme = sterling.deriveFromScheme(scheme)
    const cMuted = contrastRatio(theme["fg-muted"], theme["bg-default"])
    const cFaint = contrastRatio(theme["fg-faint"], theme["bg-default"])
    expect(cFaint, `${name}: faint ${cFaint} should be < muted ${cMuted}`).toBeLessThan(cMuted)
    // …and still clears the FAINT non-text floor (never invisible).
    expect(cFaint, `${name}: faint below FAINT floor`).toBeGreaterThanOrEqual(1.5)
  })

  test("theme.mode + name metadata is populated", () => {
    const theme = sterling.deriveFromScheme(builtinPalettes["nord"]!)
    expect(theme.mode).toBe("dark")
    expect(theme.name).toBe("nord") // from ColorScheme.name
  })

  test("shape metadata matches actual output", () => {
    const shape = sterling.shape
    expect(shape.flatTokens.length).toBe(STERLING_FLAT_TOKENS.length)
    expect(shape.roles).toContain("accent")
    expect(shape.roles).toContain("info")
    expect(shape.roles).toContain("surface")
    expect(shape.states).toEqual(["hover", "active"])
  })

  test("theme.derivationTrace is absent by default", () => {
    const theme = sterling.deriveFromScheme(builtinPalettes["nord"]!)
    expect(theme.derivationTrace).toBeUndefined()
  })

  test("theme.derivationTrace populated with {trace:true}", () => {
    const theme = sterling.deriveFromScheme(builtinPalettes["nord"]!, { trace: true })
    expect(theme.derivationTrace).toBeDefined()
    expect(theme.derivationTrace!.length).toBeGreaterThan(20)
    // First step should be accent.fg
    expect(theme.derivationTrace![0]?.token).toBe("accent.fg")
    expect(theme.derivationTrace!.find((step) => step.token === "link.fg")?.rule).toBe(
      "blend(scheme.brightBlue, fg, 0.2)",
    )
    expect(theme.derivationTrace!.find((step) => step.token === "link.hover.fg")?.rule).toBe(
      "mixSrgb(link.fg, fg, 0.75)",
    )
  })

  test("D2: theme.info.fg equals theme.accent.fg by default (same seed, same rule)", () => {
    const theme = sterling.deriveFromScheme(builtinPalettes["nord"]!)
    expect(theme.info.fg).toBe(theme.accent.fg)
  })

  test.each(names)(
    "'%s' — bg-selected has ΔL ≥ 0.08 vs bg (visibility invariant)",
    async (name) => {
      const { hexToOklch } = await import("@silvery/color")
      const theme = sterling.deriveFromScheme(builtinPalettes[name]!)
      const oSel = hexToOklch(theme["bg-selected"])
      const oBg = hexToOklch(theme["bg-surface-default"])
      if (!oSel || !oBg) return // ANSI-named palettes shouldn't reach here, but guard
      const dL = Math.abs(oSel.L - oBg.L)
      expect(
        dL,
        `${name}: bg-selected (${theme["bg-selected"]}) too close to bg (${theme["bg-surface-default"]})`,
      ).toBeGreaterThanOrEqual(0.08)
    },
  )

  test("legacy → flat token mapping (inline.ts)", () => {
    const scheme = builtinPalettes["nord"]!
    const theme = sterling.deriveFromScheme(scheme)
    // Spot-check that the new tokens are populated as hex
    expect(theme["bg-selected"]).toMatch(/^#[0-9a-fA-F]{6}$/)
    expect(theme["fg-on-selected"]).toMatch(/^#[0-9a-fA-F]{6}$/)
    expect(theme["bg-selected-hover"]).toMatch(/^#[0-9a-fA-F]{6}$/)
    expect(theme["bg-inverse"]).toMatch(/^#[0-9a-fA-F]{6}$/)
    expect(theme["fg-on-inverse"]).toMatch(/^#[0-9a-fA-F]{6}$/)
    expect(theme["bg-inverse-hover"]).toMatch(/^#[0-9a-fA-F]{6}$/)
    expect(theme["fg-on-inverse-muted"]).toMatch(/^#[0-9a-fA-F]{6}$/)
    expect(theme["fg-link"]).toBe(blend(scheme.brightBlue, scheme.foreground, 0.2))
    expect(theme["fg-link-hover"]).toBe(mixSrgb(theme["fg-link"], scheme.foreground, 0.75))
  })

  test("deriveFromColor produces a well-formed theme", () => {
    const theme = sterling.deriveFromColor("#FF6A00")
    expect(theme.accent.bg).toBe("#FF6A00") // seed color used verbatim as bg
    expect(theme["fg-accent"]).toBeTruthy()
    expect(theme.mode).toBe("dark")
  })

  test("light-mode link hover mixes toward the scheme foreground", () => {
    const scheme = builtinPalettes["catppuccin-latte"]!
    const theme = sterling.deriveFromScheme(scheme)
    expect(theme["fg-link-hover"]).toBe(mixSrgb(theme["fg-link"], scheme.foreground, 0.75))
    expect(theme["fg-link-hover"]).not.toBe(mixSrgb(theme["fg-link"], "#FFFFFF", 0.75))
  })

  test("link hover foreground can be pinned by its canonical path", () => {
    const pinned = "#ABCDEF"
    const theme = sterling.deriveFromScheme(builtinPalettes["nord"]!, {
      pins: { "link.hover.fg": pinned },
    })
    expect(theme.link.hover.fg).toBe(pinned)
    expect(theme["fg-link-hover"]).toBe(pinned)
  })

  test("deriveFromPair returns two themes", () => {
    const pair = sterling.deriveFromPair(
      builtinPalettes["catppuccin-latte"]!,
      builtinPalettes["nord"]!,
    )
    expect(pair.light.mode).toBe("light")
    expect(pair.dark.mode).toBe("dark")
  })

  test("deriveFromSchemeWithBrand overrides primary", () => {
    const theme = sterling.deriveFromSchemeWithBrand(builtinPalettes["nord"]!, "#FF6A00")
    expect(theme.accent.bg).toBe("#FF6A00")
  })
})
