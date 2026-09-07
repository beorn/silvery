/**
 * Tests for useActiveScheme — runtime access to scheme detection metadata.
 *
 * Tests:
 *   1. Returns null without a provider.
 *   2. Returns the scheme object under <ThemeProvider scheme={...}>.
 *   3. Nested ThemeProviders — innermost scheme wins.
 */

import React from "react"
import { describe, expect, it } from "vitest"
import { ThemeProvider } from "../src/ThemeProvider"
import { useActiveScheme } from "../src/hooks/useActiveScheme"
import { createRenderer } from "@silvery/test"
import type { ActiveScheme } from "@silvery/ansi"
import { defaultDarkScheme, deriveTheme } from "@silvery/ansi"

const defaultTheme = deriveTheme(defaultDarkScheme)

function CaptureScheme({ onScheme }: { onScheme: (s: ActiveScheme | null) => void }) {
  const scheme = useActiveScheme()
  onScheme(scheme)
  return <></>
}

describe("useActiveScheme", () => {
  it("returns null when no ThemeProvider with scheme is present", () => {
    let captured: ActiveScheme | null | undefined
    const render = createRenderer({ cols: 20, rows: 2 })
    render(
      <ThemeProvider theme={defaultTheme}>
        <CaptureScheme onScheme={(s) => (captured = s)} />
      </ThemeProvider>,
    )
    expect(captured).toBeNull()
  })

  it("returns the scheme object under ThemeProvider with scheme prop", () => {
    let captured: ActiveScheme | null | undefined
    const scheme: ActiveScheme = { name: "nord", source: "override" }
    const render = createRenderer({ cols: 20, rows: 2 })
    render(
      <ThemeProvider theme={defaultTheme} scheme={scheme}>
        <CaptureScheme onScheme={(s) => (captured = s)} />
      </ThemeProvider>,
    )
    expect(captured).toStrictEqual({ name: "nord", source: "override" })
  })

  it("returns the full scheme object including optional fields", () => {
    let captured: ActiveScheme | null | undefined
    const scheme: ActiveScheme = {
      name: "catppuccin-mocha",
      source: "fingerprint",
      confidence: 0.87,
      matchedName: "catppuccin-mocha",
    }
    const render = createRenderer({ cols: 20, rows: 2 })
    render(
      <ThemeProvider theme={defaultTheme} scheme={scheme}>
        <CaptureScheme onScheme={(s) => (captured = s)} />
      </ThemeProvider>,
    )
    expect(captured).toStrictEqual({
      name: "catppuccin-mocha",
      source: "fingerprint",
      confidence: 0.87,
      matchedName: "catppuccin-mocha",
    })
  })

  it("nested ThemeProviders — innermost scheme wins", () => {
    let captured: ActiveScheme | null | undefined
    const outerScheme: ActiveScheme = { name: "dracula", source: "fallback" }
    const innerScheme: ActiveScheme = {
      name: "catppuccin-mocha",
      source: "fingerprint",
      confidence: 0.92,
      matchedName: "catppuccin-mocha",
    }
    const render = createRenderer({ cols: 20, rows: 2 })
    render(
      <ThemeProvider theme={defaultTheme} scheme={outerScheme}>
        <ThemeProvider tokens={{ "fg-accent": "#FF00FF" } as never} scheme={innerScheme}>
          <CaptureScheme onScheme={(s) => (captured = s)} />
        </ThemeProvider>
      </ThemeProvider>,
    )
    // The innermost scheme provider wins
    expect(captured?.name).toBe("catppuccin-mocha")
    expect(captured?.source).toBe("fingerprint")
    expect(captured?.confidence).toBe(0.92)
  })

  it("nested ThemeProvider without scheme passes through parent scheme", () => {
    let capturedOuter: ActiveScheme | null | undefined
    let capturedInner: ActiveScheme | null | undefined
    const outerScheme: ActiveScheme = { name: "nord", source: "probe" }
    const render = createRenderer({ cols: 20, rows: 2 })
    render(
      <ThemeProvider theme={defaultTheme} scheme={outerScheme}>
        <CaptureScheme onScheme={(s) => (capturedOuter = s)} />
        {/* Inner ThemeProvider without scheme — should inherit outer */}
        <ThemeProvider tokens={{ "fg-accent": "#FF00FF" } as never}>
          <CaptureScheme onScheme={(s) => (capturedInner = s)} />
        </ThemeProvider>
      </ThemeProvider>,
    )
    expect(capturedOuter?.name).toBe("nord")
    // Inner ThemeProvider has no scheme prop — passes through parent context
    expect(capturedInner?.name).toBe("nord")
  })
})
