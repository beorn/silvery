/**
 * Read/query facade over a ListDocument.
 *
 * Provides text extraction, search, hit-testing, and reveal for
 * pane-based scrollback UIs. Pure data — no React, no rendering.
 */

import type { ListDocument } from "./list-document"
import type { SearchMatch } from "./search-overlay"
import { stripAnsi } from "./unicode"

export interface SurfaceCapabilities {
  paneSafe: boolean
  searchableHistory: boolean
  selectableHistory: boolean
  overlayHistory: boolean
}

export interface TextSurface {
  readonly id: string
  readonly document: ListDocument
  getText(startRow: number, startCol: number, endRow: number, endCol: number): string
  search(query: string): SearchMatch[]
  hitTest(viewportRow: number, viewportCol: number): { row: number; col: number } | null
  reveal(row: number): void
  /** Notify subscribers that content has changed (search results may be stale) */
  notifyContentChange(): void
  subscribe(listener: () => void): () => void
  readonly capabilities: SurfaceCapabilities
}

export function createTextSurface(config: {
  id: string
  document: ListDocument
  viewportToDocument: (viewportRow: number) => number
  onReveal: (documentRow: number) => void
  capabilities: SurfaceCapabilities
}): TextSurface {
  const listeners = new Set<() => void>()

  function notify(): void {
    for (const fn of listeners) fn()
  }

  return {
    get id(): string {
      return config.id
    },

    get document(): ListDocument {
      return config.document
    },

    getText(startRow: number, startCol: number, endRow: number, endCol: number): string {
      const rows = config.document.getRows(startRow, endRow - startRow + 1)
      const lines: string[] = []
      for (let i = 0; i < rows.length; i++) {
        const plain = stripAnsi(rows[i]!)
        const row = startRow + i
        if (row === startRow && row === endRow) {
          lines.push(plain.slice(startCol, endCol))
        } else if (row === startRow) {
          lines.push(plain.slice(startCol))
        } else if (row === endRow) {
          lines.push(plain.slice(0, endCol))
        } else {
          lines.push(plain)
        }
      }
      return lines.join("\n")
    },

    search(query: string): SearchMatch[] {
      return config.document.search(query)
    },

    hitTest(viewportRow: number, viewportCol: number): { row: number; col: number } | null {
      const docRow = config.viewportToDocument(viewportRow)
      if (docRow < 0 || docRow >= config.document.totalRows) return null
      return { row: docRow, col: viewportCol }
    },

    reveal(row: number): void {
      config.onReveal(row)
      notify()
    },

    notifyContentChange(): void {
      notify()
    },

    subscribe(listener: () => void): () => void {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },

    get capabilities(): SurfaceCapabilities {
      return config.capabilities
    },
  }
}
