/**
 * Virtual scrollback buffer for storing historical rendered content.
 *
 * Used by virtual inline mode to maintain scrollable history while
 * rendering in altscreen (which normally has no scrollback).
 *
 * Implementation uses a circular buffer for O(1) push and bounded memory.
 */

import { stripAnsi } from "./unicode"

export interface VirtualScrollbackOptions {
  /** Maximum number of lines to store. Default: 10000 */
  maxLines?: number
}

export interface VirtualScrollback {
  /** Push rendered lines into history */
  push(lines: string[]): void
  /** Get visible lines at a scroll offset. offset=0 = most recent (bottom) */
  getVisibleRows(offset: number, count: number): string[]
  /** Total number of lines stored */
  readonly totalLines: number
  /** Search for text across all stored lines. Returns indices of matching lines (0 = oldest). */
  search(query: string): number[]
  /** Clear all stored content */
  clear(): void
}

export function createVirtualScrollback(options?: VirtualScrollbackOptions): VirtualScrollback {
  const maxLines = options?.maxLines ?? 10_000
  const ansiLines: string[] = new Array(maxLines)
  const plainLines: string[] = new Array(maxLines)
  let head = 0 // next write position
  let count = 0 // total lines stored (capped at maxLines)

  return {
    push(lines: string[]): void {
      for (const line of lines) {
        ansiLines[head] = line
        plainLines[head] = stripAnsi(line)
        head = (head + 1) % maxLines
        if (count < maxLines) count++
      }
    },

    getVisibleRows(offset: number, rowCount: number): string[] {
      const result: string[] = []
      for (let i = 0; i < rowCount; i++) {
        const logicalIndex = count - offset - rowCount + i
        if (logicalIndex < 0 || logicalIndex >= count) {
          result.push("")
        } else {
          // Convert logical index (0=oldest) to physical position
          const physical = (head - count + logicalIndex + maxLines) % maxLines
          result.push(ansiLines[physical]!)
        }
      }
      return result
    },

    get totalLines(): number {
      return count
    },

    search(query: string): number[] {
      if (!query) return []
      const lowerQuery = query.toLowerCase()
      const matches: number[] = []
      for (let i = 0; i < count; i++) {
        // logical index i (0=oldest), convert to physical
        const physical = (head - count + i + maxLines) % maxLines
        if (plainLines[physical]!.toLowerCase().includes(lowerQuery)) {
          matches.push(i)
        }
      }
      return matches
    },

    clear(): void {
      head = 0
      count = 0
    },
  }
}
