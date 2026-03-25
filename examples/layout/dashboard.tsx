/**
 * Dashboard Example
 *
 * A btop-style responsive dashboard demonstrating:
 * - Tab navigation with compound Tabs component
 * - Live-updating metrics with sparklines
 * - Responsive 2-column / 1-column layout via useContentRect()
 * - Semantic theme colors with severity-based color coding
 * - Flex-based progress bars
 */

import React, { useState } from "react"
import {
  render,
  Box,
  Text,
  H2,
  Strong,
  Small,
  Muted,
  Kbd,
  Tabs,
  TabList,
  Tab,
  TabPanel,
  ProgressBar,
  useContentRect,
  useInput,
  useApp,
  useInterval,
  createTerm,
  type Key,
} from "../../src/index.js"
import { ExampleBanner, type ExampleMeta } from "../_banner.js"

export const meta: ExampleMeta = {
  name: "Dashboard",
  description: "Responsive multi-pane dashboard with live metrics and charts",
  demo: true,
  features: ["Box flexGrow", "useContentRect()", "responsive", "live data", "sparklines"],
}

// ============================================================================
// Sparkline
// ============================================================================

const SPARK_CHARS = "▁▂▃▄▅▆▇█"

function sparkline(values: number[], max: number): string {
  return values.map((v) => SPARK_CHARS[Math.round((v / max) * 7)] ?? SPARK_CHARS[0]).join("")
}

// ============================================================================
// Data Helpers
// ============================================================================

function jitter(base: number, range: number): number {
  return Math.max(0, Math.min(100, base + (Math.random() - 0.5) * range))
}

function initHistory(base: number, range: number, len: number): number[] {
  return Array.from({ length: len }, () => jitter(base, range))
}

function pushHistory(history: number[], value: number): number[] {
  const next = [...history]
  if (next.length >= 20) next.shift()
  next.push(value)
  return next
}

function severityColor(pct: number): string {
  if (pct > 80) return "$error"
  if (pct > 60) return "$warning"
  return "$success"
}

// ============================================================================
// State
// ============================================================================

interface CoreMetrics {
  usage: number
  history: number[]
}

interface MemoryMetrics {
  used: number
  cached: number
  buffers: number
  free: number
  swap: number
  swapTotal: number
  history: number[]
}

interface NetworkMetrics {
  downloadRate: number
  uploadRate: number
  downloadHistory: number[]
  uploadHistory: number[]
  connections: number
  packetsIn: number
  packetsOut: number
}

interface ProcessInfo {
  pid: number
  name: string
  cpu: number
  mem: number
  status: string
}

function createInitialState() {
  const cores: CoreMetrics[] = Array.from({ length: 8 }, (_, i) => ({
    usage: 20 + Math.random() * 60,
    history: initHistory(30 + i * 5, 20, 20),
  }))

  const memory: MemoryMetrics = {
    used: 8.2,
    cached: 3.1,
    buffers: 1.4,
    free: 3.3,
    swap: 0.8,
    swapTotal: 4.0,
    history: initHistory(55, 10, 20),
  }

  const network: NetworkMetrics = {
    downloadRate: 42.5,
    uploadRate: 12.3,
    downloadHistory: initHistory(40, 30, 20),
    uploadHistory: initHistory(12, 10, 20),
    connections: 147,
    packetsIn: 1842,
    packetsOut: 923,
  }

  const processes: ProcessInfo[] = [
    { pid: 1201, name: "node", cpu: 24.3, mem: 4.2, status: "running" },
    { pid: 892, name: "chrome", cpu: 18.7, mem: 12.1, status: "running" },
    { pid: 3456, name: "vscode", cpu: 12.1, mem: 8.4, status: "running" },
    { pid: 2103, name: "postgres", cpu: 8.9, mem: 3.7, status: "sleeping" },
    { pid: 4521, name: "docker", cpu: 6.2, mem: 5.1, status: "running" },
    { pid: 1893, name: "nginx", cpu: 3.4, mem: 1.2, status: "sleeping" },
    { pid: 7234, name: "redis", cpu: 2.1, mem: 0.8, status: "sleeping" },
    { pid: 5612, name: "bun", cpu: 1.8, mem: 2.3, status: "running" },
  ]

  return { cores, memory, network, processes }
}

