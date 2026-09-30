/**
 * Continuation paragraphs (marker: "") inside an ordered list group must
 * not increment the group's ordinal counter. Without the fix, a sequence
 * [1. Alpha, continuation, Bravo] renders Bravo as "3." instead of "2.".
 * Tracking: @km/tui/26751-list-item-continuation-paragraph-render/26757-continuation-shifts-ordered-numbering
 *
 * @failure  An ordered list numbers the item after a continuation paragraph
 *           one too high: [1. Alpha, continuation, Bravo] shows "3." for Bravo.
 * @level    l1 (createRenderer; DocumentView list resolution and paint)
 * @consumer every DocumentView ordered list whose items carry continuation
 *           paragraphs (26751, 26757)
 * @testonly none
 */

import React from "react"
import { describe, expect, test } from "vitest"
import { createRenderer } from "@silvery/test"
import { DocumentView, type DocumentBlock } from "@silvery/ag-react"

describe("ordered list ordinals with continuation paragraphs (#26757)", () => {
  test("continuation block does not shift ordinal: 1., continuation, 2. (depth 0)", () => {
    const blocks: DocumentBlock[] = [
      {
        id: "item-1",
        kind: "list-item",
        content: "Alpha",
        list: { groupId: "g1", depth: 0, ordered: true, start: 1 },
      },
      {
        id: "cont-1",
        kind: "list-item",
        marker: "",
        content: "continuation of alpha",
        list: { groupId: "g1", depth: 0, ordered: true, start: 1 },
      },
      {
        id: "item-2",
        kind: "list-item",
        content: "Bravo",
        list: { groupId: "g1", depth: 0, ordered: true, start: 1 },
      },
    ]
    const render = createRenderer({ cols: 60, rows: 10 })
    const app = render(<DocumentView blocks={blocks} />)
    const text = app.text

    // Alpha must be item 1, Bravo must be item 2 — not 3
    expect(text).toContain("1.")
    expect(text).toContain("Alpha")
    expect(text).toContain("2.")
    expect(text).toContain("Bravo")
    // Must NOT render "3." (the bug: continuation counted as item 2, shifting Bravo to 3)
    expect(text).not.toContain("3.")
    // Continuation content must appear (indented, no marker)
    expect(text).toContain("continuation of alpha")
  })

  test("continuation block does not shift ordinal: nested ordered list (depth 1)", () => {
    const blocks: DocumentBlock[] = [
      {
        id: "outer-1",
        kind: "list-item",
        content: "Outer one",
        list: { groupId: "outer", depth: 0, ordered: true, start: 1 },
      },
      {
        id: "inner-1",
        kind: "list-item",
        content: "Inner Alpha",
        list: { groupId: "inner", depth: 1, ordered: true, start: 1 },
      },
      {
        id: "inner-cont",
        kind: "list-item",
        marker: "",
        content: "continuation of inner alpha",
        list: { groupId: "inner", depth: 1, ordered: true, start: 1 },
      },
      {
        id: "inner-2",
        kind: "list-item",
        content: "Inner Bravo",
        list: { groupId: "inner", depth: 1, ordered: true, start: 1 },
      },
    ]
    const render = createRenderer({ cols: 60, rows: 12 })
    const app = render(<DocumentView blocks={blocks} />)
    const text = app.text

    expect(text).toContain("Inner Alpha")
    expect(text).toContain("Inner Bravo")
    // Inner list: 1., continuation, 2. — NOT 3.
    expect(text).not.toContain("3.")
    expect(text).toContain("continuation of inner alpha")
  })
})
