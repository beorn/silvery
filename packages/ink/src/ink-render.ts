/**
 * Ink compat render functions: render(), renderToString(), initInkCompat(), measureElement().
 * @internal
 */

import React, { useContext } from "react"
import { StdoutContext, StderrContext, TermContext } from "@silvery/ag-react/context"
import { bufferToStyledText, bufferToText, type TerminalBuffer } from "@silvery/ag-term/buffer"
import { stripAnsi } from "@silvery/ag-term/unicode"
import { createTerm } from "@silvery/ag-term/ansi"
import { createCursorStore, CursorProvider } from "@silvery/ag-react/hooks/useCursor"
import { SilveryErrorBoundary } from "@silvery/ag-react/error-boundary"
import { InkCursorStoreCtx } from "./with-ink-cursor"
import { InkFocusContext, InkFocusProvider } from "./with-ink-focus"
import { useInput as silveryUseInput } from "@silvery/ag-react/hooks/useInput"
import { renderScreenReaderOutput } from "@silvery/ag-react/accessibility"
import { createKittyManager } from "@silvery/ag-term"
import { renderSync, type Instance } from "@silvery/ag-react/render"
import { render as silveryTestRender } from "@silvery/ag-term/renderer"
import { setInkStrictValidation } from "@silvery/ag-react/reconciler/host-config"
import { renderStringSync } from "@silvery/ag-react/render-string"
import { isLayoutEngineInitialized, setLayoutEngine, ensureDefaultLayoutEngine } from "@silvery/ag-term/layout-engine"
import { createFlexilyZeroEngine } from "@silvery/ag-term/adapters/flexily-zero-adapter"
import { measureElement as baseMeasureElement } from "@silvery/ag-react/measureElement"
import { calculateLayout } from "@silvery/ag-react/reconciler/nodes"

import {
  currentChalkLevel,
  ForceStylesCtx,
  InkRenderStateCtx,
  type InkRenderState,
  stripSilveryVS16,
  resolveTerminalColumns,
  resolveTerminalRows,
} from "./ink-utils"
import { restoreColonFormatSGR, colonSGRTracker } from "./ink-sanitize"
import { InkStaticStoreCtx, type InkStaticStore } from "./ink-components"
import { InkStdinCtx, createInkStdinState } from "./ink-stdin"
import { type KittyKeyboardOptions, resolveKittyManagerOptions } from "./ink-hooks"
import { InkAnimationProvider } from "./ink-animation"

// =============================================================================
// Types
// =============================================================================

export type { RenderOptions, Instance } from "@silvery/ag-react/render"
export type { MeasureElementOutput } from "@silvery/ag-react/measureElement"

// =============================================================================
// Helpers
// =============================================================================

/**
 * Convert Ink's `maxFps` option to a render-throttle interval in milliseconds.
 *
 * Mirrors Ink 7.0's behaviour:
 * - `debug` and screen-reader modes disable throttling entirely (returns 0).
 * - `maxFps` defaults to 30 when omitted.
 * - Non-positive `maxFps` is treated as "no throttle" (matches Ink's internal
 *   fallback path so callers using `maxFps: 0` get unthrottled animations).
 * - Otherwise, throttle = `ceil(1000 / maxFps)` clamped to a minimum of 1ms.
 */
function resolveRenderThrottleMs(options: Record<string, unknown> | undefined): number {
  const debug = (options?.debug as boolean) === true
  const isScreenReaderEnabled = (options?.isScreenReaderEnabled as boolean) === true
  if (debug || isScreenReaderEnabled) return 0
  const rawMaxFps = options?.maxFps
  const maxFps = typeof rawMaxFps === "number" ? rawMaxFps : 30
  if (!(maxFps > 0)) return 0
  return Math.max(1, Math.ceil(1000 / maxFps))
}

/**
 * Ink-compatible Instance type with additional Ink-specific methods.
 */
interface InkInstance extends Instance {
  /** Promise that resolves after pending render output is flushed to stdout */
  waitUntilRenderFlush: () => Promise<void>
  /** Unmount and remove internal instance for this stdout */
  cleanup: () => void
  /** Send raw input to the renderer (equivalent to app.stdin.write) */
  stdin?: { write: (data: string) => void }
}

