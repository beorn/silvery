/**
 * run() - Layer 2 entry point for silvery-loop
 *
 * Thin wrapper over createApp() for simple React apps with keyboard input.
 * Use this when you want React component state (useState, useEffect)
 * with simple keyboard input via useInput().
 *
 * For stores and providers, use createApp() (Layer 3) directly.
 *
 * @example
 * ```tsx
 * import { run, useInput } from '@silvery/ag-term/runtime'
 *
 * function Counter() {
 *   const [count, setCount] = useState(0)
 *
 *   useInput((input, key) => {
 *     if (input === 'j') setCount(c => c + 1)
 *     if (key.upArrow) setCount(c => c + 1)
 *     if (input === 'q') return 'exit'
 *   })
 *
 *   return <Text>Count: {count}</Text>
 * }
 *
 * await run(<Counter />)
 * ```
 */

import React, { type ReactElement } from "react"

import { createApp } from "./create-app"
import type { Term } from "../ansi/term"
import {
  createTerminalProfile,
  probeTerminalProfile,
  type ColorLevel,
  type TerminalProfile,
} from "@silvery/ansi"
import { nord, catppuccinLatte } from "@silvery/theme/schemes"
import { ThemeProvider } from "@silvery/ag-react/ThemeProvider"
import type { TerminalCaps } from "../terminal-caps"
import { createInputOwner } from "./input-owner"
import { getInternalStreams } from "./term-internal"

// Re-export types from keys.ts
export type { Key, InputHandler } from "./keys"

// ============================================================================
// Types
// ============================================================================

/**
 * Options for run().
 *
 * run() auto-detects terminal capabilities and enables features by default.
 * Pass explicit values to override. For the full list of capabilities detected,
 * see {@link detectTerminalCaps} in terminal-caps.ts.
 *
 * **Mouse tracking note:** When `mouse` is enabled (the default), the terminal
 * captures mouse events and native text selection (copy/paste) requires holding
 * Shift (or Option on macOS in some terminals). Set `mouse: false` to restore
 * native copy/paste behavior.
 *
 * **Profile vs caps/colorLevel (XOR):** `RunOptions` is a type-level union —
 * callers supply *either* a pre-built `profile: TerminalProfile` *or* the
 * `caps` / `colorLevel` fields, never both. Mixing them is a compile error;
 * a runtime warning fires if JS callers smuggle both through. The `caps`
 * branch is `@deprecated` (see its JSDoc); `colorLevel` is a canonical
 * shorthand for `profile: createTerminalProfile({ colorLevel })`.
 */
export type RunOptions = RunOptionsCommon & RunOptionsProfileBranch

/**
 * Fields shared between both branches of the RunOptions XOR (everything
 * except `profile` / `caps` / `colorLevel`).
 */
