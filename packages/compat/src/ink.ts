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

import React, {
  createContext,
  useContext,
  useCallback,
  useState,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
} from "react"
import { StdoutContext, StderrContext, TermContext } from "@silvery/react/context"
import { bufferToStyledText, bufferToText, type TerminalBuffer } from "@silvery/term/buffer"
import { stripAnsi } from "@silvery/term/unicode"
import { tokenizeAnsi as tokenizeAnsiEsc, createColonSGRTracker } from "@silvery/term/ansi-sanitize"
import { createTerm } from "@silvery/term/ansi"
import chalk from "chalk"
import { createCursorStore, CursorProvider, type CursorStore } from "@silvery/react/hooks/useCursor"
import { SilveryErrorBoundary } from "@silvery/react/error-boundary"
import { InkCursorStoreCtx } from "./with-ink-cursor"
import { InkFocusContext, InkFocusProvider } from "./with-ink-focus"
import { useInput as silveryUseInput } from "@silvery/react/hooks/useInput"
import { RuntimeContext } from "@silvery/react/context"
import EventEmitter from "node:events"
import { renderScreenReaderOutput } from "@silvery/react/accessibility"
import { Buffer } from "node:buffer"
import { enableKittyKeyboard, disableKittyKeyboard, queryKittyKeyboard, KittyFlags } from "@silvery/term"

// =============================================================================
// Error boundary: uses SilveryErrorBoundary from @silvery/react (rich display with
// source excerpts, stack traces). The compat layer's InkErrorBoundary was merged upstream.

/**
 * Get chalk's current color level at render time.
 * Tests may set chalk.level programmatically (e.g., chalk.level = 3 for
 * background color tests). We sync our renderer's color behavior with chalk.
 */
