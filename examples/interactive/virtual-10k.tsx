/**
 * Virtual Scroll Benchmark — 10,000 Items
 *
 * Demonstrates that VirtualList handles massive datasets with instant scrolling.
 * Only visible items + overscan are rendered, regardless of total count.
 *
 * Demonstrates:
 * - VirtualList with 10,000 items and variable heights
 * - Smooth j/k navigation with position indicator
 * - useContentRect() for adaptive column count
 * - Page up/down with large jumps
 * - Visual item variety (priorities, tags, progress bars)
 *
 * Usage: bun run examples/virtual-10k/index.tsx
 *
 * Controls:
 *   j/k or Up/Down   - Navigate one item
 *   d/u              - Half-page down/up
 *   g/G              - Jump to first/last
 *   /                - Search by number
 *   Esc/q or Ctrl+C   - Quit
 */

import React, { useState, useCallback, useMemo } from "react"
import { Box, Text, VirtualList, useContentRect } from "../../src/index.js"
import { run, useInput, type Key } from "../../src/runtime/index.js"
import { ExampleBanner, type ExampleMeta } from "../_banner.js"

export const meta: ExampleMeta = {
  name: "Virtual 10K",
  description: "VirtualList scrolling through 10,000 items with instant navigation",
  features: ["VirtualList", "10K items", "useContentRect()", "variable itemHeight"],
}

// ============================================================================
// Types
// ============================================================================

interface Item {
  id: number
  title: string
  priority: "P0" | "P1" | "P2" | "P3"
  status: "todo" | "in-progress" | "done" | "blocked"
  tags: string[]
  progress: number
  description: string
}

// ============================================================================
// Data Generation
// ============================================================================

const PRIORITIES: Item["priority"][] = ["P0", "P1", "P2", "P3"]
const STATUSES: Item["status"][] = ["todo", "in-progress", "done", "blocked"]
const TAG_POOL = [
  "frontend",
  "backend",
  "api",
  "database",
  "security",
  "performance",
  "ux",
  "docs",
  "testing",
  "devops",
  "mobile",
  "infra",
]

const ADJECTIVES = [
  "Implement",
  "Fix",
  "Refactor",
  "Optimize",
  "Design",
  "Review",
  "Update",
  "Add",
  "Remove",
  "Migrate",
  "Configure",
  "Deploy",
]

const NOUNS = [
  "authentication flow",
  "database schema",
  "API endpoint",
  "caching layer",
  "error handling",
  "test suite",
  "CI pipeline",
  "monitoring",
  "rate limiter",
  "search index",
  "notification system",
  "user dashboard",
  "payment processing",
  "file upload",
  "websocket handler",
  "session manager",
]

function seededRandom(seed: number): () => number {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) & 0x7fffffff
    return s / 0x7fffffff
  }
}

function generateItems(count: number): Item[] {
  const rng = seededRandom(42)
  const items: Item[] = []

  for (let i = 0; i < count; i++) {
    const adj = ADJECTIVES[Math.floor(rng() * ADJECTIVES.length)]!
    const noun = NOUNS[Math.floor(rng() * NOUNS.length)]!
    const priority = PRIORITIES[Math.floor(rng() * PRIORITIES.length)]!
    const status = STATUSES[Math.floor(rng() * STATUSES.length)]!
    const tagCount = 1 + Math.floor(rng() * 3)
    const tags: string[] = []
    for (let t = 0; t < tagCount; t++) {
      const tag = TAG_POOL[Math.floor(rng() * TAG_POOL.length)]!
      if (!tags.includes(tag)) tags.push(tag)
    }
    const progress = status === "done" ? 100 : status === "todo" ? 0 : Math.floor(rng() * 90) + 5

    items.push({
      id: i + 1,
      title: `${adj} ${noun}`,
      priority,
      status,
      tags,
      progress,
      description: `Task #${i + 1}: ${adj.toLowerCase()} the ${noun} for improved reliability.`,
    })
  }

  return items
}

const TOTAL_ITEMS = 10_000
const ALL_ITEMS = generateItems(TOTAL_ITEMS)

