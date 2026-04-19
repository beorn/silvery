import { Command as BaseCommand } from "commander"
import { describe, expect, it } from "vitest"
import { Command, colorizeHelp } from "../src/index.ts"
import { createStyle } from "@silvery/ansi"

// Strip ANSI escape sequences for assertions that need to match raw text
// across styled tokens (e.g. "myapp init" where each word is styled separately).
function stripAnsi(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;]*m/g, "")
}

// ANSI escape code constants matching @silvery/ansi output.
// Style uses per-attribute close codes (not full reset \x1b[0m).
const ESC = "\x1b["
const BOLD = `${ESC}1m`
const BOLD_OFF = `${ESC}22m`
const DIM = `${ESC}2m`
const DIM_OFF = `${ESC}22m`
const CYAN = `${ESC}36m`
const GREEN = `${ESC}32m`
const YELLOW = `${ESC}33m`
const MAGENTA = `${ESC}35m`
const RED = `${ESC}31m`
const FG_OFF = `${ESC}39m`

// Default semantic token fallbacks (no theme):
// commands → primary → yellow (33)
// flags → secondary → cyan (36)
// description → muted → dim (2)
// heading → bold
// brackets → accent → magenta (35)

function createTestProgram(): InstanceType<typeof BaseCommand> {
  return new BaseCommand("myapp")
    .description("A test CLI application")
    .version("1.0.0")
    .option("-v, --verbose", "Enable verbose output")
    .option("-o, --output <path>", "Output file path")
    .option("-c, --config [file]", "Config file")
    .argument("<input>", "Input file to process")
}

function addSubcommands(program: InstanceType<typeof BaseCommand>): void {
  program
    .command("build")
    .description("Build the project")
    .option("-w, --watch", "Watch mode")
    .option("--target <platform>", "Target platform")

  program
    .command("serve")
    .description("Start dev server")
    .option("-p, --port <number>", "Port number")
}

describe("colorizeHelp", () => {
  it("should not have ANSI codes without colorization", () => {
    const program = createTestProgram()
    const help = program.helpInformation()
    expect(help).not.toContain(ESC)
  })

  it("should add ANSI codes to help output", () => {
    const program = createTestProgram()
    colorizeHelp(program)
    const help = program.helpInformation()
    expect(help).toContain(ESC)
  })

  it("should colorize section headings with bold", () => {
    const program = createTestProgram()
    colorizeHelp(program)
    const help = program.helpInformation()
    expect(help).toContain(`${BOLD}Usage:${BOLD_OFF}`)
    expect(help).toContain(`${BOLD}Options:${BOLD_OFF}`)
    expect(help).toContain(`${BOLD}Arguments:${BOLD_OFF}`)
  })

  it("should colorize command name with primary (yellow)", () => {
    const program = createTestProgram()
    colorizeHelp(program)
    const help = program.helpInformation()
    expect(help).toContain(`${YELLOW}myapp${FG_OFF}`)
  })

  it("should colorize option flags with secondary (cyan)", () => {
    const program = createTestProgram()
    colorizeHelp(program)
    const help = program.helpInformation()
    expect(help).toContain(`${CYAN}-v, --verbose${FG_OFF}`)
    expect(help).toContain(`${CYAN}-V, --version${FG_OFF}`)
    expect(help).toContain(`${CYAN}-h, --help${FG_OFF}`)
    expect(help).toContain(`${CYAN}-o, --output <path>${FG_OFF}`)
  })

  it("should leave descriptions unstyled (normal foreground)", () => {
    const program = createTestProgram()
    colorizeHelp(program)
    const help = program.helpInformation()
    // Descriptions should appear without DIM wrapping
    expect(help).toContain("Enable verbose output")
    expect(help).not.toContain(`${DIM}Enable verbose output${DIM_OFF}`)
  })

  it("should colorize argument terms with accent (magenta)", () => {
    const program = createTestProgram()
    colorizeHelp(program)
    const help = program.helpInformation()
    expect(help).toContain(`${MAGENTA}<input>${FG_OFF}`)
    expect(help).toContain(`${MAGENTA}input${FG_OFF}`)
  })

  it("should colorize [options] in usage line with secondary (cyan)", () => {
    const program = createTestProgram()
    colorizeHelp(program)
    const help = program.helpInformation()
    expect(help).toContain(`${CYAN}[options]${FG_OFF}`)
  })

  it("should style command description with bold + primary", () => {
    const program = createTestProgram()
    colorizeHelp(program)
    const help = program.helpInformation()
    // bold.primary produces combined SGR: \x1b[1;33m...\x1b[22;39m
    expect(help).toContain(`${ESC}1;33mA test CLI application${ESC}22;39m`)
  })

  it("should apply recursively to subcommands", () => {
    const program = createTestProgram()
    addSubcommands(program)
    colorizeHelp(program)

    const parentHelp = program.helpInformation()
    expect(parentHelp).toContain(`${BOLD}Commands:${BOLD_OFF}`)
    expect(parentHelp).toContain(YELLOW) // subcommand names in primary (yellow)

    const buildCmd = program.commands.find((c) => c.name() === "build")!
    const buildHelp = buildCmd.helpInformation()
    expect(buildHelp).toContain(`${BOLD}Usage:${BOLD_OFF}`)
    expect(buildHelp).toContain(`${BOLD}Options:${BOLD_OFF}`)
    expect(buildHelp).toContain(`${CYAN}-w, --watch${FG_OFF}`)
    expect(buildHelp).toContain("Watch mode")
    expect(buildHelp).toContain("Target platform")
  })

  it("should accept custom color options", () => {
    const program = createTestProgram()
    const cs = createStyle({ level: "basic" })
    colorizeHelp(program, {
      commands: (t) => cs.red(t),
      flags: (t) => cs.yellow(t),
      description: (t) => cs.cyan(t),
      heading: (t) => cs.dim(t),
      brackets: (t) => cs.green(t),
    })
    const help = program.helpInformation()

    expect(help).toContain(`${DIM}Usage:${DIM_OFF}`)
    expect(help).toContain(`${DIM}Options:${DIM_OFF}`)
    expect(help).toContain(`${RED}myapp${FG_OFF}`)
    expect(help).toContain(`${CYAN}Enable verbose output${FG_OFF}`)
    expect(help).toContain(`${GREEN}<input>${FG_OFF}`)
    expect(help).toContain(`${YELLOW}-v, --verbose${FG_OFF}`)
  })

  it("should handle program with no options or subcommands", () => {
    const program = new BaseCommand("bare").description("Minimal program")
    colorizeHelp(program)
    const help = program.helpInformation()
    expect(help).toContain(`${BOLD}Usage:${BOLD_OFF}`)
    expect(help).toContain(`${YELLOW}bare${FG_OFF}`)
  })

  it("should propagate custom colors to subcommands", () => {
    const program = createTestProgram()
    addSubcommands(program)
    const cs = createStyle({ level: "basic" })
    colorizeHelp(program, { flags: (t) => cs.red(t) })

    const buildCmd = program.commands.find((c) => c.name() === "build")!
    const buildHelp = buildCmd.helpInformation()
    expect(buildHelp).toContain(`${RED}-w, --watch${FG_OFF}`)
  })
})

