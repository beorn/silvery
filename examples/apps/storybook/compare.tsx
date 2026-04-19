/**
 * CompareView — side-by-side render of the same component showcase under two
 * different schemes. Helps answer "Dracula vs Tokyo Night?" at a glance.
 */

import React from "react"
import { Box, Text, Muted, H1, ThemeProvider, Divider } from "silvery"
import type { StorybookEntry } from "./types"
import { ComponentShowcase } from "./components-showcase"

interface Props {
  left: StorybookEntry
  right: StorybookEntry
  /** Which pane the user is currently editing (highlight + keyboard target). */
  activePane: "left" | "right"
}

export function CompareView({ left, right, activePane }: Props) {
  return (
    <Box flexDirection="row" gap={1} flexGrow={1}>
      <ComparePane entry={left} label="left  (h/l to switch)" active={activePane === "left"} />
      <ComparePane entry={right} label="right (h/l to switch)" active={activePane === "right"} />
    </Box>
  )
}

function ComparePane({
  entry,
  label,
  active,
}: {
  entry: StorybookEntry
  label: string
  active: boolean
}) {
  return (
    <ThemeProvider theme={entry.theme}>
      <Box
        theme={entry.theme}
        flexDirection="column"
        flexGrow={1}
        flexBasis={0}
        borderStyle={active ? "double" : "single"}
        borderColor={active ? "$focusborder" : "$border"}
        overflow="scroll"
      >
        <Box paddingX={1} gap={1}>
          <H1>{entry.name}</H1>
          <Muted>{entry.dark ? "(dark)" : "(light)"}</Muted>
          <Text>·</Text>
          <Muted>{label}</Muted>
          {active ? <Muted>·</Muted> : null}
          {active ? <Text color="$primary">● active</Text> : null}
        </Box>
        <Divider />
        <ComponentShowcase interactive={false} />
      </Box>
    </ThemeProvider>
  )
}
