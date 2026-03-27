/**
 * OSC 10/11/12 Terminal Color Queries — pure ANSI protocol.
 */

const ESC = "\x1b"
const BEL = "\x07"

const RGB_BODY_RE = /rgb:([0-9a-fA-F]{1,4})\/([0-9a-fA-F]{1,4})\/([0-9a-fA-F]{1,4})/

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

function parseOscColorResponse(input: string, oscCode: number): string | null {
  const prefix = `${ESC}]${oscCode};`
  const prefixIdx = input.indexOf(prefix)
  if (prefixIdx === -1) return null
  const bodyStart = prefixIdx + prefix.length
  let bodyEnd = input.indexOf(BEL, bodyStart)
  if (bodyEnd === -1) bodyEnd = input.indexOf(`${ESC}\\`, bodyStart)
  if (bodyEnd === -1) return null
  const body = input.slice(bodyStart, bodyEnd)
  const match = RGB_BODY_RE.exec(body)
  if (!match) return null
  return `#${normalizeHexChannel(match[1]!)}${normalizeHexChannel(match[2]!)}${normalizeHexChannel(match[3]!)}`
}

async function queryOscColor(
  write: (data: string) => void,
  read: (timeoutMs: number) => Promise<string | null>,
  oscCode: number,
  timeoutMs: number,
): Promise<string | null> {
  write(`${ESC}]${oscCode};?${BEL}`)
  const data = await read(timeoutMs)
  if (data == null) return null
  return parseOscColorResponse(data, oscCode)
}

export async function queryForegroundColor(
  write: (data: string) => void,
  read: (timeoutMs: number) => Promise<string | null>,
  timeoutMs = 200,
): Promise<string | null> {
  return queryOscColor(write, read, 10, timeoutMs)
}

export async function queryBackgroundColor(
  write: (data: string) => void,
  read: (timeoutMs: number) => Promise<string | null>,
  timeoutMs = 200,
): Promise<string | null> {
  return queryOscColor(write, read, 11, timeoutMs)
}

export async function queryCursorColor(
  write: (data: string) => void,
  read: (timeoutMs: number) => Promise<string | null>,
  timeoutMs = 200,
): Promise<string | null> {
  return queryOscColor(write, read, 12, timeoutMs)
}

export function setForegroundColor(write: (data: string) => void, color: string): void {
  write(`${ESC}]10;${color}${BEL}`)
}
export function setBackgroundColor(write: (data: string) => void, color: string): void {
  write(`${ESC}]11;${color}${BEL}`)
}
export function setCursorColor(write: (data: string) => void, color: string): void {
  write(`${ESC}]12;${color}${BEL}`)
}
export function resetForegroundColor(write: (data: string) => void): void {
  write(`${ESC}]110${BEL}`)
}
export function resetBackgroundColor(write: (data: string) => void): void {
  write(`${ESC}]111${BEL}`)
}
export function resetCursorColor(write: (data: string) => void): void {
  write(`${ESC}]112${BEL}`)
}

export async function detectColorScheme(
  write: (data: string) => void,
  read: (timeoutMs: number) => Promise<string | null>,
  timeoutMs = 200,
): Promise<"light" | "dark" | null> {
  const bg = await queryBackgroundColor(write, read, timeoutMs)
  if (bg == null) return null
  const r = parseInt(bg.slice(1, 3), 16) / 255
  const g = parseInt(bg.slice(3, 5), 16) / 255
  const b = parseInt(bg.slice(5, 7), 16) / 255
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.5 ? "light" : "dark"
}
