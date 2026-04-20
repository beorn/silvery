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
  })

  test("D2: theme.info.fg equals theme.accent.fg by default (same seed, same rule)", () => {
    const theme = sterling.deriveFromScheme(builtinPalettes["nord"]!)
    expect(theme.info.fg).toBe(theme.accent.fg)
  })

  test("deriveFromColor produces a well-formed theme", () => {
    const theme = sterling.deriveFromColor("#FF6A00")
    expect(theme.accent.bg).toBe("#FF6A00") // seed color used verbatim as bg
    expect(theme["fg-accent"]).toBeTruthy()
    expect(theme.mode).toBe("dark")
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
