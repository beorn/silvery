/**
 * Measurer composition layer.
 *
 * Creates term-scoped measurers and pipeline configs.
 * Bridges ansi Term with silvery measurement capabilities.
 */

import type { Term, TerminalCaps } from "./ansi/index"
import type { TerminalHeuristics } from "@silvery/ansi"
import { createWidthMeasurer, type Measurer } from "./unicode"
import { createOutputPhase } from "./pipeline/output-phase"
import { setActiveColorLevel } from "./pipeline/state"
import type { PipelineConfig } from "./pipeline"

export type { Measurer } from "./unicode"

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
  const heuristics = term.heuristics
  // Post km-silvery.caps-restructure (Phase 7): textEmojiWide moved from
  // caps onto TerminalHeuristics; textSizing stays on caps (hard protocol flag).
  const measurer = createWidthMeasurer(
    caps
      ? { textEmojiWide: heuristics.textEmojiWide, textSizingEnabled: caps.textSizing }
      : {},
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
    /** Post km-silvery.caps-restructure (Phase 7): textEmojiWide moved from
     * caps onto TerminalHeuristics. When omitted the measurer defaults to
     * `true` (modern-terminal behavior). */
    heuristics?: TerminalHeuristics
    measurer?: Measurer
  } = {},
): PipelineConfig {
  const { caps, heuristics, measurer: explicitMeasurer } = options
  const measurer =
    explicitMeasurer ??
    createWidthMeasurer(
      caps
        ? {
            textEmojiWide: heuristics?.textEmojiWide ?? true,
            textSizingEnabled: caps.textSizing,
          }
        : {},
    )
  const outputPhaseFn = createOutputPhase(
    caps
      ? {
          // Phase 7 turned underlineStyles into an array of supported styles;
          // output-phase's gate still wants a boolean ("does any extended
          // underline work?"), so we project the array length.
          underlineStyles: caps.underlineStyles.length > 0,
          underlineColor: caps.underlineColor,
          colorTier: caps.colorTier,
        }
      : {},
    measurer,
  )
  // Mirror colorTier into module-scoped theme state so render-helpers
  // (parseColor, getTextStyle) can dispatch on tier without access to
  // OutputContext. At mono tier ("none"), $tokens resolve to null fg/bg and
  // getTextStyle injects per-token SGR attrs from DEFAULT_MONO_ATTRS so apps
  // keep hierarchy (bold / dim / italic / underline / inverse) when color is
  // unavailable. See hub/silvery/design/v10-terminal/theme-system-v2-plan.md#p4.
  if (caps?.colorTier) setActiveColorLevel(caps.colorTier)
  return { measurer, outputPhaseFn }
}
