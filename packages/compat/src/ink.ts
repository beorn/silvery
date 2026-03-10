/**
 * silvery/ink — Drop-in Ink replacement.
 *
 * ```tsx
 * // Before:
 * import { Box, Text, render, useInput, useApp } from 'ink'
 *
 * // After:
 * import { Box, Text, render, useInput, useApp } from 'silvery/ink'
 * ```
 *
 * For silvery-native features beyond Ink's API:
 * - `@silvery/react`   — base components, reconciler, hooks
 * - `@silvery/ui`      — TextInput, TextArea, Table, Picker, Modal, etc.
 * - `@silvery/term`    — runtime, pipeline, terminal protocols
 * - `@silvery/ansi`    — styling, colors, terminal control
 * - `@silvery/theme`   — ThemeProvider, useTheme, semantic tokens
 * - `@silvery/tea`     — store, core types, tree utilities
 * - `@silvery/test`    — testing utilities, buffer assertions
 *
 * Or import everything from `silvery`.
 *
 * @packageDocumentation
 */

import React, { Component, useContext, useCallback, useState, useEffect, useMemo, useRef, act } from "react"
import { StdoutContext, RuntimeContext, TermContext } from "@silvery/react/context"
import type { RuntimeContextValue, StdoutContextValue } from "@silvery/react/context"
import { createTerm } from "@silvery/term/ansi"
import { EventEmitter } from "node:events"
import { parseKey } from "@silvery/tea/keys"
import chalk from "chalk"
import { createContainer, getContainerRoot } from "@silvery/react/reconciler"
import { stringReconciler } from "@silvery/react/reconciler/string-reconciler"
import { executeRender } from "@silvery/term/pipeline"
import { bufferToStyledText, bufferToText, type TerminalBuffer } from "@silvery/term/buffer"

/**
 * Get chalk's current color level at render time.
 * Tests may set chalk.level programmatically (e.g., chalk.level = 3 for
 * background color tests). We sync our renderer's color behavior with chalk.
 */
function currentChalkLevel(): number {
  return chalk?.level ?? 0
}

// =============================================================================
// Color conversion (Ink → silvery)
// =============================================================================

/**
 * ANSI 256-color palette: first 16 colors as RGB.
 * Used to convert `ansi256(N)` color strings to hex for silvery.
 */
const ansi256BasicColors: readonly [number, number, number][] = [
  [0, 0, 0], // 0: black
  [128, 0, 0], // 1: red (maroon)
  [0, 128, 0], // 2: green
  [128, 128, 0], // 3: yellow (olive)
  [0, 0, 128], // 4: blue (navy)
  [128, 0, 128], // 5: magenta (purple)
  [0, 128, 128], // 6: cyan (teal)
  [192, 192, 192], // 7: white (silver)
  [128, 128, 128], // 8: bright black (gray)
  [255, 0, 0], // 9: bright red
  [0, 255, 0], // 10: bright green
  [255, 255, 0], // 11: bright yellow
  [0, 0, 255], // 12: bright blue
  [255, 0, 255], // 13: bright magenta
  [0, 255, 255], // 14: bright cyan
  [255, 255, 255], // 15: bright white
]

/**
 * Convert ANSI 256-color index to RGB values.
 */
function ansi256ToRgb(index: number): [number, number, number] {
  if (index < 16) return ansi256BasicColors[index]!
  if (index < 232) {
    // 6x6x6 color cube (indices 16-231)
    const i = index - 16
    const r = Math.floor(i / 36)
    const g = Math.floor((i % 36) / 6)
    const b = i % 6
    return [r ? r * 40 + 55 : 0, g ? g * 40 + 55 : 0, b ? b * 40 + 55 : 0]
  }
  // Grayscale (indices 232-255)
  const v = (index - 232) * 10 + 8
  return [v, v, v]
}

/**
 * Convert Ink color strings to silvery-compatible format.
 * Currently a pass-through since silvery now supports ansi256(N) natively.
 */
function convertColor(color: string | undefined): string | undefined {
  return color
}

/**
 * Strip VS16 (U+FE0F) variation selectors that silvery adds to text-presentation
 * emoji characters. Silvery's ensureEmojiPresentation adds VS16 to characters that
 * are Extended_Pictographic but NOT Emoji_Presentation (e.g., ✔ U+2714, ☑ U+2611).
 *
 * This preserves VS16 in user content where it was already present (e.g., 🌡️, ⚠️)
 * by only stripping VS16 after characters that match the text-presentation pattern.
 */
const TEXT_PRES_REGEX = /^\p{Extended_Pictographic}$/u
const EMOJI_PRES_REGEX = /^\p{Emoji_Presentation}$/u

function stripSilveryVS16(input: string): string {
  // Fast path: no VS16 in the string
  if (!input.includes("\uFE0F")) return input

  // Walk through the string, removing VS16 only after text-presentation emoji
  let result = ""
  let i = 0
  while (i < input.length) {
    const cp = input.codePointAt(i)!
    const char = String.fromCodePoint(cp)
    const charLen = char.length

    // Check if next position has VS16
    if (i + charLen < input.length && input.charCodeAt(i + charLen) === 0xfe0f) {
      // Only strip VS16 if the preceding char is text-presentation emoji
      // (Extended_Pictographic AND NOT Emoji_Presentation)
      if (TEXT_PRES_REGEX.test(char) && !EMOJI_PRES_REGEX.test(char)) {
        // This is a text-presentation emoji that silvery decorated with VS16 — strip it
        result += char
        i += charLen + 1 // skip char + VS16
        continue
      }
    }

    result += char
    i += charLen
  }
  return result
}

// =============================================================================
// Components (Ink-compatible)
// =============================================================================

import { Box as SilveryBox, type BoxProps as SilveryBoxProps, type BoxHandle } from "@silvery/react/components/Box"
export type { BoxHandle } from "@silvery/react/components/Box"

/**
 * Ink-compatible Box props. Same as silvery's BoxProps.
 */
export type BoxProps = SilveryBoxProps

/**
 * Ink-compatible Box component.
 *
 * Wraps silvery's Box with Ink's default flex properties:
 * - flexDirection: 'row' (silvery defaults to 'column')
 * - flexGrow: 0
 * - flexShrink: 1
 * - flexWrap: 'nowrap'
 *
 * These match Ink's Box.tsx line 83-88 defaults. User-provided props override.
 */
export const Box = React.forwardRef<BoxHandle, BoxProps>(function InkBox(props, ref) {
  // Map Ink's per-axis overflow props to silvery's unified overflow
  const { overflowX, overflowY, ...rest } = props as any
  const overflow = rest.overflow ?? (overflowX === "hidden" || overflowY === "hidden" ? "hidden" : undefined)

  return React.createElement(SilveryBox, {
    flexDirection: "row" as const,
    flexGrow: 0,
    flexShrink: 1,
    ...rest,
    overflow,
    color: convertColor(rest.color),
    backgroundColor: convertColor(rest.backgroundColor),
    borderColor: convertColor(rest.borderColor),
    ref,
  })
})

import { Text as SilveryText } from "@silvery/react/components/Text"
export type { TextProps, TextHandle } from "@silvery/react/components/Text"
import type { TextProps as SilveryTextProps, TextHandle as SilveryTextHandle } from "@silvery/react/components/Text"

/**
 * Ink-compatible Text component.
 *
 * Wraps silvery's Text with ANSI sequence sanitization:
 * - Preserves SGR sequences (colors, bold, etc.)
 * - Preserves OSC sequences (hyperlinks, etc.)
 * - Strips cursor movement, screen clearing, and other control sequences
 * - Strips DCS, PM, APC, SOS control strings
 *
 * This matches Ink's text sanitization behavior from sanitize-ansi.ts.
 */
