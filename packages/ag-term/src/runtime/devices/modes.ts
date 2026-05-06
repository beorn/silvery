/**
 * term.modes — single owner for terminal protocol modes, exposed as signals.
 *
 * Consolidates the previously-scattered enable/disable calls for:
 *   - raw mode (stdin termios)
 *   - alternate screen buffer (DEC private mode 1049)
 *   - bracketed paste (DEC private mode 2004)
 *   - Kitty keyboard protocol (CSI > flags u / CSI < u)
 *   - mouse tracking (modes 1003 + 1006, optional 1016 SGR-Pixels)
 *   - focus reporting (DEC private mode 1004)
 *
 * ## Why
 *
 * Terminal protocol modes are *shared global state*. The historical pattern —
 * every subsystem (probe, runtime, provider) calls `enableX()` / `disableX()`
 * independently — produces the same race class that killed raw mode in the
 * 2026-04-22 `wasRaw` incident: multi-tenant toggling of global termios/
 * terminal state across async boundaries.
 *
 * ## API shape: signals
 *
 * Each mode is a callable alien-signals `Signal<T>`:
 *
 * - `modes.altScreen()`      — read current value
 * - `modes.altScreen(true)`  — write; internal effect emits ANSI on change
 * - `effect(() => modes.altScreen())` — subscribe to changes
 *
 * Idempotence is automatic: alien-signals doesn't fire dependents when the
 * new value equals the prior value, so `modes.altScreen(true)` twice produces
 * one ANSI write.
 *
 * ## Ownership contract
 *
 * One `Modes` instance per Term. Construction is cheap — no ANSI is emitted
 * until the first write to a signal. Callers write modes ONCE at session
 * start and restore them ONCE on dispose. Mid-session re-toggling is
 * permitted (e.g. suspend/resume flows need to drop protocols before SIGTSTP),
 * but MUST go through the owner so state stays consistent.
 *
 * Signals reflect the last value *this owner* wrote. They are the app's
 * source of truth — the terminal has no query-for-current-mode protocol for
 * most of these.
 *
 * ## Dispose
 *
 * Restores every mode this owner activated (ignores modes the owner never
 * touched — setting `rawMode=false` when we never enabled raw would be wrong
 * on a shared stdin). Dispose writes `false` to each ever-activated signal;
 * the internal effects emit the disable ANSI naturally. Idempotent.
 *
 * Bead: km-silvery.term-sub-owners (Phase 4) + km-silvery.modes-as-signals.
 */

import { signal, effect, type Signal } from "@silvery/signals"

import {
  enableMouse,
  disableMouse,
  enableKittyKeyboard,
  disableKittyKeyboard,
  enableBracketedPaste,
  disableBracketedPaste,
} from "@silvery/ansi"

const CSI = "\x1b["

/** DEC private mode 1004: focus-in / focus-out reporting. */
const ENABLE_FOCUS_REPORTING = `${CSI}?1004h`
const DISABLE_FOCUS_REPORTING = `${CSI}?1004l`

/** DEC private mode 1049: alternate screen buffer (save + switch). */
const ENTER_ALT_SCREEN = `${CSI}?1049h`
const LEAVE_ALT_SCREEN = `${CSI}?1049l`

/**
 * Kitty keyboard protocol flags (bitfield).
 *
 * | Flag | Bit | Description                               |
 * | ---- | --- | ----------------------------------------- |
 * | 1    | 0   | Disambiguate escape codes                 |
 * | 2    | 1   | Report event types (press/repeat/release) |
 * | 4    | 2   | Report alternate keys                     |
 * | 8    | 3   | Report all keys as escape codes           |
 * | 16   | 4   | Report associated text                    |
 */
export const KittyFlags = {
  DISAMBIGUATE: 1,
  REPORT_EVENTS: 2,
  REPORT_ALTERNATE: 4,
  REPORT_ALL_KEYS: 8,
  REPORT_TEXT: 16,
} as const

/**
 * Mode names that can be passed to `modes.enable(...)`. These cover every
 * toggleable mode on the `Modes` owner. `kittyKeyboard` accepts a bitfield
 * rather than `true` and is handled via the per-mode signal directly (see
 * the `kittyKeyboard` signal below) — it's intentionally excluded from
 * `enable()` because the "on" value is not a single fixed boolean.
 */
export type ModeName = "rawMode" | "altScreen" | "bracketedPaste" | "mouse" | "focusReporting"

export type MouseTrackingMode = boolean | "pixel"

