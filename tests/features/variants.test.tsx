/**
 * Variant system tests — typography presets as first-class theme tokens.
 *
 * `<Text variant="h1">` resolves from theme.variants.h1 = { color: "$primary", bold: true }.
 * Caller props win over variant defaults (variant is a default, not an override).
 * Apps extend variants via <ThemeProvider tokens={{ variants: { ... } }}>.
 *
 * Runs at SILVERY_STRICT=2 (default test setup) — incremental renders must
 * match fresh renders cell-for-cell.
 *
 * Bead: km-silvery.variants-as-tokens
 *
 * NOTE (Sterling sweep — km-silvery.sterling-tests-legacy-sweep, 2026-04-20):
 * This file deliberately retains legacy `$primary`/`$accent`/`$success`/`$muted`
 * tokens. The legacy `DEFAULT_VARIANTS` in `@silvery/ansi/theme/derived.ts` still
 * binds `h1.color = "$primary"`, and these tests verify variant↔direct-color
 * parity through that legacy binding. When 0.20.0 drops `inlineSterlingTokens`
 * and migrates `DEFAULT_VARIANTS` to Sterling flat tokens, retire / rewrite this
 * file rather than mechanically renaming.
 */

import React from "react"
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest"
import { createRenderer } from "@silvery/test"
import { Text, H1, H2, H4, H5, H6, Box } from "silvery"
import { ThemeProvider } from "silvery"
import { defaultDarkTheme } from "@silvery/theme/schemes"
import { KNOWN_VARIANTS } from "@silvery/ansi"

const r = createRenderer({ cols: 80, rows: 5 })

// =============================================================================
// Test 1: <Text variant="h1"> resolves bold + some fg color
// =============================================================================

