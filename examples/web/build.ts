#!/usr/bin/env bun
/**
 * Build web examples
 *
 * Bundles the React apps for browser usage.
 * Run: bun run examples/web/build.ts
 */

import { mkdir, cp } from "node:fs/promises"
import { join, dirname } from "node:path"

const __dirname = dirname(new URL(import.meta.url).pathname)
const distDir = join(__dirname, "dist")
const docsDistDir = join(__dirname, "../../docs/site/public/examples/dist")

// Ensure dist directories exist
await mkdir(distDir, { recursive: true })
await mkdir(docsDistDir, { recursive: true })

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

// Shared build options for all browser targets.
// External: packages not needed in browser builds.
// yoga-wasm-web is an optional layout engine (WASM, not needed for demos).
// ws is used by React DevTools connection (not needed in browser).
// Note: @beorn/flexx IS bundled — all renderers use it for layout via browser-renderer.ts.
const sharedOptions = {
  outdir: distDir,
  target: "browser" as const,
  format: "esm" as const,
  minify: false,
  sourcemap: "external" as const,
  define: browserDefines,
  external: ["yoga-wasm-web", "ws"],
}

// Build canvas app
const canvasResult = await Bun.build({
  entrypoints: [join(__dirname, "canvas-app.tsx")],
  ...sharedOptions,
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
  ...sharedOptions,
})

if (!domResult.success) {
  console.error("DOM build failed:")
  for (const log of domResult.logs) {
    console.error(log)
  }
  process.exit(1)
}

// Build xterm app
const xtermResult = await Bun.build({
  entrypoints: [join(__dirname, "xterm-app.tsx")],
  ...sharedOptions,
})

if (!xtermResult.success) {
  console.error("xterm build failed:")
  for (const log of xtermResult.logs) {
    console.error(log)
  }
  process.exit(1)
}

// Copy built files to VitePress public dir for docs site
await cp(distDir, docsDistDir, { recursive: true })

console.log("✓ Built examples/web/dist/canvas-app.js")
console.log("✓ Built examples/web/dist/dom-app.js")
console.log("✓ Built examples/web/dist/xterm-app.js")
console.log("✓ Copied to docs/site/public/examples/dist/")
console.log("\nOpen in browser:")
console.log("  examples/web/canvas.html")
console.log("  examples/web/dom.html")
console.log("  examples/web/xterm.html")
