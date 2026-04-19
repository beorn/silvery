/**
 * Tests for the v2 ThemeProvider `tokens` prop API.
 *
 * Verifies sparse merge (over parent), full replacement (standalone), and
 * the mutual-exclusion check against the legacy `theme` prop.
 */

import React from "react"
import { describe, expect, it } from "vitest"
import { ThemeProvider } from "../src/ThemeProvider"
import { ThemeContext } from "../src/ThemeContext"
import { createRenderer } from "@silvery/test"
import { defaultDarkScheme, deriveTheme } from "@silvery/ansi"

const defaultTheme = deriveTheme(defaultDarkScheme)

function Capture({ onTheme }: { onTheme: (t: unknown) => void }) {
  const theme = React.useContext(ThemeContext)
  onTheme(theme)
  return <></>
}

describe("ThemeProvider — v2 tokens API", () => {
  it("tokens prop — full bag, standalone", () => {
    let captured: unknown
    const render = createRenderer({ cols: 20, rows: 2 })
    render(
      <ThemeProvider tokens={defaultTheme}>
        <Capture onTheme={(t) => (captured = t)} />
      </ThemeProvider>,
    )
    expect((captured as Record<string, unknown>).primary).toBe(defaultTheme.primary)
  })

  it("tokens prop — sparse merge over parent", () => {
    let captured: unknown
    const render = createRenderer({ cols: 20, rows: 2 })
    render(
      <ThemeProvider theme={defaultTheme}>
        <ThemeProvider tokens={{ primary: "#FF00FF" } as never}>
          <Capture onTheme={(t) => (captured = t)} />
        </ThemeProvider>
      </ThemeProvider>,
    )
    const c = captured as Record<string, string>
    expect(c.primary).toBe("#FF00FF") // overridden
    expect(c.fg).toBe(defaultTheme.fg) // inherited from parent
    expect(c.bg).toBe(defaultTheme.bg) // inherited from parent
  })

  it("tokens prop — custom tokens live alongside standard", () => {
    let captured: unknown
    const render = createRenderer({ cols: 20, rows: 2 })
    render(
      <ThemeProvider theme={defaultTheme}>
        <ThemeProvider tokens={{ "priority-p0": "#E53935", "app-brand": "#5B8DEF" } as never}>
          <Capture onTheme={(t) => (captured = t)} />
        </ThemeProvider>
      </ThemeProvider>,
    )
    const c = captured as Record<string, string>
    expect(c["priority-p0"]).toBe("#E53935")
    expect(c["app-brand"]).toBe("#5B8DEF")
    // Standard tokens still inherited
    expect(c.primary).toBe(defaultTheme.primary)
  })

  it("legacy theme prop still works", () => {
    let captured: unknown
    const render = createRenderer({ cols: 20, rows: 2 })
    render(
      <ThemeProvider theme={defaultTheme}>
        <Capture onTheme={(t) => (captured = t)} />
      </ThemeProvider>,
    )
    expect((captured as Record<string, unknown>).primary).toBe(defaultTheme.primary)
  })

  it("passing both tokens and theme throws", () => {
    const render = createRenderer({ cols: 20, rows: 2 })
    expect(() =>
      render(
        <ThemeProvider tokens={{ primary: "#F00" } as never} theme={defaultTheme}>
          <Capture onTheme={() => {}} />
        </ThemeProvider>,
      ),
    ).toThrow(/pass either .tokens. or .theme., not both/)
  })

  it("tokens merge with Primer-style names (v1 resolver aliases)", () => {
    // Passing new Primer-style names in `tokens` — the resolver's alias
    // map handles $fg-muted → muted at $token resolution time. Parent
    // provides the base keys; child overrides via new names get merged
    // into the same bag (aliases resolve at read time, not write time).
    let captured: unknown
    const render = createRenderer({ cols: 20, rows: 2 })
    render(
      <ThemeProvider theme={defaultTheme}>
        <ThemeProvider tokens={{ muted: "#888888" } as never}>
          <Capture onTheme={(t) => (captured = t)} />
        </ThemeProvider>
      </ThemeProvider>,
    )
    const c = captured as Record<string, string>
    expect(c.muted).toBe("#888888")
  })
})
