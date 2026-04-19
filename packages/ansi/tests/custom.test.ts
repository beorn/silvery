/**
 * Tests for defineTokens — custom derivation + brand tokens.
 */

import { describe, expect, it } from "vitest"
import {
  defineTokens,
  resolveCustomToken,
  CustomTokenError,
  deriveTheme,
  defaultDarkScheme,
} from "@silvery/ansi"
import { blend } from "@silvery/color"

const theme = deriveTheme(defaultDarkScheme)

describe("defineTokens — validation", () => {
  it("accepts a derivation token", () => {
    const r = defineTokens({
      "$priority-p0": { derive: (s) => s.brightRed },
    })
    expect(r["$priority-p0"]).toBeDefined()
  })

  it("accepts a brand token with rgb + ansi16", () => {
    const r = defineTokens({
      "$km-brand": { rgb: "#5B8DEF", ansi16: "brightBlue" },
    })
    expect(r["$km-brand"]).toBeDefined()
  })

  it("accepts a brand token with attrs", () => {
    const r = defineTokens({
      "$km-logo": { rgb: "#5B8DEF", ansi16: "brightBlue", attrs: ["bold"] },
    })
    expect((r["$km-logo"] as { attrs: readonly string[] }).attrs).toEqual(["bold"])
  })

  it("rejects keys without $ prefix", () => {
    expect(() =>
      defineTokens({
        priority: { derive: () => "#FF0000" } as never,
      }),
    ).toThrow(CustomTokenError)
  })

  it("rejects collisions with built-in Theme tokens", () => {
    expect(() =>
      defineTokens({
        $fg: { rgb: "#FF0000", ansi16: "red" },
      }),
    ).toThrow(/collides with built-in/)
  })

  it("rejects mixed derive + rgb", () => {
    expect(() =>
      defineTokens({
        $mixed: { derive: () => "#FF0000", rgb: "#00FF00" } as never,
      }),
    ).toThrow(/pick one/)
  })

  it("rejects empty declarations (no derive, no rgb)", () => {
    expect(() =>
      defineTokens({
        $empty: {} as never,
      }),
    ).toThrow(/either 'derive' .* or 'rgb'/)
  })

  it("rejects brand tokens without ansi16 fallback", () => {
    expect(() =>
      defineTokens({
        $naked: { rgb: "#5B8DEF" } as never,
      }),
    ).toThrow(/requires an 'ansi16' fallback/)
  })
})

describe("resolveCustomToken — tier-aware lookup", () => {
  const registry = defineTokens({
    "$priority-p0": { derive: (s) => s.brightRed },
    "$priority-p1": { derive: (_s, t) => blend(t.warning, t.bg, 0.2) },
    "$km-brand": { rgb: "#5B8DEF", ansi16: "brightBlue", attrs: ["bold"] },
  })

  it("resolves derive token as the computed hex (truecolor)", () => {
    const v = resolveCustomToken("$priority-p0", registry, defaultDarkScheme, theme, "truecolor")
    expect(v).toBe(defaultDarkScheme.brightRed)
  })

  it("derive token at 256 is the same computed hex", () => {
    const v = resolveCustomToken("$priority-p0", registry, defaultDarkScheme, theme, "256")
    expect(v).toBe(defaultDarkScheme.brightRed)
  })

  it("derive token at mono returns empty attrs (no SGR hint)", () => {
    const v = resolveCustomToken("$priority-p0", registry, defaultDarkScheme, theme, "mono")
    expect(v).toEqual([])
  })

  it("brand token at truecolor → rgb", () => {
    const v = resolveCustomToken("$km-brand", registry, defaultDarkScheme, theme, "truecolor")
    expect(v).toBe("#5B8DEF")
  })

  it("brand token at ansi16 → ansi16 slot name", () => {
    const v = resolveCustomToken("$km-brand", registry, defaultDarkScheme, theme, "ansi16")
    expect(v).toBe("brightBlue")
  })

  it("brand token at mono → attrs", () => {
    const v = resolveCustomToken("$km-brand", registry, defaultDarkScheme, theme, "mono")
    expect(v).toEqual(["bold"])
  })

  it("returns undefined for unknown token", () => {
    expect(
      resolveCustomToken("$nope", registry, defaultDarkScheme, theme, "truecolor"),
    ).toBeUndefined()
  })
})

describe("resolveCustomToken — derive accepts both scheme and theme", () => {
  const registry = defineTokens({
    $combo: { derive: (s, t) => blend(s.foreground, t.muted, 0.5) },
  })

  it("derive function receives both arguments", () => {
    const v = resolveCustomToken("$combo", registry, defaultDarkScheme, theme, "truecolor")
    expect(typeof v).toBe("string")
    expect(v).toMatch(/^#[0-9A-F]{6}$/i)
  })
})
