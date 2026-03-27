/**
 * CLI Spinner - Animated indeterminate progress indicator
 */

import chalk from "@silvery/ink/chalk"
import type { SpinnerOptions, SpinnerStyle } from "../types.js"
import { CURSOR_HIDE, CURSOR_SHOW, CURSOR_TO_START, CLEAR_LINE_END, write, isTTY } from "./ansi"

/** Spinner animation frames by style */
export const SPINNER_FRAMES: Record<SpinnerStyle, string[]> = {
  dots: ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"],
  line: ["-", "\\", "|", "/"],
  arc: ["◜", "◠", "◝", "◞", "◡", "◟"],
  bounce: ["⠁", "⠂", "⠄", "⠂"],
  pulse: ["█", "▓", "▒", "░", "▒", "▓"],
}

/** Default intervals for each style (ms) */
export const SPINNER_INTERVALS: Record<SpinnerStyle, number> = {
  dots: 80,
  line: 120,
  arc: 100,
  bounce: 120,
  pulse: 100,
}

/**
 * Spinner class for CLI progress indication
 *
 * @example
 * ```ts
 * const spinner = new Spinner("Loading...");
 * spinner.start();
 * await doWork();
 * spinner.succeed("Done!");
 * ```
 */
export class Spinner {
  private text: string
  private style: SpinnerStyle
  private color: string
  private stream: NodeJS.WriteStream
  private hideCursor: boolean
  private interval: number

  private frameIndex = 0
  private timer: ReturnType<typeof setInterval> | null = null
  private isSpinning = false

  constructor(textOrOptions?: string | SpinnerOptions) {
    const options: SpinnerOptions = typeof textOrOptions === "string" ? { text: textOrOptions } : (textOrOptions ?? {})

    this.text = options.text ?? ""
    this.style = options.style ?? "dots"
    this.color = options.color ?? "cyan"
    this.stream = options.stream ?? process.stdout
    this.hideCursor = options.hideCursor ?? true
    this.interval = options.interval ?? SPINNER_INTERVALS[this.style]
  }

  /** Get current spinner text */
  get currentText(): string {
    return this.text
  }

  /** Set spinner text (updates immediately if spinning) */
  set currentText(value: string) {
    this.text = value
    if (this.isSpinning) {
      this.render()
    }
  }

  /** Check if spinner is currently active */
  get spinning(): boolean {
    return this.isSpinning
  }

  /**
   * Start the spinner animation
   */
  start(text?: string): this {
    if (text !== undefined) {
      this.text = text
    }

    if (this.isSpinning) {
      return this
    }

    this.isSpinning = true
    this.frameIndex = 0

    if (this.hideCursor && isTTY(this.stream)) {
      write(CURSOR_HIDE, this.stream)
    }

    this.render()
    this.timer = setInterval(() => {
      this.frameIndex = (this.frameIndex + 1) % SPINNER_FRAMES[this.style].length
      this.render()
    }, this.interval)

    return this
  }

  /**
   * Stop the spinner
   */
  stop(): this {
    if (!this.isSpinning) {
      return this
    }

    this.isSpinning = false

    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }

    this.clear()

    if (this.hideCursor && isTTY(this.stream)) {
      write(CURSOR_SHOW, this.stream)
    }

    return this
  }

  /**
   * Stop with success message (green checkmark)
   */
  succeed(text?: string): this {
    return this.stopWithSymbol(chalk.green("✔"), text ?? this.text)
  }

  /**
   * Stop with failure message (red X)
   */
  fail(text?: string): this {
    return this.stopWithSymbol(chalk.red("✖"), text ?? this.text)
  }

  /**
   * Stop with warning message (yellow warning)
   */
  warn(text?: string): this {
    return this.stopWithSymbol(chalk.yellow("⚠"), text ?? this.text)
  }

  /**
   * Stop with info message (blue info)
   */
  info(text?: string): this {
    return this.stopWithSymbol(chalk.blue("ℹ"), text ?? this.text)
  }

  /**
   * Clear the spinner line
   */
  clear(): this {
    if (isTTY(this.stream)) {
      write(`${CURSOR_TO_START}${CLEAR_LINE_END}`, this.stream)
    }
    return this
  }

  private render(): void {
    const frame = SPINNER_FRAMES[this.style][this.frameIndex]
    const colorFn = (chalk as unknown as Record<string, (s: string) => string>)[this.color]
    const coloredFrame = colorFn ? colorFn(frame!) : frame!
    const output = this.text ? `${coloredFrame} ${this.text}` : coloredFrame

    if (isTTY(this.stream)) {
      write(`${CURSOR_TO_START}${output}${CLEAR_LINE_END}`, this.stream)
    }
  }

  private stopWithSymbol(symbol: string, text: string): this {
    this.stop()
    write(`${symbol} ${text}\n`, this.stream)
    return this
  }

  /**
   * Dispose the spinner (calls stop)
   */
  [Symbol.dispose](): void {
    this.stop()
  }

  /**
   * Static helper to quickly start a spinner
   * Returns a stop function
   *
   * @example
   * ```ts
   * const stop = Spinner.start("Loading...");
   * await doWork();
   * stop();
   * ```
   */
  static start(textOrOptions?: string | SpinnerOptions): () => void {
    const spinner = new Spinner(textOrOptions)
    spinner.start()
    return () => spinner.stop()
  }
}

/**
 * Callable spinner interface - call with text to show/update
 *
 * @example
 * ```ts
 * {
 *   using spinner = createSpinner({ style: "dots" });
 *   spinner("Loading...");  // Shows spinner with text
 *   spinner("Still loading...");  // Updates text
 * } // Auto-stops via Symbol.dispose
 * ```
 */
export interface CallableSpinner extends Disposable {
  /** Call with text to show/update the spinner */
  (text: string): void
  /** Stop the spinner */
  stop(): void
  /** Stop with success message (green checkmark) */
  succeed(text?: string): void
  /** Stop with failure message (red X) */
  fail(text?: string): void
  /** Stop with warning message (yellow warning) */
  warn(text?: string): void
  /** Stop with info message (blue info) */
  info(text?: string): void
}

/**
 * Create a callable, disposable spinner
 *
 * The spinner is lazy - it won't show anything until you call it with text.
 * Use with `using` for automatic cleanup:
 *
 * @example
 * ```ts
 * {
 *   using spinner = createSpinner({ style: "dots" });
 *   // Nothing visible yet
 *
 *   spinner("Loading repo...");  // Now shows spinner
 *   spinner("Applying events...");  // Updates text
 * } // Auto-stops via Symbol.dispose
 * ```
 */
export function createSpinner(options?: SpinnerOptions): CallableSpinner {
  const spinner = new Spinner({ ...options, text: "" })

  const callable = ((text: string) => {
    // Always restart if not spinning (handles initial call and after succeed/fail/etc)
    if (!spinner.spinning) {
      spinner.start(text)
    } else {
      spinner.currentText = text
    }
  }) as CallableSpinner

  callable.stop = () => spinner.stop()
  callable.succeed = (text) => spinner.succeed(text)
  callable.fail = (text) => spinner.fail(text)
  callable.warn = (text) => spinner.warn(text)
  callable.info = (text) => spinner.info(text)
  callable[Symbol.dispose] = () => spinner.stop()

  return callable
}
