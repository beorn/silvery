/**
 * Fixture app for palette-reprobe.test.ts — a plain `run()` app with no
 * explicit colors, so every background it paints comes from the palette the
 * terminal probe produced. Spawned under a real PTY by the test.
 */

import React from "react"
import { run } from "@silvery/ag-term/runtime"
import { Box, Text } from "@silvery/ag-react"

function App(): React.ReactElement {
  return (
    <Box flexDirection="column">
      <Text>palette-fixture</Text>
    </Box>
  )
}

const handle = await run(<App />)
await handle.waitUntilExit()
