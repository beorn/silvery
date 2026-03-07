/**
 * Hightea Render Tests
 *
 * Basic tests for the render function and testing library.
 */

import { createElement } from "react"
import { describe, expect, it } from "vitest"
import { Box, Text } from "../src/index.js"
import { createRenderer } from "@hightea/term/testing"
import { expectFrame, normalizeFrame, stripAnsi } from "./setup.js"

const render = createRenderer()

describe("render", () => {
  describe("basic rendering", () => {
    it("renders a simple string", () => {
      const app = render(createElement(Text, null, "Hello, World!"))

      expect(app.ansi).toBeDefined()
      expectFrame(app.ansi).toContain("Hello, World!")
    })

    it("renders nested elements", () => {
      const element = createElement(Box, null, createElement(Text, null, "Line 1"), createElement(Text, null, "Line 2"))

      const app = render(element)

      expectFrame(app.ansi).toContain("Line 1")
      expectFrame(app.ansi).toContain("Line 2")
    })

    it("returns undefined lastFrame when no frames exist", () => {
      const app = render(createElement(Text, null, "Hello"))
      app.clear()
      expect(app.lastFrame()).toBeUndefined()
    })
  })

  describe("frames tracking", () => {
    it("tracks all rendered frames", () => {
      const app = render(createElement(Text, null, "Frame 1"))

      expect(app.frames).toHaveLength(1)

      app.rerender(createElement(Text, null, "Frame 2"))
      expect(app.frames).toHaveLength(2)

      app.rerender(createElement(Text, null, "Frame 3"))
      expect(app.frames).toHaveLength(3)
    })

    it("frames array contains actual content", () => {
      const app = render(createElement(Text, null, "First"))

      app.rerender(createElement(Text, null, "Second"))
      app.rerender(createElement(Text, null, "Third"))

      expect(normalizeFrame(app.frames[0]!)).toContain("First")
      expect(normalizeFrame(app.frames[1]!)).toContain("Second")
      expect(normalizeFrame(app.frames[2]!)).toContain("Third")
    })

    it("app.clear() empties the frames array", () => {
      const app = render(createElement(Text, null, "Initial"))

      app.rerender(createElement(Text, null, "More"))
      expect(app.frames).toHaveLength(2)

      app.clear()
      expect(app.frames).toHaveLength(0)
    })
  })

  describe("rerender", () => {
    it("updates content on rerender", () => {
      const app = render(createElement(Text, null, "Before"))

      expectFrame(app.ansi).toContain("Before")

      app.rerender(createElement(Text, null, "After"))

      expectFrame(app.ansi).toContain("After")
    })

    it("throws when rerendering after unmount", () => {
      const app = render(createElement(Text, null, "Test"))

      app.unmount()

      expect(() => {
        app.rerender(createElement(Text, null, "Should fail"))
      }).toThrow("Cannot rerender after unmount")
    })
  })

  describe("unmount", () => {
    it("unmounts successfully", () => {
      const app = render(createElement(Text, null, "Content"))

      app.unmount()

      // lastFrame should still return the last rendered content
      expectFrame(app.ansi).toContain("Content")
    })

    it("throws when unmounting twice", () => {
      const app = render(createElement(Text, null, "Test"))

      app.unmount()

      expect(() => {
        app.unmount()
      }).toThrow("Already unmounted")
    })
  })

  describe("stdin", () => {
    it("provides stdin.write method", () => {
      const app = render(createElement(Text, null, "Test"))

      expect(typeof app.stdin.write).toBe("function")
    })

    it("throws when writing after unmount", () => {
      const app = render(createElement(Text, null, "Test"))

      app.unmount()

      expect(() => {
        app.stdin.write("input")
      }).toThrow("Cannot write to stdin after unmount")
    })
  })

  describe("options", () => {
    it("accepts columns option via createRenderer", () => {
      const customRender = createRenderer({ cols: 40 })
      const app = customRender(createElement(Text, null, "Test"))

      expect(app.ansi).toBeDefined()
    })

    it("accepts rows option via createRenderer", () => {
      const customRender = createRenderer({ rows: 10 })
      const app = customRender(createElement(Text, null, "Test"))

      expect(app.ansi).toBeDefined()
    })

    it("accepts debug option", () => {
      // Debug mode should not throw
      const app = render(createElement(Text, null, "Test"), {
        debug: false,
      })

      expect(app.ansi).toBeDefined()
    })
  })
})

