/**
 * Typography Preset Component Tests
 *
 * Tests for all typography components exported from silvery:
 * H1, H2, H3, P, Lead, Muted, Strong, Em, Code, Kbd,
 * Blockquote, CodeBlock, HR, UL, OL, LI
 */

import { describe, test, expect } from "vitest"
import { createRenderer } from "@silvery/test"
import {
  H1,
  H2,
  H3,
  P,
  Lead,
  Muted,
  Strong,
  Em,
  Code,
  Kbd,
  Blockquote,
  CodeBlock,
  HR,
  UL,
  OL,
  LI,
  Box,
} from "silvery"

const render = createRenderer({ cols: 80, rows: 10 })

// ============================================================================
// Headings
// ============================================================================

describe("Headings", () => {
  test("H1 renders text", () => {
    const app = render(<H1>Page Title</H1>)
    expect(app.text).toContain("Page Title")
  })

  test("H1 is bold with $fg-accent color", () => {
    const app = render(<H1>Title</H1>)
    const cell = app.term.buffer.getCell(0, 0)
    expect(cell.char).toBe("T")
    expect(cell.attrs.bold).toBe(true)
    expect(cell.fg).not.toBeNull()
  })

  test("H2 renders text", () => {
    const app = render(<H2>Section</H2>)
    expect(app.text).toContain("Section")
  })

  test("H2 is bold with $fg-accent color", () => {
    const app = render(<H2>Section</H2>)
    const cell = app.term.buffer.getCell(0, 0)
    expect(cell.char).toBe("S")
    expect(cell.attrs.bold).toBe(true)
    expect(cell.fg).not.toBeNull()
  })

  test("H1 and H2 both have foreground colors set", () => {
    const app1 = render(<H1>A</H1>)
    const h1Fg = app1.term.buffer.getCell(0, 0).fg

    const app2 = render(<H2>A</H2>)
    const h2Fg = app2.term.buffer.getCell(0, 0).fg

    // Both use semantic theme colors ($fg-accent for both H1 and H2)
    expect(h1Fg).not.toBeNull()
    expect(h2Fg).not.toBeNull()
  })

  test("H3 renders text", () => {
    const app = render(<H3>Group</H3>)
    expect(app.text).toContain("Group")
  })

  test("H3 is bold with no explicit color (inherits foreground from parent)", () => {
    const app = render(<H3>Group</H3>)
    const cell = app.term.buffer.getCell(0, 0)
    expect(cell.char).toBe("G")
    // h3 variant: { bold: true } — bold emphasis with no default color
    expect(cell.attrs.bold).toBe(true)
    // H3 inherits fg from parent — null when no ancestor sets a color
    expect(cell.fg).toBeNull()
  })

  test("headings accept color override", () => {
    const app = render(<H1 color="$fg-success">OK</H1>)
    const cell = app.term.buffer.getCell(0, 0)
    expect(cell.char).toBe("O")
    expect(cell.attrs.bold).toBe(true)
    // Should have a foreground color (the overridden one)
    expect(cell.fg).not.toBeNull()
  })
})

// ============================================================================
// Body Text
// ============================================================================