export const Text = React.forwardRef<SilveryTextHandle, SilveryTextProps>(function InkText(props, ref) {
  const sanitizedChildren = sanitizeChildren(props.children)
  return React.createElement(SilveryText, {
    ...props,
    color: convertColor(props.color),
    backgroundColor: convertColor(props.backgroundColor),
    ref,
    children: sanitizedChildren,
  })
})

/** Recursively sanitize string children, preserving React elements. */
function sanitizeChildren(children: React.ReactNode): React.ReactNode {
  if (typeof children === "string") {
    return sanitizeAnsi(children)
  }
  if (Array.isArray(children)) {
    return children.map((child, i) => sanitizeChildren(child))
  }
  return children
}

export { Newline } from "@silvery/react/components/Newline"
export { Spacer } from "@silvery/react/components/Spacer"
export { Static } from "@silvery/react/components/Static"
export { Transform } from "@silvery/react/components/Transform"
export type { TransformProps } from "@silvery/react/components/Transform"

// =============================================================================
// Hooks (Ink-compatible)
// =============================================================================

export { useInput } from "@silvery/react/hooks/useInput"
export type { Key, InputHandler, UseInputOptions } from "@silvery/react/hooks/useInput"

export { useApp } from "@silvery/react/hooks/useApp"
export type { UseAppResult } from "@silvery/react/hooks/useApp"

export { useStdout } from "@silvery/react/hooks/useStdout"
export type { UseStdoutResult } from "@silvery/react/hooks/useStdout"

// =============================================================================
// Ink-compatible Focus System
// =============================================================================

// Ink's focus system is context-based with add/remove/focusNext/focusPrevious.
// This is fundamentally different from silvery's tree-based FocusManager, so we
// implement Ink's model directly for compat.

import { createContext } from "react"

type Focusable = { id: string; isActive: boolean }

type InkFocusContextValue = {
  activeId: string | undefined
  add: (id: string, options: { autoFocus: boolean }) => void
  remove: (id: string) => void
  activate: (id: string) => void
  deactivate: (id: string) => void
  enableFocus: () => void
  disableFocus: () => void
  focusNext: () => void
  focusPrevious: () => void
  focus: (id: string) => void
}

const InkFocusContext = createContext<InkFocusContextValue>({
  activeId: undefined,
  add() {},
  remove() {},
  activate() {},
  deactivate() {},
  enableFocus() {},
  disableFocus() {},
  focusNext() {},
  focusPrevious() {},
  focus() {},
})

/**
 * Ink-compatible useFocus hook.
 * Registers a focusable component and tracks focus state.
 */
export function useFocus(opts?: { isActive?: boolean; autoFocus?: boolean; id?: string }): {
  isFocused: boolean
  focus: (id: string) => void
} {
  const { isActive = true, autoFocus = false, id: customId } = opts ?? {}
  const ctx = useContext(InkFocusContext)

  const id = useMemo(() => customId ?? Math.random().toString().slice(2, 7), [customId])

  useEffect(() => {
    ctx.add(id, { autoFocus })
    return () => {
      ctx.remove(id)
    }
  }, [id, autoFocus])

  useEffect(() => {
    if (isActive) {
      ctx.activate(id)
    } else {
      ctx.deactivate(id)
    }
  }, [isActive, id])

  return {
    isFocused: Boolean(id) && ctx.activeId === id,
    focus: ctx.focus,
  }
}

/**
 * Ink-compatible useFocusManager hook.
 */
export function useFocusManager(): {
  enableFocus: () => void
  disableFocus: () => void
  focusNext: () => void
  focusPrevious: () => void
  focus: (id: string) => void
  activeId: string | undefined
} {
  const ctx = useContext(InkFocusContext)
  return {
    enableFocus: ctx.enableFocus,
    disableFocus: ctx.disableFocus,
    focusNext: ctx.focusNext,
    focusPrevious: ctx.focusPrevious,
    focus: ctx.focus,
    activeId: ctx.activeId,
  }
}

/**
 * Ink-compatible FocusProvider component.
 * Manages focus state: list of focusables, active focus ID, tab navigation.
 */
function InkFocusProvider({
  children,
  inputEmitter,
}: {
  children: import("react").ReactNode
  inputEmitter?: EventEmitter
}) {
  const [isFocusEnabled, setIsFocusEnabled] = useState(true)
  const [activeFocusId, setActiveFocusId] = useState<string | undefined>(undefined)
  const [, setFocusables] = useState<Focusable[]>([])
  const focusablesCountRef = React.useRef(0)

  const findNextFocusable = useCallback(
    (currentFocusables: Focusable[], currentActiveFocusId: string | undefined): string | undefined => {
      const activeIndex = currentFocusables.findIndex((f) => f.id === currentActiveFocusId)
      for (let i = activeIndex + 1; i < currentFocusables.length; i++) {
        if (currentFocusables[i]?.isActive) return currentFocusables[i]!.id
      }
      return undefined
    },
    [],
  )

  const findPreviousFocusable = useCallback(
    (currentFocusables: Focusable[], currentActiveFocusId: string | undefined): string | undefined => {
      const activeIndex = currentFocusables.findIndex((f) => f.id === currentActiveFocusId)
      for (let i = activeIndex - 1; i >= 0; i--) {
        if (currentFocusables[i]?.isActive) return currentFocusables[i]!.id
      }
      return undefined
    },
    [],
  )

  const focusNext = useCallback((): void => {
    setFocusables((currentFocusables) => {
      setActiveFocusId((currentActiveFocusId) => {
        const firstFocusableId = currentFocusables.find((f) => f.isActive)?.id
        const nextFocusableId = findNextFocusable(currentFocusables, currentActiveFocusId)
        return nextFocusableId ?? firstFocusableId
      })
      return currentFocusables
    })
  }, [findNextFocusable])

  const focusPrevious = useCallback((): void => {
    setFocusables((currentFocusables) => {
      setActiveFocusId((currentActiveFocusId) => {
        const lastFocusableId = currentFocusables.findLast((f) => f.isActive)?.id
        const previousFocusableId = findPreviousFocusable(currentFocusables, currentActiveFocusId)
        return previousFocusableId ?? lastFocusableId
      })
      return currentFocusables
    })
  }, [findPreviousFocusable])

  const enableFocus = useCallback((): void => {
    setIsFocusEnabled(true)
  }, [])
  const disableFocus = useCallback((): void => {
    setIsFocusEnabled(false)
  }, [])

  const focus = useCallback((id: string): void => {
    setFocusables((currentFocusables) => {
      if (currentFocusables.some((f) => f.id === id)) {
        setActiveFocusId(id)
      }
      return currentFocusables
    })
  }, [])

  const addFocusable = useCallback((id: string, { autoFocus }: { autoFocus: boolean }): void => {
    setFocusables((currentFocusables) => {
      focusablesCountRef.current = currentFocusables.length + 1
      return [...currentFocusables, { id, isActive: true }]
    })
    if (autoFocus) {
      setActiveFocusId((currentActiveFocusId) => {
        if (!currentActiveFocusId) return id
        return currentActiveFocusId
      })
    }
  }, [])

  const removeFocusable = useCallback((id: string): void => {
    setActiveFocusId((currentActiveFocusId) => {
      if (currentActiveFocusId === id) return undefined
      return currentActiveFocusId
    })
    setFocusables((currentFocusables) => {
      const filtered = currentFocusables.filter((f) => f.id !== id)
      focusablesCountRef.current = filtered.length
      return filtered
    })
  }, [])

  const activateFocusable = useCallback((id: string): void => {
    setFocusables((currentFocusables) => currentFocusables.map((f) => (f.id === id ? { ...f, isActive: true } : f)))
  }, [])

  const deactivateFocusable = useCallback((id: string): void => {
    setActiveFocusId((currentActiveFocusId) => {
      if (currentActiveFocusId === id) return undefined
      return currentActiveFocusId
    })
    setFocusables((currentFocusables) => currentFocusables.map((f) => (f.id === id ? { ...f, isActive: false } : f)))
  }, [])

  // Tab/Shift+Tab/Esc focus navigation via inputEmitter
  useEffect(() => {
    if (!inputEmitter) return
    const tab = "\t"
    const shiftTab = "\x1b[Z"
    const escape = "\x1b"
    const handleInput = (data: string | Buffer) => {
      const input = typeof data === "string" ? data : data.toString()
      if (!isFocusEnabled || focusablesCountRef.current === 0) return
      if (input === tab) focusNext()
      else if (input === shiftTab) focusPrevious()
      else if (input === escape) setActiveFocusId(undefined)
    }
    inputEmitter.on("input", handleInput)
    return () => {
      inputEmitter.removeListener("input", handleInput)
    }
  }, [isFocusEnabled, focusNext, focusPrevious, inputEmitter])

  const contextValue = useMemo(
    () => ({
      activeId: activeFocusId,
      add: addFocusable,
      remove: removeFocusable,
      activate: activateFocusable,
      deactivate: deactivateFocusable,
      enableFocus,
      disableFocus,
      focusNext,
      focusPrevious,
      focus,
    }),
    [
      activeFocusId,
      addFocusable,
      removeFocusable,
      activateFocusable,
      deactivateFocusable,
      enableFocus,
      disableFocus,
      focusNext,
      focusPrevious,
      focus,
    ],
  )

  return React.createElement(InkFocusContext.Provider, { value: contextValue }, children)
}

