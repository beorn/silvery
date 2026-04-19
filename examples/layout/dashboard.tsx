/**
 * Dashboard Example
 *
 * A btop-style responsive dashboard demonstrating:
 * - Multi-pane flexbox layout with round borders
 * - Live-updating metrics with sparklines and progress bars
 * - Responsive 2-column / tabbed layout via useBoxRect()
 * - Semantic theme colors with severity-based color coding
 * - Process table with sorting
 */

import React, { useState } from "react"
import {
  render,
  Box,
  Text,
  Muted,
  Tabs,
  TabList,
  Tab,
  TabPanel,
  useBoxRect,
  useInput,
  useApp,
  useInterval,
  createTerm,
  type Key,
} from "silvery"
import { ExampleBanner, type ExampleMeta } from "../_banner.js"

export const meta: ExampleMeta = {
  name: "Dashboard",
  description: "Responsive multi-pane dashboard with live metrics and charts",
  demo: true,
  features: ["Box flexGrow", "useBoxRect()", "responsive", "live data", "sparklines"],
}

// ============================================================================
// Sparkline
// ============================================================================

const SPARK_CHARS = "▁▂▃▄▅▆▇█"

function sparkline(values: number[]): string {
  return values.map((v) => SPARK_CHARS[Math.max(0, Math.min(7, v))] ?? SPARK_CHARS[0]).join("")
}

/** Fixed-width inline progress bar string: ████████░░░░ */
function miniBar(pct: number, width: number): string {
  const filled = Math.round((pct / 100) * width)
  return "█".repeat(filled) + "░".repeat(width - filled)
}

// ============================================================================
// Data Helpers
// ============================================================================

function jitter(base: number, range: number): number {
  return Math.max(0, Math.min(100, base + (Math.random() - 0.5) * range))
}

function pushHistory(history: number[], value: number, max = 20): number[] {
  const next = [...history]
  if (next.length >= max) next.shift()
  next.push(value)
  return next
}

function severityColor(pct: number): string {
  if (pct >= 80) return "$error"
  if (pct >= 60) return "$warning"
  return "$success"
}

function heatColor(temp: number): string {
  if (temp >= 75) return "$error"
  if (temp >= 60) return "$warning"
  return "$success"
}

// ============================================================================
// State
// ============================================================================

interface CoreRow {
  label: string
  pct: number
  freq: string
  temp: number
  mode: string
}

interface MemoryMetrics {
  ramUsed: number
  ramTotal: number
  cached: number
  free: number
  slab: number
  apps: number
  wired: number
  buffers: number
  dirty: number
  shared: number
  reclaim: number
  swapUsed: number
  swapTotal: number
  history: number[]
}

interface NetworkMetrics {
  dlRate: number
  dlPeak: number
  ulRate: number
  ulPeak: number
  connEst: number
  listen: number
  syn: number
  drops: number
  rxPps: string
  txPps: string
  retrans: string
  rtt: string
  dlHistory: number[]
  ulHistory: number[]
}

interface ProcessInfo {
  pid: number
  name: string
  cpu: number
  memp: number
  mem: string
  status: "Running" | "Sleep" | "I/O wait"
  time: string
  io: string
  thr: number
}

interface DashboardState {
  cores: CoreRow[]
  totalCpu: number
  userCpu: number
  sysCpu: number
  waitCpu: number
  load: [number, number, number]
  avgTemp: number
  tasks: number
  avgFreq: string
  ctxPerSec: string
  uptime: string
  pkgPct: number
  power: number
  fan: number
  boostOn: boolean
  cpuHistory: number[]
  memory: MemoryMetrics
  network: NetworkMetrics
  processes: ProcessInfo[]
}