// ============================================================================
// Components
// ============================================================================

const PRIORITY_COLORS: Record<Item["priority"], string> = {
  P0: "red",
  P1: "yellow",
  P2: "cyan",
  P3: "gray",
}

const STATUS_ICONS: Record<Item["status"], string> = {
  todo: "\u25cb",
  "in-progress": "\u25d4",
  done: "\u25cf",
  blocked: "\u25a0",
}

const STATUS_COLORS: Record<Item["status"], string> = {
  todo: "gray",
  "in-progress": "yellow",
  done: "green",
  blocked: "red",
}

function ProgressBar({ percent, width: barWidth }: { percent: number; width: number }): JSX.Element {
  const effectiveWidth = Math.max(5, barWidth)
  const filled = Math.round((percent / 100) * effectiveWidth)
  const empty = effectiveWidth - filled

  return (
    <Text>
      <Text color="green">{"\u2588".repeat(filled)}</Text>
      <Text dim>{"\u2591".repeat(empty)}</Text>
    </Text>
  )
}

function ItemRow({
  item,
  isSelected,
  showDetail,
}: {
  item: Item
  isSelected: boolean
  showDetail: boolean
}): JSX.Element {
  const idStr = String(item.id).padStart(5, " ")

  return (
    <Box flexDirection="column" paddingX={1} backgroundColor={isSelected ? "blue" : undefined}>
      <Box>
        <Text color={STATUS_COLORS[item.status]}>{STATUS_ICONS[item.status]}</Text>
        <Text dim> {idStr} </Text>
        <Text bold color={PRIORITY_COLORS[item.priority]}>
          {item.priority}
        </Text>
        <Text> </Text>
        <Text bold={isSelected} color={isSelected ? "white" : undefined}>
          {item.title}
        </Text>
        <Text> </Text>
        {item.tags.map((tag) => (
          <Text key={tag} dim color="cyan">
            {" "}
            #{tag}
          </Text>
        ))}
      </Box>
      {showDetail && (
        <Box paddingLeft={8}>
          <Text dim>{item.description}</Text>
          <Text> </Text>
          <ProgressBar percent={item.progress} width={10} />
          <Text dim> {item.progress}%</Text>
        </Box>
      )}
    </Box>
  )
}

function ScrollIndicator({ current, total, width }: { current: number; total: number; width: number }): JSX.Element {
  const percent = total > 0 ? Math.round(((current + 1) / total) * 100) : 0

  // Progress bar
  const barWidth = Math.max(10, Math.min(30, width - 40))
  const filled = Math.round((percent / 100) * barWidth)
  const empty = barWidth - filled

  return (
    <Box gap={2} paddingX={1}>
      <Text bold color="cyan">
        {(current + 1).toLocaleString()}
      </Text>
      <Text dim>of</Text>
      <Text bold>{total.toLocaleString()}</Text>
      <Text>
        <Text color="cyan">{"\u2588".repeat(filled)}</Text>
        <Text dim>{"\u2591".repeat(empty)}</Text>
      </Text>
      <Text bold color="cyan">
        {percent}%
      </Text>
    </Box>
  )
}

function StatsBar({ items }: { items: Item[] }): JSX.Element {
  const stats = useMemo(() => {
    let p0 = 0,
      p1 = 0,
      p2 = 0,
      p3 = 0
    let todo = 0,
      inProg = 0,
      done = 0,
      blocked = 0
    for (const item of items) {
      if (item.priority === "P0") p0++
      else if (item.priority === "P1") p1++
      else if (item.priority === "P2") p2++
      else p3++
      if (item.status === "todo") todo++
      else if (item.status === "in-progress") inProg++
      else if (item.status === "done") done++
      else blocked++
    }
    return { p0, p1, p2, p3, todo, inProg, done, blocked }
  }, [items])

  return (
    <Box gap={2} paddingX={1}>
      <Text color="red" bold>
        P0:{stats.p0}
      </Text>
      <Text color="yellow" bold>
        P1:{stats.p1}
      </Text>
      <Text color="cyan">P2:{stats.p2}</Text>
      <Text dim>P3:{stats.p3}</Text>
      <Text dim>|</Text>
      <Text color="gray">
        {STATUS_ICONS.todo} {stats.todo}
      </Text>
      <Text color="yellow">
        {STATUS_ICONS["in-progress"]} {stats.inProg}
      </Text>
      <Text color="green">
        {STATUS_ICONS.done} {stats.done}
      </Text>
      <Text color="red">
        {STATUS_ICONS.blocked} {stats.blocked}
      </Text>
    </Box>
  )
}

