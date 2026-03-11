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
  Component,
  createContext,
  useContext,
  useCallback,
  useState,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
} from "react"
import * as fs from "node:fs"
import { StdoutContext, TermContext } from "@silvery/react/context"
import { bufferToStyledText, bufferToText, type TerminalBuffer } from "@silvery/term/buffer"
import { stripAnsi } from "@silvery/term/unicode"
import { tokenizeAnsi as tokenizeAnsiEsc } from "@silvery/term/ansi-sanitize"
import { createTerm } from "@silvery/term/ansi"
import chalk from "chalk"
import { createCursorStore, CursorProvider, type CursorStore } from "@silvery/react/hooks/useCursor"
import { SilveryErrorBoundary } from "@silvery/react/error-boundary"
import { InkCursorStoreCtx } from "./with-ink-cursor"
import { InkFocusContext, InkFocusProvider } from "./with-ink-focus"
import { useInput as silveryUseInput } from "@silvery/react/hooks/useInput"
import { RuntimeContext } from "@silvery/react/context"
import EventEmitter from "node:events"
import { Buffer } from "node:buffer"

// =============================================================================
// Ink-Compatible Error Boundary
// =============================================================================

interface InkErrorBoundaryProps {
  children?: React.ReactNode
  onError?: (error: Error) => void
}

interface InkErrorBoundaryState {
  error: Error | null
}

/**
 * Parse a stack line to extract function name, file, line, column.
 * Handles both `at Foo (file:line:col)` and `at file:line:col` formats.
 */
function parseStackLine(line: string): { function?: string; file?: string; line?: number; column?: number } | null {
  const trimmed = line.trim()
  if (!trimmed.startsWith("at ")) return null

  const rest = trimmed.slice(3)
  // Match: functionName (file:line:col)
  const match1 = rest.match(/^(.+?)\s+\((.+?):(\d+):(\d+)\)$/)
  if (match1) {
    return { function: match1[1], file: match1[2], line: Number(match1[3]), column: Number(match1[4]) }
  }
  // Match: file:line:col (no function name)
  const match2 = rest.match(/^(.+?):(\d+):(\d+)$/)
  if (match2) {
    return { file: match2[1], line: Number(match2[2]), column: Number(match2[3]) }
  }
  return null
}

/**
 * Clean up file path by removing cwd prefix and file:// protocol.
 */
