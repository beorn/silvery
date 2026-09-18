/**
 * Mono-tier SGR attrs — end-to-end regression.
 *
 * When `colorLevel === "mono"` (NO_COLOR / TERM=dumb / SILVERY_COLOR=mono),
 * the render pipeline must:
 *
 *   1. Strip all colors. `$primary`, `$muted`, ..., `#FF0000`, `"red"` — all
 *      resolve to no fg/bg in the output buffer + SGR stream.
 *   2. Inject per-token SGR attrs from `DEFAULT_MONO_ATTRS` so apps keep
 *      hierarchy (bold / dim / italic / underline / inverse / strikethrough).
 *
 * Coverage:
 *   - `$primary` → bold
 *   - `$muted` → dim
 *   - `$error` → bold + inverse
 *   - `$fg-link` → underline
 *   - `$bg-selected` → inverse
 *   - Non-token hex `"#FF0000"` → no color, no attrs (pass-through)
 *   - Realistic 50+ node fixture — compounding / cascade safety under STRICT
 *
 * Bead: km-silvery.mono-tier-wiring
 * Spec: hub/silvery/design/v10-terminal/theme-system-v2-plan.md#p4
 *
 * NOTE (Sterling sweep — sterling-purge-legacy-tokens, 0.21.0):
 * Legacy `$selectionbg` / `$link` tokens were dropped from `DEFAULT_MONO_ATTRS`.
 * This file now exercises the Sterling-keyed equivalents (`$bg-selected`,
 * `$fg-link`) alongside the still-valid legacy semantic tokens (`$primary`,
 * `$muted`, `$error`, …). Sterling-flat-keyed coverage also lives in
 * `packages/ansi/tests/monochrome.test.ts`.
 */

import React from "react"
import { describe, test, expect, beforeEach, afterEach } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, Text } from "silvery"
import { parseColor, getTextStyle } from "@silvery/ag-term/pipeline/render-helpers"
import { createOutputPhase } from "@silvery/ag-term/pipeline/output-phase"
import { createBuffer } from "@silvery/ag-term/buffer"
import { ansi16DarkTheme } from "@silvery/ansi"
import { pushContextTheme, popContextTheme } from "@silvery/ag-term/pipeline"

// ============================================================================
// Tier-dispatch fixtures
// ============================================================================

/** Run `fn` under the given context theme — push before, pop after. */
function withTheme(theme: typeof ansi16DarkTheme, fn: () => void): void {
  pushContextTheme(theme)
  try {
    fn()
  } finally {
    popContextTheme()
  }
}

/**
 * Run `fn` with the mono tier. The tier is an ARGUMENT to parseColor /
 * getTextStyle, not module state — see pipeline/state.ts for why a shared
 * value was wrong — so this only supplies the theme and hands the tier down.
 */
function withMonoTier(run: (tier: "mono") => void): void {
  withTheme(ansi16DarkTheme, () => run("mono"))
}

// ============================================================================
// Unit tests — parseColor + getTextStyle at mono tier
// ============================================================================

describe("parseColor: monochrome tier", () => {
  test("$primary resolves to null (color stripped)", () => {
    withMonoTier((tier) => {
      expect(parseColor("$primary", tier)).toBeNull()
    })
  })

  test("$muted resolves to null", () => {
    withMonoTier((tier) => {
      expect(parseColor("$muted", tier)).toBeNull()
    })
  })

  test("$error resolves to null", () => {
    withMonoTier((tier) => {
      expect(parseColor("$error", tier)).toBeNull()
    })
  })

  test("$fg-link resolves to null", () => {
    withMonoTier((tier) => {
      expect(parseColor("$fg-link", tier)).toBeNull()
    })
  })

  test("$fg-link-hover resolves to null", () => {
    withMonoTier((tier) => {
      expect(parseColor("$fg-link-hover", tier)).toBeNull()
    })
  })

  test("non-token hex still resolves to RGB (output phase strips it)", () => {
    withMonoTier((tier) => {
      expect(parseColor("#FF0000", tier)).toEqual({ r: 255, g: 0, b: 0 })
    })
  })

  test("$primary at truecolor tier resolves to a hex RGB", () => {
    withTheme(ansi16DarkTheme, () => {
      const result = parseColor("$primary", "truecolor")
      // At truecolor tier, $primary must NOT be null — we rely on the normal
      // token → hex → RGB pipeline. This guards against an accidental always-on
      // mono-strip regression.
      expect(result).not.toBeNull()
    })
  })
})

