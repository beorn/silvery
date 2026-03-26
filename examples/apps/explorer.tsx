/**
 * Explorer — Log Viewer & Process Explorer
 *
 * A tabbed data exploration demo combining:
 * - Streaming log viewer with ~2000 lines, severity-level coloring, and level toggles
 * - Sortable process table with ~50 processes, live CPU/MEM jitter, and responsive columns
 * - Shared TextInput search bar with useDeferredValue for non-blocking filtering
 * - VirtualList with interactive scrolling for both tabs
 *
 * Usage: bun vendor/silvery/examples/apps/explorer.tsx
 *
 * Controls:
 *   Tab/h/l       - Switch tabs (Logs / Processes)
 *   j/k or Up/Dn  - Navigate rows
 *   d/u            - Half-page down/up
 *   g/G            - Jump to first/last
 *   /              - Focus search bar
 *   1-4            - Toggle log levels (Logs tab)
 *   s              - Cycle sort column (Processes tab)
 *   Esc            - Exit search / quit
 *   q              - Quit (when not searching)
 */

import React, { useState, useCallback, useMemo, useDeferredValue, useEffect, useRef } from "react"
import {
  render,
  Box,
  Text,
  VirtualList,
  TextInput,
  Tabs,
  TabList,
  Tab,
  Divider,
  useContentRect,
  useInput,
  useApp,
  createTerm,
  Kbd,
  Muted,
  type Key,
} from "../../src/index.js"
import { ExampleBanner, type ExampleMeta } from "../_banner.js"

export const meta: ExampleMeta = {
  name: "Explorer",
  description: "Log viewer and process explorer with VirtualList search",
  demo: true,
  features: ["VirtualList", "TextInput", "useContentRect()", "useDeferredValue", "2000+ rows"],
}

// ============================================================================
// Shared Types & Utilities
// ============================================================================

function seededRandom(seed: number): () => number {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) & 0x7fffffff
    return s / 0x7fffffff
  }
}

// ============================================================================
// Log Data
// ============================================================================

type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR"

interface LogEntry {
  id: number
  timestamp: string
  service: string
  level: LogLevel
  message: string
}

const SERVICES = [
  "api",
  "auth",
  "db",
  "cache",
  "worker",
  "gateway",
  "scheduler",
  "metrics",
  "queue",
  "ws",
]

const LOG_TEMPLATES: Record<LogLevel, string[]> = {
  DEBUG: [
    "Cache miss for key user:session:{id}",
    "Query plan: sequential scan on events ({n} rows)",
    "WebSocket frame received: {n} bytes",
    "GC pause: {n}ms (minor collection)",
    "Connection pool stats: {n} active, {n} idle",
    "Route matched: GET /api/v2/resources/{id}",
    "DNS resolution took {n}ms for upstream.svc",
    "Retry backoff: sleeping {n}ms before attempt",
  ],
  INFO: [
    "Request completed: 200 OK ({n}ms)",
    "User {id} authenticated via OAuth",
    "Background job processed: email_dispatch #{id}",
    "Server listening on port {n}",
    "Database migration applied: v{n}",
    "Health check passed (latency: {n}ms)",
    "Deployed version 2.{n}.0 to production",
    "Cache warmed: {n} entries loaded in {n}ms",
  ],
  WARN: [
    "Slow query detected: {n}ms (threshold: 200ms)",
    "Rate limit approaching: {n}/1000 requests",
    "Memory usage: {n}% of allocated heap",
    "Retry attempt {n}/3 for external API call",
    "Certificate expires in {n} days",
    "Connection pool near capacity: {n}/100",
    "Request body exceeds {n}KB soft limit",
    "Stale cache entry served for key products:{id}",
  ],
  ERROR: [
    "Unhandled exception in request handler: TypeError",
    "Database connection refused: ECONNREFUSED",
    "Authentication failed for user {id}: invalid token",
    "Timeout after {n}ms waiting for upstream service",
    "Disk usage critical: {n}% on /var/data",
    "Failed to process message from queue: malformed payload",
    "OOM kill triggered for worker process PID {id}",
    "TLS handshake failed: certificate chain incomplete",
  ],
}

const LEVEL_COLORS: Record<LogLevel, string> = {
  DEBUG: "$muted",
  INFO: "$success",
  WARN: "$warning",
  ERROR: "$error",
}

const LEVEL_BADGES: Record<LogLevel, string> = {
  DEBUG: "DBG",
  INFO: "INF",
  WARN: "WRN",
  ERROR: "ERR",
}

