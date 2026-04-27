#!/usr/bin/env bun
/**
 * lint-no-async-unmount — block async React-reconciler unmount calls in
 * silvery production paths.
 *
 * Rationale: silvery's reconciler creates a `ConcurrentRoot` (mode 1) via
 * `createFiberRoot`. The async API:
 *
 *   reconciler.updateContainer(null, fiberRoot, null, () => {})
 *
 * does NOT run React layout-effect cleanups synchronously on a
 * ConcurrentRoot. That leaves `useLayoutEffect` cleanups pending past
 * unmount — `useBoxRect` / `useBoxMetrics` / signal-effect disposers
 * survive, signal subscriptions stay live, and the React tree stays
 * reachable. The closed-over `Container.onRender` then pins the entire
 * enclosing render-instance graph through the FiberRoot's containerInfo
 * pointer. Across 200 mount/unmount cycles in tests the leak is ~37 MB;
 * across long-lived production hosts (silvercode, km-tui) the leak is
 * unbounded.
 *
 * The fix is `unmountFiberRoot(fiberRoot, container)` from
 * `@silvery/ag-react/reconciler`, which combines `updateContainerSync` +
 * `flushSyncWork` + `releaseContainer` (scrubs `Container.onRender`,
 * nulls the root AgNode's child/layout pointers, frees the layout node).
 *
 * This script grep-fails on any `reconciler.updateContainer(null, …)` in
 * silvery source. Tests, build artifacts, and node_modules are exempt.
 *
 * Bead-class: km-silvery.unmount-asymmetry-sweep
 *
 * Usage:
 *   bun scripts/lint-no-async-unmount.ts            # lint the silvery tree
 *   bun scripts/lint-no-async-unmount.ts --json     # JSON output for CI
 */
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join, relative, resolve, sep } from "node:path"

/**
 * Files allowed to call `reconciler.updateContainer(null, ...)` directly.
 * Should be exactly one: the shared `unmountFiberRoot` helper itself, if
 * it ever switches back to using `updateContainer` (it currently uses the
 * sync path). Keep this list empty until that day.
 */
const ALLOWED_FILES = new Set<string>([
  // The lint script itself mentions the pattern in regex strings.
  "scripts/lint-no-async-unmount.ts",
])

/** Allow any path that contains a `/tests/` segment OR ends with a test suffix. */
function isTestPath(rel: string): boolean {
  if (rel.includes(`${sep}tests${sep}`) || rel.includes("/tests/")) return true
  if (/\.test\.(ts|tsx|js|jsx|mts|mjs|cts|cjs)$/.test(rel)) return true
  if (/\.spec\.(ts|tsx|js|jsx|mts|mjs|cts|cjs)$/.test(rel)) return true
  return false
}

/** Allow build artifacts / generated code. */
function isGenerated(rel: string): boolean {
  return (
    rel.includes(`${sep}dist${sep}`) ||
    rel.includes(`${sep}node_modules${sep}`) ||
    rel.includes(`${sep}.bun${sep}`) ||
    rel.includes(`${sep}coverage${sep}`)
  )
}

/** Files we lint. */
function isSourceFile(rel: string): boolean {
  return /\.(ts|tsx|mts|cts)$/.test(rel)
}

/** The pattern we forbid. Two-stage match keeps it strict and grep-greppable. */
const FORBIDDEN_PATTERN = /\breconciler\.updateContainer\s*\(\s*null\s*,/

interface Hit {
  file: string
  line: number
  text: string
}

function scanFile(path: string, rel: string, hits: Hit[]): void {
  let text: string
  try {
    text = readFileSync(path, "utf8")
  } catch {
    return
  }
  const lines = text.split("\n")
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    if (FORBIDDEN_PATTERN.test(line)) {
      hits.push({ file: rel, line: i + 1, text: line.trim() })
    }
  }
}

function walk(dir: string, root: string, hits: Hit[]): void {
  const entries = readdirSync(dir)
  for (const name of entries) {
    const full = join(dir, name)
    const rel = relative(root, full)
    if (isGenerated(rel)) continue
    if (isTestPath(rel)) continue
    let st
    try {
      st = statSync(full)
    } catch {
      continue
    }
    if (st.isDirectory()) {
      walk(full, root, hits)
      continue
    }
    if (!isSourceFile(rel)) continue
    if (ALLOWED_FILES.has(rel)) continue
    scanFile(full, rel, hits)
  }
}

function main(argv: string[]): number {
  const json = argv.includes("--json")
  const root = resolve(import.meta.dir, "..")
  const hits: Hit[] = []

  // Scan the silvery package source. Tests + dist + node_modules are excluded
  // by isTestPath / isGenerated.
  walk(join(root, "packages"), root, hits)
  walk(join(root, "src"), root, hits)

  if (json) {
    process.stdout.write(JSON.stringify({ hits }, null, 2) + "\n")
  } else if (hits.length === 0) {
    process.stdout.write("lint-no-async-unmount: 0 hits.\n")
  } else {
    process.stdout.write(
      `lint-no-async-unmount: ${hits.length} forbidden async-unmount call(s) in silvery source.\n\n`,
    )
    for (const hit of hits) {
      process.stdout.write(`  ${hit.file}:${hit.line}\n    ${hit.text}\n\n`)
    }
    process.stdout.write(
      "Replace each with `unmountFiberRoot(fiberRoot, container)` from\n" +
        "`@silvery/ag-react/reconciler`. The async path leaks layout-effect\n" +
        "cleanups + the FiberRoot.containerInfo.onRender closure on a\n" +
        "ConcurrentRoot. See vendor/silvery/CLAUDE.md → 'Anti-pattern: async\n" +
        "reconciler unmount on ConcurrentRoot' and the unmountFiberRoot\n" +
        "docstring in packages/ag-react/src/reconciler/index.ts.\n",
    )
  }
  return hits.length === 0 ? 0 : 1
}

const code = main(process.argv.slice(2))
process.exit(code)
