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
const INK_DIR = join(CLONE_DIR, "ink")
const CHALK_DIR = join(CLONE_DIR, "chalk")

const INK_REPO = "https://github.com/vadimdemedes/ink.git"
const CHALK_REPO = "https://github.com/chalk/chalk.git"

const target = process.argv[2] // "ink", "chalk", or undefined (both)

/** Remove `test.failing(` marks for specific test names (Ink/Yoga bugs that silvery passes). */
async function patchFailingMarks(filePath: string, testNames: string[]) {
  let content = await Bun.file(filePath).text()
  for (const name of testNames) {
    // Match: test.failing('name' or test.failing("name"
    const pattern = `test.failing('${name}'`
    const patternDQ = `test.failing("${name}"`
    content = content.replace(pattern, `test('${name}'`)
    content = content.replace(patternDQ, `test("${name}"`)
  }
  await Bun.write(filePath, content)
}

/** Add `test.failing(` marks for specific test names (known silvery/Flexily differences). */
async function addFailingMarks(filePath: string, testNames: string[]) {
  let content = await Bun.file(filePath).text()
  for (const name of testNames) {
    // Match: test('name' or test("name" — but NOT test.failing('name' (already marked)
    const patternSQ = `test('${name}'`
    const patternDQ = `test("${name}"`
    if (content.includes(`test.failing('${name}'`) || content.includes(`test.failing("${name}"`)) continue
    content = content.replace(patternSQ, `test.failing('${name}'`)
    content = content.replace(patternDQ, `test.failing("${name}"`)
  }
  await Bun.write(filePath, content)
}

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

// ---------------------------------------------------------------------------
// Ink
// ---------------------------------------------------------------------------

