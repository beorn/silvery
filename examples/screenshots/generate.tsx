/**
 * Screenshot Generator for silvery README
 *
 * Renders example components headlessly and captures PNG screenshots
 * using bufferToHTML() + Playwright.
 *
 * Usage:
 *   cd vendor/silvery && bun run examples/screenshots/generate.tsx
 *
 * Prerequisites:
 *   bunx playwright install chromium
 *
 * Output:
 *   docs/images/dashboard.png      - Multi-pane dashboard with borders and colors
 *   docs/images/task-list.png      - Scrollable task list with selection
 *   docs/images/kanban.png         - 3-column kanban board with cards
 *   docs/images/layout-feedback.png - Layout feedback with useContentRect() values
 */

import type { JSX } from "react"
import { mkdir } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import React, { useState } from "react"
import { render, createRenderer, ensureEngine, bufferToHTML } from "@silvery/test"
import { Box, Text, Divider, useContentRect, useApp } from "../../src/index.js"
import { createScreenshotter } from "@silvery/term/screenshot"

// ============================================================================
// Output directory
// ============================================================================

const OUTPUT_DIR = resolve(dirname(import.meta.path), "../../docs/images")

// ============================================================================
// Screenshot Components
// These are static versions of the examples, frozen at a specific state
// for consistent screenshot output.
// ============================================================================

// --- 1. Dashboard -----------------------------------------------------------

function ProgressBar({ percent, width = 24 }: { percent: number; width?: number }) {
  const filled = Math.round((percent / 100) * width)
  const empty = width - filled
  const dot = filled < width ? "╸" : ""
  const filledBar = "━".repeat(Math.max(0, filled - (dot ? 1 : 0)))
  const emptyBar = "─".repeat(Math.max(0, empty - (dot ? 0 : 0)))
  return (
    <Text>
      <Text color="$success">{filledBar}</Text>
      <Text color="$success">{dot}</Text>
      <Text dim>{emptyBar}</Text>
    </Text>
  )
}

function DashboardScreenshot() {
  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="$warning">
          Dashboard
        </Text>
      </Box>

      <Box flexGrow={1} flexDirection="row" gap={1}>
        {/* System Stats pane (selected) */}
        <Box flexDirection="column" flexGrow={1} borderStyle="round" borderColor="$primary" padding={1}>
          <Box marginBottom={1}>
            <Text bold color="$primary">
              System Stats
            </Text>
          </Box>
          <Box flexDirection="column" gap={1}>
            <Box flexDirection="row" justifyContent="space-between">
              <Text>CPU Usage</Text>
              <Box>
                <Text bold color="$success">
                  45%
                </Text>
                <Text color="$success"> +2%</Text>
              </Box>
            </Box>
            <Box flexDirection="row" justifyContent="space-between">
              <Text>Memory</Text>
              <Box>
                <Text bold color="$success">
                  8.2 GB
                </Text>
                <Text color="$error"> -0.3</Text>
              </Box>
            </Box>
            <Box flexDirection="row" justifyContent="space-between">
              <Text>Disk</Text>
              <Text bold color="$success">
                234 GB
              </Text>
            </Box>
            <Box flexDirection="row" justifyContent="space-between">
              <Text>Network</Text>
              <Box>
                <Text bold color="$success">
                  1.2 Mb/s
                </Text>
                <Text color="$success"> +0.5</Text>
              </Box>
            </Box>
          </Box>
        </Box>

        {/* Recent Activity pane */}
        <Box flexDirection="column" flexGrow={1} borderStyle="round" borderColor="$border" padding={1}>
          <Box marginBottom={1}>
            <Text bold>Recent Activity</Text>
          </Box>
          <Box flexDirection="column">
            <Text>{">"} User login: admin</Text>
            <Text>{"  "}Backup completed</Text>
            <Text>{"  "}Config updated</Text>
            <Text dim>{"  "}Service restarted</Text>
            <Text dim>{"  "}Cache cleared</Text>
          </Box>
        </Box>

        {/* Project Progress pane */}
        <Box flexDirection="column" flexGrow={1} borderStyle="round" borderColor="$border" padding={1}>
          <Box marginBottom={1}>
            <Text bold>Project Progress</Text>
          </Box>
          <Box flexDirection="column" gap={1}>
            {[
              { label: "Frontend", percent: 85 },
              { label: "Backend", percent: 72 },
              { label: "Testing", percent: 45 },
              { label: "Docs", percent: 30 },
            ].map((item) => (
              <Box key={item.label} flexDirection="column">
                <Box justifyContent="space-between">
                  <Text>{item.label}</Text>
                  <Text bold>{item.percent}%</Text>
                </Box>
                <ProgressBar percent={item.percent} />
              </Box>
            ))}
          </Box>
        </Box>
      </Box>

      <Box marginTop={1}>
        <Text dim>
          {" "}
          Selected: Pane 1{" "}
          <Text bold dim>
            h/l
          </Text>{" "}
          navigate{" "}
          <Text bold dim>
            q
          </Text>{" "}
          quit
        </Text>
      </Box>
    </Box>
  )
}

