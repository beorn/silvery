/**
 * Scroll Example
 *
 * Demonstrates overflow="scroll" with keyboard navigation.
 */

import React, { useState } from "react"
import { Box, Text, Kbd, Muted, render, useInput, useApp, createTerm, type Key } from "../../src/index.js"
import { ExampleBanner, type ExampleMeta } from "../_banner.js"

export const meta: ExampleMeta = {
  name: "Scroll",
  description: 'Native overflow="scroll" with automatic scroll-to-selected',
  features: ['overflow="scroll"', "scrollTo", "useInput"],
}

// Generate sample items
const items = Array.from({ length: 50 }, (_, i) => ({
  id: i,
  title: `Item ${i + 1}`,
  description: `This is the description for item number ${i + 1}`,
}))

export function ScrollExample() {
  const { exit } = useApp()
  const [selectedIndex, setSelectedIndex] = useState(0)

  useInput((input: string, key: Key) => {
    if (input === "q" || key.escape) {
      exit()
    }
    if (key.upArrow || input === "k") {
      setSelectedIndex((prev) => Math.max(0, prev - 1))
    }
    if (key.downArrow || input === "j") {
      setSelectedIndex((prev) => Math.min(items.length - 1, prev + 1))
    }
  })

  return (
    <Box flexDirection="column" width={60} height={20}>
      <Box
        flexGrow={1}
        flexDirection="column"
        borderStyle="round"
        borderColor="$primary"
        overflow="scroll"
        scrollTo={selectedIndex}
        height={10}
      >
        {items.map((item, index) => (
          <Box key={item.id} paddingX={1} backgroundColor={index === selectedIndex ? "$primary" : undefined}>
            <Text color={index === selectedIndex ? "black" : "white"} bold={index === selectedIndex}>
              {item.title}
            </Text>
          </Box>
        ))}
      </Box>

      <Muted>
        {" "}
        <Kbd>j/k</Kbd> navigate <Kbd>Esc/q</Kbd> quit | Selected: {selectedIndex + 1}/{items.length}
      </Muted>
    </Box>
  )
}

// Run the app
if (import.meta.main) {
  using term = createTerm()
  await render(
    <ExampleBanner meta={meta} controls="j/k navigate  Esc/q quit">
      <ScrollExample />
    </ExampleBanner>,
    term,
  )
}