export type UseFocusOptions = { isActive?: boolean; autoFocus?: boolean; id?: string }
export type UseFocusResult = { isFocused: boolean; focus: (id: string) => void }
export type InkUseFocusManagerResult = ReturnType<typeof useFocusManager>

// Ink-compatible useStdin stub

/**
 * Ink-compatible useStdin hook.
 * Returns stdin stream and raw mode controls.
 */
export function useStdin() {
  return {
    stdin: process.stdin,
    setRawMode: (_value: boolean) => {},
    isRawModeSupported: process.stdin.isTTY ?? false,
  }
}

/**
 * Ink-compatible useCursor hook.
 * Returns setCursorPosition for IME support.
 */
export function useCursor() {
  const setCursorPosition = useCallback((_position: { x: number; y: number } | undefined) => {}, [])
  return { setCursorPosition }
}

/**
 * Get terminal rows with fallback chain: stdout.rows -> env LINES -> default 24.
 */
function getTerminalRows(stdout: NodeJS.WriteStream): number {
  const rows = (stdout as any).rows
  if (rows != null && rows > 0) return rows
  // Fall back to LINES env var (used by terminal-size and POSIX)
  const envLines = process.env.LINES
  if (envLines) {
    const parsed = Number.parseInt(envLines, 10)
    if (parsed > 0) return parsed
  }
  return 24
}

/**
 * Get terminal columns with fallback chain: stdout.columns -> env COLUMNS -> default 80.
 */
function getTerminalColumns(stdout: NodeJS.WriteStream): number {
  if (stdout.columns > 0) return stdout.columns
  // Fall back to COLUMNS env var
  const envCols = process.env.COLUMNS
  if (envCols) {
    const parsed = Number.parseInt(envCols, 10)
    if (parsed > 0) return parsed
  }
  return 80
}

/**
 * Ink-compatible useWindowSize hook.
 * Returns current terminal dimensions.
 */
export function useWindowSize() {
  const ctx = useContext(StdoutContext)
  const stdout = ctx?.stdout ?? process.stdout
  const [size, setSize] = useState(() => ({
    columns: getTerminalColumns(stdout),
    rows: getTerminalRows(stdout),
  }))

  useEffect(() => {
    const onResize = () => {
      setSize({
        columns: getTerminalColumns(stdout),
        rows: getTerminalRows(stdout),
      })
    }
    stdout.on("resize", onResize)
    return () => {
      stdout.off("resize", onResize)
    }
  }, [stdout])

  return size
}

/**
 * Extract the TeaNode from a ref that may point to a BoxHandle or a TeaNode.
 * In silvery, Box's forwardRef exposes a BoxHandle via useImperativeHandle,
 * which has getNode(). Ink users pass refs expecting direct DOM-like access.
 */
function resolveTeaNode(refValue: any): import("@silvery/tea/types").TeaNode | null {
  if (!refValue) return null
  // BoxHandle from silvery's Box component
  if (typeof refValue.getNode === "function") {
    return refValue.getNode()
  }
  // Direct TeaNode (has layoutNode property)
  if (refValue.layoutNode !== undefined || refValue.contentRect !== undefined) {
    return refValue
  }
  return null
}

/**
 * Metrics state for useBoxMetrics.
 */
interface BoxMetrics {
  width: number
  height: number
  left: number
  top: number
  hasMeasured: boolean
}

const ZERO_METRICS: BoxMetrics = { width: 0, height: 0, left: 0, top: 0, hasMeasured: false }

/**
 * Compare two BoxMetrics objects for equality.
 */
function metricsEqual(a: BoxMetrics, b: BoxMetrics): boolean {
  return a.width === b.width && a.height === b.height && a.left === b.left && a.top === b.top && a.hasMeasured === b.hasMeasured
}

/**
 * Ink-compatible useBoxMetrics hook.
 * Returns layout metrics for a tracked box element.
 *
 * Wires into silvery's layout system by subscribing to layout changes
 * on the referenced TeaNode's layoutSubscribers.
 */
export function useBoxMetrics(ref: import("react").RefObject<any>) {
  const [metrics, setMetrics] = useState<BoxMetrics>(ZERO_METRICS)

  // Track the previously resolved node so we can detect ref switches
  const prevNodeRef = useRef<import("@silvery/tea/types").TeaNode | null>(null)
  // Track the last metrics we set to avoid unnecessary state updates
  const lastMetricsRef = useRef<BoxMetrics>(ZERO_METRICS)

  /**
   * Update metrics only if they changed, to prevent infinite re-render loops.
   */
  const updateMetrics = useCallback((next: BoxMetrics) => {
    if (!metricsEqual(lastMetricsRef.current, next)) {
      lastMetricsRef.current = next
      setMetrics(next)
    }
  }, [])

  // Subscribe to layout changes. Re-runs on every render (no deps) to
  // pick up ref changes (e.g., memoized component's ref becoming available).
  useEffect(() => {
    const node = resolveTeaNode(ref.current)

    // Detect ref switch
    if (node !== prevNodeRef.current) {
      prevNodeRef.current = node
      if (!node) {
        updateMetrics(ZERO_METRICS)
        return
      }
    }

    if (!node) return

    const onLayoutChange = () => {
      const rect = node.contentRect
      if (rect) {
        updateMetrics({
          width: rect.width,
          height: rect.height,
          left: rect.x,
          top: rect.y,
          hasMeasured: true,
        })
      }
    }

    // Read current layout if already computed
    if (node.contentRect) {
      onLayoutChange()
    }

    // Subscribe to future layout changes
    node.layoutSubscribers.add(onLayoutChange)

    return () => {
      node.layoutSubscribers.delete(onLayoutChange)
    }
  })

  // Listen for resize events on stdout to trigger re-measurement
  const ctx = useContext(StdoutContext)
  const stdout = ctx?.stdout ?? process.stdout

  useEffect(() => {
    const onResize = () => {
      const node = resolveTeaNode(ref.current)
      if (node?.contentRect) {
        updateMetrics({
          width: node.contentRect.width,
          height: node.contentRect.height,
          left: node.contentRect.x,
          top: node.contentRect.y,
          hasMeasured: true,
        })
      }
    }
    stdout.on("resize", onResize)
    return () => {
      stdout.off("resize", onResize)
    }
  }, [stdout, ref, updateMetrics])

  return metrics
}

