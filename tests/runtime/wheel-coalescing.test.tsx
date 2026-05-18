import React from "react"
import { useState } from "react"
import { describe, expect, test } from "vitest"
import { createTermless } from "@silvery/test"
import { Box, Text } from "../../src/index.js"
import { run } from "../../packages/ag-term/src/runtime/run"

const settle = (ms = 40): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))
const immediate = (): Promise<void> => new Promise((resolve) => setImmediate(resolve))

function wheelUpBurst(x: number, y: number, count: number): string {
  return Array.from({ length: count }, () => `\x1b[<64;${x + 1};${y + 1}M`).join("")
}

describe("runtime wheel coalescing", () => {
  test("same-chunk SGR wheel burst dispatches as one distance-preserving wheel event", async () => {
    using term = createTermless({ cols: 24, rows: 6 })
    const wheelDeltas: number[] = []

    function App(): React.ReactElement {
      return (
        <Box width={24} height={6} onWheel={(event) => wheelDeltas.push(event.deltaY)}>
          <Text>scroll target</Text>
        </Box>
      )
    }

    const handle = await run(<App />, term, { mouse: true, selection: false })
    await settle()

    ;(term as unknown as { sendInput(data: string): void }).sendInput(wheelUpBurst(2, 0, 12))
    await settle()

    handle.unmount()

    expect(wheelDeltas).toEqual([-12])
  })

  test("wheel stream renders without waiting for the input queue to become stable", async () => {
    using term = createTermless({ cols: 24, rows: 6 })

    function App(): React.ReactElement {
      const [count, setCount] = useState(0)
      return (
        <Box
          width={24}
          height={6}
          onWheel={(event) => setCount((prev) => prev + Math.abs(event.deltaY))}
        >
          <Text>count={count}</Text>
        </Box>
      )
    }

    const handle = await run(<App />, term, { mouse: true, selection: false })
    await settle()

    const si = term as unknown as { sendInput(data: string): void }
    try {
      si.sendInput(wheelUpBurst(2, 0, 1))
      let remaining = 12
      const emitLater = () => {
        if (remaining <= 0) return
        remaining--
        si.sendInput(wheelUpBurst(2, 0, 1))
        setImmediate(emitLater)
      }
      setImmediate(emitLater)

      await immediate()
      await immediate()
      await immediate()

      expect(term.screen).toContainText("count=")
      expect(term.screen).not.toContainText("count=0")

      await settle(120)
      expect(term.screen).toContainText("count=13")
    } finally {
      handle.unmount()
    }
  })
})
