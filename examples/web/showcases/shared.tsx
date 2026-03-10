/**
 * Shared infrastructure for browser showcase components.
 *
 * Input/mouse/focus event buses bridge xterm.js I/O to React hooks.
 * Each showcase imports these hooks to handle keyboard and mouse input.
 */

import React, { useState, useEffect, useRef } from "react"
import { Box, Text } from "@silvery/term/xterm/index.ts"
import { parseKey, type Key } from "@silvery/tea"

// ============================================================================
// Input Event Bus
// ============================================================================

export type KeyInfo = Key

export type InputHandler = (input: string, key: KeyInfo) => void

const inputListeners = new Set<InputHandler>()

/** Called from showcase-app.tsx via term.onData() */
export function emitInput(data: string): void {
  const [input, key] = parseKey(data)
  for (const cb of inputListeners) cb(input, key)
}

/** Subscribe to keyboard input */
export function useInput(handler: InputHandler): void {
  const ref = useRef(handler)
  ref.current = handler
  useEffect(() => {
    const cb: InputHandler = (i, k) => ref.current(i, k)
    inputListeners.add(cb)
    return () => {
      inputListeners.delete(cb)
    }
  }, [])
}

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

/** Called from showcase-app.tsx via term.onBinary() */
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

/** Called from viewer-app.tsx when xterm gains/loses focus */
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
