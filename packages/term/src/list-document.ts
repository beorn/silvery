/**
 * Canonical row model spanning frozen history + live content.
 *
 * Frozen rows (from HistoryBuffer) occupy rows 0..frozenRows-1.
 * Live rows follow at frozenRows..totalRows-1.
 * All row indices are document-global.
 */

import type { HistoryBuffer } from "./history-buffer"
import type { SearchMatch } from "./search-overlay"

export interface LiveItemBlock {
  key: string | number
  itemIndex: number
  rows: string[]
  plainTextRows: string[]
}

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

export function createListDocument(history: HistoryBuffer, getLiveItems: () => LiveItemBlock[]): ListDocument {
  function liveRowCount(): number {
    let total = 0
    for (const block of getLiveItems()) {
      total += block.rows.length
    }
    return total
  }

  return {
    get totalRows(): number {
      return history.totalRows + liveRowCount()
    },

    get frozenRows(): number {
      return history.totalRows
    },

    get liveRows(): number {
      return liveRowCount()
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
          let liveRow = r - frozen
          let found = false
          for (const block of getLiveItems()) {
            if (liveRow < block.rows.length) {
              result.push(block.rows[liveRow]!)
              found = true
              break
            }
            liveRow -= block.rows.length
          }
          if (!found) result.push("")
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
          let liveRow = r - frozen
          let found = false
          for (const block of getLiveItems()) {
            if (liveRow < block.plainTextRows.length) {
              result.push(block.plainTextRows[liveRow]!)
              found = true
              break
            }
            liveRow -= block.plainTextRows.length
          }
          if (!found) result.push("")
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
      // Live: walk item blocks
      const liveItems = getLiveItems()
      let liveRow = row - frozen
      for (const block of liveItems) {
        if (liveRow < block.rows.length) {
          return { type: "live", itemIndex: block.itemIndex, localRow: liveRow }
        }
        liveRow -= block.rows.length
      }
      return null
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
        let pos = line.indexOf(lowerQuery)
        while (pos !== -1) {
          matches.push({ row, startCol: pos, endCol: pos + query.length })
          pos = line.indexOf(lowerQuery, pos + 1)
        }
      }

      // Search live rows (walk item blocks)
      let rowOffset = 0
      for (const block of getLiveItems()) {
        for (let i = 0; i < block.plainTextRows.length; i++) {
          const line = block.plainTextRows[i]!.toLowerCase()
          let pos = line.indexOf(lowerQuery)
          while (pos !== -1) {
            matches.push({ row: frozen + rowOffset + i, startCol: pos, endCol: pos + query.length })
            pos = line.indexOf(lowerQuery, pos + 1)
          }
        }
        rowOffset += block.plainTextRows.length
      }

      return matches
    },
  }
}