/** @internal */
export function currentChalkLevel(): number {
  return chalk?.level ?? 0
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

/** @internal */
export function stripSilveryVS16(input: string): string {
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
import { Static as SilveryStatic } from "@silvery/react/components/Static"
export type { BoxHandle } from "@silvery/react/components/Box"

/**
 * Ink-compatible Box props. Same as silvery's BoxProps.
 */
export type BoxProps = SilveryBoxProps

/**
 * Ink-compatible Box component.
 *
 * Wraps silvery's Box with Ink's default flex properties:
 * - flexGrow: 0
 * - flexShrink: 1
 * - flexWrap: 'nowrap'
 *
 * These match Ink's Box.tsx line 83-88 defaults. User-provided props override.
 * flexDirection defaults to 'row' to match Ink's behavior (Ink Box.tsx line 85).
 */
export const Box = React.forwardRef<BoxHandle, BoxProps>(function InkBox(props, ref) {
  // When chalk has no color support, strip visual style props to match Ink behavior.
  // Ink uses chalk internally for border/background colors, so chalk.level=0 means
  // no styles are applied. But embedded ANSI in text content is still preserved.
  const hasColors = currentChalkLevel() > 0
  return React.createElement(SilveryBox, {
    flexDirection: "row",
    flexGrow: 0,
    flexShrink: 1,
    ...props,
    color: hasColors ? (props as any).color : undefined,
    backgroundColor: hasColors ? (props as any).backgroundColor : undefined,
    borderColor: hasColors ? (props as any).borderColor : undefined,
    borderDimColor: hasColors ? (props as any).borderDimColor : undefined,
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
  // When chalk has no color support (FORCE_COLOR=0), strip style props to match
  // Ink behavior. Ink uses chalk to apply styles, so chalk.level=0 means no
  // styles are applied. But embedded ANSI sequences in text content are preserved.
  const hasColors = currentChalkLevel() > 0
  const passProps = hasColors
    ? {
        ...props,
        color: props.color,
        backgroundColor: props.backgroundColor,
        ref,
        children: sanitizedChildren,
      }
    : {
        // Only pass layout-affecting props, not visual style props
        wrap: props.wrap,
        ref,
        children: sanitizedChildren,
      }
  return React.createElement(SilveryText, passProps)
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
export { Transform } from "@silvery/react/components/Transform"
export type { TransformProps } from "@silvery/react/components/Transform"

// =============================================================================
// Ink-Compatible Static Component
// =============================================================================

/**
 * Store for tracking Static component output.
 * Ink renders static content separately from dynamic content:
 * - Static output is accumulated across renders (fullStaticOutput)
 * - In debug mode, each frame writes fullStaticOutput + dynamicOutput
 * - Static output always gets a trailing \n appended
 */
interface InkStaticStore {
  /** All rendered static items as text lines */
  renderedCount: number
  /** Accumulated full static output (grows with each new item) */
  fullStaticOutput: string
}

const InkStaticStoreCtx = createContext<InkStaticStore | null>(null)

/**
 * Extract plain text from a React element tree.
 * Used to convert Static item render output to text without going through
 * the full silvery render pipeline.
 */
function extractTextFromElement(node: React.ReactNode): string {
  if (node == null || typeof node === "boolean") return ""
  if (typeof node === "string") return node
  if (typeof node === "number") return String(node)
  if (Array.isArray(node)) return node.map(extractTextFromElement).join("")
  if (React.isValidElement(node)) {
    const props = node.props as Record<string, any>
    return extractTextFromElement(props.children)
  }
  return ""
}

/**
 * Ink-compatible Static component for the compat layer.
 *
 * Renders nothing to the tree (returns null). Instead, converts items to text
 * and stores them in the InkStaticStore context. The render/writeFrame functions
 * read the store and prepend static output to the frame.
 *
 * This matches Ink's behavior where Static content is rendered separately
 * and placed above the dynamic content.
 */
export function Static<T>({
  items,
  children: renderItem,
  style,
}: {
  items: T[]
  children: (item: T, index: number) => React.ReactNode
  style?: Record<string, any>
}): React.ReactElement | null {
  const store = useContext(InkStaticStoreCtx)

  // When no static store is available (e.g., called outside the compat render()),
  // delegate to silvery's native Static component which handles both inline
  // (scrollback promotion) and fullscreen (render in tree) modes.
  if (!store) {
    return React.createElement(SilveryStatic, { items, children: renderItem, style })
  }

  // Compute new items since last render
  if (items.length > store.renderedCount) {
    // Strip any previous padding suffix before appending new items
    const paddingBottom = (style?.paddingBottom as number) ?? 0
    if (paddingBottom > 0 && store.fullStaticOutput.length > 0) {
      // Remove trailing padding that was added in a previous render
      const paddingSuffix = "\n".repeat(paddingBottom)
      if (store.fullStaticOutput.endsWith(paddingSuffix)) {
        store.fullStaticOutput = store.fullStaticOutput.slice(0, -paddingSuffix.length)
      }
    }

    const newItems = items.slice(store.renderedCount)
    const newLines = newItems.map((item, i) => {
      const element = renderItem(item, store.renderedCount + i)
      return extractTextFromElement(element)
    })
    // Each item is on its own line, static output gets trailing \n from Ink's renderer
    const newStaticOutput = newLines.join("\n") + "\n"
    store.fullStaticOutput += newStaticOutput
    store.renderedCount = items.length

    // Apply paddingBottom from style — adds extra blank lines after items
    if (paddingBottom > 0) {
      store.fullStaticOutput += "\n".repeat(paddingBottom)
    }
  }

  // Return null — Static content is handled outside the normal render tree
  return null
}

// =============================================================================
// Hooks (Ink-compatible)
// =============================================================================

// Silvery's Key type now uses string eventType ("press" | "repeat" | "release"),
// matching Ink's convention — no wrapper needed, just re-export.
export { useInput, type Key, type InputHandler, type UseInputOptions } from "@silvery/react/hooks/useInput"

export { useApp } from "@silvery/react/hooks/useApp"
export type { UseAppResult } from "@silvery/react/hooks/useApp"

export { useStdout } from "@silvery/react/hooks/useStdout"
export type { UseStdoutResult } from "@silvery/react/hooks/useStdout"

// =============================================================================
// Ink-compatible Focus Hooks
// =============================================================================

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

export type UseFocusOptions = { isActive?: boolean; autoFocus?: boolean; id?: string }
export type UseFocusResult = { isFocused: boolean; focus: (id: string) => void }
export type InkUseFocusManagerResult = ReturnType<typeof useFocusManager>

// =============================================================================
// Ink-compatible useStdin with raw mode tracking
// =============================================================================

/**
 * Context for per-instance stdin management.
 * Tracks raw mode reference counting and stdin ref/unref.
 */
interface InkStdinState {
  stdin: NodeJS.ReadStream
  isRawModeSupported: boolean
  /** Number of active raw mode subscribers */
  rawModeCount: number
  setRawMode: (value: boolean) => void
  setBracketedPasteMode: (value: boolean) => void
  internal_eventEmitter: EventEmitter
}

const InkStdinCtx = createContext<InkStdinState>({
  stdin: process.stdin,
  isRawModeSupported: process.stdin.isTTY ?? false,
  rawModeCount: 0,
  setRawMode: () => {},
  setBracketedPasteMode: () => {},
  internal_eventEmitter: new EventEmitter(),
})

/**
 * Create stdin state for a render instance.
 * Implements raw mode reference counting:
 * - First subscriber enables raw mode + refs stdin
 * - Last subscriber disables raw mode + unrefs stdin
 * - Throws if raw mode is not supported (stdin.isTTY is false)
 */
function createInkStdinState(stdin: NodeJS.ReadStream, stdout?: NodeJS.WriteStream): InkStdinState {
  const isRawModeSupported = stdin.isTTY ?? false
  let rawModeCount = 0
  let bracketedPasteModeEnabledCount = 0
  const internal_eventEmitter = new EventEmitter()
  internal_eventEmitter.setMaxListeners(Infinity)

  const setRawMode = (value: boolean) => {
    if (!isRawModeSupported) {
      throw new Error(
        "Raw mode is not supported on the current process.stdin, which Ink uses as input stream by default.\nRead about how to prevent this error on https://github.com/vadimdemedes/ink/#nested-ink-rendering",
      )
    }

    if (value) {
      rawModeCount++
      if (rawModeCount === 1) {
        // First subscriber: enable raw mode and ref stdin
        if (stdin.setRawMode) stdin.setRawMode(true)
        if (stdin.ref) stdin.ref()
      }
    } else {
      rawModeCount = Math.max(0, rawModeCount - 1)
      if (rawModeCount === 0) {
        // Last subscriber: disable raw mode and unref stdin
        if (stdin.setRawMode) stdin.setRawMode(false)
        if (stdin.unref) stdin.unref()
      }
    }
  }

  const setBracketedPasteMode = (value: boolean) => {
    const out = stdout ?? process.stdout
    if (!(out as any).isTTY) return

    if (value) {
      if (bracketedPasteModeEnabledCount === 0) {
        out.write("\x1b[?2004h")
      }
      bracketedPasteModeEnabledCount++
    } else {
      if (bracketedPasteModeEnabledCount === 0) return
      if (--bracketedPasteModeEnabledCount === 0) {
        out.write("\x1b[?2004l")
      }
    }
  }

  return {
    stdin,
    isRawModeSupported,
    rawModeCount: 0,
    setRawMode,
    setBracketedPasteMode,
    internal_eventEmitter,
  }
}

/**
 * Ink-compatible useStdin hook.
 * Returns stdin stream and raw mode controls.
 */
export function useStdin() {
  const ctx = useContext(InkStdinCtx)
  return {
    stdin: ctx.stdin,
    setRawMode: ctx.setRawMode,
    isRawModeSupported: ctx.isRawModeSupported,
  }
}

/**
 * Ink-compatible usePaste hook.
 *
 * Enables bracketed paste mode and calls the handler when the user pastes text.
 * Paste content is delivered as a single string, not forwarded to useInput handlers.
 */
export function usePaste(handler: (text: string) => void, options: { isActive?: boolean } = {}): void {
  const ctx = useContext(InkStdinCtx)
  const rt = useContext(RuntimeContext)

  useEffect(() => {
    if (options.isActive === false) return
    ctx.setRawMode(true)
    ctx.setBracketedPasteMode(true)
    return () => {
      ctx.setRawMode(false)
      ctx.setBracketedPasteMode(false)
    }
  }, [options.isActive, ctx.setRawMode, ctx.setBracketedPasteMode])

  // Subscribe to paste events from silvery's RuntimeContext (interactive path)
  useEffect(() => {
    if (options.isActive === false) return
    if (!rt) return
    return rt.on("paste", (text: string) => {
      handler(text)
    })
  }, [options.isActive, rt, handler])

  // Subscribe to paste events from InkStdinCtx (test renderer path)
  useEffect(() => {
    if (options.isActive === false) return
    const handlePaste = (text: string) => {
      handler(text)
    }
    ctx.internal_eventEmitter.on("paste", handlePaste)
    return () => {
      ctx.internal_eventEmitter.removeListener("paste", handlePaste)
    }
  }, [options.isActive, ctx.internal_eventEmitter, handler])
}

/**
 * Ink-compatible useCursor hook.
 *
 * Bridges Ink's imperative `setCursorPosition({ x, y })` API to silvery's
 * cursor store. Writes directly to the per-instance CursorStore rather than
 * going through silvery's useCursor hook (which needs NodeContext for layout
 * coordinate translation — unnecessary here since Ink provides absolute coords).
 *
 * On unmount, clears cursor state (hides cursor).
 */
export function useCursor() {
  const store = useContext(InkCursorStoreCtx)

  // Buffer for render-phase setCursorPosition calls.
  // Applied in useLayoutEffect (after commit) to prevent cursor state from
  // leaking when a component renders but doesn't commit (e.g., Suspense).
  const pendingRef = useRef<{ x: number; y: number } | null | undefined>(undefined)

  // Apply buffered cursor state after commit, clear on unmount.
  // No deps array: runs every render to pick up position changes from render phase.
  useLayoutEffect(() => {
    if (store && pendingRef.current !== undefined) {
      const pos = pendingRef.current
      if (pos) {
        store.setCursorState({ x: pos.x, y: pos.y, visible: true })
      } else {
        store.setCursorState(null)
      }
    }
    return () => {
      store?.setCursorState(null)
    }
  })

  const setCursorPosition = useCallback(
    (position: { x: number; y: number } | undefined) => {
      if (!store) return
      // Buffer the position — applied in useLayoutEffect after React commits
      pendingRef.current = position ?? null
    },
    [store],
  )

  return { setCursorPosition }
}

/**
 * Ink-compatible useWindowSize hook.
 * Re-exported from @silvery/react.
 */
export { useWindowSize } from "@silvery/react/hooks/useWindowSize"

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
  return (
    a.width === b.width &&
    a.height === b.height &&
    a.left === b.left &&
    a.top === b.top &&
    a.hasMeasured === b.hasMeasured
  )
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

// ANSI sanitization — delegates to silvery's tokenizer and colon-format SGR tracker.

// =============================================================================
// Colon-format SGR tracking (delegated to @silvery/term)
// =============================================================================

/**
 * Module-level colon-format SGR tracker.
 * Populated by sanitizeAnsi when it encounters colon-separated SGR (e.g., 38:2::R:G:B).
 * Consumed by restoreColonFormatSGR to convert semicolon output back to colon format.
 *
 * This is safe because rendering is synchronous: sanitize → render → output in one call.
 */
const colonSGRTracker = createColonSGRTracker()

/**
 * Restore colon-format SGR sequences in output.
 * Replaces semicolon-format sequences that were originally colon-format.
 *
 * Note: does NOT clear the tracker — the render() path may call
 * processBuffer multiple times (handleBufferReady + writeFrame), and each
 * call needs access to the same replacements. Replacements are naturally
 * replaced when sanitizeAnsi re-populates them on the next render cycle.
 */
export function restoreColonFormatSGR(output: string): string {
  return colonSGRTracker.restore(output)
}

/**
 * Sanitize ANSI sequences in text content using silvery's tokenizer.
 *
 * Preserves SGR (colors/styles) and OSC 8 hyperlinks.
 * Strips cursor movement, screen clearing, non-hyperlink OSC, DCS, PM, APC, SOS, C1 controls.
 * Also tracks colon-format SGR for round-trip restoration via restoreColonFormatSGR().
 */
function sanitizeAnsi(text: string): string {
  if (text.length === 0) return ""

  const tokens = tokenizeAnsiEsc(text)
  let result = ""

  for (const token of tokens) {
    switch (token.type) {
      case "text":
        result += token.value
        break
      case "csi":
        // Only keep SGR sequences: final byte 'm', no intermediate bytes,
        // no private-use parameter prefixes (<, =, >, ?)
        if (isCompatCSISGR(token.value)) {
          result += token.value
          colonSGRTracker.register(token.value)
        }
        break
      case "osc":
        // Only keep properly terminated OSC 8 (hyperlinks).
        // Strip unterminated OSC (no BEL/ST terminator) to prevent payload leaks.
        if (isOSC8(token.value) && isOSCTerminated(token.value)) {
          result += token.value
        }
        break
      // Strip everything else: esc, dcs, pm, apc, sos, c1
    }
  }

  return result
}

/**
 * Check if a CSI sequence is a proper SGR (Select Graphic Rendition).
 *
 * SGR sequences have the form: CSI <params> m
 * where params contain only digits (0-9), semicolons (;), and colons (:).
 * Private-use parameter prefixes (<, =, >, ?) indicate non-SGR.
 * Intermediate bytes (space, !, etc.) indicate non-SGR.
 */
function isCompatCSISGR(value: string): boolean {
  // Must end with 'm'
  if (value.length < 2 || value.charCodeAt(value.length - 1) !== 0x6d) {
    return false
  }
  // Find start of parameters (skip ESC[ or C1 CSI 0x9B)
  const start = value.charCodeAt(0) === 0x1b ? 2 : 1
  // Everything between start and final 'm' must be digits/semicolons/colons only
  for (let i = start; i < value.length - 1; i++) {
    const c = value.charCodeAt(i)
    // Allow: digits 0-9 (0x30-0x39), colon (0x3A), semicolon (0x3B)
    // Reject: < = > ? (0x3C-0x3F) — private-use prefixes
    // Reject: anything outside 0x30-0x3B (intermediates, etc.)
    if (c < 0x30 || c > 0x3b) {
      return false
    }
  }
  return true
}

/** Check if an OSC sequence is properly terminated (BEL or ST). */
function isOSCTerminated(value: string): boolean {
  if (value.length === 0) return false
  const last = value.charCodeAt(value.length - 1)
  // BEL terminator (0x07)
  if (last === 0x07) return true
  // C1 ST terminator (0x9C)
  if (last === 0x9c) return true
  // 7-bit ST: ESC + '\' — check last two chars
  if (value.length >= 2 && last === 0x5c && value.charCodeAt(value.length - 2) === 0x1b) {
    return true
  }
  return false
}

/** Check if an OSC token is OSC 8 (hyperlink). */
function isOSC8(value: string): boolean {
  // OSC 8 starts with ESC]8; or \x9D8;
  if (value.charCodeAt(0) === 0x1b) {
    // ESC ] 8 ;
    return value.charCodeAt(2) === 0x38 && value.charCodeAt(3) === 0x3b
  }
  // C1 OSC: \x9D 8 ;
  return value.charCodeAt(1) === 0x38 && value.charCodeAt(2) === 0x3b
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
import { render as silveryTestRender } from "@silvery/term/renderer"
import { setInkStrictValidation } from "@silvery/react/reconciler/host-config"
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
    // Always render with color (plain=false) so that embedded ANSI sequences in
    // text children are preserved. Ink preserves embedded ANSI even when chalk has
    // no color support. The Text component already strips style props when chalk
    // has no colors, so only chalk-applied styles are affected.
    const plain = false

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

    // Per-instance stdin state for raw mode tracking and paste event bridging
    const stdinState = createInkStdinState((stdin ?? process.stdin) as NodeJS.ReadStream, stdout)

    // Kitty keyboard protocol support (test renderer path)
    const kittyManager = createKittyManager(
      (stdin ?? process.stdin) as NodeJS.ReadStream,
      stdout,
      options?.kittyKeyboard as KittyKeyboardOptions | undefined,
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
     */
    function processBuffer(buffer: TerminalBuffer): string {
      // Always use bufferToStyledText (even in plain mode) so that getContentEdge()
      // can detect styled trailing spaces (e.g., `chalk.red(' ERROR ')`) and not
      // trim them. If plain mode, strip ANSI codes after trimming.
      let output = bufferToStyledText(buffer, { trimTrailingWhitespace: true, trimEmptyLines: true })
      output = stripSilveryVS16(output)
      // Restore colon-format SGR sequences that were registered during sanitization.
      // silvery's pipeline converts colon-format (38:2::R:G:B) to semicolon-format
      // (38;2;R;G;B) during rendering. This converts them back to match Ink's behavior.
      output = restoreColonFormatSGR(output)
      return plain ? stripAnsi(output) : output
    }

    /**
     * Flush any deferred debug writes (queued before the first frame was ready).
     * Called from writeFrame once lastOutput is available.
     */
    function flushPendingDebugWrites(): void {
      if (pendingDebugWrites.length === 0) return
      const pending = pendingDebugWrites
      pendingDebugWrites = []
      for (const { target, data } of pending) {
        if (target === "stdout") {
          stdout.write(data + lastOutput)
        } else {
          const stderrTarget = stderr ?? process.stderr
          stderrTarget.write(data)
          stdout.write(lastOutput)
        }
      }
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
     * In debug mode, appends the latest frame after the data.
     * In non-debug mode, just writes the data directly.
     * If no frame is available yet (initial mount effects), queues for deferred write.
     */
    function writeToStdout(data: string): void {
      if (debug) {
        if (lastOutput) {
          stdout.write(data + lastOutput)
        } else {
          pendingDebugWrites.push({ target: "stdout", data })
        }
      } else {
        stdout.write(data)
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
                    React.createElement(InkFocusProvider, null, React.createElement(InkFocusBridge, null, el)),
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
    function handleBufferReady(_frame: string, buffer: TerminalBuffer): void {
      let result = processBuffer(buffer)
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
    function writeFrame(_frame: string, buffer: TerminalBuffer): void {
      // Suppress output after alternate screen exit to prevent replay on primary screen
      if (altScreenExited) return

      let result = processBuffer(buffer)

      // Prepend accumulated static output (Ink writes fullStaticOutput + dynamicOutput in debug mode)
      if (staticStore.fullStaticOutput) {
        result = staticStore.fullStaticOutput + result
      }

      // Update lastOutput and flush deferred debug writes
      lastOutput = result
      flushPendingDebugWrites()

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
    const app = silveryTestRender(element as import("react").ReactElement, {
      cols: (stdout as any).columns ?? 80,
      rows: (stdout as any).rows ?? 24,
      autoRender: true,
      onFrame: writeFrame,
      onBufferReady: handleBufferReady,
      wrapRoot: wrapWithInkProviders,
      stdin: stdin as NodeJS.ReadStream | undefined,
    })

    // Listen for resize events on stdout
    const onResize = () => {
      app.resize((stdout as any).columns ?? 80, (stdout as any).rows ?? 24)
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
    options?.kittyKeyboard as KittyKeyboardOptions | undefined,
  )

  // Wrap element with InkStdinCtx.Provider so usePaste can access setBracketedPasteMode
  const wrappedElement = React.createElement(InkStdinCtx.Provider, { value: interactiveStdinState }, element)

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
  const node = typeof nodeOrHandle?.getNode === "function" ? nodeOrHandle.getNode() : nodeOrHandle
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

// =============================================================================
// Ink Stderr — re-exported from silvery core
// =============================================================================

export { useStderr } from "@silvery/react/hooks/useStderr"

// =============================================================================
// renderToString (Ink-compatible)
// =============================================================================

import { renderStringSync } from "@silvery/react/render-string"
import { isLayoutEngineInitialized, setLayoutEngine, ensureDefaultLayoutEngine } from "@silvery/term/layout-engine"
import { createFlexilyZeroEngine } from "@silvery/term/adapters/flexily-zero-adapter"

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
// Screen Reader Mode (ARIA-based text rendering)
// =============================================================================

// Moved to @silvery/react/accessibility

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

// =============================================================================
// Kitty Keyboard Protocol — delegates to @silvery/term
// =============================================================================

/**
 * Kitty keyboard protocol flags (Ink-compatible names).
 * Delegates to KittyFlags from @silvery/term.
 * @see https://sw.kovidgoyal.net/kitty/keyboard-protocol/
 */
export const kittyFlags = {
  disambiguateEscapeCodes: KittyFlags.DISAMBIGUATE,
  reportEventTypes: KittyFlags.REPORT_EVENTS,
  reportAlternateKeys: KittyFlags.REPORT_ALTERNATE,
  reportAllKeysAsEscapeCodes: KittyFlags.REPORT_ALL_KEYS,
  reportAssociatedText: KittyFlags.REPORT_TEXT,
} as const

/** Valid flag names for the kitty keyboard protocol. */
export type KittyFlagName = keyof typeof kittyFlags

/** Converts an array of flag names to the corresponding bitmask value. */
export function resolveFlags(flags: KittyFlagName[]): number {
  let result = 0
  for (const flag of flags) {
    result |= kittyFlags[flag]
  }
  return result
}

/**
 * Kitty keyboard modifier bits.
 * Used in the modifier parameter of CSI u sequences.
 * Note: The actual modifier value is (modifiers - 1) as per the protocol.
 */
export const kittyModifiers = {
  shift: 1,
  alt: 2,
  ctrl: 4,
  super: 8,
  hyper: 16,
  meta: 32,
  capsLock: 64,
  numLock: 128,
} as const

/** Options for configuring kitty keyboard protocol. */
export type KittyKeyboardOptions = {
  mode?: "auto" | "enabled" | "disabled"
  flags?: KittyFlagName[]
}

// =============================================================================
// Kitty Protocol Manager — shared by renderSync and render paths
// =============================================================================

/** Regex to match a Kitty keyboard query response: CSI ? <digits> u */
const KITTY_RESPONSE_RE = /\x1b\[\?(\d+)u/

interface KittyManager {
  enabled: boolean
  cleanup(): void
}

/**
 * Create a kitty protocol manager that handles setup and teardown.
 * Used by both renderSync (test renderer) and render (interactive) paths.
 *
 * Supports three modes:
 * - "enabled": enable immediately if stdin/stdout are TTYs
 * - "auto": probe the terminal for support, enable if detected
 * - "disabled" / undefined: do nothing
 */
function createKittyManager(
  stdin: NodeJS.ReadStream,
  stdout: NodeJS.WriteStream,
  opts: KittyKeyboardOptions | undefined,
): KittyManager {
  let enabled = false
  let cancelDetection: (() => void) | undefined

  function enable(flagBitmask: number): void {
    stdout.write(enableKittyKeyboard(flagBitmask))
    enabled = true
  }

  if (opts) {
    const mode = opts.mode ?? "auto"
    const flagBitmask = resolveFlags(opts.flags ?? ["disambiguateEscapeCodes"])
    const isTTY = (stdin as any)?.isTTY && (stdout as any)?.isTTY

    if (isTTY) {
      if (mode === "enabled") {
        enable(flagBitmask)
      } else if (mode === "auto") {
        cancelDetection = initKittyAutoDetection(stdin, stdout, flagBitmask, enable)
      }
    }
  }

  return {
    get enabled() {
      return enabled
    },
    cleanup() {
      if (cancelDetection) {
        cancelDetection()
        cancelDetection = undefined
      }
      if (enabled) {
        stdout.write(disableKittyKeyboard())
        enabled = false
      }
    },
  }
}

/**
 * Initialize kitty keyboard auto-detection.
 * Queries the terminal for support, listens for the response, and enables the protocol if supported.
 * Returns a cleanup function to cancel the detection.
 *
 * Uses a synchronous event-based approach (not async) because render() must return synchronously.
 * Delegates to @silvery/term for escape sequences (queryKittyKeyboard, enableKittyKeyboard).
 */
function initKittyAutoDetection(
  stdin: NodeJS.ReadStream,
  stdout: NodeJS.WriteStream,
  flagBitmask: number,
  onEnable: (flags: number) => void,
): () => void {
  let responseBuffer = ""
  let cleaned = false
  let unmounted = false

  const cleanup = (): void => {
    if (cleaned) return
    cleaned = true
    clearTimeout(timer)
    stdin.removeListener("data", onData)

    // Re-emit any buffered data that wasn't the protocol response
    const remaining = responseBuffer.replace(KITTY_RESPONSE_RE, "")
    responseBuffer = ""
    if (remaining.length > 0) {
      stdin.unshift(Buffer.from(remaining))
    }
  }

  const onData = (data: Uint8Array | string): void => {
    responseBuffer += typeof data === "string" ? data : data.toString()

    if (KITTY_RESPONSE_RE.test(responseBuffer)) {
      cleanup()
      if (!unmounted) {
        onEnable(flagBitmask)
      }
    }
  }

  // Attach listener before writing the query so synchronous responses are not missed
  stdin.on("data", onData)
  const timer = setTimeout(cleanup, 200)

  stdout.write(queryKittyKeyboard())

  return () => {
    unmounted = true
    cleanup()
  }
}
