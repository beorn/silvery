import { readdirSync, readFileSync } from "node:fs"
import { dirname, join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"

type RawAccessKind = "resize-listener" | "terminal-dimensions"

type RawAccess = {
  file: string
  kind: RawAccessKind
  line: number
  text: string
}

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..")
const sourceRoots = ["packages/ag-react/src", "packages/ag-term/src", "packages/ink/src"]

const classifiedRawAccess: Record<string, string> = {
  "packages/ag-react/src/render.tsx:resize-listener":
    "legacy render() API owns its own scheduler and still listens to raw stdout resize events",
  "packages/ag-react/src/ui/cli/ansi.ts:terminal-dimensions":
    "CLI utility resolves a one-shot terminal width outside the reactive render path",
  "packages/ag-term/src/ansi/term.ts:terminal-dimensions":
    "Term adapter mutates/bridges stream dimensions while the Size owner remains the read API",
  "packages/ag-term/src/runtime/create-app.tsx:resize-listener":
    "standalone createApp fallback when no injected Term Size owner exists",
  "packages/ag-term/src/runtime/create-app.tsx:terminal-dimensions":
    "standalone createApp fallback/initial seed before a Term Size owner is available",
  "packages/ag-term/src/runtime/devices/size.ts:resize-listener":
    "canonical Size owner; this is the only shared coalescing stream listener",
  "packages/ag-term/src/runtime/devices/size.ts:terminal-dimensions":
    "canonical Size owner reads live stream geometry before publishing coalesced snapshots",
  "packages/ag-term/src/scheduler.ts:resize-listener":
    "legacy scheduler fallback for embedders that do not pass a Term Size owner",
  "packages/ag-term/src/scheduler.ts:terminal-dimensions":
    "legacy scheduler fallback for embedders that do not pass a Term Size owner",
  "packages/ag-term/src/term-def.ts:terminal-dimensions":
    "TermDef resolution seeds initial dimensions from the caller-provided stream",
  "packages/ink/src/ink-hooks.ts:resize-listener":
    "Ink compatibility layer mirrors Ink's stdout resize API",
  "packages/ink/src/ink-render.ts:resize-listener":
    "Ink compatibility renderer mirrors Ink's stdout resize API",
  "packages/ink/src/ink-render.ts:terminal-dimensions":
    "Ink compatibility renderer mirrors Ink's stdout dimension fallback behavior",
  "packages/ink/src/ink-utils.ts:terminal-dimensions":
    "Ink compatibility utilities mirror Ink's env/process stdout fallback behavior",
}

const resizeListenerPattern = /\b(?:this\.)?(?:stdout|stream)\.(?:on|off)\(\s*["']resize["']/
const terminalDimensionPatterns = [
  /\b(?:this\.)?stdout\??\.(?:columns|rows)\b/,
  /\bstream\??\.(?:columns|rows)\b/,
  /\bdef\.stdout\??\.(?:columns|rows)\b/,
  /\bprocess\.stdout\??\.(?:columns|rows)\b/,
  /\(\s*stdout\s+as\s+any\s*\)\.(?:columns|rows)\b/,
]

function sourceFiles(dir: string): string[] {
  const result: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "dist" || entry.name === "node_modules") continue
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      result.push(...sourceFiles(path))
    } else if (/\.[cm]?[tj]sx?$/.test(entry.name)) {
      result.push(path)
    }
  }
  return result
}

function isCommentOnly(line: string): boolean {
  const trimmed = line.trim()
  return (
    trimmed.length === 0 ||
    trimmed.startsWith("//") ||
    trimmed.startsWith("/*") ||
    trimmed.startsWith("*")
  )
}

function collectRawAccesses(): RawAccess[] {
  const accesses: RawAccess[] = []

  for (const sourceRoot of sourceRoots) {
    for (const filePath of sourceFiles(resolve(repoRoot, sourceRoot))) {
      const file = relative(repoRoot, filePath)
      const lines = readFileSync(filePath, "utf8").split("\n")
      for (const [index, line] of lines.entries()) {
        if (isCommentOnly(line)) continue

        if (resizeListenerPattern.test(line)) {
          accesses.push({
            file,
            kind: "resize-listener",
            line: index + 1,
            text: line.trim(),
          })
        }

        if (terminalDimensionPatterns.some((pattern) => pattern.test(line))) {
          accesses.push({
            file,
            kind: "terminal-dimensions",
            line: index + 1,
            text: line.trim(),
          })
        }
      }
    }
  }

  return accesses
}

describe("raw terminal resize access", () => {
  test("every direct resize/dimension access path is classified", () => {
    const accesses = collectRawAccesses()
    const observedKeys = new Set(accesses.map((access) => `${access.file}:${access.kind}`))
    const expectedKeys = new Set(Object.keys(classifiedRawAccess))

    const unclassified = accesses.filter(
      (access) => !expectedKeys.has(`${access.file}:${access.kind}`),
    )
    expect(unclassified).toEqual([])

    const staleClassifications = [...expectedKeys].filter((key) => !observedKeys.has(key))
    expect(staleClassifications).toEqual([])
  })
})
