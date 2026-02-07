/**
 * Inkx useInput Hook
 *
 * Handles keyboard input parsing and provides a clean API for responding to key presses.
 * Compatible with Ink's useInput API.
 */

import { createLogger } from "@beorn/logger"
import { useContext, useEffect } from "react"
import { EventsContext, InputContext, StdinContext } from "../context.js"
import {
  type Key,
  type ParsedKeypress,
  CODE_TO_KEY,
  parseKeypress,
} from "../keys.js"

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
}

// ============================================================================
// Key Parsing Constants (useInput-specific)
// ============================================================================

/**
 * Keys that should not be passed as input text.
 * This is a shorter list than the runtime version since useInput doesn't need
 * "return", "enter", "tab", "escape", "delete" filtering.
 */
const NON_ALPHANUMERIC_KEYS = [...Object.values(CODE_TO_KEY), "backspace"]

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
export function useInput(
  inputHandler: InputHandler,
  options: UseInputOptions = {},
): void {
  const events = useContext(EventsContext)
  const stdinContext = useContext(StdinContext)
  const inputContext = useContext(InputContext)

  const { isActive = true } = options

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
      const keypress: ParsedKeypress = parseKeypress(data)

      const key: Key = {
        upArrow: keypress.name === "up",
        downArrow: keypress.name === "down",
        leftArrow: keypress.name === "left",
        rightArrow: keypress.name === "right",
        pageDown: keypress.name === "pagedown",
        pageUp: keypress.name === "pageup",
        home: keypress.name === "home",
        end: keypress.name === "end",
        return: keypress.name === "return",
        escape: keypress.name === "escape",
        ctrl: keypress.ctrl,
        shift: keypress.shift,
        tab: keypress.name === "tab",
        backspace: keypress.name === "backspace",
        delete: keypress.name === "delete",
        meta: keypress.meta || keypress.name === "escape" || keypress.option,
      }

      let input = keypress.ctrl ? keypress.name : keypress.sequence

      if (NON_ALPHANUMERIC_KEYS.includes(keypress.name)) {
        input = ""
      }

      // Strip meta prefix if remaining
      if (input.startsWith("\u001b")) {
        input = input.slice(1)
      }

      // Filter out escape sequence fragments that leak through
      // e.g., "[2~" from Insert key, "[A" from arrows when not fully parsed
      // BUT allow single "[" and "]" through - they're valid key bindings
      if (
        (input.startsWith("[") && input.length > 1) ||
        (input.startsWith("O") && input.length > 1)
      ) {
        input = ""
      }

      // Detect shift for uppercase letters
      if (
        input.length === 1 &&
        typeof input[0] === "string" &&
        /[A-Z]/.test(input[0])
      ) {
        key.shift = true
      }

      // Handle Ctrl+C exit
      if (input === "c" && key.ctrl && inputContext.exitOnCtrlC) {
        return // Let the app handle exit
      }

      inputHandler(input, key)
    }

    inputContext.eventEmitter.on("input", handleData)
    return () => {
      inputContext.eventEmitter.removeListener("input", handleData)
    }
  }, [isActive, isStaticMode, inputContext, inputHandler])
}
