#!/usr/bin/env bun
/**
 * lint-no-raw-mode — block direct `stdin.setRawMode(...)` calls outside the
 * raw-mode owner system.
 *
 * Rationale: `process.stdin` raw mode is process-global, multi-tenant state.
 * Direct per-call-site toggling — including the polite-looking
 * "capture `wasRaw`, restore in `finally`" shape — races silently under
 * async: the last cleanup to run wins and can disable input for a
 * still-active host TUI (the 2026-04-22 wasRaw incident). The structural fix
 * is single ownership: `term.modes.rawMode(...)` / `createModes()` from
 * `@silvery/ag-term`, whose per-stream reference count lets overlapping
 * owners compose (last release restores cooked mode; inner owners are
 * termios no-ops).
 *
 * Allowed perimeters:
 *   - `packages/ag-term/src/runtime/` — the owner system itself (Modes,
 *     InputOwner) + session teardown.
 *   - the three probe-guarded init paths (kitty-detect, cursor-query,
 *     device-attrs) — transitional, audited legitimate in the 2026-06-10
 *     repo audit (H2 scope note); migrate to `term.input.probe()` before
 *     de-allowlisting.
 *   - `packages/ink/src/` — ink compatibility shim; ink's public API
 *     (`useStdin().setRawMode`) contractually exposes raw-mode control.
 *
 * Everything else must go through the owner. If the owner doesn't cover the
 * use case, grow the owner — don't punch through it (CLAUDE.md
 * "Anti-pattern: wasRaw capture/restore on process.stdin").
 *
 * Audit anchor: 2026-06-10 silvery repo audit finding H2 →
 * hub/silvery/audit-delta-2026-07-ledger.md (km-side) → this gate.
 *
 * Usage:
 *   bun scripts/lint-no-raw-mode.ts            # lint the silvery tree
 *   bun scripts/lint-no-raw-mode.ts --json     # JSON output for CI
 */
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join, relative, resolve, sep } from "node:path"

/** Exact files allowed to call `.setRawMode(` directly. */
const ALLOWED_FILES = new Set<string>([
  // This script mentions the pattern in regex strings.
  "scripts/lint-no-raw-mode.ts",
  // Transitional probe perimeter — probe-guarded one-shot init paths that
  // predate the owner system. Each is individually race-safe via
  // `didSetRaw + listenerCount > 0` guards. Migrate to `term.input.probe()`.
  "packages/ag-term/src/kitty-detect.ts",
  "packages/ag-term/src/cursor-query.ts",
  "packages/ag-term/src/device-attrs.ts",
  "packages/ansi/src/theme/detect.ts",
  // Standalone-CLI perimeter: the theme picker owns the whole terminal for
  // its one-shot lifetime, and @silvery/ansi/schemes deliberately has NO ag-term
  // dependency (layering: theme sits below the runtime). Route through the
  // owner if theme ever gains an ag-term-adjacent dep.
  "packages/ansi/src/schemes/cli.ts",
])

/** Directory prefixes (relative, forward-slash) allowed to touch raw mode. */
const ALLOWED_DIR_PREFIXES = [
  // The owner system itself: devices/modes.ts, input-owner.ts, plus
  // create-app.tsx session teardown.
  "packages/ag-term/src/runtime/",
  // Ink compatibility shim — separate perimeter; ink's API contract exposes
  // setRawMode to consumers.
  "packages/ink/src/",
]

/** Allow any path that contains a `/tests/` segment OR ends with a test suffix. */
function isTestPath(rel: string): boolean {
  if (rel.includes(`${sep}tests${sep}`) || rel.includes("/tests/")) return true
  if (/\.test\.(ts|tsx|js|jsx|mts|mjs|cts|cjs)$/.test(rel)) return true
  if (/\.spec\.(ts|tsx|js|jsx|mts|mjs|cts|cjs)$/.test(rel)) return true
  return false
}

