/**
 * <Island> focused input routing through createApp.
 *
 * Terminal-pane consumers need a focused Island to receive PTY-shaped input:
 * keys as ANSI bytes and mouse reports translated into island-local SGR
 * coordinates. Protocol mode aggregation is covered in
 * islands-mode-routing.test.tsx; this file pins the actual event delivery.
 */

import React from "react"
import { describe, expect, test } from "vitest"
import { Box, Island, Text, useInput } from "@silvery/ag-react"
import { createCellBuffer } from "@silvery/ag/viewport-buffer"
import { createTermless } from "@silvery/test"
import type {
  IslandGuest,
  IslandHandle,
  IslandInputOwner,
  IslandOutputOwner,
  IslandSizeOwner,
} from "@silvery/ag/island-types"
import { run } from "../../packages/ag-term/src/runtime/run"

function createInputRecorderGuest(): { guest: IslandGuest; feeds: string[] } {
  const feeds: string[] = []
  const decoder = new TextDecoder()
  const guest: IslandGuest = {
    capabilities: { input: true },
    init(ctx) {
      const size: IslandSizeOwner = {
        get cols() {
          return ctx.cols
        },
        get rows() {
          return ctx.rows
        },
        subscribe: () => () => {},
        requestResize: () => {},
      }
      const output: IslandOutputOwner = {
        buffer: createCellBuffer(ctx.cols, ctx.rows),
        cursor: null,
        cursorVisible: false,
        subscribe: () => () => {},
        writeCells: () => {},
        invalidateAll: () => {},
      }
      const input: IslandInputOwner = {
        feed(bytes) {
          feeds.push(decoder.decode(bytes))
        },
      }
      const handle: IslandHandle = {
        size,
        output,
        input,
        dispose: () => {},
      }
      ctx.emit({ type: "ready" })
      return Promise.resolve(handle)
    },
  }
  return { guest, feeds }
}

async function settle(ms = 30): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, ms))
}

describe("focused Island input routing", () => {
  test("keys feed the focused island and do not fall through to useInput", async () => {
    using term = createTermless({ cols: 40, rows: 8 })
    const recorder = createInputRecorderGuest()
    const hostInputs: string[] = []

    function App(): React.ReactElement {
      useInput((input) => {
        hostInputs.push(input)
      })
      return (
        <Box flexDirection="column">
          <Island guest={recorder.guest} cols={10} rows={2} focusable />
          <Text>after</Text>
        </Box>
      )
    }

    const handle = await run(<App />, term)
    try {
      await handle.press("Tab")
      await handle.press("a")
      await settle()

      expect(recorder.feeds).toEqual(["a"])
      expect(hostInputs).toEqual([])
    } finally {
      handle.unmount()
    }
  })

  test("mouse reports feed focused island with island-local SGR coordinates", async () => {
    using term = createTermless({ cols: 40, rows: 8 })
    const recorder = createInputRecorderGuest()

    const handle = await run(
      <Box flexDirection="column">
        <Island guest={recorder.guest} cols={10} rows={3} focusable />
        <Text>after</Text>
      </Box>,
      term,
      { mouse: true } as never,
    )
    try {
      await handle.press("Tab")
      await term.mouse.click(3, 1)
      await settle()

      expect(recorder.feeds).toContain("\x1b[<0;4;2M")
      expect(recorder.feeds).toContain("\x1b[<0;4;2m")
    } finally {
      handle.unmount()
    }
  })
})
