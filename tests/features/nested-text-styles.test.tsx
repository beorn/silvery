/**
 * Verify that ALL text styling props propagate through nested Text elements.
 *
 * Regression test for km-silvery.nested-underline-style:
 * underlineStyle, underlineColor were lost in nested Text because
 * StyleContext and styleToAnsi didn't track them.
 */

import React from "react"
import { describe, test, expect } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, Text } from "../../src/index"

const render = createRenderer({ cols: 60, rows: 5 })

describe("nested Text style propagation", () => {
  test("bold propagates through nested Text", () => {
    const app = render(
      <Text wrap="truncate">
        normal <Text bold>bold nested</Text> normal
      </Text>,
    )
    const cell = findCell(app, "b", "bold nested")
    expect(cell.attrs.bold).toBe(true)
  })

  test("italic propagates through nested Text", () => {
    const app = render(
      <Text wrap="truncate">
        normal <Text italic>italic nested</Text> normal
      </Text>,
    )
    const cell = findCell(app, "i", "italic nested")
    expect(cell.attrs.italic).toBe(true)
  })

  test("underline propagates through nested Text", () => {
    const app = render(
      <Text wrap="truncate">
        normal <Text underline>underlined nested</Text> normal
      </Text>,
    )
    const cell = findCell(app, "u", "underlined nested")
    expect(cell.attrs.underline).toBe(true)
  })

  test("underlineStyle=dotted propagates through nested Text", () => {
    const app = render(
      <Text wrap="truncate">
        normal <Text underlineStyle="dotted">dotted nested</Text> normal
      </Text>,
    )
    const cell = findCell(app, "d", "dotted nested")
    expect(cell.attrs.underline).toBe(true)
    expect(cell.attrs.underlineStyle).toBe("dotted")
  })

  test("underlineStyle=curly propagates through nested Text", () => {
    const app = render(
      <Text wrap="truncate">
        normal <Text underlineStyle="curly">curly nested</Text> normal
      </Text>,
    )
    const cell = findCell(app, "c", "curly nested")
    expect(cell.attrs.underline).toBe(true)
    expect(cell.attrs.underlineStyle).toBe("curly")
  })

  test("underlineStyle=dashed propagates through nested Text", () => {
    const app = render(
      <Text wrap="truncate">
        normal <Text underlineStyle="dashed">dashed nested</Text> normal
      </Text>,
    )
    const cell = findCell(app, "d", "dashed nested")
    expect(cell.attrs.underline).toBe(true)
    expect(cell.attrs.underlineStyle).toBe("dashed")
  })

  test("strikethrough propagates through nested Text", () => {
    const app = render(
      <Text wrap="truncate">
        normal <Text strikethrough>struck nested</Text> normal
      </Text>,
    )
    const cell = findCell(app, "s", "struck nested")
    expect(cell.attrs.strikethrough).toBe(true)
  })

  test("overline propagates through nested Text", () => {
    const app = render(
      <Text wrap="truncate">
        normal <Text overline>over nested</Text> normal
      </Text>,
    )
    const cell = findCell(app, "o", "over nested")
    expect(cell.attrs.overline).toBe(true)
  })

  test("strikethrough resets after nested Text ends", () => {
    const app = render(
      <Text wrap="truncate">
        before <Text strikethrough>struck</Text> after
      </Text>,
    )
    const struckCell = findCell(app, "s", "struck")
    expect(struckCell.attrs.strikethrough).toBe(true)

    const afterCell = findCell(app, "a", "after")
    expect(afterCell.attrs.strikethrough).toBeFalsy()
  })

  test("underlineColor propagates through nested Text", () => {
    const app = render(
      <Text wrap="truncate">
        normal{" "}
        <Text underlineStyle="dotted" underlineColor="red">
          colored underline
        </Text>{" "}
        normal
      </Text>,
    )
    const cell = findCell(app, "c", "colored underline")
    expect(cell.attrs.underline).toBe(true)
    // underlineColor presence — exact value depends on theme resolution
    expect(cell.underlineColor).not.toBeNull()
  })

  test("styles reset after nested Text ends", () => {
    const app = render(
      <Text wrap="truncate">
        before <Text underlineStyle="dotted">dotted</Text> after
      </Text>,
    )
    const dottedCell = findCell(app, "d", "dotted")
    expect(dottedCell.attrs.underline).toBe(true)

    const afterCell = findCell(app, "a", "after")
    expect(afterCell.attrs.underline).toBeFalsy()
  })
})

/** Find the first cell matching a character within a target string */
function findCell(app: ReturnType<typeof render>, char: string, context: string) {
  const text = app.text
  const contextIdx = text.indexOf(context)
  if (contextIdx < 0) throw new Error(`"${context}" not found in: ${text}`)
  const charIdx = context.indexOf(char)
  const col = contextIdx + charIdx
  return app.term.buffer.getCell(col, 0)
}
