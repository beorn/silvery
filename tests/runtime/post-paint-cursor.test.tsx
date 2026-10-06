import React, { useContext, useLayoutEffect } from "react"
import { describe, expect, test } from "vitest"
import { createTermless } from "@silvery/test"
import "@termless/test/matchers"

import { Box, TextArea } from "../../src/index.js"
import { StdoutContext } from "../../packages/ag-react/src/context"
import { run } from "../../packages/ag-term/src/runtime/run"

const settle = (ms = 40): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

function RawPostPaintWrite(): React.ReactElement | null {
  const stdout = useContext(StdoutContext)
  useLayoutEffect(() => {
    stdout?.writeAfterFrame?.("\x1b[1;1H!")
  }, [stdout])
  return null
}

describe("runtime post-paint cursor restoration", () => {
  test("raw writeAfterFrame writes are followed by the active cursor suffix", async () => {
    using term = createTermless({ cols: 30, rows: 6 })

    const handle = await run(
      <Box flexDirection="column" padding={1}>
        <RawPostPaintWrite />
        <TextArea defaultValue="compose" fieldSizing="fixed" rows={1} isActive />
      </Box>,
      term,
    )

    try {
      await expect(term.out).toContainOutput("compose", { timeout: 500 })
      await expect(term.out).toContainOutput("!", { timeout: 500 })
      await settle()

      // The managed-caret contract (19702, managed-caret.ts) parks the hardware
      // cursor at the caret and keeps it hidden; the caret the user sees is the
      // composited inverse cell. This test predates that contract, so the restore
      // is checked as park-at-caret plus hidden, never a re-shown hardware cursor.
      expect(term, "post-frame write must not leave cursor at the raw write site").toHaveCursor({
        x: 1 + "compose".length,
        y: 1,
        visible: false,
      })
      expect(
        term.cell(1, 1 + "compose".length),
        "the composited caret stays painted at the caret",
      ).toHaveAttrs({
        inverse: true,
      })
    } finally {
      handle.unmount()
    }
  })
})
