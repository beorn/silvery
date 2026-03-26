#!/usr/bin/env bun
/**
 * silvery demo CLI
 *
 * Lists and runs interactive demos from the examples/ directory.
 *
 * Usage:
 *   bun demo              — list all available demos grouped by category
 *   bun demo <name>       — run a specific demo by name (fuzzy match)
 *   bun demo --list       — same as no argument (list all)
 *   bun demo --help       — show usage help
 */

import { resolve } from "node:path"
import type { ExampleMeta } from "./_banner.js"

// =============================================================================
// Types
// =============================================================================

interface Example {
  name: string
  file: string
  description: string
  category: string
  features?: string[]
}

// =============================================================================
// Auto-Discovery (matches viewer.tsx pattern)
// =============================================================================

const CATEGORY_DIRS = ["components", "layout", "apps", "runtime", "inline", "kitty"] as const

const CATEGORY_DISPLAY: Record<string, string> = {
  kitty: "Kitty Protocol",
}

const CATEGORY_ORDER: Record<string, number> = {
  Components: 0,
  Layout: 1,
  Apps: 2,
  Runtime: 3,
  Inline: 4,
  "Kitty Protocol": 5,
}

async function discoverExamples(): Promise<Example[]> {
  const baseDir = new URL(".", import.meta.url).pathname
  const results: Example[] = []

  for (const dir of CATEGORY_DIRS) {
    const category = CATEGORY_DISPLAY[dir] ?? dir.charAt(0).toUpperCase() + dir.slice(1)
    const dirPath = resolve(baseDir, dir)
    const files = [
      ...new Bun.Glob("*.tsx").scanSync({ cwd: dirPath }),
      ...new Bun.Glob("*/index.tsx").scanSync({ cwd: dirPath }),
    ]

    for (const file of files) {
      if (file.startsWith("_")) continue // skip internal files

      try {
        const mod = await import(resolve(dirPath, file))
        if (!mod.meta?.name) continue

        const meta: ExampleMeta = mod.meta
        results.push({
          name: meta.name,
          description: meta.description ?? "",
          file: resolve(dirPath, file),
          category,
          features: meta.features,
        })
      } catch {
        // Skip files that fail to import
      }
    }
  }

  results.sort((a, b) => {
    const catDiff = (CATEGORY_ORDER[a.category] ?? 99) - (CATEGORY_ORDER[b.category] ?? 99)
    if (catDiff !== 0) return catDiff
    return a.name.localeCompare(b.name)
  })

  return results
}

// =============================================================================
// Formatting Helpers
// =============================================================================

// ANSI color codes for lightweight terminal output without importing silvery
const RESET = "\x1b[0m"
const BOLD = "\x1b[1m"
const DIM = "\x1b[2m"
const YELLOW = "\x1b[33m"
const CYAN = "\x1b[36m"
const GREEN = "\x1b[32m"
const MAGENTA = "\x1b[35m"
const BLUE = "\x1b[34m"
const RED = "\x1b[31m"
const WHITE = "\x1b[37m"

const CATEGORY_COLOR_CODE: Record<string, string> = {
  Components: GREEN,
  Layout: MAGENTA,
  Apps: CYAN,
  Runtime: GREEN,
  Inline: YELLOW,
  "Kitty Protocol": BLUE,
}

function printHelp(): void {
  console.log(`
${BOLD}${YELLOW}silvery demo${RESET} — browse and run interactive examples

${BOLD}Usage:${RESET}
  bun demo              List all available demos
  bun demo ${DIM}<name>${RESET}       Run a demo by name (case-insensitive, partial match)
  bun demo --list       List all available demos
  bun demo --help       Show this help

${BOLD}Examples:${RESET}
  bun demo dashboard    Run the Dashboard demo
  bun demo kanban       Run the Kanban Board demo
  bun demo scroll       Run the first demo matching "scroll"
`)
}

function printExampleList(examples: Example[]): void {
  console.log(`\n${BOLD}${YELLOW} silvery${RESET}${DIM} examples${RESET}\n`)

  let currentCategory = ""

  for (const ex of examples) {
    if (ex.category !== currentCategory) {
      currentCategory = ex.category
      const color = CATEGORY_COLOR_CODE[currentCategory] ?? WHITE
      console.log(`  ${color}${BOLD}${currentCategory}${RESET}`)
    }

    const nameStr = `${BOLD}${WHITE}${ex.name}${RESET}`
    const descStr = `${DIM}${ex.description}${RESET}`
    console.log(`    ${nameStr}  ${descStr}`)
  }

  console.log(`\n  ${DIM}Run a demo: bun demo <name>${RESET}\n`)
}

/** Find an example by name. Tries exact match first, then case-insensitive
 *  prefix match, then case-insensitive substring match. */
function findExample(examples: Example[], query: string): Example | undefined {
  const q = query.toLowerCase()

  // Exact match (case-insensitive)
  const exact = examples.find((ex) => ex.name.toLowerCase() === q)
  if (exact) return exact

  // Prefix match (case-insensitive)
  const prefix = examples.find((ex) => ex.name.toLowerCase().startsWith(q))
  if (prefix) return prefix

  // Substring match (case-insensitive)
  const substring = examples.find((ex) => ex.name.toLowerCase().includes(q))
  if (substring) return substring

  return undefined
}

function printNoMatch(query: string, examples: Example[]): void {
  console.error(`\n${RED}${BOLD}Error:${RESET} No demo matching "${query}"\n`)
  console.error(`${DIM}Available demos:${RESET}`)

  for (const ex of examples) {
    console.error(`  ${WHITE}${ex.name}${RESET}`)
  }

  console.error(
    `\n${DIM}Run ${BOLD}bun demo${RESET}${DIM} for full list with descriptions.${RESET}\n`,
  )
}

// =============================================================================
// Main
// =============================================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2)

  // Handle flags
  if (args.includes("--help") || args.includes("-h")) {
    printHelp()
    return
  }

  const examples = await discoverExamples()

  // No argument or --list: show the list
  if (args.length === 0 || args[0] === "--list") {
    printExampleList(examples)
    return
  }

  // Treat all non-flag arguments as the demo name query
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

  // Run the matched example
  console.log(`${DIM}Running ${BOLD}${match.name}${RESET}${DIM}...${RESET}\n`)

  const proc = Bun.spawn(["bun", "run", match.file], {
    stdio: ["inherit", "inherit", "inherit"],
  })
  const exitCode = await proc.exited
  process.exit(exitCode)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
