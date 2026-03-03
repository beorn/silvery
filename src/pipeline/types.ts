/**
 * Shared types for the Inkx render pipeline.
 */

import type { Cell } from "../buffer.js"
import type { Measurer } from "../unicode.js"

/**
 * Context threaded through the render pipeline.
 *
 * Carries per-render resources that were previously accessed via module-level
 * globals (e.g., `_scopedMeasurer` + `runWithMeasurer()`). Threading context
 * explicitly eliminates save/restore patterns and makes the pipeline pure.
 *
 * Phase 1: measurer only. Buffer and scrollOffset can be added later.
 */
export interface PipelineContext {
  readonly measurer: Measurer
}

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
