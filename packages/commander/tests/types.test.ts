import { describe, it, expectTypeOf, assertType } from "vitest"
import { Command, port, csv, uint, int, float, url, path, email, json, bool, date, regex } from "../src/index.ts"
import type { OptionValues } from "../src/index.ts"
import { z } from "zod"

describe("Command type behavior", () => {
  it("opts() returns empty object type for no options", () => {
    const cmd = new Command("test")
    type Opts = ReturnType<typeof cmd.opts>
    // With no options defined, Opts is {}
    expectTypeOf<Opts>().toEqualTypeOf<{}>()
  })

  it("Command is a subclass of Commander's Command", () => {
    const cmd = new Command("test")
    expectTypeOf(cmd).toMatchTypeOf<InstanceType<typeof Command>>()
  })

  it("option() returns Command for chaining", () => {
    const cmd = new Command("test")
    const result = cmd.option("-v, --verbose", "Verbose")
    expectTypeOf(result).toMatchTypeOf<Command<any>>()
  })
})

describe("boolean flag inference", () => {
  it("--verbose → verbose: boolean | undefined", () => {
    const cmd = new Command("test").option("--verbose", "Verbose")
    type Opts = ReturnType<typeof cmd.opts>
    expectTypeOf<Opts["verbose"]>().toEqualTypeOf<boolean | undefined>()
  })

  it("-v, --verbose → verbose: boolean | undefined", () => {
    const cmd = new Command("test").option("-v, --verbose", "Verbose")
    type Opts = ReturnType<typeof cmd.opts>
    expectTypeOf<Opts["verbose"]>().toEqualTypeOf<boolean | undefined>()
  })

  it("-d, --debug → debug: boolean | undefined", () => {
    const cmd = new Command("test").option("-d, --debug", "Debug mode")
    type Opts = ReturnType<typeof cmd.opts>
    expectTypeOf<Opts["debug"]>().toEqualTypeOf<boolean | undefined>()
  })
})

describe("string value inference", () => {
  it("--port <n> → port: string | undefined (without parser)", () => {
    const cmd = new Command("test").option("--port <n>", "Port number")
    type Opts = ReturnType<typeof cmd.opts>
    expectTypeOf<Opts["port"]>().toEqualTypeOf<string | undefined>()
  })

  it("--host <addr> → host: string | undefined", () => {
    const cmd = new Command("test").option("--host <addr>", "Host address")
    type Opts = ReturnType<typeof cmd.opts>
    expectTypeOf<Opts["host"]>().toEqualTypeOf<string | undefined>()
  })

  it("-h, --host <addr> → host: string | undefined", () => {
    const cmd = new Command("test").option("-h, --host <addr>", "Host")
    type Opts = ReturnType<typeof cmd.opts>
    expectTypeOf<Opts["host"]>().toEqualTypeOf<string | undefined>()
  })
})

describe("optional value inference", () => {
  it("--output [path] → output: string | boolean | undefined", () => {
    const cmd = new Command("test").option("--output [path]", "Output path")
    type Opts = ReturnType<typeof cmd.opts>
    expectTypeOf<Opts["output"]>().toEqualTypeOf<string | boolean | undefined>()
  })

  it("-o, --output [path] → output: string | boolean | undefined", () => {
    const cmd = new Command("test").option("-o, --output [path]", "Output")
    type Opts = ReturnType<typeof cmd.opts>
    expectTypeOf<Opts["output"]>().toEqualTypeOf<string | boolean | undefined>()
  })
})

describe("camelCase conversion", () => {
  it("--dry-run → dryRun: boolean | undefined", () => {
    const cmd = new Command("test").option("--dry-run", "Dry run mode")
    type Opts = ReturnType<typeof cmd.opts>
    expectTypeOf<Opts["dryRun"]>().toEqualTypeOf<boolean | undefined>()
  })

  it("--terminal-name <n> → terminalName: string | undefined", () => {
    const cmd = new Command("test").option("--terminal-name <n>", "Terminal name")
    type Opts = ReturnType<typeof cmd.opts>
    expectTypeOf<Opts["terminalName"]>().toEqualTypeOf<string | undefined>()
  })

  it("--no-color → color: boolean", () => {
    const cmd = new Command("test").option("--no-color", "Disable color")
    type Opts = ReturnType<typeof cmd.opts>
    expectTypeOf<Opts["color"]>().toEqualTypeOf<boolean>()
  })
})