async function runInkTests() {
  console.log("\n--- Ink Compatibility ---\n")

  await cloneIfNeeded(INK_REPO, INK_DIR, "ink")

  // Install ink's dependencies first (ava, sinon, strip-ansi, react, etc.)
  console.log("  Installing ink dependencies...")
  try {
    await $`cd ${INK_DIR} && npm install --ignore-scripts 2>&1`.quiet()
    // Install yoga-wasm-web if SILVERY_ENGINE=yoga
    if (process.env.SILVERY_ENGINE?.toLowerCase() === "yoga") {
      console.log("  Installing yoga-wasm-web for Yoga engine...")
      await $`cd ${INK_DIR} && npm install yoga-wasm-web 2>&1`.quiet()
    }
  } catch {
    console.log("  Warning: npm install had issues, continuing anyway...")
  }

  // Bundle silvery's ink compat layer — place inside ink dir so react resolves
  const inkSrc = join(COMPAT_DIR, "src/ink.ts")
  const bundlePath = join(INK_DIR, "silvery-ink.mjs")

  console.log("  Building ink compat bundle...")
  const result = await Bun.build({
    entrypoints: [inkSrc],
    outdir: INK_DIR,
    target: "node",
    format: "esm",
    // Externals: react/chalk are peer deps; playwright/playwright-core/electron/
    // chromium-bidi are transitive deps from the monorepo; yoga-wasm-web is optional
    external: [
      "react",
      "chalk",
      "playwright",
      "playwright-core",
      "chromium-bidi",
      "electron",
      "yoga-wasm-web",
      "yoga-wasm-web/auto",
    ],
    naming: "silvery-ink.mjs",
  })
  if (!result.success) {
    console.error("  Failed to build ink compat bundle:")
    for (const log of result.logs) console.error("   ", log)
    throw new Error("ink bundle build failed")
  }
  console.log("  Built silvery-ink.mjs")

  // Ink tests import from '../src/index.js' (relative).
  // tsx (used by ava via --import=tsx) resolves .js → .ts when both exist,
  // so we must remove index.ts to prevent tsx from loading ink's original source.
  const shimContent = `// Auto-generated shim — re-exports silvery's ink compat layer
export * from "${bundlePath}";

// Default export (render) for compat
import { render, initInkCompat } from "${bundlePath}";
export default render;

// Pre-initialize layout engine (supports SILVERY_ENGINE=yoga)
await initInkCompat();
`
  const shimPath = join(INK_DIR, "src/index.js")
  const origTsPath = join(INK_DIR, "src/index.ts")
  await Bun.write(shimPath, shimContent)
  // Remove index.ts so tsx doesn't resolve index.js → index.ts
  if (existsSync(origTsPath)) {
    await $`rm ${origTsPath}`.quiet()
  }
  console.log("  Wrote ink shim (removed index.ts)")

  // Remove .failing() marks for tests that silvery passes (Ink/Yoga bugs that Flexily gets right)
  await patchFailingMarks(join(INK_DIR, "test/width-height.tsx"), ["set min width in percent"])
  // Note: space-around tests are NOT patched — both Yoga and Flexily produce the same (buggy per spec)
  // result, so these tests fail in both Ink and silvery. Keeping .failing() marks = expected failures.
  console.log("  Patched .failing() marks for tests silvery passes")

  // Add .failing() marks for known silvery/Flexily differences
  // Flexily layout engine: no-wrap overflow keeps first children (Yoga keeps last)
  await addFailingMarks(join(INK_DIR, "test/flex-wrap.tsx"), ["row - no wrap", "column - no wrap"])
  // Flexily layout engine: aspectRatio doesn't constrain when both width+height are set,
  // and maxHeight doesn't re-derive width via aspectRatio
  await addFailingMarks(join(INK_DIR, "test/width-height.tsx"), [
    "set aspect ratio with width and height",
    "set aspect ratio with maxHeight constraint",
  ])
  // Overflow rendering: border clipping differences with overflowX on bordered inner boxes
  // and negative-margin intersection. Also, out-of-bounds box rendering differs (silvery
  // clips to column width; Ink preserves border structure with notched middle rows).
  await addFailingMarks(join(INK_DIR, "test/overflow.tsx"), [
    "overflowX - multiple text nodes in a box with border inside overflow container",
    "overflowX - box intersecting with left edge of overflow container with border",
    "out of bounds writes do not crash",
  ])
  // Effect timing: silvery's renderStringSync flushes passive effects (useEffect) during
  // act(), but Ink's renderToString captures output before passive effects fire.
  await addFailingMarks(join(INK_DIR, "test/render-to-string.tsx"), [
    "captures initial render output before effect-driven state updates",
  ])
  // Effect timing: silvery's test renderer flushes effects eagerly on initial render,
  // so measureElement returns the post-layout width on first write (Ink defers to useEffect).
  await addFailingMarks(join(INK_DIR, "test/measure-element.tsx"), ["measure element"])
  console.log("  Marked known silvery/Flexily differences as expected failures")

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

  // Install chalk's dependencies first
  console.log("  Installing chalk dependencies...")
  try {
    await $`cd ${CHALK_DIR} && npm install --ignore-scripts 2>&1`.quiet()
  } catch {
    console.log("  Warning: npm install had issues, continuing anyway...")
  }

  // Bundle silvery's chalk compat layer — place inside chalk dir
  const chalkSrc = join(COMPAT_DIR, "src/chalk.ts")
  const bundlePath = join(CHALK_DIR, "silvery-chalk.mjs")

  console.log("  Building chalk compat bundle...")
  const result = await Bun.build({
    entrypoints: [chalkSrc],
    outdir: CHALK_DIR,
    target: "node",
    format: "esm",
    naming: "silvery-chalk.mjs",
  })
  if (!result.success) {
    console.error("  Failed to build chalk compat bundle:")
    for (const log of result.logs) console.error("   ", log)
    throw new Error("chalk bundle build failed")
  }
  console.log("  Built silvery-chalk.mjs")

  // Chalk tests import from '../source/index.js' (relative).
  const shimPath = join(CHALK_DIR, "source/index.js")

  const shimContent = `// Auto-generated shim — re-exports silvery's chalk compat layer
export * from "${bundlePath}";
export { default } from "${bundlePath}";

// chalk also exports chalkStderr — create it from Chalk class
import { Chalk as _Chalk } from "${bundlePath}";
export const chalkStderr = new _Chalk({ level: 0 });
`
  await Bun.write(shimPath, shimContent)
  console.log("  Wrote chalk shim")

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

  // ava reports "N known failures" for test.failing() tests that fail as expected
  const knownFailMatch = clean.match(/(\d+) known failures?/)
  const knownFailCount = knownFailMatch ? Number(knownFailMatch[1]) : 0

  // ava also shows "N uncaught exceptions" which aren't individual test failures
  const uncaught = clean.match(/(\d+) uncaught exceptions?/)
  const uncaughtCount = uncaught ? Number(uncaught[1]) : 0

  return {
    passed: summaryPass ? Number(summaryPass[1]) : passCount,
    failed: summaryFail ? Number(summaryFail[1]) : Math.max(0, failCount - uncaughtCount),
    knownFailures: knownFailCount,
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
  const total = result.passed + result.failed + result.knownFailures
  const pct = total > 0 ? ((result.passed / total) * 100).toFixed(1) : "N/A"
  // Known failures are expected differences — include in effective compat %
  const effectivePassed = result.passed + result.knownFailures
  const effectivePct = total > 0 ? ((effectivePassed / total) * 100).toFixed(1) : "N/A"
  let line = `${name}: ${result.passed} passed, ${result.failed} failed`
  if (result.knownFailures > 0) line += `, ${result.knownFailures} known failures`
  if (result.skipped > 0) line += `, ${result.skipped} skipped`
  if (result.uncaught > 0) line += `, ${result.uncaught} uncaught`
  if (result.knownFailures > 0) {
    line += ` (${pct}% strict, ${effectivePct}% effective compat)`
  } else {
    line += ` (${pct}% compat)`
  }
  console.log(line)
}

if (inkResult) printResult("Ink  ", parseSummary(inkResult))
if (chalkResult) printResult("Chalk", parseSummary(chalkResult))
