/**
 * OSC 4 Terminal Color Palette Query/Set — pure ANSI protocol.
 */

const ESC = "\x1b"
const BEL = "\x07"

export function queryPaletteColor(index: number, write: (data: string) => void): void {
  if (index < 0 || index > 255) throw new RangeError(`Palette index must be 0-255, got ${index}`)
  write(`${ESC}]4;${index};?${BEL}`)
}

export function queryMultiplePaletteColors(indices: number[], write: (data: string) => void): void {
  for (const index of indices) queryPaletteColor(index, write)
}

export function setPaletteColor(index: number, color: string, write: (data: string) => void): void {
  if (index < 0 || index > 255) throw new RangeError(`Palette index must be 0-255, got ${index}`)
  write(`${ESC}]4;${index};${color}${BEL}`)
}

const OSC4_PREFIX = `${ESC}]4;`
const OSC4_BODY_RE = /^(\d+);rgb:([0-9a-fA-F]{1,4})\/([0-9a-fA-F]{1,4})\/([0-9a-fA-F]{1,4})$/

export function parsePaletteResponse(input: string): { index: number; color: string } | null {
  const prefixIdx = input.indexOf(OSC4_PREFIX)
  if (prefixIdx === -1) return null
  const bodyStart = prefixIdx + OSC4_PREFIX.length
  let bodyEnd = input.indexOf(BEL, bodyStart)
  if (bodyEnd === -1) bodyEnd = input.indexOf(`${ESC}\\`, bodyStart)
  if (bodyEnd === -1) return null
  const body = input.slice(bodyStart, bodyEnd)
  const match = OSC4_BODY_RE.exec(body)
  if (!match) return null
  const index = Number.parseInt(match[1]!, 10)
  if (index < 0 || index > 255) return null
  const r = normalizeHexChannel(match[2]!)
  const g = normalizeHexChannel(match[3]!)
  const b = normalizeHexChannel(match[4]!)
  return { index, color: `#${r}${g}${b}` }
}

function normalizeHexChannel(hex: string): string {
  switch (hex.length) {
    case 1:
      return hex + hex
    case 2:
      return hex
    default:
      return hex.slice(0, 2)
  }
}
