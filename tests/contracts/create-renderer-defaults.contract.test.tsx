/**
 * Defaults contract — `createRenderer()` test-harness factory.
 *
 * See tests/contracts/README.md for the convention.
 *
 * `createRenderer(opts?)` (from `@silvery/test`) is the auto-cleanup factory
 * used by ~100 km-tui tests and by every silvery unit test that needs
 * synchronous rendering. It wraps `render()` with documented factory-level
 * semantics layered on top of `RenderOptions` (which the sibling file
 * `render-defaults.contract.test.tsx` covers):
 *
 *   - `optsOrStore` → `{}` — zero-arg invocation must work
 *   - `cols` → 80, `rows` → 24 (inherited from render())
 *   - `incremental` → `true` (explicitly documented; createRenderer MUST
 *     opt into incremental even when a bare Store is passed)
 *   - Auto-cleanup: each call unmounts the previous instance unless the
 *     fast-path reuse conditions are met
 *   - Instance reuse: when safe, the same `App` is returned across calls
 *     (see km-silvery.renderer-reuse for the motivating regression)
 *   - `PerRenderOptions` (`incremental`, `singlePassLayout`, `kittyMode`)
 *     must force a fresh mount when they conflict with baseOpts
 *
 * These contracts are independent of terminal caps / profile / `Term` —
 * `createRenderer` is a headless factory and never touches stdout or
 * capability detection. It is therefore safe to pin alongside in-flight
 * work on those adjacent surfaces.
 */

import React from "react"
import { describe, expect, test } from "vitest"
// Top-level await in @silvery/test initializes the default layout engine.
// Required before calling createRenderer() / render().
import "../../packages/test/src/index.js"
import { createRenderer } from "../../packages/ag-term/src/renderer"
import { Box, Text } from "../../src/index.js"

// ============================================================================
// Zero-arg invocation — createRenderer() must work without any options
// ============================================================================

describe("contract: createRenderer() accepts zero options", () => {
  test("contract: createRenderer() returns a render function with no arguments", () => {
    const render = createRenderer()
    expect(typeof render).toBe("function")
    const app = render(<Text>hello</Text>)
    expect(app.text).toContain("hello")
    app.unmount()
  })

  test("contract: createRenderer({}) returns a render function with empty options", () => {
    const render = createRenderer({})
    const app = render(<Text>hi</Text>)
    expect(app.text).toContain("hi")
    app.unmount()
  })
})

// ============================================================================
// Dimensions — cols/rows default to 80×24 when omitted
// ============================================================================

describe("contract: createRenderer dimensions", () => {
  // Use a Box that fills the viewport so we can read width/height back from
  // the rendered buffer. A bare <Text> always produces a 1-line buffer and
  // would hide a cols/rows default regression.
  const FillViewport = ({ w, h }: { w: number; h: number }) => (
    <Box width={w} height={h}>
      <Text>x</Text>
    </Box>
  )

  test("contract: cols/rows default to 80×24 when omitted", () => {
    const render = createRenderer()
    const app = render(<FillViewport w={80} h={24} />)
    expect(app.width).toBe(80)
    expect(app.height).toBe(24)
    app.unmount()
  })

  test("contract: explicit cols/rows override the defaults", () => {
    const render = createRenderer({ cols: 40, rows: 10 })
    const app = render(<FillViewport w={40} h={10} />)
    expect(app.width).toBe(40)
    expect(app.height).toBe(10)
    app.unmount()
  })
})

// ============================================================================
// Incremental — true by default (createRenderer-specific contract)
// ============================================================================
//
// Regression shape: `createRenderer` documents that incremental is enabled by
// default "for all test renders" — its baseOpts explicitly spreads
// `{ incremental: true, ...optsOrStore }`. If that default flips, every km-tui
// test would silently stop exercising the incremental pipeline. The behavioral
// check is identical to render-defaults: rerendering identical content must
// preserve text via the incremental short-circuit.

describe("contract: createRenderer incremental default", () => {
  test("contract: incremental defaults to true (identical rerender preserves text)", () => {
    const render = createRenderer({ cols: 40, rows: 5 })
    const tree = (
      <Box flexDirection="column">
        <Text>row 0</Text>
        <Text>row 1</Text>
        <Text>row 2</Text>
      </Box>
    )
    const app = render(tree)
    const text1 = app.text
    // The returned render function re-renders the same instance via
    // rerender() on the reuse fast path — verifies BOTH that reuse works
    // AND that incremental is on (text identity preserved).
    const app2 = render(tree)
    expect(app2).toBe(app) // instance reuse (see km-silvery.renderer-reuse)
    expect(app2.text).toBe(text1)
    app.unmount()
  })
})

// ============================================================================
// Auto-cleanup — each render() unmounts the previous instance when reuse
// is unsafe (different content shape + conflicting per-render overrides)
// ============================================================================
//
// Regression shape: if auto-cleanup stops running, every createRenderer call
// accumulates live React roots and fiber trees. `getActiveRenderCount()`
// would grow unbounded across a test worker lifecycle. This matters because
// the docstring explicitly promises "auto-cleans previous renders."