function cleanupPath(filePath: string | undefined): string | undefined {
  if (!filePath) return filePath
  let p = filePath
  const cwdPath = process.cwd()
  // Remove file:// protocol
  p = p.replace(/^file:\/\//, "")
  // Remove cwd prefix
  for (const prefix of [cwdPath, `/private${cwdPath}`]) {
    if (p.startsWith(`${prefix}/`)) {
      p = p.slice(prefix.length + 1)
      break
    }
  }
  return p
}

/**
 * Get source code excerpt around a line number (±3 lines).
 */
function getCodeExcerpt(filePath: string, line: number): Array<{ line: number; value: string }> | null {
  try {
    if (!fs.existsSync(filePath)) return null
    const source = fs.readFileSync(filePath, "utf8")
    const lines = source.split("\n")
    const start = Math.max(0, line - 4)
    const end = Math.min(lines.length, line + 3)
    const result: Array<{ line: number; value: string }> = []
    for (let i = start; i < end; i++) {
      result.push({ line: i + 1, value: lines[i] ?? "" })
    }
    return result
  } catch {
    return null
  }
}

/**
 * Ink-compatible error boundary.
 * Catches render errors and displays them with source location and code excerpt,
 * matching Ink's ErrorOverview component output format.
 */
class InkErrorBoundary extends Component<InkErrorBoundaryProps, InkErrorBoundaryState> {
  override state: InkErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): InkErrorBoundaryState {
    return { error }
  }

  override componentDidCatch(error: Error) {
    this.props.onError?.(error)
  }

  override render() {
    if (this.state.error) {
      const err = this.state.error
      const stack = err.stack ? err.stack.split("\n").slice(1) : []
      const origin = stack.length > 0 ? parseStackLine(stack[0]!) : null
      const filePath = cleanupPath(origin?.file)

      // Get source code excerpt
      let excerpt: Array<{ line: number; value: string }> | null = null
      let lineWidth = 0
      if (filePath && origin?.line) {
        excerpt = getCodeExcerpt(filePath, origin.line)
        if (excerpt) {
          for (const { line } of excerpt) {
            lineWidth = Math.max(lineWidth, String(line).length)
          }
        }
      }

      // Build the error display using silvery host elements (Box/Text)
      // Format: padding=1 column layout with ERROR label, location, code, and stack
      const children: React.ReactNode[] = []

      // ERROR label + message
      children.push(
        React.createElement(
          "silvery-box",
          { key: "header" },
          React.createElement("silvery-text", { backgroundColor: "red", color: "white" }, " ERROR "),
          React.createElement("silvery-text", {}, ` ${err.message}`),
        ),
      )

      // File location
      if (filePath && origin) {
        children.push(
          React.createElement(
            "silvery-box",
            { key: "location", marginTop: 1 },
            React.createElement("silvery-text", { dimColor: true }, `${filePath}:${origin.line}:${origin.column}`),
          ),
        )
      }

      // Source code excerpt
      if (excerpt && origin) {
        const codeLines = excerpt.map(({ line, value }) => {
          const lineNum = String(line).padStart(lineWidth, " ")
          return React.createElement(
            "silvery-box",
            { key: `code-${line}` },
            React.createElement(
              "silvery-text",
              {
                dimColor: line !== origin.line,
                backgroundColor: line === origin.line ? "red" : undefined,
                color: line === origin.line ? "white" : undefined,
              },
              `${lineNum}:`,
            ),
            React.createElement(
              "silvery-text",
              {
                backgroundColor: line === origin.line ? "red" : undefined,
                color: line === origin.line ? "white" : undefined,
              },
              ` ${value}`,
            ),
          )
        })
        children.push(
          React.createElement("silvery-box", { key: "code", marginTop: 1, flexDirection: "column" }, ...codeLines),
        )
      }

      // Stack trace
      if (stack.length > 0) {
        const stackLines = stack.map((line, i) => {
          const parsed = parseStackLine(line)
          if (!parsed) {
            return React.createElement(
              "silvery-box",
              { key: `stack-${i}` },
              React.createElement("silvery-text", { dimColor: true }, `- ${line.trim()}`),
            )
          }
          const cleanFile = cleanupPath(parsed.file)
          return React.createElement(
            "silvery-box",
            { key: `stack-${i}` },
            React.createElement("silvery-text", { dimColor: true }, "- "),
            React.createElement("silvery-text", { dimColor: true, bold: true }, parsed.function ?? ""),
            React.createElement(
              "silvery-text",
              { dimColor: true, color: "gray" },
              ` (${cleanFile ?? ""}:${parsed.line}:${parsed.column})`,
            ),
          )
        })
        children.push(
          React.createElement("silvery-box", { key: "stack", marginTop: 1, flexDirection: "column" }, ...stackLines),
        )
      }

      return React.createElement("silvery-box", { flexDirection: "column", padding: 1 }, ...children)
    }
    return this.props.children
  }
}

/**
 * Get chalk's current color level at render time.
 * Tests may set chalk.level programmatically (e.g., chalk.level = 3 for
 * background color tests). We sync our renderer's color behavior with chalk.
 */
