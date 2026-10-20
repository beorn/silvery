/**
 * @failure Start-aligned prose consumes half the spare width as a left gutter.
 * @level l2
 * @consumer Content.Layout and Content.Body through the public render harness.
 * @testonly none
 * Finite prose width exposes the slack that the existing prose=100% suites lack.
 */
import React from "react"
import { expect, test } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, Content, Text } from "silvery"

test.each([
  { align: "start", cols: 80, firstColumn: 1 },
  { align: "center", cols: 80, firstColumn: 20 },
  { align: "start", cols: 42, firstColumn: 1 },
  { align: "center", cols: 42, firstColumn: 1 },
  { align: "stretch", cols: 80, firstColumn: 20 },
] as const)(
  "$align prose preserves its gutter at $cols columns",
  ({ align, cols, firstColumn }) => {
    const render = createRenderer({ cols, rows: 6 })
    const app = render(
      <Box width={cols} height={6} flexDirection="column">
        <Content.Layout fill={false} prose={40} align={align}>
          <Content.Body>
            <Text>First paragraph</Text>
            <Text>Second paragraph</Text>
          </Content.Body>
        </Content.Layout>
      </Box>,
    )
    const paragraphs = app.text.split("\n").filter((line) => line.includes("paragraph"))
    expect(paragraphs).toHaveLength(2)
    expect(paragraphs.map((line) => line.search(/\S/u))).toEqual([firstColumn, firstColumn])
  },
)
