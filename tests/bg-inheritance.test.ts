import { describe, test, expect } from "vitest"
import React from "react"
import { createRenderer } from "../src/testing/index.js"
import { Box, Text } from "../src/index.js"

describe("bg inheritance", () => {
  test("Text inherits Box backgroundColor", () => {
    const render = createRenderer({ cols: 40, rows: 5 })
    const app = render(React.createElement(Box, { backgroundColor: "red" }, React.createElement(Text, null, "hello")))
    // Red bg = 48;5;1 in 256-color mode
    // hightea emits combined sequences like \x1b[0;48;5;1m
    expect(app.ansi).toContain("48;5;1")
  })

  test("Text with own color inside colored Box", () => {
    const render = createRenderer({ cols: 40, rows: 5 })
    const app = render(
      React.createElement(
        Box,
        { backgroundColor: "#302030" },
        React.createElement(Text, { bold: true, color: "#f38ba8" }, "Title"),
        React.createElement(Text, { color: "#6c7086" }, " 3"),
      ),
    )
    // #302030 = rgb(48,32,48) -> 48;2;48;32;48 in truecolor
    expect(app.ansi).toContain("48;2;48;32;48")
    // Title should have fg #f38ba8 = rgb(243,139,168) -> 38;2;243;139;168
    expect(app.ansi).toContain("38;2;243;139;168")
    // " 3" should have fg #6c7086 = rgb(108,112,134) -> 38;2;108;112;134
    expect(app.ansi).toContain("38;2;108;112;134")
  })
})
