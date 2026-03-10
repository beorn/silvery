/**
 * React components for TUI progress indicators
 *
 * @example
 * ```tsx
 * import { Spinner, ProgressBar, Tasks, Task, useProgress } from "@silvery/ui/react";
 *
 * // Spinner
 * <Spinner label="Loading..." style="dots" />
 *
 * // Progress bar
 * <ProgressBar value={50} total={100} showPercentage showETA />
 *
 * // Task list
 * <Tasks>
 *   <Task title="Scanning" status="completed" />
 *   <Task title="Processing" status="running" />
 * </Tasks>
 *
 * // Context for nested components
 * <ProgressProvider>
 *   <App />
 * </ProgressProvider>
 * ```
 */

export { Spinner, useSpinnerFrame } from "./Spinner";
export { ProgressBar, useProgressBar } from "./ProgressBar";
export { Task, Tasks, useTasks } from "./Tasks";
export { ProgressProvider, useProgress, ProgressIndicator } from "./context";
