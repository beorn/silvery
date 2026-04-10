#!/usr/bin/env bun
/**
 * silvery CLI — delegates to @silvery/examples
 */
import { resolve } from "node:path"

const args = process.argv.slice(2)
const binDir = import.meta.dirname
const examplesCli = resolve(binDir, "../packages/examples/bin/cli.ts")

if (args.includes("--version") || args.includes("-v")) {
  const pkg = await Bun.file(resolve(binDir, "../package.json")).json()
  console.log(`silvery ${pkg.version}`)
  process.exit(0)
}

// "silvery examples" → delegate as-is; "silvery counter" → delegate directly
const proc = Bun.spawn(["bun", "run", examplesCli, ...args], {
  stdio: ["inherit", "inherit", "inherit"],
})
process.exit(await proc.exited)
