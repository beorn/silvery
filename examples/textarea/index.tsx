/**
 * TextArea Example
 *
 * A simple note editor demonstrating:
 * - Multi-line text input with word wrapping
 * - Cursor movement (arrow keys, Home/End, Ctrl+A/E)
 * - Kill operations (Ctrl+K, Ctrl+U)
 * - Scrolling within the textarea (PageUp/PageDown)
 * - Submit with Ctrl+Enter
 */

import React, { useState } from "react"
import { run, useInput } from "../../src/runtime.js"
import { Box, Text, TextArea } from "../../src/index.js"

export function NoteEditor(): JSX.Element {
  const [notes, setNotes] = useState<string[]>([])
  const [value, setValue] = useState("")

  useInput((input) => {
    if (input === "q" && notes.length > 0) return "exit"
  })

  function handleSubmit(text: string) {
    if (text.trim()) {
      setNotes((prev) => [...prev, text.trim()])
      setValue("")
    }
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color="yellow">
        Note Editor
      </Text>
      <Text dim>Type a note, Ctrl+Enter to save. q to quit.</Text>
      <Box height={1} />

      {notes.length > 0 && (
        <Box flexDirection="column" marginBottom={1}>
          {notes.map((note, i) => (
            <Box key={i} borderStyle="round" borderColor="gray" paddingX={1}>
              <Text>
                <Text bold color="green">
                  #{i + 1}
                </Text>{" "}
                {note}
              </Text>
            </Box>
          ))}
        </Box>
      )}

      <Box borderStyle="single" borderColor="cyan" flexDirection="column">
        <Box paddingX={1}>
          <Text bold color="cyan">
            New Note
          </Text>
        </Box>
        <Box paddingX={1}>
          <TextArea
            value={value}
            onChange={setValue}
            onSubmit={handleSubmit}
            height={6}
            placeholder="Start typing..."
          />
        </Box>
      </Box>

      <Box marginTop={1}>
        <Text dim>
          {notes.length} note{notes.length !== 1 ? "s" : ""} saved
        </Text>
      </Box>
    </Box>
  )
}

await run(<NoteEditor />, { fullscreen: true })
