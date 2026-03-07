/**
 * run() - Layer 2 entry point for hightea-loop
 *
 * Provides React hooks integration on top of createRuntime.
 * Use this when you want React component state (useState, useEffect)
 * with simple keyboard input handling.
 *
 * @example
 * ```tsx
 * import { run, useInput } from '@hightea/term/runtime'
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

import process from "node:process"
import { createContext, useContext, useEffect, type ReactElement } from "react"

import { createTerm } from "@hightea/ansi"
import {
  FocusManagerContext,
  RuntimeContext,
  type RuntimeContextValue,
  StdoutContext,
  TermContext,
} from "../context.js"
import { createFocusManager, type FocusManager } from "../focus-manager.js"
import { createCursorStore, CursorProvider } from "../hooks/useCursor.js"
import { createFocusEvent, createKeyEvent, dispatchFocusEvent, dispatchKeyEvent } from "../focus-events.js"
import { findByTestID } from "../focus-queries.js"
import { executeRender } from "../pipeline/index.js"
import { createPipeline } from "../measurer.js"
import { createContainer, createFiberRoot, getContainerRoot, reconciler } from "../reconciler.js"
import { merge, takeUntil } from "../streams/index.js"
import { createBuffer } from "./create-buffer.js"
import { createRuntime } from "./create-runtime.js"
import { type InputHandler, type Key, parseKey } from "./keys.js"
import { splitRawInput } from "../keys.js"
import type { TerminalBuffer } from "../buffer.js"
import type { TeaNode, Rect } from "../types.js"
import { parseBracketedPaste } from "../bracketed-paste.js"
import { isMouseSequence, parseMouseSequence } from "../mouse.js"
import { createMouseEventProcessor, processMouseEvent } from "../mouse-events.js"
import { enableBracketedPaste, disableBracketedPaste } from "../bracketed-paste.js"
import { enableKittyKeyboard, disableKittyKeyboard, KittyFlags, enableMouse, disableMouse } from "../output.js"
import { detectKittyFromStdio } from "../kitty-detect.js"
import { isTextSizingLikelySupported } from "../text-sizing.js"
import { ensureLayoutEngine } from "./layout.js"
import { captureTerminalState, performSuspend, CTRL_C, CTRL_Z } from "./terminal-lifecycle.js"
import type { Buffer, Dims, Event, RenderTarget, Runtime } from "./types.js"

// Re-export types from keys.ts
export type { Key, InputHandler } from "./keys.js"

// ============================================================================
// Types
// ============================================================================

/**
 * Options for run().
 */
