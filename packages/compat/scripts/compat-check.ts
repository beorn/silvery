#!/usr/bin/env bun
/**
 * Ink/Chalk compatibility checker.
 *
 * Clones the Ink and Chalk test suites, bundles silvery's compat layers
 * to self-contained JS, patches entry points to use the bundles, installs
 * deps, and runs each project's own test runner (ava) to measure compat.
 *
 * Usage:
 *   bun packages/compat/scripts/compat-check.ts          # run all
 *   bun packages/compat/scripts/compat-check.ts ink      # ink only
 *   bun packages/compat/scripts/compat-check.ts chalk    # chalk only
 *
 * Cached clones live at /tmp/silvery-compat/. Delete to re-clone.
 */

import { existsSync } from "node:fs"
import { join, resolve } from "node:path"
import { $ } from "bun"

const COMPAT_DIR = resolve(import.meta.dir, "..")
const SILVERY_ROOT = resolve(COMPAT_DIR, "../..")
const CLONE_DIR = "/tmp/silvery-compat"
const BUILD_DIR = join(CLONE_DIR, "build")
const INK_DIR = join(CLONE_DIR, "ink")
const CHALK_DIR = join(CLONE_DIR, "chalk")

const INK_REPO = "https://github.com/vadimdemedes/ink.git"
const CHALK_REPO = "https://github.com/chalk/chalk.git"

const target = process.argv[2] // "ink", "chalk", or undefined (both)

async function cloneIfNeeded(repo: string, dir: string, name: string) {
  if (existsSync(dir)) {
    console.log(`  ${name}: using cached clone at ${dir}`)
    console.log(`  (delete ${dir} to re-clone)`)
    return
  }
  console.log(`  ${name}: cloning ${repo}...`)
  await $`git clone --depth=1 ${repo} ${dir}`.quiet()
  console.log(`  ${name}: done`)
}

/**
 * Pre-bundle the compat layers to self-contained JS files that Node.js
 * can import directly (no TypeScript, no workspace resolution needed).
 */
async function buildCompatBundles() {
  await $`mkdir -p ${BUILD_DIR}`.quiet()

  const inkSrc = join(COMPAT_DIR, "src/ink.ts")
  const chalkSrc = join(COMPAT_DIR, "src/chalk.ts")

  console.log("  Building compat bundles...")

  // Bundle ink compat — externalize react (ink tests provide their own)
  if (!target || target === "ink") {
    const result = await Bun.build({
      entrypoints: [inkSrc],
      outdir: BUILD_DIR,
      target: "node",
      format: "esm",
      external: ["react", "chalk"],
      naming: "silvery-ink.[ext]",
    })
    if (!result.success) {
      console.error("  Failed to build ink compat bundle:")
      for (const log of result.logs) console.error("   ", log)
      throw new Error("ink bundle build failed")
    }
    console.log("  Built silvery-ink.js")
  }

  // Bundle chalk compat — fully self-contained (includes chalk itself)
  if (!target || target === "chalk") {
    const result = await Bun.build({
      entrypoints: [chalkSrc],
      outdir: BUILD_DIR,
      target: "node",
      format: "esm",
      naming: "silvery-chalk.[ext]",
    })
    if (!result.success) {
      console.error("  Failed to build chalk compat bundle:")
      for (const log of result.logs) console.error("   ", log)
      throw new Error("chalk bundle build failed")
    }
    console.log("  Built silvery-chalk.js")
  }
}

// ---------------------------------------------------------------------------
// Ink
// ---------------------------------------------------------------------------

async function runInkTests() {
  console.log("\n--- Ink Compatibility ---\n")

  await cloneIfNeeded(INK_REPO, INK_DIR, "ink")

  // Ink tests import from '../src/index.js' (relative).
  // We replace src/index.js with a shim that re-exports from our bundle.

  const shimPath = join(INK_DIR, "src/index.js")
  const bundlePath = join(BUILD_DIR, "silvery-ink.js")

  const shimContent = `// Auto-generated shim — re-exports silvery's ink compat layer
export * from "${bundlePath}";

// Default export (render) for compat
import { render } from "${bundlePath}";
export default render;
`
  await Bun.write(shimPath, shimContent)
  console.log("  Wrote ink shim at", shimPath)

  // Install ink's dependencies (ava, sinon, strip-ansi, etc.)
  console.log("  Installing ink dependencies...")
  try {
    await $`cd ${INK_DIR} && npm install --ignore-scripts 2>&1`.quiet()
  } catch {
    console.log("  Warning: npm install had issues, continuing anyway...")
  }

  // Run ava
  console.log("  Running ink tests with ava...\n")
  try {
    const result = await $`cd ${INK_DIR} && FORCE_COLOR=0 npx ava --timeout=30s 2>&1`.text()
    console.log(result)
    return result
  } catch (e: any) {
    // ava exits non-zero when tests fail — expected
    const output = e.stdout?.toString() ?? e.stderr?.toString() ?? e.message
    console.log(output)
    return output
  }
}