describe("Text variant prop", () => {
  test("H4-H6 presets resolve built-in variants without warnings", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const h4 = r(<H4>Four</H4>)
    expect(h4.cell(0, 0).bold).toBe(true)
    const h5 = r(<H5>Five</H5>)
    expect(h5.cell(0, 0).italic).toBe(true)
    r(<H6>Six</H6>)

    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })

  test("variant='h1' → bold=true, fg non-null", () => {
    const app = r(<Text variant="h1">Title</Text>)
    const cell = app.cell(0, 0)
    expect(cell.char).toBe("T")
    expect(cell.bold).toBe(true)
    // $primary must resolve to some non-null fg color
    expect(cell.fg).not.toBeNull()
  })

  // =============================================================================
  // Test 2: variant color matches direct $primary color
  // =============================================================================

  test("variant='h1' fg matches direct color='$primary'", () => {
    const appVariant = r(<Text variant="h1">X</Text>)
    const appDirect = r(
      <Text color="$primary" bold>
        X
      </Text>,
    )

    // Both should produce the same fg color (variant resolves $primary the same way)
    expect(appVariant.cell(0, 0).fg).toEqual(appDirect.cell(0, 0).fg)
  })

  // =============================================================================
  // Test 3: caller color wins over variant color
  // =============================================================================

  test("caller color overrides variant color", () => {
    const appDefault = r(<Text variant="h1">X</Text>)
    const appOverride = r(
      <Text variant="h1" color="$success">
        X
      </Text>,
    )

    const defaultCell = appDefault.cell(0, 0)
    const overrideCell = appOverride.cell(0, 0)

    // bold still comes from variant in both cases
    expect(defaultCell.bold).toBe(true)
    expect(overrideCell.bold).toBe(true)

    // color was overridden — fg must differ when $success ≠ $primary
    // (if $success == $primary in current theme, this just confirms both are equal, which is fine)
    const directSuccess = r(<Text color="$success">X</Text>).cell(0, 0)
    expect(overrideCell.fg).toEqual(directSuccess.fg)
  })

  // =============================================================================
  // Test 4: variant="body-muted" → some fg color (from $muted)
  // =============================================================================

  test("variant='body-muted' → fg non-null, matches $muted", () => {
    const app = r(<Text variant="body-muted">X</Text>)
    const cell = app.cell(0, 0)
    expect(cell.bold).toBeFalsy()
    expect(cell.fg).not.toBeNull()

    // Should match direct $muted
    const mutedDirect = r(<Text color="$muted">X</Text>).cell(0, 0)
    expect(cell.fg).toEqual(mutedDirect.fg)
  })

  // =============================================================================
  // Test 5: bold={false} explicitly overrides variant's bold: true
  // =============================================================================

  test("explicit bold={false} overrides variant bold", () => {
    const app = r(
      <Text variant="h1" bold={false}>
        X
      </Text>,
    )
    const cell = app.cell(0, 0)
    // color still comes from variant
    expect(cell.fg).not.toBeNull()
    // bold was explicitly overridden
    expect(cell.bold).toBeFalsy()
  })

  // =============================================================================
  // Test 6: variant="code" → muted-link foreground without a background chip
  // =============================================================================

  test("variant='code' → muted-link foreground and inherited background", () => {
    const code = createRenderer({ cols: 40, rows: 3 })
    const app = code(<Text variant="code">hello</Text>)
    const info = createRenderer({ cols: 40, rows: 3 })(
      <Text color="mix($fg-muted, $fg-link, 20%)">hello</Text>,
    )
    const cell = app.cell(0, 0)
    expect(cell.char).toBe("h")
    expect(cell.fg).toEqual(info.cell(0, 0).fg)
    expect(cell.bg).toBeNull()
  })

  // =============================================================================
  // Test 7: unknown variant → renders without crashing + emits console.warn once
  // =============================================================================

  describe("unknown variant warning", () => {
    let warnSpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
      warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
    })

    afterEach(() => {
      warnSpy.mockRestore()
    })

    test("unknown variant renders gracefully (no-op)", () => {
      // Use a unique name to avoid collision with the module-level dedup Set
      // (other test runs in this file may have already warned for "nonexistent-variant-xyz")
      const app = r(<Text variant="unknown-variant-for-graceful-test-abc123">Hi</Text>)
      expect(app.text).toContain("Hi")
      const cell = app.cell(0, 0)
      // No styling from variant (it didn't exist), renders as plain text
      expect(cell.char).toBe("H")
    })

    test("unknown variant emits a console.warn with variant name and known list", () => {
      // Fresh unique name — must not have been warned yet in this session
      const variantName = "typo-variant-test-unique-9f3a"
      r(<Text variant={variantName}>X</Text>)
      expect(warnSpy).toHaveBeenCalledTimes(1)
      const [msg] = warnSpy.mock.calls[0] as [string]
      expect(msg).toContain(variantName)
      // Should include at least one known variant name
      expect(msg).toContain("h1")
    })

    test("unknown variant warning fires only once per variant name per session", () => {
      // Use a different unique name so the session-level dedup Set isn't already populated
      const name = "dedup-test-variant-8c2e"
      r(<Text variant={name}>A</Text>)
      r(<Text variant={name}>B</Text>)
      r(<Text variant={name}>C</Text>)
      // Only the first render should have triggered a warning
      expect(warnSpy).toHaveBeenCalledTimes(1)
    })
  })

  // =============================================================================
  // Test 8: KNOWN_VARIANTS runtime constant matches VariantName values
  // =============================================================================

  test("KNOWN_VARIANTS runtime constant has all 15 known variant names", () => {
    expect(KNOWN_VARIANTS).toHaveLength(15)
    const expected = [
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "body",
      "body-muted",
      "fine-print",
      "strong",
      "em",
      "link",
      "key",
      "code",
      "kbd",
    ]
    for (const name of expected) {
      expect(KNOWN_VARIANTS).toContain(name)
    }
  })
})

// =============================================================================
// <H1> Typography wrapper behaves identically to <Text variant="h1">
// =============================================================================