/**
 * Terminal protocol modes sub-owner.
 *
 * Each property is a callable alien-signals `Signal`:
 * - read:      `modes.altScreen()` → `boolean`
 * - write:     `modes.altScreen(true)` — internal effect emits ANSI on change
 * - subscribe: `effect(() => modes.altScreen())`
 *
 * `dispose()` writes `false` to every signal that was ever activated, which
 * drives the same effects to emit the disable ANSI. Mode signals that were
 * never touched stay `false` — no ANSI is emitted for them, matching the
 * shared-stdin safety contract.
 *
 * For scope-style ownership (`scope.use(modes.enable("altScreen"))`), use
 * `enable()` — it returns a `Disposable` that restores the mode to whatever
 * it was before the call, independent of the owner's full `dispose()`.
 */
export interface Modes extends Disposable {
  /**
   * stdin raw mode.
   *
   * wasRaw note: prefer a single `modes.rawMode(true)` at session start; do
   * not capture-and-restore around async work. See
   * `vendor/silvery/CLAUDE.md` "Anti-pattern: wasRaw".
   */
  readonly rawMode: Signal<boolean>

  /** Alternate screen buffer (DEC 1049). */
  readonly altScreen: Signal<boolean>

  /** Bracketed paste (DEC 2004). */
  readonly bracketedPaste: Signal<boolean>

  /**
   * Kitty keyboard protocol flags. Bitfield (see `KittyFlags`) to enable,
   * `false` to disable. A change from one non-false bitfield to another
   * emits a fresh `CSI > flags u` write.
   */
  readonly kittyKeyboard: Signal<number | false>

  /** SGR mouse tracking (xterm modes 1003 + 1006, or 1003 + 1006 + 1016). */
  readonly mouse: Signal<MouseTrackingMode>

  /** Focus-in / focus-out reporting (DEC 1004). */
  readonly focusReporting: Signal<boolean>

  /**
   * Enable a mode and return a `Disposable` that restores the mode to its
   * prior value on disposal. Complements the per-mode signals for callers
   * that want scope-style ownership:
   *
   * ```ts
   * scope.use(term.modes.enable("altScreen"))
   * // …later, when the scope disposes, altScreen flips back to its
   * // pre-enable value.
   * ```
   *
   * Idempotent across repeated `enable(name)` calls (alien-signals equality
   * short-circuits same-value writes). Disposing the returned handle twice
   * is a no-op. The kitty keyboard bitfield is intentionally not covered —
   * write `modes.kittyKeyboard(flags)` directly for that shape.
   */
  enable(name: ModeName): Disposable
}

/**
 * Options for `createModes()`.
 *
 * The owner needs:
 * - a write function for ANSI sequences (routes through Output if activated,
 *   else bare `stdout.write`)
 * - the stdin stream (for `rawMode` — termios toggle, not ANSI)
 */
export interface CreateModesOptions {
  /** Write raw ANSI bytes to stdout. */
  write: (data: string) => void
  /** stdin stream — used only for raw-mode termios toggles. */
  stdin: NodeJS.ReadStream
}

/**
 * Create a `Modes` sub-owner. Does not emit any ANSI at construction — all
 * sequences are written lazily on the first change to a mode signal.
 */
