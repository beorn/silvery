/**
 * Diagnostic theme for pipeline regression tests.
 *
 * Built so that **every distinct flat token resolves to a distinct, visible
 * color** — exposing pipeline bugs that would be invisible under themes where
 * tokens collapse to the canvas background.
 *
 * ## Why this exists
 *
 * The default `ansi16DarkTheme` uses Nord-derived hexes. In Nord:
 * - canvas `bg` = `#2e3440` = rgb(46, 52, 64)
 * - legacy `mutedbg` = blend(bg, fg, 0.04) ≈ rgb(52, 58, 70)
 *
 * When tests render at ansi16, the underlying RGBs from `mutedbg` and `bg`
 * differ by only a few units — and crucially, they look "the same" to
 * naive bg-vs-canvas detectors that compare against a fixed canvas color.
 *
 * One concrete consequence: the cyan-strip cold-start bug
 * (`@km/silvery/render-light-blue-bg-strip-residue`) emitted bg=$mutedbg paint
 * at cells past a clip boundary, but every test passed because the bg color
 * was indistinguishable from canvas in the test theme. Real users running at
 * Nord saw a visible strip; tests saw nothing.
 *
 * The diagnostic theme uses pure black canvas + saturated primaries so blends
 * preserve their step magnitude in every channel. Every Sterling/legacy token
 * resolves to a distinct RGB tuple. A test that asserts "no non-canvas bg in
 * region X" catches phantom bg paints regardless of which token emitted them.
 *
 * ## Usage
 *
 * ```ts
 * import { diagnosticTheme } from "@silvery/test"
 * import { createRenderer } from "@silvery/test"
 *
 * const r = createRenderer({ cols: 80, rows: 24, theme: diagnosticTheme })
 * ```
 *
 * Or via `testBoard` in km-tui:
 *
 * ```ts
 * const result = await testBoard(VAULT, { columns: 82, rows: 75, theme: diagnosticTheme })
 * // assert no cells past col 40 have non-canvas bg
 * for (let r = 0; r < 75; r++) {
 *   for (let c = 40; c < 82; c++) {
 *     const cell = result._result.cell(c, r)
 *     expect(cell.bg).toBeNull()  // canvas = null bg
 *   }
 * }
 * ```
 *
 * ## Distinctness invariant
 *
 * Pure black canvas (rgb 0,0,0) + pure white fg (rgb 255,255,255) means every
 * blend(bg, fg, t) for distinct `t` produces distinct RGBs. Sterling/legacy
 * derive uses these `t` values:
 *
 *   - `bg-surface-subtle`  = blend(0.03) ≈ rgb(8, 8, 8)
 *   - `bg-surface-hover`   = blend(0.10) ≈ rgb(26, 26, 26)
 *   - `bg-surface-raised`  = blend(0.10) ≈ rgb(26, 26, 26)
 *   - `bg-surface-overlay` = blend(0.12) ≈ rgb(31, 31, 31)
 *   - `bg-muted` (Sterling)= blend(0.08) ≈ rgb(20, 20, 20)
 *   - `mutedbg` (legacy)   = blend(0.04) ≈ rgb(10, 10, 10)
 *
 * All distinct from canvas (rgb 0,0,0) and from each other. The named ANSI
 * slots are saturated primaries so accentBg, redBg, etc. paint in vivid
 * unmistakable colors.
 */

import { deriveTheme } from "../../ansi/src/theme/derive.ts"
import type { ColorScheme, Theme } from "../../ansi/src/theme/types.ts"

/**
 * Maximally-distinct ColorScheme for diagnostic rendering tests.
 *
 * Pure black canvas, pure white fg, saturated ANSI primaries. Every derived
 * token gets a unique visible RGB.
 */
export const diagnosticScheme: ColorScheme = {
  name: "diagnostic",
  dark: true,
  // Mid-luminance dark navy — sits clear of OKLCH gamut floor so even small
  // blends toward fg produce visibly distinct RGBs (pure-black canvas would
  // round small blends back to #000000 due to OKLCH lightness compression).
  background: "#101828",
  // Light cyan-pink mix — high chroma + high luminance so blends inherit
  // visible chromatic shift (not just luminance step) at every blend factor.
  foreground: "#f0f8ff",
  primary: "#ff00ff", // magenta — accent slots become vivid magenta
  // Saturated ANSI primaries so each named slot is unmistakable
  black: "#202830", // distinct from background — used for *bg slots in ansi16 path
  red: "#ff0000",
  green: "#00ff00",
  yellow: "#ffff00",
  blue: "#4060ff",
  magenta: "#ff00ff",
  cyan: "#00ffff",
  white: "#f0f8ff",
  // Bright variants — tinted away from base so distinguishable
  brightBlack: "#606870",
  brightRed: "#ff8080",
  brightGreen: "#80ff80",
  brightYellow: "#ffff80",
  brightBlue: "#8080ff",
  brightMagenta: "#ff80ff",
  brightCyan: "#80ffff",
  brightWhite: "#ffffff",
  // Cursor + selection in distinct vivid hues
  cursorColor: "#ffaa00", // orange
  cursorText: "#101828",
  selectionBackground: "#aa00ff", // purple
  selectionForeground: "#ffffff",
}

/**
 * Pre-derived diagnostic theme. Pass to `createRenderer({ theme })` or
 * `testBoard({ theme })` for pipeline regression coverage.
 */
export const diagnosticTheme: Theme = deriveTheme(diagnosticScheme)
