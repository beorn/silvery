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

/**
 * Structural subset of `@silvery/ag-term/runtime` `InputOwner`. Defined
 * locally so `@silvery/ansi` stays dependency-free — callers inside a silvery
 * session can pass the real `InputOwner` and get nominal structural match;
 * standalone callers who never heard of InputOwner are unaffected.
 */
export interface ProbeInputOwner {
  probe<T>(opts: {
    query: string
    parse: (acc: string) => { result: T; consumed: number } | null
    timeoutMs: number
  }): Promise<T | null>
}

export interface ProbeColorsOptions {
  /** Per-OSC-query timeout in ms. Default 150. */
  timeoutMs?: number
  /**
   * Optional InputOwner (from `@silvery/ag-term/runtime`) that owns the stdin
   * raw-mode + data listener for the enclosing session. When provided,
   * probeColors routes OSC queries through `input.probe()` instead of
   * touching `process.stdin` directly. This avoids the wasRaw race that kills
   * host-TUI input when probeColors runs concurrently with a TUI session.
   *
   * When absent (e.g. CLI tool, non-TUI caller), probeColors falls back to
   * the standalone race-safe `didSetRaw + listenerCount > 0` guard on
   * `process.stdin`. The standalone path stays tested and supported.
   */
  input?: ProbeInputOwner
}

/**
 * Probe the terminal for its 22-slot color scheme via OSC 4/10/11 queries.
 *
 * Pure terminal primitive — no fingerprinting, no theme derivation. Returns the
 * raw probed slots (or `null` if probing isn't available, e.g. non-TTY).
 *
 * For the full detection cascade (override → probe → fingerprint → fallback +
 * theme derivation), use `detectScheme` from `@silvery/ansi` or
 * `detectTheme` from `@silvery/theme`.
 *
 * `probeColors` is the canonical name; `detectTerminalScheme` is the legacy
 * alias kept for backward compatibility.
 *
 * Call styles:
 *   await probeColors()                                    // default timeout, standalone
 *   await probeColors(150)                                 // legacy positional timeout
 *   await probeColors({ timeoutMs: 150 })                  // options form
 *   await probeColors({ input: inputOwner, timeoutMs: 150 }) // routed through InputOwner
 */
export async function probeColors(
  timeoutOrOpts?: number | ProbeColorsOptions,
): Promise<DetectedScheme | null> {
  const opts: ProbeColorsOptions =
    typeof timeoutOrOpts === "number" ? { timeoutMs: timeoutOrOpts } : (timeoutOrOpts ?? {})
  const timeoutMs = opts.timeoutMs ?? 150
  if (opts.input) return probeColorsViaOwner(opts.input, timeoutMs)

  const stdin = process.stdin
  const stdout = process.stdout
  if (!stdin.isTTY || !stdout.isTTY) return null

  // Race-safe rawMode handling: only flip raw mode if NO other consumer is
  // already running. Inside a TUI session the term-provider has set raw=true
  // and attached a data listener; if we toggle raw=false in the finally
  // (because wasRaw was captured before term-provider was set up, or some
  // other call inverted it mid-probe), we silently kill the host app's
  // input. Restoring on the basis of "did *this* probe set it" keeps us
  // honest in both standalone and TUI contexts.
  const otherListeners = stdin.listenerCount("data") > 0
  const wasRaw = stdin.isRaw
  let didSetRaw = false
  if (!wasRaw && !otherListeners) {
    stdin.setRawMode(true)
    didSetRaw = true
  }

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
    }
    if (bg) palette.cursorText = bg

    return { fg, bg, ansi, dark, palette }
  } finally {
    stdin.removeListener("data", onData)
    // Only undo what *we* did. `wasRaw` can be stale by the time we reach
    // the finally — another stdin consumer (e.g. silvery's term-provider)
    // may have flipped raw=true in the meantime, and re-setting raw=false
    // here would kill its input. Track our own toggle explicitly.
    if (didSetRaw) stdin.setRawMode(false)
  }
}

// ESC + BEL constants (local to avoid importing from osc-colors/palette)
const ESC = "\x1b"
const BEL = "\x07"
const RGB_BODY_RE = /rgb:([0-9a-fA-F]{1,4})\/([0-9a-fA-F]{1,4})\/([0-9a-fA-F]{1,4})/

/** OSC response parser for a specific OSC code (10 or 11). Returns the
 * first matching response in the buffer and the byte count to consume
 * (the end of that response, so leading garbage is cleared as well).
 */
function parseOscColor(acc: string, oscCode: number): { result: string; consumed: number } | null {
  const prefix = `${ESC}]${oscCode};`
  const prefixIdx = acc.indexOf(prefix)
  if (prefixIdx === -1) return null
  const bodyStart = prefixIdx + prefix.length
  let bodyEnd = acc.indexOf(BEL, bodyStart)
  let terminatorLen = 1
  if (bodyEnd === -1) {
    bodyEnd = acc.indexOf(`${ESC}\\`, bodyStart)
    terminatorLen = 2
    if (bodyEnd === -1) return null
  }
  const body = acc.slice(bodyStart, bodyEnd)
  const match = RGB_BODY_RE.exec(body)
  if (!match) return null
  const hex = `#${normalizeHex(match[1]!)}${normalizeHex(match[2]!)}${normalizeHex(match[3]!)}`
  return { result: hex, consumed: bodyEnd + terminatorLen }
}

function normalizeHex(channel: string): string {
  if (channel.length === 1) return channel + channel
  if (channel.length === 2) return channel
  return channel.slice(0, 2)
}

