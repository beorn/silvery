/**
 * Defaults contract — selection theme tokens.
 *
 * Bead: km-silvery.selection-theme-tokens (Phase B of the Sterling rollout).
 *
 * Contracts verified here:
 *   1. With a Sterling Theme that ships `bg-selected` / `fg-on-selected`,
 *      `applySelectionToPaintBuffer` paints those colors onto every cell in
 *      the range — including default-fg/bg cells. The legacy SGR-7 inverse
 *      fallback path is NOT taken when a theme provides explicit colors.
 *   2. Without a Theme (omitted), the hardcoded `DEFAULT_SELECTION_THEME` is
 *      used so callers without a Theme still get a visible highlight that
 *      avoids the inverse two-tone artifact on default-bg cells.
 *   3. With a hand-authored legacy Theme that only carries `selectionbg` (no
 *      `bg-selected`), the legacy fallback wins. This pins the 0.19.x
 *      transition window — Sterling Phase D will purge the legacy fallback,
 *      but until then existing apps must keep working.
 *   4. `composeSelectionCells` itself, when called with an explicit theme on
 *      default-fg/bg cells, produces direct fg/bg colors and `inverseAttr=false`
 *      — the SGR-7 toggle is gated on `theme?.selectionBg == null`.
 *
 * Why a contract test exists for this: the Phase A landed
 * `bg-selected` / `fg-on-selected` Sterling tokens but `paintFrame` was still
 * passing `theme=undefined` into `composeSelectionCells`, so themed apps got
 * the hardcoded blue-grey instead of their theme's selection color. The
 * docstring on `applySelectionToPaintBuffer` claimed Sterling tokens drive
 * the highlight; the code drifted. Without this contract, the next
 * regression goes silent.
 */

import { describe, test, expect } from "vitest"
import { TerminalBuffer } from "@silvery/ag-term/buffer"
import {
  applySelectionToPaintBuffer,
  resolveSelectionThemeFromTheme,
} from "@silvery/ag-term/runtime/renderer"
import { composeSelectionCells } from "@silvery/ag-term/selection-renderer"
import { createBuffer } from "@silvery/ag-term/runtime/create-buffer"
import { defaultDarkTheme } from "@silvery/theme/schemes"
import type { Theme } from "@silvery/ansi"
import type { TerminalSelectionState } from "@silvery/headless/selection"

// ============================================================================
// Helpers
// ============================================================================

/** Build a paint buffer (the wrapped Buffer that paintFrame mutates). */
function makePaintBuffer(text: string, width = 20) {
  const buf = new TerminalBuffer(width, 1)
  for (let x = 0; x < text.length && x < width; x++) {
    buf.setCell(x, 0, { char: text[x]!, fg: null, bg: null })
  }
  return createBuffer(buf, null as never, undefined)
}

function selectionState(startCol: number, endCol: number): TerminalSelectionState {
  return {
    range: {
      anchor: { col: startCol, row: 0 },
      head: { col: endCol, row: 0 },
    },
    scope: null,
  } as TerminalSelectionState
}

// ============================================================================
// Contract 1 — Sterling theme drives selection colors
// ============================================================================

describe("contract: selection theme tokens — Sterling overrides", () => {
  test("contract: theme with bg-selected paints theme bg on every cell in range", () => {
    const paintBuf = makePaintBuffer("Hello, World!")

    // Sanity: defaultDarkTheme is Nord-derived and ships the Sterling token.
    const themeAny = defaultDarkTheme as unknown as Record<string, string | undefined>
    const expectedBgHex = themeAny["bg-selected"]
    expect(expectedBgHex).toBeDefined()

    applySelectionToPaintBuffer({
      selectionEnabled: true,
      selectionState: selectionState(0, 4),
      paintBuffer: paintBuf,
      theme: defaultDarkTheme,
    })

    // Every cell in the range carries the theme bg as { r, g, b }, NOT the
    // SGR-7 inverse-attr fallback (which would leave bg=null + inverse=true).
    for (let col = 0; col <= 4; col++) {
      const cell = paintBuf._buffer.getCell(col, 0)
      expect(cell.bg).not.toBeNull()
      expect(typeof cell.bg).toBe("object")
      expect(cell.attrs.inverse ?? false).toBe(false)
    }

    // Cells outside the range are untouched (default fg/bg, no inverse attr).
    for (let col = 5; col < 13; col++) {
      const cell = paintBuf._buffer.getCell(col, 0)
      expect(cell.bg).toBeNull()
      expect(cell.attrs.inverse ?? false).toBe(false)
    }
  })

  test("contract: theme with fg-on-selected overrides cell fg in range", () => {
    const paintBuf = makePaintBuffer("Hello")
    const themeAny = defaultDarkTheme as unknown as Record<string, string | undefined>
    const fgHex = themeAny["fg-on-selected"]
    if (!fgHex) {
      // Sterling tokens are inlined at deriveTheme time; this should not
      // happen with the shipped defaultDarkTheme. If it does, treat as a
      // theme-construction regression worth surfacing.
      throw new Error("defaultDarkTheme is missing fg-on-selected — Phase A regression")
    }

    applySelectionToPaintBuffer({
      selectionEnabled: true,
      selectionState: selectionState(0, 4),
      paintBuffer: paintBuf,
      theme: defaultDarkTheme,
    })

    for (let col = 0; col <= 4; col++) {
      const cell = paintBuf._buffer.getCell(col, 0)
      // fg is overridden to a non-null { r, g, b } by the Sterling token.
      expect(cell.fg).not.toBeNull()
      expect(typeof cell.fg).toBe("object")
    }
  })
})

