/**
 * useSelection Hook Tests
 *
 * Bead: km-silvery.interactions-runtime.phase-4
 *
 * Tests that useSelection reads SelectionFeature from CapabilityRegistryContext
 * and reactively subscribes to state changes via useSyncExternalStore.
 */

import React from "react"
import { describe, test, expect } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, Text, CapabilityRegistryContext, useSelection } from "@silvery/ag-react"
import type { CapabilityLookup } from "@silvery/ag-react/context"

const SELECTION_CAPABILITY = Symbol.for("silvery.selection")

/** Create a minimal mock SelectionFeature for testing. */
function createMockSelectionFeature(initialState = { range: null, selecting: false, source: null, granularity: "character" as const, scope: null }) {
  let state = initialState
  const listeners = new Set<() => void>()
  return {
    get state() { return state },
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    setState(newState: typeof state) {
      state = newState
      for (const listener of listeners) listener()
    },
  }
}

/** Create a CapabilityLookup registry backed by a Map. */
function createMockRegistry(entries: [symbol, unknown][] = []): CapabilityLookup {
  const map = new Map<symbol, unknown>(entries)
  return { get: <T,>(key: symbol) => map.get(key) as T | undefined }
}

describe("useSelection", () => {
  test("returns undefined when capability not registered", () => {
    const r = createRenderer({ cols: 40, rows: 5 })

    function TestApp() {
      const selection = useSelection()
      return <Text>{selection === undefined ? "undefined" : "defined"}</Text>
    }

    // No CapabilityRegistryContext provider — registry is null
    const app = r(<TestApp />)
    expect(app.text).toContain("undefined")
  })

  test("returns undefined when registry exists but selection not registered", () => {
    const r = createRenderer({ cols: 40, rows: 5 })
    const registry = createMockRegistry() // empty registry

    function TestApp() {
      const selection = useSelection()
      return <Text>{selection === undefined ? "undefined" : "defined"}</Text>
    }

    const app = r(
      <CapabilityRegistryContext.Provider value={registry}>
        <TestApp />
      </CapabilityRegistryContext.Provider>,
    )
    expect(app.text).toContain("undefined")
  })

  test("returns state when capability registered", () => {
    const r = createRenderer({ cols: 60, rows: 5 })
    const feature = createMockSelectionFeature()
    const registry = createMockRegistry([[SELECTION_CAPABILITY, feature]])

    function TestApp() {
      const selection = useSelection()
      return (
        <Box flexDirection="column">
          <Text>selecting:{String(selection?.selecting)}</Text>
          <Text>range:{selection?.range === null ? "null" : "present"}</Text>
        </Box>
      )
    }

    const app = r(
      <CapabilityRegistryContext.Provider value={registry}>
        <TestApp />
      </CapabilityRegistryContext.Provider>,
    )
    expect(app.text).toContain("selecting:false")
    expect(app.text).toContain("range:null")
  })

  test("updates reactively on state change", () => {
    const r = createRenderer({ cols: 60, rows: 5 })
    const feature = createMockSelectionFeature()
    const registry = createMockRegistry([[SELECTION_CAPABILITY, feature]])

    function TestApp() {
      const selection = useSelection()
      return <Text>selecting:{String(selection?.selecting)}</Text>
    }

    const element = (
      <CapabilityRegistryContext.Provider value={registry}>
        <TestApp />
      </CapabilityRegistryContext.Provider>
    )
    const app = r(element)
    expect(app.text).toContain("selecting:false")

    // Mutate state and notify subscribers, then flush via rerender
    feature.setState({
      range: { startCol: 0, startRow: 0, endCol: 5, endRow: 0 },
      selecting: true,
      source: "mouse" as const,
      granularity: "character" as const,
      scope: null,
    })
    app.rerender(element)

    expect(app.text).toContain("selecting:true")
  })
})