function tickState(prev: ReturnType<typeof createInitialState>) {
  const cores = prev.cores.map((core) => {
    const usage = jitter(core.usage, 15)
    return { usage, history: pushHistory(core.history, usage) }
  })

  const totalMem = prev.memory.used + prev.memory.cached + prev.memory.buffers + prev.memory.free
  const usedJitter = (jitter((prev.memory.used / totalMem) * 100, 3) / 100) * totalMem
  const memory: MemoryMetrics = {
    ...prev.memory,
    used: Math.max(4, usedJitter),
    swap: (jitter((prev.memory.swap / prev.memory.swapTotal) * 100, 5) / 100) * prev.memory.swapTotal,
    history: pushHistory(prev.memory.history, (usedJitter / totalMem) * 100),
  }

  const downloadRate = jitter(prev.network.downloadRate, 20)
  const uploadRate = jitter(prev.network.uploadRate, 8)
  const network: NetworkMetrics = {
    downloadRate,
    uploadRate,
    downloadHistory: pushHistory(prev.network.downloadHistory, downloadRate),
    uploadHistory: pushHistory(prev.network.uploadHistory, uploadRate),
    connections: Math.max(50, Math.round(jitter(prev.network.connections, 20))),
    packetsIn: Math.max(100, Math.round(jitter(prev.network.packetsIn, 200))),
    packetsOut: Math.max(50, Math.round(jitter(prev.network.packetsOut, 100))),
  }

  const processes = prev.processes.map((p) => ({
    ...p,
    cpu: Math.max(0.1, jitter(p.cpu, 4)),
    mem: Math.max(0.1, jitter(p.mem, 1)),
  }))

  return { cores, memory, network, processes }
}

// ============================================================================
// Components
// ============================================================================

function SectionHeader({ children }: { children: React.ReactNode }) {
  return <H2>{children}</H2>
}

function LabelValue({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <Box gap={1}>
      <Muted>{label}</Muted>
      <Text color={color}>
        <Strong>{value}</Strong>
      </Text>
    </Box>
  )
}

// --- CPU Tab ---

function CpuCore({ index, core, barWidth }: { index: number; core: CoreMetrics; barWidth: number }) {
  const pct = Math.round(core.usage)
  const color = severityColor(pct)
  const filled = Math.round((pct / 100) * barWidth)
  const empty = barWidth - filled
  return (
    <Box>
      <Muted>{`${index} `}</Muted>
      <Text color={color}>{"█".repeat(filled)}</Text>
      <Text dimColor>{"░".repeat(empty)}</Text>
      <Text color={color}>
        <Strong>{` ${String(pct).padStart(3)}%`}</Strong>
      </Text>
      <Muted> </Muted>
      <Small>{sparkline(core.history.slice(-10), 100)}</Small>
    </Box>
  )
}

function CpuPane({ cores }: { cores: CoreMetrics[] }) {
  const { width } = useContentRect()
  const avgCpu = cores.reduce((sum, c) => sum + c.usage, 0) / cores.length
  const maxCpu = Math.max(...cores.map((c) => c.usage))
  const load1 = ((avgCpu / 100) * 8 * 0.8 + Math.random() * 0.5).toFixed(2)
  const load5 = ((avgCpu / 100) * 8 * 0.7 + Math.random() * 0.3).toFixed(2)
  const load15 = ((avgCpu / 100) * 8 * 0.6 + Math.random() * 0.2).toFixed(2)
  // 2 (core label) + bar + 5 (pct) + 1 (space) + 10 (sparkline) = need ~18 besides bar
  const barWidth = Math.max(8, width - 18)

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Box gap={2}>
        <SectionHeader>CPU</SectionHeader>
        <LabelValue label="Avg:" value={`${Math.round(avgCpu)}%`} color={severityColor(avgCpu)} />
        <LabelValue label="Max:" value={`${Math.round(maxCpu)}%`} color={severityColor(maxCpu)} />
        <LabelValue label="Load:" value={`${load1} ${load5} ${load15}`} />
      </Box>
      {cores.map((core, i) => (
        <CpuCore key={i} index={i} core={core} barWidth={barWidth} />
      ))}
    </Box>
  )
}

// --- Memory Tab ---

function StackedBar({ segments }: { segments: { value: number; color: string; char?: string }[] }) {
  return (
    <Box>
      {segments.map((seg, i) => (
        <Box key={i} flexGrow={Math.max(1, Math.round(seg.value * 100))}>
          <Text color={seg.color}>{(seg.char ?? "█").repeat(80)}</Text>
        </Box>
      ))}
    </Box>
  )
}

