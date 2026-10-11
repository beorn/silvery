/**
 * DOM-backed Measurer for pixel-perfect CSS parity.
 *
 * Uses hidden DOM elements with matching CSS to measure text widths and wrap
 * text. This guarantees the same results as the browser's own text layout,
 * eliminating drift between canvas layout and CSS flexbox.
 *
 * Trade-off: slower than Pretext (causes reflow) but pixel-perfect. Use for
 * demos/comparisons where CSS parity matters. For performance-critical rendering,
 * use the Pretext measurer (pretext-measurer.ts).
 */

import type { Measurer } from "@silvery/ag-term/unicode"
import { stripAnsi } from "@silvery/ag-term/unicode"
import { createBoundedStringCache, setIsolated } from "@silvery/ag-term/bounded-cache"

export interface DomMeasurerConfig {
  fontSize: number
  fontFamily: string
  lineHeight: number // multiplier (e.g., 1.4)
  /** Container to append hidden measurement elements to (default: document.body) */
  container?: HTMLElement
}

/**
 * Create a Measurer that uses hidden DOM elements for text measurement.
 * Guarantees CSS-identical text widths, wrapping, and heights.
 */
export function createDomMeasurer(config: DomMeasurerConfig): Measurer & { dispose: () => void } {
  const lineHeightPx = config.fontSize * config.lineHeight
  const parent = config.container ?? document.body

  // Hidden measurement container
  const measurer = document.createElement("div")
  measurer.style.cssText = `
    position: absolute; top: -9999px; left: -9999px;
    visibility: hidden; pointer-events: none;
    font-family: ${config.fontFamily};
    font-size: ${config.fontSize}px;
    line-height: ${config.lineHeight};
    white-space: pre;
  `
  parent.appendChild(measurer)

  // Reusable span for single-line width measurement
  const span = document.createElement("span")
  span.style.cssText = `white-space: pre;`
  measurer.appendChild(span)

  // Separate div for wrapping measurement
  const wrapDiv = document.createElement("div")
  wrapDiv.style.cssText = `
    font-family: ${config.fontFamily};
    font-size: ${config.fontSize}px;
    line-height: ${config.lineHeight};
    white-space: pre-wrap;
    word-wrap: break-word;
    overflow-wrap: break-word;
  `
  measurer.appendChild(wrapDiv)

  // Width cache (DOM reflow is expensive). Bounded by entries+bytes+age.
  const widthCache = createBoundedStringCache<number>()

  function getWidth(text: string): number {
    if (text.length === 0) return 0
    const cached = widthCache.get(text)
    if (cached !== undefined) return cached
    span.textContent = text
    const w = span.getBoundingClientRect().width
    setIsolated(widthCache, text, w)
    return w
  }

  function wrapText(text: string, width: number, trim?: boolean): string[] {
    if (width <= 0) return []

    const paragraphs = text.split("\n")
    const allLines: string[] = []

    for (const paragraph of paragraphs) {
      if (paragraph === "") {
        allLines.push("")
        continue
      }

      const stripped = stripAnsi(paragraph)

      // Use DOM to determine where line breaks occur
      wrapDiv.style.width = `${width}px`
      wrapDiv.textContent = stripped

      // Read the actual wrapped lines using Range API
      const lines = getRenderedLines(wrapDiv, stripped, width)

      for (const line of lines) {
        allLines.push(trim ? line.trimEnd() : line)
      }
    }

    return allLines
  }

  /** Extract wrapped lines from a DOM element using getClientRects on a Range. */
  function getRenderedLines(el: HTMLElement, text: string, _maxWidth: number): string[] {
    if (!text) return [""]

    const textNode = el.firstChild
    if (!textNode || textNode.nodeType !== Node.TEXT_NODE) return [text]

    const range = document.createRange()
    const lines: string[] = []
    let lineStart = 0
    let lastTop = -Infinity

    // Walk character by character, detect line breaks by Y position change
    for (let i = 0; i <= text.length; i++) {
      if (i < text.length) {
        range.setStart(textNode, i)
        range.setEnd(textNode, i + 1)
        const rect = range.getBoundingClientRect()

        if (rect.top > lastTop + 1) {
          // New line detected
          if (i > lineStart) {
            lines.push(text.slice(lineStart, i))
          }
          lineStart = i
          lastTop = rect.top
        }
      } else {
        // End of text
        if (i > lineStart) {
          lines.push(text.slice(lineStart, i))
        }
      }
    }

    // Trim leading whitespace from continuation lines (matching CSS white-space: normal)
    for (let i = 1; i < lines.length; i++) {
      const trimmed = lines[i]!.replace(/^\s+/, "")
      if (trimmed.length > 0) lines[i] = trimmed
    }

    return lines.length > 0 ? lines : [text]
  }

  const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" })

  function sliceGraphemes(text: string, maxWidth: number, fromEnd: boolean): string {
    const stripped = stripAnsi(text)
    if (getWidth(stripped) <= maxWidth) return text
    const graphemes = [...segmenter.segment(stripped)].map((s) => s.segment)
    let width = 0
    if (fromEnd) {
      for (let i = graphemes.length - 1; i >= 0; i--) {
        const gw = getWidth(graphemes[i]!)
        if (width + gw > maxWidth) return graphemes.slice(i + 1).join("")
        width += gw
      }
      return stripped
    }
    for (let i = 0; i < graphemes.length; i++) {
      const gw = getWidth(graphemes[i]!)
      if (width + gw > maxWidth) return graphemes.slice(0, i).join("")
      width += gw
    }
    return stripped
  }

  const result: Measurer & { dispose: () => void } = {
    maybeWideEmojis: false,
    textSizing: false,
    lineHeight: lineHeightPx,

    displayWidth(text: string): number {
      return Math.ceil(getWidth(stripAnsi(text)))
    },

    displayWidthAnsi(text: string): number {
      return Math.ceil(getWidth(stripAnsi(text)))
    },

    graphemeWidth(grapheme: string): number {
      return getWidth(grapheme)
    },

    wrapText,

    sliceByWidth(text: string, maxWidth: number): string {
      return sliceGraphemes(text, maxWidth, false)
    },

    sliceByWidthFromEnd(text: string, maxWidth: number): string {
      return sliceGraphemes(text, maxWidth, true)
    },

    dispose() {
      measurer.remove()
    },
  }

  return result
}