/**
 * Route OSC 10/11/4 queries through an InputOwner. Same semantics as the
 * standalone `probeColors` path (FG + BG sequentially, 16 palette slots in
 * one burst with a final drain), but all stdin access is owner-mediated —
 * no direct raw-mode toggles, no stdin.on("data").
 */
async function probeColorsViaOwner(
  input: ProbeInputOwner,
  timeoutMs: number,
): Promise<DetectedScheme | null> {
  // Foreground (OSC 10)
  const fgQuery = `${ESC}]10;?${BEL}`
  const fg = await input.probe<string>({
    query: fgQuery,
    parse: (acc) => parseOscColor(acc, 10),
    timeoutMs,
  })

  // Background (OSC 11)
  const bgQuery = `${ESC}]11;?${BEL}`
  const bg = await input.probe<string>({
    query: bgQuery,
    parse: (acc) => parseOscColor(acc, 11),
    timeoutMs,
  })

  // Palette (OSC 4). Issue 16 queries, collect whatever arrives in one
  // window. Unlike FG/BG we don't know in which order responses will come,
  // so use a single accumulating probe that returns when the window expires
  // OR all 16 slots are filled.
  const ansi: (string | null)[] = new Array(16).fill(null)
  let filled = 0
  // Emit all 16 queries in one burst via the owner's writeStdout (embedded
  // in the first probe's `query`). The parser scans the accumulated buffer
  // for OSC 4 responses; once it sees a slot it hasn't yet recorded, it
  // stores it. The probe resolves when either all 16 are filled or the
  // timeout elapses (null result is fine — we've already stored slots into
  // the outer `ansi` array as a side-effect).
  const oscPrefix = `${ESC}]4;`
  let burstQuery = ""
  for (let i = 0; i < 16; i++) burstQuery += `${ESC}]4;${i};?${BEL}`

  // Use a slightly longer window than per-query timeout — this is one shot
  // for all 16 slots rather than 16 separate round-trips.
  await input.probe<true>({
    query: burstQuery,
    parse: (acc) => {
      // Scan for every OSC 4 response in the buffer. Record slot values,
      // but DO NOT consume bytes here — let the full accumulated window
      // eventually time out and be dropped. (The owner's drain will call
      // this parser on each incoming chunk; idempotent scanning is fine.)
      let pos = 0
      while (pos < acc.length) {
        const next = acc.indexOf(oscPrefix, pos)
        if (next === -1) break
        let end = acc.indexOf(BEL, next)
        let termLen = 1
        if (end === -1) {
          end = acc.indexOf(`${ESC}\\`, next)
          termLen = 2
          if (end === -1) break
        }
        const chunk = acc.slice(next, end + termLen)
        const parsed = parsePaletteResponse(chunk)
        if (parsed && parsed.index >= 0 && parsed.index < 16 && ansi[parsed.index] == null) {
          ansi[parsed.index] = parsed.color
          filled++
        }
        pos = end + termLen
      }
      if (filled === 16) return { result: true, consumed: acc.length }
      return null
    },
    timeoutMs,
  })

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
  }
  if (bg) palette.cursorText = bg

  // If nothing came back at all, the host is probably non-responsive —
  // surface null so the caller can fall through to fingerprinting.
  if (fg == null && bg == null && filled === 0) return null

  return { fg, bg, ansi, dark, palette }
}

/**
 * Legacy alias for {@link probeColors}. Prefer `probeColors` in new code —
 * the name says what it does (probes terminal color slots), and "detect" is
 * reserved for the full cascade (`detectScheme`, `detectTheme`). Retained
 * as a stable alias — no deprecation schedule.
 */
export const detectTerminalScheme = probeColors

export interface DetectThemeOptions {
  /** Fallback ColorScheme when detection fails or returns partial data.
   * Detected colors override matching fallback fields.
   * When omitted, defaults based on dark/light detection:
   *   dark  → `fallbackDark` (if set) or built-in defaultDarkScheme
   *   light → `fallbackLight` (if set) or built-in defaultLightScheme */
  fallback?: ColorScheme
  /** Fallback for dark terminals (overrides `fallback` for dark mode). */
  fallbackDark?: ColorScheme
  /** Fallback for light terminals (overrides `fallback` for light mode). */
  fallbackLight?: ColorScheme
  /** Timeout per OSC query in ms (default 150). */
  timeoutMs?: number
  /** Terminal capabilities (from detectTerminalCaps). When provided:
   * - colorLevel `"mono"` / `"ansi16"` skips OSC detection and returns ANSI 16 theme
   * - darkBackground informs fallback selection when detection fails */
  caps?: { colorLevel?: string; darkBackground?: boolean }
  /** Optional InputOwner — routes OSC queries through the session's stdin
   * owner instead of directly mutating process.stdin raw mode. See
   * {@link ProbeColorsOptions.input}. */
  input?: ProbeInputOwner
}

export async function detectTheme(opts: DetectThemeOptions = {}): Promise<Theme> {
  const colorLevel = opts.caps?.colorLevel
  if (colorLevel === "mono" || colorLevel === "ansi16") {
    const isDark = opts.caps?.darkBackground ?? true
    return isDark ? ansi16DarkTheme : ansi16LightTheme
  }
  const detected = await probeColors({ timeoutMs: opts.timeoutMs, input: opts.input })
  const isDark = detected?.dark ?? opts.caps?.darkBackground ?? true
  const fallback =
    opts.fallback ??
    (isDark ? (opts.fallbackDark ?? defaultDarkScheme) : (opts.fallbackLight ?? defaultLightScheme))
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
