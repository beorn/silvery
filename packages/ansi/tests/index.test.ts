/**
 * Integration tests for @hightea/ansi
 *
 * Tests the main index exports work correctly together.
 * Detailed unit tests are in separate files:
 * - detection.test.ts
 * - underline.test.ts
 * - hyperlink.test.ts
 * - utils.test.ts
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest"
import chalk from "chalk"

// Test that all exports are accessible from main index
import {
  // Types
  type UnderlineStyle,
  type RGB,
  // Utilities
  ANSI_REGEX,
  stripAnsi,
  displayLength,
  // Detection
  detectExtendedUnderline,
  // Underline functions
  underline,
  curlyUnderline,
  dottedUnderline,
  dashedUnderline,
  doubleUnderline,
  underlineColor,
  styledUnderline,
  // Hyperlinks
  hyperlink,
  // Hightea compatibility
  bgOverride,
  // Term API
  createTerm,
  term,
} from "../src/index.js"

describe("@hightea/ansi integration", () => {
  // Save original env values
  const origTerm = process.env.TERM
  const origTermProgram = process.env.TERM_PROGRAM
  const origKitty = process.env.KITTY_WINDOW_ID

  beforeEach(() => {
    // Force env to trigger detectExtendedUnderline() === true
    process.env.TERM = "xterm-ghostty"
    // Force chalk to output colors in test environment
    chalk.level = 3
  })

  afterEach(() => {
    if (origTerm !== undefined) process.env.TERM = origTerm
    else delete process.env.TERM
    if (origTermProgram !== undefined) {
      process.env.TERM_PROGRAM = origTermProgram
    } else delete process.env.TERM_PROGRAM
    if (origKitty !== undefined) process.env.KITTY_WINDOW_ID = origKitty
    else delete process.env.KITTY_WINDOW_ID
  })

  describe("exports", () => {
    it("exports all expected functions", () => {
      expect(typeof curlyUnderline).toBe("function")
      expect(typeof dottedUnderline).toBe("function")
      expect(typeof dashedUnderline).toBe("function")
      expect(typeof doubleUnderline).toBe("function")
      expect(typeof underline).toBe("function")
      expect(typeof underlineColor).toBe("function")
      expect(typeof styledUnderline).toBe("function")
      expect(typeof hyperlink).toBe("function")
      expect(typeof bgOverride).toBe("function")
      expect(typeof stripAnsi).toBe("function")
      expect(typeof displayLength).toBe("function")
      expect(typeof detectExtendedUnderline).toBe("function")
      expect(typeof createTerm).toBe("function")
    })

    it("exports default term instance", () => {
      expect(term).toBeDefined()
      expect(typeof term.red).toBe("function")
      expect(typeof term.bold).toBe("function")
    })

    it("exports ANSI_REGEX", () => {
      expect(ANSI_REGEX).toBeInstanceOf(RegExp)
    })
  })

  describe("term styling", () => {
    it("term styling works correctly", () => {
      using t = createTerm({ color: "truecolor" })
      const red = t.red("error")
      expect(red).toContain("\x1b[31m")
      expect(stripAnsi(red)).toBe("error")
    })

    it("can combine term colors with extended underlines", () => {
      using t = createTerm({ color: "truecolor" })
      const styled = t.red(curlyUnderline("error message"))
      expect(styled).toContain("\x1b[31m") // Red
      expect(styled).toContain("\x1b[4:3m") // Curly
      expect(stripAnsi(styled)).toBe("error message")
    })
  })

  describe("end-to-end styling", () => {
    it("creates a complete styled output", () => {
      using t = createTerm({ color: "truecolor" })
      // Simulate IDE-style error display
      const errorLine = `${t.red(curlyUnderline("typo"))} in ${hyperlink("file.ts:10", "vscode://file/path/to/file.ts:10")}`

      // Verify structure
      expect(errorLine).toContain("\x1b[31m") // Red color
      expect(errorLine).toContain("\x1b[4:3m") // Curly underline
      expect(errorLine).toContain("\x1b]8;;") // Hyperlink

      // Verify readable text
      const text = stripAnsi(errorLine)
      expect(text).toBe("typo in file.ts:10")
    })

    it("displayLength works with complex styled text", () => {
      using t = createTerm({ color: "truecolor" })
      const styled = `${t.bold(curlyUnderline("Hello"))} ${underlineColor(255, 0, 0, "World")}!`
      expect(displayLength(styled)).toBe(12) // "Hello World!"
    })
  })

  describe("type safety", () => {
    it("UnderlineStyle type works", () => {
      const style: UnderlineStyle = "curly"
      const result = underline("text", style)
      expect(stripAnsi(result)).toBe("text")
    })

    it("RGB type works", () => {
      const color: RGB = [255, 128, 64]
      const result = styledUnderline("dashed", color, "text")
      expect(stripAnsi(result)).toBe("text")
    })
  })

  describe("bgOverride", () => {
    it("wraps text with private SGR code 9999", () => {
      const result = bgOverride("test")
      expect(result).toBe("\x1b[9999mtest")
    })

    it("works with chalk backgrounds", () => {
      const result = bgOverride(chalk.bgBlack("styled"))
      expect(result).toContain("\x1b[9999m")
      expect(result).toContain("\x1b[40m") // bgBlack code
      expect(stripAnsi(result)).toBe("styled")
    })
  })
})