// =============================================================================
// ANSI Sanitization (Ink-compatible)
// =============================================================================

// Port of Ink's sanitize-ansi.ts and ansi-tokenizer.ts.
// Strips non-SGR ANSI sequences (cursor movement, screen clear, etc.)
// while preserving SGR (colors/styles) and OSC (hyperlinks) sequences.

const ESC = "\u001B"
const BEL = "\u0007"
const ST_CHAR = "\u009C" // C1 String Terminator
const CSI_CHAR = "\u009B" // C1 CSI
const OSC_CHAR = "\u009D" // C1 OSC
const DCS_CHAR = "\u0090" // C1 DCS
const PM_CHAR = "\u009E" // C1 PM
const APC_CHAR = "\u009F" // C1 APC
const SOS_CHAR = "\u0098" // C1 SOS

const isCsiParam = (cp: number) => cp >= 0x30 && cp <= 0x3f
const isCsiIntermediate = (cp: number) => cp >= 0x20 && cp <= 0x2f
const isCsiFinal = (cp: number) => cp >= 0x40 && cp <= 0x7e
const isEscIntermediate = (cp: number) => cp >= 0x20 && cp <= 0x2f
const isEscFinal = (cp: number) => cp >= 0x30 && cp <= 0x7e
const isC1Control = (cp: number) => cp >= 0x80 && cp <= 0x9f

const sgrParamsRegex = /^[\d:;]*$/

/**
 * Check if text contains any ANSI control characters.
 */
function hasAnsiControl(text: string): boolean {
  if (text.includes(ESC)) return true
  for (const ch of text) {
    const cp = ch.codePointAt(0)!
    if (isC1Control(cp)) return true
  }
  return false
}

/**
 * Find the index of a control string terminator (ST, BEL, or ESC \).
 * Returns the index AFTER the terminator, or undefined if not found.
 */
function findST(text: string, from: number, allowBel: boolean): number | undefined {
  for (let i = from; i < text.length; i++) {
    const ch = text[i]!
    if (allowBel && ch === BEL) return i + 1
    if (ch === ST_CHAR) return i + 1
    if (ch === ESC) {
      const next = text[i + 1]
      if (next === ESC) {
        i++
        continue
      } // tmux double-ESC
      if (next === "\\") return i + 2
    }
  }
  return undefined
}

/**
 * Read a CSI sequence starting at `from` (after the CSI introducer).
 * Returns the end index and parsed components, or undefined if malformed.
 */
function readCSI(
  text: string,
  from: number,
): { end: number; params: string; intermediates: string; final: string } | undefined {
  let i = from
  // Parameter bytes
  while (i < text.length && isCsiParam(text.charCodeAt(i))) i++
  const params = text.slice(from, i)
  // Intermediate bytes
  const intStart = i
  while (i < text.length && isCsiIntermediate(text.charCodeAt(i))) i++
  const intermediates = text.slice(intStart, i)
  // Final byte
  if (i >= text.length || !isCsiFinal(text.charCodeAt(i))) return undefined
  return { end: i + 1, params, intermediates, final: text[i]! }
}

type ControlStringInfo = { type: "osc" | "dcs" | "pm" | "apc" | "sos"; allowBel: boolean }

function getControlStringEsc(ch: string): ControlStringInfo | undefined {
  switch (ch) {
    case "]":
      return { type: "osc", allowBel: true }
    case "P":
      return { type: "dcs", allowBel: false }
    case "^":
      return { type: "pm", allowBel: false }
    case "_":
      return { type: "apc", allowBel: false }
    case "X":
      return { type: "sos", allowBel: false }
    default:
      return undefined
  }
}

function getControlStringC1(ch: string): ControlStringInfo | undefined {
  switch (ch) {
    case OSC_CHAR:
      return { type: "osc", allowBel: true }
    case DCS_CHAR:
      return { type: "dcs", allowBel: false }
    case PM_CHAR:
      return { type: "pm", allowBel: false }
    case APC_CHAR:
      return { type: "apc", allowBel: false }
    case SOS_CHAR:
      return { type: "sos", allowBel: false }
    default:
      return undefined
  }
}

/**
 * Sanitize ANSI sequences in text content.
 *
 * Preserves:
 * - SGR sequences (colors, bold, italic, etc.): CSI with final='m', no intermediates, only digit/colon/semicolon params
 * - OSC sequences (hyperlinks, etc.)
 *
 * Strips:
 * - Cursor movement (CSI A/B/C/D/H/etc.)
 * - Screen clearing (CSI J/K)
 * - DCS, PM, APC, SOS control strings
 * - Non-SGR CSI sequences with intermediates or non-standard params
 * - ESC sequences with intermediates (e.g., ESC # 8)
 * - C1 control characters
 * - Standalone ST bytes
 * - Invalid/malformed sequences (and everything after them)
 */