describe("getTextStyle: monochrome tier attrs injection", () => {
  test("$primary → bold=true", () => {
    withMonoTier((tier) => {
      const style = getTextStyle({ color: "$primary" }, tier)
      expect(style.fg).toBeNull()
      expect(style.attrs.bold).toBe(true)
      expect(style.attrs.dim).toBeFalsy()
      expect(style.attrs.inverse).toBeFalsy()
      expect(style.attrs.underline).toBeFalsy()
    })
  })

  test("$muted → dim=true", () => {
    withMonoTier((tier) => {
      const style = getTextStyle({ color: "$muted" }, tier)
      expect(style.fg).toBeNull()
      expect(style.attrs.dim).toBe(true)
      expect(style.attrs.bold).toBeFalsy()
    })
  })

  test("$error → bold + inverse", () => {
    withMonoTier((tier) => {
      const style = getTextStyle({ color: "$error" }, tier)
      expect(style.fg).toBeNull()
      expect(style.attrs.bold).toBe(true)
      expect(style.attrs.inverse).toBe(true)
    })
  })

  test("$fg-link → underline", () => {
    withMonoTier((tier) => {
      const style = getTextStyle({ color: "$fg-link" }, tier)
      expect(style.fg).toBeNull()
      expect(style.attrs.underline).toBe(true)
      expect(style.attrs.underlineStyle).toBe("single")
    })
  })

  test("$fg-link-hover → underline", () => {
    withMonoTier((tier) => {
      const style = getTextStyle({ color: "$fg-link-hover" }, tier)
      expect(style.fg).toBeNull()
      expect(style.attrs.underline).toBe(true)
      expect(style.attrs.underlineStyle).toBe("single")
    })
  })

  test("$success → bold", () => {
    withMonoTier((tier) => {
      const style = getTextStyle({ color: "$success" }, tier)
      expect(style.fg).toBeNull()
      expect(style.attrs.bold).toBe(true)
    })
  })

  test("$warning → bold", () => {
    withMonoTier((tier) => {
      const style = getTextStyle({ color: "$warning" }, tier)
      expect(style.attrs.bold).toBe(true)
    })
  })

  test("$info → italic", () => {
    withMonoTier((tier) => {
      const style = getTextStyle({ color: "$info" }, tier)
      expect(style.attrs.italic).toBe(true)
    })
  })

  test("non-token #FF0000 → no attrs (pass-through)", () => {
    withMonoTier((tier) => {
      const style = getTextStyle({ color: "#FF0000" }, tier)
      // Color survives in the Style (output phase strips it on emit).
      expect(style.fg).toEqual({ r: 255, g: 0, b: 0 })
      expect(style.attrs.bold).toBeFalsy()
      expect(style.attrs.dim).toBeFalsy()
      expect(style.attrs.italic).toBeFalsy()
      expect(style.attrs.underline).toBeFalsy()
      expect(style.attrs.inverse).toBeFalsy()
    })
  })

  test("explicit bold prop + $muted → bold + dim (user attrs OR with mono attrs)", () => {
    withMonoTier((tier) => {
      const style = getTextStyle({ bold: true, color: "$muted" }, tier)
      expect(style.attrs.bold).toBe(true)
      expect(style.attrs.dim).toBe(true)
    })
  })

  test("$bg-selected → inverse", () => {
    withMonoTier((tier) => {
      // bg-selected → ["inverse"] in DEFAULT_MONO_ATTRS. The legacy
      // `$selectionbg` alias was removed in 0.21.0 (sterling-purge-legacy-tokens).
      const style = getTextStyle({ backgroundColor: "$bg-selected" }, tier)
      expect(style.attrs.inverse).toBe(true)
    })
  })

  test("at truecolor tier, $primary → RGB fg, no bold injected", () => {
    withTheme(ansi16DarkTheme, () => {
      const style = getTextStyle({ color: "$primary" }, "truecolor")
      expect(style.fg).not.toBeNull()
      // Bold is NOT auto-injected when the user didn't ask for it at color tiers.
      expect(style.attrs.bold).toBeFalsy()
    })
  })
})

// ============================================================================
// Output phase — color SGR stripped at mono tier
// ============================================================================

