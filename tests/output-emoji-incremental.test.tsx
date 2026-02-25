/**
 * Incremental rendering tests with emoji content.
 *
 * Exercises the full pipeline: content-phase writes emoji to buffer,
 * output-phase diffs buffers and emits changesToAnsi, INKX_STRICT verifies
 * that incremental output matches fresh render.
 *
 * This catches issues where:
 * - Buffer stores emoji correctly but changesToAnsi emits wrong sequences
 * - replayAnsiWithStyles splits grapheme clusters
 * - Wide char continuation cells are mishandled during incremental diff
 */
import { describe, test, expect, beforeEach, afterEach } from "vitest"
import React, { useState } from "react"
import { createRenderer } from "inkx/testing"
import { Box, Text } from "inkx"

beforeEach(() => {
  process.env.INKX_STRICT = "1"
})
afterEach(() => {
  delete process.env.INKX_STRICT
})

describe("incremental rendering with emoji", () => {
  test("ZWJ emoji in text doesn't garble on state change", async () => {
    const render = createRenderer({ cols: 40, rows: 5 })

    function App({ selected }: { selected: number }) {
      const items = ["🏃‍♂️ Running", "👨🏻‍💻 Coding", "🏋️‍♂️ Lifting"]
      return (
        <Box flexDirection="column">
          {items.map((item, i) => (
            <Text key={i} inverse={i === selected}>
              {item}
            </Text>
          ))}
        </Box>
      )
    }

    const app = render(<App selected={0} />)
    expect(app.text).toContain("Running")

    // Each rerender triggers incremental diff — INKX_STRICT verifies
    app.rerender(<App selected={1} />)
    expect(app.text).toContain("Coding")

    app.rerender(<App selected={2} />)
    expect(app.text).toContain("Lifting")

    app.rerender(<App selected={0} />)
    expect(app.text).toContain("Running")
  })

  test("flag emoji in columns doesn't garble on navigation", async () => {
    const render = createRenderer({ cols: 60, rows: 5 })

    function App({ col }: { col: number }) {
      const cols = [
        { flag: "🇨🇦", label: "Canada" },
        { flag: "🇺🇸", label: "USA" },
        { flag: "🇯🇵", label: "Japan" },
      ]
      return (
        <Box>
          {cols.map((c, i) => (
            <Box key={i} width={20} borderStyle={i === col ? "single" : undefined}>
              <Text>
                {c.flag} {c.label}
              </Text>
            </Box>
          ))}
        </Box>
      )
    }

    const app = render(<App col={0} />)

    app.rerender(<App col={1} />)
    expect(app.text).toContain("USA")

    app.rerender(<App col={2} />)
    expect(app.text).toContain("Japan")

    app.rerender(<App col={0} />)
    expect(app.text).toContain("Canada")
  })

  test("mixed emoji and ASCII — text changes within same layout", async () => {
    const render = createRenderer({ cols: 50, rows: 5 })

    function App({ label }: { label: string }) {
      return (
        <Box flexDirection="column">
          <Text>07:30 Morning routine 🏃‍♂️</Text>
          <Text>08:00 Breakfast ☕</Text>
          <Text>{label} 💻</Text>
        </Box>
      )
    }

    const app = render(<App label="09:00 Work start" />)
    expect(app.text).toContain("Morning")

    // Change one line's text — same layout, different content
    app.rerender(<App label="09:00 Deep work" />)
    expect(app.text).toContain("Deep work")

    app.rerender(<App label="10:00 Meeting" />)
    expect(app.text).toContain("Meeting")
  })

  test("emoji appearing and disappearing in same position", async () => {
    const render = createRenderer({ cols: 30, rows: 3 })

    function App({ showEmoji }: { showEmoji: boolean }) {
      return <Text>{showEmoji ? "🏃‍♂️ active" : "   idle  "}</Text>
    }

    const app = render(<App showEmoji={true} />)
    expect(app.text).toContain("active")

    // Emoji → no emoji (must clear both columns of wide char)
    app.rerender(<App showEmoji={false} />)
    expect(app.text).toContain("idle")

    // No emoji → emoji (must write 2-wide char)
    app.rerender(<App showEmoji={true} />)
    expect(app.text).toContain("active")
  })

  test("family emoji (4-person ZWJ sequence)", async () => {
    const render = createRenderer({ cols: 30, rows: 3 })

    function App({ label }: { label: string }) {
      return <Text>👨‍👩‍👧‍👦 {label}</Text>
    }

    const app = render(<App label="first" />)
    expect(app.text).toContain("first")

    app.rerender(<App label="second" />)
    expect(app.text).toContain("second")
  })
})
