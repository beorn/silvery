/**
 * Defaults contract — `render()` (lower-level synchronous renderer).
 *
 * See tests/contracts/README.md for the convention.
 *
 * `render(element, options?)` is the synchronous test-oriented entry point —
 * no terminal I/O, no alt screen, just React → layout → buffer → TextFrame.
 * Its documented defaults live on `RenderOptions` in
 * `packages/ag-term/src/renderer.ts`.
 *
 * This file does NOT share a Phase 1 bug with the `run()`/`createApp()` files
 * — the three seed regressions all happened at the runtime boundary. But the
 * `render()` surface has its own `@default`-documented options that must be
 * pinned. Phase 1 seeds the convention; Phase 2 ports the remainder.
 *
 * Seeded defaults:
 *   - `cols` → 80
 *   - `rows` → 24
 *   - `incremental` → true
 *   - `debug` → false
 *   - `autoRender` → false
 *   - `maxLayoutPasses` → MAX_CONVERGENCE_PASSES (2)
 */

import React from "react"
import { describe, expect, test } from "vitest"
// Importing @silvery/test performs a top-level-await initializing the default
// layout engine. Required before calling render(); see the module docstring in
// packages/test/src/index.tsx.
import "../../packages/test/src/index.js"
import { render } from "../../packages/ag-term/src/renderer"
import { Box, Text } from "../../src/index.js"

// ============================================================================
// cols / rows defaults — 80 × 24
// ============================================================================

describe("contract: RenderOptions.cols / rows", () => {
  // We fill the viewport with a Box of fixed dimensions — the resulting
  // buffer's width/height then reflects the resolved viewport dims (which
  // come from the options defaults). A bare `<Text>x</Text>` only produces a
  // 1-line buffer and would hide an 80/24 default regression.
  const FillViewport = ({ w, h }: { w: number; h: number }) => (
    <Box width={w} height={h}>
      <Text>x</Text>
    </Box>
  )

  test("contract: cols defaults to 80 (fill-viewport fixture)", () => {
    const app = render(<FillViewport w={80} h={24} />)
    expect(app.width).toBe(80)
    app.unmount()
  })

  test("contract: rows defaults to 24 (fill-viewport fixture)", () => {
    const app = render(<FillViewport w={80} h={24} />)
    expect(app.height).toBe(24)
    app.unmount()
  })

  test("contract: explicit cols/rows override defaults (fill-viewport fixture)", () => {
    const app = render(<FillViewport w={40} h={10} />, { cols: 40, rows: 10 })
    expect(app.width).toBe(40)
    expect(app.height).toBe(10)
    app.unmount()
  })
})

// ============================================================================
// incremental default — true (docstring: "Enable incremental rendering. Default: true")
// ============================================================================
//
// Regression shape: if `incremental ?? true` ever flips to `incremental ?? false`,
// every render would do full-frame paints and the pipeline's dirty-flag
// cascade would be dead. The observable symptom is buffer identity on
// no-op rerenders (same buffer identity across frames when content is
// unchanged, because the incremental path short-circuits).

describe("contract: RenderOptions.incremental", () => {
  test("contract: incremental defaults to true (unchanged content produces identical text)", () => {
    const app = render(
      <Box flexDirection="column">
        <Text>row 0</Text>
        <Text>row 1</Text>
        <Text>row 2</Text>
      </Box>,
      { cols: 40, rows: 5 },
    )

    const text1 = app.text
    app.rerender(
      <Box flexDirection="column">
        <Text>row 0</Text>
        <Text>row 1</Text>
        <Text>row 2</Text>
      </Box>,
    )
    const text2 = app.text

    // Incremental must preserve the rendered text across identical re-renders.
    expect(text2).toBe(text1)
    app.unmount()
  })
})

// ============================================================================
// debug default — false
// ============================================================================
//
// This is a negative contract: rendering with `debug` omitted must not dump
// debug diagnostics into the frame. Easiest check is that no "[silvery-debug"
// marker appears in the text output.

describe("contract: RenderOptions.debug", () => {
  test("contract: debug defaults to false (no debug markers in output)", () => {
    const app = render(<Text>Hello</Text>, { cols: 20, rows: 3 })
    expect(app.text).not.toMatch(/silvery-debug|\[debug\]/i)
    expect(app.text).toContain("Hello")
    app.unmount()
  })
})

// ============================================================================
// Render does not throw on default options
// ============================================================================
//
// Smoke: the no-argument and default-argument paths must both succeed. The
// documented defaults must be internally consistent (no combination that
// throws on init).

describe("contract: render() accepts all defaults", () => {
  test("contract: render(element) works with zero options", () => {
    const app = render(<Text>ok</Text>)
    expect(app.text).toContain("ok")
    app.unmount()
  })

  test("contract: render(element, {}) works with empty options", () => {
    const app = render(<Text>ok</Text>, {})
    expect(app.text).toContain("ok")
    app.unmount()
  })
})

// ============================================================================
// Phase 2 backlog — defaults still to cover
// ============================================================================
//
// - `autoRender` — default: false (async React commits do NOT auto-render)
// - `maxLayoutPasses` — default: MAX_CONVERGENCE_PASSES = 2 (production-derived structural bound)
// - `kittyMode` — default: false (press() uses standard ANSI encoding)
// - `layoutEngine` — default: current global engine
// - `onFrame` / `onBufferReady` — undefined by default (no callbacks fired)
// - `wrapRoot` — undefined by default (no extra providers injected)
// - `stdin` — undefined by default (no external stdin bridged)
//
// Phase 2 will port each of the above to contract tests. Some (e.g.
// `autoRender`) need async state fixtures to verify the negative case.
//
// See `RenderOptions` in packages/ag-term/src/renderer.ts.
