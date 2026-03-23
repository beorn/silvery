#!/usr/bin/env bun
/**
 * Build script for silvery — bundles TypeScript source into pre-built JavaScript.
 *
 * Produces ESM bundles in dist/ for each public entry point:
 *   - silvery             → dist/index.js       (main barrel)
 *   - silvery/runtime     → dist/runtime.js     (run, createRuntime, useInput)
 *   - silvery/theme       → dist/theme.js       (ThemeProvider, palettes)
 *   - silvery/ui          → dist/ui.js          (component library)
 *   - silvery/ui/*        → dist/ui/*.js        (component sub-categories)
 *   - silvery/ink         → dist/ink.js         (Ink compatibility)
 *   - silvery/chalk       → dist/chalk.js       (Chalk compatibility)
 *   - @silvery/tea        → packages/tea/dist/  (TEA store, subpaths)
 *   - @silvery/test       → packages/test/dist/ (testing utilities)
 *
 * Internal packages (@silvery/ag, @silvery/ag-react, @silvery/ag-term, @silvery/theme, @silvery/ink)
 * are bundled into the public packages — they don't need separate builds.
 *
 * Peer dependencies (react, react-reconciler, zustand) are externalized.
 * The "bun" export condition in package.json lets Bun users still use TypeScript source directly.
 *
 * Usage:
 *   bun run scripts/build.ts
 *   bun run build
 */

import { resolve, join, relative } from "node:path"
import { rmSync, mkdirSync, existsSync } from "node:fs"

const ROOT = resolve(import.meta.dir, "..")

// External dependencies — not bundled, resolved at runtime by the consumer
const external = [
  // Peer dependencies
  "react",
  "react/jsx-runtime",
  "react/jsx-dev-runtime",
  "react-reconciler",
  "zustand",
  "zustand/*",
  // Runtime dependencies (listed in root package.json "dependencies")
  "chalk",
  "loggily",
  "loggily/*",
  "slice-ansi",
  "string-width",
  // External packages not bundled
  "flexily",
  "flexily/*",
  "@termless/*",
  // Optional/dev dependencies (lazy-imported at runtime)
  "playwright",
  "playwright-core",
  "playwright-core/*",
  "@xterm/xterm",
  "@xterm/addon-fit",
  "electron",
  "chromium-bidi",
  "chromium-bidi/*",
  // vitest/vimonkey — test-time only, not bundled
  "vitest",
  "vitest/*",
  "vimonkey",
  "vimonkey/*",
  // Node.js built-ins
  "node:*",
  "bun:*",
]

interface BuildTarget {
  /** Human-readable name for logging */
  name: string
  /** Entry point file (relative to ROOT) */
  entrypoint: string
  /** Output file (relative to ROOT) */
  outfile: string
}

