#!/usr/bin/env bun
/**
 * Auto-generate vitest tests from Ink's ava test suite.
 *
 * Reads ink's ava test files from the cloned repo at /tmp/silvery-compat/ink,
 * rewrites imports to use silvery's compat layer + an ava-shim (so assertions
 * stay as-is: t.is, t.true, etc.), and writes to tests/compat/ink/generated/.
 *
 * Usage:
 *   bun packages/ink/scripts/gen-vitest.ts              # generate all
 *   bun packages/ink/scripts/gen-vitest.ts --dry-run    # preview changes
 *   bun packages/ink/scripts/gen-vitest.ts --list       # list available test files
 *   bun packages/ink/scripts/gen-vitest.ts components   # generate specific file(s)
 *
 * The generated tests live in tests/compat/ink/generated/ and are gitignored.
 * Run: bun vitest run --project vendor tests/compat/ink/generated/
 */

import { existsSync, readdirSync, mkdirSync } from "node:fs"
import { join, resolve } from "node:path"

const SILVERY_ROOT = resolve(import.meta.dir, "../../..")
const INK_DIR = "/tmp/silvery-compat/ink"
const INK_TEST_DIR = join(INK_DIR, "test")
const INK_FIXTURE_DIR = join(INK_DIR, "test/fixtures")
const OUT_DIR = resolve(SILVERY_ROOT, "tests/compat/ink/generated")
const FIXTURE_OUT_DIR = resolve(OUT_DIR, "fixtures")

const args = process.argv.slice(2)
const dryRun = args.includes("--dry-run")
const listOnly = args.includes("--list")
const fileFilters = args.filter((a) => !a.startsWith("--"))

// ---------------------------------------------------------------------------
// Check prereqs
// ---------------------------------------------------------------------------

if (!existsSync(INK_TEST_DIR)) {
  console.error(`Ink test directory not found: ${INK_TEST_DIR}`)
  console.error(`Run 'bun packages/ink/scripts/compat-check.ts ink' first to clone.`)
  process.exit(1)
}

// ---------------------------------------------------------------------------
// Discover test files
// ---------------------------------------------------------------------------

const allTestFiles = readdirSync(INK_TEST_DIR)
  .filter((f) => f.endsWith(".tsx") && !f.startsWith("_"))
  .map((f) => f.replace(".tsx", ""))
  .sort()

if (listOnly) {
  console.log("Available Ink test files:\n")
  for (const f of allTestFiles) console.log(`  ${f}`)
  console.log(`\n${allTestFiles.length} files total`)
  process.exit(0)
}

const filesToProcess =
  fileFilters.length > 0 ? allTestFiles.filter((f) => fileFilters.some((ff) => f.includes(ff))) : allTestFiles

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

// Files that use PTY (term helper) — need special handling
const PTY_FILES = new Set([
  "hooks-use-input",
  "hooks-use-input-kitty",
  "hooks-use-input-navigation",
  "hooks-use-paste",
  "hooks",
])

// Files that use the run() PTY helper or node-pty directly
const RUN_FILES = new Set(["exit"])

// Files that use internal ink APIs not exposed through compat
const INTERNAL_FILES = new Set([
  "errors",
  "log-update",
  "reconciler",
  "render", // Tests ink's render engine internals (erase, throttle, bsu/esu, write callbacks)
  "write-synchronized",
  "alternate-screen-example",
  "cursor-helpers",
])

// Files that need the kitty keyboard internals
const KITTY_FILES = new Set(["kitty-keyboard"])

// Known expected failures (same as compat-check.ts addFailingMarks)
const EXPECTED_FAILURES: Record<string, string[]> = {
  "flex-wrap": ["row - no wrap", "column - no wrap"],
  "width-height": ["set aspect ratio with width and height", "set aspect ratio with maxHeight constraint"],
  overflow: [
    "overflowX - single text node in a box with border inside overflow container",
    "overflowX - multiple text nodes in a box with border inside overflow container",
    "overflowX - box intersecting with left edge of overflow container with border",
    "out of bounds writes do not crash",
  ],
  "render-to-string": [
    "captures initial render output before effect-driven state updates",
    "default columns is 80",
    "text outside Text component throws",
  ],
  "measure-element": ["measure element"],
  text: [
    // silvery's chalk is a separate instance from npm chalk; setting npm chalk.level
    // doesn't affect silvery's currentChalkLevel(). These tests set chalk.level = 3
    // on the npm chalk instance but silvery's Ink compat layer checks its own chalk.
    "text with dim+bold",
    "text with dim+bold - concurrent",
  ],
  // PTY tests — some fixed, some remain known differences
  "hooks-use-input": [
    // silvery maps 0x7F to backspace (modern standard); Ink maps it to delete
    "useInput - handle delete",
  ],
  "use-animation": [
    // Concurrent mode (React 18+ concurrent rendering) — separate from maxFps shim.
    // Tracked in km-silvery.positioning.
    "concurrent aborted renders do not suppress interval reset",
  ],
  exit: [
    // Fixtures with 500ms setTimeout-based exit/unmount — timing-dependent behavior
    "exit when app finishes execution",
    "exit on exit() with error",
    "exit on exit() with error with value property",
    "exit on exit() with result value",
    "exit on exit() with object result",
    "exit on exit() with raw mode with error",
    // Uses node-pty spawn directly — can't convert to in-process
    "don\u2019t exit while raw mode is active",
    // Uses run() with env option not supported in in-process mode
    "exit when DEV is set",
  ],
}

