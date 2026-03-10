#!/usr/bin/env bun
/**
 * Build the Canvas Playground
 *
 * Bundles the playground React app for browser usage.
 * Run: bun run examples/playground/build.ts
 */

import { mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";

const __dirname = dirname(new URL(import.meta.url).pathname);
const distDir = join(__dirname, "dist");

// Ensure dist directory exists
await mkdir(distDir, { recursive: true });

// Browser-safe defines for Node.js globals.
// loggily and @silvery/ansi access process.env at module init,
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
};

const result = await Bun.build({
  entrypoints: [join(__dirname, "playground-app.tsx")],
  outdir: distDir,
  target: "browser",
  format: "esm",
  minify: false,
  sourcemap: "external",
  define: browserDefines,
});

if (!result.success) {
  console.error("Playground build failed:");
  for (const log of result.logs) {
    console.error(log);
  }
  process.exit(1);
}

console.log("Built examples/playground/dist/playground-app.js");
console.log("\nOpen in browser:");
console.log("  examples/playground/index.html");
