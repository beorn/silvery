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
 */

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
// Auto-Discovery
// =============================================================================

const CATEGORY_DIRS = ["components", "apps", "layout", "runtime", "inline", "kitty"] as const

const CATEGORY_DISPLAY: Record<string, string> = {
  kitty: "Kitty Protocol",
}

const CATEGORY_ORDER: Record<string, number> = {
  Components: 0,
  Apps: 1,
  Layout: 2,
  Runtime: 3,
  Inline: 4,
  "Kitty Protocol": 5,
}

const CATEGORY_COLOR: Record<string, string> = {
  Components: GREEN,
  Apps: CYAN,
  Layout: MAGENTA,
  Runtime: BLUE,
  Inline: YELLOW,
  "Kitty Protocol": BLUE,
}

async function discoverExamples(): Promise<Example[]> {
  const { resolve, dirname } = await import("node:path")
  const { fileURLToPath } = await import("node:url")
  const { readdirSync } = await import("node:fs")
  const __dirname = dirname(fileURLToPath(import.meta.url))
  const examplesDir = resolve(__dirname, "..")
  const results: Example[] = []

  for (const dir of CATEGORY_DIRS) {
    const category = CATEGORY_DISPLAY[dir] ?? dir.charAt(0).toUpperCase() + dir.slice(1)
    const dirPath = resolve(examplesDir, dir)

    try {
      const files = readdirSync(dirPath).filter((f: string) => f.endsWith(".tsx") && !f.startsWith("_"))
      for (const file of files) {
        const name = file.replace(/\.tsx$/, "").replace(/-/g, " ")
        results.push({
          name,
          description: "",
          file: resolve(dirPath, file),
          category,
        })
      }
    } catch {
      // Directory doesn't exist — skip
    }
  }

  // Also scan aichat subdirectory
  const aichatDir = resolve(examplesDir, "apps/aichat")
  try {
    const indexFile = resolve(aichatDir, "index.tsx")
    const { stat } = await import("node:fs/promises")
    await stat(indexFile)
    results.push({
      name: "aichat",
      description: "AI Coding Agent demo",
      file: indexFile,
      category: "Apps",
    })
  } catch {
    // No aichat
  }

  results.sort((a, b) => {
    const catDiff = (CATEGORY_ORDER[a.category] ?? 99) - (CATEGORY_ORDER[b.category] ?? 99)
    if (catDiff !== 0) return catDiff
    return a.name.localeCompare(b.name)
  })

  return results
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
  const examples = await discoverExamples()

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

  const mod = await import(match.file)
  if (typeof mod.main === "function") {
    await mod.main()
  } else {
    console.error(`${RED}Error:${RESET} Example does not export a main() function`)
    process.exit(1)
  }
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
    const examples = await discoverExamples()
    printExampleList(examples)
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
