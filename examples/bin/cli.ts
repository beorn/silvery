#!/usr/bin/env node
/**
 * silvery CLI
 *
 * Usage:
 *   bunx silvery                     — show help
 *   bunx silvery <name>              — run an example by name (fuzzy match)
 *   bunx silvery examples            — list all available examples
 *   bunx silvery doctor              — check terminal capabilities
 *   bunx silvery --help              — show usage help
 *
 * Console hygiene: silvery's run() now activates Output with bufferStderr
 * by default (km-silvery.console-hygiene-default). debug() / console.foo
 * / raw stderr writes are buffered during alt-screen and replayed to the
 * normal terminal on exit. No per-CLI guard needed; loggily's LOG_LEVEL
 * still defaults to a sane value so info/debug don't fire when nothing
 * is listening.
 */
if (!process.env.LOG_LEVEL) process.env.LOG_LEVEL = "error"

// =============================================================================
// ANSI helpers (no deps — must work before anything is imported)
// =============================================================================

const RESET = "\x1b[0m"
const BOLD = "\x1b[1m"
const DIM = "\x1b[2m"
const RED = "\x1b[31m"
const GREEN = "\x1b[32m"
const YELLOW = "\x1b[33m"
const BLUE = "\x1b[34m"
const MAGENTA = "\x1b[35m"
const CYAN = "\x1b[36m"
const WHITE = "\x1b[37m"

// =============================================================================
// Static Registry
// =============================================================================

import { REGISTRY, type RegistryEntry } from "./registry.ts"

interface Example {
  name: string
  main: () => Promise<void> | void
  description: string
  category: string
}

const CATEGORY_ORDER: Record<string, number> = {
  Components: 0,
  Apps: 1,
  Layout: 2,
}

const CATEGORY_COLOR: Record<string, string> = {
  Components: GREEN,
  Apps: CYAN,
  Layout: MAGENTA,
}

function getExamples(): Example[] {
  return REGISTRY.map((e: RegistryEntry) => ({
    name: e.name,
    main: e.main,
    description: e.description ?? "",
    category: e.category,
  })).sort((a, b) => {
    const catDiff = (CATEGORY_ORDER[a.category] ?? 99) - (CATEGORY_ORDER[b.category] ?? 99)
    if (catDiff !== 0) return catDiff
    return a.name.localeCompare(b.name)
  })
}

// =============================================================================
// Formatting
// =============================================================================

function printHelp(): void {
  console.log(`
${BOLD}${YELLOW}@silvery/examples${RESET} — Try silvery without installing

${BOLD}Usage:${RESET}
  bunx @silvery/examples ${DIM}<name>${RESET}    Run an example by name (fuzzy match)
  bunx @silvery/examples            List all available examples
  bunx @silvery/examples --help     Show this help

${BOLD}Quick start:${RESET}
  bunx @silvery/examples counter    Simple counter (Hello World)
  bunx @silvery/examples dashboard  Responsive layout demo
  bunx @silvery/examples kanban     Kanban board with keyboard nav
  bunx @silvery/examples textarea   Rich text editor

${DIM}Documentation: https://silvery.dev${RESET}
`)
}

function printExampleList(examples: Example[]): void {
  console.log(`\n${BOLD}${YELLOW} silvery${RESET}${DIM} examples${RESET}\n`)

  let currentCategory = ""

  for (const ex of examples) {
    if (ex.category !== currentCategory) {
      currentCategory = ex.category
      const color = CATEGORY_COLOR[currentCategory] ?? WHITE
      console.log(`  ${color}${BOLD}${currentCategory}${RESET}`)
    }

    const nameStr = `${BOLD}${WHITE}${ex.name}${RESET}`
    const descStr = ex.description ? `${DIM}${ex.description}${RESET}` : ""
    console.log(`    ${nameStr}  ${descStr}`)
  }

  console.log(`\n  ${DIM}Run: bunx @silvery/examples <name>${RESET}\n`)
}

function findExample(examples: Example[], query: string): Example | undefined {
  const q = query.toLowerCase().replace(/-/g, " ")

  const exact = examples.find((ex) => ex.name.toLowerCase() === q)
  if (exact) return exact

  const prefix = examples.find((ex) => ex.name.toLowerCase().startsWith(q))
  if (prefix) return prefix

  const substring = examples.find((ex) => ex.name.toLowerCase().includes(q))
  if (substring) return substring

  return undefined
}

function printNoMatch(query: string, examples: Example[]): void {
  console.error(`\n${RED}${BOLD}Error:${RESET} No example matching "${query}"\n`)
  console.error(`${DIM}Available examples:${RESET}`)

  for (const ex of examples) {
    console.error(`  ${WHITE}${ex.name}${RESET}`)
  }

  console.error(`\n${DIM}Run ${BOLD}bunx @silvery/examples${RESET}${DIM} for full list.${RESET}\n`)
}

// =============================================================================
// Subcommands
// =============================================================================

async function exampleCommand(args: string[]): Promise<void> {
  const examples = getExamples()

  if (args.length === 0 || args[0] === "--list" || args[0] === "-l") {
    printExampleList(examples)
    return
  }

  const query = args.filter((a) => !a.startsWith("--")).join(" ")
  if (!query) {
    printExampleList(examples)
    return
  }

  const match = findExample(examples, query)
  if (!match) {
    printNoMatch(query, examples)
    process.exit(1)
  }

  console.log(`${DIM}Running ${BOLD}${match.name}${RESET}${DIM}...${RESET}\n`)

  await match.main()
}

async function doctorCommand(): Promise<void> {
  const { resolve, dirname } = await import("node:path")
  const { fileURLToPath } = await import("node:url")
  const __dirname = dirname(fileURLToPath(import.meta.url))

  const candidates = [
    resolve(__dirname, "../../ag-term/src/termtest.ts"),
    resolve(__dirname, "../node_modules/@silvery/ag-term/src/termtest.ts"),
  ]

  for (const termtestPath of candidates) {
    try {
      const { stat } = await import("node:fs/promises")
      await stat(termtestPath)
      const mod = await import(termtestPath)
      if (typeof mod.main === "function") {
        await mod.main()
      } else {
        // Fallback: module runs on import (legacy pattern)
      }
      return
    } catch {
      continue
    }
  }

  console.error(`${RED}Error:${RESET} Could not find terminal diagnostics.`)
  console.error(`${DIM}Make sure silvery is installed: npm install silvery${RESET}`)
  process.exit(1)
}

// =============================================================================
// Main
// =============================================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2)

  // Top-level flags
  if (args.includes("--help") || args.includes("-h")) {
    printHelp()
    return
  }

  // No args → list examples
  if (args.length === 0) {
    printExampleList(getExamples())
    return
  }

  if (args.includes("--version") || args.includes("-v")) {
    try {
      const { resolve, dirname } = await import("node:path")
      const { fileURLToPath } = await import("node:url")
      const { readFileSync } = await import("node:fs")
      const __dirname = dirname(fileURLToPath(import.meta.url))
      const pkgPath = resolve(__dirname, "../package.json")
      const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { version?: string }
      console.log(`@silvery/examples ${pkg.version}`)
    } catch {
      console.log("@silvery/examples (version unknown)")
    }
    return
  }

  // "bunx @silvery/examples counter" → run counter example directly
  // "bunx @silvery/examples" → list (handled above by args.length === 0)
  await exampleCommand(args)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