describe("test utilities", () => {
  describe("stripAnsi", () => {
    it("removes ANSI color codes", () => {
      const colored = "\x1B[31mRed\x1B[0m"
      expect(stripAnsi(colored)).toBe("Red")
    })

    it("removes multiple ANSI codes", () => {
      const styled = "\x1B[1m\x1B[32mBold Green\x1B[0m"
      expect(stripAnsi(styled)).toBe("Bold Green")
    })

    it("preserves plain text", () => {
      const plain = "No styling here"
      expect(stripAnsi(plain)).toBe("No styling here")
    })
  })

  describe("normalizeFrame", () => {
    it("strips ANSI and trims whitespace", () => {
      const frame = "\x1B[32mHello\x1B[0m   \n  World  \n"
      expect(normalizeFrame(frame)).toBe("Hello\n  World")
    })

    it("removes trailing empty lines", () => {
      const frame = "Content\n\n\n"
      expect(normalizeFrame(frame)).toBe("Content")
    })
  })

  describe("expectFrame", () => {
    it("provides toContain matcher", () => {
      const frame = "Hello, World!"
      expectFrame(frame).toContain("World")
    })

    it("provides toBe matcher", () => {
      const frame = "Exact match"
      expectFrame(frame).toBe("Exact match")
    })

    it("provides toMatch matcher", () => {
      const frame = "Test 123"
      expectFrame(frame).toMatch(/Test \d+/)
    })

    it("handles undefined frame", () => {
      expectFrame(undefined).toBeEmpty()
    })
  })

  describe("nested Text styling", () => {
    it("nested Text color overrides parent color", () => {
      const element = createElement(
        Text,
        { color: "black" },
        "before ",
        createElement(Text, { color: "red" }, "RED"),
        " after",
      )

      const app = render(element)
      const frame = app.ansi

      // Verify text content is present
      expectFrame(frame).toContain("before")
      expectFrame(frame).toContain("RED")
      expectFrame(frame).toContain("after")

      // Verify red ANSI code is present (38;5;1 is red in 256-color mode)
      // The code may appear with other modifiers, so use regex
      expect(frame).toMatch(/\x1b\[[\d;]*38;5;1[\d;]*m/)
    })

    it("nested Text can have different background color", () => {
      const element = createElement(
        Text,
        null,
        "normal ",
        createElement(Text, { backgroundColor: "yellow" }, "highlighted"),
      )

      const app = render(element)
      const frame = app.ansi

      expectFrame(frame).toContain("normal")
      expectFrame(frame).toContain("highlighted")

      // Verify yellow background ANSI code (48;5;3 is yellow)
      expect(frame).toMatch(/\x1b\[[\d;]*48;5;3[\d;]*m/)
    })

    it("nested Text can have multiple styles", () => {
      const element = createElement(
        Text,
        null,
        "start ",
        createElement(Text, { color: "blue", bold: true }, "bold blue"),
        " end",
      )

      const app = render(element)
      const frame = app.ansi

      expectFrame(frame).toContain("bold blue")

      // Verify blue (38;5;4) is present somewhere
      expect(frame).toMatch(/38;5;4/)
      // Verify bold (1) is present somewhere
      expect(frame).toMatch(/[;\[]1[;\dm]/)
    })

    it("deeply nested Text applies all styles", () => {
      const element = createElement(
        Text,
        null,
        createElement(Text, { color: "green" }, "green ", createElement(Text, { bold: true }, "green+bold")),
      )

      const app = render(element)
      const frame = app.ansi

      expectFrame(frame).toContain("green")
      expectFrame(frame).toContain("green+bold")

      // Verify green color (38;5;2) is present
      expect(frame).toMatch(/38;5;2/)
    })

    it("should render black foreground color (color index 0)", () => {
      // This is a regression test for the bug where black (color index 0)
      // was being treated as null/default because 0 was used as the sentinel
      // value for "no color". Fixed by using +1 offset in color packing.
      const element = createElement(
        Box,
        { backgroundColor: "yellow" },
        createElement(Text, { color: "black" }, "BLACK"),
      )

      const app = render(element)
      const frame = app.ansi

      expectFrame(frame).toContain("BLACK")

      // Verify black foreground (38;5;0) is present
      expect(frame).toMatch(/38;5;0/)
      // Verify yellow background (48;5;3) is present
      expect(frame).toMatch(/48;5;3/)
    })

    it("should render black background color (color index 0)", () => {
      const element = createElement(Box, { backgroundColor: "black" }, createElement(Text, { color: "white" }, "WHITE"))

      const app = render(element)
      const frame = app.ansi

      expectFrame(frame).toContain("WHITE")

      // Verify white foreground (38;5;7) is present
      expect(frame).toMatch(/38;5;7/)
      // Verify black background (48;5;0) is present
      expect(frame).toMatch(/48;5;0/)
    })

    it("should restore parent style after nested Text (push/pop)", () => {
      // Parent has black color, child overrides to red, text after should be black again
      const element = createElement(
        Text,
        { color: "black" },
        "before ",
        createElement(Text, { color: "red" }, "RED"),
        " after",
      )

      const app = render(element)
      const frame = app.ansi

      expectFrame(frame).toContain("before")
      expectFrame(frame).toContain("RED")
      expectFrame(frame).toContain("after")

      // Should see: black code, then red code, then reset+black code again
      // The pattern should show restoration of black (38;5;0) after red (38;5;1)
      expect(frame).toMatch(/38;5;0.*38;5;1.*38;5;0/)
    })

    it("should restore bold after nested dim (style stack)", () => {
      // Parent is bold+white, child adds dim for count, text after should be bold+white
      const element = createElement(
        Text,
        { bold: true, color: "white" },
        "Title",
        createElement(Text, { dimColor: true }, " (5)"),
        " more",
      )

      const app = render(element)
      const frame = app.ansi

      expectFrame(frame).toContain("Title")
      expectFrame(frame).toContain("(5)")
      expectFrame(frame).toContain("more")

      // After the dim section, bold should be restored
      // Look for: white+bold, then white+bold+dim, then white+bold again
      // The frame should contain bold (1) being reapplied after dim section
      expect(frame).toMatch(/;1m.*;1;2m.*;1m/)
    })

    it("should handle deep nesting with proper restoration", () => {
      // white > red > blue > back to red > back to white
      const element = createElement(
        Text,
        { color: "white" },
        "W",
        createElement(Text, { color: "red" }, "R", createElement(Text, { color: "blue" }, "B"), "R"),
        "W",
      )

      const app = render(element)
      const frame = app.ansi

      expectFrame(frame).toContain("W")
      expectFrame(frame).toContain("R")
      expectFrame(frame).toContain("B")

      // Pattern: white(7) > red(1) > blue(4) > red(1) > white(7)
      expect(frame).toMatch(/38;5;7.*38;5;1.*38;5;4.*38;5;1.*38;5;7/)
    })
  })
})
