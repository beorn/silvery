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

// Build canvas app
const canvasResult = await Bun.build({
  entrypoints: [join(__dirname, "canvas-app.tsx")],
  outdir: distDir,
  target: "browser",
  format: "esm",
  minify: false,
  sourcemap: "external",
  define: {
    "process.env.NODE_ENV": '"production"',
  },
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
  define: {
    "process.env.NODE_ENV": '"production"',
  },
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