function createInitialState(): DashboardState {
  const cores: CoreRow[] = [
    { label: "cpu00", pct: 12, freq: "3.62", temp: 39, mode: "idle" },
    { label: "cpu01", pct: 28, freq: "3.79", temp: 42, mode: "balanced" },
    { label: "cpu02", pct: 44, freq: "4.02", temp: 47, mode: "steady" },
    { label: "cpu03", pct: 57, freq: "4.18", temp: 53, mode: "steady" },
    { label: "cpu04", pct: 63, freq: "4.31", temp: 61, mode: "warm" },
    { label: "cpu05", pct: 71, freq: "4.47", temp: 68, mode: "boost" },
    { label: "cpu06", pct: 79, freq: "4.62", temp: 72, mode: "boost" },
    { label: "cpu07", pct: 83, freq: "4.84", temp: 75, mode: "boost" },
    { label: "cpu08", pct: 88, freq: "5.02", temp: 77, mode: "turbo" },
    { label: "cpu09", pct: 94, freq: "5.21", temp: 81, mode: "turbo" },
  ]

  const cpuHistory = [
    1, 2, 2, 3, 2, 4, 5, 4, 6, 5, 4, 6, 7, 6, 5, 6, 7, 6, 5, 4, 5, 6, 5, 7, 6, 5, 6, 7, 7, 6, 5, 4,
    5, 6, 5, 4,
  ]

  const memHistory = [4, 4, 5, 5, 4, 5, 6, 5, 5, 6, 6, 5, 6, 6, 7, 6, 6, 5, 6, 6, 5, 5, 6, 5]

  const memory: MemoryMetrics = {
    ramUsed: 23.7,
    ramTotal: 32.0,
    cached: 5.9,
    free: 2.4,
    slab: 1.1,
    apps: 17.4,
    wired: 1.8,
    buffers: 0.612,
    dirty: 0.212,
    shared: 1.3,
    reclaim: 0.8,
    swapUsed: 2.1,
    swapTotal: 8.0,
    history: memHistory,
  }

  const dlHistory = [1, 2, 3, 5, 4, 6, 5, 7, 6, 4, 3, 5, 6, 7, 5, 4, 6, 7, 6, 5, 4, 6, 5, 4]
  const ulHistory = [0, 1, 1, 2, 2, 3, 2, 4, 3, 2, 1, 2, 3, 4, 3, 2, 1, 2, 3, 2, 2, 3, 2, 1]

  const network: NetworkMetrics = {
    dlRate: 428,
    dlPeak: 612,
    ulRate: 86,
    ulPeak: 143,
    connEst: 184,
    listen: 23,
    syn: 2,
    drops: 0,
    rxPps: "61.2kpps",
    txPps: "19.4kpps",
    retrans: "0.08%",
    rtt: "18ms",
    dlHistory,
    ulHistory,
  }

  const processes: ProcessInfo[] = [
    {
      pid: 31842,
      name: "bun dev --hot src/server.ts",
      cpu: 94.2,
      memp: 3.8,
      mem: "1.22G",
      status: "Running",
      time: "01:42:17",
      io: "24M/s",
      thr: 18,
    },
    {
      pid: 27114,
      name: "node /usr/bin/vite --host",
      cpu: 71.4,
      memp: 2.2,
      mem: "716M",
      status: "Running",
      time: "00:18:09",
      io: "12M/s",
      thr: 26,
    },
    {
      pid: 918,
      name: "postgres: checkpointer",
      cpu: 12.8,
      memp: 1.4,
      mem: "448M",
      status: "Sleep",
      time: "19:22:41",
      io: "3.1M/s",
      thr: 27,
    },
    {
      pid: 1023,
      name: "Code Helper (Renderer)",
      cpu: 9.6,
      memp: 4.8,
      mem: "1.53G",
      status: "Sleep",
      time: "07:13:51",
      io: "1.2M/s",
      thr: 44,
    },
    {
      pid: 2241,
      name: "docker-desktop",
      cpu: 8.9,
      memp: 6.3,
      mem: "2.01G",
      status: "Running",
      time: "11:08:04",
      io: "9.4M/s",
      thr: 61,
    },
    {
      pid: 1542,
      name: "redis-server *:6379",
      cpu: 6.7,
      memp: 0.9,
      mem: "289M",
      status: "Sleep",
      time: "02:51:17",
      io: "642K/s",
      thr: 8,
    },
    {
      pid: 612,
      name: "tailscaled --tun=userspace-networking",
      cpu: 5.4,
      memp: 0.4,
      mem: "132M",
      status: "Sleep",
      time: "05:44:22",
      io: "218K/s",
      thr: 19,
    },
    {
      pid: 33210,
      name: "bun test --watch",
      cpu: 4.2,
      memp: 1.1,
      mem: "356M",
      status: "Running",
      time: "00:06:38",
      io: "4.6M/s",
      thr: 12,
    },
    {
      pid: 1804,
      name: "nginx: worker process",
      cpu: 3.7,
      memp: 0.2,
      mem: "72M",
      status: "Sleep",
      time: "03:17:09",
      io: "118K/s",
      thr: 5,
    },
    {
      pid: 2877,
      name: "Chrome Helper (GPU)",
      cpu: 3.2,
      memp: 2.7,
      mem: "864M",
      status: "Sleep",
      time: "06:29:33",
      io: "2.3M/s",
      thr: 23,
    },
    {
      pid: 451,
      name: "kernel_task",
      cpu: 2.8,
      memp: 0.1,
      mem: "42M",
      status: "Running",
      time: "22:54:48",
      io: "0",
      thr: 179,
    },
    {
      pid: 1942,
      name: "syncthing serve --no-browser",
      cpu: 2.1,
      memp: 0.8,
      mem: "258M",
      status: "Sleep",
      time: "14:05:14",
      io: "884K/s",
      thr: 16,
    },
    {
      pid: 7621,
      name: "python scripts/indexer.py --incremental",
      cpu: 1.9,
      memp: 1.9,
      mem: "604M",
      status: "I/O wait",
      time: "00:43:58",
      io: "14M/s",
      thr: 9,
    },
    {
      pid: 266,
      name: "systemd-journald",
      cpu: 1.2,
      memp: 0.1,
      mem: "38M",
      status: "Sleep",
      time: "09:12:44",
      io: "96K/s",
      thr: 3,
    },
    {
      pid: 74,
      name: "zsh - bun gen-mockup.ts",
      cpu: 0.2,
      memp: 0.0,
      mem: "6M",
      status: "Running",
      time: "00:00:03",
      io: "0",
      thr: 1,
    },
  ]

  return {
    cores,
    totalCpu: 67,
    userCpu: 38,
    sysCpu: 12,
    waitCpu: 14,
    load: [4.21, 3.88, 3.11],
    avgTemp: 71,
    tasks: 287,
    avgFreq: "4.31",
    ctxPerSec: "128k",
    uptime: "12d 06h",
    pkgPct: 67,
    power: 84,
    fan: 1460,
    boostOn: true,
    cpuHistory,
    memory,
    network,
    processes,
  }
}

