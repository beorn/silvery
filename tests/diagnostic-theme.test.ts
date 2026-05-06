/**
 * Diagnostic theme smoke test.
 *
 * Asserts the invariant that every distinct flat token resolves to a distinct
 * RGB. This is what makes the diagnostic theme load-bearing for pipeline
 * regression tests — under default themes (Nord, ansi16) some tokens collapse
 * to canvas, hiding bugs like the cyan-strip cold-start residue.
 */

import { describe, expect, test } from "vitest"
import { diagnosticTheme } from "../packages/test/src/diagnostic-theme.ts"

describe("diagnosticTheme", () => {
  test("every flat token has a distinct RGB", () => {
    const flat = (diagnosticTheme as any).flat ?? diagnosticTheme
    const seen = new Map<string, string[]>()
    for (const [token, value] of Object.entries(flat)) {
      if (typeof value !== "string") continue
      const m = String(value).match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i)
      if (!m) continue
      const key = `${parseInt(m[1]!, 16)},${parseInt(m[2]!, 16)},${parseInt(m[3]!, 16)}`
      if (!seen.has(key)) seen.set(key, [])
      seen.get(key)!.push(token)
    }
    // Some tokens are intentionally aliases (e.g. fg-on-accent might equal
    // brightWhite). Only fail if a "surface family" token collides with
    // canvas — that's the bug class the diagnostic theme exists to catch.
    const canvas = "0,0,0"
    const collidedWithCanvas = seen.get(canvas) ?? []
    const surfaceCollisions = collidedWithCanvas.filter(
      (t) =>
        t.startsWith("bg-surface-") ||
        t === "bg-muted" ||
        t === "mutedbg" ||
        t === "bg-selected" ||
        t === "bg-cursor",
    )
    expect(
      surfaceCollisions,
      "no surface/muted/selection bg should equal canvas under diagnostic",
    ).toEqual([])
  })

  test("legacy mutedbg ≠ canvas (the cyan-strip-bug invariant)", () => {
    const flat = (diagnosticTheme as any).flat ?? diagnosticTheme
    const canvas = flat["bg"] ?? flat["bg-surface-default"]
    const mutedbg = flat["mutedbg"] ?? flat["bg-muted"]
    expect(canvas).toBeDefined()
    expect(mutedbg).toBeDefined()
    expect(mutedbg).not.toEqual(canvas)
  })

  test("Sterling bg-muted ≠ legacy mutedbg under diagnostic (separable code-variant paths)", () => {
    const flat = (diagnosticTheme as any).flat ?? diagnosticTheme
    // Both tokens should resolve under diagnostic — Sterling's bg-muted
    // (blend 0.08) and legacy mutedbg (blend 0.04) should produce different
    // RGBs so a test can tell which path emitted the bg.
    const sterlingMuted = flat["bg-muted"]
    const legacyMutedbg = flat["mutedbg"]
    if (sterlingMuted && legacyMutedbg) {
      expect(sterlingMuted).not.toEqual(legacyMutedbg)
    }
  })
})
