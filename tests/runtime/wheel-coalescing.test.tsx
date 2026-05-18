import React from "react"
import { useEffect, useState } from "react"
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
  test("same-chunk SGR wheel burst dispatches as one immediate distance-preserving wheel event", async () => {
    using term = createTermless({ cols: 24, rows: 6 })
    const wheelDeltas: number[] = []
    const wheelTimestamps: Array<number | undefined> = []
    const wheelBatchIds: Array<number | undefined> = []

    function App(): React.ReactElement {
      return (
        <Box
          width={24}
          height={6}
          onWheel={(event) => {
            wheelDeltas.push(event.deltaY)
            wheelTimestamps.push(event.timeStamp)
            wheelBatchIds.push(event.inputBatchId)
          }}
        >
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
    expect(wheelTimestamps).toHaveLength(1)
    expect(wheelTimestamps.every((timestamp) => Number.isFinite(timestamp))).toBe(true)
    expect(wheelBatchIds).toHaveLength(1)
    expect(new Set(wheelBatchIds).size).toBe(1)
    expect(wheelBatchIds[0]).toBeGreaterThan(0)
  })

  test("same-chunk SGR wheel burst does not create delayed intermediate renders", async () => {
    using term = createTermless({ cols: 24, rows: 6 })
    const committedCounts: number[] = []

    function App(): React.ReactElement {
      const [count, setCount] = useState(0)
      useEffect(() => {
        committedCounts.push(count)
      }, [count])
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

    ;(term as unknown as { sendInput(data: string): void }).sendInput(wheelUpBurst(2, 0, 12))
    await settle()

    handle.unmount()

    expect(committedCounts).toContain(12)
    expect(committedCounts).not.toContain(4)
    expect(committedCounts).not.toContain(8)
  })

  test("separate terminal input batches preserve wheel cadence", async () => {
    using term = createTermless({ cols: 24, rows: 6 })
    const wheelDeltas: number[] = []
    const wheelBatchIds: Array<number | undefined> = []

    function App(): React.ReactElement {
      return (
        <Box
          width={24}
          height={6}
          onWheel={(event) => {
            wheelDeltas.push(event.deltaY)
            wheelBatchIds.push(event.inputBatchId)
          }}
        >
          <Text>scroll target</Text>
        </Box>
      )
    }

    const handle = await run(<App />, term, { mouse: true, selection: false })
    await settle()

    const si = term as unknown as { sendInput(data: string): void }
    si.sendInput(wheelUpBurst(2, 0, 1))
    si.sendInput(wheelUpBurst(2, 0, 1))
    await settle()

    handle.unmount()

    expect(wheelDeltas).toEqual([-1, -1])
    expect(new Set(wheelBatchIds).size).toBe(2)
  })

  test("separate terminal input batches render as separate pointer frames", async () => {
    using term = createTermless({ cols: 24, rows: 6 })
    const committedCounts: number[] = []

    function App(): React.ReactElement {
      const [count, setCount] = useState(0)
      useEffect(() => {
        committedCounts.push(count)
      }, [count])
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
    si.sendInput(wheelUpBurst(2, 0, 1))
    si.sendInput(wheelUpBurst(2, 0, 1))
    await settle()

    handle.unmount()

    expect(committedCounts).toContain(1)
    expect(committedCounts).toContain(2)
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

  test("mouse move stream renders without waiting for the input queue to become stable", async () => {
    using term = createTermless({ cols: 24, rows: 6 })

    function App(): React.ReactElement {
      const [moves, setMoves] = useState(0)
      return (
        <Box width={24} height={6} onMouseMove={() => setMoves((prev) => prev + 1)}>
          <Text>moves={moves}</Text>
        </Box>
      )
    }

    const handle = await run(<App />, term, { mouse: true, selection: false })
    await settle()

    try {
      await term.mouse.move(2, 0)
      let remaining = 12
      const emitLater = () => {
        if (remaining <= 0) return
        remaining--
        void term.mouse.move(2 + (remaining % 3), 0).then(() => {
          setImmediate(emitLater)
        })
      }
      setImmediate(emitLater)

      await immediate()
      await immediate()
      await immediate()

      expect(term.screen).toContainText("moves=")
      expect(term.screen).not.toContainText("moves=0")

      await settle(120)
      expect(term.screen).toContainText("moves=13")
    } finally {
      handle.unmount()
    }
  })
})
