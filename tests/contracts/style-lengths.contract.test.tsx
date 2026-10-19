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
import { setLayoutEngine } from "../../packages/ag-term/src/layout-engine"
import { resetStrictCache } from "@silvery/ag-term/strict-mode"

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
  // 10% resolves against the 40-column containing block, not the 20-wide box:
  // CSS2 §8.4 makes every padding percentage a share of the containing-block
  // width, so the numeric equivalent is 4 per side (#30346).
  { prop: "padding", math: "10%", numeric: { padding: 4 } },
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
    // No query ancestor: the layout root is the implicit container, so `%`
    // resolves against the containing block rather than a frozen inline size.
    app.rerender(
      <Box width={80} height={20} flexDirection="column" backgroundColor="black">
        <Box testID="moved" position="absolute" left="max(1ch, 25%)" top="50%" width={4} height={1}>
          <Text>M</Text>
        </Box>
      </Box>,
    )
    expect(moved()).toMatchObject({ x: 20, y: 10 })
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

// 15111 A0.3a 3c, reaffirmed by 26238 A0.3b: every raw length is validated
// before ANY setter runs, so a malformed value cannot mutate the node first
// and a shadowed broad prop cannot be skipped silently.
test("malformed spacing is rejected before any setter, including shadowed props", () => {
  const node = createFlexilyZeroEngine().createNode()
  const native = (node as typeof node & { getFlexilyNode(): FlexilyNode }).getFlexilyNode()
  try {
    applyBoxProps(node, { width: 20, height: 4 } as unknown as BoxProps)
    expect(() =>
      applyBoxProps(node, {
        width: 99,
        height: 4,
        padding: "max(1ch, 2)",
        paddingTop: 0,
        paddingBottom: 0,
        paddingLeft: 0,
        paddingRight: 0,
      } as unknown as BoxProps),
    ).toThrow(/padding.*max\(1ch, 2\)/)
    expect(native.getWidth()).toMatchObject({ value: 20 })

    // A valid math value stays accepted when every side shadows it.
    expect(() =>
      applyBoxProps(node, {
        width: 20,
        height: 4,
        padding: "max(1ch, 2ch)",
        paddingTop: 0,
        paddingBottom: 0,
        paddingLeft: 0,
        paddingRight: 0,
      } as unknown as BoxProps),
    ).not.toThrow()

    expect(() =>
      applyBoxProps(node, { width: 99, height: 4, padding: "max(1ch, 2)" } as unknown as BoxProps),
    ).toThrow(/padding.*max\(1ch, 2\)/)
    expect(native.getWidth()).toMatchObject({ value: 20 })
  } finally {
    node.free()
  }
})

// 26238: applyBoxProps always sets gap through GUTTER_ALL. An unchanged math
// string must reuse the stored Value through that path, not parse a fresh AST
// and dirty layout on every render.
test("identical math gap through GUTTER_ALL retains its parsed value", () => {
  const node = createFlexilyZeroEngine().createNode()
  const native = (node as typeof node & { getFlexilyNode(): FlexilyNode }).getFlexilyNode()
  try {
    applyBoxProps(node, { width: 80, height: 4, gap: "max(10%, 20%)" } as unknown as BoxProps)
    const first = native.style.gap[0]
    expect(first.source).toBe("max(10%, 20%)")
    expect(native.style.gap[1]).toBe(first)
    native.calculateLayout(80, 4)
    expect(native.isDirty()).toBe(false)

    applyBoxProps(node, { gap: "max(10%, 20%)" } as unknown as BoxProps)
    expect(native.style.gap[0]).toBe(first)
    expect(native.style.gap[1]).toBe(first)
    expect(native.isDirty()).toBe(false)
  } finally {
    node.free()
  }
})