function generateLogs(count: number): LogEntry[] {
  const rng = seededRandom(42)
  const levels: LogLevel[] = ["DEBUG", "INFO", "INFO", "INFO", "INFO", "WARN", "WARN", "ERROR"]
  const entries: LogEntry[] = []

  // Start time: spread over 30 minutes
  const baseHour = 14
  const baseMinute = 30

  for (let i = 0; i < count; i++) {
    const level = levels[Math.floor(rng() * levels.length)]!
    const templates = LOG_TEMPLATES[level]
    const template = templates[Math.floor(rng() * templates.length)]!
    const message = template
      .replace(/\{id\}/g, () => String(Math.floor(rng() * 99999)))
      .replace(/\{n\}/g, () => String(Math.floor(rng() * 999)))

    const totalSeconds = (i / count) * 1800 // 30 min spread
    const h = baseHour + Math.floor((baseMinute * 60 + totalSeconds) / 3600)
    const m = Math.floor(((baseMinute * 60 + totalSeconds) % 3600) / 60)
    const s = Math.floor(totalSeconds % 60)
    const ms = Math.floor(rng() * 1000)

    entries.push({
      id: i,
      timestamp: `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(ms).padStart(3, "0")}`,
      service: SERVICES[Math.floor(rng() * SERVICES.length)]!,
      level,
      message,
    })
  }

  return entries
}

const ALL_LOGS = generateLogs(2000)

// ============================================================================
// Process Data
// ============================================================================

type SortColumn = "pid" | "name" | "cpu" | "mem" | "status"

interface ProcessInfo {
  pid: number
  name: string
  cpu: number
  mem: number
  status: "running" | "sleeping" | "stopped" | "zombie"
}

const PROCESS_NAMES = [
  "node",
  "bun",
  "postgres",
  "redis-server",
  "nginx",
  "docker",
  "sshd",
  "containerd",
  "kubelet",
  "etcd",
  "coredns",
  "prometheus",
  "grafana",
  "elasticsearch",
  "rabbitmq",
  "kafka",
  "consul",
  "vault",
  "haproxy",
  "traefik",
  "envoy",
  "mysql",
  "mongo",
  "clickhouse",
  "influxdb",
  "jenkins",
  "cadvisor",
  "telegraf",
  "deno",
  "esbuild",
  "python3",
  "ruby",
  "java",
  "go",
  "rustc",
  "webpack",
  "vite",
  "swc",
  "chrome",
  "code",
  "tmux",
  "zsh",
  "cron",
  "systemd",
  "rsyslogd",
  "logstash",
  "kibana",
  "alertmanager",
  "buildkitd",
  "registry",
]

const PROCESS_STATUSES: ProcessInfo["status"][] = ["running", "sleeping", "stopped", "zombie"]

function generateProcesses(count: number): ProcessInfo[] {
  const rng = seededRandom(123)
  const procs: ProcessInfo[] = []

  for (let i = 0; i < count; i++) {
    const nameBase = PROCESS_NAMES[Math.floor(rng() * PROCESS_NAMES.length)]!
    const hasInstance = rng() > 0.7
    const status =
      rng() < 0.65 ? "running" : PROCESS_STATUSES[Math.floor(rng() * PROCESS_STATUSES.length)]!

    procs.push({
      pid: 1000 + Math.floor(rng() * 60000),
      name: hasInstance ? `${nameBase}:${Math.floor(rng() * 16)}` : nameBase,
      cpu: status === "running" ? Math.round(rng() * 1000) / 10 : 0,
      mem: Math.round(rng() * 800) / 10,
      status,
    })
  }

  return procs
}

const INITIAL_PROCESSES = generateProcesses(50)

const STATUS_COLORS: Record<ProcessInfo["status"], string> = {
  running: "$success",
  sleeping: "$muted",
  stopped: "$warning",
  zombie: "$error",
}

const STATUS_ICONS: Record<ProcessInfo["status"], string> = {
  running: "\u25b6",
  sleeping: "\u25cc",
  stopped: "\u25a0",
  zombie: "\u2620",
}

const SORT_COLUMNS: SortColumn[] = ["cpu", "mem", "pid", "name", "status"]

// ============================================================================
// Log Components
// ============================================================================

