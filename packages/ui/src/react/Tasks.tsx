/**
 * React Tasks component - listr2-style task list for TUI apps
 */

import React from "react"
import type { TaskProps, TaskStatus } from "../types.js"
import { useSpinnerFrame } from "./Spinner"

/** Status icons for tasks */
const STATUS_ICONS: Record<TaskStatus, string> = {
  pending: "○",
  running: "", // Will use spinner
  completed: "✔",
  failed: "✖",
  skipped: "⊘",
}

/** Status colors */
const STATUS_COLORS: Record<TaskStatus, string> = {
  pending: "gray",
  running: "cyan",
  completed: "green",
  failed: "red",
  skipped: "yellow",
}

/**
 * Single task component
 *
 * @example
 * ```tsx
 * <Task title="Downloading files" status="running">
 *   <ProgressBar value={50} total={100} />
 * </Task>
 * ```
 */
export function Task({ title, status, children }: TaskProps): React.ReactElement {
  const spinnerFrame = useSpinnerFrame("dots")
  const icon = status === "running" ? spinnerFrame : STATUS_ICONS[status]
  const color = STATUS_COLORS[status]

  return (
    <div data-progressx-task data-status={status} data-color={color}>
      <span data-icon>{icon}</span>
      <span data-title> {title}</span>
      {children != null ? <div data-children>{children as React.ReactNode}</div> : null}
    </div>
  )
}

/**
 * Container for multiple tasks
 *
 * @example
 * ```tsx
 * <Tasks>
 *   <Task title="Scanning files" status="completed" />
 *   <Task title="Processing" status="running">
 *     <ProgressBar value={current} total={total} />
 *   </Task>
 *   <Task title="Cleanup" status="pending" />
 * </Tasks>
 * ```
 */
export function Tasks({ children }: { children: React.ReactNode }): React.ReactElement {
  return <div data-progressx-tasks>{children}</div>
}

/**
 * Hook for managing task state
 *
 * @example
 * ```tsx
 * function MyTasks() {
 *   const { tasks, start, complete, fail, updateProgress } = useTasks([
 *     { id: 'scan', title: 'Scanning' },
 *     { id: 'process', title: 'Processing' },
 *   ]);
 *
 *   useEffect(() => {
 *     start('scan');
 *     doScan().then(() => {
 *       complete('scan');
 *       start('process');
 *     });
 *   }, []);
 *
 *   return (
 *     <Tasks>
 *       {tasks.map(t => <Task key={t.id} title={t.title} status={t.status} />)}
 *     </Tasks>
 *   );
 * }
 * ```
 */
export function useTasks(initialTasks: Array<{ id: string; title: string }>) {
  const [tasks, setTasks] = React.useState<
    Array<{
      id: string
      title: string
      status: TaskStatus
      progress?: { current: number; total: number }
    }>
  >(
    initialTasks.map((t) => ({
      ...t,
      status: "pending" as TaskStatus,
    })),
  )

  const updateTask = (
    id: string,
    updates: Partial<{
      status: TaskStatus
      title: string
      progress: { current: number; total: number }
    }>,
  ) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...updates } : t)))
  }

  const start = (id: string) => updateTask(id, { status: "running" })
  const complete = (id: string, title?: string) => updateTask(id, { status: "completed", ...(title && { title }) })
  const fail = (id: string, title?: string) => updateTask(id, { status: "failed", ...(title && { title }) })
  const skip = (id: string, title?: string) => updateTask(id, { status: "skipped", ...(title && { title }) })
  const updateProgress = (id: string, progress: { current: number; total: number }) => updateTask(id, { progress })

  const getTask = (id: string) => tasks.find((t) => t.id === id)
  const allCompleted = tasks.every((t) => t.status === "completed" || t.status === "skipped")
  const hasFailed = tasks.some((t) => t.status === "failed")

  return {
    tasks,
    start,
    complete,
    fail,
    skip,
    updateProgress,
    updateTask,
    getTask,
    allCompleted,
    hasFailed,
  }
}
