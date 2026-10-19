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
import { expect, test, vi } from "vitest"
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
    if (!numeric || !math) {
      throw new Error(`${component} ${property}: expected both public layout nodes`)
    }
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

// #26238 AC1/AC2: every edge and gap prop takes the A0.3a grammar and lays
// out exactly like its numeric equivalent, through the public Box seam, inside
// a real inline-size container so cqi has a frozen inline size. This is the
// A0.3a property-test shape applied to the spacing props.
const spacingCases: Array<{ prop: keyof BoxProps; math: string; numeric: BoxProps }> = [
  { prop: "padding", math: "10%", numeric: { padding: 2 } },
  { prop: "paddingX", math: "calc(1ch + 1ch)", numeric: { paddingX: 2 } },
  { prop: "paddingY", math: "min(2lh, 3lh)", numeric: { paddingY: 2 } },
  { prop: "paddingTop", math: "max(1lh, 2lh)", numeric: { paddingTop: 2 } },
  { prop: "paddingBottom", math: "calc(2lh)", numeric: { paddingBottom: 2 } },
  { prop: "paddingLeft", math: "10cqi", numeric: { paddingLeft: 4 } },
  { prop: "paddingRight", math: "max(1ch, 10cqi)", numeric: { paddingRight: 4 } },
  { prop: "margin", math: "clamp(0%, 10%, 50%)", numeric: { margin: 4 } },
  { prop: "marginX", math: "calc(1ch + 1ch)", numeric: { marginX: 2 } },
  { prop: "marginY", math: "min(2lh, 3lh)", numeric: { marginY: 2 } },
  { prop: "marginTop", math: "max(1lh, 2lh)", numeric: { marginTop: 2 } },
  { prop: "marginBottom", math: "calc(2lh)", numeric: { marginBottom: 2 } },
  { prop: "marginLeft", math: "10cqi", numeric: { marginLeft: 4 } },
  { prop: "marginRight", math: "max(1ch, 10cqi)", numeric: { marginRight: 4 } },
  { prop: "gap", math: "10%", numeric: { columnGap: 4, rowGap: 1 } },
  { prop: "columnGap", math: "10%", numeric: { columnGap: 4 } },
  { prop: "rowGap", math: "10%", numeric: { rowGap: 1 } },
]

test.each(spacingCases)(
  "$prop math lays out like its numeric equivalent",
  ({ prop, math, numeric }) => {
    vi.stubEnv("SILVERY_STRICT", "2")
    const render = createRenderer({ cols: 80, rows: 80 })
    const tree = (props: BoxProps) => (
      <Box width={80} height={80} flexDirection="column" backgroundColor="black">
        <Box width={40} height={10} containerType="inline-size" flexShrink={0} flexDirection="row">
          <Box {...props} width={20} height={10} flexShrink={0}>
            <Box testID="pair" width={4} height={10} flexDirection="column" flexShrink={0}>
              <Text testID="first">A</Text>
              <Text testID="second">B</Text>
            </Box>
          </Box>
          <Box testID="sibling" width={4} height={10} flexShrink={0}>
            <Text>C</Text>
          </Box>
        </Box>
        {Array.from({ length: 50 }, (_, index) => (
          <Box key={index} height={1}>
            <Text>row {index}</Text>
          </Box>
        ))}
      </Box>
    )
    const snapshot = (app: ReturnType<typeof render>) =>
      ["first", "second", "sibling"].map((id) => app.getByTestId(id).boundingBox())
    const app = render(tree(numeric))
    try {
      const expected = snapshot(app)
      app.rerender(tree({ [prop]: math } as BoxProps))
      expect(snapshot(app)).toEqual(expected)
      app.rerender(tree(numeric))
      expect(snapshot(app)).toEqual(expected)
    } finally {
      app.unmount()
      vi.unstubAllEnvs()
    }
  },
)

// #26238 AC3: offset math is accepted at the absolute, relative and static
// paths, and cqi resolves against the frozen inline size of the CQ container.
test("offset math resolves at absolute, relative and static paths", () => {
  vi.stubEnv("SILVERY_STRICT", "2")
  const render = createRenderer({ cols: 80, rows: 20 })
  const tree = (
    position: "absolute" | "relative" | "static",
    left: number | string,
    top: number | string,
  ) => (
    <Box width={80} height={20} flexDirection="column" backgroundColor="black">
      <Box width={40} height={10} containerType="inline-size" flexShrink={0}>
        <Box testID="moved" position={position} left={left} top={top} width={4} height={1}>
          <Text>M</Text>
        </Box>
      </Box>
      {Array.from({ length: 50 }, (_, index) => (
        <Box key={index} height={1}>
          <Text>row {index}</Text>
        </Box>
      ))}
    </Box>
  )
  const app = render(tree("absolute", "max(2ch, 10cqi)", "1lh"))
  try {
    const moved = () => app.getByTestId("moved").boundingBox()
    expect(moved()).toMatchObject({ x: 4, y: 1 })
    app.rerender(tree("absolute", 4, 1))
    expect(moved()).toMatchObject({ x: 4, y: 1 })
    app.rerender(tree("absolute", "25%", "50%"))
    expect(moved()).toMatchObject({ x: 10, y: 5 })
    app.rerender(tree("relative", "calc(2ch)", "max(1lh, 2lh)"))
    expect(moved()).toMatchObject({ x: 2, y: 2 })
    // Static ignores insets; the values are accepted and never refused.
    app.rerender(tree("static", "max(1ch, 2ch)", "calc(1lh + 1lh)"))
    expect(moved()).toMatchObject({ x: 0, y: 0 })
  } finally {
    app.unmount()
    vi.unstubAllEnvs()
  }
})

