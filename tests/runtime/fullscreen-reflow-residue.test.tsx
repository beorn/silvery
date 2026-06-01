import React from "react"
import { describe, expect, test } from "vitest"
import { createTermless } from "@silvery/test"
import "@termless/test/matchers"
import { Box, Text } from "../../src/index.js"
import { TerminalBuffer } from "../../packages/ag-term/src/buffer"
import { createRuntime } from "../../packages/ag-term/src/runtime/create-runtime"
import type { Buffer, Dims } from "../../packages/ag-term/src/runtime/types"
import { run } from "../../packages/ag-term/src/runtime/run"
import type { AgNode } from "../../packages/ag/src/types"

const settle = (ms = 60) => new Promise<void>((resolve) => setTimeout(resolve, ms))
const waitForResize = () => settle(260)

function rootNode(): AgNode {
  return {
    type: "silvery-root",
    props: {},
    children: [],
    parent: null,
  } as unknown as AgNode
}

function buffer(width: number, height: number, label: string): Buffer {
  const terminalBuffer = new TerminalBuffer(width, height)
  for (let i = 0; i < label.length && i < width; i++) {
    terminalBuffer.setCell(i, 0, { char: label[i]! })
  }
  return {
    text: label,
    ansi: label,
    nodes: rootNode(),
    _buffer: terminalBuffer,
  }
}

function StableFullscreenApp() {
  return (
    <Box flexDirection="column" width="100%" height="100%">
      <Text>stable top</Text>
      <Box flexGrow={1}>
        <Text>stable body</Text>
      </Box>
      <Text>stable bottom</Text>
    </Box>
  )
}

function TickingFullscreenApp() {
  const [tick, setTick] = React.useState(0)
  React.useEffect(() => {
    const interval = setInterval(() => setTick((value) => value + 1), 30)
    return () => clearInterval(interval)
  }, [])

  return (
    <Box flexDirection="column" width="100%" height="100%">
      <Text>live transcript row</Text>
      <Box flexGrow={1}>
        <Text>ongoing tool output</Text>
      </Box>
      <Text>tick {tick}</Text>
    </Box>
  )
}

describe("fullscreen reflow residue", () => {
  test("runtime clears fullscreen output after a same-size resize notification", () => {
    let dims: Dims = { cols: 24, rows: 6 }
    let onResize: ((dims: Dims) => void) | undefined
    const writes: string[] = []

    using runtime = createRuntime({
      mode: "fullscreen",
      target: {
        write(frame) {
          writes.push(frame)
        },
        getDims() {
          return dims
        },
        onResize(handler) {
          onResize = handler
          return () => {
            onResize = undefined
          }
        },
      },
    })

    runtime.render(buffer(dims.cols, dims.rows, "before"))
    writes.length = 0

    onResize?.(dims)
    runtime.render(buffer(dims.cols, dims.rows, "after"))

    const frame = writes.at(-1) ?? ""
    expect(frame).toContain("\x1b[2J\x1b[H")
  })

  test("termless resize-residue backend is cleared by the next fullscreen paint", async () => {
    using term = createTermless({ cols: 40, rows: 8, reflowResidue: true })
    const handle = await run(<StableFullscreenApp />, term)

    expect(term.screen).toContainText("stable top")
    expect(term.screen.getText()).not.toContain(term.reflowResidue!.marker)
    term.out.clear()

    term.resize!(32, 8)
    await waitForResize()

    const outputAfterResize = term.out.getText()
    expect(outputAfterResize).toContain("\x1b[2J")
    expect(term.screen.getText()).not.toContain(term.reflowResidue!.marker)

    handle.unmount()
  })

  test("same-size resize notification clears fullscreen residue without focus-in", async () => {
    using term = createTermless({ cols: 40, rows: 8, reflowResidue: true })
    const handle = await run(<StableFullscreenApp />, term)

    expect(term.screen).toContainText("stable top")
    term.out.clear()

    term.reflowResidue!.arm()
    term.resize!(40, 8)
    await waitForResize()

    const outputAfterResize = term.out.getText()
    expect(outputAfterResize).toContain("\x1b[2J")

    handle.unmount()
  })

  test("same-size workspace restore residue is cleared on focus-in", async () => {
    using term = createTermless({ cols: 40, rows: 8, reflowResidue: true })
    const handle = await run(<StableFullscreenApp />, term)

    expect(term.screen).toContainText("stable top")
    term.out.clear()

    term.reflowResidue!.arm()
    ;(term as unknown as { sendInput(data: string): void }).sendInput("\x1b[I")
    await settle()

    const outputAfterFocus = term.out.getText()
    expect(outputAfterFocus).toContain("\x1b[2J")
    expect(term.screen.getText()).not.toContain(term.reflowResidue!.marker)

    handle.unmount()
  })

  test("focus-out damage risk clears fullscreen residue on the next live render if focus-in is missed", async () => {
    using term = createTermless({ cols: 40, rows: 8, reflowResidue: true })
    const handle = await run(<TickingFullscreenApp />, term)

    try {
      expect(term.screen).toContainText("live transcript row")

      ;(term as unknown as { sendInput(data: string): void }).sendInput("\x1b[O")
      await settle()

      term.out.clear()
      term.reflowResidue!.arm()
      await settle(650)

      const outputAfterTick = term.out.getText()
      expect(outputAfterTick).toContain("\x1b[2J")
      expect(term.screen.getText()).not.toContain(term.reflowResidue!.marker)
    } finally {
      handle.unmount()
    }
  })
})
