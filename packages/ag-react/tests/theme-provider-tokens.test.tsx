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
const defaultThemeRecord = defaultTheme as unknown as Record<string, string>

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
    expect((captured as Record<string, unknown>)["fg-accent"]).toBe(defaultThemeRecord["fg-accent"])
  })

  it("tokens prop — sparse merge over parent", () => {
    let captured: unknown
    const render = createRenderer({ cols: 20, rows: 2 })
    render(
      <ThemeProvider theme={defaultTheme}>
        <ThemeProvider tokens={{ "fg-accent": "#FF00FF" } as never}>
          <Capture onTheme={(t) => (captured = t)} />
        </ThemeProvider>
      </ThemeProvider>,
    )
    const c = captured as Record<string, string>
    expect(c["fg-accent"]).toBe("#FF00FF") // overridden
    expect((c.accent as unknown as { fg: string }).fg).toBe("#FF00FF")
    expect(Object.isFrozen(c)).toBe(true)
    expect(c.fg).toBe(defaultThemeRecord.fg) // inherited from parent
    expect(c.bg).toBe(defaultThemeRecord.bg) // inherited from parent
    expect((defaultTheme.accent as { fg: string }).fg).toBe(defaultThemeRecord["fg-accent"])
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
    expect(c["fg-accent"]).toBe(defaultThemeRecord["fg-accent"])
  })

  it("legacy theme prop still works", () => {
    let captured: unknown
    const render = createRenderer({ cols: 20, rows: 2 })
    render(
      <ThemeProvider theme={defaultTheme}>
        <Capture onTheme={(t) => (captured = t)} />
      </ThemeProvider>,
    )
    expect((captured as Record<string, unknown>)["fg-accent"]).toBe(defaultThemeRecord["fg-accent"])
  })

  it("passing both tokens and theme throws", () => {
    const render = createRenderer({ cols: 20, rows: 2 })
    expect(() =>
      render(
        <ThemeProvider tokens={{ "fg-accent": "#F00" } as never} theme={defaultTheme}>
          <Capture onTheme={() => {}} />
        </ThemeProvider>,
      ),
    ).toThrow(/pass either .tokens. or .theme., not both/)
  })

  it("tokens reject a retired raw role instead of emitting it", () => {
    const render = createRenderer({ cols: 20, rows: 2 })
    expect(() =>
      render(
        <ThemeProvider theme={defaultTheme}>
          <ThemeProvider tokens={{ muted: "#888888" } as never}>
            <Capture onTheme={() => {}} />
          </ThemeProvider>
        </ThemeProvider>,
      ),
    ).toThrow('use "$fg-muted"')
  })

  it("tokens merge canonical flat names without emitting a raw role", () => {
    let captured: unknown
    const render = createRenderer({ cols: 20, rows: 2 })
    render(
      <ThemeProvider theme={defaultTheme}>
        <ThemeProvider tokens={{ "fg-muted": "#888888" } as never}>
          <Capture onTheme={(t) => (captured = t)} />
        </ThemeProvider>
      </ThemeProvider>,
    )
    const c = captured as Record<string, string>
    expect(c["fg-muted"]).toBe("#888888")
    expect((c.muted as unknown as { fg: string }).fg).toBe("#888888")
  })
})