// #26238 AC1: a string the grammar rejects stays a typed error naming the
// prop and the raw input, now that the spacing refusal itself is gone.
test("malformed spacing math names the prop and the raw input", () => {
  const node = createFlexilyZeroEngine().createNode()
  try {
    expect(() => applyBoxProps(node, { padding: "max(1ch, 2)" } as unknown as BoxProps)).toThrow(
      /padding.*max\(1ch, 2\)/,
    )
    expect(() => applyBoxProps(node, { gap: "2cqb" } as unknown as BoxProps)).toThrow(/gap.*2cqb/)
    expect(() =>
      applyBoxProps(node, { left: "1px", position: "absolute" } as unknown as BoxProps),
    ).toThrow(/left.*1px/)
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
    const spacing = {
      padding: () => node.setPadding(0, "max(1ch, 25%)"),
      margin: () => node.setMargin(0, "max(1ch, 25%)"),
      gap: () => node.setGap(0, "max(1ch, 25%)"),
      top: () => node.setPosition(1, "max(1lh, 25%)"),
    }
    for (const [prop, apply] of Object.entries(spacing)) {
      expect(apply).toThrow(expect.objectContaining({ name: "TypeError" }))
      expect(apply).toThrow(new RegExp(`${prop}.*max\\(`))
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
    if (!layout || !("getFlexilyNode" in layout)) {
      throw new Error("Expected the mounted Box's Flexily adapter")
    }
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

// #26238 AC1 parse retention: a spacing or offset string parses once per
// style-set; an identical adapter input must reuse the stored Value rather
// than allocate a fresh AST and dirty layout.
test("identical spacing and offset strings retain their parsed value", () => {
  const ref = React.createRef<BoxHandle>()
  const render = createRenderer({ cols: 80, rows: 80 })
  const tree = (label: string) => (
    <Box width={80} height={80}>
      <Box
        ref={ref}
        width={20}
        height={4}
        padding="10%"
        gap="10%"
        position="relative"
        left="max(1ch, 25%)"
      >
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
    if (!layout || !("getFlexilyNode" in layout)) {
      throw new Error("Expected the mounted Box's Flexily adapter")
    }
    const native = (layout as typeof layout & { getFlexilyNode(): FlexilyNode }).getFlexilyNode()
    const padding = native.style.padding[1]
    const gap = native.style.gap[1]
    const left = native.style.position[0]
    expect(Object.isFrozen(padding)).toBe(true)
    expect(padding.source).toBe("10%")
    expect(gap.source).toBe("10%")
    expect(left.source).toBe("max(1ch, 25%)")
    layout.setPadding(1, "10%")
    layout.setGap(1, "10%")
    layout.setPosition(0, "max(1ch, 25%)")
    expect(native.style.padding[1]).toBe(padding)
    expect(native.style.gap[1]).toBe(gap)
    expect(native.style.position[0]).toBe(left)
    expect(native.isDirty()).toBe(false)
    const width = ref.current?.getBoxRect()?.width
    app.rerender(tree("B"))
    expect(native.style.padding[1]).toBe(padding)
    expect(native.style.gap[1]).toBe(gap)
    expect(native.style.position[0]).toBe(left)
    expect(ref.current?.getBoxRect()?.width).toBe(width)
  } finally {
    app.unmount()
  }
})

// #26247/AC CQ lifetime: the containing CQ changes while the intervening
// wrapper stays at width 30; a reused descendant must resolve the new freeze.
// Paint the full math width so STRICT's fresh-layout oracle cannot repair
// stale public geometry without first detecting the incremental pixel error.
test("public math width follows a resized CQ through a fixed wrapper", () => {
  // Root Vitest setup defaults to tier 1; this pipeline contract requires
  // tier 2's independent fresh-layout baseline after that setup has run.
  vi.stubEnv("SILVERY_STRICT", "2")
  const render = createRenderer({ cols: 220, rows: 80 })
  const tree = (width: number) => (
    <Box width={220} height={80} backgroundColor="black">
      <Box width={width} height={1} containerType="inline-size" flexShrink={0}>
        <Box width={30} height={1} flexShrink={0}>
          <Box
            testID="cq-math"
            width="max(1ch, 10cqi)"
            height={1}
            flexShrink={0}
            backgroundColor="green"
          >
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
  let app: ReturnType<typeof render> | undefined
  try {
    app = render(tree(200))
    expect(app.getByTestId("cq-math").boundingBox()?.width).toBe(20)
    app.rerender(tree(100))
    expect(app.getByTestId("cq-math").boundingBox()?.width).toBe(10)
  } finally {
    app?.unmount()
    vi.unstubAllEnvs()
  }
})