function tickState(prev: DashboardState): DashboardState {
  const cores = prev.cores.map((core) => {
    const pct = Math.max(0, Math.min(100, Math.round(jitter(core.pct, 10))))
    return { ...core, pct }
  })

  const totalCpu = Math.round(jitter(prev.totalCpu, 8))
  const cpuHistory = pushHistory(
    prev.cpuHistory,
    Math.max(0, Math.min(7, Math.round(totalCpu / 14))),
    36,
  )

  const ramPct = Math.round((prev.memory.ramUsed / prev.memory.ramTotal) * 100)
  const memHistory = pushHistory(
    prev.memory.history,
    Math.max(0, Math.min(7, Math.round(ramPct / 14))),
    24,
  )
  const memory: MemoryMetrics = { ...prev.memory, history: memHistory }

  const dlVal = Math.max(0, Math.min(7, Math.round(jitter(5, 4))))
  const ulVal = Math.max(0, Math.min(7, Math.round(jitter(2, 3))))
  const dlHistory = pushHistory(prev.network.dlHistory, dlVal, 24)
  const ulHistory = pushHistory(prev.network.ulHistory, ulVal, 24)
  const network: NetworkMetrics = { ...prev.network, dlHistory, ulHistory }

  const processes = prev.processes.map((p) => ({
    ...p,
    cpu: Math.max(0, Number(jitter(p.cpu, 4).toFixed(1))),
  }))

  return { ...prev, cores, totalCpu, cpuHistory, memory, network, processes }
}

// ============================================================================
// Shared Components
// ============================================================================

function Sep() {
  return <Muted>{"┄".repeat(50)}</Muted>
}

function LR({ children }: { children: React.ReactNode }) {
  return (
    <Box justifyContent="space-between" wrap="truncate">
      {children}
    </Box>
  )
}

/** Label-value pair: `Label value` with muted label */
function LV({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <Box gap={1}>
      <Muted>{label}</Muted>
      <Text color={color}>{`${value}`}</Text>
    </Box>
  )
}

// ============================================================================
// CPU Panel
// ============================================================================

