/**
 * Screenshot Generator for inkx README
 *
 * Renders example components headlessly and captures PNG screenshots
 * using bufferToHTML() + Playwright.
 *
 * Usage:
 *   cd vendor/beorn-inkx && bun run examples/screenshots/generate.tsx
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

import { mkdir } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import React, { useState } from "react"
import {
  render,
  createRenderer,
  ensureEngine,
  bufferToHTML,
} from "../../src/testing/index.tsx"
import { Box, Text, useContentRect, useApp } from "../../src/index.js"
import { createScreenshotter } from "../../src/screenshot.js"

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

function DashboardScreenshot(): JSX.Element {
  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="yellow">
          Dashboard
        </Text>
      </Box>

      <Box flexGrow={1} flexDirection="row" gap={1}>
        {/* System Stats pane (selected) */}
        <Box
          flexDirection="column"
          flexGrow={1}
          borderStyle="round"
          borderColor="cyan"
          padding={1}
        >
          <Box marginBottom={1}>
            <Text bold color="cyan">
              System Stats
            </Text>
          </Box>
          <Box flexDirection="column" gap={1}>
            <Box flexDirection="row" justifyContent="space-between">
              <Text>CPU Usage</Text>
              <Box>
                <Text bold color="green">
                  45%
                </Text>
                <Text color="green"> +2%</Text>
              </Box>
            </Box>
            <Box flexDirection="row" justifyContent="space-between">
              <Text>Memory</Text>
              <Box>
                <Text bold color="green">
                  8.2 GB
                </Text>
                <Text color="red"> -0.3</Text>
              </Box>
            </Box>
            <Box flexDirection="row" justifyContent="space-between">
              <Text>Disk</Text>
              <Text bold color="green">
                234 GB
              </Text>
            </Box>
            <Box flexDirection="row" justifyContent="space-between">
              <Text>Network</Text>
              <Box>
                <Text bold color="green">
                  1.2 Mb/s
                </Text>
                <Text color="green"> +0.5</Text>
              </Box>
            </Box>
          </Box>
        </Box>

        {/* Recent Activity pane */}
        <Box
          flexDirection="column"
          flexGrow={1}
          borderStyle="round"
          borderColor="gray"
          padding={1}
        >
          <Box marginBottom={1}>
            <Text bold color="white">
              Recent Activity
            </Text>
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
        <Box
          flexDirection="column"
          flexGrow={1}
          borderStyle="round"
          borderColor="gray"
          padding={1}
        >
          <Box marginBottom={1}>
            <Text bold color="white">
              Project Progress
            </Text>
          </Box>
          <Box flexDirection="column" gap={1}>
            {[
              { label: "Frontend", percent: 85 },
              { label: "Backend", percent: 72 },
              { label: "Testing", percent: 45 },
              { label: "Docs", percent: 30 },
            ].map((item) => {
              const filled = Math.round((item.percent / 100) * 20)
              const empty = 20 - filled
              return (
                <Box key={item.label} flexDirection="column">
                  <Box justifyContent="space-between">
                    <Text>{item.label}</Text>
                    <Text bold>{item.percent}%</Text>
                  </Box>
                  <Text>
                    <Text color="green">
                      {"\u2588".repeat(filled)}
                    </Text>
                    <Text dim>{"\u2591".repeat(empty)}</Text>
                  </Text>
                </Box>
              )
            })}
          </Box>
        </Box>
      </Box>

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
  )
}

// --- 2. Task List -----------------------------------------------------------

function TaskListScreenshot(): JSX.Element {
  const tasks = [
    { id: 1, title: "Review pull request #1", completed: false, priority: "high" as const },
    { id: 2, title: "Update documentation #1", completed: true, priority: "medium" as const },
    { id: 3, title: "Fix bug in authentication #1", completed: false, priority: "low" as const },
    { id: 4, title: "Implement new feature #1", completed: false, priority: "high" as const },
    { id: 5, title: "Write unit tests #1", completed: true, priority: "medium" as const },
    { id: 6, title: "Refactor legacy code #1", completed: false, priority: "low" as const },
    { id: 7, title: "Update dependencies #1", completed: false, priority: "high" as const },
    { id: 8, title: "Create API endpoint #1", completed: true, priority: "medium" as const },
    { id: 9, title: "Design database schema #1", completed: false, priority: "low" as const },
    { id: 10, title: "Optimize performance #1", completed: false, priority: "high" as const },
    { id: 11, title: "Add error handling #1", completed: false, priority: "medium" as const },
    { id: 12, title: "Setup CI/CD pipeline #1", completed: true, priority: "low" as const },
  ]
  const cursor = 3

  const prioritySymbols = { high: "!!!", medium: "!!", low: "!" }
  const priorityColors = { high: "red", medium: "yellow", low: "green" }

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="yellow">
          Task List
        </Text>
      </Box>

      <Box
        flexGrow={1}
        flexDirection="column"
        borderStyle="round"
        borderColor="blue"
        overflow="hidden"
      >
        {tasks.map((task, index) => {
          const checkbox = task.completed ? "[x]" : "[ ]"
          const isSelected = index === cursor

          return (
            <Box key={task.id}>
              {isSelected ? (
                <Text backgroundColor="cyan" color="black">
                  {" "}
                  {checkbox} {task.title}{" "}
                </Text>
              ) : (
                <Text strikethrough={task.completed} dim={task.completed}>
                  {checkbox} {task.title}
                </Text>
              )}{" "}
              <Text
                color={priorityColors[task.priority]}
                bold
              >
                [{prioritySymbols[task.priority]}]
              </Text>
            </Box>
          )
        })}
      </Box>

      <Box justifyContent="space-between">
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
          <Text bold>4</Text>/12 (33%) | 4/12{" "}
        </Text>
      </Box>
    </Box>
  )
}

