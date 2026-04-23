#!/usr/bin/env bun
/**
 * lint-env-reads — enforce that only `@silvery/ansi/profile.ts` reads
 * terminal-signal environment variables.
 *
 * Rationale: silvery is a multi-target framework. Terminal-signal env vars
 * (TERM, TERM_PROGRAM, COLORTERM, KITTY_WINDOW_ID, FORCE_COLOR, NO_COLOR, …)
 * must be read in exactly one place — `createTerminalProfile` in
 * `packages/ansi/src/profile.ts`. Every other consumer accepts `TerminalCaps`
 * or `TerminalProfile` as an argument. When consumers re-derive from env they:
 *
 *   1. Break the single-source-of-truth invariant — "turn mouse off" no longer
 *      has one answer because consumer Y still reads COLORTERM independently.
 *   2. Break browser/canvas/DOM targets — `process` is not defined.
 *   3. Break test fixtures — one mocked caps doesn't propagate.
 *
 * This lint walks the tree and grep-fails on any env read outside the
 * canonical allowlist. Intended to run in CI after the plateau refactor
 * (km-silvery.plateau-env-read-lint).
 *
 * Usage:
 *   bun scripts/lint-env-reads.ts           # lint the silvery tree
 *   bun scripts/lint-env-reads.ts --help
 *   bun scripts/lint-env-reads.ts --paths packages/ansi/src/profile.ts
 *   bun scripts/lint-env-reads.ts --json    # JSON output for tooling
 */
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join, relative, resolve, sep } from "node:path"

/**
 * Terminal-signal env vars we forbid outside the canonical location.
 * These are the ones whose value should live on `TerminalCaps` / `TerminalProfile`.
 *
 * Note: `TERM_PROGRAM_VERSION` matches the `TERM_PROGRAM` prefix rule but is
 * kept here explicitly for clarity. We deliberately do NOT forbid TMUX,
 * SSH_CONNECTION, LANG, LC_*, SILVERY_*, DEBUG, CI-style vars — those are
 * orthogonal environment signals that don't describe terminal capabilities.
 */
const FORBIDDEN_ENV_VARS = [
  "TERM",
  "TERM_PROGRAM",
  "TERM_PROGRAM_VERSION",
  "COLORTERM",
  "COLORFGBG",
  "KITTY_WINDOW_ID",
  "WT_SESSION",
  "NERDFONT",
  "FORCE_COLOR",
  "NO_COLOR",
]

/**
 * Files allowed to read the forbidden env vars.
 *
 * - `packages/ansi/src/profile.ts` — the canonical detection entry point.
 *   Every terminal-signal env var flows through its `detectColorFromEnv` +
 *   `detectTerminalCapsFromEnv`. All other files consume the resulting
 *   `TerminalCaps` / `TerminalProfile`, never re-read env.
 * - `packages/ag-term/src/termtest.ts` — diagnostic CLI that *prints* the env
 *   to help users debug. Not a consumer.
 * - `packages/ag-term/src/ansi/storybook.ts` — standalone storybook script
 *   that *prints* the env. Not a consumer.
 *
 * Post km-silvery.unicode-plateau Phase 3 (2026-04-23): the allowlist shrunk.
 * `packages/ansi/src/detection.ts` and `packages/ag-term/src/text-sizing.ts`
 * used to be on the allowlist as narrow legacy exceptions (the former had
 * `detectUnicode` / `detectExtendedUnderline`; the latter had an env-reading
 * `isTextSizingLikelySupported` fallback). Phases 1-2 migrated that logic
 * into the profile factory and both files are now pure caps-consumers.
 */
const ALLOWED_FILES = new Set<string>([
  "packages/ansi/src/profile.ts",
  "packages/ag-term/src/termtest.ts",
  "packages/ag-term/src/ansi/storybook.ts",
  // The lint script itself mentions these patterns in docstrings / regex strings.
  "scripts/lint-env-reads.ts",
])

/** Allow any path that contains a `/tests/` segment OR ends with a test suffix. */
function isTestPath(rel: string): boolean {
  const norm = rel.split(sep).join("/")
  if (norm.startsWith("tests/") || norm.includes("/tests/")) return true
  if (/\.(test|spec|contract)\.(ts|tsx|mts|mjs)$/.test(norm)) return true
  return false
}

const IGNORED_DIRS = new Set<string>([
  "node_modules",
  "dist",
  ".git",
  "docs",
  ".turbo",
  "coverage",
  "examples",
  "benchmarks",
  ".vitepress",
])

/** Files to skip within allowed code. */
const IGNORED_FILE_SUFFIXES = [".d.ts", ".d.mts", ".map"]

/** Extensions we scan. Intentionally NOT including .md — this is a source lint. */
const SCAN_EXTENSIONS = [".ts", ".tsx", ".mts", ".cts", ".js", ".mjs", ".cjs"]

/** Build the regex that matches any `process.env.<FORBIDDEN>` read. */
function buildForbiddenRegex(): RegExp {
  const alternation = FORBIDDEN_ENV_VARS.join("|")
  // Matches `process.env.TERM` / `process.env.TERM_PROGRAM` / etc.
  // The trailing word boundary ensures `TERM` doesn't accidentally match
  // `TERMINATOR` etc. Note: TERM_PROGRAM is listed before TERM below so the
  // string `process.env.TERM` (no underscore) hits the TERM token correctly.
  return new RegExp(`\\bprocess\\.env\\.(${alternation})\\b`, "g")
}

