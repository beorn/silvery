/**
 * DashboardShowcase — btop-inspired system monitor
 *
 * Live-updating CPU/memory sparklines, per-core bars, service status, and event feed.
 */

import React, { useState, useEffect } from "react"
import { Box, Text } from "@silvery/term/xterm/index.ts"
import { KeyHints } from "./shared.js"

// --- Sparkline helpers ---

const SPARKLINE = "\u2581\u2582\u2583\u2584\u2585\u2586\u2587\u2588"
const sparkChar = (v: number) => SPARKLINE[Math.min(7, Math.round((v / 100) * 7))]!
const gaugeColor = (v: number) => (v > 70 ? "#f38ba8" : v > 40 ? "#f9e2af" : "#a6e3a1")

export function DashboardShowcase(): JSX.Element {
  const [tick, setTick] = useState(0)
  const [cpuHistory] = useState(() => Array.from({ length: 20 }, () => 20 + Math.floor(Math.random() * 40)))
  const [memHistory] = useState(() => Array.from({ length: 20 }, () => 40 + Math.floor(Math.random() * 30)))

  useEffect(() => {
    const id = setInterval(() => {
      setTick((t) => {
        const newT = t + 1
        cpuHistory.push(
          Math.max(5, Math.min(95, cpuHistory[cpuHistory.length - 1]! + Math.floor(Math.random() * 21) - 10)),
        )
        cpuHistory.shift()
        memHistory.push(
          Math.max(20, Math.min(90, memHistory[memHistory.length - 1]! + Math.floor(Math.random() * 11) - 5)),
        )
        memHistory.shift()
        return newT
      })
    }, 1200)
    return () => clearInterval(id)
  }, [])

  const cpu = cpuHistory[cpuHistory.length - 1]!
  const mem = memHistory[memHistory.length - 1]!

  const cores = [
    { label: "C0", value: Math.max(5, cpu + ((tick * 3) % 15) - 7) },
    { label: "C1", value: Math.max(5, cpu - ((tick * 5) % 20) + 5) },
    { label: "C2", value: Math.max(5, cpu + ((tick * 2) % 18) - 3) },
    { label: "C3", value: Math.max(5, cpu - ((tick * 4) % 12) + 2) },
  ].map((c) => ({ ...c, value: Math.min(99, c.value) }))

  const services = [
    { name: "api-gateway", status: "up" as const, uptime: "14d 6h", latency: "12ms" },
    { name: "auth-service", status: "up" as const, uptime: "14d 6h", latency: "8ms" },
    { name: "worker-pool", status: "warn" as const, uptime: "2h 15m", latency: "245ms" },
    { name: "cache-redis", status: "up" as const, uptime: "7d 3h", latency: "2ms" },
    { name: "mail-service", status: "down" as const, uptime: "0m", latency: "\u2014" },
  ]

  const statusIcon = (s: "up" | "warn" | "down") => (s === "up" ? "\u25CF" : s === "warn" ? "\u25B2" : "\u2715")
  const statusColor = (s: "up" | "warn" | "down") => (s === "up" ? "#a6e3a1" : s === "warn" ? "#f9e2af" : "#f38ba8")

  const allEvents = [
    { tag: "DEPLOY", color: "#a6e3a1", time: "14:23:01", msg: "v2.4.1 completed" },
    { tag: "ALERT", color: "#f9e2af", time: "14:23:15", msg: "Auth service restarted" },
    { tag: "BACKUP", color: "#89b4fa", time: "14:23:30", msg: "Finished (12.4 GB)" },
    { tag: "CERT", color: "#94e2d5", time: "14:23:45", msg: "SSL renewed (90d)" },
    { tag: "CACHE", color: "#cba6f7", time: "14:24:01", msg: "Purged successfully" },
    { tag: "DB", color: "#89b4fa", time: "14:24:12", msg: "Migration v38 applied" },
    { tag: "SCALE", color: "#a6e3a1", time: "14:24:30", msg: "Workers \u2192 8" },
    { tag: "HEALTH", color: "#a6e3a1", time: "14:24:45", msg: "All services green" },
  ]
  const eventOffset = tick % 4
  const visibleEvents = allEvents.slice(eventOffset, eventOffset + 4)

  return (
    <Box flexDirection="column" paddingX={1}>
      {/* Header */}
      <Box>
        <Text color="#a6e3a1">{"\u25CF"} </Text>
        <Text bold color="#cdd6f4">
          System Monitor
        </Text>
        <Text color="#6c7086">
          {" "}
          {"\u2014"} {cores.length} cores, {services.length} services
        </Text>
      </Box>

      {/* Top row: Metrics + Services */}
      <Box flexDirection="row" gap={1}>
        {/* Metrics panel */}
        <Box flexDirection="column" flexGrow={1} borderStyle="round" borderColor="#45475a" paddingX={1}>
          <Text bold color="#a6adc8">
            CPU / Memory
          </Text>
          {/* Sparkline graphs */}
          <Box flexDirection="row" gap={1}>
            <Box width={5}>
              <Text color="#6c7086">CPU</Text>
            </Box>
            <Text>
              {cpuHistory.map((v, i) => (
                <Text key={i} color={gaugeColor(v)}>
                  {sparkChar(v)}
                </Text>
              ))}
            </Text>
            <Text bold color={gaugeColor(cpu)}>
              {" "}
              {String(cpu).padStart(2)}%
            </Text>
          </Box>
          <Box flexDirection="row" gap={1}>
            <Box width={5}>
              <Text color="#6c7086">MEM</Text>
            </Box>
            <Text>
              {memHistory.map((v, i) => (
                <Text key={i} color={gaugeColor(v)}>
                  {sparkChar(v)}
                </Text>
              ))}
            </Text>
            <Text bold color={gaugeColor(mem)}>
              {" "}
              {String(mem).padStart(2)}%
            </Text>
          </Box>
          {/* Per-core mini bars */}
          {cores.map((c) => {
            const blocks = Math.round((c.value / 100) * 12)
            return (
              <Box key={c.label} flexDirection="row" gap={1}>
                <Box width={5}>
                  <Text color="#6c7086">{c.label}</Text>
                </Box>
                <Text>
                  <Text color={gaugeColor(c.value)}>{"\u2588".repeat(blocks)}</Text>
                  <Text color="#313244">{"\u2591".repeat(12 - blocks)}</Text>
                </Text>
                <Text bold color={gaugeColor(c.value)}>
                  {" "}
                  {String(c.value).padStart(2)}%
                </Text>
              </Box>
            )
          })}
        </Box>

        {/* Services panel */}
        <Box flexDirection="column" flexGrow={1} borderStyle="round" borderColor="#45475a" paddingX={1}>
          <Text bold color="#a6adc8">
            Services
          </Text>
          {services.map((s) => (
            <Box key={s.name} flexDirection="row" justifyContent="space-between" marginBottom={0}>
              <Text>
                <Text color={statusColor(s.status)}>{statusIcon(s.status)} </Text>
                <Text color={s.status === "down" ? "#6c7086" : "#cdd6f4"}>{s.name}</Text>
              </Text>
              <Text>
                <Text color="#6c7086">{s.latency} </Text>
                <Text dim color="#585b70">
                  {s.uptime}
                </Text>
              </Text>
            </Box>
          ))}
        </Box>
      </Box>

      {/* Bottom row: Events */}
      <Box flexDirection="column" borderStyle="round" borderColor="#45475a" paddingX={1}>
        <Text bold color="#a6adc8">
          Events
        </Text>
        {visibleEvents.map((e, i) => (
          <Box key={i} flexDirection="row" gap={1}>
            <Text dim color="#585b70">
              {e.time}
            </Text>
            <Box width={8}>
              <Text color={e.color} bold>
                [{e.tag}]
              </Text>
            </Box>
            <Text color={i === 0 ? "#cdd6f4" : "#a6adc8"}>{e.msg}</Text>
          </Box>
        ))}
      </Box>

      <KeyHints hints="q quit" />
    </Box>
  )
}
