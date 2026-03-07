#!/usr/bin/env tsx
/**
 * Example: Non-TTY Mode Support (km-hightea-nontty)
 *
 * Demonstrates hightea's non-TTY mode support for rendering in environments
 * without a terminal (pipes, CI, TERM=dumb).
 *
 * Run this example:
 *   # Normal TTY mode
 *   bun examples/inline-nontty.tsx
 *
 *   # Piped output (auto-detects non-TTY)
 *   bun examples/inline-nontty.tsx | cat
 *
 *   # Force plain text mode
 *   HIGHTEA_NONTTY=plain bun examples/inline-nontty.tsx
 *
 *   # Force line-by-line mode
 *   HIGHTEA_NONTTY=line-by-line bun examples/inline-nontty.tsx
 */

import React, { useEffect, useState } from "react"
import { Box, render, Text, useApp, createTerm, type NonTTYMode } from "../../src/index.js"
import type { ExampleMeta } from "../_banner.js"

export const meta: ExampleMeta = {
  name: "Non-TTY Mode",
  description: "Graceful degradation for pipes, CI, and TERM=dumb",
  features: ["renderString()", "non-TTY output", "pipe-safe"],
}

function ProgressExample() {
  const { exit } = useApp()
  const [progress, setProgress] = useState(0)
  const [done, setDone] = useState(false)

  useEffect(() => {
    const timer = setInterval(() => {
      setProgress((prev) => {
        const next = prev + 20
        if (next >= 100) {
          setDone(true)
          clearInterval(timer)
          return 100
        }
        return next
      })
    }, 300)

    return () => clearInterval(timer)
  }, [])

  // Exit cleanly after showing "Complete!" for a moment
  useEffect(() => {
    if (!done) return
    const timeout = setTimeout(() => exit(), 300)
    return () => clearTimeout(timeout)
  }, [done, exit])

  const barWidth = 30
  const filled = Math.floor((progress / 100) * barWidth)
  const bar = "#".repeat(filled) + "-".repeat(barWidth - filled)

  return (
    <Box flexDirection="column">
      <Text>Processing files...</Text>
      <Text>
        [{bar}] {progress}%
      </Text>
      {done && <Text color="green">Complete!</Text>}
    </Box>
  )
}

async function main() {
  // Determine non-TTY mode from environment
  const envMode = process.env.HIGHTEA_NONTTY as NonTTYMode | undefined
  const nonTTYMode = envMode || "auto"

  console.log(`Non-TTY mode: ${nonTTYMode}`)
  console.log(`stdout.isTTY: ${process.stdout.isTTY}`)
  console.log("---\n")

  using term = createTerm()
  const { waitUntilExit } = await render(<ProgressExample />, term, {
    mode: "inline",
    nonTTYMode,
  })

  await waitUntilExit()

  console.log("\n---")
  console.log("Done!")
}

if (import.meta.main) {
  main().catch(console.error)
}
