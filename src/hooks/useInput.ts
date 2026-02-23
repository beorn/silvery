/**
 * Inkx useInput Hook
 *
 * Handles keyboard input parsing and provides a clean API for responding to key presses.
 * Compatible with Ink's useInput API.
 */

import { createLogger } from "@beorn/logger"
import { useContext, useEffect, useRef } from "react"
import { EventsContext, InputContext, StdinContext } from "../context.js"
import { type Key, parseKey } from "../keys.js"

const log = createLogger("inkx:useInput")

// ============================================================================
// Types
// ============================================================================

// Re-export Key for consumers that import from useInput
export type { Key } from "../keys.js"

/**
 * Input handler callback type.
 * Unlike the runtime InputHandler, this does not support "exit" returns.
 */
export type InputHandler = (input: string, key: Key) => void

/**
 * Options for useInput hook.
 */
export interface UseInputOptions {
  /**
   * Enable or disable input handling.
   * Useful when there are multiple useInput hooks and you want to disable some.
   * @default true
   */
  isActive?: boolean

  /**
   * Callback for bracketed paste events.
   * When the terminal has bracketed paste mode enabled,
   * pasted text is delivered as a single string instead of
   * individual keystrokes.
   */
  onPaste?: (text: string) => void
}

// ============================================================================
// Hook Implementation
// ============================================================================

/**
 * Hook for handling user input.
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   useInput((input, key) => {
 *     if (input === 'q') {
 *       // Quit
 *     }
 *     if (key.upArrow) {
 *       // Move up
 *     }
 *   });
 *
 *   return <Text>Press q to quit</Text>;
 * }
 * ```
 */
export function useInput(inputHandler: InputHandler, options: UseInputOptions = {}): void {
  const events = useContext(EventsContext)
  const stdinContext = useContext(StdinContext)
  const inputContext = useContext(InputContext)

  const { isActive = true, onPaste } = options

  // Stable ref for the handler — avoids tearing down/recreating the event
  // subscription on every render. Without this, rapid keystrokes between
  // effect cleanup and setup are lost.
  const handlerRef = useRef(inputHandler)
  handlerRef.current = inputHandler

  const onPasteRef = useRef(onPaste)
  onPasteRef.current = onPaste

  // Static mode check: when events is null, we're in static rendering mode
  // In this mode, useInput becomes a no-op (no raw mode, no event subscription)
  const isStaticMode = events === null

  log.debug?.(
    `useInput called: isActive=${isActive}, isStaticMode=${isStaticMode}, events=${!!events}, stdinContext=${!!stdinContext}, isRawModeSupported=${stdinContext?.isRawModeSupported}`,
  )

  // Set raw mode when active (only if stdin is a TTY and not in static mode)
  useEffect(() => {
    // No-op in static mode
    if (isStaticMode) {
      log.debug?.("useInput effect: static mode, skipping raw mode setup")
      return
    }

    log.debug?.(
      `useInput effect: isActive=${isActive}, stdinContext=${!!stdinContext}, isRawModeSupported=${stdinContext?.isRawModeSupported}`,
    )
    if (!isActive || !stdinContext || !stdinContext.isRawModeSupported) {
      log.debug?.("useInput effect: skipping raw mode setup")
      return
    }

    // Only set raw mode if stdin is a TTY - avoids crash in non-interactive contexts
    log.debug?.("useInput effect: setting raw mode true")
    stdinContext.setRawMode(true)
    return () => {
      log.debug?.("useInput effect cleanup: setting raw mode false")
      stdinContext.setRawMode(false)
    }
  }, [isActive, isStaticMode, stdinContext])

  // Listen for input events via InputContext
  useEffect(() => {
    // No-op in static mode
    if (isStaticMode) {
      log.debug?.("useInput effect: static mode, skipping input subscription")
      return
    }

    if (!isActive || !inputContext) {
      return
    }

    const handleData = (data: string | Buffer) => {
      const [input, key] = parseKey(data)

      // Handle Ctrl+C exit
      if (input === "c" && key.ctrl && inputContext.exitOnCtrlC) {
        return // Let the app handle exit
      }

      handlerRef.current(input, key)
    }

    inputContext.eventEmitter.on("input", handleData)

    // Subscribe to paste events if onPaste callback is provided
    const handlePaste = (text: string) => {
      onPasteRef.current?.(text)
    }
    inputContext.eventEmitter.on("paste", handlePaste)

    return () => {
      inputContext.eventEmitter.removeListener("input", handleData)
      inputContext.eventEmitter.removeListener("paste", handlePaste)
    }
  }, [isActive, isStaticMode, inputContext])
}
