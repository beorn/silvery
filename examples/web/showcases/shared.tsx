/**
 * Shared infrastructure for browser showcase components.
 *
 * Mouse and focus event buses bridge xterm.js I/O to React hooks.
 * Keyboard input is handled by silvery's RuntimeContext (via useInput from @silvery/term/xterm).
 */

import React, { useState, useEffect, useRef } from "react"
import { Box, Text } from "@silvery/term/xterm/index.ts"

// ============================================================================
// Mouse Event Bus
// ============================================================================

export interface MouseInfo {
  x: number
  y: number
  button: number
}

export type MouseHandler = (info: MouseInfo) => void

const mouseListeners = new Set<MouseHandler>()

/** Called from showcase-app.tsx via renderToXterm input.onMouse */
export function emitMouse(x: number, y: number, button: number): void {
  for (const cb of mouseListeners) cb({ x, y, button })
}

/** Subscribe to mouse click events */
export function useMouseClick(handler: MouseHandler): void {
  const ref = useRef(handler)
  ref.current = handler
  useEffect(() => {
    const cb: MouseHandler = (info) => ref.current(info)
    mouseListeners.add(cb)
    return () => {
      mouseListeners.delete(cb)
    }
  }, [])
}

// ============================================================================
// Focus State — tracks whether the xterm terminal has focus
// ============================================================================

let _termFocused = false
const focusListeners = new Set<(focused: boolean) => void>()

/** Called from showcase-app.tsx via renderToXterm input.onFocus */
export function setTermFocused(focused: boolean): void {
  _termFocused = focused
  for (const cb of focusListeners) cb(focused)
}

/** Hook: subscribe to terminal focus state */
export function useTermFocused(): boolean {
  const [focused, setFocused] = useState(_termFocused)
  useEffect(() => {
    const cb = (f: boolean) => setFocused(f)
    focusListeners.add(cb)
    return () => {
      focusListeners.delete(cb)
    }
  }, [])
  return focused
}

// ============================================================================
// KeyHints — bottom bar showing available keys
// ============================================================================

export function KeyHints({ hints }: { hints: string }): JSX.Element {
  return (
    <Box marginTop={1}>
      <Text color="#555">{hints}</Text>
    </Box>
  )
}