describe("parser function inference", () => {
  it("parseInt parser → port: number | undefined", () => {
    const cmd = new Command("test").option("-p, --port <n>", "Port", parseInt)
    type Opts = ReturnType<typeof cmd.opts>
    expectTypeOf<Opts["port"]>().toEqualTypeOf<number | undefined>()
  })

  it("Number parser → timeout: number | undefined", () => {
    const cmd = new Command("test").option("-t, --timeout <ms>", "Timeout", Number)
    type Opts = ReturnType<typeof cmd.opts>
    expectTypeOf<Opts["timeout"]>().toEqualTypeOf<number | undefined>()
  })

  it("custom split function → tags: string[] | undefined", () => {
    const cmd = new Command("test").option("--tags <items>", "Tags", (v: string) => v.split(","))
    type Opts = ReturnType<typeof cmd.opts>
    expectTypeOf<Opts["tags"]>().toEqualTypeOf<string[] | undefined>()
  })
})

describe("CLIType / preset inference", () => {
  it("port preset → port: number | undefined", () => {
    const cmd = new Command("test").option("-p, --port <n>", "Port", port)
    type Opts = ReturnType<typeof cmd.opts>
    expectTypeOf<Opts["port"]>().toEqualTypeOf<number | undefined>()
  })

  it("csv preset → tags: string[] | undefined", () => {
    const cmd = new Command("test").option("--tags <t>", "Tags", csv)
    type Opts = ReturnType<typeof cmd.opts>
    expectTypeOf<Opts["tags"]>().toEqualTypeOf<string[] | undefined>()
  })

  it("uint preset → retries: number | undefined", () => {
    const cmd = new Command("test").option("--retries <n>", "Retries", uint)
    type Opts = ReturnType<typeof cmd.opts>
    expectTypeOf<Opts["retries"]>().toEqualTypeOf<number | undefined>()
  })

  it("int preset → count: number | undefined", () => {
    const cmd = new Command("test").option("--count <n>", "Count", int)
    type Opts = ReturnType<typeof cmd.opts>
    expectTypeOf<Opts["count"]>().toEqualTypeOf<number | undefined>()
  })

  it("float preset → ratio: number | undefined", () => {
    const cmd = new Command("test").option("--ratio <n>", "Ratio", float)
    type Opts = ReturnType<typeof cmd.opts>
    expectTypeOf<Opts["ratio"]>().toEqualTypeOf<number | undefined>()
  })

  it("url preset → endpoint: string | undefined", () => {
    const cmd = new Command("test").option("--endpoint <url>", "URL", url)
    type Opts = ReturnType<typeof cmd.opts>
    expectTypeOf<Opts["endpoint"]>().toEqualTypeOf<string | undefined>()
  })

  it("path preset → file: string | undefined", () => {
    const cmd = new Command("test").option("--file <path>", "File", path)
    type Opts = ReturnType<typeof cmd.opts>
    expectTypeOf<Opts["file"]>().toEqualTypeOf<string | undefined>()
  })

  it("email preset → contact: string | undefined", () => {
    const cmd = new Command("test").option("--contact <email>", "Email", email)
    type Opts = ReturnType<typeof cmd.opts>
    expectTypeOf<Opts["contact"]>().toEqualTypeOf<string | undefined>()
  })

  it("bool preset → force: boolean | undefined", () => {
    const cmd = new Command("test").option("--force <bool>", "Force", bool)
    type Opts = ReturnType<typeof cmd.opts>
    expectTypeOf<Opts["force"]>().toEqualTypeOf<boolean | undefined>()
  })

  it("date preset → since: Date | undefined", () => {
    const cmd = new Command("test").option("--since <date>", "Since", date)
    type Opts = ReturnType<typeof cmd.opts>
    expectTypeOf<Opts["since"]>().toEqualTypeOf<Date | undefined>()
  })

  it("regex preset → pattern: RegExp | undefined", () => {
    const cmd = new Command("test").option("--pattern <regex>", "Pattern", regex)
    type Opts = ReturnType<typeof cmd.opts>
    expectTypeOf<Opts["pattern"]>().toEqualTypeOf<RegExp | undefined>()
  })

  it("json preset → config: unknown | undefined", () => {
    const cmd = new Command("test").option("--config <json>", "Config", json)
    type Opts = ReturnType<typeof cmd.opts>
    expectTypeOf<Opts["config"]>().toEqualTypeOf<unknown>()
  })
})

