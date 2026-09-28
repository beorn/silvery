/**
 * @failure Dimension math strings are accepted by Box types but silently ignored.
 * @level l2
 * @consumer Box/Text/Island layout through the public React renderer and adapters.
 * @testonly none
 *
 * #15111: math dimensions must lay out like their numeric equivalent.
 * Existing engine math tests assign Value directly and miss this string seam.
 */
import React from "react"
import { expect, test } from "vitest"
import { Box, Text, Island, ScopeProvider } from "@silvery/ag-react"
import { createRenderer } from "@silvery/test"
import { snapshotGuest } from "@silvery/ag/island-guests"
import { createScope } from "@silvery/scope"
import type { BoxProps } from "@silvery/ag/types"
import type { BoxHandle } from "../../packages/ag-react/src/components/Box"
import type { Node as FlexilyNode } from "flexily"
import { applyBoxProps } from "../../packages/ag-react/src/reconciler/nodes"
import { createFlexilyZeroEngine } from "../../packages/ag-term/src/adapters/flexily-zero-adapter"
import { initYogaEngine } from "../../packages/ag-term/src/adapters/yoga-adapter"

test("Box math width reaches layout like its numeric equivalent", () => {
  const render = createRenderer({ cols: 40, rows: 2 })
  const app = render(
    <Box width={40} height={2} flexDirection="column" alignItems="flex-start">
      <Box id="math" width="max(10ch, 50%)" height={1} flexShrink={0}>
        <Text>M</Text>
      </Box>
      <Box id="numeric" width={20} height={1} flexShrink={0}>
        <Text>P</Text>
      </Box>
    </Box>,
  )
  expect(app.locator("#numeric").boundingBox()!.width).toBe(20)
  expect(app.locator("#math").boundingBox()!.width).toBe(20)
})

// AC6/axis contract: engine tables bypass the React prop routes, and the
// existing Text owner has no width/height support. Each public route needs
// a numeric control and real render proof, including the newly typed fields.
const properties = [
  "width",
  "height",
  "minWidth",
  "minHeight",
  "maxWidth",
  "maxHeight",
  "flexBasis",
] as const
test.each(
  ["Box", "Text", "Island"].flatMap((component) =>
    properties.map((property) => ({ component, property })),
  ),
)("$component $property reaches layout at realistic scale", ({ component, property }) => {
  const inline = !property.toLowerCase().includes("height")
  const expected = inline ? 20 : 6
  const scope = createScope("style-lengths-contract")
  const render = createRenderer({ cols: 80, rows: 80 })
  const guests = {
    numeric: snapshotGuest({ cols: 4, rows: 1 }),
    math: snapshotGuest({ cols: 4, rows: 1 }),
  }
  const item = (id: "numeric" | "math", value: number | string | undefined) => {
    const props = {
      id,
      testID: id,
      width: property === "minWidth" ? 4 : 40,
      height: property === "minHeight" ? 1 : 12,
      flexShrink: 0,
      ...(value === undefined ? {} : { [property]: value }),
    }
    if (component === "Text") return <Text {...props}>M</Text>
    if (component === "Island") return <Island {...props} cols={4} rows={1} guest={guests[id]} />
    return (
      <Box {...props}>
        <Text>M</Text>
      </Box>
    )
  }
  const tree = (numeric: number | undefined, math: string | undefined) => (
    <ScopeProvider scope={scope}>
      <Box width={80} height={80} flexDirection="column">
        <Box width={80} height={24} flexDirection="row" alignItems="flex-start" flexShrink={0}>
          {item("numeric", numeric)}
          {item("math", math)}
        </Box>
        {Array.from({ length: 50 }, (_, index) => (
          <Box key={index} height={1}>
            <Text>row {index}</Text>
          </Box>
        ))}
      </Box>
    </ScopeProvider>
  )
  const app = render(tree(expected, `max(1${inline ? "ch" : "lh"}, 25%)`))
  const assertPair = (dimension?: number) => {
    const numeric = app.getByTestId("numeric").boundingBox()
    const math = app.getByTestId("math").boundingBox()
    if (!numeric || !math)
      {throw new Error(`${component} ${property}: expected both public layout nodes`)}
    if (dimension !== undefined) expect(numeric[inline ? "width" : "height"]).toBe(dimension)
    expect([math.width, math.height]).toEqual([numeric.width, numeric.height])
  }
  try {
    assertPair(expected)
    app.rerender(tree(expected / 2, `max(1${inline ? "ch" : "lh"}, 12.5%)`))
    assertPair(expected / 2)
    app.rerender(tree(undefined, undefined))
    assertPair()
  } finally {
    app.unmount()
  }
})

