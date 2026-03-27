import { describe, it, expect, expectTypeOf } from "vitest"
import { z } from "zod"
import { createCLI } from "../src/index.ts"
import type { StandardSchemaV1 } from "../src/index.ts"

describe("Standard Schema detection", () => {
  // Modern Zod (>=3.24) implements Standard Schema v1 natively.
  // The option() method should detect ~standard before falling back to legacy Zod.

  it("detects Zod schema via Standard Schema interface", () => {
    const schema = z.coerce.number()
    // Zod 3.24+ has ~standard
    expect("~standard" in schema).toBe(true)
    expect((schema as any)["~standard"].version).toBe(1)
  })

  it("uses Standard Schema path for modern Zod", () => {
    const cli = createCLI("test").option("-p, --port <n>", "Port", z.coerce.number())
    cli.parse(["node", "test", "--port", "3000"], { from: "node" })
    expect(cli.opts().port).toBe(3000)
    expect(typeof cli.opts().port).toBe("number")
  })

  it("validates via Standard Schema and throws on error", () => {
    const cli = createCLI("test").option("-p, --port <n>", "Port", z.coerce.number().min(1).max(65535))
    cli._cmd.exitOverride()
    cli._cmd.configureOutput({ writeErr: () => {} })
    expect(() => {
      cli.parse(["node", "test", "--port", "99999"], { from: "node" })
    }).toThrow()
  })

  it("infers type from Zod via Standard Schema", () => {
    const cli = createCLI("test").option("-p, --port <n>", "Port", z.coerce.number())
    type Opts = ReturnType<typeof cli.opts>
    expectTypeOf<Opts["port"]>().toEqualTypeOf<number>()
  })

  it("infers enum union from Zod via Standard Schema", () => {
    const cli = createCLI("test").option("-e, --env <env>", "Env", z.enum(["dev", "staging", "prod"]))
    type Opts = ReturnType<typeof cli.opts>
    expectTypeOf<Opts["env"]>().toEqualTypeOf<"dev" | "staging" | "prod">()
  })

  it("transforms via Standard Schema validate path", () => {
    const cli = createCLI("test").option(
      "--tags <t>",
      "Tags",
      z.string().transform((v) => v.split(",")),
    )
    cli.parse(["node", "test", "--tags", "a,b,c"], { from: "node" })
    expect(cli.opts().tags).toEqual(["a", "b", "c"])
  })
})

describe("custom Standard Schema objects", () => {
  it("accepts a hand-rolled Standard Schema", () => {
    const positiveNumber: StandardSchemaV1<number> = {
      "~standard": {
        version: 1,
        vendor: "test",
        validate: (value) => {
          const n = Number(value)
          if (Number.isNaN(n) || n <= 0) return { issues: [{ message: `Expected positive number, got "${value}"` }] }
          return { value: n }
        },
      },
    }

    const cli = createCLI("test").option("-n, --count <n>", "Count", positiveNumber)
    cli.parse(["node", "test", "--count", "42"], { from: "node" })
    expect(cli.opts().count).toBe(42)
  })

  it("rejects invalid values from hand-rolled schema", () => {
    const positiveNumber: StandardSchemaV1<number> = {
      "~standard": {
        version: 1,
        vendor: "test",
        validate: (value) => {
          const n = Number(value)
          if (Number.isNaN(n) || n <= 0) return { issues: [{ message: `Expected positive number` }] }
          return { value: n }
        },
      },
    }

    const cli = createCLI("test").option("-n, --count <n>", "Count", positiveNumber)
    cli._cmd.exitOverride()
    cli._cmd.configureOutput({ writeErr: () => {} })
    expect(() => {
      cli.parse(["node", "test", "--count", "-5"], { from: "node" })
    }).toThrow()
  })

  it("infers type from hand-rolled Standard Schema", () => {
    const stringArray: StandardSchemaV1<string[]> = {
      "~standard": {
        version: 1,
        vendor: "test",
        validate: (value) => ({ value: String(value).split(",") }),
      },
    }

    const cli = createCLI("test").option("--items <s>", "Items", stringArray)
    type Opts = ReturnType<typeof cli.opts>
    expectTypeOf<Opts["items"]>().toEqualTypeOf<string[]>()
  })
})

describe("legacy Zod fallback", () => {
  it("handles schema with _def and parse but without ~standard", () => {
    // Simulate a pre-3.24 Zod schema
    const legacySchema = {
      _def: { type: "number" },
      parse(value: unknown): number {
        const n = Number(value)
        if (Number.isNaN(n)) throw new Error("Expected number")
        return n
      },
    }

    const cli = createCLI("test").option("-n, --count <n>", "Count", legacySchema)
    cli.parse(["node", "test", "--count", "42"], { from: "node" })
    expect(cli.opts().count).toBe(42)
  })

  it("throws on legacy Zod validation failure", () => {
    const legacySchema = {
      _def: { type: "number" },
      parse(value: unknown): number {
        const n = Number(value)
        if (Number.isNaN(n)) {
          const err: any = new Error("Validation failed")
          err.issues = [{ message: "Expected number" }]
          throw err
        }
        return n
      },
    }

    const cli = createCLI("test").option("-n, --count <n>", "Count", legacySchema)
    cli._cmd.exitOverride()
    cli._cmd.configureOutput({ writeErr: () => {} })
    expect(() => {
      cli.parse(["node", "test", "--count", "abc"], { from: "node" })
    }).toThrow()
  })
})
