/**
 * STRICT residue invariant — sentinel-compare verification.
 *
 * Bead: @km/silvery/render-no-stale-residue-invariant (P1, 2026-05-05).
 *
 * Three test categories:
 *   1. default-off  — SILVERY_STRICT=1 must NOT trip residue check (back-compat)
 *   2. tier-2       — SILVERY_STRICT=2 turns the residue check on
 *   3. explicit slug — SILVERY_STRICT=residue turns it on (per-slug isolation)
 *
 * Plus a deliberate stale-carry-over fixture: a synthesised "incremental"
 * buffer that retains a sentinel cell where the "fresh" baseline painted
 * fresh content. The verifier MUST throw with a SENTINEL LEAK diagnostic.
 */
import React from "react"
import { describe, test, expect, beforeEach, afterEach } from "vitest"
import { Box, Text } from "silvery"
import { createRenderer } from "@silvery/test"
import { TerminalBuffer } from "@silvery/ag-term/buffer"
import {
  RESIDUE_SENTINEL_CHAR,
  RESIDUE_SENTINEL_RGB,
  isResidueStrictEnabled,
  poisonBufferWithSentinel,
  verifyNoResidueLeak,
} from "@silvery/ag-term/pipeline/strict-residue"
import { resetStrictCache } from "@silvery/ag-term/strict-mode"
import { IncrementalRenderMismatchError } from "@silvery/ag-term/errors"

// ───────── env-var helpers ────────────────────────────────────────────────

function withStrictEnv<T>(value: string | undefined, fn: () => T): T {
  const saved = process.env.SILVERY_STRICT
  if (value === undefined) {
    delete process.env.SILVERY_STRICT
  } else {
    process.env.SILVERY_STRICT = value
  }
  resetStrictCache()
  try {
    return fn()
  } finally {
    if (saved === undefined) delete process.env.SILVERY_STRICT
    else process.env.SILVERY_STRICT = saved
    resetStrictCache()
  }
}

beforeEach(() => resetStrictCache())
afterEach(() => resetStrictCache())

// ─────────────────────────────────────────────────────────────────────────
// Sentinel choice — verified theme-safe
// ─────────────────────────────────────────────────────────────────────────

