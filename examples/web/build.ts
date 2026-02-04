#!/usr/bin/env bun
/**
 * Build web examples
 *
 * Bundles the React apps for browser usage.
 * Run: bun run examples/web/build.ts
 */

import { mkdir } from "node:fs/promises"
import { join, dirname } from "node:path"

const __dirname = dirname(new URL(import.meta.url).pathname)
const distDir = join(__dirname, "dist")

// Ensure dist directory exists
await mkdir(distDir, { recursive: true })

// Browser-safe defines for Node.js globals.
// @beorn/logger and @beorn/chalkx access process.env at module init,
// which throws ReferenceError in browsers where `process` is undefined.
const browserDefines: Record<string, string> = {
  "process.env.NODE_ENV": '"production"',
  "process.env.LOG_LEVEL": "undefined",
  "process.env.TRACE": "undefined",
  "process.env.TRACE_FORMAT": "undefined",
  "process.env.DEBUG": "undefined",
  "process.env.NO_COLOR": "undefined",
  "process.env.FORCE_COLOR": "undefined",
  "process.env.TERM": "undefined",
  "process.env.TERM_PROGRAM": "undefined",
  "process.env.COLORTERM": "undefined",
  "process.env.CI": "undefined",
  "process.env.GITHUB_ACTIONS": "undefined",
  "process.env.KITTY_WINDOW_ID": "undefined",
  "process.env.WT_SESSION": "undefined",
  "process.env.LANG": "undefined",
  "process.env.LC_ALL": "undefined",
  "process.env.LC_CTYPE": "undefined",
}

// Build canvas app
const canvasResult = await Bun.build({
  entrypoints: [join(__dirname, "canvas-app.tsx")],
  outdir: distDir,
  target: "browser",
  format: "esm",
  minify: false,
  sourcemap: "external",
  define: browserDefines,
})

if (!canvasResult.success) {
  console.error("Canvas build failed:")
  for (const log of canvasResult.logs) {
    console.error(log)
  }
  process.exit(1)
}

// Build DOM app
const domResult = await Bun.build({
  entrypoints: [join(__dirname, "dom-app.tsx")],
  outdir: distDir,
  target: "browser",
  format: "esm",
  minify: false,
  sourcemap: "external",
  define: browserDefines,
})

if (!domResult.success) {
  console.error("DOM build failed:")
  for (const log of domResult.logs) {
    console.error(log)
  }
  process.exit(1)
}

console.log("✓ Built examples/web/dist/canvas-app.js")
console.log("✓ Built examples/web/dist/dom-app.js")
console.log("\nOpen in browser:")
console.log("  examples/web/canvas.html")
console.log("  examples/web/dom.html")
