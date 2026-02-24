/**
 * Non-TTY Environment Tests (km-wvgu, km-inkx-nontty)
 *
 * Tests for inkx behavior when running in environments without a TTY:
 * - Piped output (stdout is not a TTY)
 * - CI environments (no interactive terminal)
 * - Running without a terminal attached
 * - Graceful degradation behavior
 * - Non-TTY mode detection and output transformation
 *
 * The test renderer uses 80x24 dimensions by default, which matches
 * the fallback behavior when stdout.columns/rows are undefined (non-TTY).
 */

import { describe, expect, test } from "vitest"
import { Box, Text } from "../src/components/index.js"
import { countLines, isTTY, resolveNonTTYMode, stripAnsi, toLineByLineOutput, toPlainOutput } from "../src/non-tty.js"
import { createRenderer, normalizeFrame } from "inkx/testing"

// Single shared render instance (required pattern for inkx tests)
const render = createRenderer()

describe("Non-TTY environments (km-wvgu)", () => {
  describe("Default dimensions when no TTY", () => {
    test("renders with default 80x24 dimensions", () => {
      const app = render(
        <Box width={80}>
          <Text>Full width text</Text>
        </Box>,
      )
      expect(app.ansi).toContain("Full width text")
    })

    test("uses fallback dimensions for vertical layout", () => {
      const app = render(
        <Box flexDirection="column">
          <Text>Line 1</Text>
          <Text>Line 2</Text>
        </Box>,
      )
      const frame = normalizeFrame(app.ansi)
      expect(frame).toContain("Line 1")
      expect(frame).toContain("Line 2")
    })
  })

  describe("Does not crash when stdout is piped", () => {
    test("basic text rendering works", () => {
      const app = render(<Text>Hello World</Text>)
      expect(app.ansi).toContain("Hello World")
    })

    test("nested boxes render correctly", () => {
      const app = render(
        <Box flexDirection="column">
          <Box flexDirection="row">
            <Text>A</Text>
            <Text>B</Text>
          </Box>
        </Box>,
      )
      expect(app.ansi).toContain("A")
      expect(app.ansi).toContain("B")
    })

    test("borders render correctly", () => {
      const app = render(
        <Box borderStyle="single" width={10} height={3}>
          <Text>Hi</Text>
        </Box>,
      )
      expect(app.ansi).toContain("Hi")
    })

    test("rerender works correctly", () => {
      const app = render(<Text>Initial</Text>)
      expect(app.ansi).toContain("Initial")
      app.rerender(<Text>Updated</Text>)
      expect(app.ansi).toContain("Updated")
    })
  })

  describe("Graceful degradation", () => {
    test("styled text renders without crash", () => {
      const app = render(
        <Box>
          <Text color="red">Red</Text>
          <Text bold>Bold</Text>
        </Box>,
      )
      const frame = normalizeFrame(app.ansi)
      expect(frame).toContain("Red")
      expect(frame).toContain("Bold")
    })

    test("unmount works cleanly", () => {
      const app = render(<Text>Cleanup test</Text>)
      expect(app.ansi).toContain("Cleanup test")
      app.unmount()
      expect(app.ansi).toContain("Cleanup test")
    })
  })

  describe("Edge cases", () => {
    test("handles empty content", () => {
      const app = render(
        <Box>
          <Text />
        </Box>,
      )
      expect(app.ansi).toBeDefined()
    })
  })
})

