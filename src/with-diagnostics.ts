/**
 * withDiagnostics - Plugin for buffer and rendering diagnostic checks
 *
 * Wraps the `cmd` object to check invariants after command execution:
 * - All commands: Check incremental vs fresh render
 * - Cursor moves: Also check buffer content stability
 * - Optional: ANSI replay verification (simulates terminal receiving diff)
 *
 * ## Design Note: Why wrap `cmd` instead of `sendInput`?
 *
 * The two approaches are complementary:
 *
 * 1. **`sendInput()` level** (in renderer.ts) — Already has `INKX_CHECK_INCREMENTAL`
 *    which catches ALL inputs regardless of how they arrive (raw key presses,
 *    type(), press(), etc.). This is the right place for incremental render checks.
 *
 * 2. **`cmd` level** (this plugin) — Command-aware, can selectively check stability
 *    for cursor moves only. Raw sendInput doesn't know which inputs are cursor
 *    commands that should preserve content. Another option would be `withInput()`
 *    which could wrap sendInput with awareness of what input was sent.
 *
 * This plugin focuses on the command-aware checks. For comprehensive incremental
 * render checking, use `INKX_STRICT=1` environment variable which enables all checks.
 *
 * @example
 * ```typescript
 * import { withDiagnostics } from 'inkx/toolbelt';
 *
 * // All checks enabled by default when you call withDiagnostics()
 * const driver = withDiagnostics(createBoardDriver(repo, rootId));
 *
 * // Or disable specific checks
 * const driver = withDiagnostics(createBoardDriver(repo, rootId), {
 *   checkReplay: false  // skip ANSI replay check
 * });
 *
 * // Commands now run invariant checks automatically
 * await driver.cmd.down();  // Checks incremental + stability + replay
 * await driver.cmd.search();  // Checks incremental + replay
 * ```
 */

import { mkdir } from "node:fs/promises"
import { join } from "node:path"
import type { TerminalBuffer } from "./buffer.js"
import { outputPhase } from "./pipeline/index.js"
import { compareBuffers, formatMismatch } from "./testing/compare-buffers.js"
import type { BoxProps, InkxNode } from "./types.js"
import type { AppWithCommands, Cmd, Command } from "./with-commands.js"

// =============================================================================
// Types
// =============================================================================

export interface DiagnosticOptions {
  /** Check incremental vs fresh render (default: true when plugin is used) */
  checkIncremental?: boolean
  /** Check buffer stability for cursor commands (default: true when plugin is used) */
  checkStability?: boolean
  /** Check ANSI replay produces correct result (default: true when plugin is used) */
  checkReplay?: boolean
  /** Check layout tree integrity after each command (default: true when plugin is used) */
  checkLayout?: boolean
  /** Lines to skip for stability check (e.g., [0, -1] for breadcrumb/statusbar) */
  skipLines?: number[]
  /** Capture screenshot on failure (default: false) */
  captureOnFailure?: boolean
  /** Directory for failure screenshots (default: /tmp/inkx-diagnostics) */
  screenshotDir?: string
}

/**
 * Text mismatch between before and after states
 */
interface TextMismatch {
  line: number
  before: string
  after: string
}

/**
 * ANSI replay mismatch
 */
interface ReplayMismatch {
  x: number
  y: number
  expected: string
  actual: string
}

// =============================================================================
// VirtualTerminal - ANSI Replay Simulator
// =============================================================================

/**
 * Virtual terminal simulator for testing ANSI replay equivalence.
 *
 * Parses ANSI sequences and applies them to a 2D character grid.
 * Used to verify the Replay Equivalence invariant: applying the ANSI
 * diff to the previous buffer state should produce the target buffer.
 *
 * Handles:
 * - Cursor positioning (H, G, A, B, C, D)
 * - Line clear (K)
 * - Wide characters (emojis, CJK)
 * - CR/LF
 */
export class VirtualTerminal {
  private grid: string[][]
  private wideMarker: boolean[][]
  private cursorX = 0
  private cursorY = 0

  constructor(
    public readonly width: number,
    public readonly height: number,
  ) {
    this.grid = Array.from({ length: height }, () => Array(width).fill(" "))
    this.wideMarker = Array.from({ length: height }, () => Array(width).fill(false))
  }

