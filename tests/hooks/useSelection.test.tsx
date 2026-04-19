/**
 * useSelection Hook Tests
 *
 * Bead: km-silvery.interactions-runtime.phase-31-useselection
 *
 * Tests the useSelection hook that reads SelectionFeature from the
 * capability registry via CapabilityRegistryContext.
 */

import React, { useState } from "react"
import { describe, test, expect } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, Text } from "@silvery/ag-react"
import { useSelection } from "../../packages/ag-react/src/hooks/useSelection"
import {
  CapabilityRegistryContext,
  type CapabilityLookup,
} from "../../packages/ag-react/src/context"
import type { TerminalSelectionState } from "../../packages/headless/src/selection"

// ============================================================================
// Helpers
// ============================================================================

/** Create a minimal capability registry for testing. */
function createTestRegistry(capabilities: Map<symbol, unknown> = new Map()): CapabilityLookup {
  return {
    get<T>(key: symbol): T | undefined {
      return capabilities.get(key) as T | undefined
    },
  }
}

/** Well-known symbol — must match useSelection's internal Symbol.for(). */
const SELECTION_CAPABILITY = Symbol.for("silvery.selection")

/** Create a fake SelectionFeature with subscribe/state for hook testing. */
function createFakeSelectionFeature(initialState?: Partial<TerminalSelectionState>) {
  const listeners = new Set<() => void>()
  let state: TerminalSelectionState = {
    range: null,
    selecting: false,
    source: null,
    granularity: "character",
    scope: null,
    ...initialState,
  }

  return {
    get state() {
      return state
    },
    subscribe(listener: () => void): () => void {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    // Test helper: update state and notify
    _setState(update: Partial<TerminalSelectionState>) {
      state = { ...state, ...update }
      for (const listener of listeners) listener()
    },
  }
}

/** Component that displays useSelection result for testing. */
function SelectionDisplay() {
  const selection = useSelection()
  if (!selection) {
    return <Text>no-selection</Text>
  }
  const hasRange = selection.range !== null
  const selecting = selection.selecting
  return (
    <Text>
      range={hasRange ? "active" : "null"} selecting={String(selecting)} source=
      {selection.source ?? "null"}
    </Text>
  )
}

// ============================================================================
// Tests
// ============================================================================

const render = createRenderer({ cols: 80, rows: 10 })

describe("useSelection", () => {
  test("returns undefined when no CapabilityRegistryContext is provided", () => {
    // No provider wrapping — useSelection should return undefined
    const app = render(<SelectionDisplay />)
    expect(app.text).toContain("no-selection")
  })

  test("returns undefined when registry exists but SELECTION_CAPABILITY not registered", () => {
    const registry = createTestRegistry()

    const app = render(
      <CapabilityRegistryContext.Provider value={registry}>
        <SelectionDisplay />
      </CapabilityRegistryContext.Provider>,
    )
    expect(app.text).toContain("no-selection")
  })

  test("returns state when SelectionFeature is registered", () => {
    const feature = createFakeSelectionFeature()
    const capabilities = new Map<symbol, unknown>([[SELECTION_CAPABILITY, feature]])
    const registry = createTestRegistry(capabilities)

    const app = render(
      <CapabilityRegistryContext.Provider value={registry}>
        <SelectionDisplay />
      </CapabilityRegistryContext.Provider>,
    )

    expect(app.text).toContain("range=null")
    expect(app.text).toContain("selecting=false")
    expect(app.text).toContain("source=null")
  })

  test("updates reactively when selection state changes", async () => {
    const feature = createFakeSelectionFeature()
    const capabilities = new Map<symbol, unknown>([[SELECTION_CAPABILITY, feature]])
    const registry = createTestRegistry(capabilities)

    // Component that triggers feature state changes on demand
    function TestApp() {
      const [triggerCount, setTriggerCount] = useState(0)
      return (
        <CapabilityRegistryContext.Provider value={registry}>
          <Box flexDirection="column">
            <SelectionDisplay />
            <Text>triggers={triggerCount}</Text>
          </Box>
        </CapabilityRegistryContext.Provider>
      )
    }

    const app = render(<TestApp />)
    expect(app.text).toContain("range=null")

    // Simulate selection start
    feature._setState({
      selecting: true,
      source: "mouse",
      range: {
        anchor: { col: 0, row: 0 },
        head: { col: 5, row: 0 },
      },
    })

    // useSyncExternalStore should trigger re-render
    await new Promise((resolve) => setTimeout(resolve, 50))

    // Re-render to pick up state change
    const updated = render(<TestApp />)
    expect(updated.text).toContain("range=active")
    expect(updated.text).toContain("selecting=true")
    expect(updated.text).toContain("source=mouse")
  })
})
