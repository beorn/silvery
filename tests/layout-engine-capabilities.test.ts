/**
 * Phase A0.0.5 — Engine capability model
 *
 * Validates that:
 *   1. `EngineCapabilities` is required on every `LayoutEngine` (type-level contract)
 *   2. Both ship-today adapters (`flexily-zero`, `yoga`) declare all flags `false`
 *      (the flags flip as Phase A0.1 / A0.2 / A0.3 ship their primitives)
 *   3. `requireCapability()` throws with the documented one-line-fix message when
 *      the active engine lacks the named capability
 *   4. `requireCapability()` is silent (no-throw) when the active engine advertises
 *      the capability — verified via a test-fixture engine with all flags `true`
 *
 * See `@km/silvery/responsive-layout-architecture-reframe` for the spec.
 */
import { describe, expect, test } from "vitest"
import type {
  EngineCapabilities,
  LayoutConstants,
  LayoutEngine,
} from "@silvery/ag-term/layout-engine"
import { requireCapability, setLayoutEngine } from "@silvery/ag-term/layout-engine"
import { createFlexilyZeroEngine } from "@silvery/ag-term/adapters/flexily-zero-adapter"

// Minimal test-fixture engine — lets us flip capabilities at will without
// loading flexily or yoga WASM. Constants come from a real engine so we
// don't have to hand-roll branded-number constants.
function createFixtureEngine(name: string, caps: EngineCapabilities): LayoutEngine {
  const real = createFlexilyZeroEngine()
  return {
    name,
    constants: real.constants as LayoutConstants,
    createNode: () => real.createNode(),
    capabilities: Object.freeze(caps),
  }
}

const ALL_FALSE: EngineCapabilities = Object.freeze({
  containerQueries: false,
  containSize: false,
  containerQueryUnits: false,
  fitWidth: false,
  styleMathFunctions: false,
  childStyleMutation: false,
})

const ALL_TRUE: EngineCapabilities = Object.freeze({
  containerQueries: true,
  containSize: true,
  containerQueryUnits: true,
  fitWidth: true,
  styleMathFunctions: true,
  childStyleMutation: true,
})

describe("[A0.0.5] Layout engine capability model", () => {
  test("flexily-zero adapter declares A0.1-shipped capabilities true, A0.2/A0.3 still false", () => {
    const engine = createFlexilyZeroEngine()

    expect(engine.capabilities).toBeDefined()
    // ✓ A0.1 shipped — see vendor/flexily/docs/two-phase-layout.md
    expect(engine.capabilities.containerQueries).toBe(true)
    expect(engine.capabilities.containSize).toBe(true)
    expect(engine.capabilities.containerQueryUnits).toBe(true)
    expect(engine.capabilities.childStyleMutation).toBe(true)
    // → A0.2 (fitWidth single-pass lane snap)
    expect(engine.capabilities.fitWidth).toBe(false)
    // → A0.3 (math functions, late-bound per the contract doc)
    expect(engine.capabilities.styleMathFunctions).toBe(false)
  })

  test("capabilities object is frozen (no mutation after adapter creation)", () => {
    const engine = createFlexilyZeroEngine()
    expect(Object.isFrozen(engine.capabilities)).toBe(true)
  })

  test("requireCapability throws with documented message when active engine lacks capability", () => {
    setLayoutEngine(createFixtureEngine("flexily-zero", ALL_FALSE))

    expect(() => requireCapability("fitWidth", "<Box fitWidth>")).toThrow(
      /<Box fitWidth> requires layout engine capability "fitWidth"/,
    )
    expect(() => requireCapability("fitWidth", "<Box fitWidth>")).toThrow(/SILVERY_ENGINE=flexily/)
  })

  test("requireCapability includes the active engine name in the error", () => {
    setLayoutEngine(createFixtureEngine("yoga", ALL_FALSE))

    expect(() => requireCapability("containerQueries", "<Box containerQueries>")).toThrow(
      /current engine "yoga"/,
    )
  })

  test("requireCapability is silent when active engine advertises the capability", () => {
    setLayoutEngine(createFixtureEngine("test-future-flexily", ALL_TRUE))

    expect(() => requireCapability("fitWidth", "<Box fitWidth>")).not.toThrow()
    expect(() => requireCapability("containerQueries", "<Box containerQueries>")).not.toThrow()
    expect(() => requireCapability("containSize", "<Box containSize>")).not.toThrow()
    expect(() => requireCapability("containerQueryUnits", "cqi unit in 'padding'")).not.toThrow()
    expect(() => requireCapability("styleMathFunctions", "min() in 'width'")).not.toThrow()
    expect(() => requireCapability("childStyleMutation", "engine-internal CQ hook")).not.toThrow()
  })

  test("engine swap flips capability advertisements (per-call resolution, not cached)", () => {
    setLayoutEngine(createFixtureEngine("test-no-caps", ALL_FALSE))
    expect(() => requireCapability("fitWidth", "<Box fitWidth>")).toThrow()

    setLayoutEngine(createFixtureEngine("test-all-caps", ALL_TRUE))
    expect(() => requireCapability("fitWidth", "<Box fitWidth>")).not.toThrow()

    setLayoutEngine(createFixtureEngine("test-no-caps-2", ALL_FALSE))
    expect(() => requireCapability("fitWidth", "<Box fitWidth>")).toThrow()
  })

  test("requireCapability hints at the env-var fix path in the error message", () => {
    setLayoutEngine(createFixtureEngine("yoga", ALL_FALSE))

    // The error must give the user an actionable fix, not just "this doesn't work".
    expect(() => requireCapability("fitWidth", "<Box fitWidth>")).toThrow(
      /Switch to flexily.*SILVERY_ENGINE=flexily.*ensureDefaultLayoutEngine\("flexily"\)/s,
    )
  })
})