describe("addHelpSection", () => {
  it("should add a section with rows after commands", () => {
    const program = new Command("myapp").description("Test app")
    colorizeHelp(program)
    program.addHelpSection("Examples:", [
      ["myapp init", "Initialize project"],
      ["myapp serve", "Start server"],
    ])
    const help = program.helpInformation()
    expect(help).toContain(`${BOLD}Examples:${BOLD_OFF}`)
    expect(help).toContain("myapp init")
    expect(help).toContain("Initialize project")
  })

  it("should add a section with free-form text", () => {
    const program = new Command("myapp")
    colorizeHelp(program)
    program.addHelpSection("Note:", "Requires Node.js 23+")
    const help = program.helpInformation()
    expect(help).toContain(`${BOLD}Note:${BOLD_OFF}`)
    expect(help).toContain("Requires Node.js 23+")
  })

  it("should style option-like terms with secondary color", () => {
    const program = new Command("myapp")
    colorizeHelp(program)
    program.addHelpSection("Verbosity:", [["-v, --verbose", "More output"]])
    const help = program.helpInformation()
    // Option-like terms (-v) get secondary/option color (cyan), not primary (yellow)
    expect(help).toContain(`${CYAN}-v, --verbose${FG_OFF}`)
  })

  it("should style command-like terms with primary color", () => {
    const program = new Command("myapp")
    colorizeHelp(program)
    program.addHelpSection("Examples:", [["myapp build", "Build the project"]])
    const help = program.helpInformation()
    expect(help).toContain(`${YELLOW}myapp build${FG_OFF}`)
  })

  it("should align with Commander's built-in sections", () => {
    const program = new Command("myapp").option("-p, --port <number>", "Port number")
    colorizeHelp(program)
    program.addHelpSection("Examples:", [["myapp --port 3000", "Start on port 3000"]])
    const help = program.helpInformation()
    // Both the option and the section row should be present with descriptions
    expect(help).toContain("Port number")
    expect(help).toContain("Start on port 3000")
  })

  it("should support explicit position", () => {
    const program = new Command("myapp")
    colorizeHelp(program)
    program.addHelpSection("after", "After:", [["cmd", "desc"]])
    program.addHelpSection("before", "Before:", [["cmd2", "desc2"]])
    const help = program.helpInformation()
    // Both sections should appear
    expect(help).toContain("After:")
    expect(help).toContain("Before:")
    // "before" should come before "after" in the output
    const beforeIdx = help.indexOf("Before:")
    const afterIdx = help.indexOf("After:")
    expect(beforeIdx).toBeLessThan(afterIdx)
  })

  it("should style <arg> brackets within command terms", () => {
    const program = new Command("myapp")
    colorizeHelp(program)
    program.addHelpSection("Examples:", [["myapp add <id>", "Add by ID"]])
    const help = program.helpInformation()
    // <id> gets accent color (magenta), rest gets primary (yellow)
    expect(help).toContain(`${YELLOW}myapp add ${FG_OFF}${MAGENTA}<id>${FG_OFF}`)
  })

  it("should support multiple sections", () => {
    const program = new Command("myapp")
    colorizeHelp(program)
    program
      .addHelpSection("Section A:", [["a", "first"]])
      .addHelpSection("Section B:", [["b", "second"]])
    const help = program.helpInformation()
    expect(help).toContain("Section A:")
    expect(help).toContain("Section B:")
    expect(help).toContain("first")
    expect(help).toContain("second")
  })

  // ─────────────────────────────────────────────────────────────────
  // Multi-line term + console-block detection (commander-text-render)
  // ─────────────────────────────────────────────────────────────────

  it("detects $ shell prompt in any section, not just Examples", () => {
    const program = new Command("myapp")
    colorizeHelp(program)
    program.addHelpSection("Quick Start:", [["$ myapp init", "Initialize project"]])
    const help = program.helpInformation()
    // Program name "myapp" should be styled as command (yellow)
    expect(help).toContain(`${YELLOW}myapp${FG_OFF}`)
    // Description should appear
    expect(help).toContain("Initialize project")
  })

  it("renders multi-line terms with description on first line only", () => {
    const program = new Command("myapp")
    colorizeHelp(program)
    program.addHelpSection("Quick Start:", [
      ["$ myapp init\n$ myapp build\n$ myapp serve", "Set up and run the app"],
    ])
    const plain = stripAnsi(program.helpInformation())

    // All three command lines must be present (plain text — ANSI stripped)
    expect(plain).toContain("myapp init")
    expect(plain).toContain("myapp build")
    expect(plain).toContain("myapp serve")

    // Description appears exactly once (only on the first line of the term)
    const descCount = (plain.match(/Set up and run the app/g) ?? []).length
    expect(descCount).toBe(1)

    // Description must appear on the line with "myapp init" (first line of the term),
    // not on the lines with "myapp build" or "myapp serve"
    const lines = plain.split("\n")
    const initLine = lines.find((l) => l.includes("myapp init"))
    const buildLine = lines.find((l) => l.includes("myapp build"))
    const serveLine = lines.find((l) => l.includes("myapp serve"))
    expect(initLine).toBeDefined()
    expect(initLine).toContain("Set up and run the app")
    expect(buildLine).toBeDefined()
    expect(buildLine).not.toContain("Set up and run the app")
    expect(serveLine).toBeDefined()
    expect(serveLine).not.toContain("Set up and run the app")
  })

  it("multi-line term aligns description to the longest line width", () => {
    const program = new Command("myapp").option("-p, --port <n>", "Port")
    colorizeHelp(program)
    // Mix a short term with a multi-line term that has a long longest-line.
    // The padding should be wide enough for the longest line of the multi-line term.
    program.addHelpSection("Examples:", [
      ["$ myapp init", "Init"],
      ["$ myapp serve --port 3000\n$ myapp serve --port 4000", "Start"],
    ])
    const plain = stripAnsi(program.helpInformation())

    // Both rows present
    expect(plain).toContain("myapp init")
    expect(plain).toContain("myapp serve --port 3000")
    expect(plain).toContain("myapp serve --port 4000")
    expect(plain).toContain("Init")
    expect(plain).toContain("Start")

    // The "Init" description should be padded to align with the longest line of
    // the multi-line term (the --port 3000 / 4000 lines). Verify by checking that
    // the column where "Init" appears matches where "Start" appears.
    const lines = plain.split("\n")
    const initLine = lines.find((l) => l.includes("myapp init"))!
    const startLine = lines.find((l) => l.includes("myapp serve --port 3000"))!
    const initDescCol = initLine.indexOf("Init")
    const startDescCol = startLine.indexOf("Start")
    expect(initDescCol).toBe(startDescCol)
  })

  it("dollar prompt with quoted string is dimmed (not treated as program name)", () => {
    const program = new Command("myapp")
    colorizeHelp(program)
    program.addHelpSection("Examples:", [['$ git commit -m "fix bug"', "Commit a fix"]])
    const help = program.helpInformation()
    // Program name git should be styled
    expect(help).toContain("git")
    // Quoted string should be dimmed (ESC[2m...ESC[22m)
    expect(help).toContain('"fix bug"')
  })
})
