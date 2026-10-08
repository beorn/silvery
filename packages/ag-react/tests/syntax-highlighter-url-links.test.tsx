/**
 * @failure A plain URL inside a code block is not a hyperlink at all, or only
 *   the first rendered row of a URL that wraps carries the OSC 8 destination,
 *   so a click on the rest of a wrapped URL does nothing. Also: a scheme inside
 *   an earlier URL is linked twice and its text is rendered twice, and adding
 *   the link recolours code that had no colour.
 * @level l2
 * @consumer @km/maddoc/28205-wrapped-url-links-only-its-first-row
 * @testonly none
 *
 * The code-block half of 28205. km prose already links every row of a wrapped
 * URL (DocumentView's external links); the SyntaxHighlighter frame emitted no
 * OSC 8 at all because it painted raw shiki tokens. The finder itself is pinned
 * by packages/ansi/tests/find-urls.test.ts — this file pins the RENDERER: that
 * a URL split across shiki tokens, and a URL wrapped across rows, still links
 * every cell it occupies, without duplicating text and without recolouring.
 */

import React from "react"
import { highlight } from "@silvery/syntax"
import { createRenderer } from "@silvery/test"
import { describe, expect, test } from "vitest"
import { SyntaxHighlighter, Text } from "../src"

type Rendered = ReturnType<ReturnType<typeof createRenderer>>

const URL = "https://raw.githubusercontent.com/mvschwarz/openrig/v0.6.7/scripts/install.sh"

interface LinkedCell {
  readonly ch: string
  readonly hyperlink: string
  /** Resolved foreground (`RGB | null`) — compare with `toEqual`, never a string. */
  readonly fg: unknown
  readonly row: number
  readonly col: number
}

/** Every cell in the frame carrying an OSC 8 destination, in row/col order. */
function linkedCells(app: Rendered): LinkedCell[] {
  const cells: LinkedCell[] = []
  for (let row = 0; row < app.height; row++) {
    for (let col = 0; col < app.width; col++) {
      const cell = app.cell(col, row)
      if (cell.hyperlink) {
        cells.push({ ch: cell.char, hyperlink: cell.hyperlink, fg: cell.fg, row, col })
      }
    }
  }
  return cells
}

/** Distinct resolved foreground colours in the frame — >1 only once highlighting lands. */
function frameColours(app: Rendered): Set<string> {
  const colours = new Set<string>()
  for (let row = 0; row < app.height; row++) {
    for (let col = 0; col < app.width; col++) {
      const cell = app.cell(col, row)
      if (cell.char !== "" && cell.char !== " ") colours.add(String(cell.fg))
    }
  }
  return colours
}

/** Render, then drain commits until the shiki frame has landed. */
async function highlightFrame(app: Rendered): Promise<void> {
  for (let pass = 0; pass < 40 && frameColours(app).size <= 1; pass++) {
    await app.waitForLayoutStable()
  }
}

/** The resolved `$fg-link` foreground, as the reference for "did this turn blue". */
function linkColour(): unknown {
  return createRenderer({ cols: 1, rows: 1 })(<Text color="$fg-link">C</Text>).cell(0, 0).fg
}

/** Foreground of the first non-blank, unlinked glyph left of `cell` on its row. */
function neighbourFg(app: Rendered, cell: LinkedCell): unknown {
  for (let col = 0; col < cell.col; col++) {
    const candidate = app.cell(col, cell.row)
    if (candidate.char.trim() !== "" && !candidate.hyperlink) return candidate.fg
  }
  return undefined
}

