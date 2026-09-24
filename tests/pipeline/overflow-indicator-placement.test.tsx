/**
 * overflowIndicatorPlacement: where the ▲N / ▼N overflow indicator is drawn.
 *
 * One function owns the rule, and both the painter (renderScrollIndicators)
 * and mouse hit-tests read it, so a click on the glyph is told apart from a
 * click elsewhere on its row. Imported through the public pipeline barrel,
 * the specifier ag-react uses.
 */
import React from "react"
import { describe, expect, test } from "vitest"
import type { BoxProps } from "@silvery/ag/types"
import { overflowIndicatorPlacement } from "@silvery/ag-term/pipeline"
import { createRenderer } from "@silvery/test"
import { Box, Text } from "../../src/index.js"

const layout = { x: 10, y: 5, width: 20, height: 8 }
const padded: BoxProps = {
  overflowIndicator: true,
  paddingTop: 1,
  paddingBottom: 2,
  paddingLeft: 2,
  paddingRight: 1,
}

describe("overflowIndicatorPlacement", () => {
  test("bordered top: centred on the top border line, between the side borders; padding plays no part", () => {
    const props: BoxProps = { borderStyle: "single", padding: 2 }
    expect(overflowIndicatorPlacement({ edge: "top", hidden: 42, layout, props })).toEqual({
      y: 5,
      x: 18,
      width: 3,
      text: "▲42",
      rowX: 11,
      rowWidth: 18,
    })
  })

  test("bordered bottom: centred on the bottom border line", () => {
    const props: BoxProps = { borderStyle: "single", padding: 2 }
    expect(overflowIndicatorPlacement({ edge: "bottom", hidden: 7, layout, props })).toEqual({
      y: 12,
      x: 19,
      width: 2,
      text: "▼7",
      rowX: 11,
      rowWidth: 18,
    })
  })

  test("borderless with overflowIndicator: first/last content row, inside the padding", () => {
    expect(overflowIndicatorPlacement({ edge: "top", hidden: 3, layout, props: padded })).toEqual({
      y: 6,
      x: 19,
      width: 2,
      text: "▲3",
      rowX: 12,
      rowWidth: 17,
    })
    expect(
      overflowIndicatorPlacement({ edge: "bottom", hidden: 12, layout, props: padded }),
    ).toEqual({ y: 10, x: 19, width: 3, text: "▼12", rowX: 12, rowWidth: 17 })
  })

  test("no indicator: borderless with overflowIndicator off, or nothing hidden", () => {
    for (const props of [{}, { overflowIndicator: false }, { paddingX: 1 }] as BoxProps[]) {
      expect(overflowIndicatorPlacement({ edge: "top", hidden: 5, layout, props })).toBeUndefined()
      expect(
        overflowIndicatorPlacement({ edge: "bottom", hidden: 5, layout, props }),
      ).toBeUndefined()
    }
    const bordered: BoxProps = { borderStyle: "round", overflowIndicator: true }
    expect(
      overflowIndicatorPlacement({ edge: "top", hidden: 0, layout, props: bordered }),
    ).toBeUndefined()
  })

  test("text wider than the row is cut to the row, a row with no width draws nothing", () => {
    const narrow = { x: 0, y: 0, width: 4, height: 3 }
    expect(
      overflowIndicatorPlacement({
        edge: "top",
        hidden: 1234,
        layout: narrow,
        props: { borderStyle: "single" },
      }),
    ).toEqual({ y: 0, x: 1, width: 2, text: "▲1", rowX: 1, rowWidth: 2 })
    expect(
      overflowIndicatorPlacement({
        edge: "bottom",
        hidden: 98765,
        layout: { x: 0, y: 0, width: 3, height: 3 },
        props: { overflowIndicator: true },
      }),
    ).toEqual({ y: 2, x: 0, width: 3, text: "▼98", rowX: 0, rowWidth: 3 })
    expect(
      overflowIndicatorPlacement({
        edge: "top",
        hidden: 3,
        layout: { x: 0, y: 0, width: 2, height: 3 },
        props: { borderStyle: "single" },
      }),
    ).toBeUndefined()
  })

  test("the painter draws the glyph on exactly the placement's cells", () => {
    const rows = (prefix: string) =>
      Array.from({ length: 60 }, (_, i) => <Text key={i}>{`${prefix}-${i}`}</Text>)
    const render = createRenderer({ cols: 60, rows: 16 })
    const app = render(
      <Box flexDirection="row" width={60} height={16}>
        <Box
          testID="bordered"
          flexDirection="column"
          width={30}
          height={14}
          overflow="scroll"
          scrollTo={30}
          borderStyle="single"
        >
          {rows("b")}
        </Box>
        <Box
          testID="borderless"
          flexDirection="column"
          width={30}
          height={14}
          overflow="scroll"
          scrollTo={30}
          overflowIndicator
          paddingX={2}
          paddingY={1}
        >
          {rows("p")}
        </Box>
      </Box>,
    )

    for (const id of ["bordered", "borderless"]) {
      const node = app.getByTestId(id).first().resolve()!
      const ss = node.scrollState!
      for (const [edge, hidden] of [
        ["top", ss.hiddenAbove],
        ["bottom", ss.hiddenBelow],
      ] as const) {
        expect(hidden, `${id} ${edge}: items hidden past the edge`).toBeGreaterThan(0)
        const p = overflowIndicatorPlacement({
          edge,
          hidden,
          layout: node.boxRect!,
          props: node.props as BoxProps,
        })!
        expect(p, `${id} ${edge}: placement`).toBeDefined()
        const drawn = Array.from({ length: p.width }, (_, k) => app.cell(p.x + k, p.y).char)
        expect(drawn.join(""), `${id} ${edge}: glyph cells`).toBe(p.text)
        // The glyph and nothing else: its neighbours in the blanked row are blank.
        expect(app.cell(p.x - 1, p.y).char, `${id} ${edge}: left of glyph`).toBe(" ")
        expect(app.cell(p.x + p.width, p.y).char, `${id} ${edge}: right of glyph`).toBe(" ")
      }
    }
  })
})
