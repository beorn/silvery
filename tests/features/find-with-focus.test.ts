/**
 * withFocus find integration tests.
 *
 * Tests that Ctrl+F opens find and Escape closes it when find is enabled via withFocus.
 */

import { describe, test, expect, vi } from "vitest"
import { createFindFeature } from "../../packages/ag-term/src/find-feature"
import { createBuffer } from "../../packages/ag-term/src/buffer"
import type { TerminalBuffer } from "../../packages/ag-term/src/buffer"
import { FIND_CAPABILITY, SELECTION_CAPABILITY, CLIPBOARD_CAPABILITY } from "../../packages/create/src/internal/capabilities"

// ============================================================================
// Helpers
// ============================================================================

function createTestBuffer(lines: string[]): TerminalBuffer {
  const width = Math.max(...lines.map((l) => l.length), 40)
  const height = lines.length || 10
  const buffer = createBuffer(width, height)
  for (let row = 0; row < lines.length; row++) {
    const line = lines[row]!
    for (let col = 0; col < line.length; col++) {
      buffer.setCell(col, row, { char: line[col]!, fg: null, bg: null })
    }
  }
  return buffer
}

// ============================================================================
// Capability symbols
// ============================================================================

describe("capability symbols", () => {
  test("FIND_CAPABILITY is a symbol", () => {
    expect(typeof FIND_CAPABILITY).toBe("symbol")
    expect(FIND_CAPABILITY.toString()).toBe("Symbol(silvery.find)")
  })

  test("SELECTION_CAPABILITY is a symbol", () => {
    expect(typeof SELECTION_CAPABILITY).toBe("symbol")
    expect(SELECTION_CAPABILITY.toString()).toBe("Symbol(silvery.selection)")
  })

  test("CLIPBOARD_CAPABILITY is a symbol", () => {
    expect(typeof CLIPBOARD_CAPABILITY).toBe("symbol")
    expect(CLIPBOARD_CAPABILITY.toString()).toBe("Symbol(silvery.clipboard)")
  })

  test("all capability symbols are distinct", () => {
    expect(FIND_CAPABILITY).not.toBe(SELECTION_CAPABILITY)
    expect(FIND_CAPABILITY).not.toBe(CLIPBOARD_CAPABILITY)
    expect(SELECTION_CAPABILITY).not.toBe(CLIPBOARD_CAPABILITY)
  })
})

// ============================================================================
// FindFeature with CapabilityRegistry
// ============================================================================

describe("FindFeature with CapabilityRegistry", () => {
  test("FindFeature can be registered and retrieved from a registry", () => {
    const { createCapabilityRegistry } = require("../../packages/create/src/internal/capability-registry")
    const registry = createCapabilityRegistry()

    const buffer = createTestBuffer(["hello world"])
    const feature = createFindFeature({
      getBuffer: () => buffer,
      invalidate: vi.fn(),
    })

    registry.register(FIND_CAPABILITY, feature)
    const retrieved = registry.get(FIND_CAPABILITY)

    expect(retrieved).toBe(feature)

    feature.dispose()
  })

  test("FindFeature works standalone without selection capability", () => {
    const buffer = createTestBuffer(["hello world", "testing find"])
    const feature = createFindFeature({
      getBuffer: () => buffer,
      invalidate: vi.fn(),
    })

    // Find should work independently — no selection capability required
    feature.open()
    feature.setQuery("hello")

    expect(feature.state.active).toBe(true)
    expect(feature.state.matches.length).toBe(1)
    expect(feature.state.currentIndex).toBe(0)

    feature.next()
    // Only one match, wraps back to 0
    expect(feature.state.currentIndex).toBe(0)

    feature.close()
    expect(feature.state.active).toBe(false)

    feature.dispose()
  })
})

// ============================================================================
// Ctrl+F integration via withFocus
// ============================================================================

