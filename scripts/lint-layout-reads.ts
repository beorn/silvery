#!/usr/bin/env bun
/**
 * lint-layout-reads — warn on render-time reads of layout-snapshot hooks.
 *
 * Phase 4a of `km-silvery.view-as-layout-output` introduces "view as layout
 * output" — caret/focus/selection live as signals on `LayoutSignals` and are
 * read declaratively (props on Box, signal subscriptions). The legacy hooks
 * that snapshot layout state at render time produce stale-frame zero reads
 * across conditional mounts:
 *
 *   - `useBoxRect()` / `useScrollRect()` / `useScreenRect()` — return the
 *     PRIOR layout pass's rect at render time. First-frame after mount sees
 *     null/zero. Same effect-chain bug class that broke the cursor
 *     positioning in `km-silvercode.cursor-startup-position`.
 *   - `useCursor()` — wired the React effect chain that Phase 2 replaced
 *     with `cursorOffset` BoxProp.
 *   - `useFocus()` — wired the FocusManager + useSyncExternalStore chain
 *     that Phase 4a replaces with `focused` BoxProp.
 *   - `useSelection()` — wired the SelectionFeature capability bridge +
 *     `useSyncExternalStore` chain that Phase 4b replaces with the
 *     `selectionIntent` BoxProp + `findActiveSelectionFragments` walk.
 *
 * Mode: **warn-only** (exit code 0 with a non-empty report). The lint will
 * flip to error once consumers migrate. See bead
 * `km-silvery.phase4-split-focus-selection`.
 *
 * **Allowlist**: callers that genuinely want a snapshot can tag the line
 * with the comment marker `// LAYOUT_READ_AT_RENDER: <reason>`. The lint
 * skips those occurrences.
 *
 * Usage:
 *   bun scripts/lint-layout-reads.ts            # scan repo, warn-only
 *   bun scripts/lint-layout-reads.ts --json     # JSON output
 *   bun scripts/lint-layout-reads.ts --strict   # exit 1 on any violation
 *   bun scripts/lint-layout-reads.ts --paths a.tsx b.tsx
 */
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join, relative, resolve, sep } from "node:path"

/**
 * Hook calls that read layout state at render time. These all suffer from
 * the prior-pass-snapshot semantics that the layout-output signals fix.
 *
 * The matcher is intentionally simple — it greps for `<hook>(` invocations.
 * Type definitions, exports, re-exports, and JSDoc references are filtered
 * out by the per-line filters below.
 */
const TARGET_HOOKS = [
  "useBoxRect",
  "useScrollRect",
  "useScreenRect",
  "useCursor",
  "useFocus",
  "useSelection",
] as const

type TargetHook = (typeof TARGET_HOOKS)[number]

/** Comment marker that suppresses the warning for an explicit snapshot read. */
const ALLOWLIST_MARKER = "LAYOUT_READ_AT_RENDER:"

/**
 * Files that legitimately implement / re-export the hooks themselves. These
 * are the canonical homes — flagging them would be noise.
 */
const ALLOWED_FILES = new Set<string>([
  "packages/ag-react/src/hooks/useFocus.ts",
  "packages/ag-react/src/hooks/useFocusable.ts",
  "packages/ag-react/src/hooks/useCursor.ts",
  "packages/ag-react/src/hooks/useSelection.ts",
  "packages/ag-react/src/hooks/useLayout.ts",
  "packages/ag-react/src/hooks/useAgNode.ts",
  "packages/ag-react/src/exports.ts",
  "packages/ag-react/src/focus.ts",
  "packages/ag-term/src/index.ts",
  "src/runtime.ts",
  "src/index.ts",
  // The lint script and its tests reference these names in strings.
  "scripts/lint-layout-reads.ts",
])

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
  "tests", // tests intentionally read snapshots to assert layout outputs
])

const IGNORED_FILE_SUFFIXES = [".d.ts", ".d.mts", ".map"]
const SCAN_EXTENSIONS = [".ts", ".tsx", ".mts", ".cts", ".js", ".mjs", ".cjs"]

interface Violation {
  file: string
  line: number
  col: number
  text: string
  hook: TargetHook
}

function buildHookRegex(): RegExp {
  // Word boundary on both sides — match `useBoxRect(` but not `myUseBoxRect(`
  // and not `useBoxRectSnapshot(` (a future split-off API). The trailing `(`
  // confirms it's a call, filtering out type imports and re-exports.
  return new RegExp(`\\b(${TARGET_HOOKS.join("|")})\\b\\s*\\(`, "g")
}

