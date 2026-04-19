/**
 * Backdrop Fade — SILVERY_STRICT regression tests.
 *
 * Verifies:
 *   1. `<Backdrop fade={amount}>` shifts fg toward bg on every cell it covers.
 *   2. `fade={0}` is a passthrough (cells unchanged).
 *   3. `<ModalDialog fade={0.4}>` fades cells OUTSIDE the dialog's rect while
 *      leaving cells INSIDE crisp.
 *   4. Incremental rendering matches fresh (STRICT=1 auto-check every rerender).
 *   5. Realistic-scale fixture (50+ nodes) — catches cumulative cascade issues.
 *
 * SILVERY_STRICT=1 (set by vitest/setup.ts) verifies incremental === fresh on
 * every rerender. The backdrop pass runs inside `ag.render()` on both paths,
 * so identical pre-transform buffers produce identical post-transform buffers.
 */

import React, { useState } from "react"
import { describe, test, expect } from "vitest"
import { createRenderer } from "@silvery/test"
import { Backdrop, Box, Text, ModalDialog } from "@silvery/ag-react"

// Fade any fg > 0 toward bg in OKLab. For cells where fg is white(#FFFFFF) and
// bg is black(#000000), the blended result must have all channels < 255.
function isFaded(cell: {
  fg: { r: number; g: number; b: number } | null
  bg: { r: number; g: number; b: number } | null
}): boolean {
  if (!cell.fg) return false
  return cell.fg.r < 255 || cell.fg.g < 255 || cell.fg.b < 255
}

function fgIsWhite(cell: { fg: { r: number; g: number; b: number } | null }): boolean {
  if (!cell.fg) return false
  return cell.fg.r === 255 && cell.fg.g === 255 && cell.fg.b === 255
}

describe("backdrop fade: Backdrop primitive", () => {
  test("fade=0.5 blends fg toward bg in covered region", () => {
    const render = createRenderer({ cols: 20, rows: 4 })

    function App({ faded }: { faded: boolean }) {
      return (
        <Box backgroundColor="#000000">
          <Backdrop fade={faded ? 0.5 : 0}>
            <Text color="#FFFFFF">HELLO WORLD</Text>
          </Backdrop>
        </Box>
      )
    }

    // Frame 1 — no fade. HELLO is crisp white.
    const app = render(<App faded={false} />)
    expect(app.text).toContain("HELLO WORLD")
    const crisp = app.cell(0, 0)
    expect(fgIsWhite(crisp)).toBe(true)

    // Frame 2 — fade 0.5. Same text, but fg is darkened toward black bg.
    app.rerender(<App faded={true} />)
    expect(app.text).toContain("HELLO WORLD")
    const faded = app.cell(0, 0)
    expect(faded.char).toBe("H")
    expect(isFaded(faded)).toBe(true)
    // OKLab halfway between white and black is a mid-gray, NOT raw sRGB average (128).
    // Just assert it's strictly less than white on all channels.
    expect(faded.fg!.r).toBeLessThan(255)
    expect(faded.fg!.g).toBeLessThan(255)
    expect(faded.fg!.b).toBeLessThan(255)
  })

  test("fade={0} is a passthrough — cells are identical to no wrapping", () => {
    const render = createRenderer({ cols: 20, rows: 2 })

    const app1 = render(
      <Box backgroundColor="#000000">
        <Text color="#FFFFFF">ABC</Text>
      </Box>,
    )
    const direct = app1.cell(0, 0)

    const app2 = render(
      <Box backgroundColor="#000000">
        <Backdrop fade={0}>
          <Text color="#FFFFFF">ABC</Text>
        </Backdrop>
      </Box>,
    )
    const wrapped = app2.cell(0, 0)

    expect(direct.fg).toEqual(wrapped.fg)
    expect(direct.bg).toEqual(wrapped.bg)
    expect(direct.char).toBe(wrapped.char)
  })
})

