#!/usr/bin/env node
/**
 * silvery CLI — delegates to @silvery/examples.
 * Tries local workspace first, then npx @silvery/examples.
 */
import { resolve, dirname, join } from "node:path"
import { readFileSync, existsSync } from "node:fs"
import { spawn } from "node:child_process"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

function readPackageJson(path: string): { name?: string; version?: string } {
  const value: unknown = JSON.parse(readFileSync(path, "utf8"))
  return value && typeof value === "object" ? (value as { name?: string; version?: string }) : {}
}

function findPackageRoot(startDir: string): string {
  let dir = startDir
  for (let i = 0; i < 10; i++) {
    const pkg = join(dir, "package.json")
    if (existsSync(pkg)) {
      try {
        const json = readPackageJson(pkg)
        if (json.name === "silvery") return dir
      } catch {}
    }
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return dirname(startDir)
}

const root = findPackageRoot(__dirname)
const args = process.argv.slice(2)

if (args.includes("--version") || args.includes("-v")) {
  const pkg = readPackageJson(resolve(root, "package.json"))
  console.log(`silvery ${pkg.version}`)
  process.exit(0)
}

// Strip "examples" subcommand
const delegateArgs = args[0] === "examples" ? args.slice(1) : args

// Try workspace path first (monorepo dev)
const workspaceCli = resolve(root, "packages/examples/bin/cli.ts")
const runtime = typeof globalThis.Bun !== "undefined" ? "bun" : "node"

if (existsSync(workspaceCli)) {
  const runArgs =
    runtime === "bun" ? ["run", workspaceCli, ...delegateArgs] : [workspaceCli, ...delegateArgs]
  const proc = spawn(runtime, runArgs, { stdio: "inherit" })
  proc.on("exit", (code) => process.exit(code ?? 1))
} else {
  // npm consumer: delegate to @silvery/examples bin
  const proc = spawn("npx", ["@silvery/examples", ...delegateArgs], { stdio: "inherit" })
  proc.on("exit", (code) => process.exit(code ?? 1))
}
