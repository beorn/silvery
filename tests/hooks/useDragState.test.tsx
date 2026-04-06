/**
 * useDragState Hook Tests
 *
 * Bead: km-silvery.interactions-runtime.phase-4
 *
 * Tests that useDragState reads DragFeature from CapabilityRegistryContext
 * and reactively subscribes to state changes via useSyncExternalStore.
 *
 * DragFeature.state is DragState | null (null = no active drag).
 * useDragState returns undefined when the feature is not installed at all.
 */

import React from "react"
import { describe, test, expect } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, Text, CapabilityRegistryContext, useDragState } from "@silvery/ag-react"
import type { CapabilityLookup } from "@silvery/ag-react/context"

const DRAG_CAPABILITY = Symbol.for("silvery.drag")

/** Create a minimal mock DragFeature for testing. */
function createMockDragFeature(initialState: unknown = null) {
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
    setState(newState: unknown) {
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

describe("useDragState", () => {
  test("returns undefined when capability not registered", () => {
    const r = createRenderer({ cols: 40, rows: 5 })

    function TestApp() {
      const drag = useDragState()
      return <Text>{drag === undefined ? "undefined" : "defined"}</Text>
    }

    const app = r(<TestApp />)
    expect(app.text).toContain("undefined")
  })

  test("returns undefined when registry exists but drag not registered", () => {
    const r = createRenderer({ cols: 40, rows: 5 })
    const registry = createMockRegistry()

    function TestApp() {
      const drag = useDragState()
      return <Text>{drag === undefined ? "undefined" : "defined"}</Text>
    }

    const app = r(
      <CapabilityRegistryContext.Provider value={registry}>
        <TestApp />
      </CapabilityRegistryContext.Provider>,
    )
    expect(app.text).toContain("undefined")
  })

  test("returns null when capability registered but no active drag", () => {
    const r = createRenderer({ cols: 60, rows: 5 })
    const feature = createMockDragFeature(null)
    const registry = createMockRegistry([[DRAG_CAPABILITY, feature]])

    function TestApp() {
      const drag = useDragState()
      return (
        <Box flexDirection="column">
          <Text>installed:{drag !== undefined ? "yes" : "no"}</Text>
          <Text>active:{drag === null ? "null" : "dragging"}</Text>
        </Box>
      )
    }

    const app = r(
      <CapabilityRegistryContext.Provider value={registry}>
        <TestApp />
      </CapabilityRegistryContext.Provider>,
    )
    expect(app.text).toContain("installed:yes")
    expect(app.text).toContain("active:null")
  })

  test("updates reactively on state change", () => {
    const r = createRenderer({ cols: 60, rows: 5 })
    const feature = createMockDragFeature(null)
    const registry = createMockRegistry([[DRAG_CAPABILITY, feature]])

    function TestApp() {
      const drag = useDragState()
      const active = drag !== undefined && drag !== null
      return <Text>dragging:{String(active)}</Text>
    }

    const element = (
      <CapabilityRegistryContext.Provider value={registry}>
        <TestApp />
      </CapabilityRegistryContext.Provider>
    )
    const app = r(element)
    expect(app.text).toContain("dragging:false")

    // Simulate drag start, then flush via rerender
    feature.setState({
      active: true,
      source: { testID: "draggable-item" },
      startPos: { x: 10, y: 5 },
      currentPos: { x: 15, y: 8 },
      dropTarget: null,
    })
    app.rerender(element)

    expect(app.text).toContain("dragging:true")
  })
})