// --- 2. Task List -----------------------------------------------------------

function TaskListScreenshot() {
  const tasks = [
    { id: 1, title: "Review authentication refactor", completed: false, priority: "high" as const },
    { id: 2, title: "Update API documentation", completed: true, priority: "medium" as const },
    {
      id: 3,
      title: "Fix timezone handling in scheduler",
      completed: false,
      priority: "high" as const,
    },
    {
      id: 4,
      title: "Add rate limiting to endpoints",
      completed: false,
      priority: "medium" as const,
    },
    {
      id: 5,
      title: "Write integration tests for payments",
      completed: true,
      priority: "low" as const,
    },
    {
      id: 6,
      title: "Migrate user table to new schema",
      completed: false,
      priority: "high" as const,
    },
    { id: 7, title: "Set up staging environment", completed: false, priority: "low" as const },
    { id: 8, title: "Refactor notification service", completed: true, priority: "medium" as const },
  ]
  const cursor = 2

  const priorityLabels = { high: "P1", medium: "P2", low: "P3" }
  const priorityColors = { high: "$error", medium: "$warning", low: "$success" }

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="$warning">
          Task List
        </Text>
        <Text dim>
          {" "}
          {tasks.filter((t) => t.completed).length}/{tasks.length} completed
        </Text>
      </Box>

      <Box
        flexGrow={1}
        flexDirection="column"
        borderStyle="round"
        borderColor="$primary"
        overflow="hidden"
        paddingX={1}
      >
        {tasks.map((task, index) => {
          const checkbox = task.completed ? "☑" : "☐"
          const isSelected = index === cursor
          const showSeparator = index < tasks.length - 1
          const label = priorityLabels[task.priority]
          const labelColor = priorityColors[task.priority]

          return (
            <Box key={task.id} flexDirection="column">
              {isSelected ? (
                <Text>
                  <Text backgroundColor="$primary" color="black">
                    {" "}
                    {checkbox} {task.title}{" "}
                  </Text>{" "}
                  <Text color={labelColor} bold>
                    {label}
                  </Text>
                </Text>
              ) : (
                <Text strikethrough={task.completed} dim={task.completed}>
                  {checkbox} {task.title}{" "}
                  <Text color={labelColor} bold>
                    {label}
                  </Text>
                </Text>
              )}
              {showSeparator && <Divider />}
            </Box>
          )
        })}
      </Box>

      <Box marginTop={1} justifyContent="space-between">
        <Text dim>
          {" "}
          <Text bold dim>
            j/k
          </Text>{" "}
          navigate{" "}
          <Text bold dim>
            space
          </Text>{" "}
          toggle{" "}
          <Text bold dim>
            enter
          </Text>{" "}
          expand{" "}
          <Text bold dim>
            q
          </Text>{" "}
          quit
        </Text>
        <Text dim>
          {" "}
          <Text bold>3</Text>/8{" "}
        </Text>
      </Box>
    </Box>
  )
}

// --- 3. Kanban Board --------------------------------------------------------

function KanbanScreenshot() {
  const columns = [
    {
      id: "todo",
      title: "To Do",
      isSelected: true,
      cards: [
        {
          title: "Design new landing page",
          tags: ["design"],
          isSelected: true,
        },
        { title: "Write API documentation", tags: ["docs"], isSelected: false },
        { title: "Set up monitoring", tags: ["devops"], isSelected: false },
        { title: "Create onboarding flow", tags: ["ux"], isSelected: false },
      ],
    },
    {
      id: "inProgress",
      title: "In Progress",
      isSelected: false,
      cards: [
        {
          title: "User authentication",
          tags: ["backend", "security"],
          isSelected: false,
        },
        {
          title: "Dashboard redesign",
          tags: ["frontend", "design"],
          isSelected: false,
        },
        { title: "API rate limiting", tags: ["backend"], isSelected: false },
      ],
    },
    {
      id: "done",
      title: "Done",
      isSelected: false,
      cards: [
        { title: "Project setup", tags: ["devops"], isSelected: false },
        { title: "CI/CD pipeline", tags: ["devops"], isSelected: false },
        { title: "Initial wireframes", tags: ["design"], isSelected: false },
      ],
    },
  ]

  const tagColors: Record<string, string> = {
    frontend: "$info",
    backend: "$accent",
    design: "$warning",
    devops: "$success",
    docs: "$primary",
    ux: "$muted",
    security: "$error",
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="$warning">
          Kanban Board
        </Text>
      </Box>

      <Box flexGrow={1} flexDirection="row" gap={1} overflow="hidden">
        {columns.map((col) => (
          <Box
            key={col.id}
            flexDirection="column"
            flexGrow={1}
            borderStyle="round"
            borderColor={col.isSelected ? "$primary" : "$border"}
          >
            <Box backgroundColor={col.isSelected ? "$primary" : undefined} paddingX={1}>
              <Text bold color={col.isSelected ? "black" : undefined}>
                {col.title}
              </Text>
              <Text color={col.isSelected ? "black" : "$muted"}> ({col.cards.length})</Text>
            </Box>

            <Box flexDirection="column" paddingX={1} flexGrow={1} gap={1}>
              {col.cards.map((card, idx) => (
                <Box
                  key={idx}
                  flexDirection="column"
                  borderStyle="round"
                  borderColor={card.isSelected ? "$primary" : "$border"}
                  paddingX={1}
                >
                  {card.isSelected ? (
                    <Text backgroundColor="$primary" color="black" bold>
                      {card.title}
                    </Text>
                  ) : (
                    <Text>{card.title}</Text>
                  )}
                  <Box gap={1}>
                    {card.tags.map((tag) => (
                      <Text key={tag} color={tagColors[tag] ?? "$muted"} dim>
                        #{tag}
                      </Text>
                    ))}
                  </Box>
                </Box>
              ))}
            </Box>
          </Box>
        ))}
      </Box>

      <Text dim>
        {" "}
        <Text bold dim>
          h/l
        </Text>{" "}
        column{" "}
        <Text bold dim>
          j/k
        </Text>{" "}
        card{" "}
        <Text bold dim>
          {"</>"}
        </Text>{" "}
        move{" "}
        <Text bold dim>
          q
        </Text>{" "}
        quit
      </Text>
    </Box>
  )
}