describe("Typography wrapper parity", () => {
  test("<H1> behaves identically to <Text variant='h1'>", () => {
    const app1 = r(<H1>Title</H1>)
    const app2 = r(<Text variant="h1">Title</Text>)

    const cell1 = app1.cell(0, 0)
    const cell2 = app2.cell(0, 0)

    expect(cell1.bold).toBe(cell2.bold)
    expect(cell1.fg).toEqual(cell2.fg)
  })

  test("<H1 color='$success'> override propagates via variant system", () => {
    const app = r(<H1 color="$success">Done</H1>)
    const cell = app.cell(0, 0)
    // bold comes from h1 variant
    expect(cell.bold).toBe(true)
    // color is overridden to $success
    const successDirect = r(<Text color="$success">D</Text>).cell(0, 0)
    expect(cell.fg).toEqual(successDirect.fg)
  })

  test("<H2> blends the H1 color halfway toward foreground", () => {
    const app1 = r(<H2>Section</H2>)
    const app2 = createRenderer({ cols: 80, rows: 5 })(
      <Text color="mix($primary, $fg, 50%)" bold>
        Section
      </Text>,
    )

    const cell1 = app1.cell(0, 0)
    const cell2 = app2.cell(0, 0)
    expect(cell1.fg).toEqual(cell2.fg)
    expect(cell1.bold).toBe(cell2.bold)
  })
})

// =============================================================================
// ThemeProvider tokens={{ variants: { hero: ... } }} adds custom variants
// =============================================================================

describe("Custom variants via ThemeProvider", () => {
  test("hero variant resolves from ThemeProvider tokens", () => {
    const app = r(
      <ThemeProvider tokens={{ variants: { hero: { color: "$accent", bold: true } } }}>
        <Text variant="hero">X</Text>
      </ThemeProvider>,
    )

    const cell = app.cell(0, 0)
    expect(cell.bold).toBe(true)
    // Should have same fg as $accent resolved within the same ThemeProvider scope.
    // Use the same ThemeProvider wrapper to ensure consistent theme resolution —
    // without ThemeProvider the fallback (ansi16DarkTheme) may differ from the
    // merged theme used above.
    const accentDirect = r(
      <ThemeProvider tokens={{ variants: { hero: { color: "$accent", bold: true } } }}>
        <Text color="$accent">X</Text>
      </ThemeProvider>,
    ).cell(0, 0)
    expect(cell.fg).toEqual(accentDirect.fg)
  })

  test("custom variant merged with standard variants", () => {
    // Standard h1 still works after adding custom variant
    const app = r(
      <ThemeProvider tokens={{ variants: { hero: { color: "$accent", bold: true } } }}>
        <Box flexDirection="column">
          <Text variant="h1">Standard</Text>
          <Text variant="hero">Custom</Text>
        </Box>
      </ThemeProvider>,
    )

    // Both render without crashing
    expect(app.text).toContain("Standard")
    expect(app.text).toContain("Custom")

    const h1Cell = app.cell(0, 0) // first line "Standard"
    expect(h1Cell.bold).toBe(true)
    expect(h1Cell.fg).not.toBeNull()

    const heroCell = app.cell(0, 1) // second line "Custom"
    expect(heroCell.bold).toBe(true)
    expect(heroCell.fg).not.toBeNull()
  })
})

// =============================================================================
// Theme.variants contains the standard keys
// =============================================================================

describe("Theme.variants structure", () => {
  test("defaultDarkTheme.variants has all standard keys", () => {
    const variants = defaultDarkTheme.variants
    expect(variants).toBeDefined()
    const expectedKeys = [
      "h1",
      "h2",
      "h3",
      "body",
      "body-muted",
      "fine-print",
      "strong",
      "em",
      "link",
      "key",
      "code",
      "kbd",
    ]
    for (const key of expectedKeys) {
      expect(variants).toHaveProperty(key)
    }
  })

  test("h1 variant has color='$primary' and bold=true", () => {
    const h1 = defaultDarkTheme.variants?.h1
    expect(h1).toBeDefined()
    expect(h1?.color).toBe("$primary")
    expect(h1?.bold).toBe(true)
  })

  test("body variant softens foreground without changing weight", () => {
    const body = defaultDarkTheme.variants?.body
    expect(body).toBeDefined()
    expect(body?.color).toBe("mix($fg, $fg-muted, 12.5%)")
    expect(body?.bold).toBeUndefined()
  })
})