// 26238: accepted string spacing must paint through ordinary scroll/hidden
// clipping. The intrinsic-measurement exception does not cover paint.
//
// pipeline/AGENTS.md "Mandatory: Test Before Change" requires the changed
// paint path under SILVERY_STRICT with a realistic-scale fixture (50+ nodes),
// and an incremental rerender so STRICT compares incremental against fresh.
test("string padding paints through scroll and hidden clipping at realistic scale", () => {
  const saved = process.env.SILVERY_STRICT
  process.env.SILVERY_STRICT = "2"
  resetStrictCache()
  try {
    for (const overflow of ["scroll", "hidden"] as const) {
      const render = createRenderer({ cols: 30, rows: 12 })
      const tree = (label: string) => (
        <Box width={20} height={10} paddingLeft="max(1ch, 2ch)" overflow={overflow}>
          <Box width={30} height={60} flexDirection="column">
            {Array.from({ length: 60 }, (_, index) => (
              <Box key={index} height={1}>
                <Text>
                  {label}-{index}
                </Text>
              </Box>
            ))}
          </Box>
        </Box>
      )
      const app = render(tree("child"))
      try {
        expect(app.text).toContain("child-0")
        expect(app.text.split("\n")[0]!.startsWith("  child-0")).toBe(true)
        app.rerender(tree("next"))
        expect(app.text).toContain("next-0")
        expect(app.text.split("\n")[0]!.startsWith("  next-0")).toBe(true)
      } finally {
        app.unmount()
      }
    }
  } finally {
    if (saved === undefined) delete process.env.SILVERY_STRICT
    else process.env.SILVERY_STRICT = saved
    resetStrictCache()
  }
})

// Review R2: the preflight must not turn Yoga's preserved N% offsets into a
// refusal. Offsets keep setPosition's numeric/percent branch; spacing strings
// still refuse.
test("Yoga keeps numeric and percent offsets through the raw preflight", async () => {
  const yoga = await initYogaEngine()
  const previous = createFlexilyZeroEngine()
  const node = yoga.createNode()
  try {
    setLayoutEngine(yoga)
    expect(() =>
      applyBoxProps(node, {
        width: 20,
        height: 4,
        position: "absolute",
        left: "25%",
        top: "50%",
      } as unknown as BoxProps),
    ).not.toThrow()
    node.calculateLayout(80, 40)
    // The regression was a refusal, not geometry: both offsets applied.
    expect(node.getComputedLeft()).toBeGreaterThan(0)
    expect(node.getComputedTop()).toBeGreaterThan(0)
    expect(() => applyBoxProps(node, { padding: "1ch" } as unknown as BoxProps)).toThrow(
      /padding.*1ch/,
    )
  } finally {
    setLayoutEngine(previous)
    node.free()
  }
})

