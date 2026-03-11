/**
 * Dashboard Example
 *
 * A multi-pane dashboard demonstrating:
 * - Tab navigation between views
 * - Flex-based progress bars (no manual width calculations)
 * - Scrollable list with keyboard navigation
 * - justifyContent for spacing
 */

import React, { useState } from "react"
import { render, Box, Text, useInput, useApp, createTerm, type Key } from "../../src/index.js"
import { ExampleBanner, type ExampleMeta } from "../_banner.js"

export const meta: ExampleMeta = {
  name: "Dashboard",
  description: "Tabbed dashboard with flex progress bars and scrollable list",
  features: ["Box flexGrow", "justifyContent", "overflow scroll", "useInput", "tabs"],
}

// ============================================================================
// Data
// ============================================================================

const stats = [
  { label: "CPU Usage", value: 45, change: "+2%" },
  { label: "Memory", value: 62, change: "-0.3%" },
  { label: "Disk", value: 28 },
  { label: "Network", value: 15, change: "+0.5%" },
]

const activities = [
  { time: "12:01", message: "User logged in" },
  { time: "12:00", message: "Build passed" },
  { time: "11:58", message: "PR #42 merged" },
  { time: "11:55", message: "Deploy completed" },
  { time: "11:50", message: "Tests started" },
]

const recentItems = [
  { name: "project-alpha", date: "2 hours ago" },
  { name: "report-q4.pdf", date: "Yesterday" },
  { name: "config.json", date: "3 days ago" },
  { name: "notes.md", date: "Last week" },
  { name: "package.json", date: "2 weeks ago" },
  { name: "README.md", date: "Last month" },
]

const tabs = ["Stats", "Activity", "Recent"] as const

// ============================================================================
// Components
// ============================================================================

function TabBar({ active }: { active: number }): JSX.Element {
  return (
    <Box flexDirection="row" gap={1} paddingX={1}>
      {tabs.map((label, i) => (
        <Text key={label} bold={i === active} inverse={i === active}>
          {" "}
          {label}{" "}
        </Text>
      ))}
    </Box>
  )
}

function ProgressBar({ value }: { value: number }): JSX.Element {
  return (
    <Box flexDirection="row">
      <Box flexGrow={value}>
        <Text color="$success">{"█".repeat(50)}</Text>
      </Box>
      <Box flexGrow={100 - value}>
        <Text dim>{"░".repeat(50)}</Text>
      </Box>
    </Box>
  )
}

function StatsPane(): JSX.Element {
  return (
    <Box flexDirection="column" gap={1}>
      {stats.map((stat) => (
        <Box key={stat.label} flexDirection="column">
          <Box flexDirection="row" justifyContent="space-between">
            <Text>{stat.label}</Text>
            <Box>
              <Text bold color="$success">
                {stat.value}%
              </Text>
              {stat.change && <Text color={stat.change.startsWith("+") ? "$success" : "$error"}> {stat.change}</Text>}
            </Box>
          </Box>
          <ProgressBar value={stat.value} />
        </Box>
      ))}
    </Box>
  )
}

function ActivityPane(): JSX.Element {
  return (
    <Box flexDirection="column">
      {activities.map((activity, i) => (
        <Box key={i} flexDirection="row" gap={1}>
          <Text dimColor>{activity.time}</Text>
          <Text>{activity.message}</Text>
        </Box>
      ))}
    </Box>
  )
}

function RecentPane({ selected }: { selected: number }): JSX.Element {
  return (
    <Box flexDirection="column" flexGrow={1} overflow="scroll" scrollTo={selected}>
      {recentItems.map((item, i) => (
        <Box key={item.name} flexDirection="row" justifyContent="space-between">
          <Text inverse={i === selected}>
            {i === selected ? "> " : "  "}
            {item.name}
          </Text>
          <Text dimColor>{item.date}</Text>
        </Box>
      ))}
    </Box>
  )
}

export function Dashboard(): JSX.Element {
  const { exit } = useApp()
  const [tab, setTab] = useState(0)
  const [selected, setSelected] = useState(0)

  useInput((input: string, key: Key) => {
    if (input === "q" || key.escape) exit()
    if (key.leftArrow || input === "h") setTab((t) => Math.max(0, t - 1))
    if (key.rightArrow || input === "l") setTab((t) => Math.min(tabs.length - 1, t + 1))
    if (tab === 2) {
      if (key.downArrow || input === "j") setSelected((s) => Math.min(s + 1, recentItems.length - 1))
      if (key.upArrow || input === "k") setSelected((s) => Math.max(s - 1, 0))
    }
  })

  return (
    <Box flexDirection="column" padding={1}>
      <TabBar active={tab} />
      <Box flexGrow={1} borderStyle="round" borderColor="$border" paddingX={1} paddingTop={1}>
        {tab === 0 && <StatsPane />}
        {tab === 1 && <ActivityPane />}
        {tab === 2 && <RecentPane selected={selected} />}
      </Box>
      <Text dim> h/l tabs{tab === 2 ? "  j/k select" : ""} Esc/q quit</Text>
    </Box>
  )
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  using term = createTerm()
  const { waitUntilExit } = await render(
    <ExampleBanner meta={meta} controls="h/l tabs  j/k select  Esc/q quit">
      <Dashboard />
    </ExampleBanner>,
    term,
  )
  await waitUntilExit()
}

if (import.meta.main) {
  main().catch(console.error)
}