// AC raw preflight: an untyped JS caller can supply even a shadowed broad
// spacing prop. Geometry after the error proves no earlier setter changed it.
test.each([
  { padding: "calc(1ch + 1ch)", paddingTop: 0 },
  { margin: "max(1ch, 2ch)", marginTop: "auto" },
  { gap: "clamp(1ch, 2ch, 3ch)" },
  { top: "calc(1lh + 1lh)", position: "static" },
])("raw unsupported input refuses before changing dimensions: %j", (raw) => {
  const node = createFlexilyZeroEngine().createNode()
  applyBoxProps(node, { width: 20, height: 4 })
  node.calculateLayout(80, 24)
  try {
    expect(() =>
      applyBoxProps(node, { width: 99, height: 4, ...raw } as unknown as BoxProps),
    ).toThrow(/26238/)
    node.calculateLayout(80, 24)
    expect(node.getComputedWidth()).toBe(20)
  } finally {
    node.free()
  }
})

// AC8: direct adapter calls must fail with the prop and raw input, rather
// than leaking a WASM coercion error or accepting an unsupported expression.
test("Yoga preserves number/percent/auto and names unsupported direct lengths", async () => {
  const node = (await initYogaEngine()).createNode()
  try {
    node.setWidth(20)
    node.calculateLayout(80, 24)
    expect(node.getComputedWidth()).toBe(20)
    node.setWidth("25%")
    node.calculateLayout(80, 24)
    expect(node.getComputedWidth()).toBe(20)
    node.setWidth("auto")
    node.calculateLayout(80, 24)
    expect(node.getComputedWidth()).toBe(80)
    const setters = {
      width: node.setWidth,
      height: node.setHeight,
      minWidth: node.setMinWidth,
      minHeight: node.setMinHeight,
      maxWidth: node.setMaxWidth,
      maxHeight: node.setMaxHeight,
      flexBasis: node.setFlexBasis,
    }
    for (const property of properties) {
      const input = "max(1ch, 50%)"
      expect(() => setters[property].call(node, input)).toThrow(
        expect.objectContaining({ name: "TypeError" }),
      )
      expect(() => setters[property].call(node, input)).toThrow(
        new RegExp(`${property}.*max\\(1ch, 50%\\)`),
      )
    }
  } finally {
    node.free()
  }
})

// AC parse retention: typed engine setters alone cannot detect a parser that
// allocates a fresh AST on every unchanged string or unrelated React update.
test("public rerender and identical adapter input retain the parsed length", () => {
  const ref = React.createRef<BoxHandle>()
  const render = createRenderer({ cols: 80, rows: 80 })
  const tree = (label: string) => (
    <Box width={80} height={80}>
      <Box ref={ref} width="max(1ch, 25%)" height={1} flexShrink={0}>
        <Text>{label}</Text>
      </Box>
      {Array.from({ length: 50 }, (_, index) => (
        <Box key={index} height={1}>
          <Text>row {index}</Text>
        </Box>
      ))}
    </Box>
  )
  const app = render(tree("A"))
  try {
    const layout = ref.current?.getNode()?.layoutNode
    if (!layout || !("getFlexilyNode" in layout))
      {throw new Error("Expected the mounted Box's Flexily adapter")}
    const native = (layout as typeof layout & { getFlexilyNode(): FlexilyNode }).getFlexilyNode()
    const parsed = native.getWidth()
    expect(Object.isFrozen(parsed)).toBe(true)
    expect(parsed.source).toBe("max(1ch, 25%)")
    expect(native.isDirty()).toBe(false)
    layout.setWidth("max(1ch, 25%)")
    expect(native.getWidth()).toBe(parsed)
    expect(native.isDirty()).toBe(false)
    app.rerender(tree("B"))
    expect(native.getWidth()).toBe(parsed)
    expect(ref.current?.getBoxRect()?.width).toBe(20)
  } finally {
    app.unmount()
  }
})

// #26247/AC CQ lifetime: the containing CQ changes while the intervening
// wrapper stays at width 30; a reused descendant must resolve the new freeze.
test("public math width follows a resized CQ through a fixed wrapper", () => {
  const render = createRenderer({ cols: 220, rows: 80 })
  const tree = (width: number) => (
    <Box width={220} height={80}>
      <Box width={width} height={1} containerType="inline-size" flexShrink={0}>
        <Box width={30} height={1} flexShrink={0}>
          <Box testID="cq-math" width="max(1ch, 10cqi)" height={1} flexShrink={0}>
            <Text>M</Text>
          </Box>
        </Box>
      </Box>
      {Array.from({ length: 50 }, (_, index) => (
        <Box key={index} height={1}>
          <Text>row {index}</Text>
        </Box>
      ))}
    </Box>
  )
  const app = render(tree(200))
  try {
    expect(app.getByTestId("cq-math").boundingBox()?.width).toBe(20)
    app.rerender(tree(100))
    expect(app.getByTestId("cq-math").boundingBox()?.width).toBe(10)
  } finally {
    app.unmount()
  }
})
