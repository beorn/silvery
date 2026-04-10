#!/usr/bin/env bun
/**
 * silvery CLI — delegates to @silvery/examples
 */
import { resolve, dirname, join } from "node:path"
import { existsSync } from "node:fs"

// Find package root by walking up from this file looking for package.json with name "silvery"
function findPackageRoot(startDir: string): string {
  let dir = startDir
  for (let i = 0; i < 10; i++) {
    const pkg = join(dir, "package.json")
    if (existsSync(pkg)) {
      try {
        const json = JSON.parse(require("node:fs").readFileSync(pkg, "utf8"))
        if (json.name === "silvery") return dir
      } catch {}
    }
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  // Fallback: assume bin/ is one level below root
  return dirname(startDir)
}

const scriptDir = dirname(Bun.main)
const root = findPackageRoot(scriptDir)
const args = process.argv.slice(2)
const examplesCli = resolve(root, "packages/examples/bin/cli.ts")

if (args.includes("--version") || args.includes("-v")) {
  const pkg = await Bun.file(resolve(root, "package.json")).json()
  console.log(`silvery ${pkg.version}`)
  process.exit(0)
}

// Strip "examples" subcommand — the examples CLI handles bare args as example names
const delegateArgs = args[0] === "examples" ? args.slice(1) : args

const proc = Bun.spawn(["bun", "run", examplesCli, ...delegateArgs], {
  stdio: ["inherit", "inherit", "inherit"],
})
process.exit(await proc.exited)
