/**
 * Measurer composition layer.
 *
 * Creates term-scoped measurers and pipeline configs.
 * Bridges chalkx Term with inkx measurement capabilities.
 */

import type { Term, TerminalCaps } from "chalkx"
import { createWidthMeasurer, type Measurer } from "./unicode.js"
import { createOutputPhase } from "./pipeline/output-phase.js"
import type { PipelineConfig } from "./pipeline/index.js"

export type { Measurer } from "./unicode.js"

/**
 * Term extended with measurement capabilities.
 */
export interface MeasuredTerm extends Term, Measurer {}

/**
 * Extend a Term with measurement capabilities.
 *
 * Creates a width measurer from the term's caps and adds measurement
 * methods (displayWidth, graphemeWidth, wrapText, etc.) to the term.
 */
export function withMeasurer(term: Term): MeasuredTerm {
  const caps = term.caps
  const measurer = createWidthMeasurer(
    caps ? { textEmojiWide: caps.textEmojiWide, textSizingEnabled: caps.textSizingSupported } : {},
  )

  return Object.create(term, {
    textEmojiWide: { get: () => measurer.textEmojiWide, enumerable: true },
    textSizingEnabled: { get: () => measurer.textSizingEnabled, enumerable: true },
    displayWidth: { value: measurer.displayWidth.bind(measurer), enumerable: true },
    displayWidthAnsi: { value: measurer.displayWidthAnsi.bind(measurer), enumerable: true },
    graphemeWidth: { value: measurer.graphemeWidth.bind(measurer), enumerable: true },
    wrapText: { value: measurer.wrapText.bind(measurer), enumerable: true },
    sliceByWidth: { value: measurer.sliceByWidth.bind(measurer), enumerable: true },
    sliceByWidthFromEnd: { value: measurer.sliceByWidthFromEnd.bind(measurer), enumerable: true },
  }) as MeasuredTerm
}

/**
 * Create a pipeline configuration from caps and/or measurer.
 *
 * This is the single factory for PipelineConfig -- use it instead of
 * manually constructing { measurer, outputPhaseFn }.
 *
 * @param options.caps - Terminal capabilities (for output phase SGR generation)
 * @param options.measurer - Explicit measurer (if omitted, created from caps)
 */
export function createPipeline(
  options: {
    caps?: TerminalCaps
    measurer?: Measurer
  } = {},
): PipelineConfig {
  const { caps, measurer: explicitMeasurer } = options
  const measurer =
    explicitMeasurer ??
    createWidthMeasurer(caps ? { textEmojiWide: caps.textEmojiWide, textSizingEnabled: caps.textSizingSupported } : {})
  const outputPhaseFn = createOutputPhase(
    caps
      ? { underlineStyles: caps.underlineStyles, underlineColor: caps.underlineColor, colorLevel: caps.colorLevel }
      : {},
    measurer,
  )
  return { measurer, outputPhaseFn }
}
