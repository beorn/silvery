import { describe, test, expect } from "vitest"
import { defineModel, createModelRegistry } from "@silvery/model"

describe("defineModel", () => {
  test("creates a model definition", () => {
    const def = defineModel({
      name: "counter",
      create: () => ({ count: 0 }),
    })
    expect(def.name).toBe("counter")
  })
})

describe("createModelRegistry", () => {
  test("registers and retrieves models", () => {
    const registry = createModelRegistry()
    const def = defineModel({
      name: "counter",
      create: () => ({
        count: 0,
        increment() {
          this.count++
        },
      }),
    })
    const model = registry.register(def)
    expect(model.count).toBe(0)
    expect(registry.get("counter")).toBe(model)
    expect(registry.has("counter")).toBe(true)
  })

  test("returns existing instance on duplicate register", () => {
    const registry = createModelRegistry()
    const def = defineModel({ name: "x", create: () => ({ id: Math.random() }) })
    const first = registry.register(def)
    const second = registry.register(def)
    expect(first).toBe(second)
  })

  test("passes deps to create", () => {
    const registry = createModelRegistry()
    const def = defineModel({
      name: "greeter",
      deps: ["name"] as const,
      create: (deps: { name: string }) => ({ greeting: `Hello ${deps.name}` }),
    })
    const model = registry.register(def, { name: "World" })
    expect(model.greeting).toBe("Hello World")
  })

  test("get returns undefined for missing model", () => {
    const registry = createModelRegistry()
    expect(registry.get("nope")).toBeUndefined()
    expect(registry.has("nope")).toBe(false)
  })
})