describe("Body text", () => {
  test("P renders plain text", () => {
    const app = render(<P>Body text here</P>)
    expect(app.text).toContain("Body text here")
  })

  test("P has no bold/italic by default", () => {
    const app = render(<P>Plain</P>)
    const cell = app.term.buffer.getCell(0, 0)
    expect(cell.attrs.bold).toBeFalsy()
    expect(cell.attrs.italic).toBeFalsy()
  })

  test("Lead renders text in italic", () => {
    const app = render(<Lead>Intro text</Lead>)
    expect(app.text).toContain("Intro text")
    const cell = app.term.buffer.getCell(0, 0)
    expect(cell.attrs.italic).toBe(true)
  })

  test("Lead uses $fg-muted color by default", () => {
    const app = render(<Lead>Intro</Lead>)
    const cell = app.term.buffer.getCell(0, 0)
    expect(cell.fg).not.toBeNull()
  })

  test("Muted renders text with $fg-muted color", () => {
    const app = render(<Muted>Secondary</Muted>)
    expect(app.text).toContain("Secondary")
    const cell = app.term.buffer.getCell(0, 0)
    expect(cell.fg).not.toBeNull()
  })

  test("Muted is not bold or italic", () => {
    const app = render(<Muted>Secondary</Muted>)
    const cell = app.term.buffer.getCell(0, 0)
    expect(cell.attrs.bold).toBeFalsy()
    expect(cell.attrs.italic).toBeFalsy()
  })

  test("Lead and Muted have the same $fg-muted foreground", () => {
    const app1 = render(<Lead>A</Lead>)
    const leadFg = app1.term.buffer.getCell(0, 0).fg

    const app2 = render(<Muted>A</Muted>)
    const mutedFg = app2.term.buffer.getCell(0, 0).fg

    expect(leadFg).toEqual(mutedFg)
  })
})

// ============================================================================
// Inline Emphasis
// ============================================================================

describe("Inline emphasis", () => {
  test("Strong renders bold text", () => {
    const app = render(<Strong>Important</Strong>)
    expect(app.text).toContain("Important")
    const cell = app.term.buffer.getCell(0, 0)
    expect(cell.attrs.bold).toBe(true)
  })

  test("Strong is not italic", () => {
    const app = render(<Strong>Bold</Strong>)
    const cell = app.term.buffer.getCell(0, 0)
    expect(cell.attrs.italic).toBeFalsy()
  })

  test("Em renders italic text", () => {
    const app = render(<Em>Emphasis</Em>)
    expect(app.text).toContain("Emphasis")
    const cell = app.term.buffer.getCell(0, 0)
    expect(cell.attrs.italic).toBe(true)
  })

  test("Em is not bold", () => {
    const app = render(<Em>Italic</Em>)
    const cell = app.term.buffer.getCell(0, 0)
    expect(cell.attrs.bold).toBeFalsy()
  })

  test("Strong and Em accept color override", () => {
    const app1 = render(<Strong color="$fg-success">A</Strong>)
    expect(app1.term.buffer.getCell(0, 0).fg).not.toBeNull()

    const app2 = render(<Em color="$fg-warning">B</Em>)
    expect(app2.term.buffer.getCell(0, 0).fg).not.toBeNull()
  })
})

// ============================================================================
// Inline Code Elements
// ============================================================================

describe("Inline code elements", () => {
  test("Code wraps content with padding spaces", () => {
    const app = render(<Code>fn()</Code>)
    expect(app.text).toContain(" fn() ")
  })

  test("Code has $bg-muted background", () => {
    const app = render(<Code>x</Code>)
    // Find the 'x' character — it's at col 1 because of leading space
    const cell = app.term.buffer.getCell(1, 0)
    expect(cell.char).toBe("x")
    expect(cell.bg).not.toBeNull()
  })

  test("Kbd wraps content with padding spaces", () => {
    const app = render(<Kbd>Ctrl+C</Kbd>)
    expect(app.text).toContain(" Ctrl+C ")
  })

  test("Kbd has $bg-muted background and is bold", () => {
    const app = render(<Kbd>K</Kbd>)
    const cell = app.term.buffer.getCell(1, 0)
    expect(cell.char).toBe("K")
    expect(cell.bg).not.toBeNull()
    expect(cell.attrs.bold).toBe(true)
  })

  test("Code is not bold, Kbd is bold", () => {
    const app1 = render(<Code>a</Code>)
    const codeCell = app1.term.buffer.getCell(1, 0)
    expect(codeCell.attrs.bold).toBeFalsy()

    const app2 = render(<Kbd>a</Kbd>)
    const kbdCell = app2.term.buffer.getCell(1, 0)
    expect(kbdCell.attrs.bold).toBe(true)
  })

  test("Code and Kbd accept color override", () => {
    const app = render(<Code color="$fg-success">ok</Code>)
    const cell = app.term.buffer.getCell(1, 0)
    expect(cell.fg).not.toBeNull()
  })
})