function sanitizeAnsi(text: string): string {
  if (!hasAnsiControl(text)) return text

  let output = ""
  let textStart = 0

  for (let i = 0; i < text.length; ) {
    const ch = text[i]!

    if (ch === ESC) {
      const next = text[i + 1]
      if (next === undefined) {
        // Incomplete ESC at end — treat rest as malformed, drop it
        output += text.slice(textStart, i)
        return output
      }

      if (next === "[") {
        // ESC [ = CSI
        const csi = readCSI(text, i + 2)
        if (!csi) {
          // Malformed CSI — drop everything from here on
          output += text.slice(textStart, i)
          return output
        }
        // Flush text before this sequence
        if (i > textStart) output += text.slice(textStart, i)
        // Only keep SGR: final='m', no intermediates, params are digits/colons/semicolons
        if (csi.final === "m" && csi.intermediates === "" && sgrParamsRegex.test(csi.params)) {
          output += text.slice(i, csi.end)
        }
        // Otherwise strip (cursor movement etc.)
        i = csi.end
        textStart = i
        continue
      }

      // Check for control string introduced by ESC (], P, ^, _, X)
      const cs = getControlStringEsc(next)
      if (cs) {
        const stEnd = findST(text, i + 2, cs.allowBel)
        if (stEnd === undefined) {
          // Incomplete control string — drop everything from here
          output += text.slice(textStart, i)
          return output
        }
        if (i > textStart) output += text.slice(textStart, i)
        // Keep OSC 8 (hyperlinks), strip all other OSC (title, etc.) and DCS/PM/APC/SOS
        if (cs.type === "osc") {
          const oscContent = text.slice(i + 2, stEnd)
          if (oscContent.startsWith("8;")) {
            output += text.slice(i, stEnd)
          }
        }
        i = stEnd
        textStart = i
        continue
      }

      // ESC followed by intermediate characters (ESC # 8, ESC ( B, etc.)
      if (isEscIntermediate(next.charCodeAt(0))) {
        // Read through intermediates to find final byte
        let j = i + 1
        while (j < text.length && isEscIntermediate(text.charCodeAt(j))) j++
        if (j >= text.length || !isEscFinal(text.charCodeAt(j))) {
          // Incomplete/malformed — drop everything from here
          output += text.slice(textStart, i)
          return output
        }
        // Strip the complete ESC sequence
        if (i > textStart) output += text.slice(textStart, i)
        i = j + 1
        textStart = i
        continue
      }

      // ESC followed by a final byte (e.g., ESC c = reset)
      if (isEscFinal(next.charCodeAt(0))) {
        if (i > textStart) output += text.slice(textStart, i)
        i += 2
        textStart = i
        continue
      }

      // Lone ESC followed by something unexpected — skip the ESC
      if (i > textStart) output += text.slice(textStart, i)
      i++
      textStart = i
      continue
    }

    // C1 CSI character (0x9B)
    if (ch === CSI_CHAR) {
      const csi = readCSI(text, i + 1)
      if (!csi) {
        output += text.slice(textStart, i)
        return output
      }
      if (i > textStart) output += text.slice(textStart, i)
      if (csi.final === "m" && csi.intermediates === "" && sgrParamsRegex.test(csi.params)) {
        output += text.slice(i, csi.end)
      }
      i = csi.end
      textStart = i
      continue
    }

    // C1 control string characters (OSC, DCS, PM, APC, SOS)
    const c1cs = getControlStringC1(ch)
    if (c1cs) {
      const stEnd = findST(text, i + 1, c1cs.allowBel)
      if (stEnd === undefined) {
        output += text.slice(textStart, i)
        return output
      }
      if (i > textStart) output += text.slice(textStart, i)
      if (c1cs.type === "osc") {
        const oscContent = text.slice(i + 1, stEnd)
        if (oscContent.startsWith("8;")) {
          output += text.slice(i, stEnd)
        }
      }
      i = stEnd
      textStart = i
      continue
    }

    // Standalone ST character
    if (ch === ST_CHAR) {
      if (i > textStart) output += text.slice(textStart, i)
      i++
      textStart = i
      continue
    }

    // Other C1 control characters (0x80-0x9F not handled above)
    const cp = ch.codePointAt(0)!
    if (isC1Control(cp)) {
      if (i > textStart) output += text.slice(textStart, i)
      i++
      textStart = i
      continue
    }

    i++
  }

  if (textStart < text.length) {
    output += text.slice(textStart)
  }

  return output
}

// =============================================================================
// ANSI Conversion: silvery → chalk-compatible encoding
// =============================================================================

/**
 * Convert silvery's ANSI encoding to chalk-compatible format.
 *
 * Silvery uses:
 * - Reset prefix: `\e[0;...m` (always starts with full reset)
 * - 256-color for basic colors: `38;5;N` / `48;5;N` for N=0..15
 * - Full reset at end: `\e[0m`
 *
 * Chalk uses:
 * - No reset prefix: `\e[32m` (just the code)
 * - 4-bit codes for basic colors: fg=30+N, bg=40+N (N=0..7), bright fg=90+(N-8), bright bg=100+(N-8)
 * - Per-attribute reset: `\e[39m` (fg), `\e[49m` (bg), `\e[22m` (bold/dim)
 */
