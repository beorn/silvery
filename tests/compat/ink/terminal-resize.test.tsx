/**
 * Ink compat test: useWindowSize fallback (from ink/test/terminal-resize.tsx)
 *
 * Tests that useWindowSize falls back to LINES env var when stdout.rows is missing.
 */
import React from "react"
import { test, expect, beforeAll } from "vitest"
import { Box, Text, render, useWindowSize } from "../../../packages/compat/src/ink"
import createStdout from "./helpers/create-stdout"
import { initLayoutEngine } from "./helpers/render-to-string"

beforeAll(async () => {
  await initLayoutEngine()
})

test("useWindowSize falls back to LINES env var when stdout.rows is missing", async () => {
  const stdout = createStdout(0)
  let capturedRows = -1
  const originalColumns = process.env.COLUMNS
  const originalLines = process.env.LINES
  const originalProcessStdoutColumns = process.stdout.columns
  const originalProcessStdoutRows = process.stdout.rows

  try {
    process.env.COLUMNS = "123"
    process.env.LINES = "45"
    process.stdout.columns = 0
    process.stdout.rows = 0
    delete (stdout as any).rows

    function Test() {
      const { rows } = useWindowSize()
      capturedRows = rows
      return <Text>{rows}</Text>
    }

    const { waitUntilRenderFlush, unmount } = render(<Test />, { stdout })
    await waitUntilRenderFlush()

    expect(capturedRows).toBe(45)
    unmount()
  } finally {
    process.env.COLUMNS = originalColumns
    process.env.LINES = originalLines
    process.stdout.columns = originalProcessStdoutColumns
    process.stdout.rows = originalProcessStdoutRows
  }
})