// ============================================================================
// Block Elements
// ============================================================================

describe("Block elements", () => {
  test("Blockquote renders with │ prefix", () => {
    const app = render(<Blockquote>Quoted text</Blockquote>)
    expect(app.text).toContain("│")
    expect(app.text).toContain("Quoted text")
  })

  test("Blockquote content is italic", () => {
    const app = render(<Blockquote>Quote</Blockquote>)
    // Find the 'Q' in "Quote" — after "│ " (2 chars)
    const buffer = app.term.buffer
    let quoteCol = -1
    for (let x = 0; x < 80; x++) {
      if (buffer.getCell(x, 0).char === "Q") {
        quoteCol = x
        break
      }
    }
    expect(quoteCol).toBeGreaterThan(0)
    expect(buffer.getCell(quoteCol, 0).attrs.italic).toBe(true)
  })

  test("Blockquote │ uses $fg-muted color", () => {
    const app = render(<Blockquote>Text</Blockquote>)
    const buffer = app.term.buffer
    // Find the │ character
    let barCol = -1
    for (let x = 0; x < 80; x++) {
      if (buffer.getCell(x, 0).char === "│") {
        barCol = x
        break
      }
    }
    expect(barCol).toBeGreaterThanOrEqual(0)
    expect(buffer.getCell(barCol, 0).fg).not.toBeNull()
  })

  test("CodeBlock renders with │ prefix", () => {
    const app = render(<CodeBlock>const x = 1</CodeBlock>)
    expect(app.text).toContain("│")
    expect(app.text).toContain("const x = 1")
  })

  test("CodeBlock content is not italic", () => {
    const app = render(<CodeBlock>code</CodeBlock>)
    const buffer = app.term.buffer
    let codeCol = -1
    for (let x = 0; x < 80; x++) {
      if (buffer.getCell(x, 0).char === "c") {
        codeCol = x
        break
      }
    }
    expect(codeCol).toBeGreaterThan(0)
    expect(buffer.getCell(codeCol, 0).attrs.italic).toBeFalsy()
  })

  test("CodeBlock │ uses $border-default color", () => {
    const app = render(<CodeBlock>x</CodeBlock>)
    const buffer = app.term.buffer
    let barCol = -1
    for (let x = 0; x < 80; x++) {
      if (buffer.getCell(x, 0).char === "│") {
        barCol = x
        break
      }
    }
    expect(barCol).toBeGreaterThanOrEqual(0)
    // $border-default resolves to a color
    expect(buffer.getCell(barCol, 0).fg).not.toBeNull()
  })

  test("Blockquote and CodeBlock │ have different colors", () => {
    const app1 = render(<Blockquote>a</Blockquote>)
    const buf1 = app1.term.buffer
    let bqBarFg = null
    for (let x = 0; x < 80; x++) {
      if (buf1.getCell(x, 0).char === "│") {
        bqBarFg = buf1.getCell(x, 0).fg
        break
      }
    }

    const app2 = render(<CodeBlock>a</CodeBlock>)
    const buf2 = app2.term.buffer
    let cbBarFg = null
    for (let x = 0; x < 80; x++) {
      if (buf2.getCell(x, 0).char === "│") {
        cbBarFg = buf2.getCell(x, 0).fg
        break
      }
    }

    // $fg-muted and $border-default should be different colors
    expect(bqBarFg).not.toEqual(cbBarFg)
  })
})

// ============================================================================
// Horizontal Rule
// ============================================================================

