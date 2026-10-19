/**
 * Buffer comparison utility for differential rendering tests.
 *
 * Compares two terminal buffers cell-by-cell, returning the first
 * mismatch found (or null if buffers are identical).
 *
 * ## Documented-distinct from the termless comparator family
 *
 * The terminal-flow vertical slice (§7 "Comparator family") converges the
 * ecosystem's differs — termless `diffBuffers`, `terminalStateDigest` /
 * `diffTerminalStates`, and the restore-equivalence oracle's state digest — into
 * ONE compare family in termless. `compareBuffers` here is deliberately **NOT** a
 * member of that family, and NOT a duplicate of `diffBuffers`. It is a
 * **render-level** check, kept distinct by design:
 *
 * - **Different input.** The termless family compares terminal *state* read
 *   through the `TerminalReadable` contract ("are these two terminals in the same
 *   observable state?"). `compareBuffers` compares two silvery `TerminalBuffer`s —
 *   silvery's internal packed render target, which is NOT a `TerminalReadable` and
 *   cannot be one: it carries render-only semantics (the `SELECTABLE_FLAG`, the
 *   `DEFAULT_BG` sentinel, inheritedBg-resolved cells, `continuation` occupancy)
 *   that exist only inside the render pipeline, before any emulator sees output.
 * - **Different question.** Every caller (`with-diagnostics`'s `SILVERY_STRICT`
 *   `incremental` check, the incremental-rendering fuzz, `render-plan-parity`)
 *   asks "did silvery's incremental / replayed render path produce the identical
 *   render buffer as a fresh / recorded render?" — the incremental≡fresh
 *   invariant. That has no analog in the termless state-equivalence family.
 * - **Non-temporal A/B framing.** `cellA`/`cellB` are two renders of the SAME
 *   frame (incremental vs fresh, replayed vs recorded) — deliberately NOT the
 *   `oldCell`/`newCell` temporal framing of `diffBuffers`, and it returns the
 *   FIRST mismatch (fail-fast for an assertion) rather than every changed cell
 *   (a differential corpus).
 *
 * Structural correspondence, for readers crossing between the two: this file's
 * `{ x, y }` is `diffBuffers`'s `{ col, row }` (x=col, y=row); `cellA`/`cellB`
 * carry silvery buffer `Cell`s (fg/bg = `number | { r, g, b, index? } | null`),
 * whose color shape is index-preserving and thus structurally compatible with the
 * termless `Cell`'s `Color = { r, g, b, index? }` — but the two types are never
 * imported across the silvery↔termless boundary (compatible shapes, not shared
 * imports; slice §9 rule 7).
 */

import { type Cell, type TerminalBuffer, cellEquals } from "./buffer"

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
