/**
 * Tests for the runtime variant warning in <Text variant="...">.
 *
 * When an unknown variant name is used, Text should:
 *   - Still render content (no-op fallback)
 *   - Emit a console.warn once per (theme, variantName) pair
 *   - Not warn for known built-in variants
 *   - Not warn for custom variants registered via ThemeProvider
 *
 * Warning de-duplication uses WeakMap<Theme, Set<string>> — each unknown
 * variant name warns at most once per theme instance across the session.
 *
 * Bead: km-silvery.variants-runtime-validation
 */

import React from "react"
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest"
import { createRenderer } from "@silvery/test"
import { Text } from "silvery"
import { ThemeProvider } from "silvery"

const r = createRenderer({ cols: 40, rows: 3 })

describe("Text variant — runtime warning", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
  })

  afterEach(() => {
    warnSpy.mockRestore()
  })

  // Test 1: unknown variant → console.warn called once
  test("<Text variant='h11'> triggers console.warn once", () => {
    // Use a sufficiently unique name to avoid collision with module-level WeakMap
    // state from other test runs (the WeakMap key is the theme instance, which is
    // shared across tests that render without a ThemeProvider wrapper).
    r(<Text variant="h11-warn-test-unique-a1b2">X</Text>)
    expect(warnSpy).toHaveBeenCalledTimes(1)
    const [msg] = warnSpy.mock.calls[0] as [string]
    expect(msg).toContain("h11-warn-test-unique-a1b2")
    expect(msg).toContain("[silvery]")
  })

  // Test 2: same unknown variant rendered twice → warn called once (de-duped)
  test("<Text variant='h11'> twice → warn de-duped to one call", () => {
    const name = "h11-dedup-test-unique-c3d4"
    r(<Text variant={name}>A</Text>)
    r(<Text variant={name}>B</Text>)
    expect(warnSpy).toHaveBeenCalledTimes(1)
  })

  // Test 3: known variant → no warn
  test("<Text variant='h1'> does not warn", () => {
    r(<Text variant="h1">Title</Text>)
    expect(warnSpy).not.toHaveBeenCalled()
  })

  // Test 4: custom variant registered via ThemeProvider → no warn
  test("<Text variant='hero'> inside ThemeProvider with hero registered → no warn", () => {
    r(
      <ThemeProvider tokens={{ variants: { hero: { color: "$accent", bold: true } } }}>
        <Text variant="hero">Hero text</Text>
      </ThemeProvider>,
    )
    expect(warnSpy).not.toHaveBeenCalled()
  })
})
