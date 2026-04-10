#!/usr/bin/env node
/**
 * silvery CLI — delegates to @silvery/examples
 * Works on both Node.js 23.6+ and Bun.
 */
import { resolve, dirname, join } from "node:path"
import { readFileSync, existsSync } from "node:fs"
import { spawn } from "node:child_process"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Find package root by walking up looking for package.json with name "silvery"
function findPackageRoot(startDir: string): string {
  let dir = startDir
  for (let i = 0; i < 10; i++) {
    const pkg = join(dir, "package.json")
    if (existsSync(pkg)) {
      try {
        const json = JSON.parse(readFileSync(pkg, "utf8"))
        if (json.name === "silvery") return dir
      } catch {}
    }
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return dirname(startDir)
}

// Detect runtime for spawning child processes
const runtime = typeof globalThis.Bun !== "undefined" ? "bun" : "node"

const root = findPackageRoot(__dirname)
const args = process.argv.slice(2)
const examplesCli = resolve(root, "packages/examples/bin/cli.ts")

if (args.includes("--version") || args.includes("-v")) {
  const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"))
  console.log(`silvery ${pkg.version}`)
  process.exit(0)
}

// Strip "examples" subcommand — the examples CLI handles bare args as example names
const delegateArgs = args[0] === "examples" ? args.slice(1) : args

const proc = spawn(runtime, ["run", examplesCli, ...delegateArgs], {
  stdio: "inherit",
})
proc.on("exit", (code) => process.exit(code ?? 1))
