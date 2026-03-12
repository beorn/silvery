/**
 * Input Debug Tool
 *
 * Minimal diagnostic to find where keypresses are lost.
 * Shows every event received by useInput + TextArea side by side.
 *
 * Run: bun vendor/silvery/examples/interactive/_input-debug.tsx
 */

import React, { useState, useRef } from "react"
import { render, Box, Text, TextArea, useInput, useApp, createTerm, type Key } from "../../src/index.js"

function InputDebug(): JSX.Element {
  const { exit } = useApp()

  // Track raw useInput events
  const [rawEvents, setRawEvents] = useState<string[]>([])
  const rawCountRef = useRef(0)

  // Track TextArea value
  const [textValue, setTextValue] = useState("")
  const textChangeCountRef = useRef(0)

  // Raw useInput handler — logs EVERY event
  useInput((input: string, key: Key) => {
    if (key.escape) {
      exit()
      return
    }
    rawCountRef.current++
    const desc = describeKey(input, key)
    setRawEvents((prev) => [...prev.slice(-15), `#${rawCountRef.current} ${desc}`])
  })

  // TextArea onChange handler
  function handleChange(value: string) {
    textChangeCountRef.current++
    setTextValue(value)
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color="cyan">
        Input Pipeline Diagnostic
      </Text>
      <Text dim>Type slowly (1 char/2sec). Compare left (raw events) vs right (TextArea value).</Text>
      <Text dim>Press Esc to quit.</Text>
      <Box height={1} />

      <Box gap={4}>
        {/* Left: Raw useInput events */}
        <Box flexDirection="column" width={40}>
          <Text bold color="yellow">
            useInput events: {rawCountRef.current}
          </Text>
          {rawEvents.map((e, i) => (
            <Text key={i} dimColor={i < rawEvents.length - 1}>
              {e}
            </Text>
          ))}
        </Box>

        {/* Right: TextArea */}
        <Box flexDirection="column" width={40}>
          <Text bold color="green">
            TextArea value ({textValue.length} chars, {textChangeCountRef.current} changes):
          </Text>
          <Box borderStyle="single" borderColor="green">
            <Box paddingX={1}>
              <TextArea value={textValue} onChange={handleChange} height={4} placeholder="Type here..." />
            </Box>
          </Box>
          <Box marginTop={1}>
            <Text>Value: {JSON.stringify(textValue)}</Text>
          </Box>
        </Box>
      </Box>
    </Box>
  )
}

function describeKey(input: string, key: Key): string {
  const parts: string[] = []
  if (key.ctrl) parts.push("Ctrl")
  if (key.meta) parts.push("Meta")
  if (key.shift) parts.push("Shift")

  if (key.return) parts.push("Enter")
  else if (key.escape) parts.push("Esc")
  else if (key.backspace) parts.push("BS")
  else if (key.delete) parts.push("Del")
  else if (key.upArrow) parts.push("Up")
  else if (key.downArrow) parts.push("Down")
  else if (key.leftArrow) parts.push("Left")
  else if (key.rightArrow) parts.push("Right")
  else if (key.tab) parts.push("Tab")
  else if (input.length === 1 && input >= " ") parts.push(`'${input}'`)
  else if (input) parts.push(`raw:${JSON.stringify(input)}`)
  else parts.push("(empty)")

  return parts.join("+")
}

async function main() {
  using term = createTerm()
  const { waitUntilExit } = await render(<InputDebug />, term)
  await waitUntilExit()
}

main().catch(console.error)