// ---------------------------------------------------------------------------
// Chalk
// ---------------------------------------------------------------------------

async function runChalkTests() {
  console.log("\n--- Chalk Compatibility ---\n")

  await cloneIfNeeded(CHALK_REPO, CHALK_DIR, "chalk")

  // Chalk tests import from '../source/index.js' (relative).
  // We replace source/index.js with a shim re-exporting from our bundle.

  const shimPath = join(CHALK_DIR, "source/index.js")
  const bundlePath = join(BUILD_DIR, "silvery-chalk.js")

  const shimContent = `// Auto-generated shim — re-exports silvery's chalk compat layer
export * from "${bundlePath}";
export { default } from "${bundlePath}";

// chalk also exports chalkStderr — create it from Chalk class
import { Chalk as _Chalk } from "${bundlePath}";
export const chalkStderr = new _Chalk({ level: 0 });
`
  await Bun.write(shimPath, shimContent)
  console.log("  Wrote chalk shim at", shimPath)

  // Install chalk's dependencies (ava, etc.)
  console.log("  Installing chalk dependencies...")
  try {
    await $`cd ${CHALK_DIR} && npm install --ignore-scripts 2>&1`.quiet()
  } catch {
    console.log("  Warning: npm install had issues, continuing anyway...")
  }

  // Run ava
  console.log("  Running chalk tests with ava...\n")
  try {
    const result = await $`cd ${CHALK_DIR} && npx ava --timeout=30s 2>&1`.text()
    console.log(result)
    return result
  } catch (e: any) {
    const output = e.stdout?.toString() ?? e.stderr?.toString() ?? e.message
    console.log(output)
    return output
  }
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

function parseSummary(output: string) {
  // ava uses checkmarks for individual passes, summary line for failures
  // Strip ANSI codes for reliable matching
  const clean = output.replace(/\x1b\[[0-9;]*m/g, "")

  // Count individual pass/fail marks
  const passCount = (clean.match(/✔/g) || []).length
  const failCount = (clean.match(/✖/g) || []).length

  // Also check for summary lines: "N test(s) passed", "N test(s) failed"
  const summaryPass = clean.match(/(\d+) tests? passed/)
  const summaryFail = clean.match(/(\d+) tests? failed/)
  const skipMatch = clean.match(/(\d+) tests? skipped/)

  // ava also shows "N uncaught exceptions" which aren't individual test failures
  const uncaught = clean.match(/(\d+) uncaught exceptions?/)
  const uncaughtCount = uncaught ? Number(uncaught[1]) : 0

  return {
    passed: summaryPass ? Number(summaryPass[1]) : passCount,
    failed: summaryFail ? Number(summaryFail[1]) : Math.max(0, failCount - uncaughtCount),
    skipped: skipMatch ? Number(skipMatch[1]) : 0,
    uncaught: uncaughtCount,
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

console.log("silvery compat checker\n")
console.log("Cloning test suites (cached after first run)...")
await $`mkdir -p ${CLONE_DIR}`.quiet()

// Build compat bundles (self-contained JS for Node.js/ava)
await buildCompatBundles()

let inkResult = ""
let chalkResult = ""

if (!target || target === "ink") {
  inkResult = await runInkTests()
}
if (!target || target === "chalk") {
  chalkResult = await runChalkTests()
}

console.log("\n=== Summary ===\n")

function printResult(name: string, result: ReturnType<typeof parseSummary>) {
  const total = result.passed + result.failed
  const pct = total > 0 ? ((result.passed / total) * 100).toFixed(1) : "N/A"
  let line = `${name}: ${result.passed} passed, ${result.failed} failed`
  if (result.skipped > 0) line += `, ${result.skipped} skipped`
  if (result.uncaught > 0) line += `, ${result.uncaught} uncaught`
  line += ` (${pct}% compat)`
  console.log(line)
}

if (inkResult) printResult("Ink  ", parseSummary(inkResult))
if (chalkResult) printResult("Chalk", parseSummary(chalkResult))
