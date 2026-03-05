/**
 * xterm.js Adapter Demo
 *
 * Demonstrates inkx rendering React components to an xterm.js terminal.
 * The terminal adapter produces ANSI escape sequences, xterm.js renders them.
 */

import React from "react"
import { Terminal } from "@xterm/xterm"
import { FitAddon } from "@xterm/addon-fit"
import { renderToXterm, Box, Text, useContentRect } from "../../src/xterm/index.js"

// Component that shows its dimensions (in cells, not pixels)
function SizeDisplay() {
  const { width, height } = useContentRect()
  return (
    <Text color="green">
      Size: {width} cols x {height} rows
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
            inkx xterm.js Rendering
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
            <Text dim>Dim</Text>
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
        <Text dim>Layout by Flexx, ANSI output via terminal adapter, rendered by xterm.js</Text>
      </Box>
    </Box>
  )
}

// Set up xterm.js terminal
const termContainer = document.getElementById("terminal") as HTMLElement
if (termContainer) {
  const term = new Terminal({
    cursorBlink: false,
    convertEol: true,
    cols: 80,
    rows: 24,
    fontFamily: "'Cascadia Code', 'Fira Code', 'JetBrains Mono', Menlo, monospace",
    fontSize: 14,
    theme: {
      background: "#1a1a2e",
      foreground: "#eee",
    },
  })

  const fitAddon = new FitAddon()
  term.loadAddon(fitAddon)
  term.open(termContainer)
  fitAddon.fit()

  const instance = renderToXterm(<App />, term)

  // Re-fit and re-render on window resize
  // Must use resize() (not refresh()) — clears the old buffer so the
  // next render does a full repaint at the new dimensions.
  window.addEventListener("resize", () => {
    fitAddon.fit()
    instance.resize(term.cols, term.rows)
  })

  // Expose for debugging
  ;(window as any).highteaInstance = instance
  ;(window as any).xtermTerminal = term
}
