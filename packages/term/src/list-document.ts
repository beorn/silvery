/**
 * Canonical row model spanning frozen history + live content.
 *
 * Frozen rows (from HistoryBuffer) occupy rows 0..frozenRows-1.
 * Live rows follow at frozenRows..totalRows-1.
 * All row indices are document-global.
 */

import type { HistoryBuffer } from "./history-buffer"
import type { SearchMatch } from "./search-overlay"

export interface DocumentSource {
  type: "frozen" | "live"
  itemKey?: string | number
  itemIndex?: number
  localRow: number
}

export interface ListDocument {
  readonly totalRows: number
  readonly frozenRows: number
  readonly liveRows: number
  getRows(startRow: number, count: number): string[]
  getPlainTextRows(startRow: number, count: number): string[]
  getSource(row: number): DocumentSource | null
  search(query: string): SearchMatch[]
}

export function createListDocument(
  history: HistoryBuffer,
  getLiveRows: () => string[],
  getLivePlainTextRows: () => string[],
): ListDocument {
  return {
    get totalRows(): number {
      return history.totalRows + getLiveRows().length
    },

    get frozenRows(): number {
      return history.totalRows
    },

    get liveRows(): number {
      return getLiveRows().length
    },

    getRows(startRow: number, count: number): string[] {
      const frozen = history.totalRows
      const result: string[] = []
      for (let r = startRow; r < startRow + count; r++) {
        if (r < 0 || r >= this.totalRows) {
          result.push("")
        } else if (r < frozen) {
          result.push(...history.getRows(r, 1))
        } else {
          const live = getLiveRows()
          const liveIdx = r - frozen
          result.push(liveIdx < live.length ? live[liveIdx]! : "")
        }
      }
      return result
    },

    getPlainTextRows(startRow: number, count: number): string[] {
      const frozen = history.totalRows
      const result: string[] = []
      for (let r = startRow; r < startRow + count; r++) {
        if (r < 0 || r >= this.totalRows) {
          result.push("")
        } else if (r < frozen) {
          result.push(...history.getPlainTextRows(r, 1))
        } else {
          const live = getLivePlainTextRows()
          const liveIdx = r - frozen
          result.push(liveIdx < live.length ? live[liveIdx]! : "")
        }
      }
      return result
    },

    getSource(row: number): DocumentSource | null {
      const frozen = history.totalRows
      if (row < 0 || row >= this.totalRows) return null
      if (row < frozen) {
        const hit = history.getItemAtRow(row)
        if (!hit) return null
        return {
          type: "frozen",
          itemKey: hit.item.key,
          localRow: hit.localRow,
        }
      }
      return {
        type: "live",
        itemIndex: row - frozen,
        localRow: row - frozen,
      }
    },

    search(query: string): SearchMatch[] {
      if (!query) return []
      const lowerQuery = query.toLowerCase()
      const matches: SearchMatch[] = []
      const frozen = history.totalRows

      // Search frozen rows
      const frozenRowMatches = history.search(query)
      for (const row of frozenRowMatches) {
        const plainRows = history.getPlainTextRows(row, 1)
        const line = plainRows[0]!.toLowerCase()
        let col = 0
        let pos = line.indexOf(lowerQuery, col)
        while (pos !== -1) {
          matches.push({ row, startCol: pos, endCol: pos + query.length })
          pos = line.indexOf(lowerQuery, pos + 1)
        }
      }

      // Search live rows
      const livePlain = getLivePlainTextRows()
      for (let i = 0; i < livePlain.length; i++) {
        const line = livePlain[i]!.toLowerCase()
        let pos = line.indexOf(lowerQuery)
        while (pos !== -1) {
          matches.push({ row: frozen + i, startCol: pos, endCol: pos + query.length })
          pos = line.indexOf(lowerQuery, pos + 1)
        }
      }

      return matches
    },
  }
}