const targets: BuildTarget[] = [
  // ---- silvery (root package) ----

  // Main barrel
  {
    name: "silvery",
    entrypoint: "src/index.ts",
    outfile: "dist/index.js",
  },
  // Subpath: silvery/runtime
  {
    name: "silvery/runtime",
    entrypoint: "src/runtime.ts",
    outfile: "dist/runtime.js",
  },
  // Subpath: silvery/theme
  {
    name: "silvery/theme",
    entrypoint: "src/theme.ts",
    outfile: "dist/theme.js",
  },
  // Subpath: silvery/ui
  {
    name: "silvery/ui",
    entrypoint: "src/ui.ts",
    outfile: "dist/ui.js",
  },
  // Subpath: silvery/ui/cli
  {
    name: "silvery/ui/cli",
    entrypoint: "src/ui/cli.ts",
    outfile: "dist/ui/cli.js",
  },
  // Subpath: silvery/ui/react
  {
    name: "silvery/ui/react",
    entrypoint: "src/ui/react.ts",
    outfile: "dist/ui/react.js",
  },
  // Subpath: silvery/ui/progress
  {
    name: "silvery/ui/progress",
    entrypoint: "src/ui/progress.ts",
    outfile: "dist/ui/progress.js",
  },
  // Subpath: silvery/ui/wrappers
  {
    name: "silvery/ui/wrappers",
    entrypoint: "src/ui/wrappers.ts",
    outfile: "dist/ui/wrappers.js",
  },
  // Subpath: silvery/ui/ansi
  {
    name: "silvery/ui/ansi",
    entrypoint: "src/ui/ansi.ts",
    outfile: "dist/ui/ansi.js",
  },
  // Subpath: silvery/ui/display
  {
    name: "silvery/ui/display",
    entrypoint: "src/ui/display.ts",
    outfile: "dist/ui/display.js",
  },
  // Subpath: silvery/ui/input
  {
    name: "silvery/ui/input",
    entrypoint: "src/ui/input.ts",
    outfile: "dist/ui/input.js",
  },
  // Subpath: silvery/ui/animation
  {
    name: "silvery/ui/animation",
    entrypoint: "src/ui/animation.ts",
    outfile: "dist/ui/animation.js",
  },
  // Subpath: silvery/ui/image
  {
    name: "silvery/ui/image",
    entrypoint: "src/ui/image.ts",
    outfile: "dist/ui/image.js",
  },
  // Subpath: silvery/ui/utils
  {
    name: "silvery/ui/utils",
    entrypoint: "src/ui/utils.ts",
    outfile: "dist/ui/utils.js",
  },
  // Ink compatibility layer
  {
    name: "silvery/ink",
    entrypoint: "packages/ink/src/ink.ts",
    outfile: "dist/ink.js",
  },
  // Chalk compatibility layer
  {
    name: "silvery/chalk",
    entrypoint: "packages/ink/src/chalk.ts",
    outfile: "dist/chalk.js",
  },
  // @silvery/tea — TEA store (public package)
  {
    name: "@silvery/tea",
    entrypoint: "packages/tea/src/index.ts",
    outfile: "packages/tea/dist/index.js",
  },
  // @silvery/tea subpath exports
  {
    name: "@silvery/tea/core",
    entrypoint: "packages/tea/src/core/index.ts",
    outfile: "packages/tea/dist/core.js",
  },
  {
    name: "@silvery/tea/store",
    entrypoint: "packages/tea/src/store/index.ts",
    outfile: "packages/tea/dist/store.js",
  },
  {
    name: "@silvery/tea/tea",
    entrypoint: "packages/tea/src/tea/index.ts",
    outfile: "packages/tea/dist/tea.js",
  },
  {
    name: "@silvery/tea/streams",
    entrypoint: "packages/tea/src/streams/index.ts",
    outfile: "packages/tea/dist/streams.js",
  },
  {
    name: "@silvery/tea/plugins",
    entrypoint: "packages/tea/src/plugins.ts",
    outfile: "packages/tea/dist/plugins.js",
  },
  {
    name: "@silvery/tea/create-app",
    entrypoint: "packages/tea/src/create-app.tsx",
    outfile: "packages/tea/dist/create-app.js",
  },
  // @silvery/test — Testing utilities (public package)
  {
    name: "@silvery/test",
    entrypoint: "packages/test/src/index.tsx",
    outfile: "packages/test/dist/index.js",
  },
]

async function clean() {
  const dirs = ["dist", "packages/tea/dist", "packages/test/dist"]
  for (const dir of dirs) {
    const fullPath = join(ROOT, dir)
    if (existsSync(fullPath)) {
      rmSync(fullPath, { recursive: true })
    }
  }
}

async function buildTarget(target: BuildTarget): Promise<{ success: boolean; size: number }> {
  const entrypoint = join(ROOT, target.entrypoint)
  const outfile = join(ROOT, target.outfile)

  // Ensure output directory exists
  const outDir = resolve(outfile, "..")
  mkdirSync(outDir, { recursive: true })

  const result = await Bun.build({
    entrypoints: [entrypoint],
    outdir: outDir,
    naming: target.outfile.split("/").pop()!,
    target: "node",
    format: "esm",
    external,
    // Bundle all internal @silvery/* packages into the output
    // (they're resolved via tsconfig paths in the workspace)
    minify: {
      whitespace: true,
      syntax: true,
      // Don't mangle identifiers — keeps stack traces readable
      identifiers: false,
    },
    sourcemap: "external",
  })

  if (!result.success) {
    console.error(`  FAIL ${target.name}:`)
    for (const msg of result.logs) {
      console.error(`    ${msg}`)
    }
    return { success: false, size: 0 }
  }

  // Get output size
  const file = Bun.file(outfile)
  const size = file.size

  return { success: true, size }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// --- Main ---

console.log("silvery build")
console.log("=============\n")

// Clean previous builds
await clean()
console.log("Cleaned dist/ directories\n")

// Build all targets
let totalSize = 0
let failures = 0

for (const target of targets) {
  const { success, size } = await buildTarget(target)
  if (success) {
    totalSize += size
    const rel = relative(ROOT, join(ROOT, target.outfile))
    console.log(`  ${target.name.padEnd(28)} → ${rel.padEnd(35)} ${formatSize(size).padStart(10)}`)
  } else {
    failures++
  }
}

console.log(`\n  ${"Total".padEnd(28)}   ${"".padEnd(35)} ${formatSize(totalSize).padStart(10)}`)

if (failures > 0) {
  console.error(`\n${failures} target(s) failed`)
  process.exit(1)
}

console.log("\nBuild complete.")
