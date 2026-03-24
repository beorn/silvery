#!/usr/bin/env bun
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
  const { resolve } = await import("node:path")
  const examplesDir = resolve(new URL(".", import.meta.url).pathname, "../examples")
  const results: Example[] = []

  for (const dir of CATEGORY_DIRS) {
    const category = CATEGORY_DISPLAY[dir] ?? dir.charAt(0).toUpperCase() + dir.slice(1)
    const glob = new Bun.Glob("*.tsx")
    const dirPath = resolve(examplesDir, dir)

    try {
      for (const file of glob.scanSync({ cwd: dirPath })) {
        if (file.startsWith("_")) continue

        // Try to get meta from export, fall back to filename
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
${BOLD}${YELLOW}silvery${RESET} — React framework for modern terminal UIs

${BOLD}Usage:${RESET}
  bunx silvery ${DIM}<name>${RESET}             Run an example by name (fuzzy match)
  bunx silvery examples            List all available examples
  bunx silvery doctor              Check terminal capabilities
  bunx silvery --help              Show this help
  bunx silvery --version           Show version

${BOLD}Quick start:${RESET}
  bunx silvery dashboard           Responsive layout demo
  bunx silvery kanban              Kanban board with keyboard nav
  bunx silvery counter             Simple counter (Hello World)
  bunx silvery textarea            Rich text editor

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

  console.log(`\n  ${DIM}Run: bunx silvery <name>${RESET}\n`)
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

  console.error(`\n${DIM}Run ${BOLD}bunx silvery examples${RESET}${DIM} for full list.${RESET}\n`)
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

  const proc = Bun.spawn(["bun", "run", match.file], {
    stdio: ["inherit", "inherit", "inherit"],
  })
  const exitCode = await proc.exited
  process.exit(exitCode)
}

async function doctorCommand(): Promise<void> {
  // Run the built-in termtest diagnostic
  const { resolve } = await import("node:path")
  const termtestPath = resolve(new URL(".", import.meta.url).pathname, "../packages/ag-term/src/termtest.ts")

  try {
    const proc = Bun.spawn(["bun", "run", termtestPath], {
      stdio: ["inherit", "inherit", "inherit"],
    })
    const exitCode = await proc.exited
    process.exit(exitCode)
  } catch {
    console.error(`${RED}Error:${RESET} Could not run terminal diagnostics.`)
    console.error(`${DIM}Try: bun run ${termtestPath}${RESET}`)
    process.exit(1)
  }
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
    case "list":
      await exampleCommand(subArgs)
      break
    case "doctor":
    case "diag":
    case "check":
      await doctorCommand()
      break
    default:
      // "bunx silvery dashboard" → treat as "bunx silvery example dashboard"
      await exampleCommand(args)
      break
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
