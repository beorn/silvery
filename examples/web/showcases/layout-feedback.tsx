/**
 * LayoutFeedbackShowcase — live display of content dimensions
 *
 * Demonstrates useContentRect() for responsive layout feedback.
 */

import React from "react"
import { Box, Text, useContentRect } from "@silvery/term/xterm/index.ts"
import { KeyHints } from "./shared.js"

function SizedPanel(): JSX.Element {
  const { width, height } = useContentRect()

  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderColor="cyan"
      flexGrow={1}
      justifyContent="center"
      alignItems="center"
    >
      <Text>
        Width: {width} Height: {height}
      </Text>
    </Box>
  )
}

export function LayoutFeedbackShowcase(): JSX.Element {
  return (
    <Box flexDirection="column" padding={1}>
      <SizedPanel />
      <KeyHints hints="resize browser to see dimensions change" />
    </Box>
  )
}
