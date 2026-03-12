#!/usr/bin/env bun
/**
 * silvery CLI
 *
 * Usage:
 *   silvery example              — list all available examples
 *   silvery example <name>       — run an example by name (fuzzy match)
 *   silvery example --list       — list all available examples
 *   silvery --help               — show usage help
 *
 * Designed for: bunx silvery example <name>
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
// Auto-Discovery (mirrors examples/cli.ts)
// =============================================================================

const CATEGORY_DIRS = ["layout", "interactive", "runtime", "inline", "kitty"] as const

const CATEGORY_DISPLAY: Record<string, string> = {
  kitty: "Kitty Protocol",
}

const CATEGORY_ORDER: Record<string, number> = {
  Layout: 0,
  Interactive: 1,
  Runtime: 2,
  Inline: 3,
  "Kitty Protocol": 4,
}

const CATEGORY_COLOR: Record<string, string> = {
  Layout: MAGENTA,
  Interactive: CYAN,
  Runtime: GREEN,
  Inline: YELLOW,
  "Kitty Protocol": BLUE,
}

async function discoverExamples(): Promise<Example[]> {
  const { resolve } = await import("node:path")
  const examplesDir = resolve(new URL(".", import.meta.url).pathname, "../examples")
  const results: Example[] = []

  for (const dir of CATEGORY_DIRS) {
    const category = CATEGORY_DISPLAY[dir] ?? dir.charAt(0).toUpperCase() + dir.slice(1)
    const glob = new Bun.Glob("*.tsx")
    const dirPath = resolve(examplesDir, dir)

    for (const file of glob.scanSync({ cwd: dirPath })) {
      if (file.startsWith("_")) continue

      try {
        const mod = await import(resolve(dirPath, file))
        if (!mod.meta?.name) continue

        results.push({
          name: mod.meta.name,
          description: mod.meta.description ?? "",
          file: resolve(dirPath, file),
          category,
          features: mod.meta.features,
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
// Formatting
// =============================================================================

function printHelp(): void {
  console.log(`
${BOLD}${YELLOW}silvery${RESET} — React framework for modern terminal UIs

${BOLD}Usage:${RESET}
  silvery example              List all available examples
  silvery example ${DIM}<name>${RESET}       Run an example by name (fuzzy match)
  silvery example --list       List all available examples
  silvery --help               Show this help
  silvery --version            Show version

${BOLD}Examples:${RESET}
  bunx silvery example todo        Run the Todo App example
  bunx silvery example kanban      Run the Kanban Board example
  bunx silvery example dashboard   Run the Dashboard example

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
    const descStr = `${DIM}${ex.description}${RESET}`
    console.log(`    ${nameStr}  ${descStr}`)
  }

  console.log(`\n  ${DIM}Run an example: bunx silvery example <name>${RESET}\n`)
}

function findExample(examples: Example[], query: string): Example | undefined {
  const q = query.toLowerCase()

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

  console.error(`\n${DIM}Run ${BOLD}bunx silvery example${RESET}${DIM} for full list with descriptions.${RESET}\n`)
}

// =============================================================================
// Subcommands
// =============================================================================

async function exampleCommand(args: string[]): Promise<void> {
  if (args.includes("--help") || args.includes("-h")) {
    printHelp()
    return
  }

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

  const proc = Bun.spawn(["bun", "run", match.file], {
    stdio: ["inherit", "inherit", "inherit"],
  })
  const exitCode = await proc.exited
  process.exit(exitCode)
}

// =============================================================================
// Main
// =============================================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2)

  // Top-level flags
  if (args.includes("--help") || args.includes("-h") || args.length === 0) {
    printHelp()
    return
  }

  if (args.includes("--version") || args.includes("-v")) {
    try {
      const { resolve } = await import("node:path")
      const pkgPath = resolve(new URL(".", import.meta.url).pathname, "../package.json")
      const pkg = await Bun.file(pkgPath).json()
      console.log(`silvery ${pkg.version}`)
    } catch {
      console.log("silvery (version unknown)")
    }
    return
  }

  const subcommand = args[0]
  const subArgs = args.slice(1)

  switch (subcommand) {
    case "example":
    case "examples":
    case "demo":
      await exampleCommand(subArgs)
      break
    default:
      // If user types "silvery todo", treat it as "silvery example todo"
      await exampleCommand(args)
      break
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