describe("residue sentinel value", () => {
  test("sentinel RGB is rgb(254, 0, 254) — unused by any shipped theme", () => {
    expect(RESIDUE_SENTINEL_RGB).toEqual({ r: 254, g: 0, b: 254 })
  })

  test("sentinel char is 'þ' — non-ASCII, not used in default UI text", () => {
    expect(RESIDUE_SENTINEL_CHAR).toBe("þ")
  })

  test("poisonBufferWithSentinel fills every cell with the sentinel", () => {
    const buf = new TerminalBuffer(10, 5)
    // Pre-fill with non-sentinel content
    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 10; x++) {
        buf.setCell(x, y, { char: "X", fg: null })
      }
    }
    poisonBufferWithSentinel(buf)
    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 10; x++) {
        const c = buf.getCell(x, y)
        expect(c.char).toBe(RESIDUE_SENTINEL_CHAR)
        expect(c.bg).toEqual(RESIDUE_SENTINEL_RGB)
        expect(c.fg).toEqual(RESIDUE_SENTINEL_RGB)
      }
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────
// Strict-gate semantics
// ─────────────────────────────────────────────────────────────────────────

describe("residue strict gate (SILVERY_STRICT)", () => {
  test("default-off: SILVERY_STRICT=1 does NOT enable residue", () => {
    expect(withStrictEnv("1", () => isResidueStrictEnabled())).toBe(false)
  })

  test("default-off: SILVERY_STRICT unset does NOT enable residue", () => {
    expect(withStrictEnv(undefined, () => isResidueStrictEnabled())).toBe(false)
  })

  test("default-off: SILVERY_STRICT=0 does NOT enable residue", () => {
    expect(withStrictEnv("0", () => isResidueStrictEnabled())).toBe(false)
  })

  test("tier 2 enables residue: SILVERY_STRICT=2", () => {
    expect(withStrictEnv("2", () => isResidueStrictEnabled())).toBe(true)
  })

  test("tier 3 enables residue: SILVERY_STRICT=3", () => {
    expect(withStrictEnv("3", () => isResidueStrictEnabled())).toBe(true)
  })

  test("explicit slug: SILVERY_STRICT=residue", () => {
    expect(withStrictEnv("residue", () => isResidueStrictEnabled())).toBe(true)
  })

  test("explicit slug + tier: SILVERY_STRICT=residue,1 still enables it", () => {
    expect(withStrictEnv("residue,1", () => isResidueStrictEnabled())).toBe(true)
  })

  test("per-test opt-out: SILVERY_STRICT=2,!residue", () => {
    expect(withStrictEnv("2,!residue", () => isResidueStrictEnabled())).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────
// Buffer comparison primitive — catches deliberate stale carry-over
// ─────────────────────────────────────────────────────────────────────────

describe("verifyNoResidueLeak: catches deliberate stale carry-over", () => {
  test("clean buffers (no sentinel, all match) does NOT throw", () => {
    const prev = new TerminalBuffer(10, 3)
    const incr = new TerminalBuffer(10, 3)
    const fresh = new TerminalBuffer(10, 3)
    for (let y = 0; y < 3; y++) {
      for (let x = 0; x < 10; x++) {
        prev.setCell(x, y, { char: "A", fg: null })
        incr.setCell(x, y, { char: "A", fg: null })
        fresh.setCell(x, y, { char: "A", fg: null })
      }
    }
    expect(() => verifyNoResidueLeak(prev, incr, fresh, 1)).not.toThrow()
  })

  test("legitimate skip (prev correct, sentinel covers it): does NOT throw", () => {
    // Sentinel at (3, 1) in incr — cascade skipped this cell. Real prev
    // had 'A' which IS what fresh paints. Cascade was correct;
    // sentinel-poison is artifact of the verification harness, not a
    // bug. MUST NOT throw.
    const prev = new TerminalBuffer(10, 3)
    const incr = new TerminalBuffer(10, 3)
    const fresh = new TerminalBuffer(10, 3)
    for (let y = 0; y < 3; y++) {
      for (let x = 0; x < 10; x++) {
        prev.setCell(x, y, { char: "A", fg: null })
        fresh.setCell(x, y, { char: "A", fg: null })
        if (x === 3 && y === 1) {
          incr.setCell(x, y, {
            char: RESIDUE_SENTINEL_CHAR,
            fg: RESIDUE_SENTINEL_RGB,
            bg: RESIDUE_SENTINEL_RGB,
          })
        } else {
          incr.setCell(x, y, { char: "A", fg: null })
        }
      }
    }
    expect(() => verifyNoResidueLeak(prev, incr, fresh, 1)).not.toThrow()
  })

  test("real cyan-strip residue (prev != fresh, cascade skipped): SENTINEL LEAK", () => {
    // Real cyan-strip shape: prev row 1 had cyan bg; fresh paints
    // default bg; cascade incorrectly skipped → user sees stale cyan.
    // Sentinel-poison reveals it: incr[1,1] = sentinel (cascade skipped),
    // prev[1,1] = cyan, fresh[1,1] = default. prev ≠ fresh → BUG.
    const prev = new TerminalBuffer(10, 3)
    const incr = new TerminalBuffer(10, 3)
    const fresh = new TerminalBuffer(10, 3)
    const cyan = { r: 76, g: 86, b: 106 }
    for (let y = 0; y < 3; y++) {
      for (let x = 0; x < 10; x++) {
        if (y === 1) {
          // Stale cyan strip in prev.
          prev.setCell(x, y, { char: " ", fg: null, bg: cyan })
          // Cascade skipped: sentinel is the witness.
          incr.setCell(x, y, {
            char: RESIDUE_SENTINEL_CHAR,
            fg: RESIDUE_SENTINEL_RGB,
            bg: RESIDUE_SENTINEL_RGB,
          })
          // Fresh paints default bg.
          fresh.setCell(x, y, { char: " ", fg: null, bg: null })
        } else {
          prev.setCell(x, y, { char: "A", fg: null })
          incr.setCell(x, y, { char: "A", fg: null })
          fresh.setCell(x, y, { char: "A", fg: null })
        }
      }
    }
    expect(() => verifyNoResidueLeak(prev, incr, fresh, 5)).toThrowError(
      IncrementalRenderMismatchError,
    )
    try {
      verifyNoResidueLeak(prev, incr, fresh, 5)
    } catch (e) {
      const msg = (e as Error).message
      expect(msg).toContain("STRICT residue check")
      expect(msg).toContain("SENTINEL LEAK")
      // First mismatch is at column 0 (left-most), row 1.
      expect(msg).toContain("(0,1)")
      expect(msg).toContain("frame 5")
      expect(msg).toContain("SILVERY_STRICT=residue")
      expect(msg).toContain("cyan-strip")
    }
  })

  test("pipeline-state contamination: incremental painted, fresh painted, results disagree", () => {
    // Both passes painted (incremental has 'Q', not the sentinel), but
    // they disagree — this is cross-pass state contamination, not a
    // residue carry-over bug.
    const prev = new TerminalBuffer(10, 3)
    const incr = new TerminalBuffer(10, 3)
    const fresh = new TerminalBuffer(10, 3)
    for (let y = 0; y < 3; y++) {
      for (let x = 0; x < 10; x++) {
        prev.setCell(x, y, { char: "A", fg: null })
        if (x === 5 && y === 2) {
          incr.setCell(x, y, { char: "Q", fg: null })
          fresh.setCell(x, y, { char: "R", fg: null })
        } else {
          incr.setCell(x, y, { char: "A", fg: null })
          fresh.setCell(x, y, { char: "A", fg: null })
        }
      }
    }
    expect(() => verifyNoResidueLeak(prev, incr, fresh, 1)).toThrowError(
      IncrementalRenderMismatchError,
    )
    try {
      verifyNoResidueLeak(prev, incr, fresh, 1)
    } catch (e) {
      const msg = (e as Error).message
      expect(msg).toContain("pipeline-state contamination")
      expect(msg).toContain("(5,2)")
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────
// Integration: residue check runs end-to-end without false positives
// ─────────────────────────────────────────────────────────────────────────

describe("residue check integration: clean render passes under SILVERY_STRICT=2", () => {
  test("simple counter component with rerenders: no residue divergence", () => {
    // This test must NOT throw — a well-behaved component (no cyan-strip
    // bug) renders cleanly under tier-2 residue checking. It's also a
    // back-compat smoke test: if the residue wiring is leaky, this fires.
    const render = createRenderer({ cols: 40, rows: 8 })
    function App({ count }: { count: number }) {
      return (
        <Box flexDirection="column" padding={1}>
          <Text bold>Counter</Text>
          <Text>Count: {count}</Text>
        </Box>
      )
    }

    withStrictEnv("2", () => {
      const app = render(<App count={0} />)
      expect(app.text).toContain("Count: 0")
      app.rerender(<App count={1} />)
      expect(app.text).toContain("Count: 1")
      app.rerender(<App count={2} />)
      expect(app.text).toContain("Count: 2")
    })
  })

  test("explicit slug SILVERY_STRICT=residue: clean render passes", () => {
    const render = createRenderer({ cols: 40, rows: 8 })
    function App({ count }: { count: number }) {
      return (
        <Box flexDirection="column" padding={1}>
          <Text>Frame: {count}</Text>
        </Box>
      )
    }

    withStrictEnv("residue", () => {
      const app = render(<App count={0} />)
      app.rerender(<App count={1} />)
      app.rerender(<App count={2} />)
      expect(app.text).toContain("Frame: 2")
    })
  })
})
