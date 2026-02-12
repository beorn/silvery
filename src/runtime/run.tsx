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
import { AppContext, StdoutContext, TermContext } from "../context.js"
import { executeRender } from "../pipeline/index.js"
import { createContainer, getContainerRoot, reconciler } from "../reconciler.js"
import { merge, takeUntil } from "../streams/index.js"
import { createBuffer } from "./create-buffer.js"
import { createRuntime } from "./create-runtime.js"
import { type InputHandler, type Key, parseKey } from "./keys.js"
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
    const { buffer: termBuffer } = executeRender(rootNode, dims.cols, dims.rows, null, {
      skipLayoutNotifications: true,
    })

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

            // Parse the key using full key parsing
            const [input, key] = parseKey(rawKey)

            yield {
              type: "key" as const,
              key: rawKey,
              input,
              parsedKey: key,
              ctrl: key.ctrl,
              meta: key.meta,
              shift: key.shift,
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
          <RuntimeContext.Provider value={runtimeContextValue}>
            <InputContext.Provider value={inputContextValue}>{element}</InputContext.Provider>
          </RuntimeContext.Provider>
        </StdoutContext.Provider>
      </AppContext.Provider>
    </TermContext.Provider>
  )

  // Initial render (synchronous, not batched)
  currentBuffer = doRender()

  // Clear screen and hide cursor
  if (!headless) stdout.write("\x1b[2J\x1b[H\x1b[?25l")
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

          for (const handler of inputHandlers) {
            const result = handler(input, parsedKey)
            if (result === "exit") {
              exit()
              break
            }
          }
        }

        // Schedule batched render after any event
        scheduleRender()

        if (shouldExit) break
      }
    } finally {
      // Cleanup
      runtime[Symbol.dispose]()
      if (!headless) stdout.write("\x1b[?25h\x1b[0m\n")
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

      // Dispatch to handlers
      for (const handler of inputHandlers) {
        const result = handler(input, parsedKey)
        if (result === "exit") {
          exit()
          break
        }
      }

      // Synchronous render for testing (not batched)
      currentBuffer = doRender()
      await Promise.resolve()
    },
  }
}
