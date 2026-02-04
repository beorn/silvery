import React from "react"
import {
  render,
  Box,
  Text,
  useApp,
  useInput,
  createTerm,
} from "../../src/index.js"

function App() {
  const { exit } = useApp()
  useInput((input) => {
    if (input === "q") exit()
  })

  return (
    <Box flexDirection="column" padding={1}>
      <Text color="yellow">Title</Text>

      <Box borderStyle="single" borderColor="cyan" height={5} overflow="hidden">
        <Box flexDirection="column" flexGrow={1}>
          <Text>Line 1</Text>
          <Text>Line 2</Text>
          <Text>Line 3</Text>
          <Text>Line 4</Text>
          <Text>Line 5</Text>
          <Text>Line 6 - should NOT appear</Text>
          <Text>Line 7 - should NOT appear</Text>
        </Box>
      </Box>

      <Text color="green">This should NOT be corrupted</Text>
    </Box>
  )
}

async function main() {
  using term = createTerm()
  const { waitUntilExit } = await render(<App />, term)
  await waitUntilExit()
}

main().catch(console.error)
