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
  detectTheme,
  pickColorLevel,
  type ColorTier,
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
 */
export interface RunOptions {
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
   * Terminal capabilities for width measurement and output suppression.
   * Default: auto-detected via detectTerminalCaps()
   */
  caps?: import("../terminal-caps.js").TerminalCaps
  /**
   * Pre-built {@link TerminalProfile}. When supplied, `run()` skips its own
   * `createTerminalProfile()` call and uses this profile end-to-end — the
   * profile's `caps` feed the pipeline, and the pre-quantize gate reads
   * `profile.source` to decide whether the OSC-detected theme should be
   * re-quantized. This is the Phase 4 single-source-of-truth entry point:
   * callers that already built a profile (e.g. via a top-level bootstrap,
   * a test harness, or a Term adapter) can pass it through without each
   * entry point re-detecting caps + color tier.
   *
   * When supplied alongside `caps` or `colorLevel`, the profile wins — the
   * other fields are silently ignored to avoid double-detection ambiguity.
   */
  profile?: TerminalProfile
  /**
   * Force the color tier end-to-end, bypassing auto-detection.
   *
   * When set, the pipeline's `caps.colorLevel` is overridden for the full
   * run (affects inline hex quantization, mono attribute fallback, SGR
   * encoding, backdrop blend targets), AND the active Theme is pre-quantized
   * via {@link pickColorLevel} so token hex values match.
   *
   * Useful for:
   * - bypassing under-reporting terminals (force `"truecolor"`),
   * - testing low-end degradation (force `"ansi16"` or `"mono"`),
   * - accessibility / CI output (force `"mono"`).
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
  colorLevel?: ColorTier
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
    // `term.caps` is guaranteed populated (Phase 2 of
    // km-silvery.terminal-profile-plateau made it non-optional). Phase 3
    // routes env-var overrides (NO_COLOR / FORCE_COLOR) and the
    // `termOptions.colorLevel` override through `createTerminalProfile` —
    // one detection function, one precedence chain. Phase 4 lets callers
    // bypass detection entirely by threading a `profile` through
    // `termOptions`.
    const termProfile: TerminalProfile =
      termOptions?.profile ??
      createTerminalProfile({
        colorOverride: termOptions?.colorLevel,
        caps: term.caps,
      })
    const caps: TerminalCaps = termProfile.caps
    // Pre-quantize the OSC-detected theme when the tier was *forced* — i.e.
    // env vars (NO_COLOR / FORCE_COLOR) or an explicit `colorLevel` override
    // displaced the terminal's natural tier. When the tier came from caps or
    // auto-detect, the theme passes through unchanged.
    // Phase 4: one boolean read on `profile.source` replaces the prior
    // tier-comparison hack (`termProfile.colorTier !== term.caps.colorLevel`).
    const termForcedTier: ColorTier | undefined =
      termProfile.source === "env" || termProfile.source === "override"
        ? termProfile.colorTier
        : undefined
    // Detect terminal colors via OSC — must happen before alt screen.
    // When colorLevel is forced, pre-quantize the detected theme.
    //
    // Phase 1 of km-silvery.input-owner: we construct an InputOwner for the
    // probe window only — it owns raw-mode + stdin listener for the duration
    // of detectTheme, then disposes BEFORE createApp spins up the
    // term-provider. This avoids the wasRaw race between probeColors' finally
    // and term-provider.events() startup that killed host-TUI input.
    // Phase 2 will extend ownership across the entire session.
    //
    // Phase 8b: pre-session probe is the transient owner window before
    // `term.input` takes over. Constructing an InputOwner here is the correct
    // primitive — the Term's own lazy `term.input` getter would yield a second
    // owner competing for stdin. Internal accessor reads the raw streams
    // since the public Term interface no longer exposes them.
    const { stdin: termStdin, stdout: termStdout } = getInternalStreams(term)
    const probeOwner =
      termStdin?.isTTY && termStdout?.isTTY
        ? createInputOwner(termStdin, termStdout, { retainRawModeOnDispose: true })
        : null
    let theme
    try {
      theme = await detectTheme({
        fallbackDark: nord,
        fallbackLight: catppuccinLatte,
        ...(probeOwner ? { input: probeOwner } : {}),
      })
    } finally {
      probeOwner?.dispose()
    }
    const resolvedTheme = termForcedTier ? pickColorLevel(theme, termForcedTier) : theme
    const themed = <ThemeProvider theme={resolvedTheme}>{element}</ThemeProvider>
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
  // Phase 3 of km-silvery.terminal-profile-plateau: one `createTerminalProfile`
  // call replaces the prior `detectTerminalCaps` + `resolveColorTier` trio.
  // Env vars (NO_COLOR / FORCE_COLOR) > `options.colorLevel` > caller-supplied
  // `options.caps.colorLevel` > auto-detect — see the profile docstring for
  // the full precedence chain. Phase 4 also lets callers pass a pre-built
  // `profile` to bypass detection entirely.
  const {
    mode,
    colorLevel: colorLevelOption,
    profile: profileOption,
    ...rest
  } = optionsOrTerm as RunOptions
  const optsProfile: TerminalProfile =
    profileOption ??
    createTerminalProfile({
      colorOverride: colorLevelOption,
      caps: rest.caps,
    })
  const caps: TerminalCaps = optsProfile.caps
  // Pre-quantize when the tier was forced (env override or explicit
  // `colorLevel`). Phase 4 replaces the prior triple env-var read + option
  // check with one `profile.source` lookup — same semantics, one source of
  // truth. A caller-supplied `profile` whose `source` is already `"env"` or
  // `"override"` triggers pre-quantization too (the profile tells us the
  // resolution was forced upstream).
  const effectiveTier: ColorTier | undefined =
    optsProfile.source === "env" || optsProfile.source === "override"
      ? optsProfile.colorTier
      : undefined
  const headless = rest.writable != null || (rest.cols != null && rest.rows != null && !rest.stdout)
  // Detect terminal colors via OSC — must happen before alt screen (skipped for headless).
  // When colorLevel is forced, pre-quantize the detected theme to the chosen tier so
  // token hex values match what the pipeline will actually emit.
  //
  // See the primary detectTheme() call above for the InputOwner rationale.
  const runStdin = (rest.stdin ?? process.stdin) as NodeJS.ReadStream
  const runStdout = (rest.stdout ?? process.stdout) as NodeJS.WriteStream
  const optsProbeOwner =
    !headless && runStdin.isTTY && runStdout.isTTY
      ? createInputOwner(runStdin, runStdout, { retainRawModeOnDispose: true })
      : null
  let themed: ReactElement
  if (headless) {
    themed = element
  } else {
    try {
      const theme = await detectTheme({
        fallbackDark: nord,
        fallbackLight: catppuccinLatte,
        ...(optsProbeOwner ? { input: optsProbeOwner } : {}),
      })
      const resolvedTheme = effectiveTier ? pickColorLevel(theme, effectiveTier) : theme
      themed = <ThemeProvider theme={resolvedTheme}>{element}</ThemeProvider>
    } finally {
      optsProbeOwner?.dispose()
    }
  }
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
