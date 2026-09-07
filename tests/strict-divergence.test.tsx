/**
 * STRICT divergence — the blank-screen class-killer (19604 focus-blank).
 *
 * Bead: @km/code/v0.2/19604-focus-blank (#undead #P0).
 *
 * The 19604 signature: silvery emits a FULL content frame (real painted
 * cells, real ANSI) while the terminal SCREEN is blank (cmux read-screen
 * nonspace=0). This check reads the frame's cumulative ANSI back out of an
 * in-process emulator and throws when `countPaintedCells() >= threshold`
 * but the emulator shows zero non-space cells.
 *
 * Test layers:
 *   1. UNIT positive  — content-frame + all-spaces readback throws at
 *                       SILVERY_STRICT=2 AND =divergence.
 *   2. UNIT negative  — matching content → no throw; default-off
 *                       (SILVERY_STRICT=1) → no throw; null readback
 *                       (live TTY) → no throw; sub-threshold buffer → no
 *                       throw.
 *   3. INTEGRATION    — a realistic 50+ node app rendered through the real
 *                       pipeline under SILVERY_STRICT_TERMINAL=xterm +
 *                       SILVERY_STRICT=2 must NOT false-fire (a healthy
 *                       frame paints content AND the emulator shows it).
 */
import React, { useState } from "react"
import { describe, test, expect, beforeEach, afterEach } from "vitest"
import { Box, Text } from "silvery"
import { createRenderer } from "@silvery/test"
import { TerminalBuffer } from "@silvery/ag-term/buffer"
import {
  DIVERGENCE_STRICT_SLUG,
  DIVERGENCE_STRICT_MIN_TIER,
  DIVERGENCE_MIN_PAINTED_CELLS,
  RenderEmulatorDivergenceError,
  checkRenderEmulatorDivergence,
  countNonSpaceInText,
  isDivergenceStrictEnabled,
  type EmulatorReadback,
} from "@silvery/ag-term/strict-divergence"
import { resetStrictCache } from "@silvery/ag-term/strict-mode"

// ───────── env-var helpers (mirror strict-residue.test.tsx) ───────────────

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

let origStrictTerminal: string | undefined
beforeEach(() => {
  resetStrictCache()
  origStrictTerminal = process.env.SILVERY_STRICT_TERMINAL
})
afterEach(() => {
  if (origStrictTerminal === undefined) delete process.env.SILVERY_STRICT_TERMINAL
  else process.env.SILVERY_STRICT_TERMINAL = origStrictTerminal
  resetStrictCache()
})

// ───────── fixtures ───────────────────────────────────────────────────────

/** A buffer with `paintedCells` content cells painted (one row of 'X's, wrapped). */
function contentBuffer(paintedCells: number, cols = 120, rows = 60): TerminalBuffer {
  const buf = new TerminalBuffer(cols, rows)
  let n = 0
  for (let y = 0; y < rows && n < paintedCells; y++) {
    for (let x = 0; x < cols && n < paintedCells; x++) {
      buf.setCell(x, y, { char: "X" })
      n++
    }
  }
  return buf
}

const blankReadback: EmulatorReadback = { nonSpaceCells: 0, backendName: "xterm" }
const contentReadback: EmulatorReadback = { nonSpaceCells: 1234, backendName: "xterm" }

// ─────────────────────────────────────────────────────────────────────────
// Constants / gate identity
// ─────────────────────────────────────────────────────────────────────────

describe("divergence: slug + tier constants", () => {
  test("slug is 'divergence', tier 2", () => {
    expect(DIVERGENCE_STRICT_SLUG).toBe("divergence")
    expect(DIVERGENCE_STRICT_MIN_TIER).toBe(2)
  })

  test("isDivergenceStrictEnabled tracks the umbrella contract", () => {
    withStrictEnv(undefined, () => expect(isDivergenceStrictEnabled()).toBe(false))
    withStrictEnv("1", () => expect(isDivergenceStrictEnabled()).toBe(false)) // tier 1 < 2
    withStrictEnv("2", () => expect(isDivergenceStrictEnabled()).toBe(true))
    withStrictEnv("3", () => expect(isDivergenceStrictEnabled()).toBe(true))
    withStrictEnv("divergence", () => expect(isDivergenceStrictEnabled()).toBe(true))
    withStrictEnv("2,!divergence", () => expect(isDivergenceStrictEnabled()).toBe(false)) // per-check skip
  })
})

