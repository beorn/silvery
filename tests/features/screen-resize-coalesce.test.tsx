import React from "react"
import { describe, expect, test } from "vitest"
import { createRenderer } from "@silvery/test"
import { Screen, Text } from "../../src/index.js"

const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

describe("Screen resize source", () => {
  test("does not subscribe directly to raw process.stdout resize events", async () => {
    const before = process.stdout.listenerCount("resize")
    const render = createRenderer({ cols: 120, rows: 20 })
    const app = render(
      <Screen>
        <Text>screen</Text>
      </Screen>,
    )

    await settle()

    expect(process.stdout.listenerCount("resize")).toBe(before)
    app.unmount()
  })
})
