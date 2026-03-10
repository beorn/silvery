/**
 * MultiProgress - Container for managing multiple concurrent progress indicators
 */

import chalk from "chalk";
import type { SpinnerStyle, TaskStatus } from "../types.js";
import { CURSOR_HIDE, CURSOR_SHOW, CLEAR_LINE, cursorUp, write, isTTY } from "./ansi";
import { Spinner, SPINNER_FRAMES } from "./spinner";
import { ProgressBar } from "./progress-bar";

/** Status icons */
const STATUS_ICONS: Record<TaskStatus, string> = {
  pending: chalk.gray("○"),
  running: "", // Will be replaced with spinner frame
  completed: chalk.green("✔"),
  failed: chalk.red("✖"),
  skipped: chalk.yellow("⊘"),
};

/** Task configuration */
interface TaskConfig {
  title: string;
  type: "spinner" | "bar" | "group";
  status: TaskStatus;
  total?: number;
  current?: number;
  spinnerStyle?: SpinnerStyle;
  indent?: number;
}

/** Internal task state */
interface TaskState extends TaskConfig {
  id: string;
  /** Completion time in ms (shown dimmed after title on completion) */
  completionTime?: number;
}

/**
 * MultiProgress - Manage multiple concurrent progress indicators
 *
 * @example
 * ```ts
 * const multi = new MultiProgress();
 *
 * const download = multi.add("Downloading files", { type: "bar", total: 100 });
 * const process = multi.add("Processing", { type: "spinner" });
 *
 * download.start();
 * download.update(50);
 * download.complete();
 *
 * process.start();
 * process.complete();
 *
 * multi.stop();
 * ```
 */
export class MultiProgress {
  private tasks: Map<string, TaskState> = new Map();
  private taskOrder: string[] = [];
  private stream: NodeJS.WriteStream;
  private isActive = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private frameIndex = 0;
  private renderedLines = 0;

  constructor(stream: NodeJS.WriteStream = process.stdout) {
    this.stream = stream;
  }