function CpuSummary({ state }: { state: DashboardState }) {
  return (
    <>
      <LR>
        <Box gap={1} wrap="truncate">
          <Muted>Total</Muted>
          <Text color={severityColor(state.totalCpu)}>{`${state.totalCpu}%`}</Text>
          <Text color={severityColor(state.totalCpu)}>{miniBar(state.totalCpu, 24)}</Text>
        </Box>
        <Box gap={2} wrap="truncate">
          <LV
            label="Load"
            value={`${state.load[0].toFixed(2)} ${state.load[1].toFixed(2)} ${state.load[2].toFixed(2)}`}
          />
          <LV label="Temp" value={`${state.avgTemp}\u00B0C`} color={heatColor(state.avgTemp)} />
          <LV label="Tasks" value={state.tasks} />
        </Box>
      </LR>
      <LR>
        <Box gap={2} wrap="truncate">
          <LV label="User" value={`${state.userCpu}%`} color={severityColor(state.userCpu)} />
          <LV label="Sys" value={`${state.sysCpu}%`} color={severityColor(state.sysCpu)} />
          <LV label="Wait" value={`${state.waitCpu}%`} color={severityColor(state.waitCpu)} />
        </Box>
        <Box gap={2} wrap="truncate">
          <LV label="Avg" value={`${state.avgFreq}GHz`} />
          <LV label="Ctx/s" value={state.ctxPerSec} />
          <LV label="Uptime" value={state.uptime} />
        </Box>
      </LR>
    </>
  )
}

function CpuCore({ core }: { core: CoreRow }) {
  return (
    <LR>
      <Box gap={1} wrap="truncate">
        <Muted>{core.label}</Muted>
        <Text color={severityColor(core.pct)}>{`${core.pct}%`.padStart(4)}</Text>
        <Text color={severityColor(core.pct)}>{miniBar(core.pct, 24)}</Text>
        <Muted>{`${core.freq}GHz`}</Muted>
      </Box>
      <Box gap={2} wrap="truncate">
        <Box gap={1}>
          <Muted>temp</Muted>
          <Text color={heatColor(core.temp)}>{`${core.temp}\u00B0C`}</Text>
        </Box>
        <Text color={severityColor(core.pct)}>{core.mode}</Text>
      </Box>
    </LR>
  )
}

function CpuFooter({ state }: { state: DashboardState }) {
  return (
    <>
      <LR>
        <Box gap={1} wrap="truncate">
          <Muted>Pkg</Muted>
          <Text color={severityColor(state.pkgPct)}>{`${state.pkgPct}%`}</Text>
          <Text color={severityColor(state.pkgPct)}>{miniBar(state.pkgPct, 24)}</Text>
        </Box>
        <Box gap={2} wrap="truncate">
          <LV label="Power" value={`${state.power}W`} />
          <LV label="Fan" value={`${state.fan}RPM`} />
          <LV label="Boost" value="on" color="$success" />
        </Box>
      </LR>
      <LR>
        <Box gap={1} wrap="truncate">
          <Muted>History</Muted>
          <Text color="$primary">{sparkline(state.cpuHistory)}</Text>
        </Box>
        <Muted>60s</Muted>
      </LR>
    </>
  )
}

function CpuPanel({ state }: { state: DashboardState }) {
  return (
    <Box flexDirection="column" flexGrow={1}>
      <CpuSummary state={state} />
      <Sep />
      {state.cores.map((core) => (
        <CpuCore key={core.label} core={core} />
      ))}
      <Sep />
      <CpuFooter state={state} />
    </Box>
  )
}

// ============================================================================
// Memory Panel
// ============================================================================

