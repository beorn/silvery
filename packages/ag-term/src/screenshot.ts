import { writeFile } from "node:fs/promises"

/**
 * Render ANSI to a PNG through Ghostty's native canvas renderer.
 *
 * The import remains lazy so regular terminal rendering does not initialize
 * Ghostty's WASM or Skia canvas support. Each capture is independent: no
 * browser, page, or lifecycle state needs to survive between calls.
 *
 * @internal
 */
export async function captureScreenshot(
  ansi: string,
  dimensions: { cols: number; rows: number },
  outputPath?: string,
): Promise<Buffer> {
  const { renderAnsiPng } = await import("@termless/ghostty")
  const png = await renderAnsiPng(ansi, {
    ...dimensions,
    cursorBlink: false,
    hideCursor: true,
  })
  const buffer = Buffer.from(png)
  if (outputPath) {
    await writeFile(outputPath, buffer)
  }
  return buffer
}