/**
 * Decide whether a hook invocation is the callback form (post-layout, no
 * stale-read class) or the snapshot form (the target of this lint).
 *
 * The Layout hooks have two overloads:
 *   const rect = useBoxRect()                  // snapshot — render-time read
 *   useBoxRect((rect) => onLayout(rect))       // callback — fires post-layout
 *
 * The callback form is the (b) class in the use-layout-rect-callers audit
 * and is genuinely correct — already fires after layout, no stale-frame
 * issue. We must skip it to avoid false positives on legitimate post-layout
 * registration sites (e.g. useGridPosition, position registry callbacks).
 *
 * Heuristic: scan from the open paren on the first match line forward; if
 * the call has a non-empty argument list, treat it as the callback form.
 * Multi-line invocations are followed by reading subsequent lines until the
 * matching close paren is found. Whitespace and comments inside the parens
 * are ignored. Empty parens (`useBoxRect()`) are the snapshot form — flag.
 *
 * Note: only `useBoxRect`, `useScrollRect`, `useScreenRect` have the
 * callback overload. `useFocus`, `useSelection`, and `useCursor` are
 * always snapshot reads and are flagged unconditionally.
 */
const CALLBACK_CAPABLE_HOOKS = new Set<TargetHook>([
  "useBoxRect",
  "useScrollRect",
  "useScreenRect",
])

function isCallbackForm(
  hook: TargetHook,
  lines: string[],
  lineIdx: number,
  openParenCol: number,
): boolean {
  if (!CALLBACK_CAPABLE_HOOKS.has(hook)) return false

  // openParenCol is 1-based column of the opening `(`; convert to 0-based
  // string index. Walk forward across lines until we either find any
  // non-whitespace, non-comment character (callback form) or close the
  // parens (snapshot form).
  let row = lineIdx
  let col = openParenCol // 0-based; openParenCol passed already as the index after `(`
  let depth = 1
  let inBlockComment = false

  while (row < lines.length) {
    const line = lines[row]!
    while (col < line.length) {
      const ch = line.charAt(col)
      const next = line.charAt(col + 1)

      if (inBlockComment) {
        if (ch === "*" && next === "/") {
          inBlockComment = false
          col += 2
          continue
        }
        col += 1
        continue
      }

      if (ch === "/" && next === "/") break // line comment — go to next line
      if (ch === "/" && next === "*") {
        inBlockComment = true
        col += 2
        continue
      }
      if (ch === " " || ch === "\t") {
        col += 1
        continue
      }
      if (ch === ")") {
        depth -= 1
        if (depth === 0) return false // empty parens — snapshot form
        col += 1
        continue
      }
      // Any other character means there's an argument → callback form.
      return true
    }
    row += 1
    col = 0
  }
  // Unbalanced parens (parse error) — be conservative, treat as snapshot.
  return false
}

/**
 * Filter rules: skip lines that are obviously not render-time reads.
 *
 * - import statements
 * - export statements
 * - JSDoc / inline comments
 * - lines tagged with the allowlist marker (same-line trailing comment)
 * - destructure-from-other-namespace (e.g. `something.useFocus(`)
 */
function shouldSkipLine(line: string): boolean {
  const trimmed = line.trimStart()
  if (trimmed.startsWith("import ")) return true
  if (trimmed.startsWith("export ")) return true
  if (trimmed.startsWith("//")) return true
  if (trimmed.startsWith("*")) return true
  // Single-line JSDoc / block comments: `/** … */` or `/* … */`. The
  // existing `*` prefix only catches multi-line continuations.
  if (trimmed.startsWith("/**") || trimmed.startsWith("/*")) return true
  if (line.includes(ALLOWLIST_MARKER)) return true
  return false
}

/**
 * Detect an allowlist marker on any line in the immediately-preceding
 * comment block (mirrors `eslint-disable-next-line` ergonomics). Walks
 * backward from `lineIdx - 1` while the line is a comment (`//`, `*`,
 * `/**`, `/*`); stops at the first non-comment / blank line. Returns true
 * if any of those comment lines contain ALLOWLIST_MARKER.
 *
 * This is what the inline annotations on the four (c) callers use —
 * a multi-line `// LAYOUT_READ_AT_RENDER: <reason>` block sits directly
 * above the hook call. Same-line trailing comments are still honored by
 * `shouldSkipLine` above.
 */
function hasPrecedingAllowlistComment(lines: string[], lineIdx: number): boolean {
  for (let i = lineIdx - 1; i >= 0; i--) {
    const line = lines[i]!
    const trimmed = line.trimStart()
    const isComment =
      trimmed.startsWith("//") ||
      trimmed.startsWith("*") ||
      trimmed.startsWith("/**") ||
      trimmed.startsWith("/*")
    if (!isComment) return false
    if (line.includes(ALLOWLIST_MARKER)) return true
  }
  return false
}

