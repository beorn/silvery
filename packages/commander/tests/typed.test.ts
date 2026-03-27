import { describe, it, expect } from "vitest"
import { z } from "zod"
import { Command, Option } from "../src/index.ts"

describe("Command subclass", () => {
  it("creates a command with colorized help", () => {
    const cmd = new Command("test-app").description("A test app")
    const help = cmd.helpInformation()
    // Should contain ANSI escape codes (from colorizeHelp in constructor)
    expect(help).toContain("\x1b[")
  })

  it("is an instance of Commander's Command", () => {
    const cmd = new Command("test")
    expect(cmd).toBeInstanceOf(Command)
    // Should have all standard Commander methods
    expect(typeof cmd.option).toBe("function")
    expect(typeof cmd.parse).toBe("function")
    expect(typeof cmd.opts).toBe("function")
    expect(typeof cmd.command).toBe("function")
  })

  it("returns opts for boolean flags", () => {
    const cmd = new Command("test").option("-v, --verbose", "Verbose output").option("-d, --debug", "Debug mode")

    cmd.parse(["node", "test", "--verbose"], { from: "node" })
    const opts = cmd.opts()

    expect(opts.verbose).toBe(true)
    expect(opts.debug).toBeUndefined()
  })

  it("returns opts for string value flags", () => {
    const cmd = new Command("test").option("-p, --port <number>", "Port").option("-h, --host <addr>", "Host address")

    cmd.parse(["node", "test", "--port", "3000", "--host", "localhost"], { from: "node" })
    const opts = cmd.opts()

    expect(opts.port).toBe("3000")
    expect(opts.host).toBe("localhost")
  })

  it("returns opts for optional value flags", () => {
    const cmd = new Command("test").option("-o, --output [path]", "Output path")

    cmd.parse(["node", "test", "--output"], { from: "node" })
    const opts = cmd.opts()

    // Optional flag without value -> true
    expect(opts.output).toBe(true)
  })

  it("handles default values", () => {
    const cmd = new Command("test").option("-p, --port <number>", "Port", "8080")

    cmd.parse(["node", "test"], { from: "node" })
    const opts = cmd.opts()

    expect(opts.port).toBe("8080")
  })

  it("handles kebab-case to camelCase", () => {
    const cmd = new Command("test").option("--dry-run", "Dry run mode")

    cmd.parse(["node", "test", "--dry-run"], { from: "node" })
    const opts = cmd.opts()

    expect(opts.dryRun).toBe(true)
  })

  it("subcommands also get colorized help", () => {
    const cmd = new Command("test").description("Main app")
    cmd.command("serve").option("-p, --port <number>", "Port")

    // Subcommand should also have colorized help
    const sub = cmd.commands.find((c) => c.name() === "serve")!
    const subHelp = sub.helpInformation()
    expect(subHelp).toContain("\x1b[")
  })

  it("chains fluently", () => {
    const cmd = new Command("test")
      .description("My app")
      .version("1.0.0")
      .option("-v, --verbose", "Verbose")
      .option("-p, --port <number>", "Port")
      .option("-o, --output [path]", "Output")

    // All methods return the same instance for chaining
    expect(cmd).toBeInstanceOf(Command)
  })
})

describe("custom parser", () => {
  it("parses with parseInt", () => {
    const cmd = new Command("test").option("-p, --port <n>", "Port", parseInt)
    cmd.parse(["node", "test", "--port", "3000"], { from: "node" })
    expect(cmd.opts().port).toBe(3000)
    expect(typeof cmd.opts().port).toBe("number")
  })

  it("parses with Number", () => {
    const cmd = new Command("test").option("-t, --timeout <ms>", "Timeout", Number)
    cmd.parse(["node", "test", "--timeout", "5000"], { from: "node" })
    expect(cmd.opts().timeout).toBe(5000)
    expect(typeof cmd.opts().timeout).toBe("number")
  })

  it("parses with custom split function", () => {
    const cmd = new Command("test").option("--tags <items>", "Tags", (v: string) => v.split(","))
    cmd.parse(["node", "test", "--tags", "a,b,c"], { from: "node" })
    expect(cmd.opts().tags).toEqual(["a", "b", "c"])
  })

  it("uses parser default value when not provided", () => {
    const parsePort = (v: string) => parseInt(v, 10)
    const cmd = new Command("test").option("-p, --port <n>", "Port", parsePort, 8080)
    cmd.parse(["node", "test"], { from: "node" })
    expect(cmd.opts().port).toBe(8080)
  })

  it("parser overrides default when flag is provided", () => {
    const parsePort = (v: string) => parseInt(v, 10)
    const cmd = new Command("test").option("-p, --port <n>", "Port", parsePort, 8080)
    cmd.parse(["node", "test", "--port", "3000"], { from: "node" })
    expect(cmd.opts().port).toBe(3000)
  })
})