function silveryToChalkAnsi(input: string): string {
  // Process silvery-style escape sequences:
  //   \e[0;...m  →  individual \e[Xm sequences (chalk-compatible)
  return input.replace(/\x1b\[([^m]*)m/g, (_match, params: string) => {
    const codes = params.split(";")

    // Full reset `\e[0m` → `\e[0m` (same)
    if (codes.length === 1 && codes[0] === "0") {
      return "\x1b[0m"
    }

    // Skip the leading "0" reset that silvery prepends
    let i = 0
    if (codes[0] === "0" && codes.length > 1) {
      i = 1
    }

    const result: string[] = []

    while (i < codes.length) {
      const code = codes[i]!

      // 256-color foreground: 38;5;N
      if (code === "38" && codes[i + 1] === "5" && i + 2 < codes.length) {
        const colorIndex = Number.parseInt(codes[i + 2]!, 10)
        if (colorIndex >= 0 && colorIndex <= 7) {
          // Basic color → 4-bit: 30+N
          result.push(`\x1b[${30 + colorIndex}m`)
        } else if (colorIndex >= 8 && colorIndex <= 15) {
          // Keep as 256-color to match chalk.ansi256(N) format
          result.push(`\x1b[38;5;${colorIndex}m`)
        } else {
          // Extended 256 → keep as-is
          result.push(`\x1b[38;5;${colorIndex}m`)
        }
        i += 3
        continue
      }

      // 256-color background: 48;5;N
      if (code === "48" && codes[i + 1] === "5" && i + 2 < codes.length) {
        const colorIndex = Number.parseInt(codes[i + 2]!, 10)
        if (colorIndex >= 0 && colorIndex <= 7) {
          // Basic color → 4-bit: 40+N
          result.push(`\x1b[${40 + colorIndex}m`)
        } else if (colorIndex >= 8 && colorIndex <= 15) {
          // Keep as 256-color to match chalk.bgAnsi256(N) format
          result.push(`\x1b[48;5;${colorIndex}m`)
        } else {
          // Extended 256 → keep as-is
          result.push(`\x1b[48;5;${colorIndex}m`)
        }
        i += 3
        continue
      }

      // True-color foreground: 38;2;R;G;B → keep as-is
      if (code === "38" && codes[i + 1] === "2" && i + 4 < codes.length) {
        result.push(`\x1b[38;2;${codes[i + 2]};${codes[i + 3]};${codes[i + 4]}m`)
        i += 5
        continue
      }

      // True-color background: 48;2;R;G;B → keep as-is
      if (code === "48" && codes[i + 1] === "2" && i + 4 < codes.length) {
        result.push(`\x1b[48;2;${codes[i + 2]};${codes[i + 3]};${codes[i + 4]}m`)
        i += 5
        continue
      }

      // Underline color: 58;5;N or 58;2;R;G;B → keep as-is
      if (code === "58") {
        if (codes[i + 1] === "5" && i + 2 < codes.length) {
          result.push(`\x1b[58;5;${codes[i + 2]}m`)
          i += 3
        } else if (codes[i + 1] === "2" && i + 4 < codes.length) {
          result.push(`\x1b[58;2;${codes[i + 2]};${codes[i + 3]};${codes[i + 4]}m`)
          i += 5
        } else {
          result.push(`\x1b[${code}m`)
          i++
        }
        continue
      }

      // Underline style with subparams: 4:N → keep as-is
      if (code?.includes(":")) {
        result.push(`\x1b[${code}m`)
        i++
        continue
      }

      // Standard SGR codes (bold=1, dim=2, italic=3, underline=4, etc.)
      result.push(`\x1b[${code}m`)
      i++
    }

    return result.join("")
  })
}

/**
 * Remove duplicate/redundant reset sequences.
 * silvery sometimes produces `\e[0m\e[0m` (double reset) — collapse to single.
 */
function cleanupResets(input: string): string {
  // Collapse consecutive resets
  return input.replace(/(\x1b\[0m)+/g, "\x1b[0m")
}

/**
 * Map SGR set codes to their per-attribute reset codes (chalk-compatible).
 * chalk uses individual resets instead of full reset (\e[0m).
 */
function sgrResetCode(code: number): number | null {
  // Foreground colors: 30-37, 90-97, 38 (extended) → 39
  if ((code >= 30 && code <= 37) || (code >= 90 && code <= 97) || code === 38) return 39
  // Background colors: 40-47, 100-107, 48 (extended) → 49
  if ((code >= 40 && code <= 47) || (code >= 100 && code <= 107) || code === 48) return 49
  // Bold/Dim → 22
  if (code === 1 || code === 2) return 22
  // Italic → 23
  if (code === 3) return 23
  // Underline → 24
  if (code === 4) return 24
  // Inverse → 27
  if (code === 7) return 27
  // Hidden → 28
  if (code === 8) return 28
  // Strikethrough → 29
  if (code === 9) return 29
  // Overline → 55
  if (code === 53) return 55
  return null
}

/**
 * Convert silvery ANSI output to chalk-compatible format.
 *
 * Tracks active SGR attributes and replaces full resets (\e[0m) with
 * per-attribute resets to match chalk's output format.
 * Also strips the leading reset that silvery prepends to unstyled text.
 */
function toChalkCompat(input: string): string {
  let result = cleanupResets(silveryToChalkAnsi(input))
  // Strip leading reset at start of string (silvery adds this even for unstyled text)
  if (result.startsWith("\x1b[0m")) {
    result = result.slice(4)
  }

  // Track active attributes and convert \e[0m to per-attribute resets
  const activeResets = new Set<number>()
  let output = ""
  let i = 0

  while (i < result.length) {
    if (result[i] === "\x1b" && result[i + 1] === "[") {
      // Find end of SGR sequence
      let j = i + 2
      while (j < result.length && result[j] !== "m") j++
      if (j < result.length) {
        const params = result.slice(i + 2, j)
        if (params === "0") {
          // Full reset → emit per-attribute resets for all active attributes
          if (activeResets.size > 0) {
            const resets = [...activeResets].sort((a, b) => a - b)
            for (const r of resets) {
              output += `\x1b[${r}m`
            }
            activeResets.clear()
          }
          // If no active attributes, just strip the reset entirely
          i = j + 1
          continue
        }
        // Parse SGR codes and track what's active
        const codes = params.split(";")
        let ci = 0
        while (ci < codes.length) {
          const code = Number.parseInt(codes[ci]!, 10)
          if (!Number.isNaN(code)) {
            const resetCode = sgrResetCode(code)
            if (resetCode !== null) {
              activeResets.add(resetCode)
            }
            // If this is a reset code itself, remove the corresponding set from active
            if (code === 39) activeResets.delete(39)
            if (code === 49) activeResets.delete(49)
            if (code === 22) {
              activeResets.delete(22)
            }
            if (code === 23) activeResets.delete(23)
            if (code === 24) activeResets.delete(24)
            if (code === 27) activeResets.delete(27)
            if (code === 28) activeResets.delete(28)
            if (code === 29) activeResets.delete(29)
            if (code === 55) activeResets.delete(55)
            // Skip extended color sequences (38;5;N, 48;5;N, 38;2;R;G;B, 48;2;R;G;B)
            if ((code === 38 || code === 48) && codes[ci + 1] === "5") {
              ci += 2
            } else if ((code === 38 || code === 48) && codes[ci + 1] === "2") {
              ci += 4
            }
          }
          ci++
        }
        output += result.slice(i, j + 1)
        i = j + 1
        continue
      }
    }
    output += result[i]
    i++
  }

  return output
}

/**
 * Convert silvery's fixed-buffer output to Ink-compatible output.
 *
 * silvery renders into a width x height buffer where every cell is filled.
 * Ink's yoga renderer only produces content without buffer padding.
 *
 * @param input - Raw output from renderStringSync (untrimmed)
 * @param contentHeight - Layout-computed content height (number of content rows)
 * @returns Output matching Ink's format
 */
function convertBufferOutputToInkFormat(input: string, contentHeight: number): string {
  const allLines = input.split("\n")
  // Keep only contentHeight lines (rest is buffer padding)
  const contentLines = allLines.slice(0, contentHeight)
  // Strip trailing spaces from each line (buffer fill, not content)
  for (let i = 0; i < contentLines.length; i++) {
    contentLines[i] = contentLines[i]!.replace(/ +$/, "")
  }
  // Don't strip trailing empty lines — they are intentional content
  // (e.g., Box with explicit height). The contentHeight from layout
  // already tells us exactly how many lines to keep.
  return contentLines.join("\n")
}

/**
 * Simplified version when content height is unknown.
 * Strips trailing spaces per line and trailing empty lines.
 */
function convertBufferOutputToInkFormatSimple(input: string): string {
  const allLines = input.split("\n")
  for (let i = 0; i < allLines.length; i++) {
    allLines[i] = allLines[i]!.replace(/ +$/, "")
  }
  while (allLines.length > 0 && allLines[allLines.length - 1] === "") {
    allLines.pop()
  }
  return allLines.join("\n")
}

// =============================================================================
// Render (Ink-compatible)
// =============================================================================

import { renderSync, type Instance } from "@silvery/react/render"
export type { RenderOptions, Instance } from "@silvery/react/render"

/**
 * Ink-compatible Instance type with additional Ink-specific methods.
 */
interface InkInstance extends Instance {
  /** Promise that resolves after pending render output is flushed to stdout */
  waitUntilRenderFlush: () => Promise<void>
  /** Unmount and remove internal instance for this stdout */
  cleanup: () => void
}

/**
 * Error boundary for Ink compat.
 * Catches render errors and displays them like Ink does.
 */
interface InkErrorBoundaryProps {
  children: React.ReactNode
  onError?: (error: Error) => void
}

interface InkErrorBoundaryState {
  error: Error | null
}

class InkErrorBoundary extends Component<InkErrorBoundaryProps, InkErrorBoundaryState> {
  state: InkErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): InkErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error) {
    this.props.onError?.(error)
  }

  render() {
    if (this.state.error) {
      // Render error display matching Ink's format exactly
      const err = this.state.error
      const stack = err.stack ?? ""

      // Extract stack frames
      const frames = stack
        .split("\n")
        .filter((line) => line.match(/^\s+at\s/))
        .map((line) => line.trim())

      // Extract file:line from first frame
      const firstFrame = frames[0] ?? ""
      const fileMatch = firstFrame.match(/\((.+)\)$/) ?? firstFrame.match(/at (.+)$/)
      const rawLocation = fileMatch?.[1] ?? ""

      // Make path relative (strip CWD prefix, handle /private on macOS)
      let location = rawLocation
      const cwd = process.cwd()
      for (const prefix of [cwd, `/private${cwd}`]) {
        if (location.startsWith(`${prefix}/`)) {
          location = location.slice(prefix.length + 1)
          break
        }
      }

      // Build source context
      let sourceLines: string[] = []
      if (rawLocation) {
        const locParts = rawLocation.match(/(.+):(\d+):(\d+)/)
        if (locParts) {
          const filePath = locParts[1]!
          const lineNum = Number.parseInt(locParts[2]!, 10)
          try {
            const fs = require("node:fs")
            const source = fs.readFileSync(filePath, "utf8") as string
            const allLines = source.split("\n")
            const start = Math.max(0, lineNum - 4)
            const end = Math.min(allLines.length, lineNum + 4)
            for (let i = start; i < end; i++) {
              sourceLines.push(` ${String(i + 1).padStart(String(end).length)}: ${allLines[i]}`)
            }
          } catch {
            // Can't read source
          }
        }
      }

      // Build stack trace in Ink format: " - FunctionName (file:line:col)"
      const traceLines = frames.map((f) => {
        const m = f.match(/at (.+)/)
        if (!m) return ` - ${f}`
        const content = m[1]!
        // Make paths relative in trace lines too
        let traceEntry = content
        const cwd2 = process.cwd()
        for (const prefix of [cwd2, `/private${cwd2}`]) {
          traceEntry = traceEntry.split(`${prefix}/`).join("")
        }
        return ` - ${traceEntry}`
      })

      const output: string[] = ["", `  ERROR  ${err.message}`, ""]
      if (location) {
        output.push(` ${location}`)
        output.push("")
      }
      if (sourceLines.length > 0) {
        output.push(...sourceLines)
        output.push("")
      }
      output.push(...traceLines)

      return React.createElement("silvery-box", null, React.createElement("silvery-text", null, output.join("\n")))
    }
    return this.props.children
  }
}

