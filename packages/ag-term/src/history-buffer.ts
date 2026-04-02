/**
 * Ring buffer for frozen scrollback items.
 *
 * Each item represents a rendered list entry (card, row, etc.) with its
 * ANSI snapshot, split rows, and plain-text rows for searching.
 * When total rows exceed capacity, the oldest items are evicted.
 */

import { stripAnsi } from "./unicode"

export interface HistoryItem {
  key: string | number
  ansi: string
  rows: string[]
  plainTextRows: string[]
  width: number
}

export interface HistoryBuffer {
  push(item: HistoryItem): void
  readonly totalRows: number
  readonly itemCount: number
  getRows(startRow: number, count: number): string[]
  getPlainTextRows(startRow: number, count: number): string[]
  search(query: string): number[]
  getItemAtRow(row: number): { item: HistoryItem; localRow: number } | null
  clear(): void
  readonly capacity: number
}

export function createHistoryItem(key: string | number, ansi: string, width: number): HistoryItem {
  const rows = ansi.split("\n")
  const plainTextRows = rows.map((r) => stripAnsi(r))
  return { key, ansi, rows, plainTextRows, width }
}

export function createHistoryBuffer(capacity = 10_000): HistoryBuffer {
  // Store items in insertion order; evict from front when over budget.
  let items: HistoryItem[] = []
  let _totalRows = 0

  function evict(): void {
    while (_totalRows > capacity && items.length > 0) {
      const removed = items.shift()!
      _totalRows -= removed.rows.length
    }
  }

  /** Walk items to find which item contains the given document row. */
  function resolveRow(row: number): { itemIndex: number; localRow: number } | null {
    if (row < 0 || row >= _totalRows) return null
    let cumulative = 0
    for (let i = 0; i < items.length; i++) {
      const itemRows = items[i]!.rows.length
      if (row < cumulative + itemRows) {
        return { itemIndex: i, localRow: row - cumulative }
      }
      cumulative += itemRows
    }
    return null
  }

  return {
    push(item: HistoryItem): void {
      items.push(item)
      _totalRows += item.rows.length
      evict()
    },

    get totalRows(): number {
      return _totalRows
    },

    get itemCount(): number {
      return items.length
    },

    get capacity(): number {
      return capacity
    },

    getRows(startRow: number, count: number): string[] {
      const result: string[] = []
      for (let r = startRow; r < startRow + count; r++) {
        const resolved = resolveRow(r)
        if (resolved) {
          result.push(items[resolved.itemIndex]!.rows[resolved.localRow]!)
        } else {
          result.push("")
        }
      }
      return result
    },

    getPlainTextRows(startRow: number, count: number): string[] {
      const result: string[] = []
      for (let r = startRow; r < startRow + count; r++) {
        const resolved = resolveRow(r)
        if (resolved) {
          result.push(items[resolved.itemIndex]!.plainTextRows[resolved.localRow]!)
        } else {
          result.push("")
        }
      }
      return result
    },

    search(query: string): number[] {
      if (!query) return []
      const lowerQuery = query.toLowerCase()
      const matches: number[] = []
      let rowOffset = 0
      for (const item of items) {
        for (let r = 0; r < item.plainTextRows.length; r++) {
          if (item.plainTextRows[r]!.toLowerCase().includes(lowerQuery)) {
            matches.push(rowOffset + r)
          }
        }
        rowOffset += item.rows.length
      }
      return matches
    },

    getItemAtRow(row: number): { item: HistoryItem; localRow: number } | null {
      const resolved = resolveRow(row)
      if (!resolved) return null
      return { item: items[resolved.itemIndex]!, localRow: resolved.localRow }
    },

    clear(): void {
      items = []
      _totalRows = 0
    },
  }
}
