/**
 * Defaults contract — `createTermless()` test harness.
 *
 * See tests/contracts/README.md for the convention.
 *
 * `createTermless(dims?)` (from `@silvery/test`) is the xterm.js-backed Term
 * factory used by every integration test in this repository. Its documented
 * defaults:
 *
 *   - `dims` → `{ cols: 80, rows: 24 }`
 *   - Returns a `TermlessTerm` with `.mouse` and `.clipboard` attached
 *   - Registers the instance in a WeakRef set for leak detection
 *   - OSC 52 payloads are captured by wrapping `emulator.feed`
 *
 * Because every mouse/selection test in the repo goes through this factory,
 * a default regression here is a quiet multi-test failure. Contract tests
 * pin the API shape even when the behavior is "obvious".
 */

import { createRequire } from "node:module"
import { afterEach, beforeAll, describe, expect, test } from "vitest"
import { createTermless, getActiveTermlessCount } from "../../packages/test/src/index.js"

const requireForGhostty = createRequire(import.meta.url)
const originalTermlessBackend = process.env.TERMLESS_BACKEND
const originalStrictTerminal = process.env.SILVERY_STRICT_TERMINAL

function backendName(term: unknown): string | undefined {
  return (term as { _emulator?: { backend?: { name?: string } } })._emulator?.backend?.name
}

function captureSendInput(term: unknown): string[] {
  const chunks: string[] = []
  ;(term as { sendInput: (data: string) => void }).sendInput = (data: string) => {
    chunks.push(data)
  }
  return chunks
}

afterEach(() => {
  if (originalTermlessBackend === undefined) {
    delete process.env.TERMLESS_BACKEND
  } else {
    process.env.TERMLESS_BACKEND = originalTermlessBackend
  }
  if (originalStrictTerminal === undefined) {
    delete process.env.SILVERY_STRICT_TERMINAL
  } else {
    process.env.SILVERY_STRICT_TERMINAL = originalStrictTerminal
  }
})

// ============================================================================
// Dimensions default — 80 × 24
// ============================================================================

describe("contract: createTermless dims", () => {
  test("contract: dims default to { cols: 80, rows: 24 } when omitted", () => {
    using term = createTermless()
    expect(term.cols).toBe(80)
    expect(term.rows).toBe(24)
  })

  test("contract: explicit dims override the default", () => {
    using term = createTermless({ cols: 40, rows: 10 })
    expect(term.cols).toBe(40)
    expect(term.rows).toBe(10)
  })
})

// ============================================================================
// Surface shape — .mouse and .clipboard must exist with the documented API.
// ============================================================================
//
// Regression shape: accidentally removing one of these (e.g. splitting the
// test package but forgetting to re-export `.mouse`) silently breaks every
// test that touches mouse or clipboard. Pin the surface.

describe("contract: createTermless surface", () => {
  test("contract: returned term exposes .mouse with the documented methods", () => {
    using term = createTermless({ cols: 20, rows: 5 })
    expect(term.mouse).toBeDefined()
    expect(typeof term.mouse.down).toBe("function")
    expect(typeof term.mouse.up).toBe("function")
    expect(typeof term.mouse.move).toBe("function")
    expect(typeof term.mouse.click).toBe("function")
    expect(typeof term.mouse.dblclick).toBe("function")
    expect(typeof term.mouse.drag).toBe("function")
    expect(typeof term.mouse.wheel).toBe("function")
  })

  test("contract: returned term exposes .clipboard with the documented methods", () => {
    using term = createTermless({ cols: 20, rows: 5 })
    expect(term.clipboard).toBeDefined()
    expect(term.clipboard.last).toBeNull()
    expect(Array.isArray(term.clipboard.all)).toBe(true)
    expect(term.clipboard.all).toHaveLength(0)
    expect(typeof term.clipboard.clear).toBe("function")
  })
})

// ============================================================================
// Mouse wheel bytes — match real SGR wheel axes, modifiers, and cadence control.
// ============================================================================

