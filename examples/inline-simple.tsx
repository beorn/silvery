#!/usr/bin/env bun
/**
 * Simple inline mode test
 */

import React, { useState, useEffect } from "react"
import { render, Box, Text, createTerm } from "../src/index.js"

function Counter() {
  const [count, setCount] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => {
      setCount((c) => {
        if (c >= 5) {
          clearInterval(timer)
          return c
        }
        return c + 1
      })
    }, 500)

    return () => clearInterval(timer)
  }, [])

  return (
    <Box>
      <Text>Count: {count}</Text>
    </Box>
  )
}

async function main() {
  console.log("Before\n")

  using term = createTerm()
  const { waitUntilExit } = await render(<Counter />, term, {
    mode: "inline",
  })

  await waitUntilExit()

  console.log("\nAfter")
}

main().catch(console.error)