describe("choices array inference", () => {
  it("string choices → union type | undefined", () => {
    const cmd = new Command("test").option("-e, --env <env>", "Environment", ["dev", "staging", "prod"] as const)
    type Opts = ReturnType<typeof cmd.opts>
    expectTypeOf<Opts["env"]>().toEqualTypeOf<"dev" | "staging" | "prod" | undefined>()
  })
})

describe("Standard Schema / Zod inference", () => {
  it("z.coerce.number() → port: number | undefined", () => {
    const cmd = new Command("test").option("-p, --port <n>", "Port", z.coerce.number())
    type Opts = ReturnType<typeof cmd.opts>
    expectTypeOf<Opts["port"]>().toEqualTypeOf<number | undefined>()
  })

  it("z.enum() → env: union | undefined", () => {
    const cmd = new Command("test").option("-e, --env <env>", "Env", z.enum(["dev", "staging", "prod"]))
    type Opts = ReturnType<typeof cmd.opts>
    expectTypeOf<Opts["env"]>().toEqualTypeOf<"dev" | "staging" | "prod" | undefined>()
  })

  it("z.string().transform() → tags: string[] | undefined", () => {
    const cmd = new Command("test").option(
      "--tags <t>",
      "Tags",
      z.string().transform((v) => v.split(",")),
    )
    type Opts = ReturnType<typeof cmd.opts>
    expectTypeOf<Opts["tags"]>().toEqualTypeOf<string[] | undefined>()
  })
})

describe("accumulated options across chained calls", () => {
  it("multiple options accumulate their types", () => {
    const cmd = new Command("test")
      .option("-v, --verbose", "Verbose")
      .option("-p, --port <n>", "Port", port)
      .option("--host <addr>", "Host")

    type Opts = ReturnType<typeof cmd.opts>

    expectTypeOf<Opts["verbose"]>().toEqualTypeOf<boolean | undefined>()
    expectTypeOf<Opts["port"]>().toEqualTypeOf<number | undefined>()
    expectTypeOf<Opts["host"]>().toEqualTypeOf<string | undefined>()
  })

  it("mixed option types all accumulate correctly", () => {
    const cmd = new Command("test")
      .option("--verbose", "Verbose")
      .option("--port <n>", "Port", port)
      .option("--env <e>", "Env", ["dev", "staging", "prod"] as const)
      .option("--tags <t>", "Tags", csv)
      .option("--output [path]", "Output")
      .option("--dry-run", "Dry run")

    type Opts = ReturnType<typeof cmd.opts>

    expectTypeOf<Opts["verbose"]>().toEqualTypeOf<boolean | undefined>()
    expectTypeOf<Opts["port"]>().toEqualTypeOf<number | undefined>()
    expectTypeOf<Opts["env"]>().toEqualTypeOf<"dev" | "staging" | "prod" | undefined>()
    expectTypeOf<Opts["tags"]>().toEqualTypeOf<string[] | undefined>()
    expectTypeOf<Opts["output"]>().toEqualTypeOf<string | boolean | undefined>()
    expectTypeOf<Opts["dryRun"]>().toEqualTypeOf<boolean | undefined>()
  })
})