export interface RunOptions {
  /** Terminal dimensions (default: from process.stdout) */
  cols?: number
  rows?: number
  /** Standard output (default: process.stdout) */
  stdout?: NodeJS.WriteStream
  /** Standard input (default: process.stdin) */
  stdin?: NodeJS.ReadStream
  /** Abort signal for external cleanup */
  signal?: AbortSignal
  /**
   * Enable Kitty keyboard protocol.
   * - `true`: auto-detect and enable with DISAMBIGUATE flag (1)
   * - number: enable with specific KittyFlags bitfield
   * - `false`/undefined: don't enable (default)
   */
  kitty?: boolean | number
  /**
   * Enable SGR mouse tracking (mode 1006).
   * When true, enables mouse events and disables on cleanup.
   * Default: false
   */
  mouse?: boolean
  /**
   * Render mode: fullscreen (alt screen, default) or inline (scrollback-compatible).
   * In inline mode:
   * - No screen clear or alt screen buffer
   * - Content auto-sizes to height (no terminal-height constraint)
   * - useScrollback() works correctly (cursor displacement tracked)
   * - Exit restores cursor and moves to end (no alt screen restore)
   */
  mode?: "fullscreen" | "inline"
  /**
   * Enable Kitty text sizing protocol (OSC 66) for PUA characters.
   * When enabled, nerdfont/powerline icons are measured as 2-wide and
   * wrapped in OSC 66 sequences so the terminal renders them at the
   * correct width.
   * - `true`: force enable
   * - `"auto"`: enable if terminal likely supports it (Kitty 0.40+, Ghostty)
   * - `false`/undefined: disabled (default)
   */
  textSizing?: boolean | "auto"
  /**
   * Terminal capabilities for width measurement and output suppression.
   * When provided, configures the render pipeline to use these caps
   * (scoped width measurer + output phase). Typically from term.caps
   * (auto-detected) or manual override.
   */
  caps?: import("../terminal-caps.js").TerminalCaps
  /**
   * Handle Ctrl+Z by suspending the process (save terminal state,
   * send SIGTSTP, restore on SIGCONT). Default: true
   */
  suspendOnCtrlZ?: boolean
  /**
   * Handle Ctrl+C by restoring terminal and exiting with code 130.
   * Default: true
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
 * Handle returned by run() for testing and control.
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

// ============================================================================
// Contexts
// ============================================================================

/** Internal context for run()'s own runtime handle + exit. */
interface RunInternalContextValue {
  runtime: Runtime
  exit: () => void
}

const RunInternalContext = createContext<RunInternalContextValue | null>(null)

interface InputContextValue {
  subscribe: (handler: InputHandler) => () => void
}

const InputContext = createContext<InputContextValue | null>(null)

/** Paste handler callback type */
export type PasteHandler = (text: string) => void

interface PasteContextValue {
  subscribe: (handler: PasteHandler) => () => void
}

const PasteContext = createContext<PasteContextValue | null>(null)

// ============================================================================
// Hooks
// ============================================================================

/**
 * Hook for handling keyboard input.
 *
 * @example
 * ```tsx
 * useInput((input, key) => {
 *   if (input === 'q') return 'exit'
 *   if (key.upArrow) moveCursor(-1)
 *   if (key.downArrow) moveCursor(1)
 *   if (key.return) submit()
 *   if (key.ctrl && input === 'c') return 'exit'
 * })
 * ```
 */
export function useInput(handler: InputHandler): void {
  const ctx = useContext(InputContext)

  useEffect(() => {
    if (!ctx) return
    return ctx.subscribe(handler)
  }, [ctx, handler])
}

/**
 * Hook for programmatic exit.
 */
export function useExit(): () => void {
  const ctx = useContext(RunInternalContext)
  if (!ctx) throw new Error("useExit must be used within run()")
  return ctx.exit
}

/**
 * Hook for handling bracketed paste events.
 *
 * When the terminal has bracketed paste mode enabled (default),
 * pasted text is delivered as a single string instead of
 * individual keystrokes.
 *
 * @example
 * ```tsx
 * usePaste((text) => {
 *   insertText(text)
 * })
 * ```
 */
export function usePaste(handler: PasteHandler): void {
  const ctx = useContext(PasteContext)

  useEffect(() => {
    if (!ctx) return
    return ctx.subscribe(handler)
  }, [ctx, handler])
}

// ============================================================================
// Focus Navigation (shared between event loop and press())
// ============================================================================

/**
 * Handle focus navigation keys (Tab, Shift+Tab, Enter for scope, Escape for scope exit,
 * arrow keys for spatial navigation).
 *
 * @returns true if the key was handled (consumed), false otherwise.
 *   Arrow keys perform spatial navigation but return false so they can still
 *   fall through to app-level handlers.
 */
function handleFocusNavigation(
  parsedKey: Key,
  focusManager: FocusManager,
  root: TeaNode,
  layoutFn?: (node: TeaNode) => Rect | null,
): boolean {
  if (parsedKey.tab && !parsedKey.shift) {
    focusManager.focusNext(root)
    return true
  }
  if (parsedKey.tab && parsedKey.shift) {
    focusManager.focusPrev(root)
    return true
  }
  if (parsedKey.return) {
    // Enter: if focused element has focusScope, enter that scope
    const activeEl = focusManager.activeElement
    if (activeEl) {
      const props = activeEl.props as Record<string, unknown>
      const testID = typeof props.testID === "string" ? props.testID : null
      if (props.focusScope && testID) {
        focusManager.enterScope(testID)
        // Focus the first focusable child within the scope
        focusManager.focusNext(root, activeEl)
        return true
      }
    }
  }
  if (parsedKey.escape && focusManager.scopeStack.length > 0) {
    // Escape: exit the current focus scope
    const scopeId = focusManager.scopeStack[focusManager.scopeStack.length - 1]!
    focusManager.exitScope()
    // Restore focus to the scope node itself
    const scopeNode = findByTestID(root, scopeId)
    if (scopeNode) {
      focusManager.focus(scopeNode, "keyboard")
    }
    return true
  }
  if (parsedKey.upArrow || parsedKey.downArrow || parsedKey.leftArrow || parsedKey.rightArrow) {
    const direction = parsedKey.upArrow ? "up" : parsedKey.downArrow ? "down" : parsedKey.leftArrow ? "left" : "right"
    focusManager.focusDirection(root, direction, layoutFn)
    // Don't consume arrow events — let them fall through to app handlers
    return false
  }
  return false
}

// ============================================================================
// Implementation
// ============================================================================

/**
 * Run a React component with the hightea-loop runtime.
 *
 * This is Layer 2 - it provides React hooks (useState, useEffect)
 * with simple keyboard input handling via useInput().
 *
 * For more control (custom event loop), use createRuntime() directly (Layer 1).
 * For stores and providers, use createApp() (Layer 3).
 */
export async function run(element: ReactElement, options: RunOptions = {}): Promise<RunHandle> {
  const {
    cols: explicitCols,
    rows: explicitRows,
    stdout: explicitStdout,
    stdin = process.stdin,
    signal: externalSignal,
    kitty: kittyOption,
    mouse: mouseOption = false,
    textSizing: textSizingOption,
    caps: capsOption,
    mode: modeOption = "fullscreen",
    suspendOnCtrlZ: suspendOption = true,
    exitOnCtrlC: exitOnCtrlCOption = true,
    onSuspend: onSuspendHook,
    onResume: onResumeHook,
    onInterrupt: onInterruptHook,
  } = options

  const headless = explicitCols != null && explicitRows != null && !explicitStdout
  const cols = explicitCols ?? process.stdout.columns ?? 80
  const rows = explicitRows ?? process.stdout.rows ?? 24
  const stdout = explicitStdout ?? process.stdout

  // Initialize layout engine
  await ensureLayoutEngine()

  // Create abort controller for cleanup
  const controller = new AbortController()
  const signal = controller.signal

  // Wire external signal
  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort()
    } else {
      externalSignal.addEventListener("abort", () => controller.abort(), {
        once: true,
      })
    }
  }

  // Track current dimensions
  let currentDims: Dims = { cols, rows }

  // Protocol tracking
  let kittyEnabled = false
  let kittyFlags: number = KittyFlags.DISAMBIGUATE
  let mouseEnabled = false
  let bracketedPasteEnabled = false

  // Resolve textSizing from caps + option
  const textSizingEnabled =
    textSizingOption === true ||
    (textSizingOption === "auto" && (capsOption?.textSizingSupported ?? isTextSizingLikelySupported()))

  // Create pipeline config from caps (scoped width measurer + output phase)
  const pipelineConfig = capsOption
    ? createPipeline({ caps: { ...capsOption, textSizingSupported: textSizingEnabled } })
    : undefined

  // Focus manager (tree-based focus system) with event dispatch wiring
  const focusManager = createFocusManager({
    onFocusChange(oldNode, newNode, _origin) {
      // Dispatch blur event on the old element
      if (oldNode) {
        const blurEvent = createFocusEvent("blur", oldNode, newNode)
        dispatchFocusEvent(blurEvent)
      }
      // Dispatch focus event on the new element
      if (newNode) {
        const focusEvent = createFocusEvent("focus", newNode, oldNode)
        dispatchFocusEvent(focusEvent)
      }
    },
  })

  // Per-instance cursor state (replaces module-level globals)
  const cursorStore = createCursorStore()

  // Mouse event processor for DOM-level dispatch (with click-to-focus)
  const mouseEventState = createMouseEventProcessor({ focusManager })

  // Input handlers
  const inputHandlers = new Set<InputHandler>()
  const pasteHandlers = new Set<PasteHandler>()
  let shouldExit = false

  // ========================================================================
  // Render Batching
  // ========================================================================

  let renderScheduled = false
  let currentBuffer: Buffer
  let prevTermBuffer: TerminalBuffer | null = null

  // Reconcile React state, run render pipeline, return Buffer for output.
  function doRender(): Buffer {
    const _t0 = performance.now()
    reconciler.updateContainerSync(wrappedElement, fiberRoot, null, () => {})
    reconciler.flushSyncWork()
    const _t1 = performance.now()

    const rootNode = getContainerRoot(container)
    const dims = runtime.getDims()
    const height = modeOption === "inline" ? NaN : dims.rows
    const { buffer: termBuffer } = executeRender(rootNode, dims.cols, height, prevTermBuffer, undefined, pipelineConfig)
    prevTermBuffer = termBuffer
    const _t2 = performance.now()

    const buf = createBuffer(termBuffer, rootNode)
    const _t3 = performance.now()

    if (process.env.HIGHTEA_PROFILE_RENDER) {
      logRenderProfile(_t0, _t1, _t2, _t3)
    }
    return buf
  }

  // Batched render - coalesces multiple calls within same tick
  function scheduleRender(): void {
    if (renderScheduled || shouldExit) return
    renderScheduled = true

    queueMicrotask(() => {
      if (shouldExit) {
        renderScheduled = false
        return
      }

      currentBuffer = doRender()
      runtime.render(currentBuffer)
      renderScheduled = false
    })
  }

  /** HIGHTEA_PROFILE_RENDER: per-phase timing to stderr */
  function logRenderProfile(t0: number, t1: number, t2: number, t3: number): void {
    const react = (t1 - t0).toFixed(1)
    const pipeline = (t2 - t1).toFixed(1)
    const buffer = (t3 - t2).toFixed(1)
    const total = (t3 - t0).toFixed(1)
    const phases = (globalThis as any).__hightea_last_pipeline
    if (phases) {
      const m = phases.measure.toFixed(1)
      const l = phases.layout.toFixed(1)
      const s = phases.scroll.toFixed(1)
      const c = phases.content.toFixed(1)
      const o = phases.output.toFixed(1)
      process.stderr.write(
        `[render] react=${react}ms pipeline=${pipeline}ms (measure=${m} layout=${l} scroll=${s} content=${c} output=${o}) buffer=${buffer}ms total=${total}ms\n`,
      )
    } else {
      process.stderr.write(`[render] react=${react}ms pipeline=${pipeline}ms buffer=${buffer}ms total=${total}ms\n`)
    }
  }

  // ========================================================================
  // Keyboard Input
  // ========================================================================

  function createKeyboardSource(): AsyncIterable<Event> {
    return {
      async *[Symbol.asyncIterator]() {
        if (!stdin.isTTY) return

        stdin.setRawMode(true)
        stdin.resume()
        stdin.setEncoding("utf8")

        try {
          while (!signal.aborted) {
            const rawKey = await new Promise<string | null>((resolve) => {
              const onData = (data: string) => {
                stdin.off("data", onData)
                resolve(data)
              }
              const onAbort = () => {
                stdin.off("data", onData)
                resolve(null)
              }
              stdin.on("data", onData)
              signal.addEventListener("abort", onAbort, { once: true })
            })

            if (rawKey === null || signal.aborted) break

            // Intercept lifecycle keys BEFORE they reach useInput handlers.
            // In raw mode, Ctrl+C (\x03) and Ctrl+Z (\x1a) don't generate
            // signals — we must handle the raw bytes ourselves.
            if (!headless && rawKey === CTRL_Z && suspendOption) {
              const prevented = onSuspendHook?.() === false
              if (!prevented) {
                const state = captureTerminalState({
                  alternateScreen: modeOption === "fullscreen",
                  cursorHidden: true,
                  mouse: mouseEnabled,
                  kitty: kittyEnabled,
                  kittyFlags,
                  bracketedPaste: bracketedPasteEnabled,
                  rawMode: true,
                })
                performSuspend(state, stdout, stdin, () => {
                  // After resume, trigger a full re-render
                  runtime.invalidate()
                  onResumeHook?.()
                })
              }
              continue
            }
            if (!headless && rawKey === CTRL_C && exitOnCtrlCOption) {
              const prevented = onInterruptHook?.() === false
              if (!prevented) {
                exit()
                break
              }
              continue
            }

            // Check for bracketed paste before splitting into individual keys.
            // Pasted text arrives wrapped in markers and should be emitted as
            // a single paste event, not character-by-character.
            const pasteResult = parseBracketedPaste(rawKey)
            if (pasteResult) {
              yield { type: "paste" as const, content: pasteResult.content }
              continue
            }

            // Split multi-character chunks into individual keypresses.
            // stdin "data" events can contain multiple characters buffered
            // together (rapid typing, paste, or auto-repeat).
            for (const keyChunk of splitRawInput(rawKey)) {
              // Check for mouse sequences first
              if (isMouseSequence(keyChunk)) {
                const parsed = parseMouseSequence(keyChunk)
                if (parsed) {
                  yield {
                    type: "mouse" as const,
                    button: parsed.button,
                    x: parsed.x,
                    y: parsed.y,
                    action: parsed.action,
                    delta: parsed.delta,
                    shift: parsed.shift,
                    meta: parsed.meta,
                    ctrl: parsed.ctrl,
                  }
                  continue
                }
              }

              const [input, key] = parseKey(keyChunk)

              yield {
                type: "key" as const,
                key: keyChunk,
                input,
                parsedKey: key,
                ctrl: key.ctrl,
                meta: key.meta,
                shift: key.shift,
                super: key.super,
                hyper: key.hyper,
                eventType: key.eventType,
              }
            }
          }
        } finally {
          if (stdin.isTTY) {
            // Only pause here — setRawMode(false) is deferred to the event
            // loop's finally block so it runs AFTER terminal restore sequences
            // (bracketed paste, mouse, kitty, cursor show). This prevents a
            // race where disabling raw mode before writing those sequences
            // leaves the terminal in a broken state.
            stdin.pause()
          }
        }
      },
    }
  }

  // ========================================================================
  // Setup
  // ========================================================================

  // Create render target
  const target: RenderTarget = headless
    ? {
        write() {},
        getDims: () => currentDims,
      }
    : {
        write(frame: string): void {
          stdout.write(frame)
        },
        getDims(): Dims {
          return currentDims
        },
        onResize(handler: (dims: Dims) => void): () => void {
          const onResize = () => {
            currentDims = {
              cols: stdout.columns || 80,
              rows: stdout.rows || 24,
            }
            handler(currentDims)
          }
          stdout.on("resize", onResize)
          return () => stdout.off("resize", onResize)
        },
      }

  // Create runtime
  const runtime = createRuntime({ target, signal, mode: modeOption, outputPhaseFn: pipelineConfig?.outputPhaseFn })

  // Exit function
  const exit = () => {
    shouldExit = true
    controller.abort()
  }

  // Input context value (run() runtime's own subscription system)
  const inputContextValue: InputContextValue = {
    subscribe(handler: InputHandler) {
      inputHandlers.add(handler)
      return () => inputHandlers.delete(handler)
    },
  }

  // Paste context value (run()'s own hook system)
  const pasteContextValue: PasteContextValue = {
    subscribe(handler: PasteHandler) {
      pasteHandlers.add(handler)
      return () => pasteHandlers.delete(handler)
    },
  }

  // Internal runtime context (for useExit)
  const runInternalContextValue: RunInternalContextValue = {
    runtime,
    exit,
  }

  // RuntimeContext — typed event bus bridging from run()'s handler Sets
  const unifiedRuntimeValue: RuntimeContextValue = {
    on(event, handler) {
      if (event === "input") {
        const wrapped: InputHandler = (input, key) => {
          ;(handler as (input: string, key: import("../keys.js").Key) => void)(input, key)
        }
        inputHandlers.add(wrapped)
        return () => inputHandlers.delete(wrapped)
      }
      if (event === "paste") {
        pasteHandlers.add(handler as (text: string) => void)
        return () => pasteHandlers.delete(handler as (text: string) => void)
      }
      return () => {} // Unknown event — no-op cleanup
    },
    emit() {
      // run() runtime doesn't support view → runtime events yet
    },
    exit,
  }

  // Create HighteaNode container (persistent for React state)
  const container = createContainer(() => {
    // Schedule render when React state changes
    scheduleRender()
  })

  // Create React fiber root
  const fiberRoot = createFiberRoot(container)

  // Create mock stdout for contexts.
  // Must support resize events so ScrollbackView can detect terminal size changes
  // and re-emit frozen items at the new width. Must forward writes to the real
  // target so useScrollback's resize path (clear screen + re-emit frozen items)
  // actually reaches the terminal.
  const resizeListeners = new Set<() => void>()
  const mockStdout = {
    columns: cols,
    rows: rows,
    write: (data: string) => {
      target.write(data)
      return true
    },
    isTTY: false,
    on(event: string, handler: () => void) {
      if (event === "resize") resizeListeners.add(handler)
      return mockStdout
    },
    off(event: string, handler: () => void) {
      if (event === "resize") resizeListeners.delete(handler)
      return mockStdout
    },
    once: () => mockStdout,
    removeListener(event: string, handler: () => void) {
      if (event === "resize") resizeListeners.delete(handler)
      return mockStdout
    },
    addListener(event: string, handler: () => void) {
      if (event === "resize") resizeListeners.add(handler)
      return mockStdout
    },
  } as unknown as NodeJS.WriteStream

  // Create mock term for useTerm()
  const mockTerm = createTerm({ color: "truecolor" })

  // Wrap element with all required providers
  const wrappedElement = (
    <CursorProvider store={cursorStore}>
      <TermContext.Provider value={mockTerm}>
        <StdoutContext.Provider
          value={{
            stdout: mockStdout,
            write: () => {},
            notifyScrollback: (lines: number) => runtime.addScrollbackLines(lines),
            resetInlineCursor: () => runtime.resetInlineCursor(),
            getInlineCursorRow: () => runtime.getInlineCursorRow(),
            promoteScrollback: (content: string, lines: number) => runtime.promoteScrollback(content, lines),
          }}
        >
          <FocusManagerContext.Provider value={focusManager}>
            <RunInternalContext.Provider value={runInternalContextValue}>
              <RuntimeContext.Provider value={unifiedRuntimeValue}>
                <PasteContext.Provider value={pasteContextValue}>
                  <InputContext.Provider value={inputContextValue}>{element}</InputContext.Provider>
                </PasteContext.Provider>
              </RuntimeContext.Provider>
            </RunInternalContext.Provider>
          </FocusManagerContext.Provider>
        </StdoutContext.Provider>
      </TermContext.Provider>
    </CursorProvider>
  )

  // Initial render (synchronous, not batched)
  currentBuffer = doRender()

  // Setup terminal: fullscreen clears screen, inline just hides cursor
  if (!headless) {
    if (modeOption === "inline") {
      stdout.write("\x1b[?25l") // Hide cursor only
    } else {
      stdout.write("\x1b[2J\x1b[H\x1b[?25l") // Clear screen + home + hide cursor
    }

    // Kitty keyboard protocol
    if (kittyOption != null && kittyOption !== false) {
      if (kittyOption === true) {
        const result = await detectKittyFromStdio(stdout, stdin as NodeJS.ReadStream)
        if (result.supported) {
          stdout.write(enableKittyKeyboard(KittyFlags.DISAMBIGUATE))
          kittyEnabled = true
          kittyFlags = KittyFlags.DISAMBIGUATE
        }
      } else {
        stdout.write(enableKittyKeyboard(kittyOption as 1))
        kittyEnabled = true
        kittyFlags = kittyOption as number
      }
    }

    // Mouse tracking
    if (mouseOption) {
      stdout.write(enableMouse())
      mouseEnabled = true
    }

    // Bracketed paste mode
    enableBracketedPaste(stdout)
    bracketedPasteEnabled = true
  }
  runtime.render(currentBuffer)

  // Exit promise
  let exitResolve: () => void
  const exitPromise = new Promise<void>((resolve) => {
    exitResolve = resolve
  })

  // ========================================================================
  // Event Loop
  // ========================================================================

  /**
   * Process a single event — run its handler (state mutation only).
   * Returns true to continue, false to exit.
   */
  function processEvent(event: Event & { parsedKey?: Key; input?: string }): boolean {
    // Handle key events with parsed key
    if (event.type === "key" && "parsedKey" in event) {
      const { input, parsedKey } = event as { input: string; parsedKey: Key; key?: string }

      // Focus system: dispatch key event to focused node first
      let focusHandled = false
      if (focusManager.activeElement) {
        const keyEvent = createKeyEvent(input, parsedKey, focusManager.activeElement)
        dispatchKeyEvent(keyEvent)

        if (keyEvent.propagationStopped || keyEvent.defaultPrevented) {
          focusHandled = true
        }

        // Default focus navigation (Tab, Shift+Tab, Enter, Escape, arrows) if not handled
        if (!focusHandled) {
          const root = getContainerRoot(container)
          focusHandled = handleFocusNavigation(parsedKey, focusManager, root)
        }
      }

      // Fall through to app's useInput handlers
      if (!focusHandled) {
        for (const handler of inputHandlers) {
          const result = handler(input, parsedKey)
          if (result === "exit") {
            return false
          }
        }
      }
    }

    // Handle mouse events with DOM-level dispatch
    if (event.type === "mouse") {
      const mouseData = event as {
        x: number
        y: number
        button: number
        action: string
        delta?: number
        shift: boolean
        meta: boolean
        ctrl: boolean
      }

      const root = getContainerRoot(container)

      processMouseEvent(
        mouseEventState,
        {
          button: mouseData.button,
          x: mouseData.x,
          y: mouseData.y,
          action: mouseData.action as "down" | "up" | "move" | "wheel",
          delta: mouseData.delta,
          shift: mouseData.shift,
          meta: mouseData.meta,
          ctrl: mouseData.ctrl,
        },
        root,
      )
    }

    // Handle paste events
    if (event.type === "paste") {
      const { content } = event as { content: string }
      for (const handler of pasteHandlers) {
        handler(content)
      }
    }

    // Handle resize events — invalidate buffers and repaint immediately.
    // Without scheduleRender(), a resize with no pending key events would
    // leave stale content on screen until the user's next keystroke.
    if (event.type === "resize") {
      prevTermBuffer = null
      runtime.invalidate()

      // Update mockStdout dimensions and notify ScrollbackView.
      // Without this, ScrollbackView never detects the resize and
      // frozen items are never re-emitted at the new width.
      const newDims = runtime.getDims()
      mockStdout.columns = newDims.cols
      mockStdout.rows = newDims.rows
      for (const handler of resizeListeners) handler()

      scheduleRender()
    }

    return true
  }

  const eventLoop = async () => {
    // Merge keyboard and runtime events
    const keyboardEvents = createKeyboardSource()
    const runtimeEvents = runtime.events()
    const allEvents = merge(keyboardEvents, runtimeEvents)

    // Event coalescing: pump events into a queue, drain all pending
    // events before rendering. This batches auto-repeat keys (e.g.,
    // holding 'j') so multiple state mutations share one render pass.
    const eventQueue: (Event & { parsedKey?: Key; input?: string })[] = []
    let eventQueueResolve: (() => void) | null = null

    // Pump events from async iterable into the shared queue
    const pumpEvents = async () => {
      try {
        for await (const event of takeUntil(allEvents, signal)) {
          eventQueue.push(event as Event & { parsedKey?: Key; input?: string })
          if (eventQueueResolve) {
            const resolve = eventQueueResolve
            eventQueueResolve = null
            resolve()
          }
          if (shouldExit) break
        }
      } finally {
        // Signal end of events
        if (eventQueueResolve) {
          const resolve = eventQueueResolve
          eventQueueResolve = null
          resolve()
        }
      }
    }

    // Start pump in background
    pumpEvents().catch(console.error)

    try {
      while (!shouldExit && !signal.aborted) {
        // Wait for at least one event
        if (eventQueue.length === 0) {
          await new Promise<void>((resolve) => {
            eventQueueResolve = resolve
            signal.addEventListener("abort", () => resolve(), { once: true })
          })
        }

        if (shouldExit || signal.aborted) break
        if (eventQueue.length === 0) continue

        // Yield to microtask queue so the pump can push any additional
        // pending events before we drain. Without this, the first event
        // after idle always processes solo (1-event batch), even when
        // auto-repeat has queued multiple events in the term provider.
        await Promise.resolve()

        // Drain events in capped batches. Each event triggers ~3 setState
        // cascades (useReadline + onChange + useEffect sync). React's
        // NESTED_UPDATE_LIMIT is 50, so 16 × 3 = 48 stays safely under.
        // Between batches, flush React state (resets the update counter)
        // but defer the expensive layout+render to after all events drain.
        const MAX_BATCH = 16
        while (eventQueue.length > 0 && !shouldExit) {
          const batch = eventQueue.splice(0, MAX_BATCH)
          for (const event of batch) {
            if (shouldExit) break
            if (!processEvent(event)) {
              exit()
              break
            }
          }

          // Flush React state to reset NESTED_UPDATE_LIMIT counter.
          // This is cheap (just React reconciliation, no layout/render).
          if (!shouldExit && eventQueue.length > 0) {
            reconciler.updateContainerSync(wrappedElement, fiberRoot, null, () => {})
            reconciler.flushSyncWork()
          }
        }

        // One render for the entire drain — layout + content + output.
        if (!shouldExit) {
          currentBuffer = doRender()
          runtime.render(currentBuffer)
        }
      }
    } finally {
      try {
        // Unmount React tree so useEffect cleanup functions fire
        // (clears intervals, timeouts, subscriptions in components)
        reconciler.updateContainerSync(null, fiberRoot, null, () => {})
        reconciler.flushSyncWork()

        // Cleanup
        runtime[Symbol.dispose]()
        if (!headless) {
          disableBracketedPaste(stdout)
          if (mouseEnabled) stdout.write(disableMouse())
          if (kittyEnabled) stdout.write(disableKittyKeyboard())
          stdout.write("\x1b[?25h\x1b[0m\n")
        }
      } finally {
        // Always restore raw mode + resolve exit, even if React unmount
        // throws. Without this inner finally, an error in useEffect
        // cleanup would leave the terminal in raw mode.
        if (stdin.isTTY && (stdin as NodeJS.ReadStream).isRaw) {
          stdin.setRawMode(false)
        }
        exitResolve()
      }
    }
  }

  // Start loop in background
  eventLoop().catch(console.error)

  // ========================================================================
  // Return Handle
  // ========================================================================

  return {
    get text() {
      return currentBuffer.text
    },
    waitUntilExit() {
      return exitPromise
    },
    unmount() {
      exit()
    },
    [Symbol.dispose]() {
      exit()
    },
    async press(key: string) {
      // Parse the key
      const [input, parsedKey] = parseKey(key)

      // Focus system: dispatch key event to focused node first
      let focusHandled = false
      if (focusManager.activeElement) {
        const keyEvent = createKeyEvent(input, parsedKey, focusManager.activeElement)
        dispatchKeyEvent(keyEvent)

        if (keyEvent.propagationStopped || keyEvent.defaultPrevented) {
          focusHandled = true
        }

        // Default focus navigation (Tab, Shift+Tab, Enter, Escape, arrows) if not handled
        if (!focusHandled) {
          const root = getContainerRoot(container)
          focusHandled = handleFocusNavigation(parsedKey, focusManager, root)
        }
      }

      // Fall through to app's useInput handlers
      if (!focusHandled) {
        for (const handler of inputHandlers) {
          const result = handler(input, parsedKey)
          if (result === "exit") {
            exit()
            break
          }
        }
      }

      // Synchronous render for testing (not batched)
      currentBuffer = doRender()
      await Promise.resolve()
    },
  }
}
