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
 */

import React from "react"
import { describe, test, expect } from "vitest"
import { createRenderer } from "@silvery/test"
import { Text, H1, H2, Box } from "silvery"
import { ThemeProvider } from "silvery"
import { defaultDarkTheme } from "@silvery/theme/schemes"

const r = createRenderer({ cols: 80, rows: 5 })

// =============================================================================
// Test 1: <Text variant="h1"> resolves bold + some fg color
// =============================================================================

describe("Text variant prop", () => {
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
  // Test 6: variant="code" → backgroundColor from $mutedbg
  // =============================================================================

  test("variant='code' → bg non-null from $mutedbg", () => {
    const code = createRenderer({ cols: 40, rows: 3 })
    const app = code(<Text variant="code"> hello </Text>)
    // The space before 'h' should have a non-null background from $mutedbg
    const cell = app.cell(0, 0)
    expect(cell.char).toBe(" ")
    expect(cell.bg).not.toBeNull()
  })

  // =============================================================================
  // Test 7: unknown variant → renders without crashing (graceful no-op)
  // =============================================================================

  test("unknown variant renders gracefully (no-op)", () => {
    const app = r(<Text variant="nonexistent-variant-xyz">Hi</Text>)
    expect(app.text).toContain("Hi")
    const cell = app.cell(0, 0)
    // No styling from variant (it didn't exist), renders as plain text
    expect(cell.char).toBe("H")
  })
})

// =============================================================================
// Test 8: <H1> Typography wrapper behaves identically to <Text variant="h1">
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

  test("<H2> uses $accent color from variant", () => {
    const app1 = r(<H2>Section</H2>)
    const app2 = r(<Text variant="h2">Section</Text>)

    const cell1 = app1.cell(0, 0)
    const cell2 = app2.cell(0, 0)
    expect(cell1.fg).toEqual(cell2.fg)
    expect(cell1.bold).toBe(cell2.bold)
  })
})

// =============================================================================
// Test 9: ThemeProvider tokens={{ variants: { hero: ... } }} adds custom variants
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
    // Should have same fg as $accent
    const accentDirect = r(<Text color="$accent">X</Text>).cell(0, 0)
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
// Test 10: Theme.variants contains the standard keys
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

  test("body variant is an empty object (plain body text)", () => {
    const body = defaultDarkTheme.variants?.body
    expect(body).toBeDefined()
    expect(body?.color).toBeUndefined()
    expect(body?.bold).toBeUndefined()
  })
})
