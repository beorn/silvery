/**
 * @failure Silvery cloud CI died in typecheck for two days after tests entered
 *   the tsc program (2026-08-19T19:32). A standalone clone does not hoist
 *   `@playwright/test` from the host monorepo, so `tests/site-smoke.test.ts`
 *   failed TS2307 and skipped every test. This guard fails when a file in
 *   silvery's own typecheck program imports a package that silvery's bun.lock
 *   will not install — the independence checklist, mechanically.
 * @level l2
 * @consumer silvery standalone CI (`bun run typecheck` in a fresh clone)
 * @reach fs-walk vendor/silvery/tests/** vendor/silvery/packages/*\/tests/**
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs"
import { builtinModules } from "node:module"
import { join, relative } from "node:path"
import { describe, expect, test } from "vitest"

const NODE_BUILTINS = new Set(builtinModules)

const repoRoot = join(import.meta.dirname, "..")

/**
 * Packages `bun install` will materialise in a standalone clone — lockfile
 * keys, not the host monorepo's node_modules. Trailing commas in bun.lock
 * are stripped so JSON.parse can read it.
 */
function lockfilePackages(): Set<string> {
  const raw = readFileSync(join(repoRoot, "bun.lock"), "utf8")
  const parsed = JSON.parse(raw.replace(/,(\s*[}\]])/g, "$1")) as {
    packages?: Record<string, unknown>
  }
  return new Set(Object.keys(parsed.packages ?? {}))
}

/** Bare specifier → npm package name. Relative / node: / bun: / interpolations → null. */
function packageName(specifier: string): string | null {
  if (
    specifier.startsWith(".") ||
    specifier.startsWith("/") ||
    specifier.startsWith("node:") ||
    specifier.startsWith("bun:") ||
    specifier.includes("${") ||
    specifier.includes("{")
  ) {
    return null
  }
  if (specifier.startsWith("@")) {
    const [scope, name] = specifier.split("/")
    if (!scope) return null
    return name ? `${scope}/${name}` : scope
  }
  return specifier.split("/")[0] ?? null
}

const IMPORT_RE =
  /(?:^|\s)(?:import|export)(?:\s+type)?[\s\S]*?from\s+['"]([^'"]+)['"]|^\s*import\s+['"]([^'"]+)['"]/gm

function specifiersIn(source: string): string[] {
  const out: string[] = []
  IMPORT_RE.lastIndex = 0
  for (const m of source.matchAll(IMPORT_RE)) {
    const spec = m[1] ?? m[2]
    if (spec) out.push(spec)
  }
  return out
}

const SKIP_DIR = new Set(["node_modules", "dist", "generated"])

function walkTsFiles(dir: string, acc: string[] = []): string[] {
  if (!existsSync(dir)) return acc
  for (const ent of readdirSync(dir)) {
    if (SKIP_DIR.has(ent)) continue
    const p = join(dir, ent)
    const st = statSync(p)
    if (st.isDirectory()) {
      if (p.endsWith(`${join("tests", "compat", "ink", "generated")}`)) continue
      walkTsFiles(p, acc)
    } else if (/\.(ts|tsx)$/.test(ent) && !ent.endsWith(".d.ts")) {
      acc.push(p)
    }
  }
  return acc
}

function typecheckProgramFiles(): string[] {
  const roots = [join(repoRoot, "tests"), ...workspaceTestDirs()]
  const files: string[] = []
  for (const root of roots) walkTsFiles(root, files)
  return files
}

function workspaceTestDirs(): string[] {
  const packages = join(repoRoot, "packages")
  if (!existsSync(packages)) return []
  return readdirSync(packages)
    .map((name) => join(packages, name, "tests"))
    .filter((p) => existsSync(p))
}

describe("standalone typecheck deps", () => {
  test("every typecheck-program test file imports only packages silvery's lockfile installs", () => {
    const installed = lockfilePackages()
    const undeclared: string[] = []

    for (const file of typecheckProgramFiles()) {
      const source = readFileSync(file, "utf8")
      for (const spec of specifiersIn(source)) {
        const name = packageName(spec)
        if (name && !installed.has(name) && !NODE_BUILTINS.has(name)) {
          undeclared.push(`${relative(repoRoot, file)}: ${spec} (package ${name})`)
        }
      }
    }

    expect(undeclared).toEqual([])
  })
})
