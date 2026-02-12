/**
 * Buffer comparison utility for differential rendering tests.
 *
 * Compares two terminal buffers cell-by-cell, returning the first
 * mismatch found (or null if buffers are identical).
 */

import { type Cell, type TerminalBuffer, bufferToText, cellEquals } from "../buffer.js"

/**
 * A single cell mismatch between two buffers.
 */
export interface BufferMismatch {
  /** Column of the mismatched cell */
  x: number
  /** Row of the mismatched cell */
  y: number
  /** Cell from buffer A (e.g., incremental render) */
  cellA: Cell
  /** Cell from buffer B (e.g., fresh render) */
  cellB: Cell
}

/**
 * Compare two terminal buffers cell-by-cell.
 *
 * @returns The first mismatch found, or null if buffers are identical.
 */
export function compareBuffers(a: TerminalBuffer, b: TerminalBuffer): BufferMismatch | null {
  const width = Math.max(a.width, b.width)
  const height = Math.max(a.height, b.height)

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const cellA = a.inBounds(x, y)
        ? a.getCell(x, y)
        : {
            char: " ",
            fg: null,
            bg: null,
            underlineColor: null,
            attrs: {},
            wide: false,
            continuation: false,
          }
      const cellB = b.inBounds(x, y)
        ? b.getCell(x, y)
        : {
            char: " ",
            fg: null,
            bg: null,
            underlineColor: null,
            attrs: {},
            wide: false,
            continuation: false,
          }

      if (!cellEquals(cellA, cellB)) {
        return { x, y, cellA, cellB }
      }
    }
  }

  return null
}

/**
 * Format a buffer mismatch for human-readable error output.
 */
export function formatMismatch(
  mismatch: BufferMismatch,
  context?: {
    incrementalText?: string
    freshText?: string
    seed?: number
    iteration?: number
    key?: string
  },
): string {
  const { x, y, cellA, cellB } = mismatch
  const lines: string[] = [
    `Buffer mismatch at (${x}, ${y})`,
    `  incremental: char=${JSON.stringify(cellA.char)} fg=${JSON.stringify(cellA.fg)} bg=${JSON.stringify(cellA.bg)} attrs=${JSON.stringify(cellA.attrs)}`,
    `  fresh:       char=${JSON.stringify(cellB.char)} fg=${JSON.stringify(cellB.fg)} bg=${JSON.stringify(cellB.bg)} attrs=${JSON.stringify(cellB.attrs)}`,
  ]

  if (context?.seed !== undefined) lines.push(`  seed: ${context.seed}`)
  if (context?.iteration !== undefined) {
    lines.push(`  iteration: ${context.iteration}`)
  }
  if (context?.key) lines.push(`  key: ${JSON.stringify(context.key)}`)

  if (context?.incrementalText) {
    lines.push("", "--- incremental ---", context.incrementalText)
  }
  if (context?.freshText) {
    lines.push("", "--- fresh ---", context.freshText)
  }

  return lines.join("\n")
}
