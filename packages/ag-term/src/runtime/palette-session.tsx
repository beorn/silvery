/**
 * Palette session — owns the palette a `run()` app paints with, and re-probes
 * it when a terminal that can answer shows up.
 *
 * ## Why
 *
 * `run()` probes OSC 10/11/4 once at startup. A pane service started with no
 * terminal attached gets no answer, so its canvas paints the terminal default
 * background (`paletteProbe: "unanswered"`, see `detectPalette`). When a real
 * terminal later attaches, nothing used to re-read the palette. The session
 * re-probes on the signals that reach the app over its own byte pipe:
 *
 * - a mode-2031 color-scheme notice (`CSI ? 997 ; 1|2 n`) — always, since the
 *   terminal says its palette changed;
 * - a focus-in (mode 1004) while the palette is still unanswered;
 * - a resize while the palette is still unanswered (an attach at another
 *   size resizes the pty, so the first resize after an unanswered probe is
 *   usually the attach itself).
 *
 * Every trigger goes through the session's one input owner — focus-in and the
 * notice are parsed by its typed-event parser, never a second parser — and
 * mode 2031 is enabled through `term.modes`, which resets it on dispose.
 *
 * The session never demotes evidence: a re-probe that goes unanswered while
 * the palette is `answered` keeps the answered palette and logs it.
 */

import React, { useSyncExternalStore, type ReactElement, type ReactNode } from "react"
import { createLogger } from "loggily"
import {
  detectPalette,
  pickColorLevel,
  type ColorScheme,
  type PaletteProbeState,
  type TerminalProfile,
  type Theme,
} from "@silvery/ansi"
import { watch } from "@silvery/signals"
import { ThemeProvider } from "@silvery/ag-react/ThemeProvider"
import type { InputOwner } from "./input-owner"
import type { Modes } from "./devices/modes"
import type { Size } from "./devices/size"

const log = createLogger("silvery:palette")

export interface PaletteSession extends Disposable {
  /** Whether the palette currently painted came from an answered probe. */
  readonly state: PaletteProbeState
  /** The theme currently painted. */
  readonly theme: Theme
  /** Subscribe to theme replacement. Returns an unsubscribe function. */
  subscribe(listener: () => void): () => void
  /**
   * Probe the terminal palette again and replace the theme when the answer
   * differs. Concurrent calls share one probe; a call that arrives while a
   * probe is in flight runs one more probe after it.
   */
  reprobePalette(): Promise<PaletteProbeState>
}

export interface PaletteSessionOptions {
  /** The startup profile: its `theme` and `paletteProbe` seed the session. */
  profile: TerminalProfile
  input: InputOwner
  size: Size
  modes: Modes
  fallbackDark?: ColorScheme
  fallbackLight?: ColorScheme
  /** Per-OSC-query timeout in ms (default 150, as at startup). */
  timeoutMs?: number
}

export function createPaletteSession(opts: PaletteSessionOptions): PaletteSession {
  const { profile, input, size, modes } = opts
  if (!profile.theme || !profile.paletteProbe) {
    throw new Error(
      "createPaletteSession needs a profile from probeTerminalProfile with probeTheme enabled " +
        `(theme ${profile.theme ? "present" : "missing"}, paletteProbe ${profile.paletteProbe ?? "missing"})`,
    )
  }
  let theme: Theme = profile.theme
  let state: PaletteProbeState = profile.paletteProbe
  const listeners = new Set<() => void>()
  let inFlight: Promise<PaletteProbeState> | null = null
  let rerun = false
  let disposed = false

  if (state === "unanswered") {
    log.info?.(
      "palette probe unanswered (OSC 10/11/4): the canvas paints the terminal default background " +
        "(SGR 49); re-probing on the next resize, focus-in, or color-scheme notice",
    )
  }

  async function probeOnce(reason: string): Promise<void> {
    const result = await detectPalette({
      caps: profile.caps,
      fallbackDark: opts.fallbackDark,
      fallbackLight: opts.fallbackLight,
      timeoutMs: opts.timeoutMs,
      input,
    })
    if (disposed) return
    if (result.state === "unanswered" && state === "answered") {
      log.info?.(`palette re-probe (${reason}) unanswered; keeping the answered palette`)
      return
    }
    const next = profile.caps.colorForced
      ? pickColorLevel(result.theme, profile.colorLevel)
      : result.theme
    const changed = JSON.stringify(next) !== JSON.stringify(theme)
    log.info?.(
      `palette re-probe (${reason}): ${state} → ${result.state}${changed ? "" : ", unchanged"}`,
    )
    state = result.state
    if (!changed) return
    theme = next
    for (const listener of listeners) listener()
  }

  function run(reason: string): Promise<PaletteProbeState> {
    if (inFlight) {
      rerun = true
      return inFlight
    }
    inFlight = (async () => {
      try {
        do {
          rerun = false
          await probeOnce(reason)
        } while (rerun && !disposed)
        return state
      } finally {
        inFlight = null
      }
    })()
    return inFlight
  }

  function trigger(reason: string): void {
    run(reason).catch((err: unknown) => {
      log.error?.(`palette re-probe (${reason}) failed: ${String(err)}`)
    })
  }

  const colorSchemeMode = modes.enable("colorSchemeReporting")
  const stops = [
    input.onColorSchemeNotice((scheme) => trigger(`color-scheme notice: ${scheme}`)),
    input.onFocus((event) => {
      if (event.focused && state === "unanswered") trigger("focus-in")
    }),
    watch(
      () => size.snapshot(),
      (next) => {
        if (state === "unanswered") trigger(`resize to ${next.cols}x${next.rows}`)
      },
    ),
  ]

  return {
    get state() {
      return state
    },
    get theme() {
      return theme
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    reprobePalette: () => run("reprobePalette()"),
    [Symbol.dispose]() {
      if (disposed) return
      disposed = true
      for (const stop of stops) stop()
      colorSchemeMode[Symbol.dispose]()
      listeners.clear()
    },
  }
}

/** ThemeProvider that follows the session's palette. */
export function PaletteThemeProvider({
  session,
  children,
}: {
  session: PaletteSession
  children: ReactNode
}): ReactElement {
  const theme = useSyncExternalStore(
    session.subscribe,
    () => session.theme,
    () => session.theme,
  )
  return <ThemeProvider theme={theme}>{children}</ThemeProvider>
}