function MemoryPanel({ memory }: { memory: MemoryMetrics }) {
  const ramPct = Math.round((memory.ramUsed / memory.ramTotal) * 100)
  const swapPct = Math.round((memory.swapUsed / memory.swapTotal) * 100)
  const avail = (memory.ramTotal - memory.ramUsed).toFixed(1)

  return (
    <Box flexDirection="column" flexGrow={1}>
      <LR>
        <Box wrap="truncate">
          <Muted>{"RAM "}</Muted>
          <Text>{`${memory.ramUsed.toFixed(1)} / ${memory.ramTotal.toFixed(1)} GiB `}</Text>
          <Text color={severityColor(ramPct)}>{`${ramPct}% `}</Text>
          <Text color={severityColor(ramPct)}>{miniBar(ramPct, 12)}</Text>
        </Box>
        <Box gap={1} wrap="truncate">
          <Muted>avail</Muted>
          <Text>{`${avail}G`}</Text>
        </Box>
      </LR>
      <LR>
        <Box gap={2} wrap="truncate">
          <LV label="Used" value={`${memory.ramUsed.toFixed(1)}G`} />
          <LV label="Cache" value={`${memory.cached.toFixed(1)}G`} />
        </Box>
        <Box gap={2} wrap="truncate">
          <LV label="Free" value={`${memory.free.toFixed(1)}G`} />
          <LV label="Slab" value={`${memory.slab.toFixed(1)}G`} />
        </Box>
      </LR>
      <LR>
        <Box wrap="truncate">
          <Muted>{"Swap "}</Muted>
          <Text>{`${memory.swapUsed.toFixed(1)} / ${memory.swapTotal.toFixed(1)} GiB `}</Text>
          <Text color={severityColor(swapPct)}>{`${swapPct}% `}</Text>
          <Text color={severityColor(swapPct)}>{miniBar(swapPct, 12)}</Text>
        </Box>
        <Box gap={1} wrap="truncate">
          <Muted>zram</Muted>
          <Text>off</Text>
        </Box>
      </LR>
      <Sep />
      <LR>
        <Box gap={2} wrap="truncate">
          <LV label="Apps" value={`${memory.apps.toFixed(1)}G`} />
          <LV label="Wired" value={`${memory.wired.toFixed(1)}G`} />
        </Box>
        <LV label="Buffers" value="612M" />
      </LR>
      <LR>
        <Box gap={2} wrap="truncate">
          <LV label="Dirty" value="212M" />
          <LV label="Shared" value={`${memory.shared.toFixed(1)}G`} />
        </Box>
        <LV label="Reclaim" value={`${memory.reclaim.toFixed(1)}G`} />
      </LR>
      <LR>
        <Box gap={1} wrap="truncate">
          <Muted>Trend</Muted>
          <Text color="$primary">{sparkline(memory.history)}</Text>
        </Box>
        <Muted>30m</Muted>
      </LR>
    </Box>
  )
}

// ============================================================================
// Network Panel
// ============================================================================

function NetworkPanel({ network }: { network: NetworkMetrics }) {
  const dlPct = Math.round((network.dlRate / 630) * 100)
  const ulPct = Math.round((network.ulRate / 400) * 100)

  return (
    <Box flexDirection="column" flexGrow={1}>
      <LR>
        <Box wrap="truncate">
          <Muted>{"DL "}</Muted>
          <Text>{`${network.dlRate} Mb/s `}</Text>
          <Text color={severityColor(dlPct)}>{`${dlPct}% `}</Text>
          <Text color={severityColor(dlPct)}>{miniBar(dlPct, 12)}</Text>
        </Box>
        <Box gap={1} wrap="truncate">
          <Muted>peak</Muted>
          <Text>{`${network.dlPeak}`}</Text>
        </Box>
      </LR>
      <LR>
        <Box wrap="truncate">
          <Muted>{"UL "}</Muted>
          <Text color="$info">{`${network.ulRate} Mb/s `}</Text>
          <Text color="$info">{`${ulPct}% `}</Text>
          <Text color="$info">{miniBar(ulPct, 12)}</Text>
        </Box>
        <Box gap={1} wrap="truncate">
          <Muted>peak</Muted>
          <Text>{`${network.ulPeak}`}</Text>
        </Box>
      </LR>
      <Sep />
      <LR>
        <Box gap={2} wrap="truncate">
          <LV label="Conn" value={`${network.connEst} est`} />
          <LV label="Listen" value={network.listen} />
        </Box>
        <Box gap={2} wrap="truncate">
          <LV label="SYN" value={network.syn} />
          <LV label="Drops" value={network.drops} />
        </Box>
      </LR>
      <LR>
        <Box gap={2} wrap="truncate">
          <LV label="Rx" value={network.rxPps} />
          <LV label="Tx" value={network.txPps} />
        </Box>
        <Box gap={2} wrap="truncate">
          <LV label="Retrans" value={network.retrans} />
          <LV label="RTT" value={network.rtt} />
        </Box>
      </LR>
      <LR>
        <Box gap={1} wrap="truncate">
          <Muted>DL</Muted>
          <Text color="$primary">{sparkline(network.dlHistory)}</Text>
        </Box>
        <Muted>60s</Muted>
      </LR>
      <LR>
        <Box gap={1} wrap="truncate">
          <Muted>UL</Muted>
          <Text color="$info">{sparkline(network.ulHistory)}</Text>
        </Box>
        <Muted>60s</Muted>
      </LR>
    </Box>
  )
}

