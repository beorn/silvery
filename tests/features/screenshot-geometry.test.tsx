/**
 * @failure A captured frame is sized to the browser's default viewport instead of the terminal grid.
 * @level l2
 * @consumer app.screenshot() → bufferToHTML() → capture()
 * @testonly none
 *
 * Measured 2026-11-08 on the frames attached to the top-bar-blank-row and
 * modal-scrim visual beads: a 72x16 buffer came out 1280x720 wide with the frame
 * in the left third, and a 160x44 buffer put the right-edge scrollbar mid-image,
 * because `capture()` used `fullPage` in a default 1280x720 viewport.
 */
import { describe, expect, test } from "vitest"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { chromium } from "playwright"
import { TerminalBuffer, bufferToHTML } from "@silvery/ag-term/buffer"
import { createScreenshotter } from "@silvery/ag-term/screenshot"

/** Default bufferToHTML typography: 14px font, 1.2 line box per cell. */
const FONT_SIZE = 14
const CELL_HEIGHT = Math.round(FONT_SIZE * 1.2)

/**
 * Chromium is not part of the bare test environment: the CODE flake devshell
 * declares it (`PLAYWRIGHT_BROWSERS_PATH` + `FONTCONFIG_FILE`, flake.nix
 * devShells.default, #30794). Without that shell the check would fail on a
 * missing browser rather than on geometry, so it says which env it needs.
 */
const declaredBrowserEnv = Boolean(
  process.env.PLAYWRIGHT_BROWSERS_PATH && process.env.FONTCONFIG_FILE,
)
if (!declaredBrowserEnv) {
  console.warn(
    "screenshot geometry: skipped — needs the declared Chromium from the CODE flake devshell (PLAYWRIGHT_BROWSERS_PATH, FONTCONFIG_FILE)",
  )
}

/** PNG width/height live at bytes 16..24 of the IHDR chunk. */
function pngSize(png: Buffer): { width: number; height: number } {
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) }
}

describe("screenshot geometry", () => {
  test.skipIf(!declaredBrowserEnv)(
    "each row occupies its own cell row and the last column inks at the right edge",
    async () => {
      // A box of the right size can still hold text at the wrong pitch: `white-space:
      // pre` on the body turned the separator between row divs into an empty line, so
      // every row sat two cell rows lower and the lower half of the grid clipped away.
      // This measures the laid-out rows and a known column, not the outer box.
      const cols = 40
      const rows = 8
      const buffer = new TerminalBuffer(cols, rows)
      buffer.fill(0, 0, cols, rows, { char: " " })
      for (let x = 0; x < cols; x++) buffer.setCell(x, 2, { char: x === cols - 1 ? "Z" : "." })

      const browser = await chromium.launch()
      try {
        const page = await browser.newPage()
        await page.setContent(bufferToHTML(buffer), { waitUntil: "load" })
        const measured = await page.evaluate(
          ({ cols, rows, cellHeight }) => {
            const body = document.body
            const advance = body.getBoundingClientRect().width / cols
            const divs = [...body.children] as HTMLElement[]
            const tops = divs.map((div) => div.getBoundingClientRect().top)
            const target = divs[2]
            const text = target.firstChild as Text
            const range = document.createRange()
            range.setStart(text, cols - 1)
            range.setEnd(text, cols)
            const lastColumn = range.getBoundingClientRect()
            return {
              advance,
              tops,
              rowCount: divs.length,
              rowsExpected: rows,
              cellHeight,
              lastColumnX: lastColumn.x,
              bodyWidth: body.getBoundingClientRect().width,
            }
          },
          { cols, rows, cellHeight: CELL_HEIGHT },
        )

        expect(measured.rowCount, "every buffer row must be its own element").toBe(rows)
        measured.tops.forEach((top, row) => {
          expect(top, `row ${row} must start at its own cell row`).toBeCloseTo(row * CELL_HEIGHT, 0)
        })
        expect(measured.bodyWidth, "the grid must be exactly cols x advance wide").toBeCloseTo(
          cols * measured.advance,
          1,
        )
        expect(
          measured.lastColumnX,
          `the last column must ink at ${((cols - 1) * measured.advance).toFixed(1)}px, one cell left of the ${measured.bodyWidth}px edge`,
        ).toBeCloseTo((cols - 1) * measured.advance, 0)
      } finally {
        await browser.close()
      }
    },
    120_000,
  )

  test.skipIf(!declaredBrowserEnv)(
    "the capture is the size of the grid, not of the browser viewport",
    async () => {
      // Chromium's fontconfig writes its cache to $XDG_CACHE_HOME (else $HOME/.cache):
      // point it at this run's temp root instead of the guarded home.
      const cacheHome = mkdtempSync(join(tmpdir(), "silvery-screenshot-cache-"))
      const previousCacheHome = process.env.XDG_CACHE_HOME
      process.env.XDG_CACHE_HOME = cacheHome
      const shotter = createScreenshotter()
      const sizes = new Map<string, { width: number; height: number }>()
      try {
        for (const [cols, rows] of [
          [72, 16],
          [160, 44],
        ] as const) {
          const buffer = new TerminalBuffer(cols, rows)
          buffer.fill(0, 0, cols, rows, { char: "x" })
          const png = await shotter.capture(bufferToHTML(buffer))
          const size = pngSize(png)
          sizes.set(`${cols}x${rows}`, size)

          expect(size.height, `${cols}x${rows} rows must be whole ${CELL_HEIGHT}px cell rows`).toBe(
            rows * CELL_HEIGHT,
          )
          // The advance is measured, never assumed: the declared `ch` width is
          // whatever monospace font actually resolves. A viewport-sized capture
          // instead pins width at 1280px, i.e. 17.8px per cell at 72 columns.
          const advance = size.width / cols
          expect(
            advance,
            `${cols}x${rows} captured ${size.width}px wide, ${advance.toFixed(2)}px per cell`,
          ).toBeGreaterThan(FONT_SIZE * 0.5)
          expect(advance).toBeLessThan(FONT_SIZE * 0.75)
        }
      } finally {
        await shotter.close()
        if (previousCacheHome === undefined) delete process.env.XDG_CACHE_HOME
        else process.env.XDG_CACHE_HOME = previousCacheHome
        rmSync(cacheHome, { recursive: true, force: true })
      }

      const narrow = sizes.get("72x16")!
      const wide = sizes.get("160x44")!
      // The default viewport is 1280px: a narrower grid must no longer be padded to it...
      expect(
        narrow.width,
        "a 72-column frame must not be captured at the browser default width",
      ).toBeLessThan(1280)
      // ...and width must scale with columns, rather than both frames sharing the viewport width.
      expect(wide.width / narrow.width).toBeCloseTo(160 / 72, 1)
      expect(
        Math.abs(wide.width / 160 - narrow.width / 72),
        "one cell must be one width in every grid",
      ).toBeLessThan(0.05)
    },
    120_000,
  )
})
