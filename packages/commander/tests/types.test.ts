import { describe, it, expectTypeOf } from "vitest"
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
    const cli = createCLI("test")
      .option("-v, --verbose", "Verbose")
      .option("-p, --port <n>", "Port")
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
})