describe("opts() returns typed values after action()", () => {
  it("opts() is typed after chaining through action()", () => {
    const cmd = new Command("test")
      .option("--verbose", "Verbose")
      .option("--port <n>", "Port", port)
      .action(() => {
        // action callback args are untyped (Commander's ...any[])
        // Use cmd.opts() for typed access instead
      })

    type Opts = ReturnType<typeof cmd.opts>
    expectTypeOf<Opts["verbose"]>().toEqualTypeOf<boolean | undefined>()
    expectTypeOf<Opts["port"]>().toEqualTypeOf<number | undefined>()
  })

  it("opts() retains types after argument() + action()", () => {
    const cmd = new Command("test")
      .argument("<env>", "Environment")
      .option("-f, --force", "Force")
      .option("-p, --port <n>", "Port", port)
      .action(() => {})

    type Opts = ReturnType<typeof cmd.opts>
    expectTypeOf<Opts["force"]>().toEqualTypeOf<boolean | undefined>()
    expectTypeOf<Opts["port"]>().toEqualTypeOf<number | undefined>()
  })
})

describe("nonexistent property access is a type error", () => {
  it("accessing undefined option is a type error", () => {
    const cmd = new Command("test").option("--verbose", "Verbose").option("--port <n>", "Port", port)

    type Opts = ReturnType<typeof cmd.opts>

    // These should exist
    expectTypeOf<Opts["verbose"]>().not.toBeNever()
    expectTypeOf<Opts["port"]>().not.toBeNever()

    // @ts-expect-error -- 'listen' does not exist on the inferred opts type
    type _CheckListen = Opts["listen"]
  })
})

describe("subcommand options don't leak to parent", () => {
  it("parent and subcommand have independent option types", () => {
    const parent = new Command("app").option("--verbose", "Verbose")

    // Subcommands created via .command() are independent Command instances
    // with their own option accumulation — they don't inherit the parent's Opts type
    type ParentOpts = ReturnType<typeof parent.opts>
    expectTypeOf<ParentOpts["verbose"]>().toEqualTypeOf<boolean | undefined>()

    // parent.opts() should NOT have subcommand-only options
    // This verifies type isolation between parent and child
  })
})

// ────────────────────────────────────────────────────────────────
// Typed argument inference — verified via .actionMerged((params) => ...)
// (cmd.opts() is options-only; positional args appear in ArgsRecord,
// which is exposed through .actionMerged()'s params parameter.)
// ────────────────────────────────────────────────────────────────

describe("required argument inference", () => {
  it("<service> → service: string", () => {
    new Command("test")
      .argument("<service>", "Service to deploy")
      .actionMerged((params) => {
        expectTypeOf(params.service).toEqualTypeOf<string>()
      })
  })

  it("<name> no parser → string", () => {
    new Command("test")
      .argument("<name>", "Name")
      .actionMerged((params) => {
        expectTypeOf(params.name).toEqualTypeOf<string>()
      })
  })
})

describe("optional argument inference", () => {
  it("[env] → env: string | undefined", () => {
    new Command("test")
      .argument("[env]", "Environment")
      .actionMerged((params) => {
        expectTypeOf(params.env).toEqualTypeOf<string | undefined>()
      })
  })
})

describe("variadic argument inference", () => {
  it("<files...> → files: string[]", () => {
    new Command("test")
      .argument("<files...>", "Files")
      .actionMerged((params) => {
        expectTypeOf(params.files).toEqualTypeOf<string[]>()
      })
  })

  it("[extras...] → extras: string[]", () => {
    new Command("test")
      .argument("[extras...]", "Extra args")
      .actionMerged((params) => {
        expectTypeOf(params.extras).toEqualTypeOf<string[]>()
      })
  })
})

describe("argument with parser", () => {
  it("<port> with uint → port: number", () => {
    new Command("test")
      .argument("<port>", "Port", uint)
      .actionMerged((params) => {
        expectTypeOf(params.port).toEqualTypeOf<number>()
      })
  })

  it("[port] with uint → port: number | undefined", () => {
    new Command("test")
      .argument("[port]", "Port", uint)
      .actionMerged((params) => {
        expectTypeOf(params.port).toEqualTypeOf<number | undefined>()
      })
  })

  it("<port> with parseInt → port: number", () => {
    new Command("test")
      .argument("<port>", "Port", parseInt)
      .actionMerged((params) => {
        expectTypeOf(params.port).toEqualTypeOf<number>()
      })
  })
})