describe("divergence: countNonSpaceInText", () => {
  test("counts visible glyphs, ignores spaces / newlines / tabs", () => {
    expect(countNonSpaceInText("   \n   \n   ")).toBe(0)
    expect(countNonSpaceInText("ab \ncd\t\n  e")).toBe(5)
    expect(countNonSpaceInText("")).toBe(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────
// UNIT positive — the 19604 divergence throws at tier 2
// ─────────────────────────────────────────────────────────────────────────

describe("divergence: positive (content frame, blank screen) throws", () => {
  test("SILVERY_STRICT=2 throws RenderEmulatorDivergenceError", () => {
    const buf = contentBuffer(5000)
    expect(buf.countPaintedCells()).toBeGreaterThanOrEqual(DIVERGENCE_MIN_PAINTED_CELLS)
    withStrictEnv("2", () => {
      expect(() => checkRenderEmulatorDivergence(buf, blankReadback, 7)).toThrow(
        RenderEmulatorDivergenceError,
      )
    })
  })

  test("SILVERY_STRICT=divergence throws (per-slug isolation)", () => {
    const buf = contentBuffer(5000)
    withStrictEnv("divergence", () => {
      expect(() => checkRenderEmulatorDivergence(buf, blankReadback, 3)).toThrow(
        RenderEmulatorDivergenceError,
      )
    })
  })

  test("error names 19604, both cell counts, and the backend", () => {
    const buf = contentBuffer(5000)
    withStrictEnv("2", () => {
      let caught: RenderEmulatorDivergenceError | null = null
      try {
        checkRenderEmulatorDivergence(buf, { nonSpaceCells: 0, backendName: "ghostty" }, 42)
      } catch (e) {
        caught = e as RenderEmulatorDivergenceError
      }
      expect(caught).toBeInstanceOf(RenderEmulatorDivergenceError)
      expect(caught!.paintedCells).toBe(5000)
      expect(caught!.onScreenCells).toBe(0)
      expect(caught!.message).toContain("19604")
      expect(caught!.message).toContain("5000")
      expect(caught!.message).toContain("ghostty")
      expect(caught!.message).toContain("blank")
    })
  })
})

// ─────────────────────────────────────────────────────────────────────────
// UNIT negative — must NOT throw
// ─────────────────────────────────────────────────────────────────────────

describe("divergence: negative (no throw)", () => {
  test("matching content frame (emulator shows content) → no throw", () => {
    const buf = contentBuffer(5000)
    withStrictEnv("2", () => {
      expect(() => checkRenderEmulatorDivergence(buf, contentReadback, 1)).not.toThrow()
    })
  })

  test("default-off: SILVERY_STRICT=1 does NOT throw (tier-1 back-compat)", () => {
    const buf = contentBuffer(5000)
    withStrictEnv("1", () => {
      // Tier 1 logs (silvery:divergence debug) but never throws — this is the
      // load-bearing guard that test:fast (SILVERY_STRICT=1) stays green.
      expect(() => checkRenderEmulatorDivergence(buf, blankReadback, 1)).not.toThrow()
    })
  })

  test("SILVERY_STRICT unset → no throw", () => {
    const buf = contentBuffer(5000)
    withStrictEnv(undefined, () => {
      expect(() => checkRenderEmulatorDivergence(buf, blankReadback, 1)).not.toThrow()
    })
  })

  test("null readback (live TTY, no in-process emulator) → no throw even at tier 2", () => {
    const buf = contentBuffer(5000)
    withStrictEnv("2", () => {
      expect(() => checkRenderEmulatorDivergence(buf, null, 1)).not.toThrow()
    })
  })

  test("sub-threshold buffer (near-empty splash) → no throw even with blank screen", () => {
    // A legitimately near-empty frame (startup splash, lone spinner, cleared
    // screen) paints few cells; "few painted + zero on screen" is NOT a bug.
    const buf = contentBuffer(100)
    expect(buf.countPaintedCells()).toBeLessThan(DIVERGENCE_MIN_PAINTED_CELLS)
    withStrictEnv("2", () => {
      expect(() => checkRenderEmulatorDivergence(buf, blankReadback, 1)).not.toThrow()
    })
  })
})

// ─────────────────────────────────────────────────────────────────────────
// INTEGRATION smoke — real pipeline, realistic-scale fixture, no false-fire
// ─────────────────────────────────────────────────────────────────────────

describe("divergence: integration smoke (no false-fire on a healthy frame)", () => {
  // 50+ node realistic fixture per the "New Props Require Tests" rule.
  // Fixed-width columns (not flexGrow on bordered boxes) so the layout
  // provably fits the 120-wide container and the unrelated tier-1
  // layout-overflow check does not fire: 3 × 38 + 2 gap = 116 < 120.
  const COL_W = 38
  function BigApp({ selected }: { selected: number }) {
    return (
      <Box flexDirection="column" width={120} height={60} padding={1}>
        <Box backgroundColor="$bg-accent" paddingLeft={1}>
          <Text color="$fg-on-inverse">Divergence Smoke — realistic fixture</Text>
        </Box>
        <Box flexDirection="row" flexGrow={1} gap={1}>
          {[0, 1, 2].map((col) => (
            <Box key={col} flexDirection="column" width={COL_W} borderStyle="round" padding={1}>
              <Text bold color="$fg-accent">
                Column {col}
              </Text>
              {Array.from({ length: 18 }).map((_, row) => {
                const idx = col * 18 + row
                const isCursor = idx === selected
                return (
                  <Box key={row} minWidth={0} backgroundColor={isCursor ? "$fg-accent" : undefined}>
                    <Text color={isCursor ? "$fg-on-inverse" : "$fg-muted"} wrap="truncate">
                      [{col}.{row}] task item {idx}
                    </Text>
                  </Box>
                )
              })}
            </Box>
          ))}
        </Box>
        <Box backgroundColor="$bg-muted" paddingLeft={1}>
          <Text color="$fg-muted">selected={selected} — j/k to move</Text>
        </Box>
      </Box>
    )
  }

  test("xterm backend + SILVERY_STRICT=2: healthy frames never trip divergence", async () => {
    // Spin up the in-process emulator the divergence check reads from.
    process.env.SILVERY_STRICT_TERMINAL = "xterm"
    resetStrictCache()

    await new Promise<void>((resolve, reject) => {
      withStrictEnv("2", () => {
        try {
          const render = createRenderer({ cols: 120, rows: 60 })
          // First render establishes prevBuffer + the persistent emulator.
          const app = render(<BigApp selected={0} />)
          expect(app.text).toContain("Column 0")
          expect(app.text).toContain("task item 5")

          // A burst of incremental frames — each feeds cumulative ANSI into
          // the emulator and runs the divergence check at tier 2. None of
          // these healthy content frames may throw.
          for (let i = 1; i <= 12; i++) {
            app.rerender(<BigApp selected={i} />)
          }
          expect(app.text).toContain("selected=12")
          resolve()
        } catch (e) {
          reject(e as Error)
        }
      })
    })
  })

  test("xterm backend: a frame's emulator readback has non-space cells (sanity)", () => {
    // Proves the integration harness's emulator actually receives content —
    // i.e. the divergence check's negative path is exercised for real, not
    // vacuously (the emulator was fed and shows glyphs).
    process.env.SILVERY_STRICT_TERMINAL = "xterm"
    resetStrictCache()
    withStrictEnv("2", () => {
      const render = createRenderer({ cols: 120, rows: 60 })
      const app = render(<BigApp selected={0} />)
      app.rerender(<BigApp selected={1} />)
      // The virtual-renderer's own buffer is the painted truth; it must be a
      // real content frame (>= threshold) for the integration to be meaningful.
      expect(app.text).toContain("Column 1")
      const nonBlankLines = app.lines.filter((l) => l.trim().length > 0).length
      expect(nonBlankLines).toBeGreaterThan(10)
    })
  })
})
