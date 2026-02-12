/**
 * DOM Adapter Demo
 *
 * Demonstrates inkx rendering React components to DOM elements.
 * Advantages: text selection, accessibility, CSS integration.
 */

import React, { useState } from "react"
import { renderToDOM, Box, Text, useContentRect } from "../../src/dom/index.js"

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
            inkx DOM Rendering
          </Text>
          <SizeDisplay />
        </Box>
      </Box>

      <Box marginTop={1} borderStyle="round" borderColor="magenta" padding={1}>
        <Box flexDirection="column">
          <Text color="magenta">Text Styles (try selecting!)</Text>
          <Box flexDirection="row" gap={2}>
            <Text>Normal</Text>
            <Text bold>Bold</Text>
            <Text italic>Italic</Text>
          </Box>
          <Box flexDirection="row" gap={2}>
            <Text underline>Underline</Text>
            <Text strikethrough>Strike</Text>
            <Text underlineStyle="wavy" underlineColor="red">
              Wavy
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
        <Text dim>Text is selectable! Screen readers work. CSS hover states available.</Text>
      </Box>
    </Box>
  )
}

// Mount to container
const container = document.getElementById("app") as HTMLElement
if (container) {
  const instance = renderToDOM(<App />, container, {
    fontSize: 14,
    fontFamily: "monospace",
  })

  // Expose for debugging
  ;(window as any).inkxInstance = instance
}
