/**
 * Silvery useInput Hook
 *
 * Handles keyboard input via the unified RuntimeContext.
 * Compatible with Ink's useInput API.
 *
 * No-ops when called outside a runtime (e.g., in createRenderer() tests where
 * RuntimeContext is absent). Components render without input handling, which
 * is correct for static rendering.
 * Use useRuntime() for components that need to detect interactive vs static mode.
 */

import { useContext, useEffect, useRef } from "react"
import { ChainAppContext, RuntimeContext } from "../context"
import { isModifierOnlyEvent, type InputHandler, type Key } from "@silvery/ag/keys"
// RuntimeContext import retained for the exit() side channel — the chain
// owns input subscriptions but exit still flows through RuntimeContext until
// lifecycle effects land.

// ============================================================================
// Types
// ============================================================================

// Re-export Key and InputHandler for consumers that import from useInput
export type { Key, InputHandler } from "@silvery/ag/keys"

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

  /**
   * Callback for key release events.
   * Requires Kitty protocol with REPORT_EVENTS flag enabled.
   * When provided, release events are dispatched here instead of being silently dropped.
   *
   * @example
   * ```tsx
   * useInput((input, key) => {
   *   // Handle press/repeat events
   * }, {
   *   onRelease: (input, key) => {
   *     // Handle release events (e.g., stop scrolling, end drag)
   *   },
   * })
   * ```
   */
  onRelease?: InputHandler
}

// ============================================================================
// Hook Implementation
// ============================================================================

/**
 * Hook for handling user input.
 *
 * No-ops if RuntimeContext is not provided (i.e., outside a runtime).
 * Components render normally without input handling in static mode.
 * Use useRuntime() for components that need to detect interactive vs static mode.
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
 *   }, {
 *     onRelease: (input, key) => {
 *       // Handle key release (requires Kitty REPORT_EVENTS)
 *     },
 *   });
 *
 *   return <Text>Press q to quit</Text>;
 * }
 * ```
 */
export function useInput(inputHandler: InputHandler, options: UseInputOptions = {}): void {
  // Input subscriptions flow through ChainAppContext — provided by root
  // `createApp()` and by `InputBoundary` for isolated scopes. In static mode
  // (no chain), this hook is a no-op.
  //
  // RuntimeContext is still used for `exit()` (exit is a side effect the
  // chain emits but this hook routes through rt so the existing exit path
  // stays authoritative).
  const chain = useContext(ChainAppContext)
  const rt = useContext(RuntimeContext)

  const { isActive = true, onPaste, onRelease } = options

  // Stable ref for the handler — avoids tearing down/recreating the
  // subscription on every render. Without this, rapid keystrokes between
  // effect cleanup and setup are lost.
  const handlerRef = useRef(inputHandler)
  handlerRef.current = inputHandler

  const onPasteRef = useRef(onPaste)
  onPasteRef.current = onPaste

  const onReleaseRef = useRef(onRelease)
  onReleaseRef.current = onRelease

  // Subscribe to input events via the chain input store (press/repeat only —
  // withInputChain filters out release and modifier-only events). No-op if
  // absent (static/render-string mode).
  useEffect(() => {
    if (!isActive) return
    if (!chain) return
    return chain.input.register((input, key) => {
      // Skip modifier-only keys (Cmd, Shift, Ctrl, Alt pressed alone).
      // Handled by useModifierKeys, not useInput consumers.
      if (isModifierOnlyEvent(input, key as Key)) return
      const result = handlerRef.current(input, key as Key)
      if (result === "exit") {
        // Route exit through RuntimeContext. The chain also emits an `exit`
        // effect but the runner drains and discards effects in the current
        // wiring; rt.exit() is the canonical path until runEventBatch effect
        // handling lands.
        rt?.exit()
        return "exit"
      }
      return undefined
    })
  }, [isActive, chain, rt])

  // Release events bypass withInputChain's handler invocation — subscribe
  // via the raw-key observer so onRelease still fires.
  useEffect(() => {
    if (!isActive) return
    if (!chain) return
    return chain.rawKeys.register((input, key) => {
      if (key.eventType !== "release") return
      onReleaseRef.current?.(input, key as Key)
    })
  }, [isActive, chain])

  // Subscribe to paste events via the chain paste store.
  useEffect(() => {
    if (!isActive) return
    if (!chain) return
    return chain.paste.register((text) => {
      onPasteRef.current?.(text)
    })
  }, [isActive, chain])
}