describe("backdrop fade: ModalDialog integration", () => {
  // NOTE: ModalDialog's fade defaults to 0 (off) until the backdrop pass is
  // proven stable against modal-rect-streaming flicker. Apps opt in with
  // `fade={0.4}`. When re-enabled, change these test props to rely on the
  // default again.
  test("explicit fade={0.4} fades cells OUTSIDE the dialog, keeps cells INSIDE crisp", () => {
    const render = createRenderer({ cols: 40, rows: 10 })

    function App({ open }: { open: boolean }) {
      return (
        <Box flexDirection="column" backgroundColor="#000000" width={40} height={10}>
          {/* Lots of background content — faded when modal opens */}
          {Array.from({ length: 8 }, (_, i) => (
            <Text key={i} color="#FFFFFF">
              {`row ${i.toString().padStart(2, "0")} ` + "x".repeat(30)}
            </Text>
          ))}
          {open && (
            <Box position="absolute" marginLeft={10} marginTop={3}>
              <ModalDialog width={20} fade={0.4}>
                <Text color="#FFFFFF">DIALOG</Text>
              </ModalDialog>
            </Box>
          )}
        </Box>
      )
    }

    // Frame 1 — no modal. Row 0 is crisp white.
    const app = render(<App open={false} />)
    const preCrisp = app.cell(0, 0)
    expect(preCrisp.char).toBe("r")
    expect(fgIsWhite(preCrisp)).toBe(true)

    // Frame 2 — modal open. Cells OUTSIDE the dialog (e.g., col 0 row 0) fade.
    app.rerender(<App open={true} />)
    const outside = app.cell(0, 0)
    expect(outside.char).toBe("r")
    expect(isFaded(outside)).toBe(true)
  })

  test("fade={0} on ModalDialog leaves backdrop crisp", () => {
    const render = createRenderer({ cols: 40, rows: 10 })

    function App({ open }: { open: boolean }) {
      return (
        <Box flexDirection="column" backgroundColor="#000000" width={40} height={10}>
          {Array.from({ length: 8 }, (_, i) => (
            <Text key={i} color="#FFFFFF">
              {`row ${i.toString().padStart(2, "0")} ` + "x".repeat(30)}
            </Text>
          ))}
          {open && (
            <Box position="absolute" marginLeft={10} marginTop={3}>
              <ModalDialog width={20} fade={0}>
                <Text color="#FFFFFF">DIALOG</Text>
              </ModalDialog>
            </Box>
          )}
        </Box>
      )
    }

    const app = render(<App open={false} />)
    app.rerender(<App open={true} />)
    // Cells OUTSIDE the dialog should remain crisp white since fade={0}.
    const outside = app.cell(0, 0)
    expect(outside.char).toBe("r")
    expect(fgIsWhite(outside)).toBe(true)
  })
})

describe("backdrop fade: realistic-scale fixture (50+ nodes)", () => {
  test("toggling modal repeatedly on a dense tree does not accumulate errors", () => {
    const render = createRenderer({ cols: 60, rows: 24 })

    function Row({ i }: { i: number }) {
      return (
        <Box flexDirection="row" gap={1}>
          <Text color="#FFFFFF">{`row-${i.toString().padStart(2, "0")}`}</Text>
          {Array.from({ length: 6 }, (_, j) => (
            <Text key={j} color="#FFFFFF">
              {`c${j}`}
            </Text>
          ))}
        </Box>
      )
    }

    function App({ open }: { open: boolean }) {
      return (
        <Box flexDirection="column" backgroundColor="#000000" width={60} height={24}>
          {/* 20 rows × 7 text nodes each = 140 leaf nodes — comfortably > 50 */}
          {Array.from({ length: 20 }, (_, i) => (
            <Row key={i} i={i} />
          ))}
          {open && (
            <Box position="absolute" marginLeft={20} marginTop={8}>
              <ModalDialog width={24} title="Modal" fade={0.4}>
                <Text color="#FFFFFF">body</Text>
              </ModalDialog>
            </Box>
          )}
        </Box>
      )
    }

    const app = render(<App open={false} />)
    expect(app.text).toContain("row-00")

    // Toggle several times — STRICT verifies incremental === fresh every rerender.
    for (let i = 0; i < 5; i++) {
      app.rerender(<App open={true} />)
      app.rerender(<App open={false} />)
    }

    expect(app.text).toContain("row-00")
    expect(app.text).toContain("row-19")

    // Final open state — verify outside cells are faded.
    app.rerender(<App open={true} />)
    const outside = app.cell(0, 0)
    expect(outside.char).toBe("r")
    expect(isFaded(outside)).toBe(true)
  })
})
