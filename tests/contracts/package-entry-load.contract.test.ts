import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { describe, expect, test } from "vitest"

const silveryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..")

function expectBunCanImport(specifier: string, expectedExports: string[] = []) {
  const script = `
    const module = await import(${JSON.stringify(specifier)})
    for (const name of ${JSON.stringify(expectedExports)}) {
      if (typeof module[name] !== "function") throw new TypeError(${JSON.stringify(specifier)} + " must export " + name)
    }
  `
  const result = spawnSync(process.execPath, ["-e", script], {
    cwd: silveryRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      NODE_ENV: "test",
    },
  })

  expect(
    result.status,
    [`Bun failed to import ${specifier}`, result.stdout.trim(), result.stderr.trim()]
      .filter(Boolean)
      .join("\n"),
  ).toBe(0)
}

describe("contract: package entry points load under Bun", () => {
  test.each(["@silvery/ag-react", "silvery"])("%s", (specifier) => {
    expectBunCanImport(specifier)
  })

  test("silvery/test exposes the bundled test renderer and Termless helpers", () => {
    expectBunCanImport("silvery/test", ["createRenderer", "createTermless", "waitFor"])
  })
})

// @failure A Silvery tarball leaks Bun's source-only patch path, or another workspace pack loses its patch metadata.
// @level l1 @consumer PNPM beforePacking lifecycle @testonly none
// Source-import tests never inspect the manifest handed to the native pack lifecycle.
test.each(["silvery", "@silvery/commander"])(
  "packing %s preserves the source patch contract",
  async (name) => {
    const sourcePath = resolve(silveryRoot, "package.json")
    const sourceBytes = readFileSync(sourcePath, "utf8")
    const source = JSON.parse(sourceBytes) as Record<string, unknown>
    const manifest = { ...source, name }
    const { default: config } = (await import(
      pathToFileURL(resolve(silveryRoot, ".pnpmfile.cjs")).href
    )) as {
      default: { hooks: { beforePacking(pkg: Record<string, unknown>): Record<string, unknown> } }
    }
    const packed = config.hooks.beforePacking(manifest)

    expect(packed.patchedDependencies).toEqual(
      name === "silvery" ? undefined : source.patchedDependencies,
    )
    expect(packed.exports).toEqual(source.exports)
    expect(readFileSync(sourcePath, "utf8")).toBe(sourceBytes)
  },
)
