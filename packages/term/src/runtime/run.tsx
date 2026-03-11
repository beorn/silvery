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
 * import { run, useInput } from '@silvery/term/runtime'
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

import { useContext, useEffect, useRef, type ReactElement } from "react"

import { RuntimeContext } from "@silvery/react/context"
import { createApp } from "./create-app"
import type { Key, InputHandler } from "./keys"
import type { Term } from "../ansi/term"
import { detectTerminalCaps } from "../terminal-caps"

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
   * Render mode: fullscreen (alt screen, default) or inline (scrollback-compatible).
   */
  mode?: "fullscreen" | "inline"
  /**
   * Enable Kitty text sizing protocol (OSC 66) for PUA characters.
   * Ensures nerdfont/powerline icons are measured and rendered at the correct width.
   * - `true`: force enable
   * - `"auto"`: enable if terminal supports it (Kitty 0.40+, Ghostty)
   * - `false`: disabled
   * - Default: "auto"
   */
  textSizing?: boolean | "auto"
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
  /** Wait until the app exits */
  waitUntilExit(): Promise<void>
  /** Unmount and cleanup */
  unmount(): void
  /** Dispose (alias for unmount) — enables `using` */
  [Symbol.dispose](): void
  /** Send a key press */
  press(key: string): Promise<void>
}

/** Paste handler callback type */
export type PasteHandler = (text: string) => void

// ============================================================================
// Hooks (Layer 2 — uses RuntimeContext, works in both run() and createApp())
// ============================================================================

/**
 * Hook for handling keyboard input.
 *
 * Layer 2 variant: supports returning 'exit' from the handler to exit the app.
 * For the standard hook (isActive, onPaste options), import from 'silvery'.
 *
 * @example
 * ```tsx
 * useInput((input, key) => {
 *   if (input === 'q') return 'exit'
 *   if (key.upArrow) moveCursor(-1)
 *   if (key.downArrow) moveCursor(1)
 * })
 * ```
 */
export function useInput(handler: InputHandler): void {
  const rt = useContext(RuntimeContext)

  // Stable ref for the handler — avoids tearing down/recreating the
  // subscription on every render. Without this, rapid keystrokes between
  // effect cleanup and setup are lost (e.g., Ctrl+D twice, Escape).
  const handlerRef = useRef(handler)
  handlerRef.current = handler

  useEffect(() => {
    if (!rt) return
    return rt.on("input", (input: string, key: Key) => {
      const result = handlerRef.current(input, key)
      if (result === "exit") rt.exit()
    })
  }, [rt])
}

/**
 * Hook for programmatic exit.
 */
export function useExit(): () => void {
  const rt = useContext(RuntimeContext)
  if (!rt) throw new Error("useExit must be used within run() or createApp()")
  return rt.exit
}

/**
 * Hook for handling bracketed paste events.
 */
export function usePaste(handler: PasteHandler): void {
  const rt = useContext(RuntimeContext)

  // Stable ref — same pattern as useInput to avoid lost paste events.
  const handlerRef = useRef(handler)
  handlerRef.current = handler

  useEffect(() => {
    if (!rt) return
    return rt.on("paste", (text: string) => {
      handlerRef.current(text)
    })
  }, [rt])
}

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
export async function run(element: ReactElement, term: Term): Promise<RunHandle>
export async function run(element: ReactElement, options?: RunOptions): Promise<RunHandle>
export async function run(
  element: ReactElement,
  optionsOrTerm: RunOptions | Term = {},
): Promise<RunHandle> {
  // Term path: pass Term as provider + its streams, auto-enable from Term caps
  if (isTerm(optionsOrTerm)) {
    const term = optionsOrTerm as Term
    const emulator = (term as Record<string, unknown>)._emulator as
      | { feed(data: string): void }
      | undefined

    // Emulator-backed term: headless mode with writable routing to emulator
    if (emulator) {
      const app = createApp(() => () => ({}))
      const handle = await app.run(element, {
        writable: { write: (s: string) => emulator.feed(s) },
        cols: term.cols ?? 80,
        rows: term.rows ?? 24,
        // Wire resize: term.subscribe() fires when term.resize() is called
        onResize: (handler) => term.subscribe((state) => handler(state)),
      })
      return wrapHandle(handle)
    }

    // Real terminal: full setup
    const caps = term.caps ?? detectTerminalCaps()
    const app = createApp(() => () => ({}))
    const handle = await app.run(element, {
      term,
      stdout: term.stdout,
      stdin: term.stdin,
      cols: term.cols ?? undefined,
      rows: term.rows ?? undefined,
      caps,
      alternateScreen: true,
      kitty: caps.kittyKeyboard,
      mouse: true,
      focusReporting: true,
      textSizing: "auto",
    })
    return wrapHandle(handle)
  }

  // Options path: auto-detect caps and derive defaults
  const { mode, ...rest } = optionsOrTerm as RunOptions
  const caps = rest.caps ?? detectTerminalCaps()
  const app = createApp(() => () => ({}))
  const handle = await app.run(element, {
    ...rest,
    caps,
    alternateScreen: mode !== "inline",
    kitty: rest.kitty ?? caps.kittyKeyboard,
    mouse: rest.mouse ?? mode !== "inline",
    focusReporting: rest.focusReporting ?? true,
    textSizing: rest.textSizing ?? "auto",
  })
  return wrapHandle(handle)
}

/** Duck-type check: Term has getState and events as functions.
 *  Note: Term is a Proxy wrapping chalk, so typeof is "function" not "object". */
function isTerm(obj: unknown): obj is Term {
  if (obj == null) return false
  if (typeof obj !== "object" && typeof obj !== "function") return false
  const o = obj as Record<string, unknown>
  return typeof o.getState === "function" && typeof o.events === "function"
}

/** Wrap AppHandle as RunHandle (subset of the full handle). */
function wrapHandle(handle: {
  readonly text: string
  waitUntilExit(): Promise<void>
  unmount(): void
  [Symbol.dispose](): void
  press(key: string): Promise<void>
}): RunHandle {
  return {
    get text() {
      return handle.text
    },
    waitUntilExit: () => handle.waitUntilExit(),
    unmount: () => handle.unmount(),
    [Symbol.dispose]: () => handle[Symbol.dispose](),
    press: (key: string) => handle.press(key),
  }
}
