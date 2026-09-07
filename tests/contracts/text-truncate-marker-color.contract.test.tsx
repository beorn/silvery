/**
 * `TextProps.truncateMarkerColor` — defaults contract.
 *
 * Bead: 19788 follow-up (km @km/inbox/19788-km-f330).
 *
 * Contract verified here:
 *   - Omitting `truncateMarkerColor` styles the inserted elision marker with
 *     the documented `@default "$fg-muted"` — the marker cell's fg resolves to
 *     EXACTLY the same RGB as `$fg-muted` resolves to (via the renderer's own
 *     parseColor/resolveThemeColor path; never a hardcoded hex), AND it is a
 *     genuinely dim slot, i.e. it DIFFERS from `$fg`.
 *
 * Why the equality (not just ≠-text-color): the original default was `"$fg-muted"`,
 * which in the default pipeline theme resolves to the SAME value as `$fg`
 * (#d8dee9). A ≠-text-color assertion alone passed against a `#ffffff` text and
 * let the aliased token slip through — the marker never dimmed for any
 * `$fg`-colored text. Pinning the marker fg to the resolved `$fg-muted` value
 * (and asserting `$fg-muted ≠ $fg`) catches that exact alias regression.
 *
 * See tests/contracts/README.md for the convention.
 */
import React from "react"
import { describe, test, expect } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, Text } from "silvery"
import { parseColor } from "@silvery/ag-term/pipeline/render-helpers"

const CMD = "git commit --message 'a very long commit message here' --no-verify"

/** Resolve a color string against the active theme exactly as the renderer does. */
function resolveRgb(color: string): { r: number; g: number; b: number } {
  const c = parseColor(color)
  if (c === null || typeof c === "number") {
    throw new Error(`expected ${color} to resolve to an RGB object, got ${JSON.stringify(c)}`)
  }
  return c
}

describe("contract: truncateMarkerColor defaults to $fg-muted", () => {
  test("omitting truncateMarkerColor styles the ellipsis with the resolved $fg-muted", () => {
    const WIDTH = 30
    function App() {
      return (
        <Box width={WIDTH} height={1}>
          {/* truncateMarkerColor OMITTED — must resolve to "$fg-muted". */}
          <Text color="#ffffff" wrap="truncate-middle">
            {CMD}
          </Text>
        </Box>
      )
    }
    const render = createRenderer({ cols: WIDTH, rows: 1 })
    const app = render(<App />)

    const ellipsisCol = app.lines[0]!.indexOf("…")
    expect(ellipsisCol).toBeGreaterThan(0)

    const fgMuted = resolveRgb("$fg-muted")
    const fg = resolveRgb("$fg")
    // The token actually dims: $fg-muted is NOT the plain foreground. Guards
    // against re-aliasing the default to a token that equals $fg (the $fg-muted bug).
    expect(fgMuted).not.toEqual(fg)

    // The omitted-prop default path painted the marker with EXACTLY $fg-muted.
    expect(app.cell(ellipsisCol, 0).fg).toEqual(fgMuted)
    // Surrounding text keeps its own explicit color.
    expect(app.cell(0, 0).fg).toEqual({ r: 255, g: 255, b: 255 })
  })

  test("default $fg-muted marker differs from an explicit override", () => {
    const WIDTH = 30
    function App({ marker }: { marker?: string }) {
      return (
        <Box width={WIDTH} height={1}>
          <Text color="#ffffff" truncateMarkerColor={marker} wrap="truncate-middle">
            {CMD}
          </Text>
        </Box>
      )
    }
    const render = createRenderer({ cols: WIDTH, rows: 1 })

    const def = render(<App />)
    const defCol = def.lines[0]!.indexOf("…")
    expect(def.cell(defCol, 0).fg).toEqual(resolveRgb("$fg-muted"))

    const explicit = render(<App marker="#ff0000" />)
    const expCol = explicit.lines[0]!.indexOf("…")
    expect(explicit.cell(expCol, 0).fg).toEqual({ r: 255, g: 0, b: 0 })
  })
})
