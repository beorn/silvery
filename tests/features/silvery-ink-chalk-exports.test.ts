import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, test } from "vitest"

const repoRoot = join(import.meta.dirname, "../..")

describe("root silvery Ink/Chalk entry points", () => {
  test("the dev map and the build entries both carry ./ink and ./chalk", () => {
    const pkg = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")) as {
      exports?: Record<string, unknown>
      tsdown?: { entry?: string[] }
    }

    expect(pkg.exports?.["./ink"]).toBe("./src/ink.ts")
    expect(pkg.exports?.["./chalk"]).toBe("./src/chalk.ts")

    const entries = new Set(pkg.tsdown?.entry ?? [])
    expect(entries.has("src/ink.ts")).toBe(true)
    expect(entries.has("src/chalk.ts")).toBe(true)
  })

  test("silvery/ink is the drop-in Ink replacement the migration guide documents", async () => {
    const ink = (await import("silvery/ink")) as Record<string, unknown>
    for (const name of [
      "Box",
      "Text",
      "Static",
      "render",
      "renderToString",
      "useInput",
      "useApp",
    ]) {
      expect(ink[name], `silvery/ink must export ${name}`).toBeDefined()
    }
  })

  test("silvery/chalk is the drop-in Chalk replacement the migration guide documents", async () => {
    const chalk = (await import("silvery/chalk")) as Record<string, unknown>
    expect(typeof chalk.default).toBe("function")
    expect(chalk.supportsColor).toBeDefined()
  })
})