describe("SyntaxHighlighter URL links", () => {
  test("a URL wider than the code block links every rendered row", () => {
    const render = createRenderer({ cols: 40, rows: 12 })
    const app = render(<SyntaxHighlighter language="bash" code={`curl -fsSL ${URL} | sh`} bare />)
    const linked = linkedCells(app)
    expect(linked.length).toBe(URL.length)
    for (const cell of linked) expect(cell.hyperlink).toBe(URL)
    expect(linked.map((cell) => cell.ch).join("")).toBe(URL)
    // The visible text is unchanged — the fix adds OSC 8, it does not reflow.
    expect(app.text.replace(/\s+/gu, "")).toContain(URL)
  })

  test("a URL that fits on one row is unchanged and linked", () => {
    const render = createRenderer({ cols: 120, rows: 6 })
    const app = render(<SyntaxHighlighter language="bash" code={`curl ${URL}`} bare />)
    const linked = linkedCells(app)
    expect(linked.map((cell) => cell.ch).join("")).toBe(URL)
    for (const cell of linked) expect(cell.hyperlink).toBe(URL)
    expect(app.text).toContain(URL)
  })

  test("the sentence's trailing punctuation stays outside the link", () => {
    const render = createRenderer({ cols: 110, rows: 8 })
    const app = render(<SyntaxHighlighter language="plain" code={`See ${URL}.`} bare />)
    const linked = linkedCells(app)
    expect(linked.map((cell) => cell.ch).join("")).toBe(URL)
    for (const cell of linked) expect(cell.hyperlink).toBe(URL)
    expect(app.text).toContain(`${URL}.`)
  })

  test("a scheme inside an earlier URL links once and never duplicates text", () => {
    const nested = "https://web.archive.org/web/2020/https://x.example/page"
    const render = createRenderer({ cols: 120, rows: 6 })
    const app = render(<SyntaxHighlighter language="bash" code={`curl ${nested}`} bare />)
    const linked = linkedCells(app)
    expect(linked.map((cell) => cell.ch).join("")).toBe(nested)
    for (const cell of linked) expect(cell.hyperlink).toBe(nested)
    // The overlap bug rendered the inner URL's text twice.
    expect(app.text).not.toContain("pagehttps://")
    expect(app.text.split(nested).length - 1).toBe(1)
  })

  test("the link does not recolour the code: url cells keep the line's own fg", () => {
    const render = createRenderer({ cols: 120, rows: 6 })
    const app = render(<SyntaxHighlighter language="bash" code={`curl -fsSL ${URL} | sh`} bare />)
    const first = linkedCells(app)[0]
    if (!first) throw new Error("the URL is not linked")
    expect(first.fg).toEqual(neighbourFg(app, first))
    expect(first.fg).not.toEqual(linkColour())
  })

  test("the highlighted frame paints url cells with the token's colour, not the link colour", async () => {
    const code = `curl -fsSL ${URL} | sh`
    const tokens = await highlight(code, "bash", "github-dark")
    const urlToken = tokens[0]?.tokens.find((token) => token.text.includes("https://"))
    if (!urlToken?.color) throw new Error("fixture: the url is not a coloured shiki token")
    const render = createRenderer({ cols: 120, rows: 6 })
    const app = render(<SyntaxHighlighter language="bash" code={code} bare />)
    await highlightFrame(app)
    const expected = createRenderer({ cols: 1, rows: 1 })(
      <Text color={`mix(${urlToken.color}, mix($fg, $fg-muted, 50%), 50%)`}>X</Text>,
    ).cell(0, 0).fg
    const first = linkedCells(app)[0]
    if (!first) throw new Error("the URL is not linked")
    expect(first.fg).toEqual(expected)
    expect(first.fg).not.toEqual(linkColour())
  })

  test("the highlighted frame links a URL split across shiki tokens", async () => {
    const code = `curl -fsSL ${URL} | sh -s -- --dry-run`
    // Pre-warm the highlighter so the frame lands inside waitForLayoutStable.
    await highlight(code, "bash", "github-dark")
    const render = createRenderer({ cols: 40, rows: 12 })
    const app = render(<SyntaxHighlighter language="bash" code={code} bare />)
    await highlightFrame(app)

    const linked = linkedCells(app)
    expect(linked.length).toBe(URL.length)
    for (const cell of linked) expect(cell.hyperlink).toBe(URL)
    expect(linked.map((cell) => cell.ch).join("")).toBe(URL)
  })
})
