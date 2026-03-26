/**
 * Canvas Adapter Demo
 *
 * Demonstrates silvery rendering React components to Canvas.
 */

import React, { useState } from "react"
import {
  renderToCanvas,
  Box,
  Text,
  useContentRect,
} from "../../packages/ag-react/src/ui/canvas/index.js"

// Component that shows its dimensions
function SizeDisplay() {
  const { width, height } = useContentRect()
  return (
    <Text color="green">
      Size: {Math.round(width)}px × {Math.round(height)}px
    </Text>
  )
}

// Demo component with various styles
function App() {
  return (
    <Box flexDirection="column" padding={1}>
      <Box borderStyle="single" borderColor="cyan" padding={1}>
        <Box flexDirection="column">
          <Text bold color="cyan">
            silvery Canvas Rendering
          </Text>
          <SizeDisplay />
        </Box>
      </Box>

      <Box marginTop={1} borderStyle="round" borderColor="magenta" padding={1}>
        <Box flexDirection="column">
          <Text color="magenta">Text Styles</Text>
          <Box flexDirection="row" gap={2}>
            <Text>Normal</Text>
            <Text bold>Bold</Text>
            <Text italic>Italic</Text>
          </Box>
          <Box flexDirection="row" gap={2}>
            <Text underline>Underline</Text>
            <Text strikethrough>Strike</Text>
            <Text underlineStyle="curly" underlineColor="red">
              Curly
            </Text>
          </Box>
        </Box>
      </Box>

      <Box marginTop={1} flexDirection="row" gap={1}>
        <Box backgroundColor="red" padding={1}>
          <Text color="white">Red</Text>
        </Box>
        <Box backgroundColor="green" padding={1}>
          <Text color="black">Green</Text>
        </Box>
        <Box backgroundColor="blue" padding={1}>
          <Text color="white">Blue</Text>
        </Box>
      </Box>

      <Box marginTop={1}>
        <Text dim>Layout by Flexx, rendered to OffscreenCanvas, drawn to visible canvas</Text>
      </Box>
    </Box>
  )
}

// Mount to canvas
const canvas = document.getElementById("canvas") as HTMLCanvasElement
if (canvas) {
  const instance = renderToCanvas(<App />, canvas, {
    fontSize: 14,
    fontFamily: "monospace",
  })

  // Expose for debugging
  ;(window as any).silveryInstance = instance
}