export interface RunOptionsCommon {
  /** Terminal dimensions (default: from process.stdout) */
  cols?: number
  rows?: number
  /** Standard output (default: process.stdout) */
  stdout?: NodeJS.WriteStream
  /** Standard input (default: process.stdin) */
  stdin?: NodeJS.ReadStream
  /**
   * Plain writable sink for ANSI output. Headless mode with active output.
   * Requires cols and rows. Input via handle.press().
   */
  writable?: { write(data: string): void }
  /** Abort signal for external cleanup */
  signal?: AbortSignal
  /**
   * Enable Kitty keyboard protocol for unambiguous key identification
   * (Cmd ⌘, Hyper ✦ modifiers, key release events).
   * - `true`: enable with DISAMBIGUATE flag (1)
   * - number: enable with specific KittyFlags bitfield
   * - `false`: don't enable
   * - Default: auto-detected from terminal (enabled for Ghostty, Kitty, WezTerm, foot)
   */
  kitty?: boolean | number
  /**
   * Enable SGR mouse tracking (mode 1006) for click, scroll, and drag events.
   * When enabled, native text selection requires holding Shift (or Option on macOS)
   * and native terminal scrolling is disabled.
   * Default: `true` in fullscreen mode, `false` in inline mode (where content
   * lives in terminal scrollback and natural scrolling is expected).
   */
  mouse?: boolean
  /**
   * Enable buffer-level text selection via mouse drag.
   * When enabled, left-mouse-drag selects text and mouse-up copies the
   * selected text to the system clipboard via OSC 52. Defaults to `true`
   * when `mouse` is enabled. Set to `false` to disable silvery's internal
   * selection entirely — users can still select via Shift+drag (or Option
   * on macOS) for the terminal's native selection.
   */
  selection?: boolean
  /**
   * Render mode:
   * - `"fullscreen"` — alt screen buffer (default)
   * - `"inline"` — scrollback-compatible, no alt screen
   * - `"virtualInline"` — alt screen with virtual scrollback (scrollable history + search)
   */
  mode?: "fullscreen" | "inline" | "virtualInline"
  /**
   * Enable Kitty text sizing protocol (OSC 66) for PUA characters.
   * Ensures nerdfont/powerline icons are measured and rendered at the correct width.
   * - `true`: force enable
   * - `"auto"`: use heuristic, then probe to verify (progressive enhancement)
   * - `"probe"`: start disabled, probe async, enable on confirmation
   * - `false`: disabled
   * - Default: "auto"
   */
  textSizing?: boolean | "auto" | "probe"
  /**
   * Enable DEC width mode detection (modes 1020-1023).
   * Queries the terminal for emoji/CJK/PUA width settings at startup.
   * - `true`: always run width detection probe
   * - `"auto"`: run probe when caps are provided (default)
   * - `false`: disabled
   * Default: "auto"
   */
  widthDetection?: boolean | "auto"
  /**
   * Enable terminal focus reporting (CSI ?1004h).
   * Dispatches 'term:focus' events with `{ focused: boolean }`.
   * Default: true
   */
  focusReporting?: boolean
  /**
   * Handle Tab / Shift+Tab as focus-cycling keystrokes. When `false`,
   * Tab and Shift+Tab reach `useInput` instead of being consumed by the
   * focus manager. Default: `true`.
   *
   * Apps with a single focusable (or none) benefit from disabling this —
   * e.g. Claude-Code-style "Shift+Tab cycles permission mode" bindings
   * where focus navigation isn't meaningful.
   */
  handleTabCycling?: boolean
  /**
   * Handle Ctrl+Z by suspending the process. Default: true
   */
  suspendOnCtrlZ?: boolean
  /**
   * Handle Ctrl+C by restoring terminal and exiting. Default: true
   */
  exitOnCtrlC?: boolean
  /** Called before suspend. Return false to prevent. */
  onSuspend?: () => boolean | void
  /** Called after resume from suspend. */
  onResume?: () => void
  /** Called on Ctrl+C. Return false to prevent exit. */
  onInterrupt?: () => boolean | void
}

/**
 * The profile-vs-caps XOR branch of {@link RunOptions}.
 *
 * TypeScript distinguishes these two shapes via the `?: never` idiom —
 * passing `profile` marks `caps` / `colorLevel` as `never`, and vice versa.
 * Mixing them is a compile error. Callers that actually build a profile from
 * caps should use `createTerminalProfile({ caps, colorLevel })` and pass the
 * resulting profile.
 *
 * Phase 5 of `km-silvery.terminal-profile-plateau` (/pro review 2026-04-23):
 * this replaces the prior "silent-wins" semantics where supplying both fields
 * had the profile silently ignore the others. Silent precedence was exactly
 * the bug class the plateau was supposed to kill.
 */
