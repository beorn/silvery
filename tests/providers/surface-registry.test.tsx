/**
 * SurfaceRegistry tests.
 *
 * Tests the registry logic via component rendering with createRenderer.
 * Verifies register, unregister, focus tracking, and surface lookup.
 *
 * Note: SurfaceRegistry stores surfaces in refs (not state), so registration
 * must happen synchronously during render (not in useEffect) to be visible
 * in the same render pass.
 */

import React, { useRef } from "react"
import { describe, test, expect, vi } from "vitest"
import { createRenderer, stripAnsi } from "@silvery/test"
import { Text } from "../../src/index.js"
import { SurfaceRegistryProvider, useSurfaceRegistry } from "../../packages/react/src/providers/SurfaceRegistry"
import type { TextSurface } from "../../packages/term/src/text-surface"

// ============================================================================
// Helpers
// ============================================================================

function createMockSurface(id: string): TextSurface {
  return {
    id,
    document: { getRows: () => [], totalRows: 0 } as any,
    getText: () => `text-${id}`,
    search: () => [],
    hitTest: () => null,
    notifyContentChange: () => {},
    reveal: vi.fn(),
    subscribe: () => () => {},
    capabilities: { searchableHistory: false, selectableHistory: false, overlayHistory: false, paneSafe: false },
  }
}

/**
 * Registers surfaces synchronously during render so they're visible
 * in the same render pass.
 */
function useRegisterSurfaces(surfaces: TextSurface[], focusId?: string | null) {
  const reg = useSurfaceRegistry()
  const didRegister = useRef(false)
  if (!didRegister.current) {
    didRegister.current = true
    for (const s of surfaces) reg.register(s)
    if (focusId !== undefined) reg.setFocused(focusId)
  }
  return reg
}

// ============================================================================
// Tests
// ============================================================================

describe("SurfaceRegistry", () => {
  test("register and retrieve surfaces", () => {
    const s1 = createMockSurface("s1")
    const s2 = createMockSurface("s2")

    function Inspector() {
      const reg = useRegisterSurfaces([s1, s2])
      return <Text>{`count:${reg.getAllSurfaces().length} s1:${reg.getSurface("s1")?.id ?? "null"}`}</Text>
    }

    const r = createRenderer({ cols: 60, rows: 5 })
    const app = r(
      <SurfaceRegistryProvider>
        <Inspector />
      </SurfaceRegistryProvider>,
    )

    const text = stripAnsi(app.text)
    expect(text).toContain("count:2")
    expect(text).toContain("s1:s1")
  })

  test("getSurface returns null for unknown id", () => {
    function Inspector() {
      const reg = useSurfaceRegistry()
      return <Text>{`result:${reg.getSurface("nonexistent") === null ? "null" : "found"}`}</Text>
    }

    const r = createRenderer({ cols: 40, rows: 3 })
    const app = r(
      <SurfaceRegistryProvider>
        <Inspector />
      </SurfaceRegistryProvider>,
    )

    expect(stripAnsi(app.text)).toContain("result:null")
  })

  test("setFocused and getFocusedSurface", () => {
    const s1 = createMockSurface("s1")
    const s2 = createMockSurface("s2")

    function Inspector() {
      const reg = useRegisterSurfaces([s1, s2], "s2")
      return <Text>{`focused:${reg.getFocusedSurface()?.id ?? "none"}`}</Text>
    }

    const r = createRenderer({ cols: 40, rows: 3 })
    const app = r(
      <SurfaceRegistryProvider>
        <Inspector />
      </SurfaceRegistryProvider>,
    )

    expect(stripAnsi(app.text)).toContain("focused:s2")
  })

  test("no focus set reports null", () => {
    const s1 = createMockSurface("s1")

    function Inspector() {
      const reg = useRegisterSurfaces([s1])
      return <Text>{`focused:${reg.getFocusedSurface()?.id ?? "none"}`}</Text>
    }

    const r = createRenderer({ cols: 40, rows: 3 })
    const app = r(
      <SurfaceRegistryProvider>
        <Inspector />
      </SurfaceRegistryProvider>,
    )

    expect(stripAnsi(app.text)).toContain("focused:none")
  })

  test("unregister removes surface and clears focus if focused", () => {
    const s1 = createMockSurface("s1")

    function Inspector() {
      const reg = useSurfaceRegistry()
      const didInit = useRef(false)
      if (!didInit.current) {
        didInit.current = true
        reg.register(s1)
        reg.setFocused("s1")
        reg.unregister("s1")
      }
      const focused = reg.getFocusedSurface()
      const found = reg.getSurface("s1")
      return <Text>{`focused:${focused?.id ?? "none"} found:${found?.id ?? "null"}`}</Text>
    }

    const r = createRenderer({ cols: 60, rows: 3 })
    const app = r(
      <SurfaceRegistryProvider>
        <Inspector />
      </SurfaceRegistryProvider>,
    )

    const text = stripAnsi(app.text)
    expect(text).toContain("focused:none")
    expect(text).toContain("found:null")
  })

  test("getAllSurfaces returns all registered surfaces", () => {
    const surfaces = [createMockSurface("a"), createMockSurface("b"), createMockSurface("c")]

    function Inspector() {
      const reg = useRegisterSurfaces(surfaces)
      const ids = reg
        .getAllSurfaces()
        .map((s) => s.id)
        .sort()
        .join(",")
      return <Text>{`ids:${ids || "(empty)"}`}</Text>
    }

    const r = createRenderer({ cols: 40, rows: 3 })
    const app = r(
      <SurfaceRegistryProvider>
        <Inspector />
      </SurfaceRegistryProvider>,
    )

    expect(stripAnsi(app.text)).toContain("ids:a,b,c")
  })
})