describe("choices", () => {
  it("restricts to valid choices via addOption", () => {
    const cmd = new Command("test")
    cmd.addOption(new Option("-e, --env <env>", "Environment").choices(["dev", "staging", "prod"]))
    cmd.parse(["node", "test", "--env", "dev"], { from: "node" })
    expect(cmd.opts().env).toBe("dev")
  })

  it("rejects invalid choices", () => {
    const cmd = new Command("test")
    cmd.addOption(new Option("-e, --env <env>", "Environment").choices(["dev", "staging", "prod"]))

    cmd.exitOverride()
    cmd.configureOutput({ writeErr: () => {} })
    expect(() => {
      cmd.parse(["node", "test", "--env", "invalid"], { from: "node" })
    }).toThrow()
  })
})

describe("typed arguments", () => {
  it("receives arguments in action handler", () => {
    let received: { env?: string; tag?: string } = {}
    const cmd = new Command("test")
      .argument("<env>", "Environment")
      .argument("[tag]", "Optional tag")
      .action((env, tag) => {
        received = { env, tag }
      })
    cmd.parse(["node", "test", "production", "v1.0"], { from: "node" })
    expect(received.env).toBe("production")
    expect(received.tag).toBe("v1.0")
  })

  it("optional argument is undefined when not provided", () => {
    let received: { env?: string; tag?: string | undefined } = {}
    const cmd = new Command("test")
      .argument("<env>", "Environment")
      .argument("[tag]", "Optional tag")
      .action((env, tag) => {
        received = { env, tag }
      })
    cmd.parse(["node", "test", "production"], { from: "node" })
    expect(received.env).toBe("production")
    expect(received.tag).toBeUndefined()
  })

  it("action receives opts after arguments", () => {
    let receivedOpts: any
    const cmd = new Command("test")
      .argument("<env>", "Environment")
      .option("-f, --force", "Force")
      .action((_env, opts) => {
        receivedOpts = opts
      })
    cmd.parse(["node", "test", "prod", "--force"], { from: "node" })
    expect(receivedOpts.force).toBe(true)
  })
})

describe("zod schema via Standard Schema", () => {
  it("validates and coerces with z.coerce.number()", () => {
    const cmd = new Command("test").option("-p, --port <n>", "Port", z.coerce.number())
    cmd.parse(["node", "test", "--port", "3000"], { from: "node" })
    expect(cmd.opts().port).toBe(3000)
    expect(typeof cmd.opts().port).toBe("number")
  })

  it("validates with z.coerce.number().min()", () => {
    const cmd = new Command("test").option("-p, --port <n>", "Port", z.coerce.number().min(1))
    cmd.parse(["node", "test", "--port", "3000"], { from: "node" })
    expect(cmd.opts().port).toBe(3000)
  })

  it("throws on zod validation failure", () => {
    const cmd = new Command("test").option("-p, --port <n>", "Port", z.coerce.number().min(1).max(65535))
    cmd.exitOverride()
    cmd.configureOutput({ writeErr: () => {} })
    expect(() => {
      cmd.parse(["node", "test", "--port", "99999"], { from: "node" })
    }).toThrow()
  })

  it("validates with z.enum()", () => {
    const cmd = new Command("test").option("-e, --env <env>", "Env", z.enum(["dev", "staging", "prod"]))
    cmd.parse(["node", "test", "--env", "dev"], { from: "node" })
    expect(cmd.opts().env).toBe("dev")
  })

  it("rejects invalid z.enum() value", () => {
    const cmd = new Command("test").option("-e, --env <env>", "Env", z.enum(["dev", "staging", "prod"]))
    cmd.exitOverride()
    cmd.configureOutput({ writeErr: () => {} })
    expect(() => {
      cmd.parse(["node", "test", "--env", "invalid"], { from: "node" })
    }).toThrow()
  })

  it("transforms with z.string().transform()", () => {
    const cmd = new Command("test").option(
      "--tags <t>",
      "Tags",
      z.string().transform((v) => v.split(",")),
    )
    cmd.parse(["node", "test", "--tags", "a,b,c"], { from: "node" })
    expect(cmd.opts().tags).toEqual(["a", "b", "c"])
  })

  it("is undefined when zod option not provided", () => {
    const cmd = new Command("test").option("-p, --port <n>", "Port", z.coerce.number())
    cmd.parse(["node", "test"], { from: "node" })
    expect(cmd.opts().port).toBeUndefined()
  })

  it("accumulates with regular options", () => {
    const cmd = new Command("test")
      .option("-v, --verbose", "Verbose")
      .option("-p, --port <n>", "Port", z.coerce.number())
      .option("--host <addr>", "Host")
    cmd.parse(["node", "test", "--verbose", "--port", "8080", "--host", "localhost"], { from: "node" })
    const opts = cmd.opts()
    expect(opts.verbose).toBe(true)
    expect(opts.port).toBe(8080)
    expect(opts.host).toBe("localhost")
  })
})