export type RunOptionsProfileBranch =
  | {
      /**
       * Pre-built {@link TerminalProfile}. When supplied, `run()` skips its
       * own `createTerminalProfile()` call and uses this profile end-to-end
       * — the profile's `caps` feed the pipeline, and the pre-quantize gate
       * reads `profile.colorForced` to decide whether the OSC-detected theme
       * should be re-quantized. This is the single-source-of-truth entry
       * point: callers that already built a profile (e.g. via a top-level
       * bootstrap, a test harness, or a Term adapter) pass it through
       * without each entry point re-detecting caps + color tier.
       *
       * Mutually exclusive with `caps` / `colorLevel` — see
       * {@link RunOptionsProfileBranch}.
       */
      profile: TerminalProfile
      caps?: never
      colorLevel?: never
    }
  | {
      profile?: undefined
      /**
       * Terminal capabilities for width measurement and output suppression.
       * Default: auto-detected via the profile factory.
       *
       * @deprecated Use `profile: createTerminalProfile({ caps })` instead.
       * Will be removed in 1.1. The `caps` option can't encode color
       * provenance (`colorForced` / `colorProvenance`) so it conflates
       * "detected real caps" with "synthetically forced caps"; `profile`
       * carries both.
       */
      caps?: TerminalCaps
      /**
       * Force the color tier end-to-end, bypassing auto-detection.
       *
       * Canonical shorthand for `profile: createTerminalProfile({ colorLevel })`
       * — the option name is aligned 1:1 with `caps.colorLevel` and the
       * profile-factory argument of the same name, so the shorthand is a
       * clean override rather than a second way to name the same field.
       *
       *   run(<App />, { colorLevel: "truecolor" })                         // 4× shorter
       *   run(<App />, { profile: createTerminalProfile({ colorLevel }) })  // long form
       *
       * When set, the pipeline's `caps.colorLevel` is overridden for the
       * full run (affects inline hex quantization, mono attribute fallback,
       * SGR encoding, backdrop blend targets), AND the active Theme is
       * pre-quantized via `pickColorLevel` so token hex values match.
       *
       * Priority (highest wins): `NO_COLOR` env → `FORCE_COLOR` env →
       * `colorLevel` → auto-detect.
       *
       * Tiers:
       * - `"mono"` — monochrome (attribute fallback: bold/dim/inverse).
       * - `"ansi16"` — 16-slot palette (SGR 30-37, 90-97).
       * - `"256"` — xterm-256 palette.
       * - `"truecolor"` — 24-bit RGB (no quantization).
       */
      colorLevel?: ColorLevel
    }

/**
 * Handle returned by run() for controlling the app.
 */
export interface RunHandle {
  /** Current rendered text (no ANSI) */
  readonly text: string
  /** Live reconciler root node (for locator queries) */
  readonly root: import("@silvery/ag/types").AgNode
  /** Current terminal buffer (cell-level access) */
  readonly buffer: import("../buffer").TerminalBuffer | null
  /** Wait until the app exits */
  waitUntilExit(): Promise<void>
  /** Unmount and cleanup */
  unmount(): void
  /** Dispose (alias for unmount) — enables `using` */
  [Symbol.dispose](): void
  /** Send a key press */
  press(key: string): Promise<void>
}

// ============================================================================
// Hooks (Layer 2 — uses RuntimeContext, works in both run() and createApp())
// ============================================================================

// All hooks re-exported from ag-react — single implementation, no duplication.
// run.tsx has zero hook implementations. See km-silvery.zero-hooks-run.
export { useInput, type UseInputOptions } from "@silvery/ag-react/hooks/useInput"
export { useExit } from "@silvery/ag-react/hooks/useExit"
export {
  usePasteCallback as usePaste,
  type PasteCallback as PasteHandler,
} from "@silvery/ag-react/hooks/usePasteCallback"

// ============================================================================
// run() — thin wrapper over createApp()
// ============================================================================

/**
 * Run a React component with the silvery-loop runtime.
 *
 * Accepts either a Term instance or RunOptions:
 * - `run(<App />, term)` — Term handles streams, createApp handles rendering
 * - `run(<App />, { cols, rows, ... })` — classic options API
 *
 * Internally delegates to createApp() with an empty store.
 * For stores and providers, use createApp() directly.
 */