describe("HR", () => {
  test("renders ─ characters", () => {
    const app = render(<HR />)
    expect(app.text).toContain("─")
  })

  test("uses $border-default color", () => {
    const app = render(<HR />)
    const cell = app.term.buffer.getCell(0, 0)
    expect(cell.char).toBe("─")
    expect(cell.fg).not.toBeNull()
  })

  test("accepts color override", () => {
    const app = render(<HR color="$fg-success" />)
    const cell = app.term.buffer.getCell(0, 0)
    expect(cell.fg).not.toBeNull()
  })

  test("fills available width with ─", () => {
    const narrowRender = createRenderer({ cols: 20, rows: 5 })
    const app = narrowRender(<HR />)
    // Most columns should be ─ (last may be ellipsis from wrap="truncate")
    for (let x = 0; x < 19; x++) {
      expect(app.term.buffer.getCell(x, 0).char).toBe("─")
    }
  })
})

// ============================================================================
// Lists
// ============================================================================

describe("Lists", () => {
  describe("Unordered lists", () => {
    test("UL + LI renders bullet marker", () => {
      const app = render(
        <UL>
          <LI>First</LI>
        </UL>,
      )
      expect(app.text).toContain("•")
      expect(app.text).toContain("First")
    })

    test("UL + multiple LI renders all items", () => {
      const app = render(
        <UL>
          <LI>Alpha</LI>
          <LI>Beta</LI>
          <LI>Gamma</LI>
        </UL>,
      )
      expect(app.text).toContain("Alpha")
      expect(app.text).toContain("Beta")
      expect(app.text).toContain("Gamma")
    })

    test("nested UL uses different bullet at level 2", () => {
      // Nesting UL/OL as sibling elements (not inside LI children text)
      // to avoid Box-in-Text warning

      const app = render(
        <Box flexDirection="column">
          <UL>
            <LI>Outer</LI>
          </UL>
          <UL>
            <UL>
              <LI>Inner</LI>
            </UL>
          </UL>
        </Box>,
      )
      expect(app.text).toContain("•")
      expect(app.text).toContain("◦")
      expect(app.text).toContain("Outer")
      expect(app.text).toContain("Inner")
    })

    test("deeply nested UL cycles through bullet styles", () => {
      const app = render(
        <Box flexDirection="column">
          <UL>
            <LI>L1</LI>
          </UL>
          <UL>
            <UL>
              <LI>L2</LI>
            </UL>
          </UL>
          <UL>
            <UL>
              <UL>
                <LI>L3</LI>
              </UL>
            </UL>
          </UL>
          <UL>
            <UL>
              <UL>
                <UL>
                  <LI>L4</LI>
                </UL>
              </UL>
            </UL>
          </UL>
        </Box>,
      )
      expect(app.text).toContain("•") // level 1
      expect(app.text).toContain("◦") // level 2
      expect(app.text).toContain("▸") // level 3
      expect(app.text).toContain("-") // level 4
    })

    test("nested list increases indent", () => {
      const app = render(
        <Box flexDirection="column">
          <UL>
            <LI>Top</LI>
          </UL>
          <UL>
            <UL>
              <LI>Nested</LI>
            </UL>
          </UL>
        </Box>,
      )
      const buffer = app.term.buffer
      // Find "•" (level 1) and "◦" (level 2)
      let bulletCol1 = -1
      let bulletCol2 = -1
      for (let y = 0; y < 10; y++) {
        for (let x = 0; x < 80; x++) {
          const ch = buffer.getCell(x, y).char
          if (ch === "•" && bulletCol1 === -1) bulletCol1 = x
          if (ch === "◦" && bulletCol2 === -1) bulletCol2 = x
        }
      }
      expect(bulletCol1).toBeGreaterThanOrEqual(0)
      expect(bulletCol2).toBeGreaterThan(bulletCol1)
    })
  })

  describe("Ordered lists", () => {
    test("OL + LI renders numbered markers", () => {
      const app = render(
        <OL>
          <LI>First</LI>
          <LI>Second</LI>
          <LI>Third</LI>
        </OL>,
      )
      expect(app.text).toContain("1.")
      expect(app.text).toContain("2.")
      expect(app.text).toContain("3.")
      expect(app.text).toContain("First")
      expect(app.text).toContain("Second")
      expect(app.text).toContain("Third")
    })

    test("OL auto-numbers only LI children", () => {
      const app = render(
        <OL>
          <LI>One</LI>
          <LI>Two</LI>
        </OL>,
      )
      expect(app.text).toContain("1.")
      expect(app.text).toContain("2.")
      // Should not have "3."
      expect(app.text).not.toContain("3.")
    })
  })

  describe("LI styling", () => {
    test("LI marker uses $fg-muted color by default", () => {
      const app = render(
        <UL>
          <LI>Item</LI>
        </UL>,
      )
      const buffer = app.term.buffer
      // Find the bullet character
      let bulletCol = -1
      let bulletRow = -1
      for (let y = 0; y < 10; y++) {
        for (let x = 0; x < 80; x++) {
          if (buffer.getCell(x, y).char === "•") {
            bulletCol = x
            bulletRow = y
            break
          }
        }
        if (bulletCol >= 0) break
      }
      expect(bulletCol).toBeGreaterThanOrEqual(0)
      expect(buffer.getCell(bulletCol, bulletRow).fg).not.toBeNull()
    })

    test("LI accepts color override", () => {
      const app = render(
        <UL>
          <LI color="$fg-success">Green item</LI>
        </UL>,
      )
      expect(app.text).toContain("Green item")
      // Both marker and text should have the override color
      const buffer = app.term.buffer
      let bulletCol = -1
      let bulletRow = -1
      for (let y = 0; y < 10; y++) {
        for (let x = 0; x < 80; x++) {
          if (buffer.getCell(x, y).char === "•") {
            bulletCol = x
            bulletRow = y
            break
          }
        }
        if (bulletCol >= 0) break
      }
      expect(bulletCol).toBeGreaterThanOrEqual(0)
      expect(buffer.getCell(bulletCol, bulletRow).fg).not.toBeNull()
    })
  })

  describe("Mixed list types", () => {
    test("OL nested inside UL context", () => {
      const app = render(
        <Box flexDirection="column">
          <UL>
            <LI>Bullet</LI>
          </UL>
          <UL>
            <OL>
              <LI>Numbered</LI>
            </OL>
          </UL>
        </Box>,
      )
      expect(app.text).toContain("•")
      expect(app.text).toContain("1.")
      expect(app.text).toContain("Bullet")
      expect(app.text).toContain("Numbered")
    })

    test("UL nested inside OL context", () => {
      const app = render(
        <Box flexDirection="column">
          <OL>
            <LI>First</LI>
          </OL>
          <OL>
            <UL>
              <LI>Sub-bullet</LI>
            </UL>
          </OL>
        </Box>,
      )
      expect(app.text).toContain("1.")
      expect(app.text).toContain("◦")
      expect(app.text).toContain("First")
      expect(app.text).toContain("Sub-bullet")
    })
  })
})

// ============================================================================
// Color override (cross-cutting)
// ============================================================================

describe("Color override", () => {
  test.each([
    ["H1", <H1 color="$fg-success">X</H1>],
    ["H2", <H2 color="$fg-success">X</H2>],
    ["H3", <H3 color="$fg-success">X</H3>],
    ["P", <P color="$fg-success">X</P>],
    ["Lead", <Lead color="$fg-success">X</Lead>],
    ["Muted", <Muted color="$fg-success">X</Muted>],
    ["Strong", <Strong color="$fg-success">X</Strong>],
    ["Em", <Em color="$fg-success">X</Em>],
  ] as const)("%s accepts color override", (_name, element) => {
    const app = render(element)
    expect(app.text).toContain("X")
    // Find the X character and verify it has a foreground color
    const buffer = app.term.buffer
    let found = false
    for (let x = 0; x < 80; x++) {
      if (buffer.getCell(x, 0).char === "X") {
        expect(buffer.getCell(x, 0).fg).not.toBeNull()
        found = true
        break
      }
    }
    expect(found).toBe(true)
  })
})
