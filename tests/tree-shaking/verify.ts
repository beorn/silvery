#!/usr/bin/env bun
/**
 * Tree-shaking verification for silvery entry points.
 *
 * For each entry point, bundles it with `bun build --bundle` and checks:
 * 1. Bundle size (bytes)
 * 2. Whether React appears in bundles that shouldn't need it
 * 3. Whether heavy dependencies leak across entry points
 *
 * Usage:
 *   bun vendor/silvery/tests/tree-shaking/verify.ts
 */

import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

interface EntryPoint {
  /** Human-readable name */
  name: string
  /** Import specifier */
  specifier: string
  /** What to import (named exports or "* as ns") */
  importExpr: string
  /** Should React be absent from the bundle? */
  expectNoReact?: boolean
  /** Should react-reconciler be absent? */
  expectNoReconciler?: boolean
}

const entries: EntryPoint[] = [
  // --- Leaf packages (should NOT pull React) ---
  {
    name: "@silvery/term (ansi)",
    specifier: "@silvery/term",
    importExpr: "{ createTerm, detectColor, stripAnsi }",
    expectNoReact: true,
    expectNoReconciler: true,
  },
  {
    name: "@silvery/tea/core",
    specifier: "@silvery/tea/core",
    importExpr: "{ none, batch, dispatch, compose, createFocusManager }",
    expectNoReact: true,
    expectNoReconciler: true,
  },
  {
    name: "@silvery/tea/store",
    specifier: "@silvery/tea/store",
    importExpr: "{ createStore, silveryUpdate, defaultInit }",
    expectNoReact: true,
    expectNoReconciler: true,
  },
  {
    name: "@silvery/tea/tea",
    specifier: "@silvery/tea/tea",
    importExpr: "{ tea, collect }",
    expectNoReact: false, // zustand may reference React
    expectNoReconciler: true,
  },
  {
    name: "@silvery/tea/streams",
    specifier: "@silvery/tea/streams",
    importExpr: "{ merge, map, filter, take }",
    expectNoReact: true,
    expectNoReconciler: true,
  },
  {
    name: "@silvery/theme (no React parts)",
    specifier: "@silvery/theme/theme",
    importExpr: "{ resolveThemeColor, defaultDarkTheme, generateTheme }",
    // theme.ts re-exports ThemeContext.tsx which imports React
    expectNoReact: false,
    expectNoReconciler: true,
  },
  {
    // --- Packages that legitimately need React ---
    name: "@silvery/react",
    specifier: "@silvery/react",
    importExpr: "{ Box, Text, render }",
    expectNoReact: false,
    expectNoReconciler: false,
  },
  {
    name: "@silvery/term/runtime",
    specifier: "@silvery/term/runtime",
    importExpr: "{ createRuntime, layout, diff }",
    // runtime includes createApp which uses React
    expectNoReact: false,
    expectNoReconciler: false,
  },
  {
    name: "@silvery/ui/cli",
    specifier: "@silvery/ui/cli",
    importExpr: "{ Spinner, ProgressBar }",
    expectNoReact: true,
    expectNoReconciler: true,
  },
  {
    name: "@silvery/ui/wrappers",
    specifier: "@silvery/ui/wrappers",
    importExpr: "{ withSpinner, withProgress }",
    expectNoReact: true,
    expectNoReconciler: true,
  },
  {
    name: "silvery/chalk",
    specifier: "silvery/chalk",
    importExpr: "chalk",
    expectNoReact: true,
    expectNoReconciler: true,
  },
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface Result {
  name: string
  bundleSize: number
  hasReact: boolean
  hasReconciler: boolean
  reactViolation: boolean
  reconcilerViolation: boolean
  error?: string
}

async function verifyEntry(entry: EntryPoint, tmpDir: string): Promise<Result> {
  const result: Result = {
    name: entry.name,
    bundleSize: 0,
    hasReact: false,
    hasReconciler: false,
    reactViolation: false,
    reconcilerViolation: false,
  }

  const isDefault = !entry.importExpr.startsWith("{")
  const importLine = isDefault
    ? `import ${entry.importExpr} from "${entry.specifier}"`
    : `import ${entry.importExpr} from "${entry.specifier}"`

  const safeName = entry.name.replace(/[/@]/g, "_")
  // Write entry files INSIDE the silvery dir so workspace resolution works
  const silveryDir = join(import.meta.dirname, "../..")
  const entryFile = join(silveryDir, `.tree-shake-entry-${safeName}.ts`)
  const outFile = join(tmpDir, `out-${safeName}.js`)

  // Write a tiny entry that imports the specifier and uses exports
  // to prevent dead-code elimination from removing them entirely
  await writeFile(
    entryFile,
    `${importLine}\nconsole.log(typeof ${isDefault ? entry.importExpr : entry.importExpr.replace(/[{}]/g, "").split(",")[0]!.trim()})\n`,
  )

  try {
    const proc = Bun.spawn(["bun", "build", "--bundle", "--target=node", "--outfile", outFile, entryFile], {
      // Use the km monorepo root so bun can resolve workspace:* packages
      cwd: join(import.meta.dirname, "../../../.."),
      stdout: "pipe",
      stderr: "pipe",
    })

    const exitCode = await proc.exited
    if (exitCode !== 0) {
      const stderr = await new Response(proc.stderr).text()
      result.error = `bun build failed (exit ${exitCode}): ${stderr.slice(0, 200)}`
      return result
    }

    const bundleContent = await readFile(outFile, "utf-8")
    result.bundleSize = bundleContent.length

    // Check for React presence (look for react-specific markers)
    result.hasReact =
      bundleContent.includes("react") &&
      (bundleContent.includes("createElement") ||
        bundleContent.includes("__SECRET_INTERNALS") ||
        bundleContent.includes("jsx") ||
        bundleContent.includes("useEffect") ||
        bundleContent.includes("useState"))

    // Check for react-reconciler
    result.hasReconciler = bundleContent.includes("react-reconciler") || bundleContent.includes("createContainer")

    result.reactViolation = entry.expectNoReact === true && result.hasReact
    result.reconcilerViolation = entry.expectNoReconciler === true && result.hasReconciler
  } catch (err) {
    result.error = String(err)
  } finally {
    // Clean up entry file from silvery dir
    await rm(entryFile, { force: true }).catch(() => {})
  }

  return result
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const tmpDir = await mkdtemp(join(tmpdir(), "silvery-tree-shake-"))

  console.log("silvery tree-shaking verification")
  console.log("=".repeat(72))
  console.log()

  const results: Result[] = []

  for (const entry of entries) {
    process.stdout.write(`  ${entry.name.padEnd(35)}`)
    const result = await verifyEntry(entry, tmpDir)
    results.push(result)

    if (result.error) {
      console.log(`ERROR: ${result.error}`)
    } else {
      const sizeKB = (result.bundleSize / 1024).toFixed(1)
      const flags: string[] = []
      if (result.reactViolation) flags.push("REACT LEAK")
      if (result.reconcilerViolation) flags.push("RECONCILER LEAK")
      if (result.hasReact && !result.reactViolation) flags.push("react (expected)")
      if (result.hasReconciler && !result.reconcilerViolation) flags.push("reconciler (expected)")
      const flagStr = flags.length > 0 ? `  [${flags.join(", ")}]` : ""
      console.log(`${sizeKB.padStart(8)} KB${flagStr}`)
    }
  }

  console.log()
  console.log("=".repeat(72))

  const violations = results.filter((r) => r.reactViolation || r.reconcilerViolation)
  const errors = results.filter((r) => r.error)

  if (violations.length > 0) {
    console.log()
    console.log("VIOLATIONS:")
    for (const v of violations) {
      if (v.reactViolation) {
        console.log(`  ${v.name}: React leaked into bundle (${(v.bundleSize / 1024).toFixed(1)} KB)`)
      }
      if (v.reconcilerViolation) {
        console.log(`  ${v.name}: react-reconciler leaked into bundle`)
      }
    }
  }

  if (errors.length > 0) {
    console.log()
    console.log("ERRORS:")
    for (const e of errors) {
      console.log(`  ${e.name}: ${e.error}`)
    }
  }

  if (violations.length === 0 && errors.length === 0) {
    console.log("All entry points passed tree-shaking verification.")
  }

  // Cleanup
  await rm(tmpDir, { recursive: true })

  process.exit(violations.length > 0 ? 1 : 0)
}

main().catch((err) => {
  console.error(err)
  process.exit(2)
})
