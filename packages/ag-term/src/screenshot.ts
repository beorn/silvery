import { writeFile } from "node:fs/promises"

// ============================================================================
// Types
// ============================================================================

export interface Screenshotter {
  /**
   * Render HTML to PNG. First call starts Playwright (~3-5s), subsequent calls ~200ms.
   * The capture is the document body's own box: `bufferToHTML` declares the grid's, so
   * one frame is one cell box per column and row, never the browser's viewport.
   */
  capture(html: string, outputPath?: string): Promise<Buffer>
  /** Close browser */
  close(): Promise<void>
  [Symbol.asyncDispose](): Promise<void>
}

// ============================================================================
// Factory
// ============================================================================

export function createScreenshotter(): Screenshotter {
  let browser: import("playwright").Browser | null = null
  let page: import("playwright").Page | null = null

  async function ensureBrowser() {
    if (browser && page) return page

    const { chromium } = await import("playwright")
    browser = await chromium.launch()
    const context = await browser.newContext()
    page = await context.newPage()
    return page
  }

  async function capture(html: string, outputPath?: string): Promise<Buffer> {
    const p = await ensureBrowser()
    await p.setContent(html, { waitUntil: "load" })
    await p.waitForTimeout(50)
    // Capture the document's own box, not the browser's default viewport: with
    // `fullPage` a body narrower than the viewport (1280px here) is padded out to
    // the viewport, so buffer columns stop mapping to pixels — a 72-column frame
    // came out 1280 wide with the content in the left third. `bufferToHTML`
    // declares that box; any other HTML is sized by its own body.
    const body = p.locator("body")
    const measureBody = async () => {
      const rect = await body.boundingBox()
      if (!rect) throw new Error("screenshot: the document has no laid-out body to capture")
      return {
        x: Math.floor(rect.x),
        y: Math.floor(rect.y),
        width: Math.ceil(rect.width),
        height: Math.ceil(rect.height),
      }
    }
    const box = await measureBody()
    if (box.width <= 0 || box.height <= 0) {
      throw new Error(
        `screenshot: document body measured ${box.width}x${box.height}px, nothing to capture`,
      )
    }
    // A clip stays bounded by the viewport, so size the viewport to the box first.
    // A body that reflows larger at its own width falls back to fullPage, which
    // captures past the viewport instead of cropping.
    await p.setViewportSize({ width: box.width, height: box.height })
    const reflowed = await measureBody()
    const buffer = (await p.screenshot(
      reflowed.width > box.width || reflowed.height > box.height
        ? { fullPage: true }
        : {
            clip: {
              ...box,
              width: Math.min(box.width, reflowed.width),
              height: Math.min(box.height, reflowed.height),
            },
          },
    )) as Buffer
    if (outputPath) {
      await writeFile(outputPath, buffer)
    }
    return buffer
  }

  async function close() {
    if (browser) {
      await browser.close()
      browser = null
      page = null
    }
  }

  return {
    capture,
    close,
    [Symbol.asyncDispose]: close,
  }
}
