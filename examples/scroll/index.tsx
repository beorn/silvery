/**
 * Scroll Example
 *
 * Demonstrates overflow="scroll" with keyboard navigation.
 */

import React, { useState } from "react"
import { Box, Text, render, useInput, createTerm } from "../../src/index.js"

// Generate sample items
const items = Array.from({ length: 50 }, (_, i) => ({
  id: i,
  title: `Item ${i + 1}`,
  description: `This is the description for item number ${i + 1}`,
}))

export function ScrollExample() {
  const [selectedIndex, setSelectedIndex] = useState(0)

  useInput((input, key) => {
    if (key.upArrow || input === "k") {
      setSelectedIndex((prev) => Math.max(0, prev - 1))
    }
    if (key.downArrow || input === "j") {
      setSelectedIndex((prev) => Math.min(items.length - 1, prev + 1))
    }
    if (input === "q") {
      process.exit(0)
    }
  })

  return (
    <Box flexDirection="column" width={60} height={20}>
      <Box marginBottom={1}>
        <Text bold color="yellow">
          Scroll Example
        </Text>
      </Box>

      <Box
        flexGrow={1}
        flexDirection="column"
        borderStyle="round"
        borderColor="cyan"
        overflow="scroll"
        scrollTo={selectedIndex}
        height={10}
      >
        {items.map((item, index) => (
          <Box
            key={item.id}
            paddingX={1}
            backgroundColor={index === selectedIndex ? "cyan" : undefined}
          >
            <Text
              color={index === selectedIndex ? "black" : "white"}
              bold={index === selectedIndex}
            >
              {item.title}
            </Text>
          </Box>
        ))}
      </Box>

      <Text dim>
        {" "}
        <Text bold dim>
          j/k
        </Text>{" "}
        navigate{" "}
        <Text bold dim>
          q
        </Text>{" "}
        quit | Selected: {selectedIndex + 1}/{items.length}
      </Text>
    </Box>
  )
}

// Run the app
if (import.meta.main) {
  using term = createTerm()
  await render(<ScrollExample />, term)
}
