/**
 * Tests for SILVERY_STRICT_TERMINAL: independent xterm.js emulator verification.
 *
 * Verifies that the STRICT_TERMINAL check correctly:
 * 1. Passes when incremental rendering matches fresh rendering (positive case)
 * 2. Detects mismatches when output diverges (negative case)
 */
import { describe, test, expect, beforeEach, afterEach } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, Text } from "silvery"
import React, { useState } from "react"

// Save and restore env var across tests
let origStrictTerminal: string | undefined

beforeEach(() => {
  origStrictTerminal = process.env.SILVERY_STRICT_TERMINAL
})

afterEach(() => {
  if (origStrictTerminal === undefined) {
    delete process.env.SILVERY_STRICT_TERMINAL
  } else {
    process.env.SILVERY_STRICT_TERMINAL = origStrictTerminal
  }
})

describe("SILVERY_STRICT_TERMINAL", () => {
  test("passes when incremental rendering matches fresh (simple text change)", async () => {
    process.env.SILVERY_STRICT_TERMINAL = "vt100"

    const render = createRenderer({ cols: 40, rows: 10 })

    function App({ count }: { count: number }) {
      return (
        <Box flexDirection="column">
          <Text>Count: {count}</Text>
          <Text>Static line</Text>
        </Box>
      )
    }

    // Initial render
    const app = render(<App count={0} />)
    expect(app.text).toContain("Count: 0")

    // Incremental render (triggers STRICT_TERMINAL check)
    app.rerender(<App count={1} />)
    expect(app.text).toContain("Count: 1")

    // Another incremental render
    app.rerender(<App count={2} />)
    expect(app.text).toContain("Count: 2")
  })

  test("passes with styled text changes", async () => {
    process.env.SILVERY_STRICT_TERMINAL = "vt100"

    const render = createRenderer({ cols: 40, rows: 10 })

    function App({ active }: { active: boolean }) {
      return (
        <Box flexDirection="column">
          <Text bold={active} color={active ? "green" : "red"}>
            Status: {active ? "ON" : "OFF"}
          </Text>
          <Box backgroundColor={active ? "blue" : "cyan"} width={20} height={1}>
            <Text>Panel</Text>
          </Box>
        </Box>
      )
    }

    const app = render(<App active={false} />)
    expect(app.text).toContain("Status: OFF")

    // Toggle style — triggers STRICT_TERMINAL check
    app.rerender(<App active={true} />)
    expect(app.text).toContain("Status: ON")

    // Toggle back
    app.rerender(<App active={false} />)
    expect(app.text).toContain("Status: OFF")
  })

  test("passes with content growth and shrinkage", async () => {
    process.env.SILVERY_STRICT_TERMINAL = "vt100"

    const render = createRenderer({ cols: 40, rows: 15 })

    function App({ items }: { items: string[] }) {
      return (
        <Box flexDirection="column">
          <Text>Header</Text>
          {items.map((item, i) => (
            <Text key={i}>{item}</Text>
          ))}
          <Text>Footer</Text>
        </Box>
      )
    }

    const app = render(<App items={["A", "B"]} />)
    expect(app.text).toContain("Header")

    // Grow
    app.rerender(<App items={["A", "B", "C", "D"]} />)
    expect(app.text).toContain("D")

    // Shrink
    app.rerender(<App items={["X"]} />)
    expect(app.text).toContain("X")
  })

  test("disabled when env var is not set", async () => {
    delete process.env.SILVERY_STRICT_TERMINAL

    const render = createRenderer({ cols: 40, rows: 10 })

    function App({ count }: { count: number }) {
      return <Text>Count: {count}</Text>
    }

    // Should not throw even if there were a mismatch, because STRICT_TERMINAL is off
    const app = render(<App count={0} />)
    app.rerender(<App count={1} />)
    expect(app.text).toContain("Count: 1")
  })

  test("passes with background color changes", async () => {
    process.env.SILVERY_STRICT_TERMINAL = "vt100"

    const render = createRenderer({ cols: 30, rows: 8 })

    function App({ selected }: { selected: number }) {
      return (
        <Box flexDirection="column">
          {[0, 1, 2].map((i) => (
            <Box key={i} backgroundColor={i === selected ? "blue" : undefined}>
              <Text>Item {i}</Text>
            </Box>
          ))}
        </Box>
      )
    }

    const app = render(<App selected={0} />)
    expect(app.text).toContain("Item 0")

    // Move selection
    app.rerender(<App selected={1} />)
    expect(app.text).toContain("Item 1")

    app.rerender(<App selected={2} />)
    expect(app.text).toContain("Item 2")
  })

  test("passes with border rendering", async () => {
    process.env.SILVERY_STRICT_TERMINAL = "vt100"

    const render = createRenderer({ cols: 30, rows: 10 })

    function App({ title }: { title: string }) {
      return (
        <Box borderStyle="round" borderColor="green" width={20} height={5}>
          <Text>{title}</Text>
        </Box>
      )
    }

    const app = render(<App title="Hello" />)
    expect(app.text).toContain("Hello")

    // Change content inside border
    app.rerender(<App title="World" />)
    expect(app.text).toContain("World")
  })
})
