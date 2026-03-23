import { describe, test, expect } from "vitest"
import React from "react"
import { createRenderer } from "@silvery/test"
import { Box, Text } from "@silvery/react"

describe("Cmd+click via test API", () => {
  test("click with { cmd: true } sets metaKey", async () => {
    let metaKey: boolean | undefined
    const render = createRenderer({ cols: 40, rows: 5 })
    const app = render(
      <Box onClick={(e) => { metaKey = e.metaKey }}>
        <Text>Click me</Text>
      </Box>,
    )

    await app.click(0, 0, { cmd: true })
    expect(metaKey).toBe(true)
  })

  test("click without cmd has metaKey false", async () => {
    let metaKey: boolean | undefined
    const render = createRenderer({ cols: 40, rows: 5 })
    const app = render(
      <Box onClick={(e) => { metaKey = e.metaKey }}>
        <Text>Click me</Text>
      </Box>,
    )

    await app.click(0, 0)
    expect(metaKey).toBe(false)
  })

  test("cmd resets after click (no leak between clicks)", async () => {
    const results: boolean[] = []
    const render = createRenderer({ cols: 40, rows: 5 })
    const app = render(
      <Box onClick={(e) => { results.push(e.metaKey) }}>
        <Text>Click me</Text>
      </Box>,
    )

    await app.click(0, 0, { cmd: true })
    await app.click(0, 0)
    expect(results).toEqual([true, false])
  })
})

describe("Cmd+click via Kitty keyboard events", () => {
  test("Super keypress before click sets metaKey on mouse event", async () => {
    let metaKey: boolean | undefined
    const render = createRenderer({ cols: 40, rows: 5, kittyMode: true })
    const app = render(
      <Box onClick={(e) => { metaKey = e.metaKey }}>
        <Text>Click me</Text>
      </Box>,
    )

    // Simulate pressing Super+a (key event with super=true modifier)
    await app.press("Super+a")
    await app.click(0, 0)
    expect(metaKey).toBe(true)
  })
})
