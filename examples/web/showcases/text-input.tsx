/**
 * TextInputShowcase — demonstrates the TextInput component
 *
 * Full readline-style text editing with cursor movement, word operations,
 * kill ring, and terminal focus state affecting visual appearance.
 *
 * This showcase demonstrates Silvery Way principle #1: Use the Built-in Components.
 * TextInput handles Ctrl+A/E/K/U/W, Alt+B/F, kill ring, clipboard — all for free.
 */

import React, { useState } from "react"
import { Box, Text, useInput } from "@silvery/term/xterm/index.ts"
import { TextInput } from "@silvery/ui/components/TextInput"
import { useTermFocused, KeyHints } from "./shared.js"

export function TextInputShowcase(): JSX.Element {
  const [text, setText] = useState("")
  const termFocused = useTermFocused()

  useInput((_input, key) => {
    if (key.escape) setText("")
  })

  return (
    <Box flexDirection="column" padding={1}>
      <Box
        flexDirection="column"
        borderStyle={termFocused ? "double" : "round"}
        borderColor={termFocused ? "#89b4fa" : "#313244"}
        paddingX={1}
        outlineStyle={termFocused ? "round" : undefined}
        outlineColor={termFocused ? "#45475a" : undefined}
      >
        <TextInput
          value={text}
          onChange={setText}
          prompt="> "
          promptColor={termFocused ? "#89b4fa" : "#585b70"}
          color="#cdd6f4"
          isActive={termFocused}
        />
      </Box>

      <Box marginTop={1} paddingX={1}>
        <Text color="#6c7086">Echo: {text || "(empty)"}</Text>
      </Box>

      <KeyHints
        hints={
          termFocused
            ? "type text  Ctrl+A/E begin/end  Ctrl+K/U kill  Ctrl+W word  Esc clear"
            : "click to focus"
        }
      />
    </Box>
  )
}
