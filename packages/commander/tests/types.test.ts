import { describe, it, expectTypeOf } from "vitest"
import { z } from "zod"
import { createCLI } from "../src/index.ts"

describe("type inference", () => {
  it("infers boolean for bare flags", () => {
    const cli = createCLI("test").option("-v, --verbose", "Verbose")
    type Opts = ReturnType<typeof cli.opts>
    expectTypeOf<Opts>().toHaveProperty("verbose")
    expectTypeOf<Opts["verbose"]>().toEqualTypeOf<boolean | undefined>()
  })

  it("infers string for <value> flags", () => {
    const cli = createCLI("test").option("-p, --port <n>", "Port")
    type Opts = ReturnType<typeof cli.opts>
    expectTypeOf<Opts["port"]>().toEqualTypeOf<string | undefined>()
  })

  it("infers string | true for [value] flags", () => {
    const cli = createCLI("test").option("-o, --output [path]", "Output")
    type Opts = ReturnType<typeof cli.opts>
    expectTypeOf<Opts["output"]>().toEqualTypeOf<string | true | undefined>()
  })

  it("converts kebab-case to camelCase", () => {
    const cli = createCLI("test").option("--dry-run", "Dry run")
    type Opts = ReturnType<typeof cli.opts>
    expectTypeOf<Opts>().toHaveProperty("dryRun")
  })

  it("removes undefined when default is provided", () => {
    const cli = createCLI("test").option("-p, --port <n>", "Port", "8080")
    type Opts = ReturnType<typeof cli.opts>
    expectTypeOf<Opts["port"]>().toEqualTypeOf<string>()
  })

  it("accumulates multiple options", () => {
    const cli = createCLI("test").option("-v, --verbose", "Verbose").option("-p, --port <n>", "Port")
    type Opts = ReturnType<typeof cli.opts>
    expectTypeOf<Opts>().toHaveProperty("verbose")
    expectTypeOf<Opts>().toHaveProperty("port")
  })

  it("falls back to short flag name when no long flag", () => {
    const cli = createCLI("test").option("-v", "Verbose")
    type Opts = ReturnType<typeof cli.opts>
    expectTypeOf<Opts>().toHaveProperty("v")
  })

  it("infers boolean for negated --no-X flags", () => {
    const cli = createCLI("test").option("--no-color", "Disable color")
    type Opts = ReturnType<typeof cli.opts>
    expectTypeOf<Opts>().toHaveProperty("color")
    expectTypeOf<Opts["color"]>().toEqualTypeOf<boolean | undefined>()
  })

  it("handles negated kebab-case flags", () => {
    const cli = createCLI("test").option("--no-dry-run", "Disable dry run")
    type Opts = ReturnType<typeof cli.opts>
    expectTypeOf<Opts>().toHaveProperty("dryRun")
    expectTypeOf<Opts["dryRun"]>().toEqualTypeOf<boolean | undefined>()
  })

  // Negative tests
  it("does not allow accessing non-existent options", () => {
    const cli = createCLI("test").option("-v, --verbose", "Verbose")
    type Opts = ReturnType<typeof cli.opts>
    // @ts-expect-error — 'port' was never declared
    type _Bad = Opts["port"]
  })

  // --- Custom parser type inference ---

  it("infers number from parseInt parser", () => {
    const cli = createCLI("test").option("-p, --port <n>", "Port", parseInt)
    type Opts = ReturnType<typeof cli.opts>
    expectTypeOf<Opts["port"]>().toEqualTypeOf<number>()
  })

  it("infers number from Number parser", () => {
    const cli = createCLI("test").option("-t, --timeout <ms>", "Timeout", Number)
    type Opts = ReturnType<typeof cli.opts>
    expectTypeOf<Opts["timeout"]>().toEqualTypeOf<number>()
  })

  it("infers string[] from split parser", () => {
    const cli = createCLI("test").option("--tags <t>", "Tags", (v: string) => v.split(","))
    type Opts = ReturnType<typeof cli.opts>
    expectTypeOf<Opts["tags"]>().toEqualTypeOf<string[]>()
  })

  it("infers custom type from parser", () => {
    const cli = createCLI("test").option("--flag <v>", "Flag", (v: string) => v === "true")
    type Opts = ReturnType<typeof cli.opts>
    expectTypeOf<Opts["flag"]>().toEqualTypeOf<boolean>()
  })

  it("parser with default value preserves return type", () => {
    const cli = createCLI("test").option("-p, --port <n>", "Port", parseInt, 8080)
    type Opts = ReturnType<typeof cli.opts>
    expectTypeOf<Opts["port"]>().toEqualTypeOf<number>()
  })

  // --- Typed action handlers ---

  it("infers action handler params from arguments", () => {
    const cli = createCLI("test")
      .argument("<env>", "Environment")
      .argument("[tag]", "Tag")
      .option("-f, --force", "Force")
    // Verify it compiles with correct types
    cli.action((env: string, tag: string | undefined, opts: { force: boolean | undefined }) => {
      void env
      void tag
      void opts
    })
  })

  it("infers single required argument", () => {
    const cli = createCLI("test").argument("<file>", "File path").option("-v, --verbose", "Verbose")
    cli.action((file: string, opts: { verbose: boolean | undefined }) => {
      void file
      void opts
    })
  })

  it("infers single optional argument", () => {
    const cli = createCLI("test").argument("[file]", "Optional file")
    cli.action((file: string | undefined, opts: {}) => {
      void file
      void opts
    })
  })

  // --- Choices narrowing ---

  it("narrows choices to union", () => {
    const cli = createCLI("test").optionWithChoices("-e, --env <env>", "Environment", [
      "dev",
      "staging",
      "prod",
    ] as const)
    type Opts = ReturnType<typeof cli.opts>
    expectTypeOf<Opts["env"]>().toEqualTypeOf<"dev" | "staging" | "prod" | undefined>()
  })

  it("choices with kebab-case option name", () => {
    const cli = createCLI("test").optionWithChoices("--log-level <level>", "Log level", [
      "debug",
      "info",
      "warn",
      "error",
    ] as const)
    type Opts = ReturnType<typeof cli.opts>
    expectTypeOf<Opts["logLevel"]>().toEqualTypeOf<"debug" | "info" | "warn" | "error" | undefined>()
  })

  // --- .env() passthrough ---

  it("env() does not change option type", () => {
    const cli = createCLI("test").option("-p, --port <n>", "Port").env("PORT")
    type Opts = ReturnType<typeof cli.opts>
    expectTypeOf<Opts["port"]>().toEqualTypeOf<string | undefined>()
  })

  // --- Mixed features ---

  it("accumulates parser options with regular options", () => {
    const cli = createCLI("test")
      .option("-v, --verbose", "Verbose")
      .option("-p, --port <n>", "Port", parseInt)
      .option("--host <addr>", "Host")
    type Opts = ReturnType<typeof cli.opts>
    expectTypeOf<Opts["verbose"]>().toEqualTypeOf<boolean | undefined>()
    expectTypeOf<Opts["port"]>().toEqualTypeOf<number>()
    expectTypeOf<Opts["host"]>().toEqualTypeOf<string | undefined>()
  })

  it("accumulates choices with regular and parser options", () => {
    const cli = createCLI("test")
      .option("-v, --verbose", "Verbose")
      .option("-p, --port <n>", "Port", parseInt)
      .optionWithChoices("-e, --env <env>", "Env", ["dev", "prod"] as const)
    type Opts = ReturnType<typeof cli.opts>
    expectTypeOf<Opts["verbose"]>().toEqualTypeOf<boolean | undefined>()
    expectTypeOf<Opts["port"]>().toEqualTypeOf<number>()
    expectTypeOf<Opts["env"]>().toEqualTypeOf<"dev" | "prod" | undefined>()
  })

  // --- Zod schema type inference ---

  it("infers number from zod coerce schema", () => {
    const cli = createCLI("test").option("-p, --port <n>", "Port", z.coerce.number())
    type Opts = ReturnType<typeof cli.opts>
    expectTypeOf<Opts["port"]>().toEqualTypeOf<number>()
  })

  it("infers enum union from zod enum schema", () => {
    const cli = createCLI("test").option("-e, --env <env>", "Env", z.enum(["dev", "staging", "prod"]))
    type Opts = ReturnType<typeof cli.opts>
    expectTypeOf<Opts["env"]>().toEqualTypeOf<"dev" | "staging" | "prod">()
  })

  it("infers string[] from zod transform schema", () => {
    const cli = createCLI("test").option(
      "--tags <t>",
      "Tags",
      z.string().transform((v) => v.split(",")),
    )
    type Opts = ReturnType<typeof cli.opts>
    expectTypeOf<Opts["tags"]>().toEqualTypeOf<string[]>()
  })

  it("infers boolean from zod coerce boolean schema", () => {
    const cli = createCLI("test").option("--flag <v>", "Flag", z.coerce.boolean())
    type Opts = ReturnType<typeof cli.opts>
    expectTypeOf<Opts["flag"]>().toEqualTypeOf<boolean>()
  })

  it("accumulates zod options with regular options", () => {
    const cli = createCLI("test")
      .option("-v, --verbose", "Verbose")
      .option("-p, --port <n>", "Port", z.coerce.number())
      .option("--host <addr>", "Host")
    type Opts = ReturnType<typeof cli.opts>
    expectTypeOf<Opts["verbose"]>().toEqualTypeOf<boolean | undefined>()
    expectTypeOf<Opts["port"]>().toEqualTypeOf<number>()
    expectTypeOf<Opts["host"]>().toEqualTypeOf<string | undefined>()
  })
})
