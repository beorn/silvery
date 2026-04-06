/**
 * useCopyModeState Hook Tests
 *
 * Bead: km-silvery.interactions-runtime.phase-4
 *
 * Tests that useCopyModeState reads CopyModeFeature from CapabilityRegistryContext
 * and reactively subscribes to state changes via useSyncExternalStore.
 */

import React from "react"
import { describe, test, expect } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, Text, CapabilityRegistryContext, useCopyModeState } from "@silvery/ag-react"
import type { CapabilityLookup } from "@silvery/ag-react/context"

const COPY_MODE_CAPABILITY = Symbol.for("silvery.copy-mode")

/** Create a minimal mock CopyModeFeature for testing. */
function createMockCopyModeFeature(
  initialState = {
    active: false,
    cursor: { col: 0, row: 0 },
    visual: false,
    visualLine: false,
    anchor: null as { col: number; row: number } | null,
    bufferWidth: 80,
    bufferHeight: 24,
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

describe("useCopyModeState", () => {
  test("returns undefined when capability not registered", () => {
    const r = createRenderer({ cols: 40, rows: 5 })

    function TestApp() {
      const copyMode = useCopyModeState()
      return <Text>{copyMode === undefined ? "undefined" : "defined"}</Text>
    }

    const app = r(<TestApp />)
    expect(app.text).toContain("undefined")
  })

  test("returns undefined when registry exists but copy-mode not registered", () => {
    const r = createRenderer({ cols: 40, rows: 5 })
    const registry = createMockRegistry()

    function TestApp() {
      const copyMode = useCopyModeState()
      return <Text>{copyMode === undefined ? "undefined" : "defined"}</Text>
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
    const feature = createMockCopyModeFeature()
    const registry = createMockRegistry([[COPY_MODE_CAPABILITY, feature]])

    function TestApp() {
      const copyMode = useCopyModeState()
      return (
        <Box flexDirection="column">
          <Text>active:{String(copyMode?.active)}</Text>
          <Text>visual:{String(copyMode?.visual)}</Text>
        </Box>
      )
    }

    const app = r(
      <CapabilityRegistryContext.Provider value={registry}>
        <TestApp />
      </CapabilityRegistryContext.Provider>,
    )
    expect(app.text).toContain("active:false")
    expect(app.text).toContain("visual:false")
  })

  test("updates reactively on state change", () => {
    const r = createRenderer({ cols: 60, rows: 5 })
    const feature = createMockCopyModeFeature()
    const registry = createMockRegistry([[COPY_MODE_CAPABILITY, feature]])

    function TestApp() {
      const copyMode = useCopyModeState()
      return (
        <Box flexDirection="column">
          <Text>active:{String(copyMode?.active)}</Text>
          <Text>visual:{String(copyMode?.visual)}</Text>
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

    // Enter copy mode with visual selection, then flush via rerender
    feature.setState({
      active: true,
      cursor: { col: 5, row: 3 },
      visual: true,
      visualLine: false,
      anchor: { col: 0, row: 3 },
      bufferWidth: 80,
      bufferHeight: 24,
    })
    app.rerender(element)

    expect(app.text).toContain("active:true")
    expect(app.text).toContain("visual:true")
  })
})
