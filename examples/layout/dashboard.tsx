/**
 * Dashboard Example
 *
 * A btop-style responsive dashboard demonstrating:
 * - Multi-pane flexbox layout with round borders
 * - Live-updating metrics with sparklines and progress bars
 * - Responsive 2-column / tabbed layout via useContentRect()
 * - Semantic theme colors with severity-based color coding
 * - Process table with sorting
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

function initHistory(base: number, range: number, len: number = 20): number[] {
  return Array.from({ length: len }, () => jitter(base, range))
}

function pushHistory(history: number[], value: number): number[] {
  const next = [...history]
  if (next.length >= 20) next.shift()
  next.push(value)
  return next
}

function severityColor(pct: number): string {
  if (pct >= 80) return "$error"
  if (pct >= 60) return "$warning"
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
  memMB: number
  status: string
  time: string
}

function createInitialState() {
  const coreUsages = [72, 45, 88, 35, 61, 93, 28, 52]
  const cores: CoreMetrics[] = coreUsages.map((usage) => ({
    usage,
    history: initHistory(usage, 15, 20),
  }))

  const memory: MemoryMetrics = {
    used: 22.7,
    cached: 6.8,
    buffers: 1.2,
    free: 9.3,
    swap: 5.76,
    swapTotal: 32.0,
    history: initHistory(71, 10, 20),
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
    { pid: 1201, name: "node", cpu: 24.3, mem: 4.2, memMB: 1344, status: "running", time: "2:14:33" },
    { pid: 892, name: "chrome", cpu: 18.7, mem: 12.1, memMB: 3872, status: "running", time: "5:42:11" },
    { pid: 3456, name: "vscode", cpu: 12.1, mem: 8.4, memMB: 2688, status: "running", time: "3:21:05" },
    { pid: 2103, name: "postgres", cpu: 8.9, mem: 3.7, memMB: 1184, status: "sleeping", time: "12:05:44" },
    { pid: 4521, name: "docker", cpu: 6.2, mem: 5.1, memMB: 1632, status: "running", time: "8:33:22" },
    { pid: 1893, name: "nginx", cpu: 3.4, mem: 1.2, memMB: 384, status: "sleeping", time: "24:11:03" },
    { pid: 7234, name: "redis", cpu: 2.1, mem: 0.8, memMB: 256, status: "sleeping", time: "24:10:59" },
    { pid: 5612, name: "bun", cpu: 1.8, mem: 2.3, memMB: 736, status: "running", time: "0:45:12" },
    { pid: 3891, name: "webpack", cpu: 1.5, mem: 1.9, memMB: 608, status: "running", time: "0:32:41" },
    { pid: 6742, name: "eslint", cpu: 0.9, mem: 0.6, memMB: 192, status: "sleeping", time: "0:12:08" },
    { pid: 8123, name: "ssh-agent", cpu: 0.3, mem: 0.1, memMB: 32, status: "sleeping", time: "24:11:03" },
    { pid: 9001, name: "cron", cpu: 0.1, mem: 0.2, memMB: 64, status: "sleeping", time: "24:11:03" },
    { pid: 4102, name: "gpg-agent", cpu: 0.1, mem: 0.1, memMB: 32, status: "sleeping", time: "24:11:03" },
    { pid: 7801, name: "fswatch", cpu: 0.2, mem: 0.3, memMB: 96, status: "running", time: "3:14:22" },
    { pid: 2045, name: "dnsmasq", cpu: 0.0, mem: 0.1, memMB: 32, status: "sleeping", time: "24:11:03" },
    { pid: 6234, name: "tmux", cpu: 0.4, mem: 0.5, memMB: 160, status: "running", time: "12:05:44" },
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
    cpu: Math.max(0.0, jitter(p.cpu, 4)),
    mem: Math.max(0.1, jitter(p.mem, 1)),
  }))

  return { cores, memory, network, processes }
}

// ============================================================================
// Shared Components
// ============================================================================

function Sep() {
  return <Muted>{"┄".repeat(50)}</Muted>
}

function LabelValue({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <Box gap={1}>
      <Muted>{label}</Muted>
      <Text color={color}>{value}</Text>
    </Box>
  )
}

// ============================================================================
// CPU Panel
// ============================================================================

function CpuCore({ index, core }: { index: number; core: CoreMetrics }) {
  const pct = Math.round(core.usage)
  const color = severityColor(pct)
  return (
    <Box wrap="truncate">
      <Text color="$muted">{`C${index}`.padEnd(4)}</Text>
      <Box flexGrow={1}>
        <ProgressBar value={pct / 100} color={color} showPercentage />
      </Box>
    </Box>
  )
}

function CpuPanel({ cores }: { cores: CoreMetrics[] }) {
  const avgCpu = cores.reduce((sum, c) => sum + c.usage, 0) / cores.length
  const maxCpu = Math.max(...cores.map((c) => c.usage))
  const load1 = ((avgCpu / 100) * 8 * 0.8 + Math.random() * 0.5).toFixed(2)
  const load5 = ((avgCpu / 100) * 8 * 0.7 + Math.random() * 0.3).toFixed(2)
  const load15 = ((avgCpu / 100) * 8 * 0.6 + Math.random() * 0.2).toFixed(2)
  const avgHistory =
    cores[0]?.history.map((_, i) => cores.reduce((s, c) => s + (c.history[i] ?? 0), 0) / cores.length) ?? []

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Box gap={2} wrap="truncate">
        <Text bold color="$primary">CPU</Text>
        <LabelValue label="Avg:" value={`${Math.round(avgCpu)}%`} color={severityColor(avgCpu)} />
        <LabelValue label="Max:" value={`${Math.round(maxCpu)}%`} color={severityColor(maxCpu)} />
        <LabelValue label="Load:" value={`${load1} ${load5} ${load15}`} />
      </Box>
      <Sep />
      <Box flexDirection="column">
        {cores.map((core, i) => (
          <CpuCore key={i} index={i} core={core} />
        ))}
      </Box>
      <Sep />
      <Box gap={1} wrap="truncate">
        <Muted>Avg CPU:</Muted>
        <Text color={severityColor(avgCpu)}>{sparkline(avgHistory, 100)}</Text>
      </Box>
      <Box gap={2} wrap="truncate">
        <LabelValue label="Freq:" value="4.5GHz" />
        <LabelValue label="Temp:" value="72°C" color={severityColor(72)} />
        <LabelValue label="Uptime:" value="3d 14h" />
      </Box>
    </Box>
  )
}

// ============================================================================
// Memory Panel
// ============================================================================

function MemoryPanel({ memory }: { memory: MemoryMetrics }) {
  const total = memory.used + memory.cached + memory.buffers + memory.free
  const usedPct = (memory.used / total) * 100
  const swapPct = (memory.swap / memory.swapTotal) * 100

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Box gap={2} wrap="truncate">
        <Text bold color="$primary">Memory</Text>
        <Text>{memory.used.toFixed(1)} / {total.toFixed(1)} GiB</Text>
      </Box>
      <Sep />
      <Box wrap="truncate">
        <Text color="$muted">{"RAM  "}</Text>
        <Box flexGrow={1}>
          <ProgressBar value={usedPct / 100} color={severityColor(usedPct)} showPercentage />
        </Box>
      </Box>
      <Box wrap="truncate">
        <Text color="$muted">{"Swap "}</Text>
        <Box flexGrow={1}>
          <ProgressBar value={swapPct / 100} color={severityColor(swapPct)} showPercentage />
        </Box>
      </Box>
      <Sep />
      <Box gap={2} wrap="truncate">
        <Text color="$warning">Used {memory.used.toFixed(1)}G</Text>
        <Text color="$info">Cache {memory.cached.toFixed(1)}G</Text>
        <Text color="$primary">Buf {memory.buffers.toFixed(1)}G</Text>
        <Muted>Free {memory.free.toFixed(1)}G</Muted>
      </Box>
      <Box gap={1} wrap="truncate">
        <Muted>History:</Muted>
        <Text color={severityColor(usedPct)}>{sparkline(memory.history, 100)}</Text>
      </Box>
    </Box>
  )
}

// ============================================================================
// Network Panel
// ============================================================================

function NetworkPanel({ network }: { network: NetworkMetrics }) {
  return (
    <Box flexDirection="column" flexGrow={1}>
      <Box gap={2} wrap="truncate">
        <Text bold color="$primary">Network</Text>
        <Muted>en0 / 1 Gbps</Muted>
      </Box>
      <Sep />
      <Box wrap="truncate">
        <Text color="$success">{"↓ DL "}</Text>
        <Box flexGrow={1}>
          <ProgressBar value={Math.min(1, network.downloadRate / 100)} color="$success" showPercentage={false} />
        </Box>
        <Text color="$success">{" "}{network.downloadRate.toFixed(1).padStart(5)} MB/s</Text>
      </Box>
      <Box wrap="truncate">
        <Text color="$info">{"↑ UL "}</Text>
        <Box flexGrow={1}>
          <ProgressBar value={Math.min(1, network.uploadRate / 40)} color="$info" showPercentage={false} />
        </Box>
        <Text color="$info">{" "}{network.uploadRate.toFixed(1).padStart(5)} MB/s</Text>
      </Box>
      <Box gap={2} wrap="truncate">
        <LabelValue label="Active:" value={String(network.connections)} />
        <LabelValue label="In:" value={`${network.packetsIn} pkts`} />
        <LabelValue label="Out:" value={`${network.packetsOut} pkts`} />
      </Box>
    </Box>
  )
}

// ============================================================================
// Process Table
// ============================================================================

const COL = { pid: 7, name: 14, cpu: 7, mem: 7, memMB: 9, status: 10, time: 10 }

function ProcessRow({ proc, isTop }: { proc: ProcessInfo; isTop: boolean }) {
  const cpuColor = severityColor(proc.cpu)
  return (
    <Box wrap="truncate">
      <Text color="$muted">{String(proc.pid).padStart(COL.pid)}</Text>
      <Text bold={isTop}>{("  " + proc.name).padEnd(COL.name)}</Text>
      <Text color={cpuColor}>{(proc.cpu.toFixed(1) + "%").padStart(COL.cpu)}</Text>
      <Text>{(proc.mem.toFixed(1) + "%").padStart(COL.mem)}</Text>
      <Text>{(proc.memMB + " MB").padStart(COL.memMB)}</Text>
      <Text color={proc.status === "running" ? "$success" : "$muted"}>{"  " + proc.status.padEnd(COL.status - 2)}</Text>
      <Text color="$muted">{proc.time.padStart(COL.time)}</Text>
    </Box>
  )
}

function ProcessPanel({ processes }: { processes: ProcessInfo[] }) {
  const sorted = [...processes].sort((a, b) => b.cpu - a.cpu)
  const running = processes.filter((p) => p.status === "running").length
  const sleeping = processes.filter((p) => p.status === "sleeping").length

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Box justifyContent="space-between" wrap="truncate">
        <Text bold color="$primary">Processes</Text>
        <Box gap={2}>
          <Muted>Sort: CPU%▼</Muted>
          <Muted>Total: {processes.length}</Muted>
        </Box>
      </Box>
      <Sep />
      <Box wrap="truncate">
        <Muted>
          {"PID".padStart(COL.pid)}
          {"  Name".padEnd(COL.name)}
          {"CPU%".padStart(COL.cpu)}
          {"MEM%".padStart(COL.mem)}
          {"MEM".padStart(COL.memMB)}
          {"  STATUS".padEnd(COL.status)}
          {"TIME+".padStart(COL.time)}
        </Muted>
      </Box>
      <Sep />
      <Box flexDirection="column" flexGrow={1}>
        {sorted.map((proc, i) => (
          <ProcessRow key={proc.pid} proc={proc} isTop={i === 0} />
        ))}
      </Box>
      <Box gap={2} wrap="truncate">
        <LabelValue label="Total:" value={`${processes.length}`} />
        <LabelValue label="Running:" value={String(running)} color="$success" />
        <LabelValue label="Sleeping:" value={String(sleeping)} color="$muted" />
      </Box>
    </Box>
  )
}

// ============================================================================
// Layouts
// ============================================================================

const pane = {
  borderStyle: "round" as const,
  borderColor: "$primary",
  paddingX: 1,
  paddingY: 0,
  flexDirection: "column" as const,
}

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
    <Box flexDirection="column" flexGrow={1}>
      {/* Top row: CPU (65%) | Memory + Network stacked (35%) */}
      <Box flexDirection="row">
        <Box {...pane} flexGrow={3} flexBasis={0}>
          <CpuPanel cores={cores} />
        </Box>
        <Box flexDirection="column" flexGrow={2} flexBasis={0}>
          <Box {...pane} flexGrow={1}>
            <MemoryPanel memory={memory} />
          </Box>
          <Box {...pane} flexGrow={1}>
            <NetworkPanel network={network} />
          </Box>
        </Box>
      </Box>
      {/* Bottom: Process table (full width, fills remaining space) */}
      <Box {...pane} flexGrow={1}>
        <ProcessPanel processes={processes} />
      </Box>
    </Box>
  )
}

