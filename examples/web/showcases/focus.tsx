/**
 * FocusShowcase — tab-cycling focus across three panels
 *
 * Demonstrates focus management with keyboard (Tab) and mouse click support.
 */

import React, { useState } from "react"
import { Box, Text, useContentRect, useInput } from "@silvery/term/xterm/index.ts"
import { useMouseClick, KeyHints } from "./shared.js"

export function FocusShowcase(): JSX.Element {
  const [focusedPanel, setFocusedPanel] = useState(0)
  const { width } = useContentRect()

  useInput((_input, key) => {
    if (key.tab) {
      setFocusedPanel((p) => (p + 1) % 3)
    }
  })

  // Click to focus panel
  useMouseClick(({ x }) => {
    const contentWidth = (width || 80) - 2 // subtract padding
    const panelWidth = Math.floor((contentWidth - 2) / 3) // 3 panels with 2 gaps
    const panelIdx = Math.min(2, Math.max(0, Math.floor((x - 1) / (panelWidth + 1))))
    setFocusedPanel(panelIdx)
  })

  const labels = ["Panel A", "Panel B", "Panel C"]

  return (
    <Box flexDirection="column" padding={1}>
      <Box flexDirection="row" gap={1}>
        {labels.map((label, i) => {
          const isFocused = i === focusedPanel
          return (
            <Box
              key={label}
              flexDirection="column"
              flexGrow={1}
              borderStyle="single"
              borderColor={isFocused ? "cyan" : "#444"}
              paddingX={1}
              paddingY={1}
            >
              <Text bold color={isFocused ? "cyan" : "white"}>
                {label}
              </Text>
              <Text color={isFocused ? "cyan" : "#666"}>
                {isFocused ? "\u25CF focused" : "\u25CB"}
              </Text>
            </Box>
          )
        })}
      </Box>

      <KeyHints hints="Tab cycle panels  click to focus" />
    </Box>
  )
}