describe("contract: createTermless mouse wheel bytes", () => {
  test("contract: object-form wheel emits horizontal SGR buttons with modifier bits", async () => {
    using term = createTermless({ cols: 20, rows: 5 })
    const chunks = captureSendInput(term)
    const wheel = term.mouse.wheel as unknown as (
      x: number,
      y: number,
      options: { deltaX: number; deltaY: number; shift: boolean; ctrl: boolean; cadenceMs: number },
    ) => Promise<void>

    await wheel(2, 3, { deltaX: -2, deltaY: 1, shift: true, ctrl: true, cadenceMs: 0 })

    expect(chunks.join("")).toBe("\x1b[<86;3;4M\x1b[<86;3;4M\x1b[<85;3;4M")
  })

  test("contract: legacy numeric wheel accepts modifier bits and cadence override", async () => {
    using term = createTermless({ cols: 20, rows: 5 })
    const chunks = captureSendInput(term)
    const wheel = term.mouse.wheel as unknown as (
      x: number,
      y: number,
      delta: number,
      options: { alt: boolean; cadenceMs: number },
    ) => Promise<void>

    await wheel(1, 2, -2, { alt: true, cadenceMs: 0 })

    expect(chunks.join("")).toBe("\x1b[<72;2;3M\x1b[<72;2;3M")
  })
})

// ============================================================================
// Backend selection — STRICT ghostty means end-to-end ghostty unless overridden.
// ============================================================================

// @termless-backend: ghostty
describe("contract: createTermless backend selection", () => {
  beforeAll(async () => {
    const { initGhostty } = requireForGhostty(
      "@termless/ghostty",
    ) as typeof import("@termless/ghostty")
    await initGhostty()
  })

  test("contract: SILVERY_STRICT_TERMINAL=ghostty implies the ghostty backend", () => {
    delete process.env.TERMLESS_BACKEND
    process.env.SILVERY_STRICT_TERMINAL = "ghostty"

    using term = createTermless({ cols: 20, rows: 5 })

    expect(backendName(term)).toBe("ghostty")
  })

  test("contract: TERMLESS_BACKEND remains the explicit suite-level override", () => {
    process.env.TERMLESS_BACKEND = "xterm"
    process.env.SILVERY_STRICT_TERMINAL = "ghostty"

    using term = createTermless({ cols: 20, rows: 5 })

    expect(backendName(term)).toBe("xterm")
  })

  test("contract: per-call backend remains the strongest override", () => {
    process.env.TERMLESS_BACKEND = "ghostty"
    process.env.SILVERY_STRICT_TERMINAL = "ghostty"

    using term = createTermless({ cols: 20, rows: 5, backend: "xterm" })

    expect(backendName(term)).toBe("xterm")
  })
})

// ============================================================================
// Leak tracking — getActiveTermlessCount() must reflect disposed instances.
// ============================================================================
//
// Regression shape: `using term = createTermless()` relies on Symbol.dispose
// firing at scope exit to evict the WeakRef. If dispose stops running (or
// the WeakRef is never created), every test worker accumulates ~1 MB of
// xterm.js scrollback per termless call — 18-28 GB observed before
// `km-silvery.termless-memleak` fixed the disposal path.

describe("contract: createTermless leak tracking", () => {
  test("contract: getActiveTermlessCount reflects live instances in scope", () => {
    const baseline = getActiveTermlessCount()
    {
      using term = createTermless({ cols: 10, rows: 3 })
      // Keep a reference so the WeakRef doesn't get collected within the block.
      expect(term.cols).toBe(10)
      const activeInside = getActiveTermlessCount()
      expect(activeInside).toBeGreaterThanOrEqual(baseline + 1)
    }
    // After `using` disposal, the term is eligible for GC. We can't force GC
    // deterministically, but the count should not have grown relative to
    // baseline over many iterations — see km-silvery.termless-memleak for
    // the full stress test.
  })
})

// ============================================================================
// Phase 2 backlog — defaults still to cover
// ============================================================================
//
// - OSC 52 capture default: every clipboard write must land in `.all`
//   (already covered indirectly by run-defaults seed 1, but deserves a
//   dedicated contract so removing the feed() wrapper gets caught here).
// - Stepper delay default: `drag({ stepDelay })` defaults to 20 ms.
// - Button default: `.mouse.down(x, y)` with no options → button 0 (left).
// - `dims` validation: negative / zero values should throw or clamp — TBD.
//
// See `createTermless` in packages/test/src/index.tsx.