// =============================================================================
// render()
// =============================================================================

/**
 * Ink-compatible render function.
 *
 * When a custom stdout is provided (fake/spy stdout from tests): delegates to
 * silvery's test renderer with autoRender + onFrame for Ink-compatible output.
 *
 * When no custom stdout (real terminal): delegates to renderSync() which
 * creates a full SilveryInstance with scheduler.
 */
export function render(element: import("react").ReactNode, options?: Record<string, unknown>): InkInstance {
  // Enable Ink-compatible strict validation (text must be inside <Text>,
  // <Box> cannot be inside <Text>)
  setInkStrictValidation(true)

  // Ensure layout engine is initialized synchronously.
  // For Yoga, call initInkCompat() before render() to async-init the engine.
  if (!isLayoutEngineInitialized()) {
    setLayoutEngine(createFlexilyZeroEngine())
  }

  const stdout = options?.stdout as NodeJS.WriteStream | undefined
  const stdin = options?.stdin as NodeJS.ReadStream | undefined
  const isScreenReaderEnabled = (options?.isScreenReaderEnabled as boolean) ?? false

  // Screen reader mode: walk the React element tree to produce accessible text
  if (isScreenReaderEnabled && stdout) {
    const screenReaderOutput = renderScreenReaderOutput(element)
    stdout.write(screenReaderOutput)
    let unmounted = false
    const instance: InkInstance = {
      rerender: (newElement: import("react").ReactNode) => {
        if (unmounted) return
        const output = renderScreenReaderOutput(newElement)
        stdout.write(output)
      },
      unmount: () => {
        unmounted = true
      },
      [Symbol.dispose]() {
        instance.unmount()
      },
      waitUntilExit: () => Promise.resolve(),
      waitUntilRenderFlush: () => Promise.resolve(),
      cleanup: () => {
        instance.unmount()
      },
      clear: () => {},
      flush: () => {},
      pause: () => {},
      resume: () => {},
    }
    return instance
  }

  // When custom stdout is provided (test mode): delegate to silvery's test
  // renderer with autoRender for async state changes and onFrame for stdout writes.
  if (stdout) {
    return renderTestMode(element, options!, stdout, stdin)
  }

  // Interactive mode (real terminal): use renderSync with Ink-compatible defaults
  return renderInteractiveMode(element, options, stdout, stdin)
}

// =============================================================================
// Test mode render (custom stdout)
// =============================================================================