// A0.3a 3b: an unchanged string was validated when it was applied, so an
// unrelated rerender must not parse it again.
test("unchanged raw lengths are not revalidated on rerender", () => {
  const node = createFlexilyZeroEngine().createNode()
  const spy = vi.spyOn(
    node as unknown as { validateLength(prop: string, value: string): void },
    "validateLength",
  )
  const props = {
    width: 20,
    height: 4,
    paddingX: "max(1ch, 2ch)",
    gap: "max(10%, 20%)",
    left: "max(1ch, 25%)",
  } as unknown as BoxProps
  try {
    applyBoxProps(node, props)
    const afterFirst = spy.mock.calls.length
    expect(afterFirst).toBe(3)
    applyBoxProps(node, props, props)
    expect(spy.mock.calls.length).toBe(afterFirst)
  } finally {
    node.free()
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

// CSS Sizing 3 cyclic-percentage rule (#30346): during intrinsic (fit-content /
// snug-content) measurement a percentage part of a spacing length contributes
// ZERO, while ch resolves at the adapter scale. One evaluator decides — the
// pipeline asks the layout node instead of parsing the string itself.
test("string spacing in fit-content measurement contributes zero for percentages", () => {
  const render = createRenderer({ cols: 40, rows: 10 })
  const app = render(
    <Box testID="target" width={20} height="fit-content" flexDirection="column" gap="max(10%, 25%)">
      <Box height={1}>
        <Text>a</Text>
      </Box>
      <Box height={1}>
        <Text>b</Text>
      </Box>
    </Box>,
  )
  expect(app.getByTestId("target").boundingBox()?.height).toBe(2)
})

test("intrinsic spacing resolves percentages to zero and ch at the adapter scale", () => {
  const node = createFlexilyZeroEngine().createNode()
  // No percentage basis in intrinsic measurement: max(1ch, 25%) is 1ch.
  expect(node.intrinsicSpacing("paddingLeft", "max(1ch, 25%)", Number.NaN)).toBe(1)
  // A container-query part resolves against the given size, and to zero at NaN.
  expect(node.intrinsicSpacing("paddingLeft", "10cqi", Number.NaN)).toBe(0)
  expect(node.intrinsicSpacing("paddingLeft", "10cqi", 200)).toBe(20)
  expect(() => node.intrinsicSpacing("paddingLeft", "12wat", Number.NaN)).toThrow(
    /paddingLeft.*12wat/,
  )
})

test("percentage padding still resolves against the containing block in final layout", () => {
  const render = createRenderer({ cols: 40, rows: 10 })
  const app = render(
    <Box testID="target" width="fit-content" height="fit-content" paddingX="max(1ch, 25%)">
      <Box height={1}>
        <Text>a</Text>
      </Box>
    </Box>,
  )
  // 25% of the 40-column containing block, 10 per side; the estimate is not
  // the layout input for a fit-content width (measurePhase delegates that).
  expect(app.getByTestId("target").boundingBox()?.width).toBe(21)
})

test("width fit-content consumes the intrinsic gap across a rerender", () => {
  const render = createRenderer({ cols: 40, rows: 10 })
  const tree = (gap: string) => (
    <Box testID="target" width="fit-content" height={1} flexDirection="row" columnGap={gap}>
      <Box width={1}>
        <Text>a</Text>
      </Box>
      <Box width={1}>
        <Text>b</Text>
      </Box>
    </Box>
  )
  const app = render(tree("max(10%, 25%)"))
  // Final layout resolves the percentage against the containing block (10),
  // so the box is 2 columns of content plus one 10-column gap.
  expect(app.getByTestId("target").boundingBox()?.width).toBe(12)
  app.rerender(tree("max(20ch, 25%)"))
  // ch now wins over the same percentage: 2 + 20.
  expect(app.getByTestId("target").boundingBox()?.width).toBe(22)
})

test("snug-content width consumes the intrinsic spacing resolution", () => {
  const render = createRenderer({ cols: 40, rows: 10 })
  const tree = (
    <Box testID="target" width="snug-content" height={1} paddingX="max(1ch, 25%)">
      <Text>a</Text>
    </Box>
  )
  const app = render(tree)
  const stringWidth = app.getByTestId("target").boundingBox()?.width
  const numeric = render(
    <Box testID="numeric" width="snug-content" height={1} paddingX={1}>
      <Text>a</Text>
    </Box>,
  )
  const numericWidth = numeric.getByTestId("numeric").boundingBox()?.width
  expect(numericWidth).toBe(3)
  // The string form is NOT its numeric equivalent: 25% resolves against the
  // 40-column containing block (10 per side), so the correct box is one column
  // of content plus 20 of padding. The measure re-settle runs inside the first
  // layout transaction, so the FIRST exposed frame is the settled 21 — no
  // caller rerender repairs it.
  expect(stringWidth).toBe(21)
  app.rerender(tree)
  expect(app.getByTestId("target").boundingBox()?.width).toBe(21)
  app.rerender(tree)
  expect(app.getByTestId("target").boundingBox()?.width).toBe(21)
})

test("vertical padding under height fit-content consumes the intrinsic resolution", () => {
  const render = createRenderer({ cols: 40, rows: 10 })
  const tree = (
    <Box testID="target" width={20} height="fit-content" paddingY="max(1lh, 25%)">
      <Box height={1}>
        <Text>a</Text>
      </Box>
    </Box>
  )
  const app = render(tree)
  const stringHeight = app.getByTestId("target").boundingBox()?.height
  const numeric = render(
    <Box testID="numeric" width={20} height="fit-content" paddingY={1}>
      <Box height={1}>
        <Text>a</Text>
      </Box>
    </Box>,
  )
  const numericHeight = numeric.getByTestId("numeric").boundingBox()?.height
  expect(numericHeight).toBe(3)
  // Vertical padding percentages resolve against the containing-block WIDTH
  // (CSS2 §8.4), so 25% of 40 is 10 per side: one row of content plus 20.
  // The measure re-settle lands inside the first transaction: 21 on exposure,
  // and a follow-up rerender stays there.
  expect(stringHeight).toBe(21)
  app.rerender(tree)
  expect(app.getByTestId("target").boundingBox()?.height).toBe(21)
})

test("a resize re-resolves the percentage padding against the new containing block", () => {
  const render = createRenderer({ cols: 40, rows: 10 })
  const tree = (
    <Box testID="target" width="snug-content" height={1} paddingX="max(1ch, 25%)">
      <Text>a</Text>
    </Box>
  )
  const app = render(tree)
  app.rerender(tree)
  expect(app.getByTestId("target").boundingBox()?.width).toBe(21)

  // 25% of 80 is 20 per side: one column of content plus 40 of padding.
  app.resize(80, 10)
  // The resize runs the same in-transaction re-settle, so the resize itself
  // reports 41 — no repair rerender.
  expect(app.getByTestId("target").boundingBox()?.width).toBe(41)
  app.rerender(tree)
  expect(app.getByTestId("target").boundingBox()?.width).toBe(41)

  // And back: the old basis must not be replayed.
  app.resize(40, 10)
  expect(app.getByTestId("target").boundingBox()?.width).toBe(21)
})

// pipeline/AGENTS.md "Mandatory: Test Before Change": the re-settle edge needs
// a SILVERY_STRICT realistic-scale fixture and an incremental rerender. The
// settled rect must already be the FIRST returned rect — the transient
// intrinsic cap (1 + 1 + 1) never reaches the caller — and a normal rerender
// must leave the box exactly where the first render put it.
test("string percentage padding settles inside the first render at realistic scale", () => {
  const saved = process.env.SILVERY_STRICT
  process.env.SILVERY_STRICT = "2"
  resetStrictCache()
  try {
    const render = createRenderer({ cols: 40, rows: 60 })
    const tree = (label: string) => (
      <Box width={40} height={60} flexDirection="column">
        <Box testID="target" width="snug-content" height={1} paddingX="max(1ch, 25%)">
          <Text>{label}</Text>
        </Box>
        {Array.from({ length: 50 }, (_, index) => (
          <Box key={index} height={1} flexDirection="row">
            <Text>
              {label} row {index}
            </Text>
          </Box>
        ))}
      </Box>
    )
    const app = render(tree("a"))
    try {
      // 25% of the 40-column containing block is 10 per side, so the settled
      // box is one column of content plus 20 of padding.
      const settled = app.getByTestId("target").boundingBox()
      expect([settled?.x, settled?.y, settled?.width, settled?.height]).toEqual([0, 0, 21, 1])
      expect(app.text.split("\n")[0]).toBe(`${" ".repeat(10)}a`)
      expect(app.text.split("\n")[1]).toBe("a row 0")

      // Ordinary incremental rerender: geometry holds, content repaints.
      app.rerender(tree("b"))
      expect(app.getByTestId("target").boundingBox()).toEqual(settled)
      expect(app.text.split("\n")[0]).toBe(`${" ".repeat(10)}b`)
      expect(app.text.split("\n")[1]).toBe("b row 0")
    } finally {
      app.unmount()
    }
  } finally {
    if (saved === undefined) delete process.env.SILVERY_STRICT
    else process.env.SILVERY_STRICT = saved
    resetStrictCache()
  }
})

// Reviewer discriminator (#30346): the settle loop must leave prevLayout and
// layoutChangedThisFrame describing the LAST EXPOSED frame. Terminal dimensions
// stay fixed -- app.resize discards the previous buffer and hides this -- and
// the only input change is an ordinary React width change that re-resolves
// percentage padding, so the frame runs measure/layout more than once. The
// unchanged sibling moves on the first engine pass and stays put on the next,
// and its old exposed cells sit in the shrunken panel's clear region.
test("percentage padding settlement keeps the exposed-frame witness", () => {
  const saved = process.env.SILVERY_STRICT
  process.env.SILVERY_STRICT = "2"
  resetStrictCache()
  try {
    const render = createRenderer({ cols: 80, rows: 60 })
    const tree = (basisWidth: number) => (
      <Box width={80} height={60} flexDirection="row">
        <Box width={40} height={60} flexDirection="column">
          <Box
            testID="panel"
            width={basisWidth}
            height={30}
            flexDirection="column"
            backgroundColor="red"
          >
            <Box testID="settler" width={4} height="fit-content" paddingY="max(1lh, 25%)">
              <Box height={1}>
                <Text>U</Text>
              </Box>
            </Box>
            <Box testID="sibling" height={1}>
              <Text>SIBL</Text>
            </Box>
          </Box>
        </Box>
        <Box width={40} height={60} flexDirection="column">
          {Array.from({ length: 25 }, (_, index) => (
            <Box key={index} height={1}>
              <Text>row {index} content</Text>
            </Box>
          ))}
        </Box>
      </Box>
    )
    const app = render(tree(40))
    try {
      // Exposed frame: 25% of the 40-column containing block is 10 per side, so
      // the settler is one row of content plus 20 rows of padding.
      const exposedPanel = [0, 0, 40, 30]
      const panel = app.getByTestId("panel")
      const box = panel.boundingBox()
      expect([box?.x, box?.y, box?.width, box?.height]).toEqual(exposedPanel)
      expect(app.getByTestId("settler").boundingBox()?.height).toBe(21)
      expect(app.getByTestId("sibling").boundingBox()?.y).toBe(21)
      let rows = app.text.split("\n")
      expect(rows[10]!.startsWith("U")).toBe(true)
      expect(rows[21]!.startsWith("SIBL")).toBe(true)

      // The parent width change makes the settler settle on the FIRST engine
      // pass (25% of 20 is 5 per side): 1 + 10 = 11, and the unchanged sibling
      // moves from row 21 to row 11 without ever moving again. The panel itself
      // is fixed at 30 rows, so its own rect change happens on the first pass
      // only -- the second pass is what used to overwrite the witness.
      app.rerender(tree(20))
      const settled = panel.boundingBox()
      expect([settled?.x, settled?.y, settled?.width, settled?.height]).toEqual([0, 0, 20, 30])
      expect(app.getByTestId("settler").boundingBox()?.height).toBe(11)
      expect(app.getByTestId("sibling").boundingBox()?.y).toBe(11)
      rows = app.text.split("\n")
      // New cells are painted at the final position.
      expect(rows[5]!.startsWith("U")).toBe(true)
      expect(rows[11]!.startsWith("SIBL")).toBe(true)
      // Old cells are not resurrected (left pane columns only; the right pane
      // owns the tail of every row).
      expect(rows[10]!.slice(0, 40).trim()).toBe("")
      expect(rows[21]!.slice(0, 40).trim()).toBe("")

      // Guard the assertions above against a degenerate fixture: the panel's
      // current rect really does carry its background.
      expect(app.getByTestId("panel").boundingBox()?.width).toBe(20)

      // The vacated part of the exposed panel is cleared: the shrunken panel
      // owns columns 0..19 only, so nothing red survives at columns 20..39.
      const buffer = app.lastBuffer()!
      expect(buffer.getCell(0, 0).bg).toBe(1)
      for (let y = 0; y < 30; y++) {
        for (let x = 20; x < 40; x++) {
          expect(buffer.getCell(x, y).bg, `stale bg at ${x},${y}`).toBeNull()
        }
      }

      // Stable follow-up: an ordinary incremental rerender keeps every box.
      app.rerender(tree(20))
      expect(panel.boundingBox()).toEqual(settled)
      expect(app.text.split("\n")[11]!.startsWith("SIBL")).toBe(true)
    } finally {
      app.unmount()
    }
  } finally {
    if (saved === undefined) delete process.env.SILVERY_STRICT
    else process.env.SILVERY_STRICT = saved
    resetStrictCache()
  }
})

// Nested move/shrink half of the same witness (#30346): a percentage-sized
// child shrinks on the first engine pass and holds while the settle re-measures
// its cousin. Its old clear region (the columns and rows of the exposed rect
// outside the final rect) must be cleared from the carried buffer, and the
// witness must still name the exposed rect the old pixels were painted into.
test("percentage padding settlement clears a nested shrink's exposed cells", () => {
  const saved = process.env.SILVERY_STRICT
  process.env.SILVERY_STRICT = "2"
  resetStrictCache()
  try {
    const render = createRenderer({ cols: 80, rows: 60 })
    const tree = (basisWidth: number) => (
      <Box width={80} height={60} flexDirection="row">
        <Box width={40} height={60} flexDirection="column">
          <Box testID="outer" width={basisWidth} height={30} flexDirection="column">
            <Box
              testID="nested"
              width="50%"
              height={2}
              paddingLeft="max(1ch, 25%)"
              backgroundColor="blue"
            >
              <Text>NEST</Text>
            </Box>
            <Box testID="sibling" height={1}>
              <Text>SIBL</Text>
            </Box>
            <Box testID="settler" width={4} height="fit-content" paddingY="max(1lh, 25%)">
              <Box height={1}>
                <Text>U</Text>
              </Box>
            </Box>
            {Array.from({ length: 10 }, (_, index) => (
              <Box key={index} height={1}>
                <Text>inner {index}</Text>
              </Box>
            ))}
          </Box>
        </Box>
        <Box width={40} height={60} flexDirection="column">
          {Array.from({ length: 25 }, (_, index) => (
            <Box key={index} height={1}>
              <Text>row {index} content</Text>
            </Box>
          ))}
        </Box>
      </Box>
    )
    const app = render(tree(40))
    try {
      const exposedNested = [0, 0, 20, 1]
      const nested = app.getByTestId("nested")
      const box = nested.boundingBox()
      expect([box?.x, box?.y, box?.width, box?.height]).toEqual(exposedNested)
      expect(app.text.split("\n")[0]!.slice(10, 14)).toBe("NEST")

      // 50% of the 20-column panel, with 25% padding: 10 wide, text at column 5.
      app.rerender(tree(20))
      const shrunk = nested.boundingBox()
      expect([shrunk?.x, shrunk?.y, shrunk?.width, shrunk?.height]).toEqual([0, 0, 10, 2])
      const rows = app.text.split("\n")
      expect(rows[0]!.slice(5, 9)).toBe("NEST")
      // The exposed text position is gone, and the rows the exposed box painted
      // that the final box no longer covers are blank.
      expect(rows[0]!.slice(10, 14)).not.toBe("NEST")
      const buffer = app.lastBuffer()!
      expect(buffer.getCell(5, 0).bg).toBe(4)
      for (let y = 0; y < 2; y++) {
        for (let x = 10; x < 20; x++) {
          expect(buffer.getCell(x, y).bg, `stale bg at ${x},${y}`).toBeNull()
        }
      }

      // The nested box moved on the first pass only; the carried buffer still
      // holds the exposed pixels it has to clear (asserted above by bg cell).
      expect(app.getByTestId("nested").boundingBox()?.width).toBe(10)
    } finally {
      app.unmount()
    }
  } finally {
    if (saved === undefined) delete process.env.SILVERY_STRICT
    else process.env.SILVERY_STRICT = saved
    resetStrictCache()
  }
})

test("the yoga engine keeps its named unsupported-input result for string spacing", async () => {
  const yoga = await initYogaEngine()
  const previous = createFlexilyZeroEngine()
  setLayoutEngine(yoga)
  try {
    const render = createRenderer({ cols: 40, rows: 10 })
    expect(() =>
      render(
        <Box width={20} height="fit-content" flexDirection="column" gap="max(10%, 25%)">
          <Box height={1}>
            <Text>a</Text>
          </Box>
        </Box>,
      ),
    ).toThrow(/yoga|SILVERY_ENGINE=flexily/i)
  } finally {
    setLayoutEngine(previous)
  }
})