/** Also flag dynamic access: `process.env["TERM_PROGRAM"]` etc. */
function buildDynamicForbiddenRegex(): RegExp {
  const alternation = FORBIDDEN_ENV_VARS.join("|")
  return new RegExp(`\\bprocess\\.env\\[\\s*["'\`](${alternation})["'\`]\\s*\\]`, "g")
}

interface Violation {
  file: string
  line: number
  col: number
  text: string
  variable: string
}

/** Walk the tree under `root`, return absolute file paths matching extensions. */
function walk(root: string): string[] {
  const out: string[] = []
  const stack: string[] = [root]
  while (stack.length > 0) {
    const dir = stack.pop()!
    let entries: string[]
    try {
      entries = readdirSync(dir)
    } catch {
      continue
    }
    for (const entry of entries) {
      if (IGNORED_DIRS.has(entry)) continue
      const full = join(dir, entry)
      let st
      try {
        st = statSync(full)
      } catch {
        continue
      }
      if (st.isDirectory()) {
        stack.push(full)
        continue
      }
      if (!st.isFile()) continue
      if (IGNORED_FILE_SUFFIXES.some((s) => entry.endsWith(s))) continue
      if (!SCAN_EXTENSIONS.some((ext) => entry.endsWith(ext))) continue
      out.push(full)
    }
  }
  return out
}

/** Scan a single file's contents for forbidden env reads. */
function scanFile(absPath: string, repoRoot: string): Violation[] {
  const rel = relative(repoRoot, absPath).split(sep).join("/")
  if (ALLOWED_FILES.has(rel)) return []
  if (isTestPath(rel)) return []

  let src: string
  try {
    src = readFileSync(absPath, "utf-8")
  } catch {
    return []
  }

  const lines = src.split("\n")
  const results: Violation[] = []
  const staticRe = buildForbiddenRegex()
  const dynamicRe = buildDynamicForbiddenRegex()

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    let m: RegExpExecArray | null

    staticRe.lastIndex = 0
    while ((m = staticRe.exec(line)) !== null) {
      results.push({
        file: rel,
        line: i + 1,
        col: m.index + 1,
        text: line.trim(),
        variable: m[1]!,
      })
    }

    dynamicRe.lastIndex = 0
    while ((m = dynamicRe.exec(line)) !== null) {
      results.push({
        file: rel,
        line: i + 1,
        col: m.index + 1,
        text: line.trim(),
        variable: m[1]!,
      })
    }
  }

  return results
}

// ============================================================================
// CLI
// ============================================================================

interface CliOptions {
  paths?: string[]
  json: boolean
  help: boolean
}

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = { json: false, help: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === "--help" || a === "-h") opts.help = true
    else if (a === "--json") opts.json = true
    else if (a === "--paths") {
      const list: string[] = []
      while (i + 1 < argv.length && !argv[i + 1]!.startsWith("--")) {
        list.push(argv[++i]!)
      }
      opts.paths = list
    }
  }
  return opts
}

function printHelp(): void {
  console.log(`lint-env-reads — enforce single source of truth for terminal env reads

USAGE
  bun scripts/lint-env-reads.ts [options]

OPTIONS
  --paths <file>…      Scan only the given files (relative to repo root).
  --json               Emit machine-readable JSON.
  --help, -h           Show this help.

POLICY
  Only these files may read process.env.{${FORBIDDEN_ENV_VARS.join(", ")}}:
${[...ALLOWED_FILES].map((f) => "    • " + f).join("\n")}

  Test files (tests/**, *.test.*, *.spec.*, *.contract.*) are exempt.

EXIT CODES
  0 — no violations
  1 — one or more violations
  2 — usage error
`)
}

function main(): void {
  const opts = parseArgs(process.argv.slice(2))
  if (opts.help) {
    printHelp()
    process.exit(0)
  }

  // Resolve the silvery repo root from this script's location:
  // scripts/lint-env-reads.ts → <repo>/scripts/<file>
  const repoRoot = resolve(import.meta.dirname, "..")

  const files: string[] = opts.paths
    ? opts.paths.map((p) => resolve(repoRoot, p))
    : walk(repoRoot)

  const violations: Violation[] = []
  for (const f of files) {
    violations.push(...scanFile(f, repoRoot))
  }

  if (opts.json) {
    console.log(JSON.stringify({ violations, count: violations.length }, null, 2))
    process.exit(violations.length === 0 ? 0 : 1)
  }

  if (violations.length === 0) {
    console.log(
      `✓ env-reads: 0 violations across ${files.length} files (allowlist: ${ALLOWED_FILES.size} file${ALLOWED_FILES.size === 1 ? "" : "s"} + tests).`,
    )
    process.exit(0)
  }

  console.error(`✗ env-reads: ${violations.length} violation(s) found.\n`)
  console.error(
    `Only the following files may read terminal-signal env vars (${FORBIDDEN_ENV_VARS.join(", ")}):`,
  )
  for (const f of ALLOWED_FILES) console.error(`  • ${f}`)
  console.error(
    `\nEvery other consumer must accept TerminalCaps or TerminalProfile. See createTerminalProfile in packages/ansi/src/profile.ts.\n`,
  )
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}:${v.col}  process.env.${v.variable}`)
    console.error(`    ${v.text}`)
  }
  console.error(`\n${violations.length} violation(s). Migrate to caps or add to the allowlist.`)
  process.exit(1)
}

main()
