/**
 * ScrollShowcase — scrollable list with keyboard navigation
 *
 * Demonstrates overflow="scroll" with scrollTo for auto-scrolling to selection.
 */

import React, { useState } from "react"
import { Box, Text, useInput } from "@silvery/term/xterm/index.ts"
import { KeyHints } from "./shared.js"

export function ScrollShowcase(): JSX.Element {
  const [selectedIdx, setSelectedIdx] = useState(0)

  useInput((_input, key) => {
    if (key.upArrow) setSelectedIdx((idx) => Math.max(0, idx - 1))
    if (key.downArrow) setSelectedIdx((idx) => Math.min(29, idx + 1))
  })

  const items = Array.from({ length: 30 }, (_, i) => `Item ${i + 1}`)

  return (
    <Box flexDirection="column" padding={1}>
      <Box
        flexDirection="column"
        flexGrow={1}
        borderStyle="single"
        borderColor="#444"
        overflow="scroll"
        scrollTo={selectedIdx}
      >
        {items.map((item, i) => (
          <Box key={i} paddingX={1}>
            <Text bold={i === selectedIdx} color={i === selectedIdx ? "cyan" : "white"}>
              {i === selectedIdx ? "\u25B8 " : "  "}
              {item}
            </Text>
          </Box>
        ))}
      </Box>
      <KeyHints hints={"\u2191\u2193 navigate"} />
    </Box>
  )
}