  /**
   * Add a new task
   * @param insertAfter - ID of task to insert after (for hierarchical display)
   */
  add(
    title: string,
    options: {
      type?: "spinner" | "bar" | "group";
      total?: number;
      spinnerStyle?: SpinnerStyle;
      indent?: number;
      insertAfter?: string;
    } = {},
  ): TaskHandle {
    const id = `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const task: TaskState = {
      id,
      title,
      type: options.type ?? "spinner",
      status: "pending",
      total: options.total,
      current: 0,
      spinnerStyle: options.spinnerStyle ?? "dots",
      indent: options.indent ?? 0,
    };

    this.tasks.set(id, task);

    // Insert after specified task, or append to end
    if (options.insertAfter) {
      const afterIndex = this.taskOrder.indexOf(options.insertAfter);
      if (afterIndex >= 0) {
        this.taskOrder.splice(afterIndex + 1, 0, id);
      } else {
        this.taskOrder.push(id);
      }
    } else {
      this.taskOrder.push(id);
    }

    if (this.isActive) {
      this.render();
    }

    return new TaskHandle(this, id);
  }

  /**
   * Start the multi-progress display
   */
  start(): this {
    if (this.isActive) {
      return this;
    }

    this.isActive = true;

    if (isTTY(this.stream)) {
      write(CURSOR_HIDE, this.stream);
    }

    this.render();

    // Start animation timer
    this.timer = setInterval(() => {
      this.frameIndex = (this.frameIndex + 1) % 10;
      this.render();
    }, 80);

    return this;
  }

  /**
   * Dispose the multi-progress display (calls stop)
   */
  [Symbol.dispose](): void {
    this.stop();
  }

  /**
   * Stop the multi-progress display
   * @param clear - If true, clear all task lines from terminal
   */
  stop(clear = false): this {
    if (!this.isActive) {
      return this;
    }

    this.isActive = false;

    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    if (clear && isTTY(this.stream)) {
      // Clear all rendered lines
      if (this.renderedLines > 0) {
        write(cursorUp(this.renderedLines), this.stream);
        for (let i = 0; i < this.renderedLines; i++) {
          write(`${CLEAR_LINE}\n`, this.stream);
        }
        write(cursorUp(this.renderedLines), this.stream);
      }
    } else {
      // Final render
      this.render();
      write("\n", this.stream);
    }

    if (isTTY(this.stream)) {
      write(CURSOR_SHOW, this.stream);
    }

    return this;
  }

  /** @internal Update task state */
  _updateTask(id: string, updates: Partial<TaskState>): void {
    const task = this.tasks.get(id);
    if (task) {
      Object.assign(task, updates);
      // Only render immediately for status changes (complete/fail/etc.)
      // Progress updates (current/total) are debounced by the 80ms animation timer
      if (this.isActive && updates.status) {
        this.render();
      }
    }
  }

  /** @internal Get task state */
  _getTask(id: string): TaskState | undefined {
    return this.tasks.get(id);
  }

  private render(): void {
    if (!isTTY(this.stream)) {
      return;
    }

    // Move cursor up to clear previous render
    if (this.renderedLines > 0) {
      write(cursorUp(this.renderedLines), this.stream);
    }

    const lines: string[] = [];

    for (const id of this.taskOrder) {
      const task = this.tasks.get(id);
      if (!task) continue;

      let icon: string;
      if (task.status === "running") {
        if (task.type === "group") {
          // Groups don't animate - keep pending icon while running
          icon = STATUS_ICONS.pending;
        } else {
          const frames = SPINNER_FRAMES[task.spinnerStyle ?? "dots"];
          icon = chalk.cyan(frames[this.frameIndex % frames.length]);
        }
      } else {
        icon = STATUS_ICONS[task.status];
      }

      const indent = "  ".repeat(task.indent ?? 0);
      let line = `${indent}${icon} ${task.title}`;

      // Add progress bar for bar type
      if (task.type === "bar" && task.total && task.total > 0) {
        const percent = task.current! / task.total;
        const barWidth = 20;
        const filled = Math.round(barWidth * percent);
        const empty = barWidth - filled;
        const bar = chalk.cyan("█".repeat(filled)) + chalk.gray("░".repeat(empty));
        line += ` ${bar} ${Math.round(percent * 100)}%`;
      }

      // Add completion time in dimmed text
      if (task.status === "completed" && task.completionTime !== undefined) {
        line += chalk.dim(` ${task.completionTime}ms`);
      }

      lines.push(line);
    }

    // Clear and write each line
    for (const line of lines) {
      write(`${CLEAR_LINE}${line}\n`, this.stream);
    }

    this.renderedLines = lines.length;
  }
}

/**
 * Handle for controlling an individual task
 */
class TaskHandle {
  constructor(
    private multi: MultiProgress,
    private _id: string,
  ) {}

  /** Get task ID (for insertAfter) */
  get id(): string {
    return this._id;
  }

  /** Start the task (set status to running) */
  start(): this {
    this.multi._updateTask(this._id, { status: "running" });
    return this;
  }

  /** Update progress (for bar type) */
  update(current: number): this {
    this.multi._updateTask(this._id, { current });
    return this;
  }

  /** Mark task as completed */
  complete(titleOrTime?: string | number): this {
    const updates: Partial<TaskState> = { status: "completed" };
    if (typeof titleOrTime === "number") {
      // Numeric = completion time in ms (preserves current title)
      updates.completionTime = titleOrTime;
    } else if (titleOrTime) {
      // String = new title (legacy behavior)
      updates.title = titleOrTime;
    }
    this.multi._updateTask(this._id, updates);
    return this;
  }

  /** Mark task as failed */
  fail(title?: string): this {
    const updates: Partial<TaskState> = { status: "failed" };
    if (title) updates.title = title;
    this.multi._updateTask(this._id, updates);
    return this;
  }

  /** Mark task as skipped */
  skip(title?: string): this {
    const updates: Partial<TaskState> = { status: "skipped" };
    if (title) updates.title = title;
    this.multi._updateTask(this._id, updates);
    return this;
  }

  /** Update task title */
  setTitle(title: string): this {
    this.multi._updateTask(this._id, { title });
    return this;
  }

  /** Change task type (e.g., from spinner to group when sub-steps are added) */
  setType(type: "spinner" | "bar" | "group"): this {
    this.multi._updateTask(this._id, { type });
    return this;
  }

  /** Get current status */
  get status(): TaskStatus {
    return this.multi._getTask(this._id)?.status ?? "pending";
  }
}

export type { TaskHandle };