describe("withFocus find integration", () => {
  test("withFocus exports find option type", async () => {
    // Verify the types exist by importing
    const { withFocus } = await import("../../packages/create/src/with-focus")
    expect(typeof withFocus).toBe("function")

    // withFocus({ find: true }) should not throw
    const plugin = withFocus({ find: true })
    expect(typeof plugin).toBe("function")
  })

  test("withFocus({ find: true }) creates a find feature on the app", async () => {
    const { withFocus } = await import("../../packages/create/src/with-focus")
    const { createBuffer } = await import("../../packages/ag-term/src/buffer")

    const buffer = createBuffer(40, 10)
    // Write "hello world" to buffer
    const text = "hello world"
    for (let i = 0; i < text.length; i++) {
      buffer.setCell(i, 0, { char: text[i]!, fg: null, bg: null })
    }

    // Create a minimal mock App
    const mockApp = createMockApp()

    const plugin = withFocus({
      find: {
        getBuffer: () => buffer,
        invalidate: vi.fn(),
      },
    })

    const enhanced = plugin(mockApp as any)

    // Should have find feature
    expect(enhanced.find).toBeDefined()
    expect(enhanced.find!.state.active).toBe(false)
  })

  test("Ctrl+F opens find when find option is provided", async () => {
    const { withFocus } = await import("../../packages/create/src/with-focus")
    const { createBuffer } = await import("../../packages/ag-term/src/buffer")

    const buffer = createBuffer(40, 10)
    const mockApp = createMockApp()

    const plugin = withFocus({
      find: {
        getBuffer: () => buffer,
        invalidate: vi.fn(),
      },
    })

    const enhanced = plugin(mockApp as any)

    expect(enhanced.find!.state.active).toBe(false)

    await enhanced.press("Ctrl+f")

    expect(enhanced.find!.state.active).toBe(true)
  })

  test("Escape closes find when find is active", async () => {
    const { withFocus } = await import("../../packages/create/src/with-focus")
    const { createBuffer } = await import("../../packages/ag-term/src/buffer")

    const buffer = createBuffer(40, 10)
    const mockApp = createMockApp()

    const plugin = withFocus({
      find: {
        getBuffer: () => buffer,
        invalidate: vi.fn(),
      },
    })

    const enhanced = plugin(mockApp as any)

    // Open find
    await enhanced.press("Ctrl+f")
    expect(enhanced.find!.state.active).toBe(true)

    // Escape should close find
    await enhanced.press("Escape")
    expect(enhanced.find!.state.active).toBe(false)
  })

  test("without find option, Ctrl+F passes through to original press", async () => {
    const { withFocus } = await import("../../packages/create/src/with-focus")

    const pressedKeys: string[] = []
    const mockApp = createMockApp((key: string) => pressedKeys.push(key))

    const plugin = withFocus()
    const enhanced = plugin(mockApp as any)

    // find should not be defined
    expect(enhanced.find).toBeUndefined()

    await enhanced.press("Ctrl+f")

    // Should pass through to original press
    expect(pressedKeys).toContain("Ctrl+f")
  })
})

// ============================================================================
// Mock App factory
// ============================================================================

function createMockApp(onPress?: (key: string) => void) {
  return {
    press: vi.fn(async (key: string) => {
      onPress?.(key)
    }),
    getContainer: () => ({
      type: "silvery-root" as const,
      props: {},
      children: [],
      parent: null,
      layoutNode: null,
      contentRect: null,
      screenRect: null,
      renderRect: null,
      prevLayout: null,
      prevScreenRect: null,
      prevRenderRect: null,
      layoutChangedThisFrame: false,
      layoutDirty: true,
      contentDirty: true,
      stylePropsDirty: true,
      bgDirty: true,
      subtreeDirty: true,
      childrenDirty: true,
      layoutSubscribers: new Set(),
    }),
    focusManager: {
      activeElement: null,
      activeId: null,
      focusNext: vi.fn(),
      focusPrev: vi.fn(),
      blur: vi.fn(),
    },
  }
}
