/**
 * Sterling flatten — populateFlat writes all flat keys, same references,
 * and freezes the Theme.
 */

import { describe, test, expect } from "vitest"
import { sterling, STERLING_FLAT_TOKENS } from "@silvery/theme/sterling"
import { builtinPalettes } from "@silvery/theme/schemes"

describe("sterling flatten", () => {
  const theme = sterling.deriveFromScheme(builtinPalettes["nord"]!)

  test("all STERLING_FLAT_TOKENS are hex strings", () => {
    for (const flat of STERLING_FLAT_TOKENS) {
      const val = (theme as any)[flat]
      expect(val, flat).toMatch(/^#[0-9a-fA-F]{3,8}$/)
    }
  })

  test("STERLING_FLAT_TOKENS has exactly 52 tokens", () => {
    // Status roles (info/success/warning/error) no longer emit fg-X-hover
    // and fg-X-active — text tokens on status roles are not state-varying.
    //   surfaces = 5, border = 3, cursor = 2, muted = 2                = 12
    //   accent (link-like) = fg, bg, fgOn, border,
    //     fg-hover, bg-hover, fg-active, bg-active                      =  8
    //   info | success | warning | error — each:
    //     fg, bg, fgOn, bg-hover, bg-active = 5, × 4                   = 20
    //   selected = bg, fgOn, bg-hover                                   =  3
    //   inverse = bg, fgOn                                              =  2
    //   link = fg                                                       =  1
    //   disabled = fg, bg, border                                       =  3
    //   backdrop = bg                                                   =  1
    //   default surfaces = fg-default, bg-default                       =  2
    //   total = 52
    expect(STERLING_FLAT_TOKENS.length).toBe(52)
  })

  test("theme is frozen (direct assignment throws in strict mode)", () => {
    expect(Object.isFrozen(theme)).toBe(true)
    expect(Object.isFrozen(theme.accent)).toBe(true)
    expect(Object.isFrozen(theme.accent.hover)).toBe(true)
    expect(Object.isFrozen(theme.surface)).toBe(true)
  })

  test("nested and flat reference the SAME string (not a copy)", () => {
    // Same-reference matters for memory (~50 keys × 90 themes = 4500 entries,
    // sharing string interning saves real memory).
    expect(theme.accent.bg).toBe(theme["bg-accent"])
    expect(theme.accent.hover.fg).toBe(theme["fg-accent-hover"])
    expect(theme.surface.overlay).toBe(theme["bg-surface-overlay"])
  })

  test("Object.keys counts ~78 entries (52 flat + 13 roles + mode + name + variants + palette + 8 hues + fg/bg root)", () => {
    const keys = Object.keys(theme)
    expect(keys.length).toBeGreaterThanOrEqual(74)
    expect(keys.length).toBeLessThanOrEqual(80)
  })

  test("flat-only filter finds exactly STERLING_FLAT_TOKENS entries", () => {
    const flatKeys = Object.keys(theme).filter((k) => k.includes("-"))
    expect(flatKeys.sort()).toEqual([...STERLING_FLAT_TOKENS].sort())
  })
})
