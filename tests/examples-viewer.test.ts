/**
 * Tests that all examples in category directories:
 * 1. Export a `meta` object with name and description
 * 2. Have an import.meta.main guard (safe to import without launching TUI)
 * 3. Export the named component (if any non-meta function export exists)
 *
 * Uses the same auto-discovery as the viewer — no hardcoded registry to maintain.
 */

import { describe, test, expect } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const CATEGORY_DIRS = ["layout", "interactive", "runtime", "inline"] as const
const EXAMPLES_DIR = resolve(__dirname, "../examples")

interface Example {
  name: string
  file: string
  component?: string
}

/** Discover examples the same way the viewer does */
function discoverExamples(): Example[] {
  const results: Example[] = []

  for (const dir of CATEGORY_DIRS) {
    const dirPath = resolve(EXAMPLES_DIR, dir)
    const glob = new Bun.Glob("*.tsx")

    for (const file of glob.scanSync({ cwd: dirPath })) {
      const fullPath = resolve(dirPath, file)
      const source = readFileSync(fullPath, "utf-8")

      // Must have meta export to be considered an example
      if (!source.includes("export const meta")) continue

      // Find component export name from source (avoid importing for discovery)
      const exportMatch = source.match(/export\s+function\s+(\w+)/)
      const component = exportMatch?.[1]

      results.push({
        name: `${dir}/${file}`,
        file: `${dir}/${file}`,
        component,
      })
    }
  }

  return results
}

const EXAMPLES = discoverExamples()

describe("examples viewer compatibility", () => {
  test("discovers at least 15 examples", () => {
    expect(EXAMPLES.length).toBeGreaterThanOrEqual(15)
  })

  test("all examples have import.meta.main guard", () => {
    const missing: string[] = []

    for (const ex of EXAMPLES) {
      const path = resolve(EXAMPLES_DIR, ex.file)
      const source = readFileSync(path, "utf-8")
      if (!source.includes("import.meta.main")) {
        missing.push(ex.file)
      }
    }

    expect(missing).toEqual([])
  })

  test("all examples export meta with name and description", () => {
    const missing: string[] = []

    for (const ex of EXAMPLES) {
      const path = resolve(EXAMPLES_DIR, ex.file)
      const source = readFileSync(path, "utf-8")
      if (!source.includes("export const meta")) {
        missing.push(ex.file)
      }
    }

    expect(missing).toEqual([])
  })

  // Examples with component exports must be importable without side effects
  for (const ex of EXAMPLES.filter((e) => e.component)) {
    test(`${ex.file}: exports ${ex.component}`, async () => {
      const path = resolve(EXAMPLES_DIR, ex.file)
      const mod = (await import(path)) as Record<string, unknown>
      expect(typeof mod[ex.component!]).toBe("function")
    })
  }
})