// ============================================================================
// Main App
// ============================================================================

function VirtualBenchmark(): JSX.Element {
  const { width, height } = useContentRect()
  const [cursor, setCursor] = useState(0)
  const [showDetail, setShowDetail] = useState(false)

  // Calculate available list height
  // stats (1) + separator (1) + scroll indicator (1) + help (1) + borders
  const listHeight = Math.max(5, height - 5)
  const halfPage = Math.max(1, Math.floor(listHeight / 2))

  const itemHeight = useCallback(
    (_item: Item, index: number) => {
      if (showDetail && index === cursor) return 2
      return 1
    },
    [showDetail, cursor],
  )

  useInput(
    useCallback(
      (input: string, key: Key) => {
        if (input === "q" || key.escape || (key.ctrl && input === "c")) {
          return "exit"
        }

        // Navigation
        if (input === "j" || key.downArrow) {
          setCursor((c) => Math.min(TOTAL_ITEMS - 1, c + 1))
        }
        if (input === "k" || key.upArrow) {
          setCursor((c) => Math.max(0, c - 1))
        }

        // Half-page
        if (input === "d" || key.pageDown) {
          setCursor((c) => Math.min(TOTAL_ITEMS - 1, c + halfPage))
        }
        if (input === "u" || key.pageUp) {
          setCursor((c) => Math.max(0, c - halfPage))
        }

        // Jump to start/end
        if (input === "g" || key.home) {
          setCursor(0)
        }
        if (input === "G" || key.end) {
          setCursor(TOTAL_ITEMS - 1)
        }

        // Toggle detail view
        if (key.return || input === " ") {
          setShowDetail((d) => !d)
        }
      },
      [halfPage],
    ),
  )

  return (
    <Box flexDirection="column" width="100%" height="100%">
      {/* Stats */}
      <StatsBar items={ALL_ITEMS} />

      {/* Separator */}
      <Box paddingX={1}>
        <Text dim>{"\u2500".repeat(Math.max(1, width - 2))}</Text>
      </Box>

      {/* Virtual list */}
      <Box flexGrow={1}>
        <VirtualList
          items={ALL_ITEMS}
          height={listHeight}
          itemHeight={itemHeight}
          scrollTo={cursor}
          overscan={5}
          renderItem={(item, index) => (
            <ItemRow
              key={item.id}
              item={item}
              isSelected={index === cursor}
              showDetail={showDetail && index === cursor}
            />
          )}
        />
      </Box>

      {/* Scroll position */}
      <ScrollIndicator current={cursor} total={TOTAL_ITEMS} width={width} />

      {/* Help */}
      <Box paddingX={1} justifyContent="center">
        <Text dim>
          <Text bold dim>
            j/k
          </Text>{" "}
          navigate{" "}
          <Text bold dim>
            d/u
          </Text>{" "}
          half-page{" "}
          <Text bold dim>
            g/G
          </Text>{" "}
          start/end{" "}
          <Text bold dim>
            Enter
          </Text>{" "}
          detail{" "}
          <Text bold dim>
            Esc/q
          </Text>{" "}
          quit
        </Text>
      </Box>
    </Box>
  )
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  const handle = await run(
    <ExampleBanner meta={meta} controls="j/k navigate  d/u half-page  g/G start/end  Enter detail  Esc/q quit">
      <VirtualBenchmark />
    </ExampleBanner>,
  )
  await handle.waitUntilExit()
}

if (import.meta.main) {
  main().catch(console.error)
}
