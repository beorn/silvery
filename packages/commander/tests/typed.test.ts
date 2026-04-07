import { describe, it, expect } from "vitest"
import { z } from "zod"
import { Command } from "../src/index.ts"

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

describe("array choices", () => {
  it("restricts to valid choices via array", () => {
    const cmd = new Command("test").option("-e, --env <env>", "Environment", ["dev", "staging", "prod"])
    cmd.parse(["node", "test", "--env", "dev"], { from: "node" })
    expect(cmd.opts().env).toBe("dev")
  })

  it("rejects invalid choices", () => {
    const cmd = new Command("test").option("-e, --env <env>", "Environment", ["dev", "staging", "prod"])
    cmd.exitOverride()
    cmd.configureOutput({ writeErr: () => {} })
    expect(() => {
      cmd.parse(["node", "test", "--env", "invalid"], { from: "node" })
    }).toThrow()
  })

  it("is undefined when not provided", () => {
    const cmd = new Command("test").option("-e, --env <env>", "Environment", ["dev", "staging", "prod"])
    cmd.parse(["node", "test"], { from: "node" })
    expect(cmd.opts().env).toBeUndefined()
  })
})

describe("actionMerged — merged named-object form", () => {
  it("receives arguments merged into params", () => {
    let received: { env?: string; tag?: string } = {}
    const cmd = new Command("test")
      .argument("<env>", "Environment")
      .argument("[tag]", "Optional tag")
      .actionMerged((params) => {
        received = { env: params.env, tag: params.tag }
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
      .actionMerged((params) => {
        received = { env: params.env, tag: params.tag }
      })
    cmd.parse(["node", "test", "production"], { from: "node" })
    expect(received.env).toBe("production")
    expect(received.tag).toBeUndefined()
  })

  it("merges args and opts into a single flat object", () => {
    let receivedParams: any
    const cmd = new Command("test")
      .argument("<env>", "Environment")
      .option("-f, --force", "Force")
      .actionMerged((params) => {
        receivedParams = params
      })
    cmd.parse(["node", "test", "prod", "--force"], { from: "node" })
    expect(receivedParams.env).toBe("prod")
    expect(receivedParams.force).toBe(true)
  })

  it("exposes the Command instance as second argument", () => {
    let receivedCmd: any
    const cmd = new Command("test")
      .argument("<env>", "Environment")
      .actionMerged((_params, c) => {
        receivedCmd = c
      })
    cmd.parse(["node", "test", "prod"], { from: "node" })
    expect(receivedCmd).toBeDefined()
    expect(receivedCmd.name()).toBe("test")
  })

  it("argument with choices restricts valid values", () => {
    let received: any
    const cmd = new Command("test")
      .argument("<env>", "Environment", ["dev", "staging", "prod"])
      .actionMerged((params) => {
        received = params
      })
    cmd.parse(["node", "test", "dev"], { from: "node" })
    expect(received.env).toBe("dev")
  })

  it("argument with choices rejects invalid values", () => {
    const cmd = new Command("test")
      .argument("<env>", "Environment", ["dev", "staging", "prod"])
      .actionMerged(() => {})
    cmd.exitOverride()
    cmd.configureOutput({ writeErr: () => {} })
    expect(() => {
      cmd.parse(["node", "test", "invalid"], { from: "node" })
    }).toThrow()
  })

  it("argument with parser coerces value", () => {
    let received: any
    const cmd = new Command("test").argument("<port>", "Port", parseInt).actionMerged((params) => {
      received = params
    })
    cmd.parse(["node", "test", "3000"], { from: "node" })
    expect(received.port).toBe(3000)
    expect(typeof received.port).toBe("number")
  })

  it("argument with Standard Schema validates", () => {
    let received: any
    const cmd = new Command("test").argument("<port>", "Port", z.coerce.number()).actionMerged((params) => {
      received = params
    })
    cmd.parse(["node", "test", "8080"], { from: "node" })
    expect(received.port).toBe(8080)
  })

  it("kebab-case argument name becomes camelCase", () => {
    let received: any
    const cmd = new Command("test").argument("<service-name>", "Service name").actionMerged((params) => {
      received = params
    })
    cmd.parse(["node", "test", "my-api"], { from: "node" })
    expect(received.serviceName).toBe("my-api")
  })

  it("variadic argument collects multiple values", () => {
    let received: any
    const cmd = new Command("test").argument("<files...>", "Files to process").actionMerged((params) => {
      received = params
    })
    cmd.parse(["node", "test", "a.txt", "b.txt", "c.txt"], { from: "node" })
    expect(received.files).toEqual(["a.txt", "b.txt", "c.txt"])
  })

  it("multiple args + multiple opts all merge correctly", () => {
    let received: any
    const cmd = new Command("test")
      .argument("<service>", "Service")
      .argument("[env]", "Env")
      .option("-p, --port <n>", "Port", parseInt)
      .option("-v, --verbose", "Verbose")
      .actionMerged((params) => {
        received = params
      })
    cmd.parse(["node", "test", "api", "prod", "--port", "3000", "--verbose"], { from: "node" })
    expect(received.service).toBe("api")
    expect(received.env).toBe("prod")
    expect(received.port).toBe(3000)
    expect(received.verbose).toBe(true)
  })

  it("actionMerged on a command with no typed arguments merges only opts", () => {
    let receivedParams: any
    const cmd = new Command("test").option("-v, --verbose", "Verbose").actionMerged((params) => {
      receivedParams = params
    })
    cmd.parse(["node", "test", "--verbose"], { from: "node" })
    expect(receivedParams.verbose).toBe(true)
  })
})

describe("inline command-string arguments", () => {
  it("`command('deploy <service>')` passes the positional arg to action", () => {
    let received: any
    const program = new Command("app")
    program.command("deploy <service>").action((service: string) => {
      received = service
    })
    program.parse(["node", "app", "deploy", "api"], { from: "node" })
    expect(received).toBe("api")
  })

  it("`command('deploy [env]')` makes the arg optional", () => {
    let received: any
    const program = new Command("app")
    program.command("deploy [env]").action((env: string | undefined) => {
      received = env
    })
    program.parse(["node", "app", "deploy"], { from: "node" })
    expect(received).toBeUndefined()
  })

  it("`command('deploy <service> [env]')` parses both args in order", () => {
    let receivedService: any
    let receivedEnv: any
    const program = new Command("app")
    program.command("deploy <service> [env]").action((service: string, env: string | undefined) => {
      receivedService = service
      receivedEnv = env
    })
    program.parse(["node", "app", "deploy", "api", "prod"], { from: "node" })
    expect(receivedService).toBe("api")
    expect(receivedEnv).toBe("prod")
  })

  it("`command('run <files...>')` collects variadic args", () => {
    let received: any
    const program = new Command("app")
    program.command("run <files...>").action((files: string[]) => {
      received = files
    })
    program.parse(["node", "app", "run", "a.txt", "b.txt", "c.txt"], { from: "node" })
    expect(received).toEqual(["a.txt", "b.txt", "c.txt"])
  })

  it("`actionMerged` works on inline-arg commands (names mirrored from string)", () => {
    let received: any
    const program = new Command("app")
    program.command("deploy <service> [env]").actionMerged((params) => {
      received = params
    })
    program.parse(["node", "app", "deploy", "api", "prod"], { from: "node" })
    expect(received.service).toBe("api")
    expect(received.env).toBe("prod")
  })

  it("kebab-case inline arg name is camelCased in actionMerged params", () => {
    let received: any
    const program = new Command("app")
    program.command("deploy <service-name>").actionMerged((params) => {
      received = params
    })
    program.parse(["node", "app", "deploy", "my-api"], { from: "node" })
    expect(received.serviceName).toBe("my-api")
  })

  it("inline arg + .option() composes correctly with actionMerged", () => {
    let received: any
    const program = new Command("app")
    program
      .command("deploy <service>")
      .option("-f, --force", "Force")
      .actionMerged((params) => {
        received = params
      })
    program.parse(["node", "app", "deploy", "api", "--force"], { from: "node" })
    expect(received.service).toBe("api")
    expect(received.force).toBe(true)
  })

  it("mixing inline args with .argument() chains them in order", () => {
    let receivedService: any
    let receivedEnv: any
    const program = new Command("app")
    program
      .command("deploy <service>")
      .argument("[env]", "Environment")
      .action((service: string, env: string | undefined) => {
        receivedService = service
        receivedEnv = env
      })
    program.parse(["node", "app", "deploy", "api", "prod"], { from: "node" })
    expect(receivedService).toBe("api")
    expect(receivedEnv).toBe("prod")
  })
})

describe("action — Commander-native passes through", () => {
  it("passes opts to handler when there are no typed args", () => {
    let receivedOpts: any
    const cmd = new Command("test").option("-v, --verbose", "Verbose").action((opts) => {
      receivedOpts = opts
    })
    cmd.parse(["node", "test", "--verbose"], { from: "node" })
    expect(receivedOpts.verbose).toBe(true)
  })
})

describe("action — Commander-native positional form", () => {
  it("receives positional args then opts", () => {
    let receivedEnv: any
    let receivedTag: any
    const cmd = new Command("test")
      .argument("<env>", "Environment")
      .argument("[tag]", "Optional tag")
      .action((env, tag, _opts) => {
        receivedEnv = env
        receivedTag = tag
      })
    cmd.parse(["node", "test", "production", "v1.0"], { from: "node" })
    expect(receivedEnv).toBe("production")
    expect(receivedTag).toBe("v1.0")
  })

  it("positional args with options", () => {
    let receivedService: any
    let receivedOpts: any
    const cmd = new Command("test")
      .argument("<service>", "Service")
      .option("-f, --force", "Force")
      .action((service, opts) => {
        receivedService = service
        receivedOpts = opts
      })
    cmd.parse(["node", "test", "api", "--force"], { from: "node" })
    expect(receivedService).toBe("api")
    expect(receivedOpts.force).toBe(true)
  })

  it("variadic positional arg", () => {
    let receivedFiles: any
    const cmd = new Command("test").argument("<files...>", "Files to process").action((files, _opts) => {
      receivedFiles = files
    })
    cmd.parse(["node", "test", "a.txt", "b.txt", "c.txt"], { from: "node" })
    expect(receivedFiles).toEqual(["a.txt", "b.txt", "c.txt"])
  })

  it("multiple args + options Commander-style", () => {
    let receivedService: any
    let receivedEnv: any
    let receivedOpts: any
    const cmd = new Command("test")
      .argument("<service>", "Service")
      .argument("[env]", "Env")
      .option("-p, --port <n>", "Port", parseInt)
      .option("-v, --verbose", "Verbose")
      .action((service, env, opts) => {
        receivedService = service
        receivedEnv = env
        receivedOpts = opts
      })
    cmd.parse(["node", "test", "api", "prod", "--port", "3000", "--verbose"], { from: "node" })
    expect(receivedService).toBe("api")
    expect(receivedEnv).toBe("prod")
    expect(receivedOpts.port).toBe(3000)
    expect(receivedOpts.verbose).toBe(true)
  })

  it("argument with choices Commander-style", () => {
    let receivedEnv: any
    const cmd = new Command("test")
      .argument("<env>", "Environment", ["dev", "staging", "prod"])
      .action((env, _opts) => {
        receivedEnv = env
      })
    cmd.parse(["node", "test", "dev"], { from: "node" })
    expect(receivedEnv).toBe("dev")
  })

  it("argument with parser Commander-style", () => {
    let receivedPort: any
    const cmd = new Command("test").argument("<port>", "Port", parseInt).action((port, _opts) => {
      receivedPort = port
    })
    cmd.parse(["node", "test", "3000"], { from: "node" })
    expect(receivedPort).toBe(3000)
    expect(typeof receivedPort).toBe("number")
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
    cmd.parse(["node", "test", "--verbose", "--port", "8080", "--host", "localhost"], {
      from: "node",
    })
    const opts = cmd.opts()
    expect(opts.verbose).toBe(true)
    expect(opts.port).toBe(8080)
    expect(opts.host).toBe("localhost")
  })
})
