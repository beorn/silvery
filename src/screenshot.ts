import { writeFile } from "node:fs/promises"

// ============================================================================
// Types
// ============================================================================

export interface Screenshotter {
  /** Render HTML to PNG. First call starts Playwright (~3-5s), subsequent calls ~200ms */
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
    const buffer = (await p.screenshot({ fullPage: true })) as Buffer
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
