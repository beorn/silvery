/**
 * Token manifest contract — keep PUBLIC_TOKENS in lockstep with the
 * Sterling flat-token surface.
 *
 * This is the load-bearing test for `vendor/silvery/scripts/gen-token-docs.ts`
 * — without lockstep, the generated docs page silently drifts away from
 * what the type system actually emits.
 */

import { describe, expect, test } from "vitest"
import {
  sterling,
  STERLING_FLAT_TOKENS,
  PUBLIC_TOKENS,
  FAMILY_ORDER,
  groupTokensByFamily,
} from "@silvery/theme/sterling"
import { builtinPalettes } from "@silvery/theme/schemes"

describe("Sterling token manifest", () => {
  test("PUBLIC_TOKENS has same length as STERLING_FLAT_TOKENS", () => {
    expect(PUBLIC_TOKENS.length).toBe(STERLING_FLAT_TOKENS.length)
  })

  test("PUBLIC_TOKENS covers exactly STERLING_FLAT_TOKENS (same set)", () => {
    const manifestSet = new Set(PUBLIC_TOKENS.map((t) => t.flat))
    const flatSet = new Set(STERLING_FLAT_TOKENS)
    expect(manifestSet).toEqual(flatSet)
  })

  test("every entry has non-empty purpose / derivation / contrast / tierNotes", () => {
    for (const entry of PUBLIC_TOKENS) {
      expect(entry.purpose, `${entry.flat} purpose`).toMatch(/\S/)
      expect(entry.derivation, `${entry.flat} derivation`).toMatch(/\S/)
      expect(entry.contrast, `${entry.flat} contrast`).toMatch(/\S/)
      expect(entry.tierNotes, `${entry.flat} tierNotes`).toMatch(/\S/)
    }
  })

  test("when path is non-null, walking it on a derived theme equals the flat-key value", () => {
    const theme = sterling.deriveFromScheme(builtinPalettes["nord"]!)
    for (const entry of PUBLIC_TOKENS) {
      if (entry.path === null) continue
      const segments = entry.path.split(".")
      let cursor: unknown = theme
      for (const seg of segments) {
        cursor = (cursor as Record<string, unknown>)[seg]
      }
      const flatValue = (theme as unknown as Record<string, unknown>)[entry.flat]
      expect(cursor, `${entry.flat} (path=${entry.path}) — nested form should equal flat`).toBe(
        flatValue,
      )
    }
  })

  test("FAMILY_ORDER covers every family used in PUBLIC_TOKENS", () => {
    const families = new Set(PUBLIC_TOKENS.map((t) => t.family))
    for (const fam of families) {
      expect(FAMILY_ORDER, `family ${fam} missing from FAMILY_ORDER`).toContain(fam)
    }
  })

  test("groupTokensByFamily returns every entry exactly once", () => {
    const grouped = groupTokensByFamily()
    let total = 0
    for (const [, entries] of grouped) total += entries.length
    expect(total).toBe(PUBLIC_TOKENS.length)
  })
})