export function createModes(opts: CreateModesOptions): Modes {
  const { write, stdin } = opts

  const rawMode = signal<boolean>(false)
  const altScreen = signal<boolean>(false)
  const bracketedPaste = signal<boolean>(false)
  const kittyKeyboard = signal<number | false>(false)
  const mouse = signal<MouseTrackingMode>(false)
  const focusReporting = signal<boolean>(false)

  // Track which modes this owner ever activated. Dispose only restores those,
  // matching the pre-signals behaviour — we must not emit a disable sequence
  // for a mode a neighbouring owner intentionally set up.
  let touchedRawMode = false
  let touchedAltScreen = false
  let touchedBracketedPaste = false
  let touchedKittyKeyboard = false
  let touchedMouse = false
  let touchedFocusReporting = false

  let disposed = false
  let disposing = false

  // Each mode has a dedicated effect: when the signal changes, emit the
  // matching enable/disable ANSI. Same-value writes don't fire dependents
  // (alien-signals equality check), so idempotence is automatic.
  //
  // Each effect reads its signal once, which seeds the dependency. The first
  // firing is the "seed" read (value=false) — we skip emitting ANSI there so
  // construction stays free, matching the previous lazy-first-write contract.
  let rawSeeded = false
  const stopRawEffect = effect(() => {
    const on = rawMode()
    if (!rawSeeded) {
      rawSeeded = true
      return
    }
    if (disposed && !disposing) return
    if (on) touchedRawMode = true
    if (stdin.isTTY) {
      try {
        stdin.setRawMode(on)
      } catch {
        // stdin may be closed mid-call — ignore, signal value still tracked
      }
    }
  })

  let altSeeded = false
  const stopAltEffect = effect(() => {
    const on = altScreen()
    if (!altSeeded) {
      altSeeded = true
      return
    }
    if (disposed && !disposing) return
    if (on) touchedAltScreen = true
    try {
      write(on ? ENTER_ALT_SCREEN : LEAVE_ALT_SCREEN)
    } catch {
      // Terminal may already be gone (SSH disconnect, etc.)
    }
  })

  let pasteSeeded = false
  const stopPasteEffect = effect(() => {
    const on = bracketedPaste()
    if (!pasteSeeded) {
      pasteSeeded = true
      return
    }
    if (disposed && !disposing) return
    if (on) touchedBracketedPaste = true
    try {
      write(on ? enableBracketedPaste() : disableBracketedPaste())
    } catch {
      // Terminal may already be gone
    }
  })

  let kittySeeded = false
  const stopKittyEffect = effect(() => {
    const flags = kittyKeyboard()
    if (!kittySeeded) {
      kittySeeded = true
      return
    }
    if (disposed && !disposing) return
    if (flags !== false) touchedKittyKeyboard = true
    try {
      write(flags === false ? disableKittyKeyboard() : enableKittyKeyboard(flags))
    } catch {
      // Terminal may already be gone
    }
  })

  let mouseSeeded = false
  const stopMouseEffect = effect(() => {
    const on = mouse()
    if (!mouseSeeded) {
      mouseSeeded = true
      return
    }
    if (disposed && !disposing) return
    if (on) touchedMouse = true
    try {
      write(on ? enableMouse({ pixels: on === "pixel" }) : disableMouse())
    } catch {
      // Terminal may already be gone
    }
  })

  let focusSeeded = false
  const stopFocusEffect = effect(() => {
    const on = focusReporting()
    if (!focusSeeded) {
      focusSeeded = true
      return
    }
    if (disposed && !disposing) return
    if (on) touchedFocusReporting = true
    try {
      write(on ? ENABLE_FOCUS_REPORTING : DISABLE_FOCUS_REPORTING)
    } catch {
      // Terminal may already be gone
    }
  })

  const dispose = () => {
    if (disposed) return
    disposed = true
    disposing = true

    // Restore ONLY what this owner activated. Order matters: drop protocols
    // first (so the terminal stops sending their events), then leave the alt
    // screen, then drop raw. Mirrors the order of `restoreTerminalState()`
    // in terminal-lifecycle.ts.
    //
    // We flip each signal back to its inactive value; the per-mode effect
    // emits the disable ANSI as a side-effect. Effects that were never
    // activated stay at `false` (no value change → no emission).
    if (touchedFocusReporting) focusReporting(false)
    if (touchedMouse) mouse(false)
    if (touchedKittyKeyboard) kittyKeyboard(false)
    if (touchedBracketedPaste) bracketedPaste(false)
    if (touchedAltScreen) altScreen(false)
    if (touchedRawMode) rawMode(false)

    disposing = false

    // Tear down the effects now that the restore writes have fired. Any
    // further writes to the signals after this point update the values but
    // do not emit ANSI (effects are stopped, and the `disposed && !disposing`
    // guard blocks the edge case where tearDown order races).
    stopRawEffect()
    stopAltEffect()
    stopPasteEffect()
    stopKittyEffect()
    stopMouseEffect()
    stopFocusEffect()
  }

  function enable(name: ModeName): Disposable {
    const sig =
      name === "rawMode"
        ? rawMode
        : name === "altScreen"
          ? altScreen
          : name === "bracketedPaste"
            ? bracketedPaste
            : name === "mouse"
              ? mouse
              : focusReporting
    const prior = sig()
    sig(true)
    let disposed = false
    return {
      [Symbol.dispose]() {
        if (disposed) return
        disposed = true
        sig(prior)
      },
    }
  }

  return {
    rawMode,
    altScreen,
    bracketedPaste,
    kittyKeyboard,
    mouse,
    focusReporting,
    enable,
    [Symbol.dispose]: dispose,
  }
}
