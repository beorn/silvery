/**
 * DataExplorerShowcase — lazygit-inspired sortable process table
 *
 * Live CPU jitter, row selection, status indicators, and mini bar charts.
 */

import React, { useState, useEffect } from "react"
import { Box, Text } from "@silvery/term/xterm/index.ts"
import { useInput, KeyHints } from "./shared.js"

// --- Types ---

interface ProcessRow {
  id: string
  name: string
  status: "running" | "idle" | "stopped"
  cpu: number
  mem: string
}

// --- Data ---

const PROCESS_DATA: ProcessRow[] = [
  { id: "1024", name: "web-server", status: "running", cpu: 67, mem: "128 MB" },
  { id: "1025", name: "db-primary", status: "running", cpu: 54, mem: "512 MB" },
  { id: "1026", name: "api-gateway", status: "running", cpu: 48, mem: "192 MB" },
  { id: "1027", name: "worker-pool", status: "running", cpu: 35, mem: "96 MB" },
  { id: "1028", name: "cache-redis", status: "running", cpu: 22, mem: "256 MB" },
  { id: "1029", name: "metrics", status: "running", cpu: 18, mem: "64 MB" },
  { id: "1030", name: "log-shipper", status: "idle", cpu: 4, mem: "32 MB" },
  { id: "1031", name: "cron-sched", status: "idle", cpu: 1, mem: "16 MB" },
  { id: "1032", name: "backup-agent", status: "stopped", cpu: 0, mem: "0 MB" },
  { id: "1033", name: "mail-service", status: "stopped", cpu: 0, mem: "0 MB" },
]

export function DataExplorerShowcase(): JSX.Element {
  const [tick, setTick] = useState(0)
  const [selectedRow, setSelectedRow] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 2000)
    return () => clearInterval(id)
  }, [])

  useInput((_input, key) => {
    if (key.upArrow) setSelectedRow((r) => Math.max(0, r - 1))
    if (key.downArrow) setSelectedRow((r) => Math.min(PROCESS_DATA.length - 1, r + 1))
  })

  const rows = PROCESS_DATA.map((row) => ({
    ...row,
    cpu: row.status === "running" ? Math.max(1, Math.min(99, row.cpu + ((tick * 7 + row.cpu) % 13) - 6)) : row.cpu,
  })).sort((a, b) => b.cpu - a.cpu)

  const statusIcon = (s: string) => (s === "running" ? "\u25CF" : s === "idle" ? "\u25D0" : "\u25CB")
  const statusColor = (s: string) => (s === "running" ? "#a6e3a1" : s === "idle" ? "#f9e2af" : "#f38ba8")
  const cpuColor = (v: number) => (v > 50 ? "#f38ba8" : v > 20 ? "#f9e2af" : "#a6e3a1")

  const colW = { id: 6, name: 14, status: 3, cpu: 14, mem: 8 }

  return (
    <Box flexDirection="column" padding={1}>
      <Box flexDirection="row" justifyContent="space-between" marginBottom={1}>
        <Text>
          <Text bold color="#cdd6f4">
            Process Explorer
          </Text>
          <Text color="#6c7086"> {"\u2014"} {rows.length} processes</Text>
        </Text>
        <Text color="#6c7086">
          sorted by{" "}
          <Text bold color="#89dceb">
            CPU {"\u25BC"}
          </Text>
        </Text>
      </Box>

      {/* Header */}
      <Box flexDirection="row" backgroundColor="#313244">
        <Box width={colW.id} paddingX={1}>
          <Text bold color="#a6adc8">
            PID
          </Text>
        </Box>
        <Box width={colW.name} paddingX={1}>
          <Text bold color="#a6adc8">
            Name
          </Text>
        </Box>
        <Box width={colW.status} paddingX={1}>
          <Text bold color="#a6adc8">
            S
          </Text>
        </Box>
        <Box width={colW.cpu} paddingX={1}>
          <Text bold color="#a6adc8">
            CPU%
          </Text>
        </Box>
        <Box width={colW.mem} paddingX={1}>
          <Text bold color="#a6adc8">
            Mem
          </Text>
        </Box>
      </Box>

      {/* Rows */}
      {rows.map((row, i) => {
        const isSelected = i === selectedRow
        const bgColor = isSelected ? "#2a2a5e" : i % 2 === 0 ? "#1a1a2e" : "#1e1e3e"
        const cpuBars = Math.round((row.cpu / 100) * 8)
        return (
          <Box key={row.id} flexDirection="row" backgroundColor={bgColor}>
            <Box width={colW.id} paddingX={1}>
              <Text color="#585b70">{row.id}</Text>
            </Box>
            <Box width={colW.name} paddingX={1}>
              <Text bold={isSelected} color={isSelected ? "#cdd6f4" : "#a6adc8"}>
                {row.name}
              </Text>
            </Box>
            <Box width={colW.status} paddingX={1}>
              <Text color={statusColor(row.status)}>{statusIcon(row.status)}</Text>
            </Box>
            <Box width={colW.cpu} paddingX={1}>
              <Text>
                <Text color={cpuColor(row.cpu)}>{"\u2588".repeat(cpuBars)}</Text>
                <Text color="#313244">{"\u2591".repeat(8 - cpuBars)}</Text>
                <Text bold color={cpuColor(row.cpu)}>
                  {" "}
                  {String(row.cpu).padStart(2)}
                </Text>
              </Text>
            </Box>
            <Box width={colW.mem} paddingX={1}>
              <Text color={isSelected ? "#cdd6f4" : "#6c7086"}>{row.mem}</Text>
            </Box>
          </Box>
        )
      })}

      <KeyHints hints={"\u2191\u2193 select row"} />
    </Box>
  )
}
