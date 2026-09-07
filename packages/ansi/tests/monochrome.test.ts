/**
 * Tests for the monochrome theme — per-token SGR attrs for terminals without color.
 */

import { describe, expect, it } from "vitest"
import {
  deriveMonochromeTheme,
  monoAttrsFor,
  DEFAULT_MONO_ATTRS,
  deriveTheme,
  defaultDarkScheme,
} from "@silvery/ansi"
import type { MonoAttr } from "@silvery/ansi"

describe("deriveMonochromeTheme", () => {
  it("returns the default attrs map for any theme", () => {
    const theme = deriveTheme(defaultDarkScheme)
    const attrs = deriveMonochromeTheme(theme)
    expect(attrs).toBe(DEFAULT_MONO_ATTRS)
  })

  it("distinguishes error/info from warning/success (3 visual ranks)", () => {
    // Per the design spec: error is loudest (bold+inverse), info is subtlest
    // (italic), warning and success share the "bold" rank — their semantic
    // difference is contextual framing, not visual rank.
    const error = DEFAULT_MONO_ATTRS["fg-error"]?.slice().sort().join(",") ?? ""
    const info = DEFAULT_MONO_ATTRS["fg-info"]?.slice().sort().join(",") ?? ""
    const warning = DEFAULT_MONO_ATTRS["fg-warning"]?.slice().sort().join(",") ?? ""
    const success = DEFAULT_MONO_ATTRS["fg-success"]?.slice().sort().join(",") ?? ""
    const ranks = new Set([error, info, warning])
    expect(ranks.size).toBe(3) // error, info, warning are each distinct
    expect(warning).toBe(success) // warning and success share visual rank
  })

  it("error is the loudest — has both bold and inverse", () => {
    expect(DEFAULT_MONO_ATTRS["fg-error"]).toEqual(
      expect.arrayContaining<MonoAttr>(["bold", "inverse"]),
    )
  })

  it("fg-link has underline attr (standard monochrome convention)", () => {
    expect(DEFAULT_MONO_ATTRS["fg-link"]).toEqual(["underline"])
  })

  it("fg-muted gets dim attr", () => {
    expect(DEFAULT_MONO_ATTRS["fg-muted"]).toEqual(["dim"])
  })

  it("bg-selected uses inverse (visible without color)", () => {
    expect(DEFAULT_MONO_ATTRS["bg-selected"]).toEqual(["inverse"])
  })

  it("inverse-family states preserve hover and deemphasis without color", () => {
    expect(DEFAULT_MONO_ATTRS["bg-inverse-hover"]).toEqual(["inverse"])
    expect(DEFAULT_MONO_ATTRS["fg-on-inverse-muted"]).toEqual(["dim"])
  })

  it("structural backgrounds have no attrs", () => {
    // These represent background planes that mono terminals can't color/vary.
    for (const token of [
      "bg",
      "bg-muted",
      "bg-surface-default",
      "bg-surface-raised",
      "bg-surface-overlay",
      "border-default",
      "bg-cursor",
    ] as const) {
      expect(DEFAULT_MONO_ATTRS[token]).toEqual([])
    }
  })

  it("all attrs are from the universal SGR subset", () => {
    const allowed: MonoAttr[] = ["bold", "dim", "italic", "underline", "inverse", "strikethrough"]
    for (const [token, attrs] of Object.entries(DEFAULT_MONO_ATTRS)) {
      if (!attrs) continue
      for (const a of attrs) {
        expect(allowed).toContain(a as MonoAttr)
      }
      void token
    }
  })
})

describe("monoAttrsFor", () => {
  it("returns attrs for a known token", () => {
    const theme = deriveTheme(defaultDarkScheme)
    expect(monoAttrsFor(theme, "fg-error" as keyof typeof theme)).toEqual(
      DEFAULT_MONO_ATTRS["fg-error"],
    )
  })

  it("returns empty array for an unmapped token", () => {
    const theme = deriveTheme(defaultDarkScheme)
    // 'palette' isn't in the attrs map — returns empty.
    expect(monoAttrsFor(theme, "palette")).toEqual([])
  })
})
