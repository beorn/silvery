/**
 * @failure Page colors omit tokens, fail to follow color mode, or silently emit missing values.
 * @level l0
 * @consumer @silvery/color/design themeCss users, including Hallo pages
 * @testonly none
 */
import { describe, expect, it } from "vitest"
import { sterling, STERLING_FLAT_TOKENS, THEME_CSS_TOKENS, themeCss } from "@silvery/color/design"

describe("Sterling page CSS", () => {
  it("registers every flat token and hue as an inherited color and follows both modes", () => {
    const light = sterling.defaults("light")
    const dark = sterling.defaults("dark")
    const css = themeCss()
    const names = [
      ...STERLING_FLAT_TOKENS,
      "red",
      "orange",
      "yellow",
      "green",
      "teal",
      "blue",
      "purple",
      "pink",
    ]
    expect(THEME_CSS_TOKENS).toEqual(names)
    expect([...css.matchAll(/@property --([^{}]+)\{/g)].map((match) => match[1])).toEqual(names)
    const declarations = Object.fromEntries(
      css
        .match(/:root\{([^}]+)\}/)![1]!
        .split(";")
        .map((entry) => entry.split(":")),
    )
    expect(Object.keys(declarations)).toEqual(names.map((name) => `--${name}`))
    for (const name of THEME_CSS_TOKENS) {
      const l = light[name as keyof typeof light]
      const d = dark[name as keyof typeof dark]
      expect(css).toContain(
        `@property --${name}{syntax:"<color>";inherits:true;initial-value:${l}}`,
      )
      expect(declarations[`--${name}`]).toBe(l === d ? l : `light-dark(${l},${d})`)
    }
    expect(css).toContain(":where(html){color:var(--fg-default)}")
  })

  it("uses the supplied pair and keeps equal colors literal", () => {
    const light = { ...sterling.defaults("light"), "fg-default": "#123456", blue: "#abcdef" }
    const dark = { ...sterling.defaults("dark"), "fg-default": "#654321", blue: "#abcdef" }
    const css = themeCss({ light, dark })
    expect(css).toContain("initial-value:#123456}")
    expect(css).toContain("--fg-default:light-dark(#123456,#654321)")
    expect(css).toContain("--blue:#abcdef;")
    expect(css).not.toContain("light-dark(#abcdef,#abcdef)")
  })

  it.each(["light", "dark"] as const)("names a missing token and its %s mode", (mode) => {
    const pair = { light: sterling.defaults("light"), dark: sterling.defaults("dark") }
    pair[mode] = { ...pair[mode] }
    Reflect.deleteProperty(pair[mode], "blue")
    expect(() => themeCss(pair)).toThrow(new RegExp(`blue.*${mode}`))
  })
})
