#!/usr/bin/env bun
/**
 * Simple inline mode test
 */

import React, { useState, useEffect } from "react"
import { render, Box, Text, useApp, createTerm } from "../src/index.js"

function Counter() {
  const { exit } = useApp()
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

  // Exit cleanly after count reaches 5
  useEffect(() => {
    if (count < 5) return
    const timeout = setTimeout(() => exit(), 300)
    return () => clearTimeout(timeout)
  }, [count, exit])

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

if (import.meta.main) {
  main().catch(console.error)
}
