/**
 * Data Explorer — Process Table Example
 *
 * A process explorer with a searchable, scrollable table demonstrating:
 * - Table-like display with responsive column widths via useContentRect()
 * - TextInput for live search/filter with useDeferredValue
 * - VirtualList for smooth scrolling through 500+ rows
 * - Keyboard navigation with j/k and vim-style jumps
 * - Color-coded status indicators
 *
 * Usage: bun run examples/apps/data-explorer.tsx
 *
 * Controls:
 *   j/k or Up/Down  - Navigate rows
 *   d/u             - Half-page down/up
 *   g/G             - Jump to first/last
 *   /               - Toggle search mode
 *   Esc             - Exit search / quit
 *   q               - Quit (when not searching)
 */

import React, { useState, useCallback, useMemo, useDeferredValue } from "react"
import {
  render,
  Box,
  Text,
  VirtualList,
  TextInput,
  Divider,
  useContentRect,
  useInput,
  useApp,
  createTerm,
  Kbd,
  Muted,
  Lead,
  type Key,
} from "../../src/index.js"
import { ExampleBanner, type ExampleMeta } from "../_banner.js"

export const meta: ExampleMeta = {
  name: "Data Explorer",
  description: "Process explorer table with search, VirtualList, and responsive column widths",
  features: ["useContentRect()", "TextInput", "useInput()", "responsive layout", "useDeferredValue"],
}

// ============================================================================
// Types
// ============================================================================

type ProcessStatus = "running" | "sleeping" | "stopped" | "zombie"

interface ProcessInfo {
  pid: number
  name: string
  cpu: number
  mem: number
  status: ProcessStatus
  user: string
  threads: number
  uptime: string
}

// ============================================================================
// Data Generation
// ============================================================================

const PROCESS_NAMES = [
  "node",
  "python3",
  "nginx",
  "redis-server",
  "postgres",
  "docker",
  "sshd",
  "systemd",
  "cron",
  "rsyslogd",
  "webpack",
  "vite",
  "chrome",
  "firefox",
  "code",
  "vim",
  "tmux",
  "bash",
  "zsh",
  "containerd",
  "kubelet",
  "etcd",
  "coredns",
  "flannel",
  "prometheus",
  "grafana",
  "elasticsearch",
  "kibana",
  "logstash",
  "rabbitmq",
  "kafka",
  "zookeeper",
  "consul",
  "vault",
  "haproxy",
  "traefik",
  "envoy",
  "istio-proxy",
  "jaeger",
  "mysql",
  "mongo",
  "cassandra",
  "clickhouse",
  "influxdb",
  "jenkins",
  "gitlab-runner",
  "buildkitd",
  "registry",
  "cadvisor",
  "node-exporter",
  "alertmanager",
  "telegraf",
  "bun",
  "deno",
  "esbuild",
  "swc",
  "turbo",
  "pnpm",
]

const USERS = ["root", "www-data", "postgres", "redis", "node", "admin", "deploy", "monitor"]
const STATUSES: ProcessStatus[] = ["running", "sleeping", "stopped", "zombie"]