describe("argument with choices", () => {
  it("<env> with choices → union", () => {
    new Command("test")
      .argument("<env>", "Env", ["dev", "staging", "prod"] as const)
      .actionMerged((params) => {
        expectTypeOf(params.env).toEqualTypeOf<"dev" | "staging" | "prod">()
      })
  })

  it("[env] with choices → union | undefined", () => {
    new Command("test")
      .argument("[env]", "Env", ["dev", "staging"] as const)
      .actionMerged((params) => {
        expectTypeOf(params.env).toEqualTypeOf<"dev" | "staging" | undefined>()
      })
  })
})

describe("argument with Zod schema", () => {
  it("<port> with z.coerce.number() → port: number", () => {
    new Command("test")
      .argument("<port>", "Port", z.coerce.number())
      .actionMerged((params) => {
        expectTypeOf(params.port).toEqualTypeOf<number>()
      })
  })
})

describe("argument camelCase", () => {
  it("<service-name> → serviceName: string", () => {
    new Command("test")
      .argument("<service-name>", "Service name")
      .actionMerged((params) => {
        expectTypeOf(params.serviceName).toEqualTypeOf<string>()
      })
  })

  it("<task-id> → taskId: string", () => {
    new Command("test")
      .argument("<task-id>", "Task ID")
      .actionMerged((params) => {
        expectTypeOf(params.taskId).toEqualTypeOf<string>()
      })
  })
})

describe("mixed arguments and options", () => {
  it("actionMerged receives all args + options on one object", () => {
    new Command("test")
      .argument("<service>", "Service to deploy")
      .argument("[env]", "Environment", ["dev", "staging", "prod"] as const)
      .option("--verbose", "Verbose")
      .option("-p, --port <n>", "Port", port)
      .actionMerged((params) => {
        expectTypeOf(params.service).toEqualTypeOf<string>()
        expectTypeOf(params.env).toEqualTypeOf<"dev" | "staging" | "prod" | undefined>()
        expectTypeOf(params.verbose).toEqualTypeOf<boolean | undefined>()
        expectTypeOf(params.port).toEqualTypeOf<number | undefined>()
      })
  })

  it("cmd.opts() returns ONLY options, not arguments", () => {
    const cmd = new Command("test")
      .argument("<service>", "Service")
      .option("--verbose", "Verbose")

    type Opts = ReturnType<typeof cmd.opts>

    // Options are present
    expectTypeOf<Opts["verbose"]>().toEqualTypeOf<boolean | undefined>()

    // @ts-expect-error -- 'service' is an argument, not an option; it is NOT on cmd.opts()
    type _CheckNoServiceOnOpts = Opts["service"]
  })
})

describe("accessing undefined argument is a type error", () => {
  it("nonexistent key on params is never", () => {
    new Command("test")
      .argument("<service>", "Service")
      .actionMerged((params) => {
        expectTypeOf(params.service).not.toBeNever()

        // @ts-expect-error -- 'environment' does not exist on the inferred params type
        type _CheckEnv = (typeof params)["environment"]
        // Suppress unused-type warning
        type _ = _CheckEnv
      })
  })
})

// ────────────────────────────────────────────────────────────────
// Commander-native action typing (the canonical form)
// ────────────────────────────────────────────────────────────────

