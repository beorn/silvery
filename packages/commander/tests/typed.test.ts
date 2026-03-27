import { describe, it, expect } from "vitest"
import { z } from "zod"
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

describe("custom parser", () => {
  it("parses with parseInt", () => {
    const cli = createCLI("test").option("-p, --port <n>", "Port", parseInt)
    cli.parse(["node", "test", "--port", "3000"], { from: "node" })
    const opts = cli.opts()
    expect(opts.port).toBe(3000)
    expect(typeof opts.port).toBe("number")
  })

  it("parses with Number", () => {
    const cli = createCLI("test").option("-t, --timeout <ms>", "Timeout", Number)
    cli.parse(["node", "test", "--timeout", "5000"], { from: "node" })
    const opts = cli.opts()
    expect(opts.timeout).toBe(5000)
    expect(typeof opts.timeout).toBe("number")
  })

  it("parses with custom split function", () => {
    const cli = createCLI("test").option("--tags <items>", "Tags", (v: string) => v.split(","))
    cli.parse(["node", "test", "--tags", "a,b,c"], { from: "node" })
    const opts = cli.opts()
    expect(opts.tags).toEqual(["a", "b", "c"])
  })

  it("uses parser default value when not provided", () => {
    // Note: Commander passes (value, previous) to the parser. Use a wrapper
    // to avoid parseInt treating the previous value as radix.
    const parsePort = (v: string) => parseInt(v, 10)
    const cli = createCLI("test").option("-p, --port <n>", "Port", parsePort, 8080)
    cli.parse(["node", "test"], { from: "node" })
    const opts = cli.opts()
    expect(opts.port).toBe(8080)
  })

  it("parser overrides default when flag is provided", () => {
    const parsePort = (v: string) => parseInt(v, 10)
    const cli = createCLI("test").option("-p, --port <n>", "Port", parsePort, 8080)
    cli.parse(["node", "test", "--port", "3000"], { from: "node" })
    const opts = cli.opts()
    expect(opts.port).toBe(3000)
  })
})

describe("optionWithChoices", () => {
  it("restricts to valid choices", () => {
    const cli = createCLI("test").optionWithChoices("-e, --env <env>", "Environment", [
      "dev",
      "staging",
      "prod",
    ] as const)
    cli.parse(["node", "test", "--env", "dev"], { from: "node" })
    const opts = cli.opts()
    expect(opts.env).toBe("dev")
  })

  it("rejects invalid choices", () => {
    const cli = createCLI("test").optionWithChoices("-e, --env <env>", "Environment", [
      "dev",
      "staging",
      "prod",
    ] as const)

    // Commander throws on invalid choices — configure to not exit and suppress stderr
    cli._cmd.exitOverride()
    cli._cmd.configureOutput({ writeErr: () => {} })
    expect(() => {
      cli.parse(["node", "test", "--env", "invalid"], { from: "node" })
    }).toThrow()
  })

  it("is undefined when not provided", () => {
    const cli = createCLI("test").optionWithChoices("-e, --env <env>", "Environment", [
      "dev",
      "staging",
      "prod",
    ] as const)
    cli.parse(["node", "test"], { from: "node" })
    const opts = cli.opts()
    expect(opts.env).toBeUndefined()
  })
})

describe("typed arguments", () => {
  it("receives arguments in action handler", () => {
    let received: { env?: string; tag?: string } = {}
    const cli = createCLI("test")
      .argument("<env>", "Environment")
      .argument("[tag]", "Optional tag")
      .action((env, tag) => {
        received = { env, tag }
      })
    cli.parse(["node", "test", "production", "v1.0"], { from: "node" })
    expect(received.env).toBe("production")
    expect(received.tag).toBe("v1.0")
  })

  it("optional argument is undefined when not provided", () => {
    let received: { env?: string; tag?: string | undefined } = {}
    const cli = createCLI("test")
      .argument("<env>", "Environment")
      .argument("[tag]", "Optional tag")
      .action((env, tag) => {
        received = { env, tag }
      })
    cli.parse(["node", "test", "production"], { from: "node" })
    expect(received.env).toBe("production")
    expect(received.tag).toBeUndefined()
  })

  it("action receives opts after arguments", () => {
    let receivedOpts: any
    const cli = createCLI("test")
      .argument("<env>", "Environment")
      .option("-f, --force", "Force")
      .action((_env, opts) => {
        receivedOpts = opts
      })
    cli.parse(["node", "test", "prod", "--force"], { from: "node" })
    expect(receivedOpts.force).toBe(true)
  })
})

describe("env passthrough", () => {
  it("env() returns the same command for chaining", () => {
    const cli = createCLI("test").option("-p, --port <n>", "Port").env("PORT")
    expect(cli).toBeInstanceOf(TypedCommand)
  })
})

describe("zod schema", () => {
  it("validates and coerces with z.coerce.number()", () => {
    const cli = createCLI("test").option("-p, --port <n>", "Port", z.coerce.number())
    cli.parse(["node", "test", "--port", "3000"], { from: "node" })
    const opts = cli.opts()
    expect(opts.port).toBe(3000)
    expect(typeof opts.port).toBe("number")
  })

  it("validates with z.coerce.number().min()", () => {
    const cli = createCLI("test").option("-p, --port <n>", "Port", z.coerce.number().min(1))
    cli.parse(["node", "test", "--port", "3000"], { from: "node" })
    expect(cli.opts().port).toBe(3000)
  })

  it("throws on zod validation failure", () => {
    const cli = createCLI("test").option("-p, --port <n>", "Port", z.coerce.number().min(1).max(65535))
    cli._cmd.exitOverride()
    cli._cmd.configureOutput({ writeErr: () => {} })
    expect(() => {
      cli.parse(["node", "test", "--port", "99999"], { from: "node" })
    }).toThrow()
  })

  it("validates with z.enum()", () => {
    const cli = createCLI("test").option("-e, --env <env>", "Env", z.enum(["dev", "staging", "prod"]))
    cli.parse(["node", "test", "--env", "dev"], { from: "node" })
    expect(cli.opts().env).toBe("dev")
  })

  it("rejects invalid z.enum() value", () => {
    const cli = createCLI("test").option("-e, --env <env>", "Env", z.enum(["dev", "staging", "prod"]))
    cli._cmd.exitOverride()
    cli._cmd.configureOutput({ writeErr: () => {} })
    expect(() => {
      cli.parse(["node", "test", "--env", "invalid"], { from: "node" })
    }).toThrow()
  })

  it("transforms with z.string().transform()", () => {
    const cli = createCLI("test").option(
      "--tags <t>",
      "Tags",
      z.string().transform((v) => v.split(",")),
    )
    cli.parse(["node", "test", "--tags", "a,b,c"], { from: "node" })
    expect(cli.opts().tags).toEqual(["a", "b", "c"])
  })

  it("is undefined when zod option not provided", () => {
    const cli = createCLI("test").option("-p, --port <n>", "Port", z.coerce.number())
    cli.parse(["node", "test"], { from: "node" })
    expect(cli.opts().port).toBeUndefined()
  })

  it("accumulates with regular options", () => {
    const cli = createCLI("test")
      .option("-v, --verbose", "Verbose")
      .option("-p, --port <n>", "Port", z.coerce.number())
      .option("--host <addr>", "Host")
    cli.parse(["node", "test", "--verbose", "--port", "8080", "--host", "localhost"], { from: "node" })
    const opts = cli.opts()
    expect(opts.verbose).toBe(true)
    expect(opts.port).toBe(8080)
    expect(opts.host).toBe("localhost")
  })
})
