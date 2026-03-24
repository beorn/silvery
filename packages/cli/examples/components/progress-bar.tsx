/**
 * ProgressBar — Determinate and indeterminate progress
 *
 * Press j/k to adjust progress. Shows determinate bars with
 * percentage labels and an indeterminate animated bar.
 *
 * Usage: bun examples/components/progress-bar.tsx
 */

import React, { useState } from "react"
import { Box, Text, ProgressBar } from "../../src/index.js"
import { run, useInput } from "@silvery/ag-term/runtime"

function ProgressBarDemo() {
  const [progress, setProgress] = useState(0.4)

  useInput((input, key) => {
    if (input === "j" || key.rightArrow) setProgress((p) => Math.min(1, p + 0.05))
    if (input === "k" || key.leftArrow) setProgress((p) => Math.max(0, p - 0.05))
    if (input === "q" || key.escape) return "exit"
  })

  return (
    <Box flexDirection="column" padding={1} gap={1}>
      <Text bold>Determinate</Text>
      <Box width={40}>
        <ProgressBar value={progress} />
      </Box>

      <Text bold>Indeterminate</Text>
      <Box width={40}>
        <ProgressBar />
      </Box>

      <Text color="$muted">j/k: adjust q: quit</Text>
    </Box>
  )
}

export const meta = {
  name: "Progress Bar",
  description: "Determinate and indeterminate progress bars",
}

if (import.meta.main) {
  const handle = await run(<ProgressBarDemo />)
  await handle.waitUntilExit()
}
