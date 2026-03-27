import { describe, it, expectTypeOf } from "vitest"
import { Command } from "../src/index.ts"
import type { OptionValues } from "../src/index.ts"

describe("Command type behavior", () => {
  it("opts() returns OptionValues", () => {
    const cmd = new Command("test").option("-v, --verbose", "Verbose")
    type Opts = ReturnType<typeof cmd.opts>
    expectTypeOf<Opts>().toEqualTypeOf<OptionValues>()
  })

  it("Command is a subclass of Commander's Command", () => {
    const cmd = new Command("test")
    // Should be usable wherever Commander's Command is expected
    expectTypeOf(cmd).toMatchTypeOf<InstanceType<typeof Command>>()
  })

  it("option() returns Command for chaining", () => {
    const cmd = new Command("test")
    const result = cmd.option("-v, --verbose", "Verbose")
    expectTypeOf(result).toEqualTypeOf<typeof cmd>()
  })
})