// Tests that need interactive render mode features not yet supported in vitest
// These pass in the real compat-check (ava + ink's own test runner)
const RENDER_MODE_FAILURES: Record<string, string[]> = {
  components: [
    "fail when text nodes are not within <Text> component",
    "fail when text node is not within <Text> component",
    "fail when <Box> is inside <Text> component",
    "static output",
    "static output - concurrent",
    "static output is written immediately in non-interactive mode",
    "ensure wrap-ansi doesn\u2019t trim leading whitespace",
    "disable raw mode when all input components are unmounted",
    "re-ref stdin when input is used after previous unmount",
    "render only last frame when run in CI",
    "render all frames if CI environment variable equals false",
    "debug mode in CI does not replay final frame during unmount teardown",
    "debug mode in CI keeps final newline separation after waitUntilExit",
    "render only last frame when stdout is not a TTY",
    "interactive option overrides TTY detection",
    "render warns when stdout is reused before unmount",
    "alternate screen - enters on mount and exits on unmount",
    "primary screen - cleanup console output follows the native console during unmount",
    "alternate screen - does not replay exit(Error) output on the primary screen during unmount",
    "alternate screen - does not replay teardown output on the primary screen during unmount",
    "alternate screen - cleanup console output follows the native console during unmount",
    "alternate screen - cleanup() exits the alternate screen",
    "alternate screen - content is rendered between enter and exit",
    "alternate screen - debug concurrent teardown restores the cursor before the first commit",
    "debug mode: useStdout().write() replays latest frame",
    "debug mode: useStdout().write() replays rerendered frame",
    "debug mode: useStdout().write() does not leak into stderr",
    "debug mode: useStderr().write() replays latest frame without empty writes",
    "debug mode: useStderr().write() replays rerendered frame",
  ],
  cursor: [
    "cursor follows text input",
    "cursor is shown at specified position after render",
    "cursor moves on space input even when output is identical",
    "cursor position does not leak from suspended concurrent render to fallback",
    "cursor remains visible after useStderr().write()",
    "cursor remains visible after useStdout().write()",
    "debug mode: useStdout().write() replays latest frame",
    "debug mode: useStdout().write() does not leak into stderr",
    "debug mode: useStderr().write() replays latest frame without empty writes",
    "debug mode: useStdout().write() replays rerendered frame",
    "debug mode: useStderr().write() replays rerendered frame",
  ],
  "use-box-metrics": [
    "returns correct size on first render",
    "returns correct position",
    "updates when terminal is resized",
    "uses latest tracked ref when terminal is resized",
    "updates when sibling content changes",
    "updates when sibling content changes but tracked component is memoized",
    "updates when tracked ref attaches after initial render and component is memoized",
    "does not trigger extra re-renders when layout is unchanged",
    "returns zeros when ref is not attached",
    "hasMeasured becomes true when tracked element is mounted on initial render",
    "hasMeasured resets when tracked ref switches to a detached element",
    "hasMeasured becomes true after the tracked element is measured",
    "resets metrics when tracked element unmounts",
  ],
  "screen-reader": [
    "render text for screen readers",
    "render text for screen readers with aria-role",
    "render text for screen readers with aria-hidden",
    "render nested row",
    "render multi-line text with roles",
    "render with aria-state.busy",
    "render with aria-state.checked",
    "render with aria-state.disabled",
    "render with aria-state.expanded",
    "render with aria-state.multiline",
    "render with aria-state.multiselectable",
    "render with aria-state.readonly",
    "render with aria-state.required",
    "render with aria-state.selected",
    "render aria-label only Text for screen readers",
    "render aria-label only Box for screen readers",
    "render select input for screen readers",
    "render listbox with multiselectable options",
  ],
  // measure-element render-mode tests now pass — removed from failures
  "terminal-resize": [
    "useWindowSize returns current terminal dimensions and updates on resize",
    "useWindowSize falls back to a positive column count when stdout.columns is 0",
    "useWindowSize falls back to terminal-size rows when stdout.rows is missing",
  ],
}

// Tests that silvery passes but Ink marks as .failing
const SILVERY_PASSES: Record<string, string[]> = {
  "width-height": ["set min width in percent"],
}

// ---------------------------------------------------------------------------
// Import block utilities
// ---------------------------------------------------------------------------

/**
 * Replace/remove imports by their source module path.
 * Handles both single-line and multi-line import statements safely.
 */
function replaceImportsBySource(code: string, replacements: Record<string, string | null>): string {
  const lines = code.split("\n")
  const result: string[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]!
    if (line.trimStart().startsWith("import ")) {
      // Collect full import (may span multiple lines)
      let block = line
      let endIdx = i
      while (!block.includes(" from ") && endIdx < lines.length - 1) {
        endIdx++
        block += "\n" + lines[endIdx]!
      }

      let matched = false
      for (const [source, replacement] of Object.entries(replacements)) {
        const esc = source.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
        if (new RegExp(`from\\s*['"]${esc}(?:\\.js)?['"]`).test(block)) {
          matched = true
          if (replacement !== null) result.push(replacement)
          i = endIdx + 1
          break
        }
      }
      if (!matched) {
        result.push(line)
        i++
      }
    } else {
      result.push(line)
      i++
    }
  }
  return result.join("\n")
}

