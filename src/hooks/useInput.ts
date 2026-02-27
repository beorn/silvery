/**
 * Inkx useInput Hook
 *
 * Handles keyboard input parsing and provides a clean API for responding to key presses.
 * Compatible with Ink's useInput API.
 *
 * Throws if called outside a runtime (run(), render(), createApp()). If your component
 * needs to work without input, don't call useInput — check the context yourself first.
 */

import { createLogger } from "@beorn/logger"
import { useContext, useEffect, useRef } from "react"
import { InputContext, StdinContext } from "../context.js"
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
 * Throws if InputContext is not provided (i.e., outside a runtime).
 * If your component needs to work in both interactive and static modes,
 * conditionally call useInput based on your own context check.
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

  // Set raw mode when active (only if stdin is a TTY)
  useEffect(() => {
    if (!isActive || !stdinContext || !stdinContext.isRawModeSupported) {
      return
    }

    log.debug?.("useInput: setting raw mode true")
    stdinContext.setRawMode(true)
    return () => {
      log.debug?.("useInput: setting raw mode false")
      stdinContext.setRawMode(false)
    }
  }, [isActive, stdinContext])

  // Listen for input events via InputContext
  useEffect(() => {
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
  }, [isActive, inputContext])
}
