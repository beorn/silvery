/**
 * Dev Tools — Log Viewer Example
 *
 * A live log viewer demonstrating:
 * - VirtualList for efficient rendering of thousands of log entries
 * - Keyboard shortcuts to add log entries at different severity levels
 * - Color-coded severity levels (DEBUG, INFO, WARN, ERROR)
 * - j/k navigation through log history
 * - Auto-scroll to latest entry
 *
 * Usage: bun run examples/apps/dev-tools.tsx
 *
 * Controls:
 *   j/k or Up/Down  - Navigate through log entries
 *   g/G             - Jump to first/last entry
 *   d               - Add DEBUG entry
 *   i               - Add INFO entry
 *   w               - Add WARN entry
 *   e               - Add ERROR entry
 *   c               - Clear all logs
 *   q or Esc        - Quit
 */

import React, { useState, useCallback, useMemo } from "react"
import {
  render,
  Box,
  Text,
  VirtualList,
  Divider,
  useContentRect,
  useInput,
  useApp,
  createTerm,
  Strong,
  Kbd,
  Muted,
  type Key,
} from "../../src/index.js"
import { ExampleBanner, type ExampleMeta } from "../_banner.js"

export const meta: ExampleMeta = {
  name: "Dev Tools",
  description: "Log viewer with severity levels, VirtualList, and keyboard-driven log injection",
  features: ["VirtualList", "useInput()", "useContentRect()", "keyboard navigation"],
}

// ============================================================================
// Types
// ============================================================================

type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR"

interface LogEntry {
  id: number
  timestamp: Date
  level: LogLevel
  source: string
  message: string
}

// ============================================================================
// Data Generation
// ============================================================================

const SOURCES = ["http", "db", "auth", "cache", "worker", "api", "scheduler", "queue", "metrics", "ws"]

const LOG_TEMPLATES: Record<LogLevel, string[]> = {
  DEBUG: [
    "Cache miss for key user:session:{{id}}",
    "Query plan: sequential scan on events ({{n}} rows)",
    "WebSocket frame received: {{n}} bytes",
    "GC pause: {{n}}ms (minor collection)",
    "Connection pool stats: {{n}} active, {{n}} idle",
    "Route matched: GET /api/v2/resources/{{id}}",
  ],
  INFO: [
    "Request completed: 200 OK ({{n}}ms)",
    "User {{id}} authenticated via OAuth",
    "Background job processed: email_dispatch #{{id}}",
    "Server listening on port {{n}}",
    "Database migration applied: v{{n}}",
    "Health check passed (latency: {{n}}ms)",
  ],
  WARN: [
    "Slow query detected: {{n}}ms (threshold: 200ms)",
    "Rate limit approaching: {{n}}/1000 requests",
    "Memory usage: {{n}}% of allocated heap",
    "Retry attempt {{n}}/3 for external API call",
    "Certificate expires in {{n}} days",
    "Connection pool near capacity: {{n}}/100",
  ],
  ERROR: [
    "Unhandled exception in request handler: TypeError",
    "Database connection refused: ECONNREFUSED",
    "Authentication failed for user {{id}}: invalid token",
    "Timeout after {{n}}ms waiting for upstream service",
    "Disk usage critical: {{n}}% on /var/data",
    "Failed to process message from queue: malformed payload",
  ],
}

let nextLogId = 1

function seededRandom(seed: number): () => number {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) & 0x7fffffff
    return s / 0x7fffffff
  }
}

function generateMessage(level: LogLevel, rng: () => number): string {
  const templates = LOG_TEMPLATES[level]
  const template = templates[Math.floor(rng() * templates.length)]!
  return template
    .replace(/\{\{id\}\}/g, () => String(Math.floor(rng() * 99999)))
    .replace(/\{\{n\}\}/g, () => String(Math.floor(rng() * 999)))
}

function createLogEntry(level: LogLevel, rng: () => number): LogEntry {
  return {
    id: nextLogId++,
    timestamp: new Date(),
    level,
    source: SOURCES[Math.floor(rng() * SOURCES.length)]!,
    message: generateMessage(level, rng),
  }
}

function generateInitialLogs(count: number): LogEntry[] {
  const rng = seededRandom(42)
  const levels: LogLevel[] = ["DEBUG", "INFO", "INFO", "INFO", "WARN", "ERROR"]
  const entries: LogEntry[] = []
  const now = Date.now()

  for (let i = 0; i < count; i++) {
    const level = levels[Math.floor(rng() * levels.length)]!
    const entry = createLogEntry(level, rng)
    // Spread timestamps over the last hour
    entry.timestamp = new Date(now - (count - i) * 1200)
    entries.push(entry)
  }
  return entries
}

// ============================================================================
// Constants
// ============================================================================

const LEVEL_COLORS: Record<LogLevel, string> = {
  DEBUG: "$muted",
  INFO: "$primary",
  WARN: "$warning",
  ERROR: "$error",
}

const LEVEL_BADGES: Record<LogLevel, string> = {
  DEBUG: "DBG",
  INFO: "INF",
  WARN: "WRN",
  ERROR: "ERR",
}

// ============================================================================
// Components
// ============================================================================

function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })
}