export async function run(
  element: ReactElement,
  term: Term,
  termOptions?: Partial<RunOptions>,
): Promise<RunHandle>
export async function run(element: ReactElement, options?: RunOptions): Promise<RunHandle>
export async function run(
  element: ReactElement,
  optionsOrTerm: RunOptions | Term = {},
  termOptions?: Partial<RunOptions>,
): Promise<RunHandle> {
  // Term path: pass Term as provider + its streams, auto-enable from Term caps
  if (isTerm(optionsOrTerm)) {
    const term = optionsOrTerm as Term
    // Phase 5 (/pro review 2026-04-23): XOR enforcement for termOptions too —
    // the Term path has the same profile-vs-caps conflict.
    if (termOptions) warnIfMixedRunOptions(termOptions)
    const emulator = (term as unknown as Record<string, unknown>)._emulator as
      | { feed(data: string): void }
      | undefined

    // Emulator-backed term: non-headless mode with stdout routing to emulator.
    // Create a mock stdin that forwards sendInput() data to the term provider's
    // input parser, so events flow through the full createApp pipeline.
    if (emulator) {
      const { EventEmitter } = await import("node:events")
      const stdinEmitter = new EventEmitter()
      const mockStdin = Object.assign(stdinEmitter, {
        isTTY: true,
        isRaw: false,
        fd: 0,
        setRawMode(_mode: boolean) {
          mockStdin.isRaw = _mode
          return mockStdin
        },
        read() {
          return null
        },
        resume() {
          return mockStdin
        },
        pause() {
          return mockStdin
        },
        ref() {
          return mockStdin
        },
        unref() {
          return mockStdin
        },
        setEncoding() {
          return mockStdin
        },
      }) as unknown as NodeJS.ReadStream

      // Wire sendInput: when term.sendInput(data) is called, emit on mock stdin
      // so the term provider's parser processes it through the real pipeline.
      // The mixed-proxy's set/defineProperty traps forward to termBase,
      // so this override replaces the original sendInput with one that
      // feeds the mock stdin instead of the internal event queue.
      if ((term as any).sendInput) {
        ;(term as any).sendInput = (data: string) => {
          stdinEmitter.emit("data", data)
        }
      }

      // Resolve alternateScreen from termOptions.mode (if provided).
      // The mode prop is consumed at the run() level for the options path,
      // but in the Term path it needs explicit conversion.
      const termMode = termOptions?.mode
      const altScreen = termMode === "inline" ? false : true

      const app = createApp(() => () => ({}))
      // Phase 8b: createApp.run() still wants raw streams. Use the internal
      // accessor — public Term interface no longer exposes them.
      const { stdout: termStdoutInternal } = getInternalStreams(term)
      const handle = await app.run(element, {
        alternateScreen: altScreen,
        ...termOptions,
        stdin: mockStdin,
        stdout: termStdoutInternal, // Feeds emulator — protocol escapes reach the emulator
        guardOutput: false, // Don't monkeypatch process.stdout in test/emulator context
        cols: term.cols ?? 80,
        rows: term.rows ?? 24,
      })
      return wrapHandle(handle)
    }

    // Real terminal: full setup.
    //
    // One async call drives the whole detection pass: probeTerminalProfile
    // bundles caps + colorLevel + colorForced + theme into a single TerminalProfile,
    // applies the pre-quantize gate on its own, and lets the probe window be
    // a structural concern instead of a copy-pasted try/finally block.
    //
    // The InputOwner is still transient — owns raw-mode + stdin listener for
    // the probe duration only, disposed BEFORE createApp spins up its own
    // input owner. That separation is what avoids the wasRaw race between
    // probeColors' finally and term-provider startup (see km-silvery.input-owner
    // Phase 1-2; Phase 8b pins the rationale — `term.input` would yield a
    // second owner competing for stdin if constructed here).
    //
    // Post km-silvery.plateau-profile-theme (H2 /big review 2026-04-23):
    // collapses the prior `createTerminalProfile` + InputOwner dance +
    // `detectTheme` + `pickColorLevel` quartet into one function call. The
    // `termOptions.profile` caller-override still short-circuits the whole
    // thing, and `term.profile` is the caps base when no override is passed.
    const { stdin: termStdin, stdout: termStdout } = getInternalStreams(term)
    const probeOwner =
      termStdin?.isTTY && termStdout?.isTTY
        ? createInputOwner(termStdin, termStdout, { retainRawModeOnDispose: true })
        : null
    // Read profile / colorLevel through a widened view of termOptions — the
    // TS union narrows them to `never` on the opposite XOR branch, but the
    // runtime warning above already enforces mutual exclusion.
    const termOptsAny = termOptions as
      | (Partial<RunOptionsCommon> & { profile?: TerminalProfile; colorLevel?: ColorLevel })
      | undefined
    let termProfile: TerminalProfile
    try {
      termProfile =
        termOptsAny?.profile ??
        (await probeTerminalProfile({
          colorLevel: termOptsAny?.colorLevel,
          caps: term.profile.caps,
          fallbackDark: nord,
          fallbackLight: catppuccinLatte,
          ...(probeOwner ? { input: probeOwner } : {}),
        }))
    } finally {
      probeOwner?.dispose()
    }
    const caps: TerminalCaps = termProfile.caps
    // `profile.theme` is populated by probeTerminalProfile (already
    // pre-quantized when `profile.colorForced === true`). When a caller
    // supplied a pre-built profile without a theme, no ThemeProvider wrap
    // happens — the app uses whatever ThemeProvider higher up the tree or
    // the framework default.
    const themed = termProfile.theme ? (
      <ThemeProvider theme={termProfile.theme}>{element}</ThemeProvider>
    ) : (
      element
    )
    const app = createApp(() => () => ({}))
    // Phase 8b: real-terminal Term adapter — createApp's option bag still takes
    // raw WriteStream / ReadStream, so we thread them via the internal accessor.
    // (termStdin / termStdout are already in scope from the probe above.)
    const handle = await app.run(themed, {
      term,
      stdout: termStdout,
      stdin: termStdin,
      cols: term.cols ?? undefined,
      rows: term.rows ?? undefined,
      caps,
      // Thread the resolved profile through so createApp's `profileOption`
      // branch sees the same source-of-truth that run() already consulted.
      // Phase 4 of km-silvery.terminal-profile-plateau.
      profile: termProfile,
      alternateScreen: true,
      kitty: caps.kittyKeyboard,
      mouse: true,
      focusReporting: true,
      textSizing: "auto",
      widthDetection: "auto",
    })
    return wrapHandle(handle)
  }

  // Options path: auto-detect caps and derive defaults.
  //
  // Post km-silvery.plateau-profile-theme (H2 /big review 2026-04-23):
  // collapses the prior `createTerminalProfile` + InputOwner + `detectTheme`
  // + `pickColorLevel` dance into one `probeTerminalProfile` call. The
  // `options.profile` caller-override still short-circuits the probe, and
  // headless terms skip the probe entirely (no theme wrap).
  //
  // Phase 5 (/pro review 2026-04-23): the RunOptions type is XOR at the TS
  // level — profile vs caps/colorLevel are mutually exclusive. A JS caller
  // can still smuggle both; the runtime warning below is the back-stop.
  warnIfMixedRunOptions(optionsOrTerm)
  const {
    mode,
    colorLevel: colorLevelOption,
    profile: profileOption,
    caps: capsOption,
    ...rest
  } = optionsOrTerm as RunOptions & { caps?: TerminalCaps; colorLevel?: ColorLevel }
  const headless = rest.writable != null || (rest.cols != null && rest.rows != null && !rest.stdout)
  const runStdin = (rest.stdin ?? process.stdin) as NodeJS.ReadStream
  const runStdout = (rest.stdout ?? process.stdout) as NodeJS.WriteStream

  // Transient InputOwner around the probe window — owns raw-mode + stdin
  // listener for the duration, disposed BEFORE createApp constructs its own
  // input owner. Same shape as the Term-path branch above.
  const optsProbeOwner =
    !headless && runStdin.isTTY && runStdout.isTTY
      ? createInputOwner(runStdin, runStdout, { retainRawModeOnDispose: true })
      : null
  let optsProfile: TerminalProfile
  try {
    optsProfile =
      profileOption ??
      (headless
        ? createTerminalProfile({ colorLevel: colorLevelOption, caps: capsOption })
        : await probeTerminalProfile({
            colorLevel: colorLevelOption,
            caps: capsOption,
            fallbackDark: nord,
            fallbackLight: catppuccinLatte,
            ...(optsProbeOwner ? { input: optsProbeOwner } : {}),
          }))
  } finally {
    optsProbeOwner?.dispose()
  }
  const caps: TerminalCaps = optsProfile.caps
  // Headless renders don't wrap in ThemeProvider — no OSC probe ran, no
  // theme was bundled. Non-headless renders with a theme wrap the element
  // so the app sees the detected (and pre-quantized when forced) theme.
  const themed: ReactElement =
    !headless && optsProfile.theme ? (
      <ThemeProvider theme={optsProfile.theme}>{element}</ThemeProvider>
    ) : (
      element
    )
  const app = createApp(() => () => ({}))
  const handle = await app.run(themed, {
    ...rest,
    caps,
    // Thread the resolved profile through so createApp's `profileOption`
    // branch sees the same source-of-truth that run() already consulted.
    // Phase 4 of km-silvery.terminal-profile-plateau.
    profile: optsProfile,
    alternateScreen: mode !== "inline",
    virtualInline: mode === "virtualInline",
    kitty: rest.kitty ?? caps.kittyKeyboard,
    mouse: rest.mouse ?? mode !== "inline",
    focusReporting: rest.focusReporting ?? mode !== "inline",
    textSizing: rest.textSizing ?? "auto",
    widthDetection: rest.widthDetection ?? "auto",
  })
  return wrapHandle(handle)
}

