/**
 * Bare TextArea Test — single useInput hook, no parent useInput.
 *
 * Tests whether the bug is from two useInput hooks competing.
 * Run: bun vendor/beorn-inkx/examples/interactive/_textarea-bare.tsx
 *
 * If chars are STILL eaten → bug is in TextArea or input pipeline
 * If chars are NOT eaten → bug is from two useInput hooks
 */

import React, { useState } from "react"
import { render, Box, Text, TextArea, createTerm } from "../../src/index.js"

function BareTextArea(): JSX.Element {
  const [value, setValue] = useState("")

  // NO parent useInput — only TextArea's internal one
  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color="cyan">
        Bare TextArea (single useInput hook)
      </Text>
      <Text dim>Type slowly. Ctrl+C to exit.</Text>
      <Box height={1} />

      <Box borderStyle="single" borderColor="cyan" paddingX={1}>
        <TextArea value={value} onChange={setValue} height={4} placeholder="Type here..." />
      </Box>

      <Box marginTop={1}>
        <Text>
          Value ({value.length} chars): {JSON.stringify(value)}
        </Text>
      </Box>
    </Box>
  )
}

async function main() {
  using term = createTerm()
  const { waitUntilExit } = await render(<BareTextArea />, term)
  await waitUntilExit()
}

main().catch(console.error)
