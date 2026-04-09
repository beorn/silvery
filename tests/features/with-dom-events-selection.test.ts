/**
 * withDomEvents — composition integration tests.
 *
 * Tests the wiring between withDomEvents, InputRouter, and CapabilityRegistry.
 * Selection is now handled by create-app's inline event loop and exposed
 * via a bridge SelectionFeature in the capability registry — withDomEvents
 * no longer creates or dispatches selection events.
 *
 * Verifies that:
 * - withDomEvents creates and exposes capabilityRegistry, inputRouter
 * - InputRouter is registered in the capability registry
 * - CapabilityRegistry is shared between withTerminal and withDomEvents
 */

import { describe, test, expect, vi } from "vitest"
import { withDomEvents, type AppWithDomEvents } from "../../packages/create/src/with-dom-events"
import { withTerminal, type AppWithTerminal } from "../../packages/create/src/with-terminal"
import { CLIPBOARD_CAPABILITY, INPUT_ROUTER } from "../../packages/create/src/internal/capabilities"
import type { ClipboardCapability } from "../../packages/ag-term/src/features/clipboard-capability"
import type { InputRouter } from "../../packages/create/src/internal/input-router"
import { createBuffer, type TerminalBuffer } from "../../packages/ag-term/src/buffer"

// ============================================================================
// Helpers
// ============================================================================

/** Create a minimal mock App for withDomEvents tests. */
function createMockApp(buffer?: TerminalBuffer) {
  const mockBuffer = buffer ?? createTestBuffer()
  const container = {
    type: "box",
    testID: "root",
    children: [],
    scrollRect: { x: 0, y: 0, width: 40, height: 10 },
    props: {},
  }

  return {
    getContainer: () => container,
    press: vi.fn(async () => {}),
    click: vi.fn(async () => {}),
    doubleClick: vi.fn(async () => {}),
    wheel: vi.fn(async () => {}),
    lastBuffer: () => mockBuffer,
    focusManager: undefined,
    // For invalidation wiring
    store: {
      setState: vi.fn((fn: (state: any) => any) => fn({})),
      getState: () => ({}),
      subscribe: () => () => {},
    },
  } as any
}

function createTestBuffer(): TerminalBuffer {
  const buffer = createBuffer(40, 10)
  const text = "Hello World"
  for (let i = 0; i < text.length; i++) {
    buffer.setCell(i, 0, { char: text[i]! })
  }
  return buffer
}

// ============================================================================
// Plugin composition
// ============================================================================

describe("withDomEvents — plugin composition", () => {
  test("exposes capabilityRegistry on enhanced app", () => {
    const mockApp = createMockApp()
    const enhanced = withDomEvents()(mockApp) as AppWithDomEvents

    expect(enhanced.capabilityRegistry).toBeDefined()
    expect(typeof enhanced.capabilityRegistry.register).toBe("function")
    expect(typeof enhanced.capabilityRegistry.get).toBe("function")
  })

  test("exposes inputRouter on enhanced app", () => {
    const mockApp = createMockApp()
    const enhanced = withDomEvents()(mockApp) as AppWithDomEvents

    expect(enhanced.inputRouter).toBeDefined()
    expect(typeof enhanced.inputRouter.registerMouseHandler).toBe("function")
    expect(typeof enhanced.inputRouter.dispatchMouse).toBe("function")
  })

  test("inputRouter is registered in capability registry", () => {
    const mockApp = createMockApp()
    const enhanced = withDomEvents()(mockApp) as AppWithDomEvents

    const router = enhanced.capabilityRegistry.get<InputRouter>(INPUT_ROUTER)
    expect(router).toBe(enhanced.inputRouter)
  })
})

// ============================================================================
// Invalidation wiring
// ============================================================================

describe("withDomEvents — invalidation", () => {
  test("invalidate() on inputRouter calls the invalidation mechanism", () => {
    const mockApp = createMockApp()
    const enhanced = withDomEvents()(mockApp) as AppWithDomEvents

    const storeSetState = mockApp.store.setState
    storeSetState.mockClear()

    enhanced.inputRouter.invalidate()

    expect(storeSetState).toHaveBeenCalled()
  })
})

// ============================================================================
// Capability registry sharing
// ============================================================================

describe("withDomEvents — registry sharing", () => {
  test("picks up existing capabilityRegistry from app (set by withTerminal)", () => {
    const mockApp = createMockApp()

    // Simulate what withTerminal does: create a mock process
    const mockProc = {
      stdin: { setRawMode: vi.fn(), resume: vi.fn(), on: vi.fn() } as any,
      stdout: { write: vi.fn(), columns: 80, rows: 24, on: vi.fn() } as any,
    }

    // Apply withTerminal first (creates registry + clipboard)
    const withTerm = withTerminal(mockProc as any)(mockApp) as AppWithTerminal

    // Apply withDomEvents (should pick up existing registry)
    const enhanced = withDomEvents()(withTerm as any) as AppWithDomEvents & AppWithTerminal

    // The clipboard from withTerminal should be accessible via the shared registry
    const clipboard = enhanced.capabilityRegistry.get<ClipboardCapability>(CLIPBOARD_CAPABILITY)
    expect(clipboard).toBeDefined()
    expect(typeof clipboard!.copy).toBe("function")
  })

  test("creates new registry when no existing one", () => {
    const mockApp = createMockApp()
    const enhanced = withDomEvents()(mockApp) as AppWithDomEvents

    // Should still have a registry
    expect(enhanced.capabilityRegistry).toBeDefined()
    // But no clipboard (withTerminal wasn't applied)
    expect(enhanced.capabilityRegistry.get(CLIPBOARD_CAPABILITY)).toBeUndefined()
  })
})
