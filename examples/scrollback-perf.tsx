/**
 * Benchmark: ScrollbackList typing performance
 * Measures per-keystroke cost across React reconciliation + inkx pipeline.
 *
 * Usage: bun examples/scrollback-perf.tsx
 *
 * Modes:
 *   --simple   Simple items (Box + 2 Text nodes)
 *   --complex  Complex items matching static-scrollback (default)
 *   --timers   Add pulse/elapsed timers like the real demo
 */
import React, { useState, useEffect, useRef } from "react"
import { createRenderer } from "../src/testing/index.js"
import { Box, Text, ScrollbackList, TextInput, Spinner } from "../src/index.js"

interface Item {
  id: string
  text: string
  role: string
  frozen: boolean
}

const useSimple = process.argv.includes("--simple")
const useTimers = process.argv.includes("--timers")

/** Simple item — matches original benchmark (Box + 2-3 Text nodes) */
function SimpleItem({ item, isLatest }: { item: Item; isLatest: boolean }) {
  return (
    <Box flexDirection="column" borderStyle={item.role === "assistant" ? "single" : undefined}>
      <Text bold color={item.role === "user" ? "green" : "blue"}>
        {item.role === "user" ? "❯" : "◆"} {item.role}
      </Text>
      <Text>{item.text}</Text>
      {isLatest && <Text dimColor>Latest item</Text>}
    </Box>
  )
}

/** Complex item — matches static-scrollback's ExchangeItem */
function ComplexItem({ item }: { item: Item }) {
  if (item.role === "user") {
    return (
      <Box flexDirection="column">
        <Text> </Text>
        <Box paddingX={1}>
          <Text>
            <Text bold color="blue">
              {"❯ "}
            </Text>
            {item.text}
          </Text>
        </Box>
        <Text> </Text>
      </Box>
    )
  }
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="green" paddingX={1}>
      <Text>
        <Text bold color="green">
          ◆ Agent
        </Text>
        <Text color="gray" dim>
          {" "}624 tokens
        </Text>
      </Text>
      <Text> </Text>
      <Text>{item.text}</Text>
      <Text> </Text>
      <Box flexDirection="column">
        <Text>
          <Text color="green">{"✓ "}</Text>
          <Text color="cyan" bold>Read</Text>{" "}
          src/auth.ts
        </Text>
        <Box
          borderStyle="bold"
          borderColor="green"
          borderLeft
          borderRight={false}
          borderTop={false}
          borderBottom={false}
          paddingLeft={1}
        >
          <Text>export async function login(token: string)</Text>
        </Box>
      </Box>
    </Box>
  )
}

function StatusBar() {
  return (
    <Box flexDirection="row" justifyContent="space-between" paddingX={1}>
      <Text color="gray" dim>
        <Text color="blue">0:00</Text>
        {"  ⏎ send  tab auto  ^L clear  esc quit"}
      </Text>
      <Text color="gray" dim>
        ctx {"█".repeat(4)}{"░".repeat(16)} 20% · $0.12
      </Text>
    </Box>
  )
}

/** Footer that owns its own inputText state (lifted down from parent). */
function LiftedFooter() {
  const [inputText, setInputText] = useState("")
  return (
    <Box flexDirection="column">
      <Box borderStyle="round" paddingX={1}>
        <TextInput value={inputText} onChange={setInputText} prompt="> " isActive={true} />
      </Box>
      {!useSimple && <StatusBar />}
    </Box>
  )
}

const useLifted = process.argv.includes("--lifted")

function TestApp({ itemCount }: { itemCount: number }) {
  const [items] = useState<Item[]>(() =>
    Array.from({ length: itemCount }, (_, i) => ({
      id: `item-${i}`,
      text: i % 2 === 0
        ? `Fix the login bug in auth.ts — expired tokens throw instead of refreshing.`
        : `Found it. The expiry check compares seconds (jwt.exp) to milliseconds (Date.now()). Fixing now.`,
      role: i % 2 === 0 ? "user" : "assistant",
      frozen: false,
    })),
  )
  // When NOT lifted: inputText lives in parent (causes full re-render)
  const [inputText, setInputText] = useState("")

  // Optional timers (like static-scrollback)
  const [_pulse, setPulse] = useState(false)
  const [_elapsed, setElapsed] = useState(0)
  const startRef = useRef(Date.now())

  useEffect(() => {
    if (!useTimers) return
    const t1 = setInterval(() => setPulse((p) => !p), 800)
    const t2 = setInterval(() => setElapsed(Math.floor((Date.now() - startRef.current) / 1000)), 1000)
    return () => { clearInterval(t1); clearInterval(t2) }
  }, [])

  return (
    <Box flexDirection="column">
      <ScrollbackList
        items={items}
        keyExtractor={(item) => item.id}
        isFrozen={(item) => item.frozen}
        footer={
          useLifted ? <LiftedFooter /> : (
            <Box flexDirection="column">
              <Box borderStyle="round" paddingX={1}>
                <TextInput value={inputText} onChange={setInputText} prompt="> " isActive={true} />
              </Box>
              {!useSimple && <StatusBar />}
            </Box>
          )
        }
        footerHeight={useSimple ? 3 : 4}
        width={120}
        stdout={{ write: () => true }}
      >
        {(item, index) => {
          const isLatest = index === items.length - 1
          return useSimple
            ? <SimpleItem item={item} isLatest={isLatest} />
            : <ComplexItem item={item} />
        }}
      </ScrollbackList>
    </Box>
  )
}

async function benchmark(itemCount: number, label: string) {
  const render = createRenderer({ cols: 120, rows: 40 })
  const app = render(<TestApp itemCount={itemCount} />)

  // Warm up
  await app.press("x")
  await app.press("Backspace")

  const chars = "the quick brown fox jumps over the lazy dog"
  const times: number[] = []

  for (const char of chars) {
    const t0 = performance.now()
    await app.press(char)
    times.push(performance.now() - t0)
  }

  times.sort((a, b) => a - b)
  const avg = times.reduce((a, b) => a + b) / times.length
  const p50 = times[Math.floor(times.length * 0.5)]!
  const p95 = times[Math.floor(times.length * 0.95)]!
  const max = times[times.length - 1]!

  // Pipeline breakdown from last frame
  const pipeline = (globalThis as any).__inkx_last_pipeline
  const pipelineStr = pipeline
    ? Object.entries(pipeline)
        .filter(([, v]) => typeof v === "number" && (v as number) > 0.05)
        .map(([k, v]) => `${k}=${(v as number).toFixed(1)}ms`)
        .join(" ")
    : "n/a"

  console.log(
    `${label.padEnd(20)} avg=${avg.toFixed(1)}ms  p50=${p50.toFixed(1)}ms  p95=${p95.toFixed(1)}ms  max=${max.toFixed(1)}ms  pipeline=[${pipelineStr}]`,
  )
}

console.log("=== ScrollbackList Typing Performance ===\n")
await benchmark(1, "1 item")
await benchmark(5, "5 items")
await benchmark(10, "10 items")
await benchmark(20, "20 items")
await benchmark(50, "50 items")
await benchmark(100, "100 items")
console.log("\nDone.")
