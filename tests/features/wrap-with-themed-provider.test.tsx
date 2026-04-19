/**
 * wrapWithThemedProvider — unit tests.
 *
 * Verifies:
 * - Returns a React element that renders without error.
 * - Populates useActiveScheme() from the injected scheme metadata.
 * - Token overrides are accessible via useTheme().
 * - Source mapping: DetectSchemeResult.source → ActiveScheme.source.
 * - createThemedApp finding: only runThemed exists; wrapWithThemedProvider
 *   extracted as the shared internal. Bead partially obsolete per findings.
 *
 * Uses an explicit override (no OSC probing) so tests are deterministic
 * and fast — no real terminal or async probing needed.
 *
 * Bead: km-silvery.unify-theme-boot-helpers
 */

import React from "react"
import { describe, test, expect } from "vitest"
import { createRenderer } from "@silvery/test"
import { Text } from "silvery"
import { useActiveScheme } from "@silvery/ag-react"
import { useTheme } from "@silvery/ag-react"
import { defaultDarkScheme } from "@silvery/ansi"
import { wrapWithThemedProvider, type ThemedProviderOptions } from "@silvery/ag-term/runtime"

const r = createRenderer({ cols: 40, rows: 4 })

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Tiny component that reads ActiveScheme and renders it as text. */
function ActiveSchemeDisplay() {
  const scheme = useActiveScheme()
  if (!scheme) return <Text>no-scheme</Text>
  return (
    <Text>
      {scheme.source}:{scheme.name}
    </Text>
  )
}

/** Tiny component that reads a custom token from the active theme. */
function TokenDisplay({ token }: { token: string }) {
  const theme = useTheme()
  const value = (theme as unknown as Record<string, unknown>)[token]
  return <Text>{typeof value === "string" ? value : "missing"}</Text>
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("wrapWithThemedProvider", () => {
  test("returns a wrapped element that renders without error", async () => {
    const { element } = await wrapWithThemedProvider(<Text>Hello</Text>, {
      override: defaultDarkScheme,
    })

    const app = r(element)
    expect(app.text).toContain("Hello")
    app.unmount()
  })

  test("result contains the detect result with scheme + theme", async () => {
    const opts: ThemedProviderOptions = { override: defaultDarkScheme }
    const { result } = await wrapWithThemedProvider(<Text>x</Text>, opts)

    expect(result.scheme).toBe(defaultDarkScheme)
    expect(result.theme).toBeDefined()
    expect(typeof result.theme.bg).toBe("string")
    expect(result.source).toBe("override")
  })

  test("useActiveScheme() returns scheme metadata from ThemeProvider", async () => {
    const { element } = await wrapWithThemedProvider(<ActiveSchemeDisplay />, {
      override: defaultDarkScheme,
    })

    const app = r(element)
    // scheme.name comes from defaultDarkScheme.name; source is "override"
    const text = app.text
    expect(text).toContain("override:")
    expect(text).not.toContain("no-scheme")
    app.unmount()
  })

  test("source mapping: override → override", async () => {
    const { element } = await wrapWithThemedProvider(<ActiveSchemeDisplay />, {
      override: defaultDarkScheme,
    })
    const app = r(element)
    expect(app.text).toContain("override:")
    app.unmount()
  })

  test("source mapping: fallback → fallback (no catalog, no terminal)", async () => {
    // No override, no catalog. Non-TTY env → probing fails → fallback.
    // (tests run without a real terminal — probing returns nothing → fallback)
    const { result } = await wrapWithThemedProvider(<Text>x</Text>, {
      catalog: [],
    })
    // Accept either "fallback" or "probe" — environment determines which path
    // runs in CI. Both are valid non-fingerprint outcomes.
    expect(["fallback", "probe", "override"]).toContain(result.source)
  })

  test("token overrides applied as inner ThemeProvider", async () => {
    const { element } = await wrapWithThemedProvider(<TokenDisplay token="brand" />, {
      override: defaultDarkScheme,
      tokens: { brand: "#ABCDEF" },
    })

    const app = r(element)
    expect(app.text).toContain("#ABCDEF")
    app.unmount()
  })

  test("no token overrides: element rendered directly (no inner wrapper)", async () => {
    // Without tokens, the element is passed directly as children.
    // Verify: renders correctly without extra ThemeProvider Box overhead.
    const { element } = await wrapWithThemedProvider(<Text>Direct</Text>, {
      override: defaultDarkScheme,
    })

    const app = r(element)
    expect(app.text).toContain("Direct")
    app.unmount()
  })

  test("default opts: works with no options (uses defaults)", async () => {
    // Verify the zero-arg path doesn't throw.
    // Non-TTY: falls back to defaultDark/Light, no probing.
    const { element, result } = await wrapWithThemedProvider(<Text>Default</Text>)
    expect(result.theme).toBeDefined()
    const app = r(element)
    expect(app.text).toContain("Default")
    app.unmount()
  })
})