function MemoryPane({ memory }: { memory: MemoryMetrics }) {
  const total = memory.used + memory.cached + memory.buffers + memory.free
  const usedPct = (memory.used / total) * 100
  const swapPct = (memory.swap / memory.swapTotal) * 100

  return (
    <Box flexDirection="column" gap={1} flexGrow={1}>
      <SectionHeader>Memory</SectionHeader>
      <Box gap={2}>
        <LabelValue label="Total:" value={`${total.toFixed(1)} GB`} />
        <LabelValue label="Used:" value={`${memory.used.toFixed(1)} GB`} color={severityColor(usedPct)} />
      </Box>
      <Box flexDirection="column">
        <Muted>Memory Breakdown</Muted>
        <StackedBar
          segments={[
            { value: memory.used / total, color: severityColor(usedPct) },
            { value: memory.cached / total, color: "$info" },
            { value: memory.buffers / total, color: "$primary" },
            { value: memory.free / total, color: "$muted", char: "░" },
          ]}
        />
        <Box gap={2}>
          <Text color={severityColor(usedPct)}>
            {"█"} Used {memory.used.toFixed(1)}G
          </Text>
          <Text color="$info">
            {"█"} Cache {memory.cached.toFixed(1)}G
          </Text>
          <Text color="$primary">
            {"█"} Buf {memory.buffers.toFixed(1)}G
          </Text>
          <Muted>
            {"░"} Free {memory.free.toFixed(1)}G
          </Muted>
        </Box>
      </Box>
      <Box flexDirection="column">
        <Muted>
          Swap: {memory.swap.toFixed(1)}G / {memory.swapTotal.toFixed(1)}G
        </Muted>
        <ProgressBar value={swapPct / 100} color={severityColor(swapPct)} showPercentage />
      </Box>
      <Box flexDirection="column">
        <Muted>Top Consumers</Muted>
        <Box gap={2}>
          <Text>
            chrome <Strong color="$warning">12.1G</Strong>
          </Text>
          <Text>
            vscode <Strong color="$primary">8.4G</Strong>
          </Text>
          <Text>
            docker <Strong color="$primary">5.1G</Strong>
          </Text>
        </Box>
      </Box>
      <Box flexDirection="column">
        <Muted>History</Muted>
        <Text color="$primary">{sparkline(memory.history, 100)}</Text>
      </Box>
    </Box>
  )
}

// --- Network Tab ---

function NetworkPane({ network }: { network: NetworkMetrics }) {
  return (
    <Box flexDirection="column" gap={1} flexGrow={1}>
      <SectionHeader>Network</SectionHeader>
      <Box flexDirection="column">
        <Box justifyContent="space-between">
          <Text color="$success">
            {"↓"} Download: <Strong>{network.downloadRate.toFixed(1)} MB/s</Strong>
          </Text>
          <Small>{sparkline(network.downloadHistory, 100)}</Small>
        </Box>
        <ProgressBar value={network.downloadRate / 100} color="$success" showPercentage={false} />
      </Box>
      <Box flexDirection="column">
        <Box justifyContent="space-between">
          <Text color="$info">
            {"↑"} Upload: <Strong>{network.uploadRate.toFixed(1)} MB/s</Strong>
          </Text>
          <Small>{sparkline(network.uploadHistory, 40)}</Small>
        </Box>
        <ProgressBar value={network.uploadRate / 40} color="$info" showPercentage={false} />
      </Box>
      <Box borderStyle="round" borderColor="$border" paddingX={1} flexDirection="column">
        <Muted>Connection Stats</Muted>
        <Box gap={2}>
          <LabelValue label="Connections:" value={String(network.connections)} />
          <LabelValue label="Packets In:" value={String(network.packetsIn)} />
          <LabelValue label="Packets Out:" value={String(network.packetsOut)} />
        </Box>
        <Box gap={2}>
          <LabelValue label="Interface:" value="en0" />
          <LabelValue label="MTU:" value="1500" />
          <LabelValue label="Duplex:" value="full" />
        </Box>
      </Box>
    </Box>
  )
}

// --- Processes Tab ---

function ProcessRow({ proc, isTop }: { proc: ProcessInfo; isTop: boolean }) {
  const cpuColor = severityColor(proc.cpu)
  return (
    <Box gap={1}>
      <Text color="$muted">{String(proc.pid).padStart(5)}</Text>
      <Text bold={isTop}>{proc.name.padEnd(12)}</Text>
      <Text color={cpuColor}>{proc.cpu.toFixed(1).padStart(5)}%</Text>
      <Text color="$primary">{proc.mem.toFixed(1).padStart(5)}%</Text>
      <Text color={proc.status === "running" ? "$success" : "$muted"}>{proc.status}</Text>
    </Box>
  )
}

