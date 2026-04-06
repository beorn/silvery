/**
 * useFindState Hook Tests
 *
 * Bead: km-silvery.interactions-runtime.phase-4
 *
 * Tests that useFindState reads FindFeature from CapabilityRegistryContext
 * and reactively subscribes to state changes via useSyncExternalStore.
 */

import React from "react"
import { describe, test, expect } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, Text, CapabilityRegistryContext, useFindState } from "@silvery/ag-react"
import type { CapabilityLookup } from "@silvery/ag-react/context"

const FIND_CAPABILITY = Symbol.for("silvery.find")

/** Create a minimal mock FindFeature for testing. */
function createMockFindFeature(
  initialState = {
    query: null as string | null,
    matches: [] as unknown[],
    currentIndex: -1,
    active: false,
    providerResults: [] as unknown[],
    providerSearching: false,
  },
) {
  let state = initialState
  const listeners = new Set<() => void>()
  return {
    get state() {
      return state
    },
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
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

describe("useFindState", () => {
  test("returns undefined when capability not registered", () => {
    const r = createRenderer({ cols: 40, rows: 5 })

    function TestApp() {
      const find = useFindState()
      return <Text>{find === undefined ? "undefined" : "defined"}</Text>
    }

    const app = r(<TestApp />)
    expect(app.text).toContain("undefined")
  })

  test("returns undefined when registry exists but find not registered", () => {
    const r = createRenderer({ cols: 40, rows: 5 })
    const registry = createMockRegistry()

    function TestApp() {
      const find = useFindState()
      return <Text>{find === undefined ? "undefined" : "defined"}</Text>
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
    const feature = createMockFindFeature()
    const registry = createMockRegistry([[FIND_CAPABILITY, feature]])

    function TestApp() {
      const find = useFindState()
      return (
        <Box flexDirection="column">
          <Text>active:{String(find?.active)}</Text>
          <Text>query:{find?.query === null ? "null" : find?.query}</Text>
        </Box>
      )
    }

    const app = r(
      <CapabilityRegistryContext.Provider value={registry}>
        <TestApp />
      </CapabilityRegistryContext.Provider>,
    )
    expect(app.text).toContain("active:false")
    expect(app.text).toContain("query:null")
  })

  test("updates reactively on state change", () => {
    const r = createRenderer({ cols: 60, rows: 5 })
    const feature = createMockFindFeature()
    const registry = createMockRegistry([[FIND_CAPABILITY, feature]])

    function TestApp() {
      const find = useFindState()
      return (
        <Box flexDirection="column">
          <Text>active:{String(find?.active)}</Text>
          <Text>matches:{find?.matches.length ?? 0}</Text>
        </Box>
      )
    }

    const element = (
      <CapabilityRegistryContext.Provider value={registry}>
        <TestApp />
      </CapabilityRegistryContext.Provider>
    )
    const app = r(element)
    expect(app.text).toContain("active:false")
    expect(app.text).toContain("matches:0")

    // Activate find with matches, then flush via rerender
    feature.setState({
      query: "hello",
      matches: [{ row: 0, startCol: 0, endCol: 5 }],
      currentIndex: 0,
      active: true,
      providerResults: [],
      providerSearching: false,
    })
    app.rerender(element)

    expect(app.text).toContain("active:true")
    expect(app.text).toContain("matches:1")
  })
})
