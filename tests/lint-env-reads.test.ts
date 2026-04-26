/**
 * Tests for scripts/lint-env-reads.ts — the "only profile.ts reads terminal
 * env signals" enforcement.
 *
 * Two-part coverage:
 *   1. The silvery source tree must currently lint clean.
 *   2. A deliberate violation dropped into a temp file must be caught.
 *
 * See `km-silvery.plateau-env-read-lint`.
 */
import { spawnSync } from "node:child_process"
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { describe, test, expect } from "vitest"

const REPO_ROOT = resolve(import.meta.dirname, "..")
const SCRIPT = join(REPO_ROOT, "scripts", "lint-env-reads.ts")

function runLint(args: string[] = []): { code: number; stdout: string; stderr: string } {
  const result = spawnSync("bun", [SCRIPT, ...args], {
    cwd: REPO_ROOT,
    encoding: "utf-8",
  })
  return {
    code: result.status ?? -1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  }
}

describe("lint-env-reads", () => {
  test("silvery source tree has zero violations", () => {
    const { code, stdout, stderr } = runLint()
    expect({ code, stdout, stderr }).toMatchObject({ code: 0 })
    expect(stdout).toContain("0 violations")
  })

  test("detects a deliberate process.env.TERM_PROGRAM read in a non-allowlisted file", () => {
    // Seed a fake consumer file with the forbidden pattern.
    const violatingSrc = [
      "// Deliberate lint violation for test — should be caught.",
      "export function leak(): string {",
      '  return process.env.TERM_PROGRAM ?? "unknown"',
      "}",
      "",
    ].join("\n")

    // Drop it inside a throwaway subdir of packages/ so it gets walked.
    const stamp = Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
    const dir = join(REPO_ROOT, "packages", "ag-term", "src", `__lint_fixture_${stamp}__`)
    const file = join(dir, "leak.ts")
    mkdirSync(dir, { recursive: true })
    writeFileSync(file, violatingSrc, "utf-8")
    try {
      const { code, stderr } = runLint()
      expect(code).toBe(1)
      expect(stderr).toContain("process.env.TERM_PROGRAM")
      expect(stderr).toMatch(/__lint_fixture_/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test("detects a deliberate process.env.COLORTERM read via dynamic access", () => {
    const violatingSrc = ['export const colorterm = process.env["COLORTERM"] ?? ""', ""].join("\n")
    const stamp = Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
    const dir = join(REPO_ROOT, "packages", "ag-term", "src", `__lint_fixture_${stamp}__`)
    const file = join(dir, "dynamic-leak.ts")
    mkdirSync(dir, { recursive: true })
    writeFileSync(file, violatingSrc, "utf-8")
    try {
      const { code, stderr } = runLint()
      expect(code).toBe(1)
      expect(stderr).toContain("process.env.COLORTERM")
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test("exempts test files (tests/, *.test.*, *.spec.*, *.contract.*)", () => {
    // Drop a violating file under tests/ — should NOT trigger.
    const stamp = Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
    const dir = join(REPO_ROOT, "tests", `__lint_fixture_${stamp}__`)
    const file = join(dir, "some.test.ts")
    mkdirSync(dir, { recursive: true })
    writeFileSync(
      file,
      [
        "// Test file is allowed to manipulate env.",
        "export const t = process.env.TERM_PROGRAM",
        "",
      ].join("\n"),
      "utf-8",
    )
    try {
      const { code, stdout } = runLint()
      expect(code).toBe(0)
      expect(stdout).toContain("0 violations")
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test("--json emits a parseable report", () => {
    // Seed a violation so violations.count > 0.
    const stamp = Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
    const dir = join(REPO_ROOT, "packages", "ag-term", "src", `__lint_fixture_${stamp}__`)
    const file = join(dir, "bad.ts")
    mkdirSync(dir, { recursive: true })
    writeFileSync(file, "export const t = process.env.TERM_PROGRAM\n", "utf-8")
    try {
      const { code, stdout } = runLint(["--json"])
      expect(code).toBe(1)
      const parsed = JSON.parse(stdout) as {
        count: number
        violations: Array<{ file: string; variable: string; line: number }>
      }
      expect(parsed.count).toBeGreaterThan(0)
      const hit = parsed.violations.find((v) => v.file.includes(`__lint_fixture_${stamp}__`))
      expect(hit).toBeDefined()
      expect(hit?.variable).toBe("TERM_PROGRAM")
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test("--paths narrows the scan to specific files", () => {
    // A clean file passes.
    const tmp = mkdtempSync(join(tmpdir(), "silvery-lint-"))
    try {
      const cleanFile = join(tmp, "clean.ts")
      writeFileSync(cleanFile, "export const x = 1\n", "utf-8")
      const { code, stdout } = runLint(["--paths", cleanFile])
      expect(code).toBe(0)
      expect(stdout).toContain("0 violations")
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })
})
