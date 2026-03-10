/**
 * TextInputShowcase — live text echo with cursor and focus tracking
 *
 * Demonstrates text input handling, backspace/delete, escape to clear,
 * and terminal focus state affecting visual appearance.
 */

import React, { useState } from "react"
import { Box, Text, useInput } from "@silvery/term/xterm/index.ts"
import { useTermFocused, KeyHints } from "./shared.js"

export function TextInputShowcase(): JSX.Element {
  const [text, setText] = useState("")
  const termFocused = useTermFocused()

  useInput((input, key) => {
    if (input) {
      setText((t) => t + input)
    }
    if (key.backspace || key.delete) {
      setText((t) => t.slice(0, -1))
    }
    if (key.escape) {
      setText("")
    }
  })

  return (
    <Box flexDirection="column" padding={1}>
      <Box
        flexDirection="row"
        borderStyle={termFocused ? "double" : "round"}
        borderColor={termFocused ? "#89b4fa" : "#313244"}
        paddingX={1}
        outlineStyle={termFocused ? "round" : undefined}
        outlineColor={termFocused ? "#45475a" : undefined}
      >
        <Text color={termFocused ? "#89b4fa" : "#585b70"}>&gt; </Text>
        <Text color="#cdd6f4">{text}</Text>
        <Text color="#89b4fa">{termFocused ? "\u258B" : " "}</Text>
      </Box>

      <Box marginTop={1} paddingX={1}>
        <Text color="#6c7086">Echo: {text || "(empty)"}</Text>
      </Box>

      <KeyHints hints={termFocused ? "type text  Backspace/Del delete  Esc clear" : "click to focus"} />
    </Box>
  )
}