function renderTestMode(
  element: import("react").ReactNode,
  options: Record<string, unknown>,
  stdout: NodeJS.WriteStream,
  stdin: NodeJS.ReadStream | undefined,
): InkInstance {
  // Always render with ANSI codes (plain=false) and ForceStylesCtx=true so that
  // buffer cells are styled even when chalk has no colors. Styled cells enable
  // getContentEdge() to detect content trailing spaces (e.g., chalk.red(' ERROR '))
  // and prevent them from being trimmed as buffer padding.
  // When chalk has no colors, processBuffer strips prop-based ANSI from the output
  // unless the tree contains user-embedded ANSI (tracked via InkRenderState).
  const plain = false
  const chalkHasColors = currentChalkLevel() > 0
  // Per-instance render state: InkText sets hasEmbeddedAnsi when children contain ANSI.
  // processBuffer reads it to decide whether to strip ANSI in plain mode.
  const renderState: InkRenderState = { hasEmbeddedAnsi: false }

  // Alternate screen: enter on mount, exit on unmount.
  // Ink requires all three: alternateScreen=true, interactive mode, and stdout.isTTY.
  // interactive defaults to stdout.isTTY when not explicitly set.
  const isTTY = (stdout as any).isTTY === true
  const resolvedInteractive = options?.interactive !== undefined ? Boolean(options.interactive) : isTTY
  const useAltScreen = (options?.alternateScreen as boolean) === true && resolvedInteractive && isTTY
  let altScreenExited = false

  if (useAltScreen) {
    stdout.write("\x1b[?1049h")
  }

  const stderr = options?.stderr as NodeJS.WriteStream | undefined
  const debug = (options?.debug as boolean) ?? false
  const renderThrottleMs = resolveRenderThrottleMs(options)

  // Per-instance stdin state for raw mode tracking and paste event bridging
  const stdinState = createInkStdinState((stdin ?? process.stdin) as NodeJS.ReadStream, stdout)

  // Kitty keyboard protocol support (test renderer path)
  const kittyManager = createKittyManager(
    (stdin ?? process.stdin) as NodeJS.ReadStream,
    stdout,
    resolveKittyManagerOptions(options?.kittyKeyboard as KittyKeyboardOptions | undefined),
  )

  // Per-instance cursor store for Ink's useCursor hook
  const cursorStore = createCursorStore()
  let cursorWasShown = false

  // Per-instance static output store for Ink's Static component
  const staticStore: InkStaticStore = { renderedCount: 0, fullStaticOutput: "" }

  // Track latest rendered output for debug mode replay (useStdout/useStderr write).
  // Set in writeFrame (onFrame callback) after each render. In debug mode,
  // hook writes that fire before the first frame are deferred and flushed
  // when writeFrame first runs.
  let lastOutput = ""
  // Deferred debug writes: queued when effects fire before the first writeFrame
  let pendingDebugWrites: Array<{ target: "stdout" | "stderr"; data: string }> = []

  /**
   * Compute processed output from a terminal buffer.
   * Converts buffer to text, strips VS16, applies chalk compat.
   * Uses contentHeight to trim buffer padding while preserving
   * layout-meaningful empty rows (from margin, padding, explicit height).
   *
   * @param buffer - Terminal buffer to process
   * @param contentHeight - Root layout height (from renderer callback)
   */
  function processBuffer(buffer: TerminalBuffer, contentHeight?: number): string {
    // ForceStylesCtx is always true, so buffer cells are styled even when chalk
    // has no colors. This enables correct content edge detection for trailing
    // whitespace preservation (e.g., `<Text color="red">{' ERROR '}</Text>`).
    //
    // When chalk has no colors AND no embedded ANSI: use bufferToText for plain
    // output with getContentEdge-based trimming (detects styled cells in buffer).
    // When chalk has no colors AND has embedded ANSI: use bufferToStyledText to
    // preserve user-provided ANSI sequences (SGR, OSC 8) in the output.
    // When chalk has colors: use bufferToStyledText for full ANSI output.
    let output: string
    if (!chalkHasColors && !renderState.hasEmbeddedAnsi) {
      // Plain mode: styled buffer → plain text with content-edge-aware trimming.
      // bufferToText uses getContentEdge() which detects styled cells (from
      // ForceStylesCtx=true props) and preserves their trailing spaces.
      output = bufferToText(buffer, {
        trimTrailingWhitespace: true,
        trimEmptyLines: false,
      })
      output = stripSilveryVS16(output)
    } else {
      // Styled mode: use bufferToStyledText for ANSI-preserving output.
      // Don't trim empty lines here — we trim to content height below.
      output = bufferToStyledText(buffer, {
        trimTrailingWhitespace: true,
        trimEmptyLines: false,
      })
      output = stripSilveryVS16(output)
      // Restore colon-format SGR sequences that were registered during sanitization.
      // silvery's pipeline converts colon-format (38:2::R:G:B) to semicolon-format
      // (38;2;R;G;B) during rendering. This converts them back to match Ink's behavior.
      output = restoreColonFormatSGR(output)
    }
    if (plain) output = stripAnsi(output)

    // Trim buffer padding: keep only lines up to the root's layout content height.
    // The buffer is sized to the terminal (e.g., 24 rows), but layout content may
    // only occupy a subset. Layout-meaningful empty rows (from padding, margin,
    // explicit height) are preserved; buffer-padding rows beyond are trimmed.
    if (contentHeight != null) {
      if (contentHeight > 0) {
        const lines = output.split("\n")
        if (lines.length > contentHeight) {
          output = lines.slice(0, contentHeight).join("\n")
        }
      } else {
        // Content height is 0 (empty tree): strip all content
        output = output.replace(/\n+$/, "")
      }
    } else {
      // Fallback when content height not available: strip trailing empty lines.
      output = output.replace(/\n+$/, "")
    }

    return output
  }

  /**
   * Flush deferred debug writes that were queued before lastOutput was available.
   *
   * In Ink debug mode, useStdout().write() and useStderr().write() are called from
   * effects which fire after the first render commits. Since we can't intercept the
   * order, we queue these writes and flush them when the first frame is ready.
   *
   * For each pending write:
   *   - stdout: emits a single write of `data + frame` (Ink's debug-mode writeToStdout
   *     pattern: clear frame, write data, replay frame).
   *   - stderr: emits `data` to stderr and `frame` to stdout as a separate replay
   *     write (Ink's debug-mode writeToStderr pattern).
   *
   * Returns true if stdout writes were emitted so the caller can decide whether to
   * still emit a baseline frame write. Stdout-target flushes already include the
   * frame, so we suppress the baseline. Stderr-target flushes still need the
   * baseline frame as a separate stdout write to match Ink's "render frame +
   * replay-after-write" sequence.
   */
  function flushPendingDebugWrites(): { suppressFrame: boolean } {
    if (pendingDebugWrites.length === 0) return { suppressFrame: false }
    const pending = pendingDebugWrites
    pendingDebugWrites = []
    let suppressFrame = false
    for (const { target, data } of pending) {
      // Append \n after lastOutput to match PTY behavior (frame always ends with newline).
      // processBuffer strips trailing newlines, but the real PTY/Ink output has them.
      const frameWithNewline = lastOutput.endsWith("\n") ? lastOutput : lastOutput + "\n"
      if (target === "stdout") {
        // Ink writeToStdout(debug) writes `data + lastOutput` as a single chunk.
        // The "render frame" emission is implicit in this concatenation, so we
        // don't need to emit a separate frame write — suppress the baseline.
        stdout.write(data + frameWithNewline)
        suppressFrame = true
      } else {
        // Ink writeToStderr(debug) writes data to stderr, then writes lastOutput
        // to stdout as a separate replay. We do not suppress the baseline frame
        // — the test expects a render frame AND a replay frame on stdout.
        const stderrTarget = stderr ?? process.stderr
        stderrTarget.write(data)
        stdout.write(frameWithNewline)
      }
    }
    return { suppressFrame }
  }

  // Bridge component: uses silvery's useInput to forward Tab/Shift+Tab/Escape
  // to Ink's InkFocusContext. This sits inside both RuntimeContext (for useInput)
  // and InkFocusProvider (for focus context access).
  function InkFocusBridge({ children }: { children: React.ReactNode }) {
    const focusCtx = useContext(InkFocusContext)
    silveryUseInput((_input, key) => {
      if (!focusCtx.isFocusEnabled) return
      if (key.tab && !key.shift) focusCtx.focusNext()
      else if (key.tab && key.shift) focusCtx.focusPrevious()
      else if (key.escape) focusCtx.blur()
    })
    return React.createElement(React.Fragment, null, children)
  }

  /**
   * Ink-compatible writeToStdout: writes data to stdout.
   * Matches Ink's behavior: in interactive mode, clears the current frame,
   * writes the data, then re-renders the frame below it. This ensures that
   * useStdout().write() output appears above the rendered component output.
   * If no frame is available yet (initial mount effects), queues for deferred write.
   */
  function writeToStdout(data: string): void {
    if (lastOutput) {
      // Ink clears the frame, writes data, then re-renders frame below.
      // We emulate this by writing data + frame (the initial frame in writes[]
      // acts as the "cleared" first line that slice(1) skips).
      stdout.write(data + lastOutput)
    } else {
      pendingDebugWrites.push({ target: "stdout", data })
    }
  }

  /**
   * Ink-compatible writeToStderr: writes data to stderr.
   * In debug mode, writes data to stderr and replays the latest frame to stdout.
   * In non-debug mode, writes data to stderr (or stdout as fallback).
   * If no frame is available yet (initial mount effects), queues for deferred write.
   */
  function writeToStderr(data: string): void {
    const target = stderr ?? process.stderr
    if (debug) {
      if (lastOutput) {
        target.write(data)
        stdout.write(lastOutput)
      } else {
        pendingDebugWrites.push({ target: "stderr", data })
      }
    } else {
      target.write(data)
    }
  }

  // Ink-specific root wrapper: error boundary + focus system + cursor store + stdio contexts
  function wrapWithInkProviders(el: import("react").ReactElement): import("react").ReactElement {
    // Override StdoutContext with Ink-compatible write that supports debug mode
    const stdoutCtxValue = { stdout, write: writeToStdout }
    // Provide stderr context for useStderr hook (via silvery core StderrContext)
    const stderrCtxValue = { stderr: stderr ?? process.stderr, write: writeToStderr }

    return React.createElement(
      ForceStylesCtx.Provider,
      { value: true },
      React.createElement(
        InkRenderStateCtx.Provider,
        { value: renderState },
        React.createElement(
          SilveryErrorBoundary,
          null,
          React.createElement(
            InkStaticStoreCtx.Provider,
            { value: staticStore },
            React.createElement(
              InkStdinCtx.Provider,
              { value: stdinState },
              React.createElement(
                CursorProvider,
                { store: cursorStore },
                React.createElement(
                  InkCursorStoreCtx.Provider,
                  { value: cursorStore },
                  React.createElement(
                    StdoutContext.Provider,
                    { value: stdoutCtxValue },
                    React.createElement(
                      StderrContext.Provider,
                      { value: stderrCtxValue },
                      React.createElement(
                        InkAnimationProvider,
                        { renderThrottleMs },
                        React.createElement(InkFocusProvider, null, React.createElement(InkFocusBridge, null, el)),
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    )
  }

  /**
   * onBufferReady: fires inside act() before effects on subsequent renders.
   * Sets lastOutput so debug-mode writeToStdout/writeToStderr can replay the frame.
   * Note: On the initial render, effects fire before onBufferReady (different code path
   * in renderer.ts), so deferred writes handle that case.
   */
  function handleBufferReady(_frame: string, buffer: TerminalBuffer, contentHeight?: number): void {
    let result = processBuffer(buffer, contentHeight)
    if (staticStore.fullStaticOutput) {
      result = staticStore.fullStaticOutput + result
    }
    lastOutput = result
  }

  /**
   * Post-process a rendered buffer and write to stdout.
   * Converts buffer to text, applies VS16 stripping, chalk compat, line trimming, and cursor emission.
   * Also flushes any deferred debug writes that were queued before the first frame.
   */
  function writeFrame(_frame: string, buffer: TerminalBuffer, contentHeight?: number): void {
    // Suppress output after alternate screen exit to prevent replay on primary screen
    if (altScreenExited) return

    let result = processBuffer(buffer, contentHeight)

    // Prepend accumulated static output (Ink writes fullStaticOutput + dynamicOutput in debug mode)
    if (staticStore.fullStaticOutput) {
      result = staticStore.fullStaticOutput + result
    }

    // Update lastOutput and flush deferred debug writes.
    // For stdout-target deferred writes, the flush emits `data + frame` as a
    // single chunk so we suppress the baseline frame to avoid duplicating it.
    // For stderr-target deferred writes, the flush emits data to stderr and a
    // replay frame to stdout — but we still emit the baseline frame so stdout
    // gets both a render-frame write and the replay write (matching Ink's
    // debug-mode emission pattern).
    lastOutput = result
    const { suppressFrame } = flushPendingDebugWrites()
    if (suppressFrame) return

    // Cursor: only emit sequences when useCursor() is actively used.
    // Ink hides the cursor once at startup via cli-cursor, not per-frame.
    // We track transitions: emit show when cursor becomes visible, hide when it was visible and now isn't.
    // When cursor was previously shown, hide it before writing the frame to prevent visual jumping.
    const cursorState = cursorStore.accessors.getCursorState()
    const hidePrefix = cursorWasShown ? "\x1b[?25l" : ""
    if (cursorState?.visible) {
      let cursorEsc = cursorState.x === 0 ? "\x1b[G" : `\x1b[${cursorState.x + 1}G`
      if (cursorState.y > 0) {
        const rowsUp = result.split("\n").length - 1 - cursorState.y
        if (rowsUp > 0) cursorEsc += `\x1b[${rowsUp}A`
      }
      cursorEsc += "\x1b[?25h"
      cursorWasShown = true
      stdout.write(hidePrefix + result + cursorEsc)
    } else if (cursorWasShown) {
      // Cursor was visible but now isn't — emit hide sequence
      cursorWasShown = false
      stdout.write(hidePrefix + result)
    } else {
      stdout.write(result)
    }
  }

  // Delegate to silvery's test renderer with wrapRoot for Ink contexts
  // and stdin bridging handled natively by the renderer
  // Resolve terminal dimensions with Ink-compatible fallback chain:
  // stdout.columns/rows → process.env.COLUMNS/LINES → process.stdout → process.stderr → defaults
  const resolvedCols = (stdout as any).columns || resolveTerminalColumns()
  const resolvedRows = (stdout as any).rows != null ? (stdout as any).rows : resolveTerminalRows()
  const app = silveryTestRender(element as import("react").ReactElement, {
    cols: resolvedCols,
    rows: resolvedRows,
    autoRender: true,
    onFrame: writeFrame,
    onBufferReady: handleBufferReady,
    wrapRoot: wrapWithInkProviders,
    stdin: stdin as NodeJS.ReadStream | undefined,
  })

  // Listen for resize events on stdout
  const onResize = () => {
    const newCols = (stdout as any).columns || resolveTerminalColumns()
    const newRows = (stdout as any).rows != null ? (stdout as any).rows : resolveTerminalRows()
    app.resize(newCols, newRows)
  }
  stdout.on("resize", onResize)

  /** Exit the alternate screen and suppress further output */
  function exitAlternateScreen() {
    if (useAltScreen && !altScreenExited) {
      altScreenExited = true
      stdout.write("\x1b[?1049l")
      // Restore cursor visibility after leaving alternate screen
      stdout.write("\x1b[?25h")
    }
  }

  let unmounted = false
  const instance: InkInstance = {
    rerender: (newElement: import("react").ReactNode) => {
      if (unmounted) return
      app.rerender(newElement as import("react").ReactElement)
    },
    unmount: () => {
      if (unmounted) return
      unmounted = true
      kittyManager.cleanup()
      exitAlternateScreen()
      stdout.off("resize", onResize)
      app.unmount()
    },
    [Symbol.dispose]() {
      instance.unmount()
    },
    waitUntilExit: () => {
      // In Ink, exit() triggers unmount + resolves/rejects waitUntilExit.
      // Silvery's test renderer doesn't auto-unmount on exit(), so we do it here.
      if (app.exitCalled()) {
        instance.unmount()
        const err = app.exitError()
        return err ? Promise.reject(err) : Promise.resolve()
      }
      return app.waitUntilExit()
    },
    waitUntilRenderFlush: () => Promise.resolve(),
    cleanup: () => {
      instance.unmount()
    },
    clear: () => {},
    flush: () => {},
    pause: () => {},
    resume: () => {},
    stdin: { write: (data: string) => app.stdin.write(data) },
  }
  return instance
}

// =============================================================================
// Interactive mode render (real terminal)
// =============================================================================

function renderInteractiveMode(
  element: import("react").ReactNode,
  options: Record<string, unknown> | undefined,
  stdout: NodeJS.WriteStream | undefined,
  stdin: NodeJS.ReadStream | undefined,
): InkInstance {
  const inkOptions: Record<string, unknown> = {
    ...options,
    // Ink defaults: no alternate screen, inline mode, no console patching
    alternateScreen: (options?.alternateScreen as boolean) ?? false,
    mode: "inline" as const,
    patchConsole: (options?.patchConsole as boolean) ?? false,
    exitOnCtrlC: (options?.exitOnCtrlC as boolean) ?? true,
    debug: (options?.debug as boolean) ?? false,
  }

  // Always provide stdout and stdin for the interactive path
  // so renderSync creates a full interactive instance (not static mode)
  const resolvedStdout = (stdout ?? process.stdout) as NodeJS.WriteStream
  const resolvedStdin = (stdin ?? process.stdin) as NodeJS.ReadStream
  const termDef: Record<string, unknown> = {
    stdout: resolvedStdout,
    stdin: resolvedStdin,
  }

  // Enable raw mode on stdin BEFORE rendering so it's active before any React
  // effects fire. This prevents a race condition where the PTY's ICRNL flag
  // converts \r to \n: Ink fixtures write __READY__ from a child useEffect
  // (which fires before the parent SilveryApp's input subscription effect that
  // enables raw mode). Without early raw mode, \r written by the test after
  // seeing __READY__ may arrive before raw mode disables ICRNL.
  const earlyRawMode = resolvedStdin.isTTY === true
  if (earlyRawMode) {
    resolvedStdin.setRawMode(true)
  }

  // Per-instance stdin state for raw mode tracking and paste event bridging
  const interactiveStdinState = createInkStdinState(resolvedStdin, resolvedStdout)

  // Kitty keyboard protocol support
  const kittyManager = createKittyManager(
    resolvedStdin,
    resolvedStdout,
    resolveKittyManagerOptions(options?.kittyKeyboard as KittyKeyboardOptions | undefined),
  )

  // Wrap element with InkStdinCtx.Provider so usePaste can access setBracketedPasteMode
  // and InkAnimationProvider so useAnimation honours the configured maxFps throttle.
  const renderThrottleMs = resolveRenderThrottleMs(options)
  const wrappedElement = React.createElement(
    InkAnimationProvider,
    { renderThrottleMs },
    React.createElement(InkStdinCtx.Provider, { value: interactiveStdinState }, element),
  )

  const silveryInstance = renderSync(wrappedElement as any, termDef as any, inkOptions as any)

  // Wrap with Ink-specific methods
  const instance: InkInstance = {
    ...silveryInstance,
    waitUntilRenderFlush: () => Promise.resolve(),
    cleanup: () => {
      silveryInstance.unmount()
    },
  }

  // Override unmount to clean up kitty protocol
  const origUnmount = instance.unmount
  instance.unmount = () => {
    kittyManager.cleanup()
    origUnmount()
  }

  return instance
}

// =============================================================================
// initInkCompat
// =============================================================================

/**
 * Pre-initialize the compat layer with a specific layout engine.
 * Call before render() to use Yoga (which requires async WASM loading):
 *
 *   await initInkCompat("yoga");
 *   render(<App />, { stdout });
 *
 * Without this, render() defaults to Flexily (synchronous).
 * Also respects SILVERY_ENGINE env var.
 */
export async function initInkCompat(engine?: "flexily" | "yoga"): Promise<void> {
  await ensureDefaultLayoutEngine(engine)
}

// =============================================================================
// renderToString
// =============================================================================

/**
 * Ink-compatible renderToString.
 * Maps ink's `renderToString(element, { columns })` to silvery's `renderStringSync`.
 * Automatically initializes the layout engine if needed (using sync flexily).
 *
 * When `isScreenReaderEnabled` is true, walks the React element tree and produces
 * accessible text with ARIA roles, labels, and states instead of visual rendering.
 */
export function renderToString(
  node: import("react").ReactNode,
  options?: { columns?: number; isScreenReaderEnabled?: boolean },
): string {
  if (options?.isScreenReaderEnabled) {
    return renderScreenReaderOutput(node)
  }

  // Enable Ink-compatible strict validation so raw text outside <Text> throws
  setInkStrictValidation(true)

  if (!isLayoutEngineInitialized()) {
    setLayoutEngine(createFlexilyZeroEngine())
  }
  // Sync color detection with chalk: tests may set chalk.level = 3 programmatically
  // even when FORCE_COLOR=0, so we must respect chalk's runtime level
  const chalkHasColors = currentChalkLevel() > 0
  const colorLevel = chalkHasColors ? ("truecolor" as const) : null
  const term = createTerm({ color: colorLevel })
  // Always render with color enabled (plain=false) so that embedded ANSI sequences
  // in text children are preserved in the buffer output. Ink preserves embedded ANSI
  // even when chalk has no color support — only chalk-applied style props are skipped
  // (which the Text component already handles by stripping style props when !chalkHasColors).
  const plain = false
  // Create a static store for the Static component to populate during renderStringSync
  const staticStore: InkStaticStore = { renderedCount: 0, fullStaticOutput: "" }
  const wrapped = React.createElement(
    InkStaticStoreCtx.Provider,
    { value: staticStore },
    React.createElement(TermContext.Provider, { value: term }, node),
  )
  const bufferHeight = 24
  let layoutContentHeight = 0
  let output = renderStringSync(wrapped as import("react").ReactElement, {
    width: options?.columns ?? 80,
    height: bufferHeight,
    plain,
    trimTrailingWhitespace: true,
    trimEmptyLines: false,
    onContentHeight: (h: number) => {
      layoutContentHeight = h
    },
  })
  // Strip VS16 variation selectors that silvery adds for text-presentation emoji
  output = stripSilveryVS16(output)
  // Trim buffer padding rows using content height from layout
  if (layoutContentHeight > 0 && layoutContentHeight < bufferHeight) {
    const lines = output.split("\n")
    output = lines.slice(0, layoutContentHeight).join("\n")
  } else {
    // Fall back: strip trailing empty lines (content height unknown or fills buffer)
    const lines = output.split("\n")
    while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop()
    output = lines.join("\n")
  }
  // If result is only whitespace/newlines/ANSI resets (empty fragment), return empty string
  if (stripAnsi(output).trim() === "") {
    // Even if the visual buffer is empty, there might be static output
    if (staticStore.fullStaticOutput) {
      // Static-only output: prepend static output. Ink writes fullStaticOutput + dynamicOutput.
      // Dynamic is empty string when tree is empty.
      return staticStore.fullStaticOutput.replace(/\n$/, "")
    }
    return ""
  }
  // Prepend static output if present (Ink writes fullStaticOutput + dynamicOutput)
  // Restore colon-format SGR sequences (e.g., 38:2::R:G:B) that silvery converted
  // to semicolon-format during rendering
  const dynamicOutput = restoreColonFormatSGR(output)
  // Clear for renderToString (synchronous, single-use)
  colonSGRTracker.clear()
  if (staticStore.fullStaticOutput) {
    return staticStore.fullStaticOutput + dynamicOutput
  }
  return dynamicOutput
}

// =============================================================================
// measureElement
// =============================================================================

/**
 * Check if a node or any of its ancestors has dirty layout.
 * When the reconciler adds/removes children, it marks the parent as layoutDirty
 * and propagates subtreeDirty up to the root.
 */
function needsLayoutRecalculation(node: any): boolean {
  // Walk up from node to root checking dirty flags
  let current = node
  while (current) {
    if (current.layoutDirty || current.subtreeDirty || current.childrenDirty) return true
    current = current.parent
  }
  return false
}

/**
 * Ink-compatible measureElement that handles BoxHandle refs and computes
 * layout on demand when boxRect is stale or hasn't been set yet.
 *
 * This bridges the timing gap between Ink (Yoga runs during commit, so
 * effects see layout) and silvery (layout runs in a separate pipeline pass).
 */
export function measureElement(nodeOrHandle: any): import("@silvery/ag-react/measureElement").MeasureElementOutput {
  // Resolve BoxHandle → AgNode
  const node = typeof nodeOrHandle?.getNode === "function" ? nodeOrHandle.getNode() : nodeOrHandle
  if (!node) return { width: 0, height: 0 }

  // If boxRect exists AND layout is not stale, use cached values
  if (node.boxRect && !needsLayoutRecalculation(node)) {
    return baseMeasureElement(node)
  }

  // boxRect is null or layout is dirty — walk up to root and
  // calculate layout on demand so effects can read correct dimensions.
  let root = node
  while (root.parent) {
    root = root.parent
  }

  if (root.layoutNode) {
    // Use a sensible width — check process.stdout or default to 100
    const termWidth = process.stdout?.columns || 100
    const termHeight = (process.stdout as any)?.rows || 24
    try {
      calculateLayout(root, termWidth, termHeight)
    } catch {
      // Layout may fail if engine not initialized — fall back gracefully
    }
  }

  return baseMeasureElement(node)
}