describe("Non-TTY Mode Detection (km-inkx-nontty)", () => {
  describe("isTTY detection", () => {
    test("returns false for non-TTY stream", () => {
      const mockStream = { isTTY: false } as NodeJS.WriteStream
      expect(isTTY(mockStream)).toBe(false)
    })

    test("returns false for undefined isTTY", () => {
      const mockStream = {} as NodeJS.WriteStream
      expect(isTTY(mockStream)).toBe(false)
    })

    test("returns true for TTY stream without CI env", () => {
      // Save and clear CI env vars
      const savedEnv = {
        CI: process.env.CI,
        GITHUB_ACTIONS: process.env.GITHUB_ACTIONS,
        GITLAB_CI: process.env.GITLAB_CI,
        JENKINS_URL: process.env.JENKINS_URL,
        TERM: process.env.TERM,
      }
      delete process.env.CI
      delete process.env.GITHUB_ACTIONS
      delete process.env.GITLAB_CI
      delete process.env.JENKINS_URL
      delete process.env.TERM

      try {
        const mockStream = { isTTY: true } as NodeJS.WriteStream
        expect(isTTY(mockStream)).toBe(true)
      } finally {
        // Restore env
        if (savedEnv.CI) process.env.CI = savedEnv.CI
        if (savedEnv.GITHUB_ACTIONS) {
          process.env.GITHUB_ACTIONS = savedEnv.GITHUB_ACTIONS
        }
        if (savedEnv.GITLAB_CI) process.env.GITLAB_CI = savedEnv.GITLAB_CI
        if (savedEnv.JENKINS_URL) process.env.JENKINS_URL = savedEnv.JENKINS_URL
        if (savedEnv.TERM) process.env.TERM = savedEnv.TERM
      }
    })

    test("returns false when TERM=dumb", () => {
      const savedTerm = process.env.TERM
      process.env.TERM = "dumb"
      try {
        const mockStream = { isTTY: true } as NodeJS.WriteStream
        expect(isTTY(mockStream)).toBe(false)
      } finally {
        if (savedTerm) {
          process.env.TERM = savedTerm
        } else {
          delete process.env.TERM
        }
      }
    })
  })

  describe("resolveNonTTYMode", () => {
    test("returns specified mode when not auto", () => {
      expect(resolveNonTTYMode({ mode: "tty" })).toBe("tty")
      expect(resolveNonTTYMode({ mode: "line-by-line" })).toBe("line-by-line")
      expect(resolveNonTTYMode({ mode: "static" })).toBe("static")
      expect(resolveNonTTYMode({ mode: "plain" })).toBe("plain")
    })

    test("returns line-by-line for non-TTY in auto mode", () => {
      const mockStream = { isTTY: false } as NodeJS.WriteStream
      expect(resolveNonTTYMode({ mode: "auto", stdout: mockStream })).toBe("line-by-line")
    })
  })
})

describe("Non-TTY Output Transformations (km-inkx-nontty)", () => {
  describe("stripAnsi", () => {
    test("strips CSI sequences", () => {
      expect(stripAnsi("\x1b[31mred\x1b[0m")).toBe("red")
      expect(stripAnsi("\x1b[1;32mbold green\x1b[0m")).toBe("bold green")
    })

    test("strips cursor movement", () => {
      expect(stripAnsi("\x1b[5A")).toBe("") // Move up
      expect(stripAnsi("\x1b[10B")).toBe("") // Move down
      expect(stripAnsi("\x1b[H")).toBe("") // Cursor home
      expect(stripAnsi("\x1b[2J")).toBe("") // Clear screen
    })

    test("preserves plain text", () => {
      expect(stripAnsi("hello world")).toBe("hello world")
      expect(stripAnsi("line1\nline2")).toBe("line1\nline2")
    })

    test("handles mixed content", () => {
      expect(stripAnsi("prefix\x1b[31mcolored\x1b[0msuffix")).toBe("prefixcoloredsuffix")
    })
  })

  describe("toPlainOutput", () => {
    test("strips ANSI and trims lines", () => {
      const input = "\x1b[31mhello\x1b[0m  \n\x1b[32mworld\x1b[0m  "
      const result = toPlainOutput(input, 0)
      expect(result).toBe("hello\nworld")
    })

    test("removes trailing empty lines", () => {
      const input = "line1\nline2\n\n\n"
      expect(toPlainOutput(input, 0)).toBe("line1\nline2")
    })

    test("handles already plain text", () => {
      const input = "plain text here"
      expect(toPlainOutput(input, 0)).toBe("plain text here")
    })
  })

  describe("toLineByLineOutput", () => {
    test("outputs lines with clear-to-end", () => {
      const input = "line1\nline2"
      const result = toLineByLineOutput(input, 0)
      // Should contain the lines and clear-to-end-of-line (\x1b[K) sequences
      expect(result).toContain("line1")
      expect(result).toContain("line2")
      expect(result).toContain("\x1b[K")
    })

    test("handles single line", () => {
      const input = "single line"
      const result = toLineByLineOutput(input, 0)
      expect(result).toContain("single line")
      expect(result).toContain("\x1b[K")
    })

    test("includes cursor movement for updates", () => {
      const input = "updated"
      const result = toLineByLineOutput(input, 3)
      // Should include move up sequence when there were previous lines
      expect(result).toContain("\x1b[")
    })
  })

  describe("countLines", () => {
    test("counts single line", () => {
      expect(countLines("hello")).toBe(1)
    })

    test("counts multiple lines", () => {
      expect(countLines("line1\nline2\nline3")).toBe(3)
    })

    test("handles empty string", () => {
      expect(countLines("")).toBe(0)
    })

    test("handles trailing newline", () => {
      expect(countLines("line1\n")).toBe(2)
    })
  })
})
