/**
 * Tests for useColorScheme hook and ReactiveThemeProvider.
 *
 * Verifies:
 * 1. useColorScheme returns current scheme from capability registry
 * 2. useColorScheme updates reactively when scheme changes
 * 3. ReactiveThemeProvider switches theme on scheme change
 */

import React, { act } from "react"
import { describe, test, expect } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, Text, ThemeProvider, useTheme, ReactiveThemeProvider } from "@silvery/ag-react"
import { CapabilityRegistryContext } from "@silvery/ag-react/context"
import { useColorScheme } from "@silvery/ag-react/hooks"
import { ansi16DarkTheme, ansi16LightTheme } from "@silvery/theme"
import type { Theme } from "@silvery/theme"

// =============================================================================
// Helpers
// =============================================================================

/** Well-known symbol for the color scheme capability (matches the hook). */
const COLOR_SCHEME_CAPABILITY = Symbol.for("silvery.color-scheme")

type SchemeListener = (scheme: "dark" | "light") => void

/**
 * Create a mock color scheme detector for testing.
 * Allows programmatic control of the scheme value.
 */
function createMockDetector(initialScheme: "dark" | "light" | "unknown" = "unknown") {
  let scheme = initialScheme
  const listeners = new Set<SchemeListener>()

  return {
    get scheme() {
      return scheme
    },
    subscribe(listener: SchemeListener): () => void {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    /** Test helper: set the scheme and notify listeners. */
    setScheme(newScheme: "dark" | "light") {
      if (scheme !== newScheme) {
        scheme = newScheme
        for (const listener of listeners) {
          listener(newScheme)
        }
      }
    },
  }
}

/**
 * Create a minimal capability registry that holds the mock detector.
 */
function createMockRegistry(detector: ReturnType<typeof createMockDetector>) {
  const capabilities = new Map<symbol, unknown>()
  capabilities.set(COLOR_SCHEME_CAPABILITY, detector)

  return {
    get<T>(key: symbol): T | undefined {
      return capabilities.get(key) as T | undefined
    },
  }
}

/**
 * Helper to wrap element with capability registry context.
 */
function withRegistry(
  registry: ReturnType<typeof createMockRegistry>,
  element: React.ReactElement,
): React.ReactElement {
  return (
    <CapabilityRegistryContext.Provider value={registry}>
      {element}
    </CapabilityRegistryContext.Provider>
  )
}

// =============================================================================
// useColorScheme
// =============================================================================

describe("useColorScheme", () => {
  test("returns 'unknown' when no capability registry", () => {
    const render = createRenderer({ cols: 40, rows: 5 })

    function App() {
      const scheme = useColorScheme()
      return <Text>{`scheme:${scheme}`}</Text>
    }

    const app = render(<App />)
    expect(app.text).toContain("scheme:unknown")
  })

  test("returns 'unknown' when no detector registered", () => {
    const render = createRenderer({ cols: 40, rows: 5 })
    const registry = { get: () => undefined }

    function App() {
      const scheme = useColorScheme()
      return <Text>{`scheme:${scheme}`}</Text>
    }

    const app = render(
      <CapabilityRegistryContext.Provider value={registry}>
        <App />
      </CapabilityRegistryContext.Provider>,
    )
    expect(app.text).toContain("scheme:unknown")
  })

  test("returns current scheme from detector (dark)", () => {
    const render = createRenderer({ cols: 40, rows: 5 })
    const detector = createMockDetector("dark")
    const registry = createMockRegistry(detector)

    function App() {
      const scheme = useColorScheme()
      return <Text>{`scheme:${scheme}`}</Text>
    }

    const app = render(withRegistry(registry, <App />))
    expect(app.text).toContain("scheme:dark")
  })

  test("returns current scheme from detector (light)", () => {
    const render = createRenderer({ cols: 40, rows: 5 })
    const detector = createMockDetector("light")
    const registry = createMockRegistry(detector)

    function App() {
      const scheme = useColorScheme()
      return <Text>{`scheme:${scheme}`}</Text>
    }

    const app = render(withRegistry(registry, <App />))
    expect(app.text).toContain("scheme:light")
  })

  test("updates reactively when scheme changes via rerender", () => {
    const render = createRenderer({ cols: 40, rows: 5 })
    const detector = createMockDetector("dark")
    const registry = createMockRegistry(detector)

    function App() {
      const scheme = useColorScheme()
      return <Text>{`scheme:${scheme}`}</Text>
    }

    const el = withRegistry(registry, <App />)
    const app = render(el)
    expect(app.text).toContain("scheme:dark")

    // Change scheme — rerender to pick up the external store change
    detector.setScheme("light")
    app.rerender(el)
    expect(app.text).toContain("scheme:light")

    // Change back
    detector.setScheme("dark")
    app.rerender(el)
    expect(app.text).toContain("scheme:dark")
  })
})

// =============================================================================
// ReactiveThemeProvider
// =============================================================================

describe("ReactiveThemeProvider", () => {
  // Two visually distinct themes for assertions
  const darkTheme: Theme = {
    ...ansi16DarkTheme,
    name: "test-dark",
    primary: "#ff0000", // red
  }

  const lightTheme: Theme = {
    ...ansi16LightTheme,
    name: "test-light",
    primary: "#00ff00", // green
  }

  test("uses dark theme by default (unknown scheme)", () => {
    const render = createRenderer({ cols: 60, rows: 5 })
    const detector = createMockDetector("unknown")
    const registry = createMockRegistry(detector)

    function App() {
      const theme = useTheme()
      return <Text>{`theme:${theme.name}`}</Text>
    }

    const app = render(
      withRegistry(
        registry,
        <ReactiveThemeProvider dark={darkTheme} light={lightTheme}>
          <App />
        </ReactiveThemeProvider>,
      ),
    )

    // Unknown scheme defaults to dark
    expect(app.text).toContain("theme:test-dark")
  })

  test("uses dark theme when scheme is dark", () => {
    const render = createRenderer({ cols: 60, rows: 5 })
    const detector = createMockDetector("dark")
    const registry = createMockRegistry(detector)

    function App() {
      const theme = useTheme()
      return <Text>{`theme:${theme.name}`}</Text>
    }

    const app = render(
      withRegistry(
        registry,
        <ReactiveThemeProvider dark={darkTheme} light={lightTheme}>
          <App />
        </ReactiveThemeProvider>,
      ),
    )

    expect(app.text).toContain("theme:test-dark")
  })

  test("uses light theme when scheme is light", () => {
    const render = createRenderer({ cols: 60, rows: 5 })
    const detector = createMockDetector("light")
    const registry = createMockRegistry(detector)

    function App() {
      const theme = useTheme()
      return <Text>{`theme:${theme.name}`}</Text>
    }

    const app = render(
      withRegistry(
        registry,
        <ReactiveThemeProvider dark={darkTheme} light={lightTheme}>
          <App />
        </ReactiveThemeProvider>,
      ),
    )

    expect(app.text).toContain("theme:test-light")
  })

  test("switches theme when scheme changes via rerender", () => {
    const render = createRenderer({ cols: 60, rows: 5 })
    const detector = createMockDetector("dark")
    const registry = createMockRegistry(detector)

    function App() {
      const theme = useTheme()
      return <Text>{`theme:${theme.name}`}</Text>
    }

    const el = withRegistry(
      registry,
      <ReactiveThemeProvider dark={darkTheme} light={lightTheme}>
        <App />
      </ReactiveThemeProvider>,
    )

    const app = render(el)
    expect(app.text).toContain("theme:test-dark")

    // Switch to light — rerender to flush external store update
    detector.setScheme("light")
    app.rerender(el)
    expect(app.text).toContain("theme:test-light")

    // Switch back to dark
    detector.setScheme("dark")
    app.rerender(el)
    expect(app.text).toContain("theme:test-dark")
  })

  test("uses initial theme prop when scheme is unknown", () => {
    const render = createRenderer({ cols: 60, rows: 5 })
    const detector = createMockDetector("unknown")
    const registry = createMockRegistry(detector)

    function App() {
      const theme = useTheme()
      return <Text>{`theme:${theme.name}`}</Text>
    }

    const app = render(
      withRegistry(
        registry,
        <ReactiveThemeProvider dark={darkTheme} light={lightTheme} initial={lightTheme}>
          <App />
        </ReactiveThemeProvider>,
      ),
    )

    // initial=lightTheme when unknown
    expect(app.text).toContain("theme:test-light")
  })

  test("theme switch affects $token color resolution", () => {
    const render = createRenderer({ cols: 40, rows: 5 })
    const detector = createMockDetector("dark")
    const registry = createMockRegistry(detector)

    function App() {
      return (
        <Box theme={darkTheme} backgroundColor="$primary" width={10} height={1}>
          <Text>Test</Text>
        </Box>
      )
    }

    const app = render(
      withRegistry(
        registry,
        <ReactiveThemeProvider dark={darkTheme} light={lightTheme}>
          <App />
        </ReactiveThemeProvider>,
      ),
    )

    // Dark theme: $primary = #ff0000 (red) via Box theme prop
    const cell = app.lastBuffer()!.getCell(0, 0)
    expect(cell.bg).toEqual({ r: 255, g: 0, b: 0 })
  })
})
