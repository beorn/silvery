/**
 * Sterling inverse-family contract.
 *
 * Inverse chrome (status bars, modal bands) needs the same state vocabulary
 * as its consumers: a hover surface and deemphasized text that still belongs
 * to the inverse foreground channel. These tokens replace consumer-local
 * `mix()` expressions. sRGB mixing supplies the starting intent; Sterling's
 * contrast guards keep the resulting pair readable across every palette.
 */

import { mixSrgb, relativeLuminance } from "@silvery/color"
import { builtinPalettes } from "@silvery/ansi/schemes/schemes"
import { sterling } from "@silvery/color/design"
import { describe, expect, test } from "vitest"

function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a) ?? 0
  const lb = relativeLuminance(b) ?? 0
  const hi = Math.max(la, lb)
  const lo = Math.min(la, lb)
  return (hi + 0.05) / (lo + 0.05)
}

describe("Sterling inverse-family tokens", () => {
  const schemes = Object.entries(builtinPalettes)

  test.each(schemes)("%s exposes canonical nested and flat aliases", (_name, scheme) => {
    const theme = sterling.deriveFromScheme(scheme)

    expect(theme.inverse.hover.bg).toBe(theme["bg-inverse-hover"])
    expect(theme.inverse.muted.fgOn).toBe(theme["fg-on-inverse-muted"])
  })

  test.each(schemes)(
    "%s keeps both inverse text tiers readable on base and hover",
    (_name, scheme) => {
      const theme = sterling.deriveFromScheme(scheme)
      const baseText = theme["fg-on-inverse"]
      const mutedText = theme["fg-on-inverse-muted"]
      const surfaces = [theme["bg-inverse"], theme["bg-inverse-hover"]]

      expect(theme["bg-inverse-hover"]).not.toBe(theme["bg-inverse"])
      for (const surface of surfaces) {
        const baseContrast = contrastRatio(baseText, surface)
        const mutedContrast = contrastRatio(mutedText, surface)
        expect(baseContrast, `${_name}: base text on ${surface}`).toBeGreaterThanOrEqual(4.5)
        expect(mutedContrast, `${_name}: muted text on ${surface}`).toBeGreaterThanOrEqual(3)
        expect(mutedContrast, `${_name}: muted remains below base emphasis`).toBeLessThan(
          baseContrast,
        )
      }
    },
  )

  test("Nord preserves the unlifted sRGB mix when both contrast floors already clear", () => {
    const theme = sterling.deriveFromScheme(builtinPalettes.nord!)

    expect(theme["bg-inverse-hover"]).toBe(
      mixSrgb(theme["bg-inverse"], theme["fg-on-inverse"], 0.1),
    )
    expect(theme["fg-on-inverse-muted"]).toBe(
      mixSrgb(theme["fg-on-inverse"], theme["bg-inverse"], 0.35),
    )
  })

  test("both inverse state tokens can be pinned by their canonical paths", () => {
    const theme = sterling.deriveFromScheme(builtinPalettes.nord!, {
      pins: {
        "inverse.hover.bg": "#123456",
        "fg-on-inverse-muted": "#abcdef",
      },
    })

    expect(theme.inverse.hover.bg).toBe("#123456")
    expect(theme["bg-inverse-hover"]).toBe("#123456")
    expect(theme.inverse.muted.fgOn).toBe("#abcdef")
    expect(theme["fg-on-inverse-muted"]).toBe("#abcdef")
  })
})