function LogRow({ entry, isSelected }: { entry: LogEntry; isSelected: boolean }) {
  const badge = LEVEL_BADGES[entry.level]
  const color = LEVEL_COLORS[entry.level]

  // When selected, use $primary-fg for all text to ensure contrast against $primary bg.
  // When not selected, use level-specific colors for visual distinction.
  if (isSelected) {
    return (
      <Box paddingX={1} backgroundColor="$primary">
        <Text color="$primary-fg">{formatTime(entry.timestamp)} </Text>
        <Text color="$primary-fg" bold>
          {badge}
        </Text>
        <Text color="$primary-fg"> [{entry.source.padEnd(9)}] </Text>
        <Text color="$primary-fg" bold>
          {entry.message}
        </Text>
      </Box>
    )
  }

  return (
    <Box paddingX={1}>
      <Muted>{formatTime(entry.timestamp)} </Muted>
      <Strong color={color}>{badge}</Strong>
      <Muted> [{entry.source.padEnd(9)}] </Muted>
      <Text>{entry.message}</Text>
    </Box>
  )
}

function LevelCounts({ entries }: { entries: LogEntry[] }) {
  const counts = useMemo(() => {
    const c = { DEBUG: 0, INFO: 0, WARN: 0, ERROR: 0 }
    for (const e of entries) c[e.level]++
    return c
  }, [entries])

  return (
    <Box gap={2}>
      <Strong color="$muted">
        {LEVEL_BADGES.DEBUG}:{counts.DEBUG}
      </Strong>
      <Strong color="$primary">
        {LEVEL_BADGES.INFO}:{counts.INFO}
      </Strong>
      <Strong color="$warning">
        {LEVEL_BADGES.WARN}:{counts.WARN}
      </Strong>
      <Strong color="$error">
        {LEVEL_BADGES.ERROR}:{counts.ERROR}
      </Strong>
    </Box>
  )
}

/** Inner component that reads the flex container's height via useContentRect */
function LogListArea({ entries, cursor }: { entries: LogEntry[]; cursor: number }) {
  const { height } = useContentRect()

  return (
    <VirtualList
      items={entries}
      height={height}
      itemHeight={1}
      scrollTo={cursor}
      overscan={5}
      renderItem={(entry, index) => <LogRow key={entry.id} entry={entry} isSelected={index === cursor} />}
    />
  )
}

// ============================================================================
// Main App
// ============================================================================

const INITIAL_COUNT = 200
const rng = seededRandom(12345)

export function DevTools() {
  const { exit } = useApp()
  const [entries, setEntries] = useState<LogEntry[]>(() => generateInitialLogs(INITIAL_COUNT))
  const [cursor, setCursor] = useState(INITIAL_COUNT - 1)
  const [autoScroll, setAutoScroll] = useState(true)

  const addEntry = useCallback(
    (level: LogLevel) => {
      const entry = createLogEntry(level, rng)
      setEntries((prev) => [...prev, entry])
      if (autoScroll) {
        setCursor((prev) => prev + 1)
      }
    },
    [autoScroll],
  )

  useInput(
    useCallback(
      (input: string, key: Key) => {
        // Quit
        if (input === "q" || key.escape) {
          exit()
          return
        }

        // Navigation
        if (input === "j" || key.downArrow) {
          setCursor((c) => Math.min(entries.length - 1, c + 1))
          setAutoScroll(false)
          return
        }
        if (input === "k" || key.upArrow) {
          setCursor((c) => Math.max(0, c - 1))
          setAutoScroll(false)
          return
        }

        // Jump to start/end
        if (input === "g" || key.home) {
          setCursor(0)
          setAutoScroll(false)
          return
        }
        if (input === "G" || key.end) {
          setCursor(entries.length - 1)
          setAutoScroll(true)
          return
        }

        // Add log entries
        if (input === "d") {
          addEntry("DEBUG")
          return
        }
        if (input === "i") {
          addEntry("INFO")
          return
        }
        if (input === "w") {
          addEntry("WARN")
          return
        }
        if (input === "e") {
          addEntry("ERROR")
          return
        }

        // Clear
        if (input === "c") {
          setEntries([])
          setCursor(0)
          setAutoScroll(true)
          return
        }
      },
      [entries.length, exit, addEntry],
    ),
  )

  return (
    <Box flexDirection="column" flexGrow={1} padding={1}>
      {/* Header */}
      <Box justifyContent="space-between" backgroundColor="$surfacebg">
        <Box gap={2}>
          <Text bold color="$primary">
            {"▸"} Log Viewer
          </Text>
          <LevelCounts entries={entries} />
        </Box>
        <Box gap={1}>
          {autoScroll && (
            <Text backgroundColor="$success" color="$success-fg" bold>
              {" LIVE "}
            </Text>
          )}
          <Strong color="$primary">{cursor + 1}</Strong>
          <Muted>/ {entries.length}</Muted>
        </Box>
      </Box>

      {/* Column headers */}
      <Box paddingX={1}>
        <Muted>{"Time     "} </Muted>
        <Muted>{"Lvl"} </Muted>
        <Muted>{"[Source   ]"} </Muted>
        <Muted>Message</Muted>
      </Box>

      <Box paddingX={1}>
        <Divider />
      </Box>

      {/* Log list in a flex-grow container */}
      <Box flexGrow={1} flexDirection="column">
        <LogListArea entries={entries} cursor={cursor} />
      </Box>

    </Box>
  )
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  using term = createTerm()
  const { waitUntilExit } = await render(
    <ExampleBanner meta={meta} controls="j/k navigate  g/G start/end  d/i/w/e add log  c clear  Esc/q quit">
      <DevTools />
    </ExampleBanner>,
    term,
  )
  await waitUntilExit()
}

if (import.meta.main) {
  main().catch(console.error)
}