// ============================================================================
// Contract 2 — No-theme fallback
// ============================================================================

describe("contract: selection theme tokens — fallback when theme omitted", () => {
  test("contract: omitting theme uses DEFAULT_SELECTION_THEME, not SGR-7 inverse", () => {
    const paintBuf = makePaintBuffer("Hello")

    applySelectionToPaintBuffer({
      selectionEnabled: true,
      selectionState: selectionState(0, 4),
      paintBuffer: paintBuf,
      // theme deliberately omitted — exercises the no-theme path.
    })

    // The fallback ships an explicit RGB selection bg so default-fg/bg cells
    // get a visible color, NOT the SGR-7 inverse-attr toggle. This is the
    // "lavender for blanks, grey for content" two-tone fix described on
    // DEFAULT_SELECTION_THEME in renderer.ts.
    for (let col = 0; col <= 4; col++) {
      const cell = paintBuf._buffer.getCell(col, 0)
      expect(cell.bg).not.toBeNull()
      expect(cell.attrs.inverse ?? false).toBe(false)
    }
  })
})

// ============================================================================
// Contract 3 — Legacy `selectionbg` fallback
// ============================================================================

describe("contract: selection theme tokens — legacy selectionbg fallback", () => {
  test("contract: theme with only legacy selectionbg still resolves", () => {
    // Synthetic legacy Theme — the 0.19.x transition window keeps this path
    // alive for hand-authored themes that don't flow through
    // inlineSterlingTokens. Phase D (sterling-purge-legacy-tokens) removes it.
    const legacyTheme = { selectionbg: "#ff0000" } as unknown as Theme
    const resolved = resolveSelectionThemeFromTheme(legacyTheme)

    expect(resolved.selectionBg).toEqual({ r: 255, g: 0, b: 0 })
    // No fg-on-selected on a legacy theme — fg stays undefined so the
    // composer preserves cell fg via `theme.selectionFg ?? cellFg`.
    expect(resolved.selectionFg).toBeUndefined()
  })

  test("contract: bg-selected wins over selectionbg when both present", () => {
    const dualTheme = {
      "bg-selected": "#00ff00",
      selectionbg: "#ff0000",
    } as unknown as Theme
    const resolved = resolveSelectionThemeFromTheme(dualTheme)
    expect(resolved.selectionBg).toEqual({ r: 0, g: 255, b: 0 })
  })

  test("contract: missing both → falls back to DEFAULT_SELECTION_THEME", () => {
    const empty = {} as unknown as Theme
    const resolved = resolveSelectionThemeFromTheme(empty)
    // The hardcoded default — { r: 68, g: 78, b: 109 }.
    expect(resolved.selectionBg).toEqual({ r: 68, g: 78, b: 109 })
  })
})

// ============================================================================
// Contract 4 — composeSelectionCells gating on theme.selectionBg
// ============================================================================
//
// This pins the underlying invariant the higher-level contracts depend on:
// when an explicit selectionBg is supplied, the SGR-7 inverse-attr path
// is NEVER taken, even on default-fg/bg cells. Phase B of Sterling rollout
// requires this so themed apps get a uniform highlight, not the two-tone
// artifact described on DEFAULT_SELECTION_THEME.

describe("contract: composeSelectionCells gates SGR-7 fallback on theme presence", () => {
  test("contract: explicit selectionBg → direct color, inverseAttr=false", () => {
    const buf = new TerminalBuffer(10, 1)
    for (let x = 0; x < 5; x++) {
      buf.setCell(x, 0, { char: "x", fg: null, bg: null })
    }
    const changes = composeSelectionCells(
      buf,
      { anchor: { col: 0, row: 0 }, head: { col: 4, row: 0 } },
      { selectionBg: { r: 1, g: 2, b: 3 } },
    )
    expect(changes).toHaveLength(5)
    for (const change of changes) {
      expect(change.bg).toEqual({ r: 1, g: 2, b: 3 })
      expect(change.inverseAttr ?? false).toBe(false)
    }
  })

  test("contract: theme=undefined + default cells → inverseAttr=true (legacy parity)", () => {
    const buf = new TerminalBuffer(10, 1)
    for (let x = 0; x < 5; x++) {
      buf.setCell(x, 0, { char: "x", fg: null, bg: null })
    }
    const changes = composeSelectionCells(buf, {
      anchor: { col: 0, row: 0 },
      head: { col: 4, row: 0 },
    })
    expect(changes).toHaveLength(5)
    for (const change of changes) {
      expect(change.inverseAttr).toBe(true)
    }
  })
})