  /**
   * Initialize grid from a TerminalBuffer (for incremental replay).
   */
  loadFromBuffer(buffer: TerminalBuffer): void {
    for (let y = 0; y < Math.min(this.height, buffer.height); y++) {
      for (let x = 0; x < Math.min(this.width, buffer.width); x++) {
        if (buffer.isCellContinuation(x, y)) {
          this.wideMarker[y]![x] = true
          this.grid[y]![x] = ""
        } else {
          this.grid[y]![x] = buffer.getCellChar(x, y)
          this.wideMarker[y]![x] = false
        }
      }
    }
  }

  /**
   * Apply ANSI escape sequence string to the virtual terminal.
   */
  applyAnsi(ansi: string): void {
    let i = 0
    while (i < ansi.length) {
      if (ansi[i] === "\x1b" && ansi[i + 1] === "[") {
        const match = ansi.slice(i).match(/^\x1b\[([0-9;:?]*)([A-Za-z])/)
        if (match) {
          this.handleCsi(match[1] || "", match[2]!)
          i += match[0].length
          continue
        }
      }

      if (ansi[i] === "\r") {
        this.cursorX = 0
        i++
        continue
      }

      if (ansi[i] === "\n") {
        this.cursorY = Math.min(this.cursorY + 1, this.height - 1)
        i++
        continue
      }

      // Handle multi-byte Unicode characters
      const char = this.extractChar(ansi, i)
      if (this.cursorX < this.width && this.cursorY < this.height) {
        this.grid[this.cursorY]![this.cursorX] = char
        this.wideMarker[this.cursorY]![this.cursorX] = false
        this.cursorX++

        // Wide characters take 2 columns
        if (this.isWideChar(char) && this.cursorX < this.width) {
          this.grid[this.cursorY]![this.cursorX] = ""
          this.wideMarker[this.cursorY]![this.cursorX] = true
          this.cursorX++
        }
      }
      i += char.length
    }
  }

  /**
   * Check if a character is wide (emoji, CJK, etc).
   */
  private isWideChar(char: string): boolean {
    if (char.length === 0) return false

    // Characters with VS16 (U+FE0F) are emoji presentation = 2 columns
    if (char.includes("\uFE0F")) return true

    const code = char.codePointAt(0) || 0

    // Emoji ranges
    if (code >= 0x1f300 && code <= 0x1f9ff) return true
    if (code >= 0x2600 && code <= 0x26ff) return true
    if (code >= 0x2700 && code <= 0x27bf) return true

    // CJK ranges
    if (code >= 0x4e00 && code <= 0x9fff) return true
    if (code >= 0x3000 && code <= 0x303f) return true
    if (code >= 0xff00 && code <= 0xffef) return true

    return false
  }

  /**
   * Extract a single Unicode character (which may be multiple bytes).
   * Includes VS16 (U+FE0F) if it follows, since VS16 is a presentation selector
   * that modifies the preceding character's rendering width.
   */
  private extractChar(str: string, start: number): string {
    const code = str.codePointAt(start)
    if (code === undefined) return str[start] || ""
    let char: string
    if (code > 0xffff) {
      char = String.fromCodePoint(code)
    } else {
      char = str[start] || ""
    }
    // Absorb VS16 (U+FE0F) if it follows — it's a presentation modifier
    const nextIdx = start + char.length
    if (nextIdx < str.length && str.codePointAt(nextIdx) === 0xfe0f) {
      char += "\uFE0F"
    }
    return char
  }

  private handleCsi(params: string, cmd: string): void {
    switch (cmd) {
      case "H": {
        const parts = params.split(";")
        this.cursorY = Math.max(0, (Number.parseInt(parts[0] || "1", 10) || 1) - 1)
        this.cursorX = Math.max(0, (Number.parseInt(parts[1] || "1", 10) || 1) - 1)
        break
      }
      case "G": {
        this.cursorX = Math.max(0, (Number.parseInt(params || "1", 10) || 1) - 1)
        break
      }
      case "A": {
        const n = Number.parseInt(params || "1", 10) || 1
        this.cursorY = Math.max(0, this.cursorY - n)
        break
      }
      case "B": {
        const n = Number.parseInt(params || "1", 10) || 1
        this.cursorY = Math.min(this.height - 1, this.cursorY + n)
        break
      }
      case "C": {
        const n = Number.parseInt(params || "1", 10) || 1
        this.cursorX = Math.min(this.width - 1, this.cursorX + n)
        break
      }
      case "D": {
        const n = Number.parseInt(params || "1", 10) || 1
        this.cursorX = Math.max(0, this.cursorX - n)
        break
      }
      case "K": {
        const mode = Number.parseInt(params || "0", 10)
        if (mode === 0) {
          for (let x = this.cursorX; x < this.width; x++) {
            this.grid[this.cursorY]![x] = " "
            this.wideMarker[this.cursorY]![x] = false
          }
        } else if (mode === 1) {
          for (let x = 0; x <= this.cursorX; x++) {
            this.grid[this.cursorY]![x] = " "
            this.wideMarker[this.cursorY]![x] = false
          }
        } else if (mode === 2) {
          for (let x = 0; x < this.width; x++) {
            this.grid[this.cursorY]![x] = " "
            this.wideMarker[this.cursorY]![x] = false
          }
        }
        break
      }
      case "m":
      case "l":
      case "h":
        // SGR (style) and private modes - ignore for character comparison
        break
    }
  }

  /**
   * Get the character at a position.
   */
  getChar(x: number, y: number): string {
    if (this.wideMarker[y]?.[x]) return ""
    return this.grid[y]?.[x] ?? " "
  }

  /**
   * Compare with a TerminalBuffer and return mismatches.
   */
  compareToBuffer(buffer: TerminalBuffer): ReplayMismatch[] {
    const mismatches: ReplayMismatch[] = []
    for (let y = 0; y < Math.min(this.height, buffer.height); y++) {
      for (let x = 0; x < Math.min(this.width, buffer.width); x++) {
        if (buffer.isCellContinuation(x, y)) continue

        const expected = buffer.getCellChar(x, y)
        const actual = this.getChar(x, y)
        if (expected !== actual) {
          mismatches.push({ x, y, expected, actual })
        }
      }
    }
    return mismatches
  }
}

// =============================================================================
// Constants
// =============================================================================

/** Commands that should preserve buffer content (only cursor position changes) */
const CURSOR_COMMANDS = new Set([
  // Full names
  "cursor_up",
  "cursor_down",
  "cursor_left",
  "cursor_right",
  // Short names
  "up",
  "down",
  "left",
  "right",
])

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Parse INKX_STABILITY_SKIP_LINES environment variable.
 * Format: comma-separated integers, e.g., "0,-1"
 */
function parseSkipLines(env?: string): number[] {
  if (!env) return []
  return env
    .split(",")
    .map((s) => Number.parseInt(s.trim(), 10))
    .filter((n) => !isNaN(n))
}

/**
 * Compare text content before and after a command.
 * Returns the first mismatch found, or null if content matches.
 *
 * @param before - Text before command execution
 * @param after - Text after command execution
 * @param skipLines - Line indices to skip (supports negative indices from end)
 */
function compareText(before: string, after: string, skipLines: number[]): TextMismatch | null {
  const beforeLines = before.split("\n")
  const afterLines = after.split("\n")
  const maxLines = Math.max(beforeLines.length, afterLines.length)

  // Build set of lines to skip, resolving negative indices
  const skipSet = new Set<number>()
  for (const line of skipLines) {
    if (line >= 0) {
      skipSet.add(line)
    } else {
      // Negative index: -1 = last line, -2 = second to last, etc.
      skipSet.add(maxLines + line)
    }
  }

  for (let i = 0; i < maxLines; i++) {
    if (skipSet.has(i)) continue
    const b = beforeLines[i] ?? ""
    const a = afterLines[i] ?? ""
    if (b !== a) {
      return { line: i, before: b, after: a }
    }
  }
  return null
}

// =============================================================================
// Layout Invariant Checks
// =============================================================================

/**
 * Check layout tree integrity. Returns violation messages, or empty array if valid.
 *
 * Checks:
 * - All rect dimensions are finite and non-negative (width >= 0, height >= 0)
 * - All positions are finite (x, y are valid numbers)
 * - No NaN values in computed layout
 * - Children don't overflow parent bounds (1px tolerance for rounding)
 *   - Skips overflow check for nodes with overflow:hidden/scroll (they intentionally clip)
 */
export function checkLayoutInvariants(node: InkxNode): string[] {
  const violations: string[] = []
  walkLayout(node, null, violations)
  return violations
}

function walkLayout(
  node: InkxNode,
  parentRect: {
    x: number
    y: number
    width: number
    height: number
    clipped: boolean
  } | null,
  violations: string[],
): void {
  const rect = node.contentRect
  if (!rect) return // No layout computed yet — skip

  const id = (node.props as BoxProps).id ?? node.type

  // Check finite and non-negative dimensions
  if (!Number.isFinite(rect.width) || rect.width < 0) {
    violations.push(`${id}: invalid width ${rect.width}`)
  }
  if (!Number.isFinite(rect.height) || rect.height < 0) {
    violations.push(`${id}: invalid height ${rect.height}`)
  }
  if (!Number.isFinite(rect.x)) {
    violations.push(`${id}: invalid x ${rect.x}`)
  }
  if (!Number.isFinite(rect.y)) {
    violations.push(`${id}: invalid y ${rect.y}`)
  }

  // Check children don't overflow parent (with 1px tolerance)
  if (parentRect && !parentRect.clipped) {
    const TOLERANCE = 1
    if (rect.x + rect.width > parentRect.x + parentRect.width + TOLERANCE) {
      violations.push(`${id}: overflows parent right (${rect.x + rect.width} > ${parentRect.x + parentRect.width})`)
    }
    if (rect.y + rect.height > parentRect.y + parentRect.height + TOLERANCE) {
      violations.push(`${id}: overflows parent bottom (${rect.y + rect.height} > ${parentRect.y + parentRect.height})`)
    }
    if (rect.x < parentRect.x - TOLERANCE) {
      violations.push(`${id}: overflows parent left (${rect.x} < ${parentRect.x})`)
    }
    if (rect.y < parentRect.y - TOLERANCE) {
      violations.push(`${id}: overflows parent top (${rect.y} < ${parentRect.y})`)
    }
  }

  // Determine if this node clips its children
  const overflow = (node.props as BoxProps).overflow
  const clipped = overflow === "hidden" || overflow === "scroll"

  const childParentRect = {
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
    clipped,
  }

  for (const child of node.children) {
    walkLayout(child, childParentRect, violations)
  }
}

// =============================================================================
// Plugin Implementation
// =============================================================================

/**
 * Add diagnostic checking to an app with commands.
 *
 * Wraps the `cmd` proxy to intercept all command executions and run checks:
 * - **All commands**: Check that incremental render matches fresh render
 * - **Cursor commands**: Also check that buffer content didn't change
 *
 * **All checks are enabled by default** when you call this function.
 * The principle: if you wrapped with withDiagnostics(), you want diagnostics.
 *
 * @param app - App with command system (from withCommands)
 * @param options - Diagnostic check configuration (all enabled by default)
 * @returns App with wrapped cmd that runs diagnostic checks
 */
export function withDiagnostics<T extends AppWithCommands>(app: T, options: DiagnosticOptions = {}): T {
  // All checks enabled by default when plugin is used
  const {
    checkIncremental = true,
    checkStability = true,
    checkReplay = true,
    checkLayout = true,
    skipLines = parseSkipLines(process.env.INKX_STABILITY_SKIP_LINES),
    captureOnFailure = false,
    screenshotDir = "/tmp/inkx-diagnostics",
  } = options

  // If all checks are explicitly disabled, return app unchanged
  if (!checkIncremental && !checkStability && !checkReplay && !checkLayout) return app

  /** Capture screenshot on diagnostic failure (best-effort, never masks original error) */
  async function captureFailureScreenshot(commandId: string, checkType: string): Promise<string | null> {
    if (!captureOnFailure) return null
    try {
      await mkdir(screenshotDir, { recursive: true })
      const filename = `fail-${commandId}-${checkType}.png`
      const filepath = join(screenshotDir, filename)
      await app.screenshot(filepath)
      return filepath
    } catch {
      return null
    }
  }

  // Wrap the cmd proxy
  const wrappedCmd = new Proxy(app.cmd, {
    get(target, prop: string | symbol): unknown {
      // Handle symbol access (for JS internals)
      if (typeof prop === "symbol") return Reflect.get(target, prop)

      const original = Reflect.get(target, prop)

      // Pass through non-function properties and special methods
      if (typeof original !== "function") return original
      if (prop === "all" || prop === "describe") return original

      // Wrap command execution
      const command = original as Command
      const wrapped = async () => {
        // Capture state before command
        const beforeText = app.text
        const beforeBuffer = checkReplay ? app.lastBuffer() : null

        // Execute the original command
        await command()

        // Check 1: Incremental vs fresh render
        if (checkIncremental) {
          const incremental = app.lastBuffer()
          // freshRender() may throw if not available (non-test renderer)
          try {
            const fresh = app.freshRender()
            if (incremental && fresh) {
              const mismatch = compareBuffers(incremental, fresh)
              if (mismatch) {
                // Include full buffer text for debugging
                const incrementalText = app.text
                const freshText = fresh
                  ? Array.from({ length: fresh.height }, (_, y) =>
                      Array.from({ length: fresh.width }, (_, x) => fresh.getCellChar(x, y)).join(""),
                    ).join("\n")
                  : "(no fresh buffer)"
                const screenshotPath = await captureFailureScreenshot(command.id, "incremental")
                throw new Error(
                  `INKX_DIAGNOSTIC: Incremental/fresh mismatch after ${command.id}\n` +
                    formatMismatch(mismatch, {
                      key: command.id,
                      incrementalText,
                      freshText,
                    }) +
                    (screenshotPath ? `\n  Screenshot saved: ${screenshotPath}` : ""),
                )
              }
            }
          } catch (e) {
            // If freshRender isn't available, skip the check
            if (!(e instanceof Error) || !e.message.includes("only available in test renderer")) {
              throw e
            }
          }
        }

        // Check 2: Content stability for cursor commands
        if (checkStability && CURSOR_COMMANDS.has(command.id)) {
          const afterText = app.text
          const mismatch = compareText(beforeText, afterText, skipLines)
          if (mismatch) {
            const screenshotPath = await captureFailureScreenshot(command.id, "stability")
            throw new Error(
              `INKX_DIAGNOSTIC: Content changed after cursor move ${command.id}\n` +
                `  Line ${mismatch.line}: "${mismatch.before}" → "${mismatch.after}"` +
                (screenshotPath ? `\n  Screenshot saved: ${screenshotPath}` : ""),
            )
          }
        }

        // Check 3: ANSI replay produces correct result
        if (checkReplay && beforeBuffer) {
          const afterBuffer = app.lastBuffer()
          if (afterBuffer) {
            // Get the ANSI diff that would be sent to terminal
            const ansiDiff = outputPhase(beforeBuffer, afterBuffer)

            // Create virtual terminal initialized with previous state
            const vterm = new VirtualTerminal(afterBuffer.width, afterBuffer.height)
            vterm.loadFromBuffer(beforeBuffer)

            // Apply the ANSI diff
            vterm.applyAnsi(ansiDiff)

            // Compare result to expected buffer
            const mismatches = vterm.compareToBuffer(afterBuffer)
            if (mismatches.length > 0) {
              const first5 = mismatches.slice(0, 5)
              const details = first5
                .map((m) => `  (${m.x},${m.y}): expected="${m.expected}" actual="${m.actual}"`)
                .join("\n")
              const screenshotPath = await captureFailureScreenshot(command.id, "replay")
              throw new Error(
                `INKX_DIAGNOSTIC: ANSI replay mismatch after ${command.id}\n` +
                  `  ${mismatches.length} cells differ:\n${details}` +
                  (mismatches.length > 5 ? `\n  ... and ${mismatches.length - 5} more` : "") +
                  (screenshotPath ? `\n  Screenshot saved: ${screenshotPath}` : ""),
              )
            }
          }
        }

        // Check 4: Layout tree integrity
        if (checkLayout) {
          const root = app.getContainer()
          const violations = checkLayoutInvariants(root)
          if (violations.length > 0) {
            const details = violations
              .slice(0, 10)
              .map((v) => `  ${v}`)
              .join("\n")
            const screenshotPath = await captureFailureScreenshot(command.id, "layout")
            throw new Error(
              `INKX_DIAGNOSTIC: Layout invariant violation after ${command.id}\n` +
                `  ${violations.length} violation(s):\n${details}` +
                (violations.length > 10 ? `\n  ... and ${violations.length - 10} more` : "") +
                (screenshotPath ? `\n  Screenshot saved: ${screenshotPath}` : ""),
            )
          }
        }
      }

      // Copy metadata from original command
      Object.defineProperties(wrapped, {
        id: { value: command.id, enumerable: true },
        name: { value: command.name, enumerable: true },
        help: { value: command.help, enumerable: true },
        keys: { value: command.keys, enumerable: true },
      })

      return wrapped
    },

    has(target, prop): boolean {
      return Reflect.has(target, prop)
    },

    ownKeys(target): (string | symbol)[] {
      return Reflect.ownKeys(target)
    },

    getOwnPropertyDescriptor(target, prop): PropertyDescriptor | undefined {
      return Reflect.getOwnPropertyDescriptor(target, prop)
    },
  })

  return { ...app, cmd: wrappedCmd as Cmd } as T
}