// ---------------------------------------------------------------------------
// Transform: imports only (assertions stay as ava — handled by shim)
// ---------------------------------------------------------------------------

function transform(code: string, fileName: string): string {
  let out = code

  // 1. Replace ava import with our ava-shim
  out = out.replace(
    /import test(?:,\s*\{[^}]*\})?\s*from\s*['"]ava['"];?\n?/g,
    'import test from "../helpers/ava-shim"\nimport type { ExecutionContext } from "../helpers/ava-shim"\n',
  )

  // 2. Remove sinon imports (the shim handles spy/stub differently — we add helpers inline)
  out = replaceImportsBySource(out, { sinon: null })

  // 3. Replace ink source imports with compat layer
  out = replaceImportsBySource(out, {
    "../src/index":
      'import { Box, Text, Newline, Spacer, Static, Transform, render, measureElement, useApp, useInput, useStdin, useFocus, useFocusManager, useCursor, useAnimation, useStdout, useStderr } from "../../../../packages/ink/src/ink"',
    "../../src/index": 'import { Box, Text, render } from "../../../../packages/ink/src/ink"',
  })

  // 4. Replace helper imports
  out = replaceImportsBySource(out, {
    "./helpers/render-to-string":
      'import { renderToString, renderToStringAsync, initLayoutEngine } from "../helpers/render-to-string"',
    "./helpers/create-stdout": 'import createStdout from "../helpers/create-stdout"',
    "./helpers/create-stdin": 'import { createStdin, emitReadable } from "../helpers/create-stdin"',
    "./helpers/test-renderer": 'import { renderAsync } from "../helpers/test-renderer"',
    "./helpers/run": null, // PTY — not available
    "./helpers/term": null, // PTY — not available
    "./helpers/force-colors": 'import { enableTestColors, disableTestColors } from "../helpers/render-to-string"',
    "./helpers/mock-timer-calls": 'import mockTimerCalls from "../helpers/mock-timer-calls"',
  })

  // 5. Replace third-party imports
  out = out.replace(
    /import\s+stripAnsi\s+from\s*['"]strip-ansi['"];?/g,
    'import { stripAnsi } from "../../../../packages/ag-term/src/unicode"',
  )
  // Keep chalk as-is (real chalk from node_modules works in tests)
  // Replace delay with inline promise
  out = out.replace(
    /import delay from ['"]delay['"];?\n?/g,
    "const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))\n",
  )

  // Provide inline stubs for unavailable packages
  out = out.replace(
    /import\s+ansiEscapes\s+from\s*['"]ansi-escapes['"];?\n?/g,
    "const ansiEscapes = { cursorTo: (x: number, y?: number) => `\\x1b[${y != null ? `${y + 1};` : ''}${x + 1}H`, cursorHide: '\\x1b[?25l', cursorShow: '\\x1b[?25h', eraseScreen: '\\x1b[2J', clearScreen: '\\x1b[2J\\x1b[H', cursorSavePosition: '\\x1b[s', cursorRestorePosition: '\\x1b[u', cursorGetPosition: '\\x1b[6n', cursorNextLine: '\\x1b[E', cursorPrevLine: '\\x1b[F', cursorMove: (x: number, y?: number) => { let s = ''; if (x < 0) s += `\\x1b[${-x}D`; else if (x > 0) s += `\\x1b[${x}C`; if (y && y < 0) s += `\\x1b[${-y}A`; else if (y && y > 0) s += `\\x1b[${y}B`; return s; }, eraseEndLine: '\\x1b[K', eraseLine: '\\x1b[2K', eraseLines: (count: number) => { let s = ''; for (let i = 0; i < count; i++) s += '\\x1b[2K' + (i < count - 1 ? '\\x1b[1A' : ''); if (count) s += '\\x1b[G'; return s; }, clearTerminal: '\\x1b[2J\\x1b[3J\\x1b[H', link: (text: string, url: string) => `\\x1b]8;;${url}\\x07${text}\\x1b]8;;\\x07` }\n",
  )
  // boxen — keep as-is (available in km's node_modules)
  out = out.replace(
    /import\s+cliBoxes\s+from\s*['"]cli-boxes['"];?\n?/g,
    "const cliBoxes = { round: { topLeft: '╭', top: '─', topRight: '╮', right: '│', bottomRight: '╯', bottom: '─', bottomLeft: '╰', left: '│' }, single: { topLeft: '┌', top: '─', topRight: '┐', right: '│', bottomRight: '┘', bottom: '─', bottomLeft: '└', left: '│' }, double: { topLeft: '╔', top: '═', topRight: '╗', right: '║', bottomRight: '╝', bottom: '═', bottomLeft: '╚', left: '║' }, bold: { topLeft: '┏', top: '━', topRight: '┓', right: '┃', bottomRight: '┛', bottom: '━', bottomLeft: '┗', left: '┃' }, singleDouble: { topLeft: '╓', top: '─', topRight: '╖', right: '║', bottomRight: '╜', bottom: '─', bottomLeft: '╙', left: '║' }, doubleSingle: { topLeft: '╒', top: '═', topRight: '╕', right: '│', bottomRight: '╛', bottom: '═', bottomLeft: '╘', left: '│' }, classic: { topLeft: '+', top: '-', topRight: '+', right: '|', bottomRight: '+', bottom: '-', bottomLeft: '+', left: '|' }, arrow: { topLeft: '↘', top: '↓', topRight: '↙', right: '←', bottomRight: '↖', bottom: '↑', bottomLeft: '↗', left: '→' } }\n",
  )

  // Comment out truly unavailable packages
  const unavailable = ["patch-console", "is-in-ci", "slice-ansi"]
  for (const pkg of unavailable) {
    out = out.replace(
      new RegExp(`import\\s+\\w+(?:,\\s*\\{[^}]*\\})?\\s+from\\s*['"]${pkg}['"];?\\n?`, "g"),
      `// import from '${pkg}' — not available\n`,
    )
  }

  // Handle indent-string inline
  out = out.replace(
    /import\s+indentString.*from\s*['"]indent-string['"];?\n?/g,
    'const indentString = (s: string, n: number) => s.split("\\n").map((l: string) => " ".repeat(n) + l).join("\\n")\n',
  )

  // Handle @sinonjs/fake-timers — replace with a vitest-backed shim that
  // exposes the install/uninstall + tickAsync API used by ink's tests.
  out = out.replace(
    /import\s+FakeTimers.*from\s*['"]@sinonjs\/fake-timers['"];?\n?/g,
    'import { vi as __vi_fake_timers } from "vitest"\nconst FakeTimers = { install: () => { __vi_fake_timers.useFakeTimers(); return { tickAsync: async (ms: number) => __vi_fake_timers.advanceTimersByTimeAsync(ms), tick: (ms: number) => __vi_fake_timers.advanceTimersByTime(ms), uninstall: () => __vi_fake_timers.useRealTimers(), runAllAsync: async () => __vi_fake_timers.runAllTimersAsync(), runAll: () => __vi_fake_timers.runAllTimers() }; } }\n',
  )

  // Rewrite measure-text import to compat layer
  out = out.replace(
    /^import\s+(\w+)\s+from\s*['"]\.\.\/src\/measure-text(?:\.js)?['"];?/gm,
    'import { measureText } from "../../../../packages/ink/src/ink-measure-text"',
  )

  // Handle internal ink imports (non-index, e.g. ../src/measure-text.js)
  // Provide inline stubs for commonly used internal exports
  out = out.replace(
    /^import\s+\{([^}]+)\}\s*from\s*['"]\.\.\/src\/write-synchronized(?:\.js)?['"];?/gm,
    "const bsu = '\\x1b[?2026h'; const esu = '\\x1b[?2026l';",
  )
  out = out.replace(
    /^import\s+(\w+)\s+from\s*['"]\.\.\/src\/(?!index)([^'"]+)['"];?/gm,
    "// internal: import $1 from '../src/$2'",
  )

  // Comment out example imports
  out = out.replace(
    /^import\s*\{([^}]+)\}\s*from\s*['"]\.\.\/examples\/([^'"]+)['"];?/gm,
    "// example: import {$1} from '../examples/$2'",
  )

  // Remove node:vm
  out = out.replace(/import\s+vm\s+from\s*['"]node:vm['"];?\n?/g, "")

  // 6. Handle expected failures / silvery passes
  const allFailures = [...(EXPECTED_FAILURES[fileName] ?? []), ...(RENDER_MODE_FAILURES[fileName] ?? [])]
  for (const name of allFailures) {
    // Match test('name' / test("name" / test.serial(\n\t'name' — with optional whitespace
    const esc = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    // Replace test( or test.serial( followed by optional whitespace/newline then quote+name
    out = out.replace(
      new RegExp(`test(?:\\.serial)?\\(\\s*(['"])${esc}\\1`, "g"),
      (m, q) => `test.failing(${q}${name}${q}`,
    )
  }
  // Handle data-driven tests: for loops using testCase.testName can't be marked .failing
  // Replace test.serial(testCase.testName with test.skip(testCase.testName for affected files
  if (
    RENDER_MODE_FAILURES[fileName]?.some(
      (n) => !out.includes(`test.failing('${n}'`) && !out.includes(`test.failing("${n}"`),
    )
  ) {
    out = out.replace(
      /for \(const testCase of hookWriteCases\) \{\n\ttest\.serial\(testCase\.testName/g,
      "for (const testCase of hookWriteCases) {\n\ttest.skip(testCase.testName",
    )
  }
  const passes = SILVERY_PASSES[fileName]
  if (passes) {
    for (const name of passes) {
      const esc = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      out = out.replace(new RegExp(`test\\.failing\\(\\s*(['"])${esc}\\1`, "g"), (m, q) => `test(${q}${name}${q}`)
    }
  }

  // 7. Add layout engine init if needed
  if ((out.includes("renderToString") || out.includes("renderToStringAsync")) && !out.includes("initLayoutEngine()")) {
    // Find position after last import line — insert beforeAll there
    const importEnd = findLastImportEnd(out)
    // If initLayoutEngine isn't already imported (e.g. from render-to-string helper), add it
    // Also import renderToString/renderToStringAsync if they're used but not yet imported from the helper
    const needsInitImport = !out.includes("initLayoutEngine")
    if (needsInitImport) {
      const helperExports = ["initLayoutEngine"]
      if (out.includes("renderToString") && !out.includes('from "../helpers/render-to-string"')) {
        helperExports.unshift("renderToString")
        if (out.includes("renderToStringAsync")) helperExports.push("renderToStringAsync")
      }
      const initImport = `import { ${helperExports.join(", ")} } from "../helpers/render-to-string"\n`
      out =
        out.slice(0, importEnd) +
        `\n\n${initImport}import { beforeAll } from "vitest"\nbeforeAll(async () => { await initLayoutEngine() })\n` +
        out.slice(importEnd)
    } else {
      out =
        out.slice(0, importEnd) +
        '\n\nimport { beforeAll } from "vitest"\nbeforeAll(async () => { await initLayoutEngine() })\n' +
        out.slice(importEnd)
    }
  }

  // 8. Add sinon import if needed
  if (code.includes("spy(") || code.includes("stub(") || code.includes("sinon")) {
    const importEnd = findImportEnd(out)
    out =
      out.slice(0, importEnd) +
      '\n\nimport { createSpy as _createSpy, spy, stub, sinon } from "../helpers/sinon-compat"\n' +
      out.slice(importEnd)
  }

  // 9. Header + cleanup
  out =
    `/**\n * Auto-generated from ink/test/${fileName}.tsx\n * DO NOT EDIT — regenerate with: bun packages/ink/scripts/gen-vitest.ts\n */\n` +
    out

  // Remove triple+ blank lines
  out = out.replace(/\n{3,}/g, "\n\n")

  return out
}

/** Find position after the last `import ... from` or `export` statement in the file. */
function findLastImportEnd(code: string): number {
  // Find the last `from '...'` or `from "..."` in the file that's part of an import
  const importFromPattern = /^(?:import|export)\s.*from\s+['"][^'"]+['"];?\s*$/gm
  let lastPos = 0
  let match: RegExpExecArray | null
  while ((match = importFromPattern.exec(code)) !== null) {
    lastPos = match.index + match[0].length
  }
  // Also handle multi-line imports: } from '...'
  const multiLineFromPattern = /\}\s*from\s+['"][^'"]+['"];?\s*$/gm
  while ((match = multiLineFromPattern.exec(code)) !== null) {
    const endPos = match.index + match[0].length
    if (endPos > lastPos) lastPos = endPos
  }
  // Also handle `const ... = ...` near imports (inline stubs from codemod)
  // Only count const declarations that appear within 3 lines of the last import
  const lines = code.split("\n")
  const lastImportLine = code.slice(0, lastPos).split("\n").length - 1
  for (let i = lastImportLine + 1; i < Math.min(lastImportLine + 5, lines.length); i++) {
    const line = lines[i]!.trim()
    if (line.startsWith("const ") && !line.includes("{") && !line.endsWith("(") && !line.endsWith("=>")) {
      lastPos = lines.slice(0, i + 1).join("\n").length
    } else if (line !== "" && !line.startsWith("//") && !line.startsWith("/*") && !line.startsWith("*")) {
      break
    }
  }
  return lastPos
}

// Keep old name as alias for compatibility with sinon insertion
const findImportEnd = findLastImportEnd

// ---------------------------------------------------------------------------
// Fixture transformer — convert ink fixtures to importable modules
// ---------------------------------------------------------------------------

/** Map from fixture file name to the set of test files that use it */
const FIXTURE_USERS = new Map<string, Set<string>>()

/**
 * Scan a PTY/RUN test file for fixture references and collect them.
 * Matches patterns: term('fixture-name' and run('fixture-name'
 */
function collectFixtureRefs(source: string, testFileName: string): string[] {
  const refs: string[] = []
  const pattern = /(?:term|run)\(\s*['"]([^'"]+)['"]/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(source)) !== null) {
    const name = match[1]!
    refs.push(name)
    if (!FIXTURE_USERS.has(name)) FIXTURE_USERS.set(name, new Set())
    FIXTURE_USERS.get(name)!.add(testFileName)
  }
  return [...new Set(refs)]
}

/**
 * Transform an ink fixture file into an importable module.
 * - Rewrites ink imports to compat layer
 * - Removes top-level render(), waitUntilExit(), console.log()
 * - Removes process.stdout.write('__READY__')
 * - Exports the component + a createFixture(args) factory
 */
function transformFixture(source: string, fixtureName: string): string {
  let out = source

  // Replace ink source imports with compat layer
  out = replaceImportsBySource(out, {
    "../../src/index":
      'import { Box, Text, Static, render as _inkRender, useApp, useInput, useStdin, useStdout, usePaste } from "../../../../../packages/ink/src/ink"',
  })

  // Remove process.stdout.write('__READY__') calls
  out = out.replace(/\s*process\.stdout\.write\(['"]__READY__['"]\);?\s*/g, "\n")

  // Extract render options and component JSX from the top-level render() call
  // before removing it. Handle both single-line and multi-line render calls.
  const renderOptions: Record<string, string> = {}
  let componentJSX = ""

  // Try single-line first: render(<Component prop={val} />)
  let renderCallMatch = out.match(
    /(?:const\s+(?:\{[^}]+\}|\w+)\s*=\s*)?(?:_inkRender|render)\(\s*(<[^,)]+>)\s*(?:,\s*(\{[^}]+\}))?\s*\);?/,
  )
  // Try same-line JSX with multi-line options (nested braces):
  // render(<Component prop={val} />, {\n\tkeyboard: {mode: 'disabled'},\n});
  if (!renderCallMatch) {
    renderCallMatch = out.match(
      /(?:const\s+(?:\{[^}]+\}|\w+)\s*=\s*)?(?:_inkRender|render)\(\s*(<[^,]+\/>)\s*,\s*(\{[\s\S]*?\})\s*\);?/m,
    )
  }
  // Try multi-line: render(\n\tternary ? <A /> : <B />,\n)
  if (!renderCallMatch) {
    renderCallMatch = out.match(
      /(?:const\s+(?:\{[^}]+\}|\w+)\s*=\s*)?(?:_inkRender|render)\(\s*\n\t([\s\S]+?)\s*(?:,\s*(\{[^}]+\}))?\s*\);?/m,
    )
  }
  if (renderCallMatch) {
    componentJSX = renderCallMatch[1]!.trim()
    if (renderCallMatch[2]) {
      const optStr = renderCallMatch[2]
      const exitOnCtrlC = optStr.match(/exitOnCtrlC:\s*(true|false)/)
      if (exitOnCtrlC) renderOptions.exitOnCtrlC = exitOnCtrlC[1]!
      // Extract kittyKeyboard option
      const kittyMatch = optStr.match(/kittyKeyboard:\s*(\{[^}]+\})/)
      if (kittyMatch) renderOptions.kittyKeyboard = kittyMatch[1]!
    }
  }

  // Remove top-level execution code (render calls, await, console.log, try/catch, stdin handlers)
  // This is everything that runs when the fixture is executed as a script.
  // We keep function/class/type definitions and imports.

  // Remove render() calls (with or without assignment, including multi-line)
  out = out.replace(/^(?:const\s+(?:\{[^}]+\}|\w+)\s*=\s*)?(?:_inkRender|render)\([\s\S]*?\);?\s*$/gm, "")

  // Remove await statements (waitUntilExit, etc.)
  out = out.replace(/^await\s+.*$/gm, "")

  // Remove console.log/console.error calls at top level
  out = out.replace(/^console\.(?:log|error)\(.*\);?\s*$/gm, "")

  // Remove setTimeout at top level (used in exit fixtures for unmount)
  out = out.replace(/^setTimeout\(\s*\(\)\s*=>\s*\{[\s\S]*?\}\s*,\s*\d+\s*\);?\s*$/gm, "")
  // Simpler setTimeout patterns
  out = out.replace(/^setTimeout\([^)]+\);?\s*$/gm, "")

  // Remove process.stdin.on(...) handlers (may span multiple lines)
  out = out.replace(/^process\.stdin\.on\([\s\S]*?\);?\s*$/gm, "")

  // Remove try/catch blocks at top level (wrapping waitUntilExit)
  out = out.replace(/^try\s*\{[\s\S]*?\}\s*catch\s*\([^)]*\)\s*\{[\s\S]*?\}\s*$/gm, "")

  // Remove const result = await ... patterns
  out = out.replace(/^const\s+result\s*=\s*await\s+.*$/gm, "")

  // Remove top-level const assignments to args[N] or process.argv (from conversion)
  out = out.replace(/^const\s+\w+\s*=\s*(?:args\[\d+\]|process\.argv\[\d+\]);?\s*$/gm, "")

  // Remove process.stdout.rows/columns assignments (side effects for PTY subprocess)
  out = out.replace(/^process\.stdout\.rows\s*=\s*.*$/gm, "")
  out = out.replace(/^process\.stdout\.columns\s*=\s*.*$/gm, "")

  // Remove conditional render blocks (if/else with render calls)
  out = out.replace(/^if\s*\([\s\S]*?(?:render|_inkRender)\([\s\S]*?\}\s*$/gm, "")

  // Remove standalone calls to functions destructured from render results
  // (clear, rerender, unmount, cleanup, waitUntilExit)
  out = out.replace(/^(?:clear|rerender|unmount|cleanup|waitUntilExit)\(.*\);?\s*$/gm, "")

  // Clean up empty useEffect calls (left from __READY__ removal)
  out = out.replace(/\tReact\.useEffect\(\(\) => \{\n\}, \[\]\);?\n?/g, "")
  out = out.replace(/\s*React\.useEffect\(\(\) => \{\s*\}, \[\]\);?\s*/g, "\n")

  // Make all component functions/classes exported
  out = out.replace(/^(function\s+\w+)/gm, "export $1")
  out = out.replace(/^(class\s+\w+)/gm, "export $1")
  // Don't double-export
  out = out.replace(/^export export /gm, "export ")

  // Replace process.argv[2] references with a prop/arg parameter
  // The fixtures use process.argv[2] as the test name parameter
  out = out.replace(/process\.argv\[2\]/g, "args[0]")
  out = out.replace(/process\.argv\[3\]/g, "args[1]")

  // Build the createFixture export
  const optionsStr =
    Object.keys(renderOptions).length > 0
      ? `, options: { ${Object.entries(renderOptions)
          .map(([k, v]) => `${k}: ${v}`)
          .join(", ")} }`
      : ""

  // Determine the component name and how to construct the element
  let createFixtureBody = ""
  if (componentJSX) {
    // Replace process.argv refs in the JSX
    const jsx = componentJSX.replace(/process\.argv\[2\]/g, "args[0]").replace(/process\.argv\[3\]/g, "args[1]")
    // Also replace local `test` variable references with args[0] for conditional render patterns
    // e.g., test === 'multipleHooks' ? <A /> : <B test={test} />
    if (jsx.includes("test ===") || jsx.includes("{test}")) {
      createFixtureBody = `  const test = args[0]\n  return { element: ${jsx}${optionsStr} }`
    } else {
      createFixtureBody = `  return { element: ${jsx}${optionsStr} }`
    }
  } else {
    // Fallback: try to find the main component
    const componentMatch = out.match(/export (?:function|class) (\w+)/)
    if (componentMatch) {
      createFixtureBody = `  return { element: <${componentMatch[1]} />${optionsStr} }`
    } else {
      createFixtureBody = `  return { element: <></>${optionsStr} }`
    }
  }

  // Remove _inkRender import if present (we don't need render in fixture modules)
  out = out.replace(/,?\s*render as _inkRender/g, "")
  out = out.replace(/,?\s*_inkRender/g, "")

  // Remove 'import process from ...' — not needed in-process
  out = out.replace(/import\s+process\s+from\s*['"]node:process['"];?\n?/g, "")

  // Add the createFixture export
  out += `\n\nimport type { FixtureSpec } from "../../helpers/create-term"\n`
  out += `export function createFixture(args: string[]): FixtureSpec {\n${createFixtureBody}\n}\n`

  // Header
  out =
    `/**\n * Auto-generated fixture from ink/test/fixtures/${fixtureName}.tsx\n * DO NOT EDIT — regenerate with: bun packages/ink/scripts/gen-vitest.ts\n */\n` +
    out

  // Cleanup
  out = out.replace(/\n{3,}/g, "\n\n")

  return out
}

/**
 * Convert a fixture name to a valid JS identifier for imports.
 * 'use-input' → 'useInput', 'exit-on-exit-with-error' → 'exitOnExitWithError'
 */
function fixtureNameToIdent(name: string): string {
  return name.replace(/-(\w)/g, (_, c) => c.toUpperCase())
}

/**
 * Transform a PTY test file — applies the regular transform() first for all
 * common import rewrites, then adds PTY-specific transforms on top.
 */
function transformPtyTest(source: string, fileName: string, fixtureRefs: string[]): string {
  // First apply all the regular transforms (import rewrites, expected failures, etc.)
  let out = transform(source, fileName)

  // Remove the header that transform() added — we'll add our own
  out = out.replace(/^\/\*\*\n \* Auto-generated from ink\/test\/.*?\n \* DO NOT EDIT.*?\n \*\/\n/, "")

  // Replace term/run helper imports with create-term helper
  // (transform() removed these as "PTY — not available", so we add them back)
  const needsTerm = /from\s+['"]\.\/helpers\/term(?:\.js)?['"]/.test(source)
  const needsRun = /from\s+['"]\.\/helpers\/run(?:\.js)?['"]/.test(source)
  if (needsTerm) {
    out = out.replace(
      /(import type \{ ExecutionContext \} from "\.\.\/helpers\/ava-shim"\n)/,
      `$1import { termFixture } from "../helpers/create-term"\n`,
    )
  }
  if (needsRun) {
    out = out.replace(
      /(import type \{ ExecutionContext \} from "\.\.\/helpers\/ava-shim"\n)/,
      `$1import { runFixture } from "../helpers/create-term"\n`,
    )
  }

  // Remove node-pty imports
  out = out.replace(/.*require\('node-pty'\).*/g, "")
  out = out.replace(/.*import.*node-pty.*/g, "")
  out = out.replace(/const\s+require\s*=\s*createRequire.*\n?/g, "")
  out = out.replace(/import\s*\{?\s*createRequire\s*\}?\s*from\s*['"]node:module['"];?\n?/g, "")

  // Remove node:path and node:url imports (used for fixture paths with PTY)
  out = out.replace(/import\s+\*?\s*as\s*path\s+from\s*['"]node:path['"];?\n?/g, "")
  out = out.replace(/import\s+path\s+from\s*['"]node:path['"];?\n?/g, "")
  out = out.replace(/import\s+url\s+from\s*['"]node:url['"];?\n?/g, "")
  out = out.replace(/const\s+__dirname\s*=.*\n?/g, "")

  // Remove process import
  out = out.replace(/import\s+process\s+from\s*['"]node:process['"];?\n?/g, "")

  // Add fixture imports
  const fixtureImports = fixtureRefs
    .map((name) => `import { createFixture as ${fixtureNameToIdent(name)}Fixture } from "./fixtures/${name}"`)
    .join("\n")
  if (fixtureImports) {
    out = out.replace(/(import type \{ ExecutionContext \} from "\.\.\/helpers\/ava-shim"\n)/, `$1${fixtureImports}\n`)
  }

  // Replace term('name', ['arg']) → termFixture(nameFixture(['arg']))
  out = out.replace(/term\(\s*['"]([^'"]+)['"]\s*,\s*(\[[^\]]*\])\s*\)/g, (_match, name, args) => {
    return `termFixture(${fixtureNameToIdent(name)}Fixture(${args}))`
  })
  out = out.replace(/term\(\s*['"]([^'"]+)['"]\s*\)/g, (_match, name) => {
    return `termFixture(${fixtureNameToIdent(name)}Fixture([]))`
  })

  // Replace run('name', opts) → runFixture(nameFixture([]), cols)
  out = out.replace(/(?:await\s+)?run\(\s*['"]([^'"]+)['"]\s*(?:,\s*(\{[^}]*\}))?\s*\)/g, (_match, name, opts) => {
    let cols = "100"
    if (opts) {
      const colMatch = opts.match(/columns:\s*(\d+)/)
      if (colMatch) cols = colMatch[1]!
    }
    return `await runFixture(${fixtureNameToIdent(name)}Fixture([]), ${cols})`
  })

  // Replace FakeTimers.install() with vitest fake timers wrapped in a clock-like API
  out = out.replace(
    /FakeTimers\.install\(\)/g,
    "(() => { vi.useFakeTimers(); return { tick: (ms: number) => vi.advanceTimersByTime(ms), uninstall: () => vi.useRealTimers(), runAll: () => vi.runAllTimers(), countTimers: () => vi.getTimerCount() } })()",
  )

  // Replace stub(obj, 'method').callThrough() with vi.spyOn(obj, 'method')
  out = out.replace(/stub\((\w+),\s*['"](\w+)['"]\)\.callThrough\(\)/g, "vi.spyOn($1, '$2')")
  out = out.replace(/stub\((\w+),\s*['"](\w+)['"]\)/g, "vi.spyOn($1, '$2')")

  // Add vi import if FakeTimers or stub were used
  if (source.includes("FakeTimers") || source.includes("stub")) {
    out = out.replace(/(import test from "\.\.\/helpers\/ava-shim")/, 'import { vi } from "vitest"\n$1')
  }

  // Header + cleanup
  out =
    `/**\n * Auto-generated from ink/test/${fileName}.tsx\n * DO NOT EDIT — regenerate with: bun packages/ink/scripts/gen-vitest.ts\n */\n` +
    out

  out = out.replace(/\n{3,}/g, "\n\n")

  return out
}

// ---------------------------------------------------------------------------
// Process files
// ---------------------------------------------------------------------------

console.log("Ink → vitest codemod (ava-shim approach)\n")

if (!dryRun) {
  mkdirSync(OUT_DIR, { recursive: true })
  mkdirSync(FIXTURE_OUT_DIR, { recursive: true })
}

let generated = 0
let fixturesGenerated = 0
let skipped = 0
const skippedFiles: string[] = []

// First pass: collect fixture references from PTY/RUN test files
for (const fileName of filesToProcess) {
  if (!PTY_FILES.has(fileName) && !RUN_FILES.has(fileName)) continue
  const srcPath = join(INK_TEST_DIR, `${fileName}.tsx`)
  if (!existsSync(srcPath)) continue
  const source = await Bun.file(srcPath).text()
  collectFixtureRefs(source, fileName)
}

// Generate fixture modules
const generatedFixtures = new Set<string>()
for (const [fixtureName] of FIXTURE_USERS) {
  const fixtureSrc = join(INK_FIXTURE_DIR, `${fixtureName}.tsx`)
  const fixtureOut = join(FIXTURE_OUT_DIR, `${fixtureName}.tsx`)
  if (!existsSync(fixtureSrc)) {
    console.log(`  SKIP fixture ${fixtureName} — source not found`)
    continue
  }
  const source = await Bun.file(fixtureSrc).text()
  const transformed = transformFixture(source, fixtureName)
  if (dryRun) {
    console.log(`  DRY fixture/${fixtureName}.tsx (${transformed.split("\n").length} lines)`)
  } else {
    await Bun.write(fixtureOut, transformed)
    console.log(`  FIX ${fixtureName}.tsx`)
  }
  generatedFixtures.add(fixtureName)
  fixturesGenerated++
}

// Main pass: process test files
for (const fileName of filesToProcess) {
  const srcPath = join(INK_TEST_DIR, `${fileName}.tsx`)
  const outPath = join(OUT_DIR, `${fileName}.test.tsx`)

  if (!existsSync(srcPath)) {
    console.log(`  SKIP ${fileName} — source not found`)
    skipped++
    skippedFiles.push(fileName)
    continue
  }

  if (INTERNAL_FILES.has(fileName)) {
    console.log(`  SKIP ${fileName} — uses internal ink APIs`)
    skipped++
    skippedFiles.push(fileName)
    continue
  }

  if (KITTY_FILES.has(fileName)) {
    console.log(`  SKIP ${fileName} — uses kitty keyboard internals`)
    skipped++
    skippedFiles.push(fileName)
    continue
  }

  const source = await Bun.file(srcPath).text()
  let transformed: string

  if (PTY_FILES.has(fileName) || RUN_FILES.has(fileName)) {
    // PTY/RUN test files: use the PTY transform that replaces term()/run() with termFixture()/runFixture()
    const fixtureRefs = collectFixtureRefs(source, fileName)
    transformed = transformPtyTest(source, fileName, fixtureRefs)
    console.log(`  GEN ${fileName}.test.tsx (PTY→termless, fixtures: ${fixtureRefs.join(", ")})`)
  } else {
    transformed = transform(source, fileName)
    if (dryRun) {
      console.log(`  DRY ${fileName}.test.tsx (${transformed.split("\n").length} lines)`)
    } else {
      console.log(`  GEN ${fileName}.test.tsx`)
    }
  }

  if (!dryRun) {
    await Bun.write(outPath, transformed)
  }
  generated++
}

console.log(`\n${generated} test files generated, ${fixturesGenerated} fixtures generated, ${skipped} skipped`)
if (skippedFiles.length > 0) {
  console.log(`Skipped: ${skippedFiles.join(", ")}`)
}

if (!dryRun && generated > 0) {
  console.log(`\nOutput: ${OUT_DIR}`)
  console.log(`Run: bun vitest run --project vendor tests/compat/ink/generated/`)
}
