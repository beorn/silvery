/**
 * TextInput — Single-line text entry
 *
 * Shows TextInput with placeholder, prompt, and submit handler.
 * Full readline keybindings (Ctrl+A/E/K/U, Alt+B/F) are built in.
 *
 * Usage: bun examples/components/text-input.tsx
 */

import React, { useState } from "react"
import { Box, Text, TextInput } from "../../src/index.js"
import { run, useInput } from "@silvery/ag-term/runtime"

function TextInputDemo() {
  const [value, setValue] = useState("")
  const [submitted, setSubmitted] = useState<string[]>([])

  useInput((_, key) => {
    if (key.escape) return "exit"
  })

  return (
    <Box flexDirection="column" padding={1} gap={1}>
      <TextInput
        value={value}
        onChange={setValue}
        onSubmit={(val) => {
          setSubmitted((prev) => [...prev, val])
          setValue("")
        }}
        placeholder="Type something and press Enter..."
        prompt="> "
      />
      {submitted.length > 0 && (
        <Box flexDirection="column">
          <Text color="$muted">Submitted:</Text>
          {submitted.map((s, i) => (
            <Text key={i} color="$success">
              {s}
            </Text>
          ))}
        </Box>
      )}
      <Text color="$muted">Enter: submit Esc: quit</Text>
    </Box>
  )
}

export const meta = {
  name: "Text Input",
  description: "Single-line text entry with readline keybindings",
}

if (import.meta.main) {
  const handle = await run(<TextInputDemo />)
  await handle.waitUntilExit()
}