// --- 3. Kanban Board --------------------------------------------------------

function KanbanScreenshot(): JSX.Element {
  const columns = [
    {
      id: "todo",
      title: "To Do",
      isSelected: true,
      cards: [
        { title: "Design new landing page", tags: ["design"], isSelected: true },
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
        { title: "User authentication", tags: ["backend", "security"], isSelected: false },
        { title: "Dashboard redesign", tags: ["frontend", "design"], isSelected: false },
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
    frontend: "cyan",
    backend: "magenta",
    design: "yellow",
    devops: "green",
    docs: "blue",
    ux: "white",
    security: "red",
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="yellow">
          Kanban Board
        </Text>
      </Box>

      <Box flexGrow={1} flexDirection="row" gap={1} overflow="hidden">
        {columns.map((col) => (
          <Box
            key={col.id}
            flexDirection="column"
            flexGrow={1}
            borderStyle="single"
            borderColor={col.isSelected ? "cyan" : "gray"}
          >
            <Box
              backgroundColor={col.isSelected ? "cyan" : undefined}
              paddingX={1}
            >
              <Text bold color={col.isSelected ? "black" : "white"}>
                {col.title}
              </Text>
              <Text color={col.isSelected ? "black" : "gray"}>
                {" "}
                ({col.cards.length})
              </Text>
            </Box>

            <Box flexDirection="column" paddingX={1} flexGrow={1} gap={1}>
              {col.cards.map((card, idx) => (
                <Box
                  key={idx}
                  flexDirection="column"
                  borderStyle="round"
                  borderColor={card.isSelected ? "cyan" : "gray"}
                  paddingX={1}
                >
                  {card.isSelected ? (
                    <Text backgroundColor="cyan" color="black" bold>
                      {card.title}
                    </Text>
                  ) : (
                    <Text>{card.title}</Text>
                  )}
                  <Box gap={1}>
                    {card.tags.map((tag) => (
                      <Text key={tag} color={tagColors[tag] ?? "gray"} dim>
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

function LayoutPane({
  title,
  color,
  grow = 1,
}: {
  title: string
  color: string
  grow?: number
}): JSX.Element {
  const rect = useContentRect()
  return (
    <Box
      flexGrow={grow}
      borderStyle="round"
      borderColor={color}
      padding={1}
      flexDirection="column"
    >
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

function LayoutFeedbackScreenshot(): JSX.Element {
  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="yellow">
          Layout Feedback Demo
        </Text>
      </Box>

      <Box flexDirection="row" gap={1} height={8}>
        <LayoutPane title="Sidebar" color="green" grow={1} />
        <LayoutPane title="Main Content" color="blue" grow={2} />
        <LayoutPane title="Detail" color="cyan" grow={1} />
      </Box>

      <Box marginTop={1} borderStyle="single" borderColor="gray" padding={1}>
        <Box flexDirection="column">
          <Text bold>
            useContentRect() — components know their size during render
          </Text>
          <Text dim>
            No ResizeObserver, no second render, no layout jank.
          </Text>
          <Text dim>
            Each pane above displays its own dimensions via useContentRect().
          </Text>
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
    cols: 100,
    rows: 22,
  },
  {
    name: "Task List",
    filename: "task-list.png",
    element: <TaskListScreenshot />,
    cols: 80,
    rows: 20,
  },
  {
    name: "Kanban Board",
    filename: "kanban.png",
    element: <KanbanScreenshot />,
    cols: 100,
    rows: 24,
  },
  {
    name: "Layout Feedback",
    filename: "layout-feedback.png",
    element: <LayoutFeedbackScreenshot />,
    cols: 90,
    rows: 18,
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