/** Duck-type check: Term has the sub-owner umbrella (size + modes + signals).
 *  Note: Term is a Proxy wrapping chalk, so typeof is "function" not "object". */
function isTerm(obj: unknown): obj is Term {
  if (obj == null) return false
  if (typeof obj !== "object" && typeof obj !== "function") return false
  const o = obj as Record<string, unknown>
  return (
    typeof o.size === "object" &&
    o.size !== null &&
    typeof (o.size as Record<string, unknown>).cols === "function" &&
    typeof o.modes === "object" &&
    o.modes !== null
  )
}

/** Wrap AppHandle as RunHandle (subset of the full handle). */
function wrapHandle(handle: {
  readonly text: string
  readonly root: import("@silvery/ag/types").AgNode
  readonly buffer: import("../buffer").TerminalBuffer | null
  waitUntilExit(): Promise<void>
  unmount(): void
  [Symbol.dispose](): void
  press(key: string): Promise<void>
}): RunHandle {
  return {
    get text() {
      return handle.text
    },
    get root() {
      return handle.root
    },
    get buffer() {
      return handle.buffer
    },
    waitUntilExit: () => handle.waitUntilExit(),
    unmount: () => handle.unmount(),
    [Symbol.dispose]: () => handle[Symbol.dispose](),
    press: (key: string) => handle.press(key),
  }
}

