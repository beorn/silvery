import { describe, it, expect } from "vitest"
import { createCLI, TypedCommand } from "../src/index.ts"

describe("createCLI", () => {
  it("creates a command with colorized help", () => {
    const cli = createCLI("test-app").description("A test app")
    const help = cli.helpInformation()
    // Should contain ANSI escape codes (from colorizeHelp)
    expect(help).toContain("\x1b[")
  })

  it("returns typed opts for boolean flags", () => {
    const cli = createCLI("test").option("-v, --verbose", "Verbose output").option("-d, --debug", "Debug mode")

    cli.parse(["node", "test", "--verbose"], { from: "node" })
    const opts = cli.opts()

    expect(opts.verbose).toBe(true)
    expect(opts.debug).toBeUndefined()

    // Type check — these should compile without error:
    const _v: boolean | undefined = opts.verbose
    const _d: boolean | undefined = opts.debug
  })

  it("returns typed opts for string value flags", () => {
    const cli = createCLI("test").option("-p, --port <number>", "Port").option("-h, --host <addr>", "Host address")

    cli.parse(["node", "test", "--port", "3000", "--host", "localhost"], { from: "node" })
    const opts = cli.opts()

    expect(opts.port).toBe("3000")
    expect(opts.host).toBe("localhost")

    // Type check:
    const _p: string | undefined = opts.port
    const _h: string | undefined = opts.host
  })

  it("returns typed opts for optional value flags", () => {
    const cli = createCLI("test").option("-o, --output [path]", "Output path")

    cli.parse(["node", "test", "--output"], { from: "node" })
    const opts = cli.opts()

    // Optional flag without value → true
    expect(opts.output).toBe(true)

    // Type check:
    const _o: string | true | undefined = opts.output
  })

  it("handles default values", () => {
    const cli = createCLI("test").option("-p, --port <number>", "Port", "8080")

    cli.parse(["node", "test"], { from: "node" })
    const opts = cli.opts()

    expect(opts.port).toBe("8080")
  })

  it("handles kebab-case to camelCase", () => {
    const cli = createCLI("test").option("--dry-run", "Dry run mode")

    cli.parse(["node", "test", "--dry-run"], { from: "node" })
    const opts = cli.opts()

    expect(opts.dryRun).toBe(true)

    // Type check:
    const _dr: boolean | undefined = opts.dryRun
  })

  it("handles subcommands", () => {
    const cli = createCLI("test").description("Main app")
    const sub = cli.command("serve").option("-p, --port <number>", "Port")

    // Subcommand should also have colorized help
    const subHelp = sub.helpInformation()
    expect(subHelp).toContain("\x1b[")
  })

  it("chains fluently", () => {
    const cli = createCLI("test")
      .description("My app")
      .version("1.0.0")
      .option("-v, --verbose", "Verbose")
      .option("-p, --port <number>", "Port")
      .option("-o, --output [path]", "Output")

    // All methods return the same instance for chaining
    expect(cli).toBeInstanceOf(TypedCommand)
  })

  it("exposes underlying Commander command", () => {
    const cli = createCLI("test")
    expect(cli._cmd).toBeDefined()
    expect(cli._cmd.name()).toBe("test")
  })
})
