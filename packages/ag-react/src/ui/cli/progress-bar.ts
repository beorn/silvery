/**
 * CLI ProgressBar - Determinate progress indicator with ETA
 */

import chalk from "@silvery/ink/chalk"
import type { ProgressBarOptions } from "../types.js"
import { CURSOR_HIDE, CURSOR_SHOW, CURSOR_TO_START, CLEAR_LINE_END, write, isTTY, getTerminalWidth } from "./ansi"
import { calculateETA, formatETA, DEFAULT_ETA_BUFFER_SIZE, type ETASample } from "../utils/eta"

/** Default format string */
const DEFAULT_FORMAT = ":bar :percent | :current/:total | ETA: :eta"

/**
 * ProgressBar class for CLI progress indication
 *
 * @example
 * ```ts
 * const bar = new ProgressBar({ total: 100 });
 * bar.start();
 * for (let i = 0; i <= 100; i++) {
 *   await doWork();
 *   bar.update(i);
 * }
 * bar.stop();
 * ```
 */
export class ProgressBar {
  private total: number
  private format: string
  private width: number
  private complete: string
  private incomplete: string
  private stream: NodeJS.WriteStream
  private hideCursor: boolean
  private phases: Record<string, string>

  private current = 0
  private phase: string | null = null
  private startTime: number | null = null
  private isActive = false

  // ETA smoothing - track last N update times
  private etaBuffer: ETASample[] = []

  constructor(options: ProgressBarOptions = {}) {
    this.total = options.total ?? 100
    this.format = options.format ?? DEFAULT_FORMAT
    this.width = options.width ?? 40
    this.complete = options.complete ?? "█"
    this.incomplete = options.incomplete ?? "░"
    this.stream = options.stream ?? process.stdout
    this.hideCursor = options.hideCursor ?? true
    this.phases = options.phases ?? {}
  }

  /**
   * Start the progress bar
   */
  start(initialValue = 0, initialTotal?: number): this {
    if (initialTotal !== undefined) {
      this.total = initialTotal
    }

    this.current = initialValue
    this.startTime = Date.now()
    this.isActive = true
    this.etaBuffer = [{ time: this.startTime, value: initialValue }]

    if (this.hideCursor && isTTY(this.stream)) {
      write(CURSOR_HIDE, this.stream)
    }

    this.render()
    return this
  }

  /**
   * Update progress value
   */
  update(value: number, tokens?: Record<string, string | number>): this {
    this.current = Math.min(value, this.total)

    // Update ETA buffer
    const now = Date.now()
    this.etaBuffer.push({ time: now, value: this.current })
    if (this.etaBuffer.length > DEFAULT_ETA_BUFFER_SIZE) {
      this.etaBuffer.shift()
    }

    if (this.isActive) {
      this.render(tokens)
    }

    return this
  }

  /**
   * Increment progress by amount (default: 1)
   */
  increment(amount = 1, tokens?: Record<string, string | number>): this {
    return this.update(this.current + amount, tokens)
  }

  /**
   * Set the current phase (for multi-phase progress)
   */
  setPhase(phaseName: string, options?: { current?: number; total?: number }): this {
    this.phase = phaseName

    if (options?.total !== undefined) {
      this.total = options.total
    }
    if (options?.current !== undefined) {
      this.current = options.current
      // Reset ETA buffer on phase change
      this.etaBuffer = [{ time: Date.now(), value: this.current }]
    }

    if (this.isActive) {
      this.render()
    }

    return this
  }

  /**
   * Stop the progress bar
   */
  stop(clear = false): this {
    if (!this.isActive) {
      return this
    }

    this.isActive = false

    if (clear && isTTY(this.stream)) {
      write(`${CURSOR_TO_START}${CLEAR_LINE_END}`, this.stream)
    } else {
      write("\n", this.stream)
    }

    if (this.hideCursor && isTTY(this.stream)) {
      write(CURSOR_SHOW, this.stream)
    }

    return this
  }

  /** Get ETA in seconds using smoothed rate */
  private getETASeconds(): number | null {
    return calculateETA(this.etaBuffer, this.current, this.total)
  }

  /**
   * Render the progress bar
   */
  private render(tokens?: Record<string, string | number>): void {
    const percent = this.total > 0 ? this.current / this.total : 0
    const eta = this.getETASeconds()

    // Build the bar
    const completeLength = Math.round(this.width * percent)
    const incompleteLength = this.width - completeLength
    const bar = this.complete.repeat(completeLength) + this.incomplete.repeat(incompleteLength)

    // Get phase display name
    const phaseDisplay = this.phase ? (this.phases[this.phase] ?? this.phase) : ""

    // Calculate rate
    const elapsed = this.startTime ? (Date.now() - this.startTime) / 1000 : 0
    const rate = elapsed > 0 ? this.current / elapsed : 0

    // Replace tokens in format string
    let output = this.format
      .replace(":bar", chalk.cyan(bar))
      .replace(":percent", `${Math.round(percent * 100)}%`.padStart(4))
      .replace(":current", String(this.current))
      .replace(":total", String(this.total))
      .replace(":eta", formatETA(eta))
      .replace(":elapsed", formatETA(elapsed))
      .replace(":rate", rate.toFixed(1))
      .replace(":phase", chalk.dim(phaseDisplay))

    // Replace custom tokens
    if (tokens) {
      for (const [key, value] of Object.entries(tokens)) {
        output = output.replace(`:${key}`, String(value))
      }
    }

    // Truncate to terminal width
    const termWidth = getTerminalWidth(this.stream)
    if (output.length > termWidth) {
      output = output.slice(0, termWidth - 1)
    }

    if (isTTY(this.stream)) {
      write(`${CURSOR_TO_START}${output}${CLEAR_LINE_END}`, this.stream)
    }
  }

  /**
   * Get current progress ratio (0-1)
   */
  get ratio(): number {
    return this.total > 0 ? this.current / this.total : 0
  }

  /**
   * Get current progress percentage (0-100)
   */
  get percentage(): number {
    return Math.round(this.ratio * 100)
  }

  /**
   * Dispose the progress bar (calls stop)
   */
  [Symbol.dispose](): void {
    this.stop()
  }
}