function LogRow({ entry, isSelected }: { entry: LogEntry; isSelected: boolean }) {
  return (
    <Box paddingX={1} backgroundColor={isSelected ? "$mutedbg" : undefined}>
      <Muted>{entry.timestamp} </Muted>
      <Text color={LEVEL_COLORS[entry.level]} bold>
        {LEVEL_BADGES[entry.level]}
      </Text>
      <Muted> [{entry.service.padEnd(9)}] </Muted>
      <Text>{entry.message}</Text>
    </Box>
  )
}

function LogListArea({ entries, cursor }: { entries: LogEntry[]; cursor: number }) {
  const { height } = useContentRect()

  return (
    <VirtualList
      items={entries}
      height={height}
      itemHeight={1}
      scrollTo={cursor}
      overscan={5}
      renderItem={(entry, index) => (
        <LogRow key={entry.id} entry={entry} isSelected={index === cursor} />
      )}
    />
  )
}

function LevelToggles({
  levels,
  onToggle,
}: {
  levels: Record<LogLevel, boolean>
  onToggle: (level: LogLevel) => void
}) {
  const allLevels: LogLevel[] = ["DEBUG", "INFO", "WARN", "ERROR"]
  return (
    <Box gap={1}>
      {allLevels.map((level, i) => {
        const active = levels[level]
        return (
          <Box key={level} gap={0}>
            <Text color="$muted" dim>
              {i + 1}:
            </Text>
            <Text
              color={active ? LEVEL_COLORS[level] : "$muted"}
              bold={active}
              dim={!active}
              strikethrough={!active}
            >
              {LEVEL_BADGES[level]}
            </Text>
          </Box>
        )
      })}
    </Box>
  )
}

// ============================================================================
// Process Components
// ============================================================================

function useColumns(totalWidth: number) {
  return useMemo(() => {
    const pidW = 7
    const cpuW = 8
    const memW = 8
    const statusW = 11
    const fixed = pidW + cpuW + memW + statusW + 4 // gaps
    const nameW = Math.max(12, totalWidth - fixed)
    return { pidW, nameW, cpuW, memW, statusW }
  }, [totalWidth])
}

function ProcessHeader({ width }: { width: number }) {
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
      </Text>
    </Box>
  )
}

function ProcessRow({
  proc,
  isSelected,
  width,
}: {
  proc: ProcessInfo
  isSelected: boolean
  width: number
}) {
  const cols = useColumns(width)
  const cpuColor = proc.cpu > 80 ? "$error" : proc.cpu > 40 ? "$warning" : "$success"
  const displayName =
    proc.name.length > cols.nameW - 1 ? proc.name.slice(0, cols.nameW - 2) + "\u2026" : proc.name

  return (
    <Box paddingX={1} backgroundColor={isSelected ? "$mutedbg" : undefined}>
      <Text color="$muted">{String(proc.pid).padEnd(cols.pidW)}</Text>
      <Text bold={isSelected}>{displayName.padEnd(cols.nameW)}</Text>
      <Text color={cpuColor}>{proc.cpu.toFixed(1).padStart(cols.cpuW - 1)}%</Text>
      <Text color={proc.mem > 40 ? "$warning" : "$muted"}>
        {proc.mem.toFixed(1).padStart(cols.memW - 1)}%
      </Text>
      <Text>{"  "}</Text>
      <Text color={STATUS_COLORS[proc.status]}>
        {STATUS_ICONS[proc.status]} {proc.status.padEnd(cols.statusW - 2)}
      </Text>
    </Box>
  )
}

