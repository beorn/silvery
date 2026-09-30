// vendor-kit: publish-shebang@3c477a147ca0 — generated; edit km/packages/km-infra/vendor-kit/templates/publish-shebang.ts.tmpl in km, then re-sync
// Stamp each packed bin with the interpreter its manifest promises (hh #26691, @cto d7f039e2, 0bd0a5a0). The rule is
// verify-publishable's binShebangRuntime; vendor-kit evaluated it at generation time over every engines state and
// rendered the answers below, so this script depends on nothing a consumer's install must supply. Run it after the
// build, from the package directory:
//   bun scripts/publish-shebang.ts
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

const SHEBANG = { node: "#!/usr/bin/env node", bun: "#!/usr/bin/env bun" } as const

// binShebangRuntime's answer per engines state, rendered by vendor-kit from km-infra's pinned verify-publishable;
// null is a state the rule refuses.
const RULE: Record<EnginesState, keyof typeof SHEBANG | null> = {
  absent: "node",
  neither: null,
  node: "node",
  bun: "bun",
  nodeAndBun: "node",
}

type EnginesState = "absent" | "neither" | "node" | "bun" | "nodeAndBun"

// The engines state a manifest is in, classified as verify-publishable classifies it: a runtime counts as declared
// when engines maps it to a string, and an engines value that is not an object declares neither.
function enginesState(engines: unknown): EnginesState {
  if (engines === undefined) return "absent"
  if (engines === null || typeof engines !== "object" || Array.isArray(engines)) return "neither"
  const declared = engines as Record<string, unknown>
  const node = typeof declared.node === "string"
  const bun = typeof declared.bun === "string"
  if (node && bun) return "nodeAndBun"
  if (node) return "node"
  if (bun) return "bun"
  return "neither"
}

function runtimeFor(engines: unknown): keyof typeof SHEBANG {
  const runtime = RULE[enginesState(engines)]
  if (runtime === null) {
    throw new Error(
      `ENGINES_RUNTIME_UNKNOWN: engines=${JSON.stringify(engines)} declares neither node nor bun, so no bin runtime is promised`,
    )
  }
  return runtime
}

interface Manifest {
  name?: string
  engines?: unknown
  bin?: unknown
  publishConfig?: { bin?: unknown }
}

function bins(manifest: Manifest): Array<[string, string]> {
  const declared = manifest.publishConfig?.bin ?? manifest.bin
  if (declared === undefined) return []
  const packageName = String(manifest.name).split("/").at(-1) ?? ""
  if (typeof declared === "string") return [[packageName, declared]]
  if (declared === null || typeof declared !== "object" || Array.isArray(declared)) {
    const shape = JSON.stringify(declared)
    throw new Error(`PUBLISH_SHEBANG_BIN_INVALID: package=${manifest.name} bin=${shape}`)
  }
  return Object.entries(declared).map(([name, target]) => {
    if (typeof target !== "string" || target === "") {
      throw new Error(
        `PUBLISH_SHEBANG_BIN_INVALID: package=${manifest.name} bin=${name} target=${JSON.stringify(target)}`,
      )
    }
    return [name, target]
  })
}

const packageDir = process.argv[2] ?? process.cwd()
const manifest = JSON.parse(readFileSync(join(packageDir, "package.json"), "utf8")) as Manifest
const declared = bins(manifest)
if (declared.length === 0) {
  process.stdout.write(`publish-shebang: ${manifest.name} declares no bin; nothing stamped\n`)
} else {
  const shebang = SHEBANG[runtimeFor(manifest.engines)]
  for (const [name, target] of declared) {
    const path = join(packageDir, target)
    if (!existsSync(path)) {
      throw new Error(
        `PUBLISH_SHEBANG_TARGET_MISSING: package=${manifest.name} bin=${name} target=${target}; build first`,
      )
    }
    const where = `${manifest.name} bin ${name} (${target})`
    const content = readFileSync(path, "utf8")
    const newline = content.indexOf("\n")
    const firstLine = newline === -1 ? content : content.slice(0, newline)
    const next = firstLine.startsWith("#!")
      ? shebang + (newline === -1 ? "\n" : content.slice(newline))
      : `${shebang}\n${content}`
    if (next === content) {
      process.stdout.write(`publish-shebang: ${where} already ${shebang}\n`)
      continue
    }
    writeFileSync(path, next)
    process.stdout.write(`publish-shebang: ${where} stamped ${shebang}\n`)
  }
}