// ============================================================================
// Process Table
// ============================================================================

const COL = { pid: 6, name: 62, cpu: 6, memp: 6, mem: 9, status: 10, time: 10, io: 11, thr: 5 }

function statusColor(status: ProcessInfo["status"]): string | undefined {
  switch (status) {
    case "Running":
      return "$success"
    case "I/O wait":
      return "$warning"
    case "Sleep":
    default:
      return "$muted"
  }
}

function ProcessHeader() {
  return (
    <Box wrap="clip">
      <Muted>{`${"PID".padStart(COL.pid)} `}</Muted>
      <Muted>{`${"NAME".padEnd(COL.name)} `}</Muted>
      <Text bold color="$primary">{`${"CPU%\u2193".padStart(COL.cpu)} `}</Text>
      <Muted>{`${"MEM%".padStart(COL.memp)} `}</Muted>
      <Muted>{`${"MEM".padStart(COL.mem)} `}</Muted>
      <Muted>{`${"STATUS".padEnd(COL.status)} `}</Muted>
      <Muted>{`${"TIME".padStart(COL.time)} `}</Muted>
      <Muted>{`${"IO".padStart(COL.io)} `}</Muted>
      <Muted>{`${"THR".padStart(COL.thr)}`}</Muted>
    </Box>
  )
}

function ProcessRow({ proc, isTop }: { proc: ProcessInfo; isTop: boolean }) {
  const cpuColor = severityColor(proc.cpu)
  const ioColor = proc.io === "0" ? "$muted" : "$primary"

  return (
    <Box wrap="clip">
      <Text>{`${String(proc.pid).padStart(COL.pid)} `}</Text>
      <Text bold={isTop}>{`${proc.name.padEnd(COL.name).slice(0, COL.name)} `}</Text>
      <Text bold={isTop} color={cpuColor}>{`${proc.cpu.toFixed(1).padStart(5)}% `}</Text>
      <Text color={severityColor(proc.memp * 10)}>{`${proc.memp.toFixed(1).padStart(5)}% `}</Text>
      <Text>{`${proc.mem.padStart(COL.mem)} `}</Text>
      <Text color={statusColor(proc.status)}>{`${proc.status.padEnd(COL.status)} `}</Text>
      <Text>{`${proc.time.padStart(COL.time)} `}</Text>
      <Text color={ioColor}>{`${proc.io.padStart(COL.io)} `}</Text>
      <Text>{`${String(proc.thr).padStart(COL.thr)}`}</Text>
    </Box>
  )
}

function ProcessFooter({ processes, state }: { processes: ProcessInfo[]; state: DashboardState }) {
  const running = processes.filter((p) => p.status === "Running").length
  const iowait = processes.filter((p) => p.status === "I/O wait").length
  const sleeping = 184 - running - iowait
  const ramPct = Math.round((state.memory.ramUsed / state.memory.ramTotal) * 100)

  return (
    <LR>
      <Box gap={2} wrap="truncate">
        <Muted>184 processes</Muted>
        <Text color="$success">{`${running} running`}</Text>
        <Muted>{`${sleeping} sleeping`}</Muted>
        <Text color="$warning">{`${iowait} iowait`}</Text>
      </Box>
      <Box gap={2} wrap="truncate">
        <LV label="Threads" value="1,942" />
        <LV label="CPU" value={`${state.totalCpu}%`} color={severityColor(state.totalCpu)} />
        <LV label="MEM" value={`${ramPct}%`} color={severityColor(ramPct)} />
        <Text color="$primary">{`428\u2193`}</Text>
        <Text color="$info">{`86\u2191`}</Text>
      </Box>
    </LR>
  )
}