// --- 4. Layout Feedback -----------------------------------------------------

function LayoutPane({ title, color, grow = 1 }: { title: string; color: string; grow?: number }) {
  const rect = useContentRect()
  return (
    <Box flexGrow={grow} borderStyle="round" borderColor={color} padding={1} flexDirection="column">
      <Text bold color={color}>
        {title}
      </Text>
      <Box marginTop={1}>
        <Text dim>
          {rect.width}x{rect.height} at ({rect.x},{rect.y})
        </Text>
      </Box>
    </Box>
  )
}

function LayoutFeedbackScreenshot() {
  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="$warning">
          Layout Feedback Demo
        </Text>
      </Box>

      <Box flexDirection="row" gap={1} height={8}>
        <LayoutPane title="Sidebar" color="$success" grow={1} />
        <LayoutPane title="Main Content" color="$primary" grow={2} />
        <LayoutPane title="Detail" color="$info" grow={1} />
      </Box>

      <Box marginTop={1} borderStyle="single" borderColor="$border" padding={1}>
        <Box flexDirection="column">
          <Text bold>useContentRect() — components know their size during render</Text>
          <Text dim>No ResizeObserver, no second render, no layout jank.</Text>
          <Text dim>Each pane above displays its own dimensions via useContentRect().</Text>
        </Box>
      </Box>

      <Text dim>
        {" "}
        <Text bold dim>
          i
        </Text>{" "}
        inspect{" "}
        <Text bold dim>
          Esc
        </Text>{" "}
        quit
      </Text>
    </Box>
  )
}

// ============================================================================
// Screenshot Generation
// ============================================================================

interface ScreenshotConfig {
  name: string
  filename: string
  element: JSX.Element
  cols: number
  rows: number
}

const screenshots: ScreenshotConfig[] = [
  {
    name: "Dashboard",
    filename: "dashboard.png",
    element: <DashboardScreenshot />,
    cols: 120,
    rows: 25,
  },
  {
    name: "Task List",
    filename: "task-list.png",
    element: <TaskListScreenshot />,
    cols: 80,
    rows: 23,
  },
  {
    name: "Kanban Board",
    filename: "kanban.png",
    element: <KanbanScreenshot />,
    cols: 120,
    rows: 27,
  },
  {
    name: "Layout Feedback",
    filename: "layout-feedback.png",
    element: <LayoutFeedbackScreenshot />,
    cols: 90,
    rows: 20,
  },
]

async function main() {
  await mkdir(OUTPUT_DIR, { recursive: true })

  await ensureEngine()
  await using screenshotter = createScreenshotter()

  for (const config of screenshots) {
    const { name, filename, element, cols, rows } = config
    const outputPath = resolve(OUTPUT_DIR, filename)

    console.log(`Generating ${name} (${cols}x${rows})...`)

    const app = render(element, { cols, rows })
    const buffer = app.lastBuffer()

    if (!buffer) {
      console.error(`  ERROR: No buffer for ${name}`)
      app.unmount()
      continue
    }

    const html = bufferToHTML(buffer, {
      fontFamily: "JetBrains Mono, Menlo, Consolas, monospace",
      fontSize: 14,
      theme: "dark",
    })

    await screenshotter.capture(html, outputPath)
    console.log(`  Saved: ${outputPath}`)

    app.unmount()
  }

  console.log("\nDone! Generated screenshots:")
  for (const config of screenshots) {
    console.log(`  docs/images/${config.filename}`)
  }
}

main().catch((err) => {
  console.error("Screenshot generation failed:", err)
  process.exit(1)
})