/**
 * Ink-compatible render function.
 *
 * When a custom stdout is provided (fake/spy stdout from tests): renders
 * synchronously via renderStringSync and writes output in a single
 * stdout.write() call. This matches Ink's debug mode behavior where each
 * frame is a plain text write without cursor control sequences.
 *
 * When no custom stdout (real terminal): delegates to renderSync() which
 * creates a full SilveryInstance with scheduler.
 */
export function render(element: import("react").ReactNode, options?: Record<string, unknown>): InkInstance {
  // Ensure layout engine is initialized (sync, using flexily)
  if (!isLayoutEngineInitialized()) {
    setLayoutEngine(createFlexilyZeroEngine())
  }

  const stdout = options?.stdout as NodeJS.WriteStream | undefined
  const stdin = options?.stdin as NodeJS.ReadStream | undefined

  // When custom stdout is provided (test mode): use simple sync rendering.
  // This matches Ink's behavior where each render writes plain text output
  // to stdout without cursor control sequences.
  if (stdout) {
    // Detect color from chalk's current level to match Ink's behavior.
    // Ink uses chalk for coloring, and tests may set chalk.level programmatically
    // (e.g., chalk.level = 3 for background color tests). When chalk has colors
    // enabled, our renderer must also produce colors to match chalk's output.
    // When chalk.level is 0 (e.g., FORCE_COLOR=0), both chalk and our renderer
    // produce plain text, so comparisons work.
    const chalkHasColors = currentChalkLevel() > 0
    const colorLevel = chalkHasColors ? ("truecolor" as const) : null
    const term = createTerm({
      stdout: stdout as any,
      color: colorLevel,
    })
    const plain = term.hasColor() === null

    let unmounted = false
    let exitResolve: (() => void) | null = null
    let exitReject: ((error: Error) => void) | null = null
    const exitPromise = new Promise<void>((resolve, reject) => {
      exitResolve = resolve
      exitReject = reject
    })

    // Set up input event emitter for stdin handling
    const inputEmitter = new EventEmitter()
    inputEmitter.setMaxListeners(100)

    // Build runtime context for useApp/useInput
    const runtimeCtx: RuntimeContextValue = {
      on(event: string, handler: (...args: any[]) => void) {
        if (event === "input") {
          const wrapped = (data: string | Buffer) => {
            const [input, key] = parseKey(data)
            ;(handler as (input: string, key: any) => void)(input, key)
          }
          inputEmitter.on("input", wrapped)
          return () => {
            inputEmitter.removeListener("input", wrapped)
          }
        }
        if (event === "paste") {
          inputEmitter.on("paste", handler)
          return () => {
            inputEmitter.removeListener("paste", handler)
          }
        }
        return () => {}
      },
      emit() {},
      exit: (error?: Error) => {
        if (unmounted) return
        unmounted = true
        if (error) {
          exitReject?.(error)
        } else {
          exitResolve?.()
        }
      },
    }

    // Build stdout context
    const stdoutCtx: StdoutContextValue = {
      stdout,
      write: (data: string) => stdout.write(data),
    }

    // Set up stdin input handling if stdin is provided.
    // After emitting input, we flush React work and re-render the pipeline
    // so that state changes from input (e.g., focus changes from Tab)
    // produce visible output before the next test assertion.
    if (stdin) {
      const onReadable = () => {
        let chunk: string | null
        while ((chunk = (stdin as any).read?.()) !== null && chunk !== undefined) {
          inputEmitter.emit("input", chunk)
        }
        // After input is processed, schedule a flush + re-render.
        // Use queueMicrotask to batch multiple chunks in one render.
        if (!renderScheduled && !unmounted) {
          renderScheduled = true
          queueMicrotask(() => {
            renderScheduled = false
            if (!unmounted) {
              flushAndRenderPipeline()
            }
          })
        }
      }
      stdin.on("readable", onReadable)
    }

    // Wrap element with contexts for useApp/useInput/useStdout/useFocus
    let lastRenderError: Error | null = null

    function wrapElement(el: import("react").ReactNode): import("react").ReactNode {
      // Wrap user element in error boundary to catch render errors
      let wrapped: import("react").ReactNode = React.createElement(
        InkErrorBoundary,
        {
          onError: (error: Error) => {
            lastRenderError = error
          },
        },
        el,
      )
      // Ink-compatible focus system with tab navigation via inputEmitter
      wrapped = React.createElement(InkFocusProvider, { inputEmitter }, wrapped)
      wrapped = React.createElement(TermContext.Provider, { value: term }, wrapped)
      wrapped = React.createElement(StdoutContext.Provider, { value: stdoutCtx }, wrapped)
      wrapped = React.createElement(RuntimeContext.Provider, { value: runtimeCtx }, wrapped)
      return wrapped
    }

    // --- Persistent React tree for state preservation across rerenders ---
    // Instead of calling renderStringSync (which creates/destroys the tree each time),
    // we create the container and fiberRoot ONCE and update them on rerender.
    let hadReactCommit = false
    let renderScheduled = false
    const container = createContainer(() => {
      hadReactCommit = true
      // Schedule a re-render when React commits new work (e.g., from state changes)
      if (!renderScheduled && !unmounted) {
        renderScheduled = true
        queueMicrotask(() => {
          renderScheduled = false
          if (!unmounted) {
            flushAndRenderPipeline()
          }
        })
      }
    })
    const fiberRoot = stringReconciler.createContainer(
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

    /**
     * Run a function with IS_REACT_ACT_ENVIRONMENT temporarily set to true.
     * Ensures act() captures forceUpdate/setState from layout notifications.
     */
    function withActEnv(fn: () => void): void {
      const prev = (globalThis as any).IS_REACT_ACT_ENVIRONMENT
      ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
      try {
        fn()
      } finally {
        ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = prev
      }
    }

    /**
     * Run the render pipeline and write output to stdout.
     * Does NOT update the React tree — assumes it's already up to date.
     */
    function flushAndRenderPipeline(): string {
      const width = (stdout as any).columns ?? 80
      const bufferHeight = (stdout as any).rows ?? 24

      // Layout stabilization loop.
      // We interleave layout passes with React work flushes. The key ordering is:
      //   1. Flush React work (commit pending state updates)
      //   2. Run layout (executeRender — computes contentRect for all nodes)
      //   3. Flush React work again (run effects that depend on layout data,
      //      e.g., measureElement in useEffect/useLayoutEffect)
      //   4. If new commits happened, loop
      //
      // This matches Ink's behavior where Yoga runs layout synchronously during
      // React commit, so effects always see computed layout. silvery computes
      // layout in a separate pipeline pass, so we flush effects after layout.
      let buffer!: TerminalBuffer
      let rootNode: ReturnType<typeof getContainerRoot> | undefined
      const MAX_ITERATIONS = 5
      for (let i = 0; i < MAX_ITERATIONS; i++) {
        hadReactCommit = false
        withActEnv(() => {
          // Step 1: Flush any pending React work (commits tree, may run some effects)
          act(() => {
            stringReconciler.flushSyncWork()
          })

          // Step 2: Run layout pipeline (executeRender computes contentRect)
          act(() => {
            const root = getContainerRoot(container)
            rootNode = root
            const result = executeRender(root, width, bufferHeight, null, undefined, undefined)
            buffer = result.buffer
          })

          // Step 3: Flush React work again to process effects that depend on
          // layout data (e.g., useEffect calling measureElement after contentRect
          // is populated). Also processes state updates from layout subscribers.
          if (!hadReactCommit) {
            act(() => {
              stringReconciler.flushSyncWork()
            })
          }
        })
        if (!hadReactCommit) break
      }

      // Get content height from root node layout
      const layoutContentHeight = rootNode?.contentRect?.height ?? 0

      // Convert buffer to string
      let output = plain
        ? bufferToText(buffer, { trimTrailingWhitespace: true, trimEmptyLines: false })
        : bufferToStyledText(buffer, { trimTrailingWhitespace: true, trimEmptyLines: false })

      // Strip VS16 variation selectors that silvery adds for text-presentation emoji.
      // Silvery's ensureEmojiPresentation adds VS16 to Extended_Pictographic chars
      // that are NOT Emoji_Presentation (e.g., ✔ U+2714). Ink doesn't do this.
      // Only strip VS16 after such chars — keep VS16 in user content (e.g., 🌡️, ⚠️).
      output = stripSilveryVS16(output)

      // Trim buffer padding rows using layout content height
      if (layoutContentHeight > 0 && layoutContentHeight < bufferHeight) {
        const lines = output.split("\n")
        output = lines.slice(0, layoutContentHeight).join("\n")
      } else {
        // Fall back: strip trailing empty lines
        const lines = output.split("\n")
        while (lines.length > 0 && lines[lines.length - 1] === "") {
          lines.pop()
        }
        output = lines.join("\n")
      }
      const result = plain ? output : toChalkCompat(output)
      stdout.write(result)
      return result
    }

    /**
     * Render a frame: update the React tree with a new element, then run the pipeline.
     */
    function renderFrame(el: import("react").ReactNode): string {
      const wrapped = wrapElement(el)

      // Update the React tree (or mount initially)
      withActEnv(() => {
        act(() => {
          stringReconciler.updateContainerSync(wrapped, fiberRoot, null, null)
          stringReconciler.flushSyncWork()
        })
      })

      return flushAndRenderPipeline()
    }

    // Initial render
    let currentElement = element
    renderFrame(currentElement)

    // If an error was caught during render, reject the exit promise
    if (lastRenderError) {
      exitReject?.(lastRenderError)
      // Prevent unhandled rejection by catching the promise
      exitPromise.catch(() => {})
    }

    // Listen for resize events on stdout to re-render (like Ink does)
    const onResize = () => {
      if (!unmounted) {
        renderFrame(currentElement)
      }
    }
    stdout.on("resize", onResize)

    // Build instance with working rerender
    const instance: InkInstance = {
      rerender: (newElement: import("react").ReactNode) => {
        if (unmounted) return
        currentElement = newElement
        renderFrame(newElement)
      },
      unmount: () => {
        if (unmounted) return
        unmounted = true
        stdout.off("resize", onResize)
        // Unmount the React tree
        withActEnv(() => {
          act(() => {
            stringReconciler.updateContainerSync(null, fiberRoot, null, null)
            stringReconciler.flushSyncWork()
          })
        })
        exitResolve?.()
      },
      [Symbol.dispose]() {
        instance.unmount()
      },
      waitUntilExit: () => exitPromise,
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

  // Interactive mode (real terminal): use renderSync with Ink-compatible defaults
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
  const termDef: Record<string, unknown> = {
    stdout: stdout ?? process.stdout,
    stdin: stdin ?? process.stdin,
  }

  const silveryInstance = renderSync(element as any, termDef as any, inkOptions as any)

  // Wrap with Ink-specific methods
  const instance: InkInstance = {
    ...silveryInstance,
    waitUntilRenderFlush: () => Promise.resolve(),
    cleanup: () => {
      silveryInstance.unmount()
    },
  }
  return instance
}

import { measureElement as baseMeasureElement } from "@silvery/react/measureElement"
import { calculateLayout } from "@silvery/react/reconciler/nodes"
export type { MeasureElementOutput } from "@silvery/react/measureElement"

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
 * layout on demand when contentRect is stale or hasn't been set yet.
 *
 * This bridges the timing gap between Ink (Yoga runs during commit, so
 * effects see layout) and silvery (layout runs in a separate pipeline pass).
 */
export function measureElement(nodeOrHandle: any): import("@silvery/react/measureElement").MeasureElementOutput {
  // Resolve BoxHandle → TeaNode
  const node = (typeof nodeOrHandle?.getNode === "function") ? nodeOrHandle.getNode() : nodeOrHandle
  if (!node) return { width: 0, height: 0 }

  // If contentRect exists AND layout is not stale, use cached values
  if (node.contentRect && !needsLayoutRecalculation(node)) {
    return baseMeasureElement(node)
  }

  // contentRect is null or layout is dirty — walk up to root and
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

/**
 * Ink-compatible useStderr hook.
 */
export function useStderr() {
  return {
    stderr: process.stderr,
    write: (data: string) => {
      process.stderr.write(data)
    },
  }
}

// =============================================================================
// renderToString (Ink-compatible)
// =============================================================================

import { renderStringSync } from "@silvery/react/render-string"
import { isLayoutEngineInitialized, setLayoutEngine } from "@silvery/term/layout-engine"
import { createFlexilyZeroEngine } from "@silvery/term/adapters/flexily-zero-adapter"

/**
 * Ink-compatible renderToString.
 * Maps ink's `renderToString(element, { columns })` to silvery's `renderStringSync`.
 * Automatically initializes the layout engine if needed (using sync flexily).
 */
export function renderToString(node: import("react").ReactNode, options?: { columns?: number }): string {
  if (!isLayoutEngineInitialized()) {
    setLayoutEngine(createFlexilyZeroEngine())
  }
  // Sync color detection with chalk: tests may set chalk.level = 3 programmatically
  // even when FORCE_COLOR=0, so we must respect chalk's runtime level
  const chalkHasColors = currentChalkLevel() > 0
  const colorLevel = chalkHasColors ? ("truecolor" as const) : null
  const term = createTerm({ color: colorLevel })
  const plain = term.hasColor() === null
  const wrapped = React.createElement(TermContext.Provider, { value: term }, node)
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
    // Fall back: strip trailing empty lines (content height unknown)
    const lines = output.split("\n")
    while (lines.length > 0 && lines[lines.length - 1] === "") {
      lines.pop()
    }
    output = lines.join("\n")
  }
  // If result is only whitespace/newlines (empty fragment), return empty string
  if (output.trim() === "") {
    return ""
  }
  return plain ? output : toChalkCompat(output)
}

// =============================================================================
// Types (Ink-compatible)
// =============================================================================

/**
 * Ink DOMElement type stub. Ink tests reference this for ref typing.
 */
export type DOMElement = any

// =============================================================================
// Term primitives (so consumers don't need ansi directly)
// =============================================================================

export { createTerm, term } from "@silvery/term/ansi"
export type { Term } from "@silvery/term/ansi"
