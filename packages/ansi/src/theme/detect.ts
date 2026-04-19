/**
 * Terminal palette auto-detection via OSC queries.
 */

import type { ColorScheme, Theme } from "./types.ts"
import { deriveTheme } from "./derive.ts"
import {
  ansi16DarkTheme,
  ansi16LightTheme,
  defaultDarkScheme,
  defaultLightScheme,
} from "./default-schemes.ts"
import { queryMultiplePaletteColors, parsePaletteResponse } from "../osc-palette.ts"
import { queryForegroundColor, queryBackgroundColor } from "../osc-colors.ts"

export interface DetectedScheme {
  fg: string | null
  bg: string | null
  ansi: (string | null)[]
  dark: boolean
  palette: Partial<ColorScheme>
}

export async function detectTerminalScheme(timeoutMs = 150): Promise<DetectedScheme | null> {
  const stdin = process.stdin
  const stdout = process.stdout
  if (!stdin.isTTY || !stdout.isTTY) return null

  const wasRaw = stdin.isRaw
  if (!wasRaw) stdin.setRawMode(true)

  let buffer = ""
  const onData = (chunk: Buffer) => {
    buffer += chunk.toString()
  }
  stdin.on("data", onData)

  try {
    const write = (s: string) => {
      stdout.write(s)
    }
    const read = (ms: number): Promise<string | null> =>
      new Promise((resolve) => {
        if (buffer.length > 0) {
          const result = buffer
          buffer = ""
          resolve(result)
          return
        }
        const timer = setTimeout(() => {
          resolve(buffer.length > 0 ? buffer : null)
          buffer = ""
        }, ms)
        const check = (_chunk: Buffer) => {
          clearTimeout(timer)
          stdin.removeListener("data", check)
          const result = buffer
          buffer = ""
          resolve(result)
        }
        stdin.on("data", check)
      })

    const bg = await queryBackgroundColor(write, read, timeoutMs)
    const fg = await queryForegroundColor(write, read, timeoutMs)

    const ansi: (string | null)[] = new Array(16).fill(null)
    queryMultiplePaletteColors(
      Array.from({ length: 16 }, (_, i) => i),
      write,
    )
    await new Promise((resolve) => setTimeout(resolve, timeoutMs))

    const remaining = buffer
    buffer = ""
    if (remaining) {
      const oscPrefix = "\x1b]4;"
      let pos = 0
      while (pos < remaining.length) {
        const nextOsc = remaining.indexOf(oscPrefix, pos)
        if (nextOsc === -1) break
        let end = remaining.indexOf("\x07", nextOsc)
        if (end === -1) end = remaining.indexOf("\x1b\\", nextOsc)
        if (end === -1) break
        const chunk = remaining.slice(nextOsc, end + 1)
        const parsed = parsePaletteResponse(chunk)
        if (parsed && parsed.index >= 0 && parsed.index < 16) ansi[parsed.index] = parsed.color
        pos = end + 1
      }
    }

    const dark = bg ? isDarkColor(bg) : true
    const palette: Partial<ColorScheme> = { dark }
    if (bg) palette.background = bg
    if (fg) palette.foreground = fg

    const ansiFields: (keyof ColorScheme)[] = [
      "black",
      "red",
      "green",
      "yellow",
      "blue",
      "magenta",
      "cyan",
      "white",
      "brightBlack",
      "brightRed",
      "brightGreen",
      "brightYellow",
      "brightBlue",
      "brightMagenta",
      "brightCyan",
      "brightWhite",
    ]
    for (let i = 0; i < 16; i++) {
      if (ansi[i]) (palette as Record<string, string>)[ansiFields[i]!] = ansi[i]!
    }
    if (fg) {
      palette.cursorColor = fg
      palette.selectionForeground = fg
    }
    if (bg) palette.cursorText = bg
    if (ansi[4]) palette.selectionBackground = ansi[4]

    return { fg, bg, ansi, dark, palette }
  } finally {
    stdin.removeListener("data", onData)
    if (!wasRaw) stdin.setRawMode(false)
  }
}

export interface DetectThemeOptions {
  fallback?: ColorScheme
  timeoutMs?: number
  caps?: { colorLevel?: string; darkBackground?: boolean }
}

export async function detectTheme(opts: DetectThemeOptions = {}): Promise<Theme> {
  const colorLevel = opts.caps?.colorLevel
  if (colorLevel === "none" || colorLevel === "basic") {
    const isDark = opts.caps?.darkBackground ?? true
    return isDark ? ansi16DarkTheme : ansi16LightTheme
  }
  const detected = await detectTerminalScheme(opts.timeoutMs)
  const isDark = detected?.dark ?? opts.caps?.darkBackground ?? true
  const fallback = opts.fallback ?? (isDark ? defaultDarkScheme : defaultLightScheme)
  if (!detected) return deriveTheme(fallback)
  const merged: ColorScheme = { ...fallback, ...stripNulls(detected.palette) }
  return deriveTheme(merged)
}

function stripNulls(partial: Partial<ColorScheme>): Partial<ColorScheme> {
  const result: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(partial)) {
    if (v != null) result[k] = v
  }
  return result as Partial<ColorScheme>
}

function isDarkColor(hex: string): boolean {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  return 0.2126 * r + 0.7152 * g + 0.0722 * b <= 0.5
}
