/**
 * Ring buffer for frozen scrollback items.
 *
 * Each item represents a rendered list entry (card, row, etc.) with its
 * ANSI snapshot, split rows, and plain-text rows for searching.
 * When total rows or cached ANSI bytes exceed capacity, the oldest items are
 * evicted. The byte count tracks the serialized string payload; it is a
 * deterministic cache budget, not an exact process heap measurement.
 */

import { CACHE_MAX_BYTES } from "./bounded-cache"
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
  readonly totalBytes: number
  readonly itemCount: number
  getRows(startRow: number, count: number): string[]
  getPlainTextRows(startRow: number, count: number): string[]
  search(query: string): number[]
  getItemAtRow(row: number): { item: HistoryItem; localRow: number } | null
  clear(): void
  readonly capacity: number
  readonly capacityBytes: number | null
}

export interface HistoryBufferOptions {
  capacityRows?: number
  /** Maximum cached ANSI payload bytes. Default 2 MiB (@cto e84ed6d7 / 28274). */
  capacityBytes?: number
}

export function createHistoryItem(key: string | number, ansi: string, width: number): HistoryItem {
  const rows = ansi.split("\n")
  const plainTextRows = rows.map((r) => stripAnsi(r))
  return { key, ansi, rows, plainTextRows, width }
}

export function createHistoryBuffer(
  options: number | HistoryBufferOptions = 10_000,
): HistoryBuffer {
  const capacity = typeof options === "number" ? options : (options.capacityRows ?? 10_000)
  const capacityBytes =
    typeof options === "number"
      ? CACHE_MAX_BYTES
      : (normalizeCapacityBytes(options.capacityBytes) ?? CACHE_MAX_BYTES)
  // Store items in insertion order; evict from front when over budget.
  let items: HistoryItem[] = []
  let _totalRows = 0
  let _totalBytes = 0

  function evict(): void {
    while (
      items.length > 0 &&
      (_totalRows > capacity || (capacityBytes !== null && _totalBytes > capacityBytes))
    ) {
      const removed = items.shift()!
      _totalRows -= removed.rows.length
      _totalBytes -= estimateHistoryItemBytes(removed)
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
      _totalBytes += estimateHistoryItemBytes(item)
      evict()
    },

    get totalRows(): number {
      return _totalRows
    },

    get totalBytes(): number {
      return _totalBytes
    },

    get itemCount(): number {
      return items.length
    },

    get capacity(): number {
      return capacity
    },

    get capacityBytes(): number | null {
      return capacityBytes
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
      _totalBytes = 0
    },
  }
}

function normalizeCapacityBytes(value: number | undefined): number | null {
  return Number.isFinite(value) && value !== undefined && value > 0 ? Math.floor(value) : null
}

const utf8Encoder = new TextEncoder()

function estimateHistoryItemBytes(item: HistoryItem): number {
  return utf8Encoder.encode(item.ansi).byteLength
}
