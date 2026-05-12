#!/usr/bin/env bun
/**
 * lint-no-in-flight-rect-in-app — block app-side use of the in-flight rect
 * escape-hatch hooks.
 *
 * `useBoxRectInFlight()` / `useScrollRectInFlight()` / `useScreenRectInFlight()`
 * subscribe to the IN-FLIGHT rect signal (the value as written by the most
 * recent layout pass within the current convergence cycle). Reading them
 * during render AND writing a layout-affecting prop based on the read can
 * form a feedback edge with the convergence loop — the very feedback loop
 * that the deferred-only `useBoxRect()` contract was designed to eliminate
 * (silvery 63938779b6).
 *
 * The InFlight escape hatch exists for silvery framework internals that
 * genuinely need first-paint measurement and don't drive layout-affecting
 * props back into the React tree (Image, useCursor, useGridPosition,
 * AutoFit's intrinsic-measurement primitive). App code (silvercode, km-tui,
 * downstream consumers) must NOT import these — use `useBoxRect()` (deferred)
 * or `useResponsiveBoxProps()` / `useResponsiveValue()` instead. See
 * [The Silvery Way §2](docs/guide/the-silvery-way.md).
 *
 * This script is the mechanical enforcement: it greps for the InFlight
 * hooks across the silvery package and fails on any reference outside the
 * allowlist. The allowlist names files that legitimately implement, export,
 * test, or document the InFlight hooks.
 *
 * Bead: @km/silvery/usebox-rect-deferred-only-breaks-first-paint
 *
 * Usage:
 *   bun scripts/lint-no-in-flight-rect-in-app.ts          # exit 1 on violation
 *   bun scripts/lint-no-in-flight-rect-in-app.ts --json   # JSON output
 */
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join, relative, resolve, sep } from "node:path"

/**
 * Hooks whose use is restricted to silvery framework internals.
 */
const RESTRICTED_HOOKS = [
  "useBoxRectInFlight",
  "useScrollRectInFlight",
  "useScreenRectInFlight",
] as const

type RestrictedHook = (typeof RESTRICTED_HOOKS)[number]

/**
 * Files allowed to reference the InFlight hooks. The canonical home
 * (`useLayout.ts`), the public barrel (`exports.ts`), public docs/typings,
 * the silvery internal hot paths that need first-paint reads, the test file
 * that exercises the contract, and this lint script itself (which mentions
 * the names in strings).
 */
const ALLOWED_FILES = new Set<string>([
  "packages/ag-react/src/hooks/useLayout.ts",
  "packages/ag-react/src/exports.ts",
  // Tests legitimately import the hooks to assert their contract.
  "tests/features/layout-hooks-inflight-and-observers.test.tsx",
  // The lint script itself names the hooks in strings.
  "scripts/lint-no-in-flight-rect-in-app.ts",
])

const IGNORED_DIRS = new Set<string>([
  "node_modules",
  "dist",
  ".git",
  ".turbo",
  "coverage",
  "examples",
  "benchmarks",
  ".vitepress",
  ".claude",
])

const IGNORED_FILE_SUFFIXES = [".d.ts", ".d.mts", ".map"]
const SCAN_EXTENSIONS = [".ts", ".tsx", ".mts", ".cts", ".js", ".mjs", ".cjs"]

interface Violation {
  file: string
  line: number
  col: number
  text: string
  hook: RestrictedHook
}

function buildHookRegex(): RegExp {
  return new RegExp(`\\b(${RESTRICTED_HOOKS.join("|")})\\b`, "g")
}

function isInsideIgnoredDir(rel: string): boolean {
  const parts = rel.split(sep)
  return parts.some((p) => IGNORED_DIRS.has(p))
}

function isAllowedFile(rel: string): boolean {
  return ALLOWED_FILES.has(rel)
}

function shouldScan(rel: string): boolean {
  if (isInsideIgnoredDir(rel)) return false
  if (IGNORED_FILE_SUFFIXES.some((s) => rel.endsWith(s))) return false
  return SCAN_EXTENSIONS.some((s) => rel.endsWith(s))
}

function* walk(root: string, current: string): Generator<string> {
  const entries = readdirSync(current)
  for (const name of entries) {
    const abs = join(current, name)
    const rel = relative(root, abs)
    const st = statSync(abs)
    if (st.isDirectory()) {
      if (IGNORED_DIRS.has(name)) continue
      yield* walk(root, abs)
    } else if (st.isFile()) {
      if (shouldScan(rel)) yield abs
    }
  }
}

function scanFile(root: string, abs: string): Violation[] {
  const rel = relative(root, abs)
  if (isAllowedFile(rel)) return []

  const text = readFileSync(abs, "utf8")
  const re = buildHookRegex()
  const out: Violation[] = []
  for (const match of text.matchAll(re)) {
    const hook = match[1] as RestrictedHook
    const idx = match.index ?? 0
    // Compute line/col from the offset.
    let line = 1
    let lineStart = 0
    for (let i = 0; i < idx; i++) {
      if (text[i] === "\n") {
        line++
        lineStart = i + 1
      }
    }
    const col = idx - lineStart + 1
    const lineEnd = text.indexOf("\n", idx)
    const lineText = text.slice(lineStart, lineEnd === -1 ? text.length : lineEnd).trimEnd()
    out.push({ file: rel, line, col, text: lineText, hook })
  }
  return out
}

function main(): number {
  const args = process.argv.slice(2)
  const json = args.includes("--json")

  const root = resolve(import.meta.dir, "..")
  const violations: Violation[] = []
  for (const abs of walk(root, root)) {
    violations.push(...scanFile(root, abs))
  }

  if (json) {
    console.log(JSON.stringify({ violations, count: violations.length }, null, 2))
    return violations.length === 0 ? 0 : 1
  }

  if (violations.length === 0) {
    console.log(
      "✓ No app-side imports of useBoxRectInFlight / useScrollRectInFlight / useScreenRectInFlight",
    )
    return 0
  }

  console.error(
    `✗ ${violations.length} violation(s) — InFlight rect hooks must be used only inside silvery framework internals:`,
  )
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}:${v.col}  ${v.hook}`)
    console.error(`    ${v.text}`)
  }
  console.error("")
  console.error("Use the deferred form (`useBoxRect()` / `useScrollRect()` / `useScreenRect()`) or")
  console.error(
    "the responsive primitives (`useResponsiveBoxProps()` / `useResponsiveValue()`) in app code.",
  )
  console.error(
    "If a silvery internal needs first-paint measurement, add the file to ALLOWED_FILES",
  )
  console.error("in scripts/lint-no-in-flight-rect-in-app.ts.")
  return 1
}

if (import.meta.main) {
  process.exit(main())
}
