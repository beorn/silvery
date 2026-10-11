import type { TerminalBuffer } from "./buffer"

/** One link projected over UTF-16 offsets in a rendered terminal row. */
export interface TerminalLinkSpan {
  readonly start: number
  readonly end: number
  readonly href: string
}

/** App-owned detection. Silvery owns projection, never the detection rules. */
export type TerminalLinkDetector = (text: string) => readonly TerminalLinkSpan[]

export interface TerminalLinksOptions {
  /** Optional detector for visible rendered row text. */
  readonly detect?: TerminalLinkDetector
}

interface RowProjection {
  readonly text: string
  readonly offsetsByColumn: ReadonlyArray<{ start: number; end: number } | undefined>
}

function projectRow(buffer: TerminalBuffer, row: number): RowProjection {
  let text = ""
  const offsetsByColumn: Array<{ start: number; end: number } | undefined> = []

  for (let col = 0; col < buffer.width; col++) {
    const cell = buffer.getCell(col, row)
    if (cell.continuation) {
      offsetsByColumn[col] = offsetsByColumn[col - 1]
      continue
    }

    const start = text.length
    text += cell.char || " "
    const range = { start, end: text.length }
    offsetsByColumn[col] = range
    if (cell.wide && col + 1 < buffer.width) offsetsByColumn[col + 1] = range
  }

  return { text, offsetsByColumn }
}

/**
 * Resolve a link at one visible cell.
 *
 * Explicit OSC-8 cell state is authoritative. Detection runs only when that
 * cell has no destination, and only for the pointed visible row.
 */
export function resolveTerminalLinkAt(
  buffer: TerminalBuffer,
  x: number,
  y: number,
  options: TerminalLinksOptions,
): string | undefined {
  const col = Math.floor(x)
  const row = Math.floor(y)
  if (col < 0 || row < 0 || col >= buffer.width || row >= buffer.height) return undefined

  const explicit = buffer.resolveHyperlink(col, row)
  if (explicit) return explicit
  if (!options.detect) return undefined

  const projection = projectRow(buffer, row)
  const cellRange = projection.offsetsByColumn[col]
  if (!cellRange) return undefined

  const spans = options.detect(projection.text)
  for (const span of spans) {
    if (
      span.href.length > 0 &&
      Number.isInteger(span.start) &&
      Number.isInteger(span.end) &&
      span.start >= 0 &&
      span.end > span.start &&
      span.end <= projection.text.length &&
      span.start < cellRange.end &&
      span.end > cellRange.start
    ) {
      return span.href
    }
  }
  return undefined
}