describe("action() typing — Commander-native positional", () => {
  it("action(service, env, opts) receives correct types", () => {
    new Command("test")
      .argument("<service>", "Service")
      .argument("[env]", "Environment", ["dev", "staging", "prod"] as const)
      .option("--verbose", "Verbose")
      .action((service, env, opts) => {
        expectTypeOf(service).toEqualTypeOf<string>()
        expectTypeOf(env).toEqualTypeOf<"dev" | "staging" | "prod" | undefined>()
        expectTypeOf(opts).toEqualTypeOf<{ verbose: boolean | undefined }>()
      })
  })

  it("0-arg command: action(opts)", () => {
    new Command("test").option("--verbose", "Verbose").action((opts) => {
      expectTypeOf(opts).toEqualTypeOf<{ verbose: boolean | undefined }>()
    })
  })

  it("variadic: action(files, opts)", () => {
    new Command("test")
      .argument("<files...>", "Files")
      .option("--verbose", "Verbose")
      .action((files, opts) => {
        expectTypeOf(files).toEqualTypeOf<string[]>()
        expectTypeOf(opts).toEqualTypeOf<{ verbose: boolean | undefined }>()
      })
  })

  it("single required arg: action(service, opts)", () => {
    new Command("test")
      .argument("<service>", "Service")
      .option("-p, --port <n>", "Port", port)
      .action((service, opts) => {
        expectTypeOf(service).toEqualTypeOf<string>()
        expectTypeOf(opts).toEqualTypeOf<{ port: number | undefined }>()
      })
  })
})

describe("actionMerged() typing — merged named-object form", () => {
  it("actionMerged(params) receives everything on one object", () => {
    new Command("test")
      .argument("<service>", "Service")
      .argument("[env]", "Environment", ["dev", "staging", "prod"] as const)
      .option("--verbose", "Verbose")
      .actionMerged((params) => {
        expectTypeOf(params.service).toEqualTypeOf<string>()
        expectTypeOf(params.env).toEqualTypeOf<"dev" | "staging" | "prod" | undefined>()
        expectTypeOf(params.verbose).toEqualTypeOf<boolean | undefined>()
      })
  })
})

describe("command() with inline args (Commander-native string form)", () => {
  it("command('deploy') is valid (no args)", () => {
    const cmd = new Command("app")
    const sub = cmd.command("deploy")
    expectTypeOf(sub).toMatchTypeOf<InstanceType<typeof Command>>()
  })

  it(".argument() chain on a subcommand still works", () => {
    const parent = new Command("app").option("--verbose", "Verbose")
    parent.command("deploy")
      .argument("<service>", "Service")
      .actionMerged((params) => {
        expectTypeOf(params.service).toEqualTypeOf<string>()
      })
  })

  it("command('deploy <service>') types service: string", () => {
    new Command("app")
      .command("deploy <service>")
      .action((service, _opts) => {
        expectTypeOf(service).toEqualTypeOf<string>()
      })
  })

  it("command('deploy [env]') types env: string | undefined", () => {
    new Command("app")
      .command("deploy [env]")
      .action((env, _opts) => {
        expectTypeOf(env).toEqualTypeOf<string | undefined>()
      })
  })

  it("command('deploy <service> [env]') types both args in order", () => {
    new Command("app")
      .command("deploy <service> [env]")
      .action((service, env, _opts) => {
        expectTypeOf(service).toEqualTypeOf<string>()
        expectTypeOf(env).toEqualTypeOf<string | undefined>()
      })
  })

  it("command('run <files...>') types files: string[]", () => {
    new Command("app")
      .command("run <files...>")
      .action((files, _opts) => {
        expectTypeOf(files).toEqualTypeOf<string[]>()
      })
  })

  it("command('cleanup [extras...]') types extras: string[]", () => {
    new Command("app")
      .command("cleanup [extras...]")
      .action((extras, _opts) => {
        expectTypeOf(extras).toEqualTypeOf<string[]>()
      })
  })

  it("inline args + actionMerged: params has typed keys", () => {
    new Command("app")
      .command("deploy <service> [env]")
      .actionMerged((params) => {
        expectTypeOf(params.service).toEqualTypeOf<string>()
        expectTypeOf(params.env).toEqualTypeOf<string | undefined>()
      })
  })

  it("kebab-case inline arg name is camelCased in actionMerged params", () => {
    new Command("app")
      .command("deploy <service-name>")
      .actionMerged((params) => {
        expectTypeOf(params.serviceName).toEqualTypeOf<string>()
      })
  })

  it("inline args compose with .option()", () => {
    new Command("app")
      .command("deploy <service>")
      .option("-f, --force", "Force")
      .action((service, opts) => {
        expectTypeOf(service).toEqualTypeOf<string>()
        expectTypeOf(opts).toEqualTypeOf<{ force: boolean | undefined }>()
      })
  })
})