function isMethodAccess(line: string, matchIndex: number): boolean {
  // If the previous non-whitespace char is `.`, it's a member access
  // (e.g. `obj.useFocus(`) — out of scope for this lint.
  for (let i = matchIndex - 1; i >= 0; i--) {
    const ch = line.charAt(i)
    if (ch === " " || ch === "\t") continue
    return ch === "."
  }
  return false
}

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

function scanFile(absPath: string, repoRoot: string): Violation[] {
  const rel = relative(repoRoot, absPath).split(sep).join("/")
  if (ALLOWED_FILES.has(rel)) return []

  let src: string
  try {
    src = readFileSync(absPath, "utf-8")
  } catch {
    return []
  }

  const lines = src.split("\n")
  const results: Violation[] = []
  const re = buildHookRegex()

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    if (shouldSkipLine(line)) continue

    re.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(line)) !== null) {
      if (isMethodAccess(line, m.index)) continue
      const hook = m[1] as TargetHook
      // The regex includes the trailing `(`; lastIndex points just past it.
      // Convert lastIndex (1 past the open paren in the same line) to a
      // 0-based column inside the parens for the callback-form heuristic.
      const openParenInner = re.lastIndex
      if (isCallbackForm(hook, lines, i, openParenInner)) continue
      if (hasPrecedingAllowlistComment(lines, i)) continue
      results.push({
        file: rel,
        line: i + 1,
        col: m.index + 1,
        text: line.trim(),
        hook,
      })
    }
  }

  return results
}

interface CliOptions {
  paths?: string[]
  json: boolean
  help: boolean
  strict: boolean
}

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = { json: false, help: false, strict: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === "--help" || a === "-h") opts.help = true
    else if (a === "--json") opts.json = true
    else if (a === "--strict") opts.strict = true
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
  console.log(`lint-layout-reads — warn on render-time layout-snapshot hook reads

USAGE
  bun scripts/lint-layout-reads.ts [options]

OPTIONS
  --paths <file>…     Scan only the given files (relative to repo root).
  --json              Emit machine-readable JSON.
  --strict            Exit 1 if any violation is found (default: warn-only, exit 0).
  --help, -h          Show this help.

POLICY
  These hooks read layout state at render time and return prior-frame
  snapshots — the same effect-chain bug class as the cursor stale-null
  reads on conditional mounts:

${TARGET_HOOKS.map((h) => "    • " + h + "()").join("\n")}

  Migrate to the prop-driven path:
    cursorOffset / focused on Box → LayoutSignals.{cursorRect,focusedNodeId}

  To suppress on a specific line, add the comment marker:
    ${ALLOWLIST_MARKER} <reason>

  Tests under tests/** are exempt — they intentionally exercise the hooks.

EXIT CODES
  0 — warn-only (default, even with violations)
  1 — --strict flag was passed and at least one violation was found
  2 — usage error
`)
}

function main(): void {
  const opts = parseArgs(process.argv.slice(2))
  if (opts.help) {
    printHelp()
    process.exit(0)
  }

  const repoRoot = resolve(import.meta.dirname, "..")

  const files: string[] = opts.paths
    ? opts.paths.map((p) => resolve(repoRoot, p))
    : walk(repoRoot)

  const violations: Violation[] = []
  for (const f of files) {
    violations.push(...scanFile(f, repoRoot))
  }

  if (opts.json) {
    console.log(
      JSON.stringify(
        { violations, count: violations.length, mode: opts.strict ? "strict" : "warn" },
        null,
        2,
      ),
    )
    process.exit(opts.strict && violations.length > 0 ? 1 : 0)
  }

  if (violations.length === 0) {
    console.log(
      `✓ layout-reads: 0 violations across ${files.length} files (allowlist: ${ALLOWED_FILES.size}; tests/** exempt).`,
    )
    process.exit(0)
  }

  const heading = opts.strict
    ? `✗ layout-reads (strict): ${violations.length} violation(s) found.`
    : `⚠ layout-reads (warn-only): ${violations.length} render-time read(s) flagged. Migrate to prop-driven layout outputs.`
  console.error(heading)
  console.error(
    `\nTarget hooks (read layout state at render time):\n  ${TARGET_HOOKS.map((h) => h + "()").join(", ")}\n`,
  )
  console.error(
    `Suppress per-line with the comment marker: ${ALLOWLIST_MARKER} <reason>\n`,
  )
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}:${v.col}  ${v.hook}()`)
    console.error(`    ${v.text}`)
  }
  console.error(
    `\n${violations.length} violation(s).${opts.strict ? "" : " (warn-only — exit 0)"}`,
  )
  process.exit(opts.strict && violations.length > 0 ? 1 : 0)
}

main()
