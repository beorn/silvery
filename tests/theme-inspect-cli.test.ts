/**
 * Snapshot tests for `bun theme inspect`.
 *
 * Runs the inspect command against a fixed named scheme (nord) using
 * SILVERY_COLOR=auto override and asserts the output contains the expected
 * sections. Uses JSON format for stable, ANSI-escape-free assertions.
 *
 * Non-TTY behavior: in CI (no TTY), detectScheme falls back to the default
 * dark scheme. We use --format json to get structured output that's easy to
 * assert without parsing ANSI color escapes.
 */

import { describe, expect, it } from "vitest"
import { spawnSync } from "node:child_process"
import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const CLI_PATH = resolve(__dirname, "../packages/schemes/src/cli.ts")
const BUN = process.execPath.includes("bun") ? process.execPath : "bun"

/** Run the theme CLI with given args, returns stdout + exit code. */
function runCli(
  args: string[],
  env: Record<string, string> = {},
): { stdout: string; stderr: string; status: number } {
  const result = spawnSync(BUN, ["run", CLI_PATH, ...args], {
    encoding: "utf8",
    env: { ...process.env, ...env },
    timeout: 10_000,
  })
  return {
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    status: result.status ?? 1,
  }
}

describe("theme inspect CLI", () => {
  it("exits cleanly with --format json", () => {
    const { status, stdout, stderr } = runCli(["inspect", "--format", "json"])
    if (status !== 0) {
      throw new Error(`CLI exited with ${status}: ${stderr}`)
    }
    expect(status).toBe(0)
    expect(stdout.trim()).toBeTruthy()
  })

  it("--format json produces valid JSON with expected structure", () => {
    const { status, stdout } = runCli(["inspect", "--format", "json"])
    expect(status).toBe(0)

    const parsed = JSON.parse(stdout) as Record<string, unknown>

    // Top-level keys
    expect(parsed).toHaveProperty("terminal")
    expect(parsed).toHaveProperty("theme")

    const terminal = parsed.terminal as Record<string, unknown>
    expect(terminal).toHaveProperty("source")
    expect(terminal).toHaveProperty("confidence")
    expect(["override", "fingerprint", "probed", "bg-mode", "fallback"]).toContain(terminal.source)
    expect(typeof terminal.confidence).toBe("number")

    const theme = parsed.theme as Record<string, unknown>

    // Verify a sample of Sterling flat tokens are present (channel-role-state
    // grammar). The full inspect list emits ~34 tokens — these are the ones
    // an app is most likely to consume.
    const expectedTokens = [
      "$bg-surface-default",
      "$bg-surface-subtle",
      "$fg-accent",
      "$bg-accent",
      "$fg-on-accent",
      "$fg-error",
      "$bg-error",
      "$fg-warning",
      "$fg-success",
      "$fg-info",
      "$fg-muted",
      "$border-default",
      "$border-focus",
    ]
    for (const token of expectedTokens) {
      expect(theme).toHaveProperty(token)
      const entry = theme[token] as Record<string, unknown>
      expect(entry).toHaveProperty("value")
      expect(entry).toHaveProperty("monoAttrs")
      expect(Array.isArray(entry.monoAttrs)).toBe(true)
    }
  })

  it("$fg-accent monoAttrs contains 'bold'", () => {
    const { status, stdout } = runCli(["inspect", "--format", "json"])
    expect(status).toBe(0)
    const parsed = JSON.parse(stdout) as Record<string, unknown>
    const theme = parsed.theme as Record<string, { value: string; monoAttrs: string[] }>
    expect(theme["$fg-accent"]!.monoAttrs).toContain("bold")
  })

  it("$fg-muted monoAttrs contains 'dim'", () => {
    const { status, stdout } = runCli(["inspect", "--format", "json"])
    expect(status).toBe(0)
    const parsed = JSON.parse(stdout) as Record<string, unknown>
    const theme = parsed.theme as Record<string, { value: string; monoAttrs: string[] }>
    expect(theme["$fg-muted"]!.monoAttrs).toContain("dim")
  })

  it("$fg-error monoAttrs contains 'bold' and 'inverse'", () => {
    const { status, stdout } = runCli(["inspect", "--format", "json"])
    expect(status).toBe(0)
    const parsed = JSON.parse(stdout) as Record<string, unknown>
    const theme = parsed.theme as Record<string, { value: string; monoAttrs: string[] }>
    expect(theme["$fg-error"]!.monoAttrs).toContain("bold")
    expect(theme["$fg-error"]!.monoAttrs).toContain("inverse")
  })

  it("$border-focus monoAttrs contains 'bold'", () => {
    const { status, stdout } = runCli(["inspect", "--format", "json"])
    expect(status).toBe(0)
    const parsed = JSON.parse(stdout) as Record<string, unknown>
    const theme = parsed.theme as Record<string, { value: string; monoAttrs: string[] }>
    expect(theme["$border-focus"]!.monoAttrs).toContain("bold")
  })

  it("--format json with --diff produces diff section", () => {
    const { status, stdout } = runCli(["inspect", "--format", "json", "--diff", "nord"])
    expect(status).toBe(0)
    const parsed = JSON.parse(stdout) as Record<string, unknown>
    // May or may not have differences depending on what was detected,
    // but the diff key must be present when --diff is passed.
    expect(parsed).toHaveProperty("diff")
    const diff = parsed.diff as Record<string, unknown>
    expect(diff).toHaveProperty("against", "nord")
    expect(diff).toHaveProperty("differences")
  })

  it("human-readable output contains expected sections", () => {
    const { status, stdout } = runCli(["inspect"])
    expect(status).toBe(0)
    // Must have the headers
    expect(stdout).toContain("Detected terminal:")
    expect(stdout).toContain("Source:")
    expect(stdout).toContain("Dark:")
    expect(stdout).toContain("Token")
    expect(stdout).toContain("Value")
    expect(stdout).toContain("SGR (mono tier)")
    // Must have Sterling flat-token rows
    expect(stdout).toContain("$bg-surface-default")
    expect(stdout).toContain("$fg-accent")
    expect(stdout).toContain("$fg-error")
    expect(stdout).toContain("$border-focus")
  })

  it("exits with error for unknown --diff scheme", () => {
    const { status } = runCli(["inspect", "--format", "json", "--diff", "not-a-real-scheme-xyz"])
    expect(status).not.toBe(0)
  })
})
