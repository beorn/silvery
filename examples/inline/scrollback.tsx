/**
 * Scrollback Mode — REPL
 *
 * Interactive expression evaluator demonstrating useScrollback + VirtualList frozen.
 * Completed results freeze into terminal scrollback; the active prompt stays at bottom.
 *
 * Controls:
 *   Type expression + Enter  - Evaluate
 *   q (when input empty)     - Quit
 */

import React, { useState, useCallback } from "react"
import { render, Box, Text, VirtualList, useInput, useApp, createTerm, type Key } from "../../src/index.js"
import { useScrollback } from "../../src/hooks/useScrollback.js"
import { ExampleBanner, type ExampleMeta } from "../_banner.js"

export const meta: ExampleMeta = {
  name: "Scrollback",
  description: "REPL with useScrollback + VirtualList frozen for terminal scrollback",
  features: ["useScrollback()", "VirtualList frozen", "inline mode"],
}

// =============================================================================
// Data
// =============================================================================

interface Result {
  id: number
  expr: string
  value: string
  frozen: boolean
}

let nextId = 0

function evaluate(expr: string): string {
  try {
    // eslint-disable-next-line no-eval
    return String(eval(expr))
  } catch (e: unknown) {
    return `Error: ${e instanceof Error ? e.message : String(e)}`
  }
}

// =============================================================================
// Component
// =============================================================================

export function Repl() {
  const { exit } = useApp()
  const [results, setResults] = useState<Result[]>([])
  const [input, setInput] = useState("")
  const [cursor, setCursor] = useState(0)

  // Push frozen results to terminal scrollback
  const frozenCount = useScrollback(results, {
    frozen: (r) => r.frozen,
    render: (r) => `$ ${r.expr}\n→ ${r.value}`,
  })

  const submit = useCallback(() => {
    const expr = input.trim()
    if (!expr) return

    const value = evaluate(expr)
    const id = nextId++

    // Mark all existing results as frozen, add new one unfrozen
    setResults((prev) => [...prev.map((r) => ({ ...r, frozen: true })), { id, expr, value, frozen: false }])
    setInput("")
    setCursor(0)
  }, [input])

  useInput((ch: string, key: Key) => {
    if (key.return) {
      submit()
      return
    }
    if (key.escape || (ch === "q" && input === "")) {
      exit()
      return
    }
    if (key.backspace) {
      if (cursor > 0) {
        setInput((v) => v.slice(0, cursor - 1) + v.slice(cursor))
        setCursor((c) => c - 1)
      }
      return
    }
    if (key.leftArrow) {
      setCursor((c) => Math.max(0, c - 1))
      return
    }
    if (key.rightArrow) {
      setCursor((c) => Math.min(input.length, c + 1))
      return
    }
    // Ctrl+A: beginning of line
    if (key.ctrl && ch === "a") {
      setCursor(0)
      return
    }
    // Ctrl+E: end of line
    if (key.ctrl && ch === "e") {
      setCursor(input.length)
      return
    }
    // Ctrl+U: clear line
    if (key.ctrl && ch === "u") {
      setInput("")
      setCursor(0)
      return
    }
    if (ch >= " ") {
      setInput((v) => v.slice(0, cursor) + ch + v.slice(cursor))
      setCursor((c) => c + 1)
    }
  })

  const activeCount = results.length - frozenCount
  const beforeCursor = input.slice(0, cursor)
  const atCursor = input[cursor] ?? " "
  const afterCursor = input.slice(cursor + 1)

  return (
    <Box flexDirection="column">
      {/* Active (non-frozen) results via VirtualList */}
      {activeCount > 0 && (
        <VirtualList
          items={results}
          frozen={(r) => r.frozen}
          height={activeCount * 2}
          itemHeight={2}
          scrollTo={0}
          renderItem={(r) => (
            <Box key={r.id} flexDirection="column">
              <Text>
                <Text color="gray">{"$ "}</Text>
                <Text>{r.expr}</Text>
              </Text>
              <Text>
                <Text color="cyan">{"→ "}</Text>
                <Text>{r.value}</Text>
              </Text>
            </Box>
          )}
        />
      )}

      {/* Separator */}
      <Text dimColor>{"─".repeat(40)}</Text>

      {/* Input prompt */}
      <Text>
        <Text color="yellow">{"› "}</Text>
        <Text>{beforeCursor}</Text>
        <Text inverse>{atCursor}</Text>
        <Text>{afterCursor}</Text>
      </Text>

      {/* Status */}
      <Text dim>
        {results.length} result{results.length !== 1 ? "s" : ""} | Esc/q to quit
      </Text>
    </Box>
  )
}

// =============================================================================
// Main
// =============================================================================

async function main() {
  using term = createTerm()
  const { waitUntilExit } = await render(
    <ExampleBanner meta={meta} controls="Type expr + Enter  Esc/q quit">
      <Repl />
    </ExampleBanner>,
    term,
    { mode: "inline" },
  )
  await waitUntilExit()
}

if (import.meta.main) {
  main().catch(console.error)
}