function ProcessPane({ processes }: { processes: ProcessInfo[] }) {
  const sorted = [...processes].sort((a, b) => b.cpu - a.cpu)

  return (
    <Box flexDirection="column" gap={1} flexGrow={1}>
      <SectionHeader>Processes</SectionHeader>
      <Box gap={1}>
        <Muted>{"  PID".padStart(5)}</Muted>
        <Muted>{"Name".padEnd(12)}</Muted>
        <Muted>{"  CPU".padStart(5)}</Muted>
        <Muted>{"  MEM".padStart(5)}</Muted>
        <Muted>Status</Muted>
      </Box>
      {sorted.map((proc, i) => (
        <ProcessRow key={proc.pid} proc={proc} isTop={i === 0} />
      ))}
      <Box gap={2} paddingTop={1}>
        <LabelValue label="Total:" value={`${processes.length} processes`} />
        <LabelValue
          label="Running:"
          value={String(processes.filter((p) => p.status === "running").length)}
          color="$success"
        />
        <LabelValue
          label="Sleeping:"
          value={String(processes.filter((p) => p.status === "sleeping").length)}
          color="$muted"
        />
      </Box>
    </Box>
  )
}

// --- Responsive Layout ---

function WideLayout({
  cores,
  memory,
  network,
  processes,
}: {
  cores: CoreMetrics[]
  memory: MemoryMetrics
  network: NetworkMetrics
  processes: ProcessInfo[]
}) {
  return (
    <Box flexDirection="column" flexGrow={1} gap={1}>
      <Box flexDirection="row" gap={1} flexGrow={1}>
        <Box flexGrow={1} borderStyle="round" borderColor="$border" paddingX={1} paddingY={1} flexDirection="column">
          <CpuPane cores={cores} />
        </Box>
        <Box flexGrow={1} borderStyle="round" borderColor="$border" paddingX={1} paddingY={1} flexDirection="column">
          <MemoryPane memory={memory} />
        </Box>
      </Box>
      <Box flexDirection="row" gap={1} flexGrow={1}>
        <Box flexGrow={1} borderStyle="round" borderColor="$border" paddingX={1} paddingY={1} flexDirection="column">
          <NetworkPane network={network} />
        </Box>
        <Box flexGrow={1} borderStyle="round" borderColor="$border" paddingX={1} paddingY={1} flexDirection="column">
          <ProcessPane processes={processes} />
        </Box>
      </Box>
    </Box>
  )
}

// ============================================================================
// Dashboard
// ============================================================================

export function Dashboard() {
  const { exit } = useApp()
  const { width } = useContentRect()
  const [state, setState] = useState(createInitialState)
  const [tick, setTick] = useState(0)
  const isWide = width > 100

  useInterval(() => {
    setState((prev) => tickState(prev))
    setTick((t) => t + 1)
  }, 500)

  useInput((input: string, key: Key) => {
    if (input === "q" || key.escape) exit()
  })

  if (isWide) {
    return (
      <Box flexDirection="column" flexGrow={1}>
        <Box justifyContent="space-between" paddingX={1}>
          <Text>
            <Strong>System Monitor</Strong> <Small>Tick #{tick}</Small>
          </Text>
          <Muted>Tick #{tick}</Muted>
        </Box>
        <WideLayout cores={state.cores} memory={state.memory} network={state.network} processes={state.processes} />
      </Box>
    )
  }

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Tabs defaultValue="cpu">
        <Box justifyContent="space-between" paddingX={1}>
          <TabList>
            <Tab value="cpu">CPU</Tab>
            <Tab value="memory">Memory</Tab>
            <Tab value="network">Network</Tab>
            <Tab value="processes">Processes</Tab>
          </TabList>
          <Small>Tick #{tick}</Small>
        </Box>

        <TabPanel value="cpu">
          <Box borderStyle="round" borderColor="$border" paddingX={1} paddingY={1} flexGrow={1}>
            <CpuPane cores={state.cores} />
          </Box>
        </TabPanel>
        <TabPanel value="memory">
          <Box borderStyle="round" borderColor="$border" paddingX={1} paddingY={1} flexGrow={1}>
            <MemoryPane memory={state.memory} />
          </Box>
        </TabPanel>
        <TabPanel value="network">
          <Box borderStyle="round" borderColor="$border" paddingX={1} paddingY={1} flexGrow={1}>
            <NetworkPane network={state.network} />
          </Box>
        </TabPanel>
        <TabPanel value="processes">
          <Box borderStyle="round" borderColor="$border" paddingX={1} paddingY={1} flexGrow={1}>
            <ProcessPane processes={state.processes} />
          </Box>
        </TabPanel>
      </Tabs>
    </Box>
  )
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  using term = createTerm()
  const { waitUntilExit } = await render(
    <ExampleBanner meta={meta} controls="h/l tabs  Esc/q quit">
      <Dashboard />
    </ExampleBanner>,
    term,
  )
  await waitUntilExit()
}

if (import.meta.main) {
  main().catch(console.error)
}