function ProcessListArea({
  processes,
  cursor,
  width,
}: {
  processes: ProcessInfo[]
  cursor: number
  width: number
}) {
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

export function Explorer() {
  const { exit } = useApp()
  const { width } = useContentRect()

  // Tab state
  const [activeTab, setActiveTab] = useState("logs")

  // Search state (shared)
  const [searchMode, setSearchMode] = useState(false)
  const [query, setQuery] = useState("")
  const deferredQuery = useDeferredValue(query)

  // Log state
  const [logCursor, setLogCursor] = useState(0)
  const [logLevels, setLogLevels] = useState<Record<LogLevel, boolean>>({
    DEBUG: true,
    INFO: true,
    WARN: true,
    ERROR: true,
  })

  // Process state
  const [procCursor, setProcCursor] = useState(0)
  const [sortCol, setSortCol] = useState<SortColumn>("cpu")
  const [processes, setProcesses] = useState(INITIAL_PROCESSES)

  // Live jitter on CPU/MEM values
  const jitterRef = useRef<ReturnType<typeof setInterval> | null>(null)
  useEffect(() => {
    const rng = seededRandom(Date.now())
    jitterRef.current = setInterval(() => {
      setProcesses((prev) =>
        prev.map((p) => {
          if (p.status !== "running") return p
          const cpuDelta = (rng() - 0.5) * 6
          const memDelta = (rng() - 0.5) * 2
          return {
            ...p,
            cpu: Math.max(0, Math.min(100, Math.round((p.cpu + cpuDelta) * 10) / 10)),
            mem: Math.max(0, Math.min(100, Math.round((p.mem + memDelta) * 10) / 10)),
          }
        }),
      )
    }, 2000)
    return () => {
      if (jitterRef.current) clearInterval(jitterRef.current)
    }
  }, [])

  // Filtered logs
  const filteredLogs = useMemo(() => {
    let logs = ALL_LOGS.filter((e) => logLevels[e.level])
    if (deferredQuery) {
      const q = deferredQuery.toLowerCase()
      logs = logs.filter(
        (e) =>
          e.message.toLowerCase().includes(q) ||
          e.service.toLowerCase().includes(q) ||
          e.level.toLowerCase().includes(q),
      )
    }
    return logs
  }, [deferredQuery, logLevels])

  // Filtered + sorted processes
  const filteredProcesses = useMemo(() => {
    let procs = processes
    if (deferredQuery) {
      const q = deferredQuery.toLowerCase()
      procs = procs.filter(
        (p) =>
          p.name.toLowerCase().includes(q) || p.status.includes(q) || String(p.pid).includes(q),
      )
    }
    return [...procs].sort((a, b) => {
      switch (sortCol) {
        case "cpu":
          return b.cpu - a.cpu
        case "mem":
          return b.mem - a.mem
        case "pid":
          return a.pid - b.pid
        case "name":
          return a.name.localeCompare(b.name)
        case "status":
          return a.status.localeCompare(b.status)
      }
    })
  }, [processes, deferredQuery, sortCol])

  // Current list length for navigation
  const currentItems = activeTab === "logs" ? filteredLogs : filteredProcesses
  const cursor = activeTab === "logs" ? logCursor : procCursor
  const setCursor = activeTab === "logs" ? setLogCursor : setProcCursor
  const halfPage = Math.max(1, Math.floor(20 / 2))

  // Clamp cursors when filter changes
  const effectiveLogCursor = Math.min(logCursor, Math.max(0, filteredLogs.length - 1))
  const effectiveProcCursor = Math.min(procCursor, Math.max(0, filteredProcesses.length - 1))

  const handleSearchSubmit = useCallback(() => {
    setSearchMode(false)
  }, [])

  const toggleLevel = useCallback((level: LogLevel) => {
    setLogLevels((prev) => ({ ...prev, [level]: !prev[level] }))
    setLogCursor(0)
  }, [])

  useInput(
    useCallback(
      (input: string, key: Key) => {
        // Search mode: only handle Esc
        if (searchMode) {
          if (key.escape) {
            setSearchMode(false)
            return
          }
          return
        }

        // Quit
        if (input === "q" || key.escape) {
          exit()
          return
        }

        // Search
        if (input === "/") {
          setSearchMode(true)
          return
        }

        // Tab switching (Tab key handled by Tabs component via h/l)

        // Log level toggles (logs tab only)
        if (activeTab === "logs") {
          const levelMap: Record<string, LogLevel> = {
            "1": "DEBUG",
            "2": "INFO",
            "3": "WARN",
            "4": "ERROR",
          }
          if (levelMap[input]) {
            toggleLevel(levelMap[input])
            return
          }
        }

        // Sort cycling (processes tab only)
        if (activeTab === "processes" && input === "s") {
          setSortCol((prev) => {
            const idx = SORT_COLUMNS.indexOf(prev)
            return SORT_COLUMNS[(idx + 1) % SORT_COLUMNS.length]!
          })
          return
        }

        // Navigation
        if (input === "j" || key.downArrow) {
          setCursor((c: number) => Math.min(currentItems.length - 1, c + 1))
        }
        if (input === "k" || key.upArrow) {
          setCursor((c: number) => Math.max(0, c - 1))
        }
        if (input === "d" || key.pageDown) {
          setCursor((c: number) => Math.min(currentItems.length - 1, c + halfPage))
        }
        if (input === "u" || key.pageUp) {
          setCursor((c: number) => Math.max(0, c - halfPage))
        }
        if (input === "g" || key.home) {
          setCursor(0)
        }
        if (input === "G" || key.end) {
          setCursor(currentItems.length - 1)
        }

        // Clear filter
        if (key.backspace && query) {
          setQuery("")
          setCursor(0)
        }
      },
      [searchMode, exit, activeTab, currentItems.length, halfPage, query, toggleLevel, setCursor],
    ),
  )

  return (
    <Box flexDirection="column" flexGrow={1}>
      {/* Search bar */}
      <Box paddingX={1}>
        {searchMode ? (
          <Box flexGrow={1}>
            <Text color="$primary" bold>
              /{" "}
            </Text>
            <TextInput
              value={query}
              onChange={(v) => {
                setQuery(v)
                setLogCursor(0)
                setProcCursor(0)
              }}
              onSubmit={handleSearchSubmit}
              prompt=""
              isActive={searchMode}
            />
          </Box>
        ) : query ? (
          <Muted>
            filter: <Text bold>{query}</Text> (<Kbd>backspace</Kbd> clear, <Kbd>/</Kbd> edit)
          </Muted>
        ) : (
          <Muted>
            <Kbd>/</Kbd> search
          </Muted>
        )}
      </Box>

      {/* Tab bar */}
      <Tabs value={activeTab} onChange={setActiveTab} isActive={!searchMode}>
        <Box paddingX={1}>
          <TabList>
            <Tab value="logs">Logs ({filteredLogs.length.toLocaleString()})</Tab>
            <Tab value="processes">Processes ({filteredProcesses.length})</Tab>
          </TabList>
        </Box>
      </Tabs>

      {/* Tab content — outside Tabs so flexGrow works */}
      {activeTab === "logs" && (
        <>
          <Box paddingX={1} justifyContent="space-between">
            <LevelToggles levels={logLevels} onToggle={toggleLevel} />
            <Muted>
              {effectiveLogCursor + 1}/{filteredLogs.length.toLocaleString()}
            </Muted>
          </Box>
          <Box flexGrow={1} flexDirection="column">
            {filteredLogs.length > 0 ? (
              <LogListArea entries={filteredLogs} cursor={effectiveLogCursor} />
            ) : (
              <Box paddingX={1} justifyContent="center">
                <Muted>No logs match the current filter</Muted>
              </Box>
            )}
          </Box>
        </>
      )}

      {activeTab === "processes" && (
        <>
          <Box paddingX={1} justifyContent="space-between">
            <Box gap={1}>
              <Muted>sort:</Muted>
              <Text bold color="$primary">
                {sortCol.toUpperCase()}
              </Text>
              <Muted>
                (<Kbd>s</Kbd> cycle)
              </Muted>
            </Box>
            <Muted>
              {effectiveProcCursor + 1}/{filteredProcesses.length}
            </Muted>
          </Box>
          <ProcessHeader width={width} />
          <Box paddingX={1}>
            <Divider />
          </Box>
          <Box flexGrow={1} flexDirection="column">
            {filteredProcesses.length > 0 ? (
              <ProcessListArea
                processes={filteredProcesses}
                cursor={effectiveProcCursor}
                width={width}
              />
            ) : (
              <Box paddingX={1} justifyContent="center">
                <Muted>No processes match the current filter</Muted>
              </Box>
            )}
          </Box>
        </>
      )}

      {/* Help bar */}
      <Box paddingX={1} justifyContent="space-between">
        <Muted>
          <Kbd>h/l</Kbd> tab <Kbd>j/k</Kbd> navigate <Kbd>d/u</Kbd> page <Kbd>/</Kbd> search{" "}
          {activeTab === "logs" && (
            <>
              <Kbd>1-4</Kbd> levels{" "}
            </>
          )}
          {activeTab === "processes" && (
            <>
              <Kbd>s</Kbd> sort{" "}
            </>
          )}
          <Kbd>q</Kbd> quit
        </Muted>
      </Box>
    </Box>
  )
}

// ============================================================================
// Main
// ============================================================================

export async function main() {
  using term = createTerm()
  const { waitUntilExit } = await render(
    <ExampleBanner
      meta={meta}
      controls="h/l tab  j/k navigate  d/u page  / search  1-4 levels  s sort  q quit"
    >
      <Explorer />
    </ExampleBanner>,
    term,
  )
  await waitUntilExit()
}

if (import.meta.main) {
  main().catch(console.error)
}