describe("output phase: mono tier strips fg/bg SGR codes", () => {
  test("a cell with RGB fg emits no SGR color at colorLevel=none", () => {
    const buf = createBuffer(6, 1)
    // Write a cell with red fg — as if a user wrote color="#FF0000"
    buf.setCell(0, 0, { char: "X", fg: { r: 255, g: 0, b: 0 } })

    const renderMono = createOutputPhase({ colorLevel: "mono" })
    const out = renderMono(null, buf, "fullscreen")

    // Must NOT contain a 38;2;... (truecolor fg) or 38;5;... (256) sequence
    expect(out).not.toMatch(/38;2;255;0;0/)
    expect(out).not.toMatch(/38;5;/)
    expect(out).not.toMatch(/\x1b\[31m/)
  })

  test("a cell with RGB bg emits no SGR bg color at colorLevel=none", () => {
    const buf = createBuffer(6, 1)
    buf.setCell(0, 0, { char: "X", bg: { r: 0, g: 128, b: 255 } })

    const renderMono = createOutputPhase({ colorLevel: "mono" })
    const out = renderMono(null, buf, "fullscreen")

    expect(out).not.toMatch(/48;2;0;128;255/)
    expect(out).not.toMatch(/48;5;/)
  })

  test("a cell with attrs still emits the SGR attrs at mono tier", () => {
    const buf = createBuffer(6, 1)
    buf.setCell(0, 0, {
      char: "X",
      attrs: { bold: true, inverse: true, underline: true, underlineStyle: "single" },
    })

    const renderMono = createOutputPhase({ colorLevel: "mono" })
    const out = renderMono(null, buf, "fullscreen")

    // Bold = SGR 1, inverse = SGR 7, underline = SGR 4 or 4:1
    // Order may vary; just check each appears in some SGR sequence.
    expect(out).toMatch(/\x1b\[[^m]*;?1[;m]/) // bold (SGR 1)
    expect(out).toMatch(/\x1b\[[^m]*7[;m]/) // inverse (SGR 7)
    expect(out).toMatch(/\x1b\[[^m]*4/) // underline (SGR 4 or 4:1)
  })

  test("truecolor tier still emits fg RGB (no regression)", () => {
    const buf = createBuffer(6, 1)
    buf.setCell(0, 0, { char: "X", fg: { r: 255, g: 0, b: 0 } })

    const renderTruecolor = createOutputPhase({ colorLevel: "truecolor" })
    const out = renderTruecolor(null, buf, "fullscreen")

    expect(out).toMatch(/38;2;255;0;0/)
  })
})

// ============================================================================
// Integration — renderer sees mono-tier attrs on cells
// ============================================================================

describe("render pipeline: $token attrs reach the buffer at mono tier", () => {
  // The tier is a per-renderer option (`createRenderer({ colorLevel })`), the
  // same value `caps.colorLevel` supplies in production — not module state, so
  // these renders cannot restyle anyone else's. The buffer we inspect via
  // app.cell() captures the Style written during the render phase — exactly
  // what gets handed to the output phase. That round-trip (render writes Style
  // → output emits ANSI) is exercised separately in "output phase: mono tier
  // strips ...".
  beforeEach(() => {
    pushContextTheme(ansi16DarkTheme)
  })

  afterEach(() => {
    popContextTheme()
  })

  test("<Text color='$primary'> renders bold cells, no fg", () => {
    const render = createRenderer({ cols: 10, rows: 1, colorLevel: "mono" })
    const app = render(<Text color="$primary">HELLO</Text>)

    expect(app.text).toContain("HELLO")
    for (let i = 0; i < 5; i++) {
      const c = app.cell(i, 0)
      expect(c.bold).toBe(true)
      expect(c.fg).toBeNull()
    }
  })

  test("<Text color='$muted'> renders dim cells, no fg", () => {
    const render = createRenderer({ cols: 10, rows: 1, colorLevel: "mono" })
    const app = render(<Text color="$muted">FAINT</Text>)

    for (let i = 0; i < 5; i++) {
      const c = app.cell(i, 0)
      expect(c.dim).toBe(true)
      expect(c.bold).toBe(false)
      expect(c.fg).toBeNull()
    }
  })

  test("<Text color='$error'> renders bold + inverse cells", () => {
    const render = createRenderer({ cols: 10, rows: 1, colorLevel: "mono" })
    const app = render(<Text color="$error">DANGER</Text>)

    for (let i = 0; i < 6; i++) {
      const c = app.cell(i, 0)
      expect(c.bold).toBe(true)
      expect(c.inverse).toBe(true)
      expect(c.fg).toBeNull()
    }
  })

  test("<Text color='$fg-link'> renders underlined cells", () => {
    const render = createRenderer({ cols: 10, rows: 1, colorLevel: "mono" })
    const app = render(<Text color="$fg-link">CLICK</Text>)

    for (let i = 0; i < 5; i++) {
      const c = app.cell(i, 0)
      expect(c.underline).not.toBe(false)
      expect(c.fg).toBeNull()
    }
  })

  test("<Text color='#FF0000'> (non-token hex) has no attrs — fg survives to buffer", () => {
    const render = createRenderer({ cols: 10, rows: 1, colorLevel: "mono" })
    const app = render(<Text color="#FF0000">PLAIN</Text>)

    for (let i = 0; i < 5; i++) {
      const c = app.cell(i, 0)
      expect(c.bold).toBe(false)
      expect(c.dim).toBe(false)
      expect(c.italic).toBe(false)
      expect(c.underline).toBe(false)
      expect(c.inverse).toBe(false)
      // Color passes through to the buffer — output phase strips it on emit.
      expect(c.fg).toEqual({ r: 255, g: 0, b: 0 })
    }
  })
})

// ============================================================================
// Realistic-scale fixture — SILVERY_STRICT=2 compounding safety
// ============================================================================

describe("mono tier: realistic 50+ node fixture (STRICT compounding safety)", () => {
  beforeEach(() => {
    pushContextTheme(ansi16DarkTheme)
  })

  afterEach(() => {
    popContextTheme()
  })

  function MonoApp({ highlightIndex }: { highlightIndex: number }) {
    // 12 columns × 5 rows = 60 Text nodes, plus wrapping Boxes → 50+ nodes.
    const rows = 5
    const cols = 12
    return (
      <Box flexDirection="column">
        <Text color="$primary">Header</Text>
        <Text color="$muted">Subtitle with muted foreground</Text>
        <Text color="$error">Error: something went wrong</Text>
        <Text color="$warning">Warning: heads up</Text>
        <Text color="$success">Success!</Text>
        <Text color="$info">Info note</Text>
        <Text color="$fg-link">https://silvery.dev</Text>
        {Array.from({ length: rows }).map((_, r) => (
          <Box key={r} flexDirection="row" gap={1}>
            {Array.from({ length: cols }).map((_, c) => {
              const i = r * cols + c
              const active = i === highlightIndex
              return (
                <Text key={c} color={active ? "$primary" : "$muted"}>
                  {active ? "*" : "-"}
                </Text>
              )
            })}
          </Box>
        ))}
      </Box>
    )
  }

  test("mounts and rerenders without STRICT mismatches", () => {
    const render = createRenderer({ cols: 80, rows: 24, colorLevel: "mono" })
    const app = render(<MonoApp highlightIndex={0} />)
    expect(app.text).toContain("Header")
    expect(app.text).toContain("Subtitle")
    expect(app.text).toContain("Error:")

    // Bounce through several highlight indexes — STRICT verifies incremental
    // matches fresh on every rerender. A cascade bug from the mono-attr merge
    // would surface here (e.g., stale attrs on cells whose color token changed).
    for (let i = 0; i < 10; i++) {
      app.rerender(<MonoApp highlightIndex={i} />)
      expect(app.text).toContain("Header")
    }
  })

  test("header row (Primary + Muted + Error + Warning + Link) all have distinct attrs", () => {
    const render = createRenderer({ cols: 80, rows: 24, colorLevel: "mono" })
    const app = render(<MonoApp highlightIndex={0} />)

    // Pull one cell from each header line. Headers start at row 0.
    const headerRow = app.cell(0, 0) // "H" from "Header"
    const subtitleRow = app.cell(0, 1) // "S" from "Subtitle ..."
    const errorRow = app.cell(0, 2) // "E" from "Error: ..."
    const linkRow = app.cell(0, 6) // "h" from "https://..."

    expect(headerRow.bold).toBe(true) // $primary
    expect(subtitleRow.dim).toBe(true) // $muted
    expect(errorRow.bold).toBe(true) // $error = bold + inverse
    expect(errorRow.inverse).toBe(true)
    expect(linkRow.underline).not.toBe(false) // $link
  })
})
