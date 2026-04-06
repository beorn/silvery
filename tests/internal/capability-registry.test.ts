/**
 * Tests for CapabilityRegistry — symbol-keyed service registry.
 *
 * Covers:
 * - Register + get returns capability
 * - Get before register returns undefined
 * - Re-register overwrites (last wins)
 * - Independent symbol keys don't collide
 */
import { describe, test, expect } from "vitest"
import { createCapabilityRegistry } from "../../packages/create/src/internal/capability-registry.ts"

describe("CapabilityRegistry", () => {
  test("register + get returns the capability", () => {
    const registry = createCapabilityRegistry()
    const key = Symbol("clipboard")
    const capability = { copy: () => {}, paste: () => "text" }

    registry.register(key, capability)

    expect(registry.get(key)).toBe(capability)
  })

  test("get before register returns undefined", () => {
    const registry = createCapabilityRegistry()
    const key = Symbol("missing")

    expect(registry.get(key)).toBeUndefined()
  })

  test("re-register overwrites (last wins)", () => {
    const registry = createCapabilityRegistry()
    const key = Symbol("clipboard")
    const first = { version: 1 }
    const second = { version: 2 }

    registry.register(key, first)
    registry.register(key, second)

    expect(registry.get(key)).toBe(second)
  })

  test("independent symbol keys don't collide", () => {
    const registry = createCapabilityRegistry()
    const keyA = Symbol("clipboard")
    const keyB = Symbol("selection")
    const capA = { type: "clipboard" }
    const capB = { type: "selection" }

    registry.register(keyA, capA)
    registry.register(keyB, capB)

    expect(registry.get(keyA)).toBe(capA)
    expect(registry.get(keyB)).toBe(capB)
  })

  test("symbols with same description are distinct keys", () => {
    const registry = createCapabilityRegistry()
    const key1 = Symbol("same")
    const key2 = Symbol("same")

    registry.register(key1, "first")
    registry.register(key2, "second")

    expect(registry.get(key1)).toBe("first")
    expect(registry.get(key2)).toBe("second")
  })
})
