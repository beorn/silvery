/**
 * Shared types for the Inkx render pipeline.
 */

import type { Cell } from "../buffer.js"

/**
 * Cell change for diffing.
 */
export interface CellChange {
  x: number
  y: number
  cell: Cell
}

/**
 * Border character sets.
 */
export interface BorderChars {
  topLeft: string
  topRight: string
  bottomLeft: string
  bottomRight: string
  horizontal: string
  vertical: string
}