function seededRandom(seed: number): () => number {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) & 0x7fffffff
    return s / 0x7fffffff
  }
}

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h${Math.floor((seconds % 3600) / 60)}m`
  return `${Math.floor(seconds / 86400)}d${Math.floor((seconds % 86400) / 3600)}h`
}

function generateProcesses(count: number): ProcessInfo[] {
  const rng = seededRandom(42)
  const processes: ProcessInfo[] = []

  for (let i = 0; i < count; i++) {
    const nameBase = PROCESS_NAMES[Math.floor(rng() * PROCESS_NAMES.length)]!
    const hasInstance = rng() > 0.6
    const name = hasInstance ? `${nameBase}:${Math.floor(rng() * 20)}` : nameBase
    const status = rng() < 0.7 ? "running" : STATUSES[Math.floor(rng() * STATUSES.length)]!

    processes.push({
      pid: 1000 + i,
      name,
      cpu: status === "running" ? Math.round(rng() * 1000) / 10 : 0,
      mem: Math.round(rng() * 500) / 10,
      status,
      user: USERS[Math.floor(rng() * USERS.length)]!,
      threads: 1 + Math.floor(rng() * 64),
      uptime: formatUptime(Math.floor(rng() * 864000)),
    })
  }

  // Sort by CPU descending initially
  return processes.sort((a, b) => b.cpu - a.cpu)
}

const TOTAL_PROCESSES = 600
const ALL_PROCESSES = generateProcesses(TOTAL_PROCESSES)

// ============================================================================
// Constants
// ============================================================================

const STATUS_COLORS: Record<ProcessStatus, string> = {
  running: "$success",
  sleeping: "$muted",
  stopped: "$warning",
  zombie: "$error",
}

const STATUS_ICONS: Record<ProcessStatus, string> = {
  running: "\u25b6",
  sleeping: "\u25cc",
  stopped: "\u25a0",
  zombie: "\u2620",
}

// ============================================================================
// Components
// ============================================================================

/** Column layout helper -- computes column widths based on available space */
function useColumns(totalWidth: number) {
  return useMemo(() => {
    // Fixed columns
    const pidW = 6
    const cpuW = 7
    const memW = 7
    const statusW = 10
    const threadsW = 5
    const uptimeW = 8
    const userW = 10
    const fixed = pidW + cpuW + memW + statusW + threadsW + uptimeW + userW + 8 // gaps

    // Name gets the rest
    const nameW = Math.max(10, totalWidth - fixed)

    return { pidW, nameW, cpuW, memW, statusW, userW, threadsW, uptimeW }
  }, [totalWidth])
}

function TableHeader({ width }: { width: number }) {
  const cols = useColumns(width)

  return (
    <Box paddingX={1}>
      <Text bold color="$muted">
        {"PID".padEnd(cols.pidW)}
        {"NAME".padEnd(cols.nameW)}
        {"CPU%".padStart(cols.cpuW)}
        {"MEM%".padStart(cols.memW)}
        {"  "}
        {"STATUS".padEnd(cols.statusW)}
        {"USER".padEnd(cols.userW)}
        {"THR".padStart(cols.threadsW)}
        {"  "}
        {"UPTIME".padStart(cols.uptimeW)}
      </Text>
    </Box>
  )
}

function ProcessRow({ proc, isSelected, width }: { proc: ProcessInfo; isSelected: boolean; width: number }) {
  const cols = useColumns(width)
  const cpuColor = proc.cpu > 80 ? "$error" : proc.cpu > 40 ? "$warning" : "$success"
  const memColor = proc.mem > 40 ? "$warning" : "$muted"

  // Truncate name to fit column
  const displayName = proc.name.length > cols.nameW - 1 ? proc.name.slice(0, cols.nameW - 2) + "\u2026" : proc.name

  return (
    <Box paddingX={1} backgroundColor={isSelected ? "$primary" : undefined}>
      <Text color={isSelected ? "white" : "$muted"}>{String(proc.pid).padEnd(cols.pidW)}</Text>
      <Text bold={isSelected} color={isSelected ? "white" : undefined}>
        {displayName.padEnd(cols.nameW)}
      </Text>
      <Text color={isSelected ? "white" : cpuColor}>{proc.cpu.toFixed(1).padStart(cols.cpuW - 1)}%</Text>
      <Text color={isSelected ? "white" : memColor}>{proc.mem.toFixed(1).padStart(cols.memW - 1)}%</Text>
      <Text>{"  "}</Text>
      <Text color={isSelected ? "white" : STATUS_COLORS[proc.status]}>
        {STATUS_ICONS[proc.status]} {proc.status.padEnd(cols.statusW - 2)}
      </Text>
      <Text color={isSelected ? "white" : "$muted"}>{proc.user.padEnd(cols.userW)}</Text>
      <Text color={isSelected ? "white" : "$muted"}>{String(proc.threads).padStart(cols.threadsW)}</Text>
      <Text>{"  "}</Text>
      <Text color={isSelected ? "white" : "$muted"}>{proc.uptime.padStart(cols.uptimeW)}</Text>
    </Box>
  )
}

function SummaryBar({ processes, query }: { processes: ProcessInfo[]; query: string }) {
  const stats = useMemo(() => {
    let running = 0
    let totalCpu = 0
    let totalMem = 0
    for (const p of processes) {
      if (p.status === "running") running++
      totalCpu += p.cpu
      totalMem += p.mem
    }
    return { running, totalCpu: totalCpu.toFixed(1), totalMem: totalMem.toFixed(1) }
  }, [processes])

  return (
    <Box paddingX={1} gap={2}>
      <Text bold>{processes.length}</Text>
      <Muted>processes</Muted>
      <Text color="$success" bold>
        {stats.running}
      </Text>
      <Muted>running</Muted>
      <Muted>|</Muted>
      <Text color="$primary">CPU: {stats.totalCpu}%</Text>
      <Text color="$warning">MEM: {stats.totalMem}%</Text>
      {query && (
        <>
          <Muted>|</Muted>
          <Text dim>filter: &quot;{query}&quot;</Text>
        </>
      )}
    </Box>
  )
}

/** Inner component that reads the flex container's height */
function ProcessListArea({ processes, cursor, width }: { processes: ProcessInfo[]; cursor: number; width: number }) {
  const { height } = useContentRect()

  return (
    <VirtualList
      items={processes}
      height={height}
      itemHeight={1}
      scrollTo={cursor}
      overscan={5}
      renderItem={(proc, index) => (
        <ProcessRow key={proc.pid} proc={proc} isSelected={index === cursor} width={width} />
      )}
    />
  )
}

// ============================================================================
// Main App
// ============================================================================

export function DataExplorer() {
  const { exit } = useApp()
  const { width } = useContentRect()
  const [cursor, setCursor] = useState(0)
  const [searchMode, setSearchMode] = useState(false)
  const [query, setQuery] = useState("")
  const deferredQuery = useDeferredValue(query)

  // Filter processes based on deferred query
  const filtered = useMemo(() => {
    if (!deferredQuery) return ALL_PROCESSES
    const q = deferredQuery.toLowerCase()
    return ALL_PROCESSES.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.user.toLowerCase().includes(q) ||
        p.status.includes(q) ||
        String(p.pid).includes(q),
    )
  }, [deferredQuery])

  const listHeight = useMemo(() => Math.max(5, filtered.length), [filtered.length])
  const halfPage = Math.max(1, Math.floor(listHeight / 4))

  // Clamp cursor when filter changes
  const effectiveCursor = Math.min(cursor, Math.max(0, filtered.length - 1))

  const handleSearchSubmit = useCallback(() => {
    setSearchMode(false)
  }, [])

  useInput(
    useCallback(
      (input: string, key: Key) => {
        // In search mode, only handle Esc to exit
        if (searchMode) {
          if (key.escape) {
            setSearchMode(false)
            return
          }
          // TextInput handles all other input
          return
        }

        // Normal mode
        if (input === "q" || key.escape) {
          exit()
          return
        }

        if (input === "/") {
          setSearchMode(true)
          return
        }

        // Navigation
        if (input === "j" || key.downArrow) {
          setCursor((c) => Math.min(filtered.length - 1, c + 1))
        }
        if (input === "k" || key.upArrow) {
          setCursor((c) => Math.max(0, c - 1))
        }
        if (input === "d" || key.pageDown) {
          setCursor((c) => Math.min(filtered.length - 1, c + halfPage))
        }
        if (input === "u" || key.pageUp) {
          setCursor((c) => Math.max(0, c - halfPage))
        }
        if (input === "g" || key.home) {
          setCursor(0)
        }
        if (input === "G" || key.end) {
          setCursor(filtered.length - 1)
        }

        // Clear filter
        if (key.backspace && query) {
          setQuery("")
          setCursor(0)
        }
      },
      [searchMode, exit, filtered.length, halfPage, query],
    ),
  )

  return (
    <Box flexDirection="column" flexGrow={1}>
      {/* Summary bar */}
      <SummaryBar processes={filtered} query={deferredQuery} />

      {/* Search bar */}
      <Box paddingX={1}>
        {searchMode ? (
          <Box>
            <Text color="$primary" bold>
              /{" "}
            </Text>
            <TextInput
              value={query}
              onChange={(v) => {
                setQuery(v)
                setCursor(0)
              }}
              onSubmit={handleSearchSubmit}
              prompt=""
              isActive={searchMode}
            />
          </Box>
        ) : query ? (
          <Muted>
            filter: <Text bold>{query}</Text> (backspace to clear, / to edit)
          </Muted>
        ) : (
          <Muted>
            Press <Kbd>/</Kbd> to search
          </Muted>
        )}
      </Box>

      {/* Table header */}
      <TableHeader width={width} />
      <Box paddingX={1}>
        <Divider />
      </Box>

      {/* Process list */}
      <Box flexGrow={1} flexDirection="column">
        {filtered.length > 0 ? (
          <ProcessListArea processes={filtered} cursor={effectiveCursor} width={width} />
        ) : (
          <Box paddingX={1} justifyContent="center">
            <Lead>No processes match &quot;{deferredQuery}&quot;</Lead>
          </Box>
        )}
      </Box>

      {/* Scroll indicator + help */}
      <Box paddingX={1} justifyContent="space-between">
        <Muted>
          <Kbd>j/k</Kbd> navigate <Kbd>d/u</Kbd> half-page <Kbd>g/G</Kbd> start/end <Kbd>/</Kbd> search <Kbd>Esc/q</Kbd>{" "}
          quit
        </Muted>
        <Muted>
          {effectiveCursor + 1}/{filtered.length}
        </Muted>
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
    <ExampleBanner meta={meta} controls="j/k navigate  d/u half-page  g/G start/end  / search  Esc/q quit">
      <DataExplorer />
    </ExampleBanner>,
    term,
  )
  await waitUntilExit()
}

if (import.meta.main) {
  main().catch(console.error)
}