function NarrowLayout({
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
    <Box flexDirection="column" flexGrow={1}>
      <Tabs defaultValue="cpu">
        <Box justifyContent="space-between" paddingX={1}>
          <TabList>
            <Tab value="cpu">CPU</Tab>
            <Tab value="memory">Memory</Tab>
            <Tab value="network">Network</Tab>
            <Tab value="processes">Processes</Tab>
          </TabList>
        </Box>

        <TabPanel value="cpu">
          <Box {...pane} paddingY={1} flexGrow={1}>
            <CpuPanel cores={cores} />
          </Box>
        </TabPanel>
        <TabPanel value="memory">
          <Box {...pane} paddingY={1} flexGrow={1}>
            <MemoryPanel memory={memory} />
          </Box>
        </TabPanel>
        <TabPanel value="network">
          <Box {...pane} paddingY={1} flexGrow={1}>
            <NetworkPanel network={network} />
          </Box>
        </TabPanel>
        <TabPanel value="processes">
          <Box {...pane} paddingY={1} flexGrow={1}>
            <ProcessPanel processes={processes} />
          </Box>
        </TabPanel>
      </Tabs>
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
  const isNarrow = width > 0 && width < 100

  useInterval(() => {
    setState((prev) => tickState(prev))
  }, 500)

  useInput((input: string, key: Key) => {
    if (input === "q" || key.escape) exit()
  })

  if (isNarrow) {
    return (
      <NarrowLayout
        cores={state.cores}
        memory={state.memory}
        network={state.network}
        processes={state.processes}
      />
    )
  }

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Box paddingX={1} justifyContent="space-between" wrap="truncate">
        <Text bold color="$primary">System Monitor</Text>
        <Muted>↑↓ scroll  F1 help  F5 tree  F6 sort  q quit</Muted>
      </Box>
      <WideLayout cores={state.cores} memory={state.memory} network={state.network} processes={state.processes} />
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