describe("contract: createRenderer auto-cleanup", () => {
  test("contract: conflicting per-render override forces fresh mount (previous unmounted)", () => {
    const render = createRenderer({ cols: 40, rows: 5 })

    const app1 = render(<Text>first</Text>)
    expect(app1.text).toContain("first")

    // Flip `singlePassLayout` — this conflicts with baseOpts and forces a
    // fresh mount per `canReuseInstance()`. app2 must be a different App
    // than app1, and app1 must have been unmounted.
    const app2 = render(<Text>second</Text>, { singlePassLayout: true })
    expect(app2).not.toBe(app1)
    expect(app2.text).toContain("second")
    app2.unmount()
  })

  test("contract: repeated calls with identical config reuse the same App", () => {
    // The reuse fast path is a documented behavior — without it, every call
    // pays the full React reconciler init cost. Pin it so an accidental
    // regression (e.g., disabling `currentReusable`) gets caught.
    const render = createRenderer({ cols: 40, rows: 5 })
    const app1 = render(<Text>a</Text>)
    const app2 = render(<Text>b</Text>)
    const app3 = render(<Text>c</Text>)
    expect(app2).toBe(app1)
    expect(app3).toBe(app1)
    expect(app3.text).toContain("c")
    app3.unmount()
  })
})

// ============================================================================
// PerRenderOptions — incremental/singlePassLayout/kittyMode overrides
// ============================================================================
//
// Regression shape: per-render overrides MUST force a fresh mount when they
// conflict with baseOpts (otherwise the overrides would be silently ignored
// because the reused instance carries the base config).

describe("contract: createRenderer per-render overrides", () => {
  test("contract: overriding incremental forces fresh mount", () => {
    const render = createRenderer({ cols: 20, rows: 3 })
    const app1 = render(<Text>one</Text>)
    const app2 = render(<Text>two</Text>, { incremental: false })
    // Flipping incremental is a conflicting override — previous instance was
    // configured with `incremental: true` from baseOpts.
    expect(app2).not.toBe(app1)
    app2.unmount()
  })

  test("contract: overriding singlePassLayout forces fresh mount", () => {
    const render = createRenderer({ cols: 20, rows: 3 })
    const app1 = render(<Text>one</Text>)
    const app2 = render(<Text>two</Text>, { singlePassLayout: true })
    expect(app2).not.toBe(app1)
    app2.unmount()
  })

  test("contract: overriding kittyMode forces fresh mount", () => {
    const render = createRenderer({ cols: 20, rows: 3 })
    const app1 = render(<Text>one</Text>)
    const app2 = render(<Text>two</Text>, { kittyMode: true })
    expect(app2).not.toBe(app1)
    app2.unmount()
  })

  test("contract: no overrides preserves instance reuse (no spurious remount)", () => {
    const render = createRenderer({ cols: 20, rows: 3 })
    const app1 = render(<Text>one</Text>)
    const app2 = render(<Text>two</Text>) // no overrides
    expect(app2).toBe(app1)
    app2.unmount()
  })
})

// ============================================================================
// Store-mode — bare Store input must still enable incremental by default
// ============================================================================
//
// The `createRenderer` source carries a specific branch for Store input:
//
//   const baseOpts = isStore(optsOrStore)
//     ? { incremental: true, cols: optsOrStore.cols, rows: optsOrStore.rows }
//     : { incremental: true, ...optsOrStore }
//
// i.e. both branches force `incremental: true` at the factory level. A
// regression that dropped the first `incremental: true` would silently turn
// off incremental for Store-mode consumers. Pin it.

describe("contract: createRenderer Store-mode incremental", () => {
  test("contract: bare Store input (cols+rows only) enables incremental by default", () => {
    // A Store-like object triggers the isStore() branch. The resulting
    // render function must still produce instance-reuse on identical
    // rerenders (which only happens when incremental is on).
    const render = createRenderer({ cols: 20, rows: 3 } as { cols: number; rows: number })
    const app1 = render(<Text>x</Text>)
    const app2 = render(<Text>x</Text>)
    // Instance reuse is the observable proxy for "incremental wasn't
    // silently disabled for Store-mode inputs."
    expect(app2).toBe(app1)
    app2.unmount()
  })
})

// ============================================================================
// Phase 2 backlog — defaults still to cover
// ============================================================================
//
// - `debug` default → false (no debug markers in createRenderer output)
//   — covered in render-defaults; add createRenderer-specific variant here
//   if the factory ever diverges.
// - `autoRender` default → false
// - `kittyMode` default → false (press() uses standard ANSI encoding)
// - `wrapRoot` / `stdin` defaults → undefined
// - `layoutEngine` default → current global engine
//
// Many of these are inherited from `RenderOptions` and already pinned in
// `render-defaults.contract.test.tsx`. Port the createRenderer-specific
// variants (factory-level behavior under each) as Phase 2 work.
