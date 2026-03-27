/**
 * Type definitions for @silvery/ag-term ANSI module.
 *
 * Pure ANSI types are re-exported from @silvery/ansi.
 * ag-term-specific types (Term, Console, Emulator) are defined here.
 */

// =============================================================================
// Re-exports from @silvery/ansi
// =============================================================================

export type { ColorLevel, RGB, AnsiColorName, Color, UnderlineStyle, TerminalCaps } from "@silvery/ansi"

// =============================================================================
// Style Types
// =============================================================================

import type { Color } from "@silvery/ansi"
import type { TerminalCaps } from "@silvery/ansi"

/**
 * Style options for term.style() method.
 */
export interface StyleOptions {
  color?: Color
  bgColor?: Color
  bold?: boolean
  dim?: boolean
  italic?: boolean
  underline?: boolean
  strikethrough?: boolean
  inverse?: boolean
}

// =============================================================================
// Console Types
// =============================================================================

/**
 * Console method names that can be intercepted.
 */
export type ConsoleMethod = "log" | "info" | "warn" | "error" | "debug"

/**
 * Entry captured from console.
 */
export interface ConsoleEntry {
  method: ConsoleMethod
  args: unknown[]
  stream: "stdout" | "stderr"
}

// =============================================================================
// Term Types
// =============================================================================

/**
 * Options for createTerm().
 */
export interface CreateTermOptions {
  stdout?: NodeJS.WriteStream
  stdin?: NodeJS.ReadStream

  // Override auto-detection (for testing or forcing)
  color?: import("@silvery/ansi").ColorLevel | null // override hasColor()
  unicode?: boolean // override hasUnicode()
  cursor?: boolean // override hasCursor()

  // Terminal capabilities override
  caps?: Partial<TerminalCaps>
}

// =============================================================================
// Terminal Emulator Types (duck-types for termless integration)
// =============================================================================

/**
 * A screen region — duck-type matching termless RegionView.
 * Provides text content and line access for assertions.
 */
export interface TermScreen {
  getText(): string
  getLines(): string[]
  containsText?(text: string): boolean
}

/**
 * A terminal emulator — duck-type matching termless Terminal.
 * Accepts ANSI output, provides screen/scrollback for inspection.
 */
export interface TermEmulator {
  readonly cols: number
  readonly rows: number
  readonly screen: TermScreen
  readonly scrollback: TermScreen
  feed(data: Uint8Array | string): void
  resize(cols: number, rows: number): void
  close(): Promise<void>
}

/**
 * A terminal emulator backend — duck-type matching termless TerminalBackend.
 * Raw backend that needs initialization. Pass to createTerm(backend, { cols, rows }).
 *
 * @example
 * ```ts
 * import { createXtermBackend } from "@termless/xtermjs"
 * using term = createTerm(createXtermBackend(), { cols: 80, rows: 24 })
 * ```
 */
export interface TermEmulatorBackend {
  readonly name: string
  init(opts: { cols: number; rows: number; scrollbackLimit?: number }): void
  destroy(): void
  feed(data: Uint8Array): void
  resize(cols: number, rows: number): void
}