/** Allow build artifacts / generated code. */
function isGenerated(rel: string): boolean {
  return (
    rel.includes(`${sep}dist${sep}`) ||
    rel.includes(`${sep}node_modules${sep}`) ||
    rel.includes(`${sep}.bun${sep}`) ||
    rel.includes(`${sep}coverage${sep}`)
  )
}

/** Files we lint. */
function isSourceFile(rel: string): boolean {
  return /\.(ts|tsx|mts|cts)$/.test(rel)
}

/**
 * The pattern we forbid: a *call* on a stream (`<expr>.setRawMode(`).
 * Method definitions (`setRawMode() {`), property stubs (`setRawMode: () =>`)
 * and capability feature-tests (`typeof stdin.setRawMode === "function"`)
 * don't match — only dotted invocations do.
 */
const FORBIDDEN_PATTERN = /\.setRawMode\s*\(/

interface Hit {
  file: string
  line: number
  text: string
}

function isAllowed(rel: string): boolean {
  const fwd = rel.split(sep).join("/")
  if (ALLOWED_FILES.has(fwd)) return true
  return ALLOWED_DIR_PREFIXES.some((prefix) => fwd.startsWith(prefix))
}

function scanFile(path: string, rel: string, hits: Hit[]): void {
  let text: string
  try {
    text = readFileSync(path, "utf8")
  } catch {
    return
  }
  const lines = text.split("\n")
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    if (FORBIDDEN_PATTERN.test(line)) {
      hits.push({ file: rel, line: i + 1, text: line.trim() })
    }
  }
}

function walk(dir: string, root: string, hits: Hit[]): void {
  const entries = readdirSync(dir)
  for (const name of entries) {
    const full = join(dir, name)
    const rel = relative(root, full)
    if (isGenerated(rel)) continue
    if (isTestPath(rel)) continue
    let st
    try {
      st = statSync(full)
    } catch {
      continue
    }
    if (st.isDirectory()) {
      walk(full, root, hits)
      continue
    }
    if (!isSourceFile(rel)) continue
    if (isAllowed(rel)) continue
    scanFile(full, rel, hits)
  }
}

function main(argv: string[]): number {
  const json = argv.includes("--json")
  const root = resolve(import.meta.dir, "..")
  const hits: Hit[] = []

  walk(join(root, "packages"), root, hits)
  walk(join(root, "src"), root, hits)
  // examples/ and apps/ are public showcases — a raw-mode race there bites
  // their users too. Skip silently if the directory doesn't exist.
  for (const sub of ["examples", "apps", "bin", "components", "layout"]) {
    try {
      walk(join(root, sub), root, hits)
    } catch {
      // directory missing — skip
    }
  }

  if (json) {
    process.stdout.write(JSON.stringify({ hits }, null, 2) + "\n")
  } else if (hits.length === 0) {
    process.stdout.write("lint-no-raw-mode: 0 hits.\n")
  } else {
    process.stdout.write(
      `lint-no-raw-mode: ${hits.length} direct setRawMode call(s) outside the owner system.\n\n`,
    )
    for (const hit of hits) {
      process.stdout.write(`  ${hit.file}:${hit.line}\n    ${hit.text}\n\n`)
    }
    process.stdout.write(
      "Route raw mode through the owner: `term.modes.rawMode(true)` inside a\n" +
        "session, or `createModes({ write, stdin })` from `@silvery/ag-term`\n" +
        "for standalone CLI flows — its per-stream refcount composes with\n" +
        "overlapping owners. Never call `stdin.setRawMode` directly. See\n" +
        "CLAUDE.md → 'Anti-pattern: wasRaw capture/restore on process.stdin'\n" +
        "and packages/ag-term/src/runtime/devices/modes.ts.\n",
    )
  }
  return hits.length === 0 ? 0 : 1
}

const code = main(process.argv.slice(2))
process.exit(code)
