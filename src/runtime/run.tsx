/**
 * run() - Layer 2 entry point for inkx-loop
 *
 * Provides React hooks integration on top of createRuntime.
 * Use this when you want React component state (useState, useEffect)
 * with simple keyboard input handling.
 *
 * @example
 * ```tsx
 * import { run, useInput } from 'inkx/runtime'
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
import React, { createContext, useContext, useEffect, type ReactElement } from "react"

import { createTerm } from "chalkx"
import { AppContext, FocusManagerContext, StdoutContext, TermContext } from "../context.js"
import { createFocusManager, type FocusManager } from "../focus-manager.js"
import { createFocusEvent, createKeyEvent, dispatchFocusEvent, dispatchKeyEvent } from "../focus-events.js"
import { findByTestID } from "../focus-queries.js"
import { executeRender } from "../pipeline/index.js"
import { createContainer, getContainerRoot, reconciler } from "../reconciler.js"
import { merge, takeUntil } from "../streams/index.js"
import { createBuffer } from "./create-buffer.js"
import { createRuntime } from "./create-runtime.js"
import { type InputHandler, type Key, parseKey } from "./keys.js"
import { splitRawInput } from "../keys.js"
import type { InkxNode, Rect } from "../types.js"
import { isMouseSequence, parseMouseSequence } from "../mouse.js"
import { createMouseEventProcessor, processMouseEvent } from "../mouse-events.js"
import { enableKittyKeyboard, disableKittyKeyboard, KittyFlags, enableMouse, disableMouse } from "../output.js"
import { detectKittyFromStdio } from "../kitty-detect.js"
import { ensureLayoutEngine } from "./layout.js"
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

interface RuntimeContextValue {
  runtime: Runtime
  exit: () => void
}

const RuntimeContext = createContext<RuntimeContextValue | null>(null)

interface InputContextValue {
  subscribe: (handler: InputHandler) => () => void
}

const InputContext = createContext<InputContextValue | null>(null)

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
  const ctx = useContext(RuntimeContext)
  if (!ctx) throw new Error("useExit must be used within run()")
  return ctx.exit
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
  root: InkxNode,
  layoutFn?: (node: InkxNode) => Rect | null,
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
 * Run a React component with the inkx-loop runtime.
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
  let mouseEnabled = false

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

  // Mouse event processor for DOM-level dispatch (with click-to-focus)
  const mouseEventState = createMouseEventProcessor({ focusManager })

  // Input handlers
  const inputHandlers = new Set<InputHandler>()
  let shouldExit = false

  // ========================================================================
  // Render Batching
  // ========================================================================

  let renderScheduled = false
  let currentBuffer: Buffer

  // Helper to render and get text
  function doRender(): Buffer {
    // Commit React changes to InkxNode tree
    reconciler.updateContainerSync(wrappedElement, fiberRoot, null, () => {})
    reconciler.flushSyncWork()

    // Get the InkxNode tree root
    const rootNode = getContainerRoot(container)

    // Execute render pipeline
    const dims = runtime.getDims()
    const { buffer: termBuffer } = executeRender(rootNode, dims.cols, dims.rows, null)

    return createBuffer(termBuffer, rootNode)
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
            stdin.setRawMode(false)
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
  const runtime = createRuntime({ target, signal })

  // Exit function
  const exit = () => {
    shouldExit = true
    controller.abort()
  }

  // Input context value
  const inputContextValue: InputContextValue = {
    subscribe(handler: InputHandler) {
      inputHandlers.add(handler)
      return () => inputHandlers.delete(handler)
    },
  }

  // Runtime context value
  const runtimeContextValue: RuntimeContextValue = {
    runtime,
    exit,
  }

  // Create InkxNode container (persistent for React state)
  const container = createContainer(() => {
    // Schedule render when React state changes
    scheduleRender()
  })

  // Create React fiber root
  const fiberRoot = reconciler.createContainer(
    container,
    1, // ConcurrentRoot
    null, // hydrationCallbacks
    false, // isStrictMode
    null, // concurrentUpdatesByDefaultOverride
    "", // identifierPrefix
    () => {}, // onUncaughtError
    () => {}, // onCaughtError
    () => {}, // onRecoverableError
    null, // onDefaultTransitionIndicator
  )

  // Create mock stdout for contexts
  const mockStdout = {
    columns: cols,
    rows: rows,
    write: () => true,
    isTTY: false,
    on: () => mockStdout,
    off: () => mockStdout,
    once: () => mockStdout,
    removeListener: () => mockStdout,
    addListener: () => mockStdout,
  } as unknown as NodeJS.WriteStream

  // Create mock term for useTerm()
  const mockTerm = createTerm({ level: 3, columns: cols })

  // Wrap element with all required providers
  const wrappedElement = (
    <TermContext.Provider value={mockTerm}>
      <AppContext.Provider value={{ exit }}>
        <StdoutContext.Provider value={{ stdout: mockStdout, write: () => {} }}>
          <FocusManagerContext.Provider value={focusManager}>
            <RuntimeContext.Provider value={runtimeContextValue}>
              <InputContext.Provider value={inputContextValue}>{element}</InputContext.Provider>
            </RuntimeContext.Provider>
          </FocusManagerContext.Provider>
        </StdoutContext.Provider>
      </AppContext.Provider>
    </TermContext.Provider>
  )

  // Initial render (synchronous, not batched)
  currentBuffer = doRender()

  // Clear screen and hide cursor
  if (!headless) {
    stdout.write("\x1b[2J\x1b[H\x1b[?25l")

    // Kitty keyboard protocol
    if (kittyOption != null && kittyOption !== false) {
      if (kittyOption === true) {
        const result = await detectKittyFromStdio(stdout, stdin as NodeJS.ReadStream)
        if (result.supported) {
          stdout.write(enableKittyKeyboard(KittyFlags.DISAMBIGUATE))
          kittyEnabled = true
        }
      } else {
        stdout.write(enableKittyKeyboard(kittyOption))
        kittyEnabled = true
      }
    }

    // Mouse tracking
    if (mouseOption) {
      stdout.write(enableMouse())
      mouseEnabled = true
    }
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

  const eventLoop = async () => {
    // Merge keyboard and runtime events
    const keyboardEvents = createKeyboardSource()
    const runtimeEvents = runtime.events()
    const allEvents = merge(keyboardEvents, runtimeEvents)

    try {
      for await (const event of takeUntil(allEvents, signal)) {
        if (shouldExit) break

        // Handle key events with parsed key
        if (event.type === "key" && "parsedKey" in event) {
          const { input, parsedKey } = event as {
            input: string
            parsedKey: Key
          }

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

        // Schedule batched render after any event
        scheduleRender()

        if (shouldExit) break
      }
    } finally {
      // Cleanup
      runtime[Symbol.dispose]()
      if (!headless) {
        if (mouseEnabled) stdout.write(disableMouse())
        if (kittyEnabled) stdout.write(disableKittyKeyboard())
        stdout.write("\x1b[?25h\x1b[0m\n")
      }
      exitResolve()
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
