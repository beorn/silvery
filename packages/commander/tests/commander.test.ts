import { Command } from "commander"
import { describe, expect, it } from "vitest"
import { colorizeHelp } from "../src/index.ts"
import { createStyle } from "@silvery/ansi"

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
const RED = `${ESC}31m`
const FG_OFF = `${ESC}39m`

function createTestProgram(): InstanceType<typeof Command> {
  return new Command("myapp")
    .description("A test CLI application")
    .version("1.0.0")
    .option("-v, --verbose", "Enable verbose output")
    .option("-o, --output <path>", "Output file path")
    .option("-c, --config [file]", "Config file")
    .argument("<input>", "Input file to process")
}

function addSubcommands(program: InstanceType<typeof Command>): void {
  program
    .command("build")
    .description("Build the project")
    .option("-w, --watch", "Watch mode")
    .option("--target <platform>", "Target platform")

  program.command("serve").description("Start dev server").option("-p, --port <number>", "Port number")
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

  it("should colorize the command name with cyan", () => {
    const program = createTestProgram()
    colorizeHelp(program)
    const help = program.helpInformation()
    expect(help).toContain(`${CYAN}myapp${FG_OFF}`)
  })

  it("should colorize option flags with green", () => {
    const program = createTestProgram()
    colorizeHelp(program)
    const help = program.helpInformation()
    // Option terms are wrapped in green via styleOptionText
    expect(help).toContain(`${GREEN}-v, --verbose${FG_OFF}`)
    expect(help).toContain(`${GREEN}-V, --version${FG_OFF}`)
    expect(help).toContain(`${GREEN}-h, --help${FG_OFF}`)
    // Options with arguments include the arg in the green wrapping
    expect(help).toContain(`${GREEN}-o, --output <path>${FG_OFF}`)
  })

  it("should colorize descriptions with dim", () => {
    const program = createTestProgram()
    colorizeHelp(program)
    const help = program.helpInformation()
    expect(help).toContain(`${DIM}Enable verbose output${DIM_OFF}`)
    expect(help).toContain(`${DIM}Output file path${DIM_OFF}`)
    expect(help).toContain(`${DIM}Config file${DIM_OFF}`)
  })

  it("should colorize argument terms with yellow via styleArgumentText", () => {
    const program = createTestProgram()
    colorizeHelp(program)
    const help = program.helpInformation()
    // <input> in the usage line is colorized as an argument
    expect(help).toContain(`${YELLOW}<input>${FG_OFF}`)
    // The argument term "input" in the Arguments section
    expect(help).toContain(`${YELLOW}input${FG_OFF}`)
  })

  it("should colorize [options] in usage line with green (option text)", () => {
    const program = createTestProgram()
    colorizeHelp(program)
    const help = program.helpInformation()
    // Commander's default styleUsage delegates [options] to styleOptionText
    expect(help).toContain(`${GREEN}[options]${FG_OFF}`)
  })

  it("should keep command description unstyled", () => {
    const program = createTestProgram()
    colorizeHelp(program)
    const help = program.helpInformation()
    // The program description should appear but NOT be wrapped in DIM
    expect(help).toContain("A test CLI application")
    expect(help).not.toContain(`${DIM}A test CLI application${DIM_OFF}`)
  })

  it("should apply recursively to subcommands", () => {
    const program = createTestProgram()
    addSubcommands(program)
    colorizeHelp(program)

    // Parent help has colorized subcommand list
    const parentHelp = program.helpInformation()
    expect(parentHelp).toContain(`${BOLD}Commands:${BOLD_OFF}`)
    expect(parentHelp).toContain(CYAN) // subcommand names in cyan

    // Subcommand help is also colorized
    const buildCmd = program.commands.find((c) => c.name() === "build")!
    const buildHelp = buildCmd.helpInformation()
    expect(buildHelp).toContain(`${BOLD}Usage:${BOLD_OFF}`)
    expect(buildHelp).toContain(`${BOLD}Options:${BOLD_OFF}`)
    expect(buildHelp).toContain(`${GREEN}-w, --watch${FG_OFF}`)
    expect(buildHelp).toContain(`${DIM}Watch mode${DIM_OFF}`)
    expect(buildHelp).toContain(`${DIM}Target platform${DIM_OFF}`)
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

    // Headings use custom dim instead of default bold
    expect(help).toContain(`${DIM}Usage:${DIM_OFF}`)
    expect(help).toContain(`${DIM}Options:${DIM_OFF}`)

    // Command name uses red instead of default cyan
    expect(help).toContain(`${RED}myapp${FG_OFF}`)

    // Descriptions use cyan instead of default dim
    expect(help).toContain(`${CYAN}Enable verbose output${FG_OFF}`)

    // Arguments use green instead of default yellow
    expect(help).toContain(`${GREEN}<input>${FG_OFF}`)

    // Flags use yellow instead of default green
    expect(help).toContain(`${YELLOW}-v, --verbose${FG_OFF}`)
  })

  it("should handle program with no options or subcommands", () => {
    const program = new Command("bare").description("Minimal program")
    colorizeHelp(program)
    const help = program.helpInformation()
    expect(help).toContain(`${BOLD}Usage:${BOLD_OFF}`)
    expect(help).toContain(`${CYAN}bare${FG_OFF}`)
  })

  it("should propagate custom colors to subcommands", () => {
    const program = createTestProgram()
    addSubcommands(program)
    const cs = createStyle({ level: "basic" })
    colorizeHelp(program, { flags: (t) => cs.red(t) })

    const buildCmd = program.commands.find((c) => c.name() === "build")!
    const buildHelp = buildCmd.helpInformation()
    // Subcommand options use the custom RED for flags
    expect(buildHelp).toContain(`${RED}-w, --watch${FG_OFF}`)
  })
})
