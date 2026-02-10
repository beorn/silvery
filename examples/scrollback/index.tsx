/**
 * Scrollback Mode — Build Pipeline
 *
 * Demonstrates VirtualList's `frozen` prop: completed items are excluded
 * from the active list, shrinking the visible area as steps complete.
 * In a real scrollback setup, pair with useScrollback to push frozen
 * items to terminal history.
 *
 * Controls:
 *   q/Escape  - Quit
 */

import React, { useState, useEffect, useRef } from "react"
import {
  render,
  Box,
  Text,
  useInput,
  useApp,
  useTerm,
  createTerm,
  type Key,
} from "../../src/index.js"

// =============================================================================
// Data
// =============================================================================

interface Step {
  id: number
  title: string
  duration: number
  complete: boolean
}

const PIPELINE: { title: string; duration: number }[] = [
  { title: "Install dependencies", duration: 600 },
  { title: "Generate type definitions", duration: 300 },
  { title: "Compile TypeScript", duration: 800 },
  { title: "Run linter", duration: 400 },
  { title: "Run unit tests (124 files)", duration: 1200 },
  { title: "Run integration tests", duration: 900 },
  { title: "Bundle for production", duration: 700 },
  { title: "Optimize assets", duration: 500 },
  { title: "Generate source maps", duration: 300 },
  { title: "Run accessibility checks", duration: 400 },
  { title: "Validate API schemas", duration: 350 },
  { title: "Check circular dependencies", duration: 250 },
  { title: "Generate documentation", duration: 600 },
  { title: "Upload coverage report", duration: 450 },
  { title: "Deploy to staging", duration: 800 },
  { title: "Run smoke tests", duration: 500 },
  { title: "Deploy to production", duration: 600 },
  { title: "Invalidate CDN cache", duration: 300 },
  { title: "Notify team", duration: 200 },
  { title: "Update status page", duration: 150 },
]

// =============================================================================
// Spinner
// =============================================================================

const FRAMES = ["\u28CB", "\u28D9", "\u28F9", "\u28F8", "\u28FC", "\u28F4", "\u28E6", "\u28E7", "\u28C7", "\u28CF"]

function useSpinner() {
  const [frame, setFrame] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setFrame((f) => (f + 1) % FRAMES.length), 80)
    return () => clearInterval(id)
  }, [])
  return FRAMES[frame]!
}

// =============================================================================
// Component
// =============================================================================

export function Pipeline() {
  const { exit } = useApp()
  const term = useTerm()
  const spinner = useSpinner()
  const [steps, setSteps] = useState<Step[]>(
    PIPELINE.map((p, i) => ({ id: i, title: p.title, duration: p.duration, complete: false })),
  )
  const startRef = useRef(Date.now())
  const [elapsed, setElapsed] = useState(0)

  const rows = term.rows ?? 24
  const activeIdx = steps.findIndex((s) => !s.complete)
  const allDone = activeIdx === -1
  const doneCount = steps.filter((s) => s.complete).length

  // Auto-complete one step at a time
  useEffect(() => {
    if (allDone) return
    const step = steps[activeIdx]!
    const t = setTimeout(() => {
      setSteps((prev) => prev.map((s, i) => (i === activeIdx ? { ...s, complete: true } : s)))
    }, step.duration)
    return () => clearTimeout(t)
  }, [activeIdx, allDone])

  // Elapsed counter
  useEffect(() => {
    if (allDone) return
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - startRef.current) / 1000)), 200)
    return () => clearInterval(t)
  }, [allDone])

  useInput((input: string, key: Key) => {
    if (input === "q" || key.escape) exit()
  })

  // Progress bar
  const barWidth = Math.min(40, Math.floor((term.columns ?? 80) * 0.5))
  const filled = Math.floor((doneCount / steps.length) * barWidth)
  const bar = "\u2588".repeat(filled) + "\u2591".repeat(barWidth - filled)

  return (
    <Box flexDirection="column" height={rows} paddingX={1}>
      {/* Header */}
      <Text>
        <Text bold color="cyan">{"\u25B8 Build Pipeline"}</Text>
      </Text>
      <Text>
        <Text color={allDone ? "green" : "yellow"}>[{bar}]</Text>
        <Text dim> {doneCount}/{steps.length}</Text>
        <Text dim>{" \u2022 "}{elapsed}s</Text>
      </Text>
      <Text> </Text>

      {/* Step list */}
      <Box flexDirection="column" overflow="scroll" scrollTo={Math.max(0, activeIdx)}>
        {steps.map((step, i) => {
          const active = i === activeIdx
          return (
            <Text key={step.id}>
              {step.complete ? (
                <Text color="green">{"\u2713 "}</Text>
              ) : active ? (
                <Text color="yellow">{spinner}{" "}</Text>
              ) : (
                <Text dim>{"  "}</Text>
              )}
              <Text bold={active} dim={step.complete && !active}>
                {step.title}
              </Text>
              {active && <Text dim> ({(step.duration / 1000).toFixed(1)}s)</Text>}
            </Text>
          )
        })}
      </Box>

      {/* Footer */}
      {allDone && (
        <>
          <Text> </Text>
          <Text color="green" bold>
            {"\u2713 Pipeline complete!"} <Text dim>({elapsed}s)</Text>
          </Text>
          <Text dim>Press q to exit.</Text>
        </>
      )}
    </Box>
  )
}

// =============================================================================
// Main
// =============================================================================

async function main() {
  using term = createTerm()
  const { waitUntilExit } = await render(<Pipeline />, term)
  await waitUntilExit()
}

if (import.meta.main) {
  main().catch(console.error)
}