/** @internal */
export function currentChalkLevel(): number {
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
  // Map Ink's per-axis overflow props to silvery's unified overflow
  const { overflowX, overflowY, ...rest } = props as any
  const overflow = rest.overflow ?? (overflowX === "hidden" || overflowY === "hidden" ? "hidden" : undefined)

  return React.createElement(SilveryBox, {
    flexDirection: "row",
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
  // When chalk has no color support (FORCE_COLOR=0), strip style props to match
  // Ink behavior. Ink uses chalk to apply styles, so chalk.level=0 means no
  // styles are applied. But embedded ANSI sequences in text content are preserved.
  const hasColors = currentChalkLevel() > 0
  const passProps = hasColors
    ? {
        ...props,
        color: convertColor(props.color),
        backgroundColor: convertColor(props.backgroundColor),
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
  // Fallback ref for when no static store is available (always called per hooks rules)
  const renderedRef = useRef<React.ReactNode[]>([])

  // When no static store is available (e.g., called outside the compat render()),
  // fall back to rendering items in the tree like the silvery native Static component
  if (!store) {
    const prevCount = renderedRef.current.length
    if (items.length > prevCount) {
      for (let i = prevCount; i < items.length; i++) {
        renderedRef.current.push(renderItem(items[i]!, i))
      }
    } else if (items.length < prevCount) {
      renderedRef.current.length = items.length
    }
    return React.createElement("silvery-box", { flexDirection: "column", ...style }, ...renderedRef.current)
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

import type { Key as SilveryKey, UseInputOptions } from "@silvery/react/hooks/useInput"

/**
 * Ink-compatible Key type with string eventType.
 */
export interface Key extends Omit<SilveryKey, "eventType"> {
  eventType?: "press" | "repeat" | "release"
}

export type InputHandler = (input: string, key: Key) => void

export type { UseInputOptions }

/** Map numeric eventType (1/2/3) to Ink's string format. */
function mapEventType(et: 1 | 2 | 3 | undefined): "press" | "repeat" | "release" | undefined {
  if (et === 1) return "press"
  if (et === 2) return "repeat"
  if (et === 3) return "release"
  return undefined
}

/**
 * Ink-compatible useInput hook.
 *
 * Wraps silvery's useInput to produce Ink-compatible Key objects:
 * - eventType: maps from numeric (1/2/3) to string ('press'/'repeat'/'release')
 * - capsLock/numLock: passed through from silvery's Key
 */
export function useInput(handler: InputHandler, options?: UseInputOptions): void {
  silveryUseInput((input: string, silveryKey: SilveryKey) => {
    const inkKey: Key = {
      ...silveryKey,
      eventType: mapEventType(silveryKey.eventType),
    }
    handler(input, inkKey)
  }, options)
}

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

// ANSI sanitization — delegates to silvery's tokenizer, adds colon-format SGR tracking.

// =============================================================================
// Colon-format SGR tracking
// =============================================================================

/**
 * Module-level set of colon→semicolon SGR replacements.
 * Populated by sanitizeAnsi when it encounters colon-separated SGR (e.g., 38:2::R:G:B).
 * Consumed by restoreColonFormatSGR to convert semicolon output back to colon format.
 *
 * This is safe because rendering is synchronous: sanitize → render → output in one call.
 */
const colonFormatReplacements: Array<{ semicolonForm: string; colonForm: string }> = []

/**
 * Detect colon-format SGR sequences in text and register replacements.
 * Called during sanitizeAnsi when preserving SGR sequences.
 *
 * Converts colon-separated parameters to their semicolon equivalents:
 *   \x1b[38:2::255:100:0m → replacement: \x1b[38;2;255;100;0m → \x1b[38:2::255:100:0m
 */
function registerColonFormatSGR(sgrSequence: string): void {
  // Check if params contain colons (not just semicolons)
  // Extract params between [ and m
  const paramsMatch = sgrSequence.match(/\x1b\[([0-9;:]+)m/)
  if (!paramsMatch) return

  const rawParams = paramsMatch[1]!
  if (!rawParams.includes(":")) return

  // Build the semicolon equivalent by replacing colons with semicolons
  // and removing empty slots (e.g., 38:2::255:100:0 → 38;2;0;255;100;0)
  // Actually, we need to match what bufferToStyledText would produce.
  // For 38:2::R:G:B, parseAnsiText produces fg = packed RGB.
  // bufferToStyledText emits 38;2;R;G;B (just the RGB values, no colorspace ID).
  // So 38:2::255:100:0 → semicolonForm = 38;2;255;100;0
  // The mapping is: find the R;G;B values and construct the semicolon form.

  // Parse colon-separated 38:2::R:G:B or 48:2::R:G:B
  const parts = rawParams.split(";")
  for (const part of parts) {
    if (!part.includes(":")) continue
    const subs = part.split(":")
    const code = Number(subs[0])
    if ((code === 38 || code === 48) && Number(subs[1]) === 2) {
      // True color colon format: code:2::R:G:B or code:2:R:G:B
      // Extract R, G, B (skip empty colorspace ID)
      const nums = subs.map((s) => (s === "" ? 0 : Number(s)))
      const r = nums[3] ?? nums[2] ?? 0
      const g = nums[4] ?? nums[3] ?? 0
      const b = nums[5] ?? nums[4] ?? 0
      const semicolonForm = `\x1b[${code};2;${r};${g};${b}m`
      colonFormatReplacements.push({ semicolonForm, colonForm: `\x1b[${part}m` })
    }
  }
}

/**
 * Restore colon-format SGR sequences in output.
 * Replaces semicolon-format sequences that were originally colon-format.
 */
export function restoreColonFormatSGR(output: string): string {
  if (colonFormatReplacements.length === 0) return output
  let result = output
  for (const { semicolonForm, colonForm } of colonFormatReplacements) {
    result = result.replaceAll(semicolonForm, colonForm)
  }
  colonFormatReplacements.length = 0
  return result
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
        // Only keep SGR sequences (final byte 'm')
        if (token.value.charCodeAt(token.value.length - 1) === 0x6d) {
          result += token.value
          registerColonFormatSGR(token.value)
        }
        break
      case "osc":
        // Only keep OSC 8 (hyperlinks): ESC]8;... or \x9D8;...
        // Strip other OSC sequences (window title, etc.)
        if (isOSC8(token.value)) {
          result += token.value
        }
        break
      // Strip everything else: esc, dcs, pm, apc, sos, c1
    }
  }

  return result
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

// =============================================================================
// ANSI Conversion: silvery → chalk-compatible encoding
// =============================================================================

/**
 * Convert silvery ANSI output to chalk-compatible format.
 *
 * Now a no-op: silvery emits chalk-compatible ANSI natively:
 * - Native 4-bit codes for basic colors (30-37, 40-47)
 * - Per-attribute resets instead of \x1b[0m (39, 49, 22, 23, 24, etc.)
 * - Individual \x1b[Xm sequences (no combined codes)
 * - No reset prefix
 */
/** @internal */
export function toChalkCompat(input: string): string {
  return input
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
    const chalkHasColors = currentChalkLevel() > 0
    const plain = !chalkHasColors

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

    // Per-instance stdin state for raw mode tracking
    const stdinState = createInkStdinState((stdin ?? process.stdin) as NodeJS.ReadStream)

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
      output = toChalkCompat(output)
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
      // Provide stderr context for useStderr hook
      const stderrCtxValue = { stderr: stderr ?? process.stderr, write: writeToStderr }

      return React.createElement(
        InkErrorBoundary,
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
                    InkStderrCtx.Provider,
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
  const resolvedStdin = (stdin ?? process.stdin) as NodeJS.ReadStream
  const termDef: Record<string, unknown> = {
    stdout: stdout ?? process.stdout,
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
// Ink Stderr Context (for test-mode render with custom stderr)
// =============================================================================

interface InkStderrContextValue {
  stderr: NodeJS.WriteStream
  write: (data: string) => void
}

const InkStderrCtx = createContext<InkStderrContextValue | null>(null)

/**
 * Ink-compatible useStderr hook.
 * When used inside compat render() with a custom stderr, returns that stderr.
 * Otherwise falls back to process.stderr.
 */
export function useStderr() {
  const ctx = useContext(InkStderrCtx)
  if (ctx) return ctx
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
  const plain = term.hasColor() === null
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
  const dynamicOutput = plain ? output : toChalkCompat(output)
  if (staticStore.fullStaticOutput) {
    return staticStore.fullStaticOutput + dynamicOutput
  }
  return dynamicOutput
}

// =============================================================================
// Screen Reader Mode (ARIA-based text rendering)
// =============================================================================

/**
 * ARIA state flags that can be set on elements via `aria-state` prop.
 */
interface AriaState {
  busy?: boolean
  checked?: boolean
  disabled?: boolean
  expanded?: boolean
  multiline?: boolean
  multiselectable?: boolean
  readonly?: boolean
  required?: boolean
  selected?: boolean
}

/**
 * Walk a React element tree and produce accessible text output.
 *
 * Rules:
 * - `aria-hidden` → skip element entirely
 * - `display="none"` → skip element entirely
 * - `aria-label` → use label instead of children text
 * - `aria-role` → prefix with "role: "
 * - `aria-state` → prepend active states as "(state) "
 * - Row direction → space-separated children
 * - Column direction → newline-separated children
 * - Plain text content (no ANSI codes)
 */
function renderScreenReaderOutput(node: import("react").ReactNode): string {
  return walkNode(node, "row")
}

/**
 * Recursively walk a React node and produce screen reader text.
 * @param node - React node to walk
 * @param parentDirection - flex direction of the parent container
 */
function walkNode(node: import("react").ReactNode, parentDirection: "row" | "column"): string {
  // Null, undefined, boolean → empty
  if (node == null || typeof node === "boolean") {
    return ""
  }

  // String or number → literal text
  if (typeof node === "string" || typeof node === "number") {
    return String(node)
  }

  // Arrays/fragments → join children
  if (Array.isArray(node)) {
    const parts = node.map((child) => walkNode(child, parentDirection)).filter((s) => s !== "")
    const sep = parentDirection === "column" ? "\n" : " "
    return parts.join(sep)
  }

  // React element
  if (React.isValidElement(node)) {
    const props = node.props as Record<string, any>

    // aria-hidden → skip entirely
    if (props["aria-hidden"]) {
      return ""
    }

    // display="none" → skip entirely
    if (props.display === "none") {
      return ""
    }

    // Determine this element's flex direction
    const direction: "row" | "column" = props.flexDirection === "column" ? "column" : "row"

    // Build the content: aria-label overrides children
    let content: string
    if (props["aria-label"] != null) {
      content = String(props["aria-label"])
    } else {
      // Walk children
      const children = props.children
      content = walkChildren(children, direction)
    }

    // Build ARIA state prefix
    const statePrefix = buildStatePrefix(props["aria-state"])

    // Build role prefix
    const role = props["aria-role"]

    // Assemble output
    if (role && statePrefix) {
      return `${role}: ${statePrefix}${content}`
    }
    if (role) {
      return `${role}: ${content}`
    }
    if (statePrefix) {
      return `${statePrefix}${content}`
    }

    return content
  }

  return ""
}

/**
 * Walk children of a React element, joining with direction-appropriate separator.
 */
function walkChildren(children: import("react").ReactNode, direction: "row" | "column"): string {
  if (children == null) return ""

  // Single child
  if (!Array.isArray(children)) {
    // React.Children.toArray normalizes fragments, filters nulls
    const childArray = React.Children.toArray(children)
    if (childArray.length <= 1) {
      return walkNode(children, direction)
    }
    const parts = childArray.map((child) => walkNode(child, direction)).filter((s) => s !== "")
    const sep = direction === "column" ? "\n" : " "
    return parts.join(sep)
  }

  // Array of children
  const parts = children.map((child) => walkNode(child, direction)).filter((s) => s !== "")
  const sep = direction === "column" ? "\n" : " "
  return parts.join(sep)
}

/**
 * Build the state prefix string from aria-state object.
 * Active (truthy) states become "(stateName) " prefix.
 */
function buildStatePrefix(state: AriaState | undefined): string {
  if (!state) return ""

  const activeStates: string[] = []
  // Check each state in a consistent order
  const stateNames: (keyof AriaState)[] = [
    "busy",
    "checked",
    "disabled",
    "expanded",
    "multiline",
    "multiselectable",
    "readonly",
    "required",
    "selected",
  ]

  for (const name of stateNames) {
    if (state[name]) {
      activeStates.push(`(${name})`)
    }
  }

  if (activeStates.length === 0) return ""
  return activeStates.join(" ") + " "
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
