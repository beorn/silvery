/**
 * Pretext-backed Measurer for pixel-accurate proportional text layout.
 *
 * Uses @chenglou/pretext for text measurement and line breaking instead of
 * raw ctx.measureText(). Pretext accounts for kerning, ligatures, emoji
 * correction, and Unicode line-breaking rules — producing tighter shrinkwrap
 * and more accurate wrapping than character-by-character measurement.
 */

import {
  prepareWithSegments,
  layoutWithLines,
  type PreparedTextWithSegments,
} from "@chenglou/pretext"
import type { Measurer } from "@silvery/ag-term/unicode"
import { stripAnsi } from "@silvery/ag-term/unicode"

export interface PretextMeasurerConfig {
  fontSize: number
  fontFamily: string
  lineHeight: number // multiplier (e.g., 1.4)
}

/**
 * Create a Measurer that uses Pretext for text measurement and wrapping.
 * All measurements return pixel values.
 */
export function createPretextMeasurer(config: PretextMeasurerConfig): Measurer {
  const lineHeightPx = config.fontSize * config.lineHeight
  const font = `${config.fontSize}px ${config.fontFamily}`

  // Pretext caches internally, but we cache PreparedText per string for repeat calls
  const preparedCache = new Map<string, PreparedTextWithSegments>()
  const MAX_CACHE = 2000

  function getPrepared(text: string): PreparedTextWithSegments {
    const cached = preparedCache.get(text)
    if (cached) return cached
    if (preparedCache.size >= MAX_CACHE) preparedCache.clear()
    const prepared = prepareWithSegments(text, font)
    preparedCache.set(text, prepared)
    return prepared
  }

  /** Measure single-line pixel width using Pretext's cached segment widths. */
  function pixelWidth(text: string): number {
    if (text.length === 0) return 0
    // Use Pretext layout with infinite width to get the natural line width
    const prepared = getPrepared(text)
    const result = layoutWithLines(prepared, Infinity, lineHeightPx)
    if (result.lines.length === 0) return 0
    // Sum all line widths (for single-line text, there's one line)
    return Math.max(...result.lines.map((l) => l.width))
  }

  // Use Intl.Segmenter for grapheme iteration (needed for sliceByWidth)
  const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" })

  // For grapheme width measurement, use a canvas context as fallback
  // (Pretext doesn't expose single-grapheme measurement directly)
  let measureCtx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null = null
  function getMeasureCtx() {
    if (measureCtx) return measureCtx
    const canvas =
      typeof document !== "undefined"
        ? document.createElement("canvas")
        : typeof OffscreenCanvas !== "undefined"
          ? new OffscreenCanvas(1, 1)
          : null
    if (!canvas) throw new Error("Canvas not available for text measurement")
    const ctx = canvas.getContext("2d")
    if (!ctx) throw new Error("Could not get 2d context")
    ;(ctx as CanvasRenderingContext2D).font = font
    measureCtx = ctx as CanvasRenderingContext2D
    return measureCtx
  }

  function sliceGraphemes(text: string, maxWidth: number, fromEnd: boolean): string {
    const stripped = stripAnsi(text)
    if (pixelWidth(stripped) <= maxWidth) return text
    const graphemes = [...segmenter.segment(stripped)].map((s) => s.segment)
    const ctx = getMeasureCtx()
    let width = 0
    if (fromEnd) {
      for (let i = graphemes.length - 1; i >= 0; i--) {
        const gw = ctx.measureText(graphemes[i]!).width
        if (width + gw > maxWidth) return graphemes.slice(i + 1).join("")
        width += gw
      }
      return stripped
    }
    for (let i = 0; i < graphemes.length; i++) {
      const gw = ctx.measureText(graphemes[i]!).width
      if (width + gw > maxWidth) return graphemes.slice(0, i).join("")
      width += gw
    }
    return stripped
  }

  const measurer: Measurer = {
    textEmojiWide: false,
    textSizingEnabled: false,
    lineHeight: lineHeightPx,

    displayWidth(text: string): number {
      // Ceil to avoid floating-point rounding causing unexpected wrapping.
      // Without this, MeasureFunc reports 275.3px, flexily allocates 275.3,
      // but Pretext's layoutWithLines wraps at 275.300001 due to float math.
      return Math.ceil(pixelWidth(stripAnsi(text)))
    },

    displayWidthAnsi(text: string): number {
      return Math.ceil(pixelWidth(stripAnsi(text)))
    },

    graphemeWidth(grapheme: string): number {
      return getMeasureCtx().measureText(grapheme).width
    },

    wrapText(text: string, width: number, trim?: boolean, _hard?: boolean): string[] {
      if (width <= 0) return []

      // Handle newlines by splitting and wrapping each paragraph
      const paragraphs = text.split("\n")
      const allLines: string[] = []

      for (const paragraph of paragraphs) {
        if (paragraph === "") {
          allLines.push("")
          continue
        }

        const stripped = stripAnsi(paragraph)
        const prepared = getPrepared(stripped)
        const result = layoutWithLines(prepared, width, lineHeightPx)

        for (const line of result.lines) {
          let lineText = line.text
          if (trim) lineText = lineText.trimEnd()
          allLines.push(lineText)
        }
      }

      return allLines
    },

    sliceByWidth(text: string, maxWidth: number): string {
      return sliceGraphemes(text, maxWidth, false)
    },

    sliceByWidthFromEnd(text: string, maxWidth: number): string {
      return sliceGraphemes(text, maxWidth, true)
    },
  }

  return measurer
}
