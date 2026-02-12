/**
 * Wide Character Truncation Tests (km-inkx.wide-char-truncate)
 *
 * Verifies that text-presentation emoji characters (e.g., ⚠ U+26A0,
 * ☑ U+2611) are treated as 2 columns wide to match terminal rendering.
 *
 * These characters have the Extended_Pictographic Unicode property with
 * default text presentation. string-width@8 reports them as width 1 per
 * Unicode EAW tables, but most modern terminals render them as 2 columns
 * using emoji glyphs. The mismatch caused text after these characters to
 * be placed at the wrong column, truncating trailing content.
 */

import { createElement } from "react"
import { describe, expect, test } from "vitest"
import { TerminalBuffer } from "../src/buffer.js"
import { Box, Text } from "../src/index.js"
import { createRenderer } from "../src/testing/index.js"
import {
  displayWidth,
  ensureEmojiPresentation,
  graphemeWidth,
  isWideGrapheme,
  writeTextToBuffer,
} from "../src/unicode.js"

const render = createRenderer({ cols: 80, rows: 24 })

describe("Wide Character Truncation (km-inkx.wide-char-truncate)", () => {
  // =========================================================================
  // Width Calculation
  // =========================================================================
  describe("graphemeWidth corrections", () => {
    test("⚠ (U+26A0) is width 2 — text-presentation emoji", () => {
      expect(graphemeWidth("⚠")).toBe(2)
      expect(isWideGrapheme("⚠")).toBe(true)
    })

    test("☑ (U+2611) is width 2 — text-presentation emoji", () => {
      expect(graphemeWidth("☑")).toBe(2)
      expect(isWideGrapheme("☑")).toBe(true)
    })

    test("☐ (U+2610) is width 1 — not an emoji", () => {
      expect(graphemeWidth("☐")).toBe(1)
      expect(isWideGrapheme("☐")).toBe(false)
    })

    test("☒ (U+2612) is width 1 — not an emoji", () => {
      expect(graphemeWidth("☒")).toBe(1)
      expect(isWideGrapheme("☒")).toBe(false)
    })

    test("📁 (U+1F4C1) is width 2 — emoji presentation by default", () => {
      expect(graphemeWidth("📁")).toBe(2)
      expect(isWideGrapheme("📁")).toBe(true)
    })

    test("other text-presentation emoji are width 2", () => {
      // Common symbols that terminals render wide
      expect(graphemeWidth("✈")).toBe(2) // airplane
      expect(graphemeWidth("❤")).toBe(2) // heavy black heart
      expect(graphemeWidth("✔")).toBe(2) // heavy check mark
      expect(graphemeWidth("⬆")).toBe(2) // upwards arrow
      expect(graphemeWidth("▶")).toBe(2) // play button
    })

    test("ASCII characters are still width 1", () => {
      expect(graphemeWidth("A")).toBe(1)
      expect(graphemeWidth(" ")).toBe(1)
      expect(graphemeWidth("1")).toBe(1)
    })

    test("CJK characters are still width 2", () => {
      expect(graphemeWidth("中")).toBe(2)
      expect(graphemeWidth("한")).toBe(2)
    })
  })

  // =========================================================================
  // displayWidth
  // =========================================================================
  describe("displayWidth with text-presentation emoji", () => {
    test("⚠ Task 1 is width 9 (not 8)", () => {
      // ⚠(2) + space(1) + Task(4) + space(1) + 1(1) = 9
      expect(displayWidth("⚠ Task 1")).toBe(9)
    })

    test("☑ Task 1 is width 9 (not 8)", () => {
      expect(displayWidth("☑ Task 1")).toBe(9)
    })

    test("☐ Task 1 is width 8 (☐ is not emoji)", () => {
      // ☐(1) + space(1) + Task(4) + space(1) + 1(1) = 8
      expect(displayWidth("☐ Task 1")).toBe(8)
    })

    test("📁 Task 1 is width 9 (emoji presentation)", () => {
      expect(displayWidth("📁 Task 1")).toBe(9)
    })

    test("plain ASCII string width unchanged", () => {
      expect(displayWidth("hello")).toBe(5)
      expect(displayWidth("Task 1")).toBe(6)
    })
  })

  // =========================================================================
  // Buffer Writing
  // =========================================================================
  describe("buffer writing with text-presentation emoji", () => {
    test("⚠ occupies 2 cells in buffer (wide + continuation)", () => {
      const buffer = new TerminalBuffer(20, 1)
      const endCol = writeTextToBuffer(buffer, 0, 0, "⚠")
      expect(endCol).toBe(2)
      expect(buffer.getCell(0, 0).char).toBe("⚠\uFE0F") // VS16 added for terminal rendering
      expect(buffer.getCell(0, 0).wide).toBe(true)
      expect(buffer.getCell(1, 0).continuation).toBe(true)
    })

    test("☑ occupies 2 cells in buffer", () => {
      const buffer = new TerminalBuffer(20, 1)
      const endCol = writeTextToBuffer(buffer, 0, 0, "☑")
      expect(endCol).toBe(2)
      expect(buffer.getCell(0, 0).wide).toBe(true)
      expect(buffer.getCell(1, 0).continuation).toBe(true)
    })

    test("⚠ Task 1 is fully written to buffer", () => {
      const buffer = new TerminalBuffer(20, 1)
      writeTextToBuffer(buffer, 0, 0, "⚠ Task 1")
      // ⚠ at col 0-1, space at col 2, T at 3, a at 4, s at 5, k at 6, space at 7, 1 at 8
      expect(buffer.getCell(0, 0).char).toBe("⚠\uFE0F") // VS16 added for terminal rendering
      expect(buffer.getCell(0, 0).wide).toBe(true)
      expect(buffer.getCell(1, 0).continuation).toBe(true)
      expect(buffer.getCell(2, 0).char).toBe(" ")
      expect(buffer.getCell(3, 0).char).toBe("T")
      expect(buffer.getCell(8, 0).char).toBe("1")
    })

    test("☐ Task 1 is fully written (☐ is width 1)", () => {
      const buffer = new TerminalBuffer(20, 1)
      writeTextToBuffer(buffer, 0, 0, "☐ Task 1")
      // ☐ at col 0, space at col 1, T at 2, ...
      expect(buffer.getCell(0, 0).char).toBe("☐")
      expect(buffer.getCell(0, 0).wide).toBe(false)
      expect(buffer.getCell(1, 0).char).toBe(" ")
      expect(buffer.getCell(7, 0).char).toBe("1")
    })
  })

  // =========================================================================
  // renderStatic (integration)
  // =========================================================================
  describe("renderStatic preserves text after wide emoji", () => {
    test("⚠ Task 1 renders completely", () => {
      const app = render(createElement(Text, null, "⚠ Task 1"))
      expect(app.text).toContain("⚠\uFE0F Task 1") // VS16 added in buffer
    })

    test("☑ Task 1 renders completely", () => {
      const app = render(createElement(Text, null, "☑ Task 1"))
      expect(app.text).toContain("☑\uFE0F Task 1") // VS16 added in buffer
    })

    test("☐ Task 1 renders completely", () => {
      const app = render(createElement(Text, null, "☐ Task 1"))
      expect(app.text).toContain("☐ Task 1")
    })

    test("☒ Task 1 renders completely", () => {
      const app = render(createElement(Text, null, "☒ Task 1"))
      expect(app.text).toContain("☒ Task 1")
    })

    test("📁 Task 1 renders completely", () => {
      const app = render(createElement(Text, null, "📁 Task 1"))
      expect(app.text).toContain("📁 Task 1")
    })
  })

  // =========================================================================
  // Bordered Box alignment with text-presentation emoji
  // =========================================================================
  describe("bordered Box alignment with text-presentation emoji", () => {
    test("ℹ in bordered Box: all rows same display width", () => {
      const app = render(
        createElement(Box, { borderStyle: "round", width: 30 }, createElement(Text, null, "ℹ Task completed!")),
      )
      const lines = app.text.split("\n")
      const widths = lines.map((l) => displayWidth(l))
      expect(widths[0]).toBe(widths[1]) // border == content
      expect(widths[1]).toBe(widths[2]) // content == border
    })

    test("⚠ in bordered Box: all rows same display width", () => {
      const app = render(
        createElement(Box, { borderStyle: "round", width: 30 }, createElement(Text, null, "⚠ Warning message")),
      )
      const lines = app.text.split("\n")
      const widths = lines.map((l) => displayWidth(l))
      expect(widths[0]).toBe(widths[1])
    })

    test("VS16 is present in buffer output for text-presentation emoji", () => {
      const buffer = new TerminalBuffer(20, 1)
      writeTextToBuffer(buffer, 0, 0, "ℹ")
      expect(buffer.getCell(0, 0).char).toBe("ℹ\uFE0F")
      expect(buffer.getCell(0, 0).wide).toBe(true)
      expect(buffer.getCell(1, 0).continuation).toBe(true)
    })

    test("CJK chars do NOT get VS16 added", () => {
      const buffer = new TerminalBuffer(20, 1)
      writeTextToBuffer(buffer, 0, 0, "中")
      expect(buffer.getCell(0, 0).char).toBe("中") // no VS16
      expect(buffer.getCell(0, 0).wide).toBe(true)
    })
  })

  // =========================================================================
  // ensureEmojiPresentation utility
  // =========================================================================
  describe("ensureEmojiPresentation", () => {
    test("adds VS16 to text-presentation emoji", () => {
      expect(ensureEmojiPresentation("⚠")).toBe("⚠\uFE0F")
      expect(ensureEmojiPresentation("☑")).toBe("☑\uFE0F")
    })

    test("does not modify non-emoji characters", () => {
      expect(ensureEmojiPresentation("☐")).toBe("☐")
      expect(ensureEmojiPresentation("☒")).toBe("☒")
      expect(ensureEmojiPresentation("A")).toBe("A")
    })

    test("does not modify characters with default emoji presentation", () => {
      expect(ensureEmojiPresentation("📁")).toBe("📁")
    })

    test("does not add duplicate VS16", () => {
      expect(ensureEmojiPresentation("⚠\uFE0F")).toBe("⚠\uFE0F")
    })
  })
})
