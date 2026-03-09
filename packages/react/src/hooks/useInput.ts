/**
 * Silvery useInput Hook
 *
 * Handles keyboard input via the unified RuntimeContext.
 * Compatible with Ink's useInput API.
 *
 * Throws if called outside a runtime (run(), render(), createApp(), test renderer).
 * Use useRuntime() for components that need to work in both static and interactive modes.
 */

import { useContext, useEffect, useRef } from "react"
import { RuntimeContext } from "../context"
import type { Key } from "@silvery/tea/keys"

// ============================================================================
// Types
// ============================================================================

// Re-export Key for consumers that import from useInput
export type { Key } from "@silvery/tea/keys"

/**
 * Input handler callback type.
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
 * Throws if RuntimeContext is not provided (i.e., outside a runtime).
 * Use useRuntime() for components that work in both interactive and static modes.
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
  const rt = useContext(RuntimeContext)

  if (!rt) {
    throw new Error(
      "useInput requires a runtime (run/render/createApp/test renderer). " +
        "Use useRuntime() for components that work in both static and interactive modes.",
    )
  }

  const { isActive = true, onPaste } = options

  // Stable ref for the handler — avoids tearing down/recreating the
  // subscription on every render. Without this, rapid keystrokes between
  // effect cleanup and setup are lost.
  const handlerRef = useRef(inputHandler)
  handlerRef.current = inputHandler

  const onPasteRef = useRef(onPaste)
  onPasteRef.current = onPaste

  // Subscribe to input events via RuntimeContext
  useEffect(() => {
    if (!isActive) return

    return rt.on("input", (input: string, key: Key) => {
      handlerRef.current(input, key)
    })
  }, [isActive, rt])

  // Subscribe to paste events via RuntimeContext
  useEffect(() => {
    if (!isActive) return

    return rt.on("paste", (text: string) => {
      onPasteRef.current?.(text)
    })
  }, [isActive, rt])
}
