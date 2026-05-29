import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, test } from "vitest"

const repoRoot = join(import.meta.dirname, "../..")

describe("@silvery/ag Islands package exports", () => {
  test("publishConfig exposes the Island subpaths used by consumers", () => {
    const pkg = JSON.parse(readFileSync(join(repoRoot, "packages/ag/package.json"), "utf8")) as {
      publishConfig?: { exports?: Record<string, unknown> }
      tsdown?: { entry?: string[] }
    }

    const exportsMap = pkg.publishConfig?.exports ?? {}
    expect(exportsMap).toHaveProperty("./island")
    expect(exportsMap).toHaveProperty("./island-guests")
    expect(exportsMap).toHaveProperty("./island-types")

    const entries = new Set(pkg.tsdown?.entry ?? [])
    expect(entries.has("src/island.ts")).toBe(true)
    expect(entries.has("src/island-guests.ts")).toBe(true)
    expect(entries.has("src/island-types.ts")).toBe(true)
  })
})
