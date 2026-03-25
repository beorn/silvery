#!/usr/bin/env bun
/**
 * Generate PNG screenshots of all showcase demos for use in docs.
 *
 * Uses Playwright to open each demo in a headless browser, waits for render,
 * and saves a screenshot to docs/public/screenshots/<demo-id>.png.
 *
 * Usage:
 *   bun run scripts/generate-screenshots.ts
 *   bun run scripts/generate-screenshots.ts --base-url http://localhost:3000
 *   bun run scripts/generate-screenshots.ts --demo dashboard
 */

import { chromium } from "playwright"
import { resolve, join } from "node:path"
import { mkdirSync } from "node:fs"
import { parseArgs } from "node:util"

const ROOT = resolve(import.meta.dir, "..")
const OUTPUT_DIR = join(ROOT, "docs/public/screenshots")

const ALL_DEMOS = [
  { id: "dashboard", name: "Dashboard" },
  { id: "kanban", name: "Kanban Board" },
  { id: "components", name: "Components" },
  { id: "dev-tools", name: "Dev Tools" },
  { id: "textarea", name: "Text Editor" },
]

const VIEWPORT = { width: 800, height: 500 }
const SETTLE_MS = 3000

// --- Parse CLI args ---

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    "base-url": { type: "string", default: "http://localhost:5173" },
    demo: { type: "string" },
  },
  strict: true,
})

const baseUrl = values["base-url"]!
const singleDemo = values["demo"]

const demos = singleDemo ? ALL_DEMOS.filter((d) => d.id === singleDemo) : ALL_DEMOS

if (demos.length === 0) {
  console.error(`Unknown demo: ${singleDemo}`)
  console.error(`Available demos: ${ALL_DEMOS.map((d) => d.id).join(", ")}`)
  process.exit(1)
}

// --- Main ---

mkdirSync(OUTPUT_DIR, { recursive: true })

console.log("Silvery Screenshot Generator")
console.log("============================\n")
console.log(`  Base URL:  ${baseUrl}`)
console.log(`  Output:    ${OUTPUT_DIR}`)
console.log(`  Viewport:  ${VIEWPORT.width}x${VIEWPORT.height}`)
console.log(`  Demos:     ${demos.map((d) => d.id).join(", ")}`)
console.log()

const browser = await chromium.launch()

try {
  for (const demo of demos) {
    const url = `${baseUrl}/examples/showcase.html?demo=${demo.id}`
    const outPath = join(OUTPUT_DIR, `${demo.id}.png`)

    process.stdout.write(`  ${demo.name.padEnd(20)} `)

    const page = await browser.newPage({ viewport: VIEWPORT })

    // Navigate and wait for the page to load
    await page.goto(url, { waitUntil: "load" })

    // Wait for the "silvery-ready" postMessage or timeout
    try {
      await page.waitForFunction(
        () => {
          return new Promise<boolean>((resolve) => {
            // Check if already ready (message may have fired before we started listening)
            const handler = (event: MessageEvent) => {
              if (event.data?.type === "silvery-ready") {
                window.removeEventListener("message", handler)
                resolve(true)
              }
            }
            window.addEventListener("message", handler)
            // Timeout fallback
            setTimeout(() => {
              window.removeEventListener("message", handler)
              resolve(true)
            }, 5000)
          })
        },
        {},
        { timeout: 10000 },
      )
    } catch {
      // If waitForFunction times out, proceed anyway
    }

    // Wait for animations to settle
    await page.waitForTimeout(SETTLE_MS)

    // Capture screenshot
    await page.screenshot({ path: outPath, type: "png" })

    console.log(`-> ${demo.id}.png`)

    await page.close()
  }

  console.log("\nDone.")
} finally {
  await browser.close()
}
