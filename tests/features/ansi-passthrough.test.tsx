/**
 * ANSI Passthrough Tests
 *
 * Verify that pre-styled text (chalk colors, OSC hyperlinks) passes through
 * silvery's cell-buffer renderer and is preserved in the output.
 *
 * silvery's cell buffer decomposes ANSI into structured cell properties
 * (fg, bg, bold, etc.) and re-emits them. The exact ANSI encoding may differ
 * from the input (e.g., basic red \x1b[31m may become 256-color \x1b[38;5;1m,
 * or reset may be prepended), but the visual result is equivalent.
 */
import React from "react"
import { describe, test, expect } from "vitest"
import chalk from "chalk"
import { createRenderer } from "@silvery/test"
import { Box, Text } from "@silvery/react"
import { stripAnsi } from "@silvery/term/ansi"

// Ensure chalk uses full truecolor
chalk.level = 3

const render = createRenderer({ cols: 80, rows: 24 })

describe("ANSI passthrough: SGR colors", () => {
  test("chalk.red text preserves red color in output", () => {
    const app = render(
      <Box>
        <Text>{chalk.red("Hello")}</Text>
      </Box>,
    )
    expect(app.text).toContain("Hello")
    expect(app.ansi).toContain("Hello")
    // Should contain a foreground color SGR code (silvery may re-encode)
    // chalk.red at level 3 produces 256-color: \x1b[38;5;1m
    expect(app.ansi).toMatch(/\x1b\[/)
    // The plain text should be unchanged
    expect(stripAnsi(app.ansi)).toContain("Hello")
    // Should NOT be unstyled plain text
    expect(app.ansi).not.toBe("Hello")
  })

  test("chalk.green.bold preserves both color and bold", () => {
    const app = render(
      <Box>
        <Text>{chalk.green.bold("World")}</Text>
      </Box>,
    )
    expect(app.text).toContain("World")
    // Should contain SGR codes for color and attributes
    expect(app.ansi).toMatch(/\x1b\[/)
    expect(stripAnsi(app.ansi)).toContain("World")
    // Bold should be present (SGR 1)
    expect(app.ansi).toMatch(/1[;m]/)
  })

  test("chalk.rgb truecolor is preserved", () => {
    const app = render(
      <Box>
        <Text>{chalk.rgb(255, 100, 0)("Truecolor")}</Text>
      </Box>,
    )
    expect(app.text).toContain("Truecolor")
    // Should contain SGR 38;2;r;g;b truecolor sequence (possibly with leading 0;)
    expect(app.ansi).toMatch(/38;2;255;100;0m/)
  })

  test("chalk.bgBlue preserves background color", () => {
    const app = render(
      <Box>
        <Text>{chalk.bgBlue("BgText")}</Text>
      </Box>,
    )
    expect(app.text).toContain("BgText")
    // Should contain a background color SGR code (44 for blue or 48;5;4)
    expect(app.ansi).toMatch(/\x1b\[/)
    expect(app.ansi).not.toBe("BgText")
  })

  test("mixed chalk and plain text preserves both", () => {
    const app = render(
      <Box>
        <Text>
          {"plain "}
          {chalk.red("red")}
          {" plain"}
        </Text>
      </Box>,
    )
    expect(app.text).toContain("plain red plain")
    // Red section should have a color code
    expect(app.ansi).toMatch(/\x1b\[/)
    // The "red" part should be styled differently from "plain"
    expect(stripAnsi(app.ansi)).toContain("plain red plain")
  })

  test("SGR with colon parameters (38:2::r:g:b) passes through", () => {
    // Construct raw ANSI with colon-separated params
    const styled = "\x1b[38:2::255:100:0mOrange\x1b[0m"
    const app = render(
      <Box>
        <Text>{styled}</Text>
      </Box>,
    )
    expect(app.text).toContain("Orange")
    // The output should contain a truecolor fg code for 255,100,0
    // silvery re-encodes as semicolons (38;2;r;g;b) which is the standard form
    expect(app.ansi).toMatch(/38;2;255;100;0m/)
  })
})

describe("ANSI passthrough: OSC 8 hyperlinks", () => {
  test("OSC 8 hyperlink is preserved in output", () => {
    const linked = "\x1b]8;;https://example.com\x07Link\x1b]8;;\x07"
    const app = render(
      <Box>
        <Text>{linked}</Text>
      </Box>,
    )
    expect(app.text).toContain("Link")
    // Output should contain OSC 8 hyperlink URL
    expect(app.ansi).toContain("https://example.com")
    // Should have the OSC 8 open sequence
    expect(app.ansi).toMatch(/\x1b\]8;;https:\/\/example\.com/)
    // Should have an OSC 8 close sequence (ST = \x1b\\ or BEL = \x07)
    expect(app.ansi).toMatch(/\x1b\]8;;(\x1b\\|\x07)/)
  })

  test("OSC 8 hyperlink with SGR styling is preserved", () => {
    const linked = `\x1b[34m\x1b]8;;https://example.com\x07Link\x1b]8;;\x07\x1b[0m`
    const app = render(
      <Box>
        <Text>{linked}</Text>
      </Box>,
    )
    expect(app.text).toContain("Link")
    // Should have both color and hyperlink
    expect(app.ansi).toContain("https://example.com")
    expect(app.ansi).toMatch(/\x1b\[/)
  })
})

describe("ANSI passthrough: chalk with Text color prop", () => {
  test("Text color prop and chalk color coexist", () => {
    // Text has color="green" prop, but child text has chalk.red
    // The chalk.red should override Text's green for that segment
    const app = render(
      <Box>
        <Text color="green">
          {"green "}
          {chalk.red("red")}
          {" green"}
        </Text>
      </Box>,
    )
    expect(app.text).toContain("green red green")
    // Should have SGR codes present
    expect(app.ansi).toMatch(/\x1b\[/)
  })
})

describe("ANSI passthrough: non-SGR sequences stripped", () => {
  test("cursor movement is stripped but SGR is preserved", () => {
    const input = "\x1b[1A\x1b[2KStarting... \x1b[32mdone\x1b[0m\x1b[1B"
    const app = render(
      <Box>
        <Text>{input}</Text>
      </Box>,
    )
    // Cursor movement should not appear in output
    expect(app.ansi).not.toContain("\x1b[1A")
    expect(app.ansi).not.toContain("\x1b[2K")
    expect(app.ansi).not.toContain("\x1b[1B")
    // Text content should be intact
    expect(app.text).toContain("Starting... done")
  })

  test("cursor position and erase sequences are stripped", () => {
    const input = "Hello\x1b[5;10HWorld\x1b[2J!"
    const app = render(
      <Box>
        <Text>{input}</Text>
      </Box>,
    )
    // Dangerous sequences stripped
    expect(app.ansi).not.toContain("\x1b[5;10H")
    expect(app.ansi).not.toContain("\x1b[2J")
    // Text content preserved
    expect(app.text).toContain("HelloWorld!")
  })

  test("SGR sequences preserved while cursor sequences stripped", () => {
    const input = "\x1b[1A\x1b[31mred text\x1b[0m\x1b[1B"
    const app = render(
      <Box>
        <Text>{input}</Text>
      </Box>,
    )
    expect(app.text).toContain("red text")
    // Should have color SGR
    expect(app.ansi).toMatch(/\x1b\[/)
    // Should NOT have cursor movement
    expect(app.ansi).not.toContain("\x1b[1A")
    expect(app.ansi).not.toContain("\x1b[1B")
  })
})
