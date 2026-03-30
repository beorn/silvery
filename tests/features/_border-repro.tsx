import React from "react"
import { Box, Text } from "@silvery/ag-react"
import { createTerm } from "@silvery/ag-term"
import { run, useInput } from "silvery/runtime"

function App() {
  useInput((_input, key) => {
    if (key.escape) return "exit"
  })
  return (
    <Box flexDirection="column">
      <Box flexDirection="row">
        <Box flexGrow={1} borderStyle="single">
          <Text>Row1-A</Text>
        </Box>
        <Box flexGrow={1} borderStyle="single">
          <Text>Row1-B</Text>
        </Box>
        <Box flexGrow={1} borderStyle="single">
          <Text>Row1-C</Text>
        </Box>
      </Box>
      <Box flexDirection="row">
        <Box flexGrow={1} borderStyle="single">
          <Text>Row2-A</Text>
        </Box>
        <Box flexGrow={1} borderStyle="single">
          <Text>Row2-B</Text>
        </Box>
      </Box>
    </Box>
  )
}

using term = createTerm()
const handle = await run(<App />, term)
await handle.waitUntilExit()
