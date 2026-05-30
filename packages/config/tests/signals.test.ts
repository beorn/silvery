import { mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { effect } from "alien-signals"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { z } from "zod"
import { loadConfig } from "../src/config.ts"
import { defineKind } from "../src/kind.ts"
import type { Config } from "../src/types.ts"

const AcpKind = defineKind({
  name: "acp",
  schema: z
    .object({
      agent: z.string(),
      account: z.string().optional(),
      model: z.string().optional(),
      bare: z.boolean().optional(),
      label: z.string().optional(),
    })
    .strict(),
  pathField: "agent",
  reservedKeys: ["default"],
  coerce: { bare: "boolean" },
})

let tmpDir: string
let config: Config

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "silvery-config-signals-"))
  await writeFile(
    join(tmpDir, "config.yaml"),
    `ai:
  acp:
    default: claude-work
    claude-work: "claude-code?account=work&bare"
    codex: "codex"
`,
  )
  config = await loadConfig({ path: join(tmpDir, "config.yaml") })
})

afterEach(() => {
  config.unwatch()
})

describe("Config.signal — deep-key reactivity", () => {
  it("returns the current value on read", () => {
    const sig = config.signal<string>("ai.acp.default")
    expect(sig()).toBe("claude-work")
  })

  it("fires effect when the value changes via set()", () => {
    const sig = config.signal<string>("ai.acp.default")
    const calls: Array<string | undefined> = []
    const dispose = effect(() => calls.push(sig()))
    config.set("ai.acp.default", "codex")
    expect(calls).toEqual(["claude-work", "codex"])
    dispose()
  })

  it("does NOT re-fire effect when set with the same value", () => {
    const sig = config.signal<string>("ai.acp.default")
    let count = 0
    const dispose = effect(() => {
      sig()
      count++
    })
    expect(count).toBe(1)
    config.set("ai.acp.default", "claude-work") // same value
    expect(count).toBe(1) // alien-signals' identity check
    dispose()
  })

  it("fires when an unrelated key changes only if the watched key derives differently", () => {
    const sig = config.signal<string>("ai.acp.default")
    let count = 0
    const dispose = effect(() => {
      sig()
      count++
    })
    expect(count).toBe(1)
    config.set("ai.acp.unrelated-key", "anything") // different key
    // _version bumped, but computed re-runs and yields the same value → no effect re-fire
    expect(count).toBe(1)
    dispose()
  })

  it("returns undefined for missing keys, fires when key is added", () => {
    const sig = config.signal<string>("ai.acp.brand-new")
    const calls: Array<string | undefined> = []
    const dispose = effect(() => calls.push(sig()))
    config.set("ai.acp.brand-new", "value")
    expect(calls).toEqual([undefined, "value"])
    dispose()
  })

  it("caches signal instances per key", () => {
    const sig1 = config.signal("ai.acp.default")
    const sig2 = config.signal("ai.acp.default")
    expect(sig1).toBe(sig2)
  })
})

describe("Config.rootSignal — root reactivity", () => {
  it("fires when any leaf changes", () => {
    const root = config.rootSignal()
    let count = 0
    const dispose = effect(() => {
      root()
      count++
    })
    expect(count).toBe(1)
    config.set("ai.acp.foo", "x")
    expect(count).toBe(2)
    config.set("ai.acp.bar", "y")
    expect(count).toBe(3)
    dispose()
  })
})

describe("Registry signals", () => {
  it("signalEntries reflects registry membership", () => {
    const acp = config.registry("ai.acp", AcpKind)
    const sig = acp.signalEntries()
    let lastNames: string[] = []
    const dispose = effect(() => {
      lastNames = sig()
        .map((e) => e.name)
        .sort()
    })
    expect(lastNames).toEqual(["claude-work", "codex"])
    acp.add("gemini", "gemini?model=2.5-pro")
    expect(lastNames).toEqual(["claude-work", "codex", "gemini"])
    acp.rm("codex")
    expect(lastNames).toEqual(["claude-work", "gemini"])
    dispose()
  })

  it("signalDefault tracks the active entry", () => {
    const acp = config.registry("ai.acp", AcpKind)
    const sig = acp.signalDefault()
    const calls: Array<string | undefined> = []
    const dispose = effect(() => {
      calls.push(sig()?.agent)
    })
    expect(calls).toEqual(["claude-code"])
    acp.setDefault("codex")
    expect(calls).toEqual(["claude-code", "codex"])
    dispose()
  })

  it("signalGet tracks one named entry", () => {
    const acp = config.registry("ai.acp", AcpKind)
    const sig = acp.signalGet("claude-work")
    let last: { account?: string } | undefined
    const dispose = effect(() => {
      last = sig()
    })
    expect(last?.account).toBe("work")
    config.set("ai.acp.claude-work", "claude-code?account=personal&bare")
    expect(last?.account).toBe("personal")
    dispose()
  })

  it("signalDefault fires when default points to a still-undefined entry", () => {
    const acp = config.registry("ai.acp", AcpKind)
    const sig = acp.signalDefault()
    const dispose = effect(() => sig())
    acp.setDefault("not-yet-added")
    expect(sig()).toBeUndefined()
    acp.add("not-yet-added", "codex?model=gpt-5")
    expect(sig()?.agent).toBe("codex")
    dispose()
  })
})