function ProcessPanel({ state }: { state: DashboardState }) {
  const sorted = [...state.processes].sort((a, b) => b.cpu - a.cpu)

  return (
    <Box flexDirection="column" flexGrow={1}>
      <ProcessHeader />
      <Sep />
      {sorted.map((proc, i) => (
        <ProcessRow key={proc.pid} proc={proc} isTop={i === 0} />
      ))}
      <Sep />
      <ProcessFooter processes={state.processes} state={state} />
    </Box>
  )
}

// ============================================================================
// Layouts
// ============================================================================

/** Panel with titled first row inside standard border */
function Panel({
  title,
  subtitle,
  children,
  flexGrow,
  flexBasis,
}: {
  title: string
  subtitle?: string
  children: React.ReactNode
  flexGrow?: number
  flexBasis?: number
}) {
  return (
    <Box
      borderStyle="round"
      borderColor="$primary"
      paddingX={1}
      flexDirection="column"
      flexGrow={flexGrow}
      flexBasis={flexBasis}
    >
      <LR>
        <Text bold color="$primary">
          {` ${title} `}
        </Text>
        {subtitle && <Muted>{` ${subtitle} `}</Muted>}
      </LR>
      {children}
    </Box>
  )
}

function WideLayout({ state }: { state: DashboardState }) {
  return (
    <Box flexDirection="column" flexGrow={1}>
      {/* Top row: CPU (left ~60%) | Memory + Network stacked (right ~40%) */}
      <Box flexDirection="row" gap={1}>
        <Panel title="CPU / Compute" subtitle="10 logical" flexGrow={3} flexBasis={0}>
          <CpuPanel state={state} />
        </Panel>
        <Box flexDirection="column" flexGrow={2} flexBasis={0}>
          <Panel title="Memory" subtitle={`${state.memory.ramTotal.toFixed(0)} GiB`}>
            <MemoryPanel memory={state.memory} />
          </Panel>
          <Panel title="Network" subtitle="en0 • wifi6">
            <NetworkPanel network={state.network} />
          </Panel>
        </Box>
      </Box>
      {/* Bottom: Process table (full width) */}
      <Panel title="Processes" subtitle="sorted by CPU%">
        <ProcessPanel state={state} />
      </Panel>
    </Box>
  )
}

function NarrowLayout({ state }: { state: DashboardState }) {
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
          <Panel title="CPU / Compute" subtitle="10 logical">
            <CpuPanel state={state} />
          </Panel>
        </TabPanel>
        <TabPanel value="memory">
          <Panel title="Memory" subtitle={`${state.memory.ramTotal.toFixed(0)} GiB`}>
            <MemoryPanel memory={state.memory} />
          </Panel>
        </TabPanel>
        <TabPanel value="network">
          <Panel title="Network" subtitle="en0 • wifi6">
            <NetworkPanel network={state.network} />
          </Panel>
        </TabPanel>
        <TabPanel value="processes">
          <Panel title="Processes" subtitle="sorted by CPU%">
            <ProcessPanel state={state} />
          </Panel>
        </TabPanel>
      </Tabs>
    </Box>
  )
}

// ============================================================================
// Dashboard
// ============================================================================

export function Dashboard({ static: isStatic }: { static?: boolean } = {}) {
  const { exit } = useApp()
  const { width } = useBoxRect()
  const [state, setState] = useState(createInitialState)
  // Process table needs ~135 cols; below that switch to tabbed layout
  const isNarrow = width > 0 && width < 130

  useInterval(() => setState((prev) => tickState(prev)), 500, !isStatic)

  useInput((input: string, key: Key) => {
    if (input === "q" || key.escape) exit()
  })

  if (isNarrow) {
    return <NarrowLayout state={state} />
  }

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Box wrap="truncate">
        <Text bold color="$primary">
          Silvery TUI
        </Text>
        <Muted>{" system monitor showcase "}</Muted>
        <Text color="$primary">devbox-01</Text>
        <Muted>{"┄".repeat(19)}</Muted>
        <Muted>14:27 UTC [h]help [1]cpu [2]mem [3]net [p]proc [/]filter [q]quit</Muted>
      </Box>
      <WideLayout state={state} />
    </Box>
  )
}

// ============================================================================
// Main
// ============================================================================

export async function main() {
  using term = createTerm()
  const { waitUntilExit } = await render(
    <ExampleBanner meta={meta} controls="h/l tabs  Esc/q quit">
      <Dashboard />
    </ExampleBanner>,
    term,
  )
  await waitUntilExit()
}
