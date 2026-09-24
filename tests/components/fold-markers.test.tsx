/**
 * `FOLD_MARKERS` — the tree-disclosure vocabulary every outline shares.
 *
 * Pinned, unlike the file-browser pair: there is no capability to resolve,
 * and the whole point of one export is that every tree on one screen draws
 * the same three glyphs. What a consumer depends on is that each marker is
 * exactly one cell under the render pipeline's own width table — a wide
 * marker shifts every cell after it on the row.
 */

import { describe, test, expect } from "vitest"
import { DISCLOSURE_MARKERS, displayWidth, FOLD_MARKERS } from "silvery"

describe("FOLD_MARKERS", () => {
  test("folded is the big right-pointing pointer, unfolded a bullet, empty a middle dot", () => {
    expect(FOLD_MARKERS).toEqual({ folded: "►", unfolded: "•", empty: "·" })
  })

  test("every marker is exactly one cell under the pipeline's width table", () => {
    for (const marker of Object.values(FOLD_MARKERS)) expect(displayWidth(marker)).toBe(1)
  })

  test("the bigger black triangle is not a candidate: the width table measures it two cells", () => {
    // U+25B6 carries emoji presentation on modern terminals, so it would shift the row.
    expect(displayWidth("▶")).toBe(2)
  })
})

describe("DISCLOSURE_MARKERS", () => {
  test("sections use a right triangle when collapsed and a down triangle when expanded", () => {
    expect(DISCLOSURE_MARKERS).toEqual({ collapsed: "►", expanded: "▼" })
    expect(FOLD_MARKERS).toEqual({ folded: "►", unfolded: "•", empty: "·" })
  })

  test("both section markers occupy one cell under the pipeline width table", () => {
    for (const marker of Object.values(DISCLOSURE_MARKERS)) expect(displayWidth(marker)).toBe(1)
  })
})