/**
 * Runtime enforcement for {@link RunOptions}.
 *
 * Two concerns, one helper (Phase 5 of `km-silvery.terminal-profile-plateau`,
 * per /pro review 2026-04-23):
 *
 * 1. **XOR back-stop** — TS already makes `{ profile, caps }` / `{ profile,
 *    colorLevel }` a compile error; this fires when a JS caller (or an
 *    `as any` test setup) smuggles both through. Profile still wins at
 *    runtime, matching the pre-Phase-5 behaviour, but the caller is on
 *    notice that mixing is against the contract.
 *
 * 2. **Deprecation warning** — `caps` is `@deprecated` on
 *    {@link RunOptionsProfileBranch} and scheduled for deletion in 1.1 (see
 *    km-silvery.runoptions-caps-colorlevel-removal). A one-time warning
 *    fires on any use of `caps`, even without `profile`, so callers can
 *    migrate before the delete lands. `colorLevel` is NOT deprecated — it
 *    is the canonical shorthand for the profile route (names align 1:1
 *    with `caps.colorLevel` / `createTerminalProfile({ colorLevel })`).
 *
 * Warnings fire once per process per category — a long-running TUI shouldn't
 * spam stderr on every render, but a script that calls `run()` once under a
 * hostile linter has a clear path to fix its options.
 */
let mixedRunOptionsWarned = false
let deprecatedCapsWarned = false

function warnIfMixedRunOptions(options: unknown): void {
  if (options == null || typeof options !== "object") return
  const o = options as { profile?: unknown; caps?: unknown; colorLevel?: unknown }
  const hasProfile = o.profile != null
  const hasCaps = o.caps != null
  const hasColorLevel = o.colorLevel != null

  if (hasProfile && (hasCaps || hasColorLevel) && !mixedRunOptionsWarned) {
    mixedRunOptionsWarned = true
    // eslint-disable-next-line no-console
    console.warn(
      "[silvery] run() received both `profile` and `caps`/`colorLevel` — " +
        "these are mutually exclusive. `profile` wins; the others are ignored. " +
        "Pass one or the other — e.g. run({ profile: createTerminalProfile({ " +
        "caps, colorLevel }) }) — not both.",
    )
    // When mixed, the deprecated-use warning is redundant with the mixed
    // warning (the mixed message already names the fields).
    return
  }

  if (hasCaps && !deprecatedCapsWarned) {
    deprecatedCapsWarned = true
    // eslint-disable-next-line no-console
    console.warn(
      "[silvery] run({ caps }) is deprecated and will be removed in 1.1. " +
        "Migrate to run({ profile: createTerminalProfile({ caps }) }) so the " +
        "profile carries color provenance end-to-end.",
    )
  }
}

/**
 * Test-only hook to reset the once-per-process warning latches.
 * @internal
 */
export function _resetRunOptionsWarningForTesting(): void {
  mixedRunOptionsWarned = false
  deprecatedCapsWarned = false
}
