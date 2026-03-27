import { describe, it, expect } from "vitest"
import { z } from "zod"
import { Command } from "../src/index.ts"
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
    const cmd = new Command("test").option("-p, --port <n>", "Port", z.coerce.number())
    cmd.parse(["node", "test", "--port", "3000"], { from: "node" })
    expect(cmd.opts().port).toBe(3000)
    expect(typeof cmd.opts().port).toBe("number")
  })

  it("validates via Standard Schema and throws on error", () => {
    const cmd = new Command("test").option("-p, --port <n>", "Port", z.coerce.number().min(1).max(65535))
    cmd.exitOverride()
    cmd.configureOutput({ writeErr: () => {} })
    expect(() => {
      cmd.parse(["node", "test", "--port", "99999"], { from: "node" })
    }).toThrow()
  })

  it("transforms via Standard Schema validate path", () => {
    const cmd = new Command("test").option(
      "--tags <t>",
      "Tags",
      z.string().transform((v) => v.split(",")),
    )
    cmd.parse(["node", "test", "--tags", "a,b,c"], { from: "node" })
    expect(cmd.opts().tags).toEqual(["a", "b", "c"])
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

    const cmd = new Command("test").option("-n, --count <n>", "Count", positiveNumber)
    cmd.parse(["node", "test", "--count", "42"], { from: "node" })
    expect(cmd.opts().count).toBe(42)
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

    const cmd = new Command("test").option("-n, --count <n>", "Count", positiveNumber)
    cmd.exitOverride()
    cmd.configureOutput({ writeErr: () => {} })
    expect(() => {
      cmd.parse(["node", "test", "--count", "-5"], { from: "node" })
    }).toThrow()
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

    const cmd = new Command("test").option("-n, --count <n>", "Count", legacySchema)
    cmd.parse(["node", "test", "--count", "42"], { from: "node" })
    expect(cmd.opts().count).toBe(42)
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

    const cmd = new Command("test").option("-n, --count <n>", "Count", legacySchema)
    cmd.exitOverride()
    cmd.configureOutput({ writeErr: () => {} })
    expect(() => {
      cmd.parse(["node", "test", "--count", "abc"], { from: "node" })
    }).toThrow()
  })
})
