/**
 * Dashboard Example
 *
 * A multi-pane dashboard demonstrating:
 * - 3 columns using flexGrow
 * - Keyboard navigation between panes
 * - Styled borders and conditional highlighting
 */

import React, { useState } from "react"
import { render, Box, Text, useInput, useApp, createTerm, type Key } from "../../src/index.js"
import { ExampleBanner, type ExampleMeta } from "../_banner.js"

export const meta: ExampleMeta = {
  name: "Dashboard",
  description: "Multi-pane dashboard with flexGrow columns and keyboard navigation",
  features: ["Box flexGrow", "borderStyle", "useInput", "backgroundColor"],
}

// ============================================================================
// Types
// ============================================================================

interface StatItem {
  label: string
  value: string | number
  change?: string
}

interface PaneProps {
  title: string
  isSelected: boolean
  children: React.ReactNode
}

// ============================================================================
// Components
// ============================================================================

function Pane({ title, isSelected, children }: PaneProps): JSX.Element {
  return (
    <Box flexDirection="column" flexGrow={1} borderStyle="round" borderColor={isSelected ? "cyan" : "gray"} padding={1}>
      <Box marginBottom={1}>
        <Text bold color={isSelected ? "cyan" : "white"}>
          {title}
        </Text>
      </Box>
      {children}
    </Box>
  )
}

function StatsList({ stats }: { stats: StatItem[] }): JSX.Element {
  return (
    <Box flexDirection="column" gap={1}>
      {stats.map((stat, index) => (
        <Box key={index} flexDirection="row" justifyContent="space-between">
          <Text>{stat.label}</Text>
          <Box>
            <Text bold color="green">
              {stat.value}
            </Text>
            {stat.change && <Text color={stat.change.startsWith("+") ? "green" : "red"}> {stat.change}</Text>}
          </Box>
        </Box>
      ))}
    </Box>
  )
}

function ActivityList({ activities }: { activities: string[] }): JSX.Element {
  return (
    <Box flexDirection="column">
      {activities.map((activity, index) => (
        <Text key={index} dim={index > 2}>
          {index === 0 ? ">" : " "} {activity}
        </Text>
      ))}
    </Box>
  )
}

function ProgressBars({ items }: { items: { label: string; percent: number }[] }): JSX.Element {
  const barWidth = 20 // Fixed width for simplicity

  return (
    <Box flexDirection="column" gap={1}>
      {items.map((item, index) => {
        const filled = Math.round((item.percent / 100) * barWidth)
        const empty = barWidth - filled
        return (
          <Box key={index} flexDirection="column">
            <Box justifyContent="space-between">
              <Text>{item.label}</Text>
              <Text bold>{item.percent}%</Text>
            </Box>
            <Text>
              <Text color="green">{"█".repeat(filled)}</Text>
              <Text dim>{"░".repeat(empty)}</Text>
            </Text>
          </Box>
        )
      })}
    </Box>
  )
}

export function Dashboard(): JSX.Element {
  const { exit } = useApp()
  const [selectedPane, setSelectedPane] = useState(0)

  useInput((input: string, key: Key) => {
    if (input === "q" || key.escape) {
      exit()
    }
    if (key.leftArrow || input === "h") {
      setSelectedPane((prev) => (prev - 1 + 3) % 3)
    }
    if (key.rightArrow || input === "l") {
      setSelectedPane((prev) => (prev + 1) % 3)
    }
  })

  const systemStats: StatItem[] = [
    { label: "CPU Usage", value: "45%", change: "+2%" },
    { label: "Memory", value: "8.2 GB", change: "-0.3" },
    { label: "Disk", value: "234 GB" },
    { label: "Network", value: "1.2 Mb/s", change: "+0.5" },
  ]

  const recentActivities = [
    "User login: admin",
    "Backup completed",
    "Config updated",
    "Service restarted",
    "Cache cleared",
  ]

  const projectProgress = [
    { label: "Frontend", percent: 85 },
    { label: "Backend", percent: 72 },
    { label: "Testing", percent: 45 },
    { label: "Docs", percent: 30 },
  ]

  return (
    <Box flexDirection="column" padding={1}>
      <Box flexGrow={1} flexDirection="row" gap={1}>
        <Pane title="System Stats" isSelected={selectedPane === 0}>
          <StatsList stats={systemStats} />
        </Pane>

        <Pane title="Recent Activity" isSelected={selectedPane === 1}>
          <ActivityList activities={recentActivities} />
        </Pane>

        <Pane title="Project Progress" isSelected={selectedPane === 2}>
          <ProgressBars items={projectProgress} />
        </Pane>
      </Box>

      <Text dim>
        {" "}
        Selected: Pane {selectedPane + 1}{" "}
        <Text bold dim>
          h/l
        </Text>{" "}
        navigate{" "}
        <Text bold dim>
          Esc/q
        </Text>{" "}
        quit
      </Text>
    </Box>
  )
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  using term = createTerm()
  const { waitUntilExit } = await render(
    <ExampleBanner meta={meta} controls="h/l navigate  Esc/q quit">
      <Dashboard />
    </ExampleBanner>,
    term,
  )
  await waitUntilExit()
}

if (import.meta.main) {
  main().catch(console.error)
}
