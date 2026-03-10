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

import React, { Component, useContext, useCallback, useState, useEffect, useMemo } from "react"
import { StdoutContext, RuntimeContext, TermContext } from "@silvery/react/context"
import type { RuntimeContextValue, StdoutContextValue } from "@silvery/react/context"
import { createTerm } from "@silvery/term/ansi"
import { EventEmitter } from "node:events"
import { parseKey } from "@silvery/tea/keys"
import chalk from "chalk"

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

// Ink-compatible focus hooks
export { useFocus, useInkFocusManager as useFocusManager } from "./ink-focus"
export type { UseFocusOptions, UseFocusResult, InkUseFocusManagerResult } from "./ink-focus"

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
 * Ink-compatible useWindowSize hook.
 * Returns current terminal dimensions.
 */
export function useWindowSize() {
  const ctx = useContext(StdoutContext)
  const stdout = ctx?.stdout ?? process.stdout
  const [size, setSize] = useState(() => ({
    columns: stdout.columns || 80,
    rows: (stdout as any).rows || 24,
  }))

  useEffect(() => {
    const onResize = () => {
      setSize({
        columns: stdout.columns || 80,
        rows: (stdout as any).rows || 24,
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
 * Ink-compatible useBoxMetrics hook.
 * Returns layout metrics for a tracked box element.
 */
export function useBoxMetrics(_ref: import("react").RefObject<any>) {
  return useMemo(
    () => ({
      width: 0,
      height: 0,
      left: 0,
      top: 0,
      hasMeasured: false,
    }),
    [],
  )
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
      // Render error display like Ink does
      const err = this.state.error
      const stack = err.stack ?? ""
      // Extract the first meaningful stack frame
      const frames = stack
        .split("\n")
        .filter((line) => line.match(/^\s+at\s/))
        .map((line) => line.trim())
      const firstFrame = frames[0] ?? ""

      // Extract file:line from "at Foo (file:line:col)" or "at file:line:col"
      const fileMatch = firstFrame.match(/\((.+)\)$/) ?? firstFrame.match(/at (.+)$/)
      const location = fileMatch?.[1] ?? ""

      // Extract function name
      const fnMatch = firstFrame.match(/at (\S+)/)
      const fnName = fnMatch?.[1] ?? ""

      // Build source lines if we have a location
      let sourceBlock = ""
      if (location) {
        const parts = location.match(/(.+):(\d+):(\d+)/)
        if (parts) {
          const filePath = parts[1]!
          const lineNum = Number.parseInt(parts[2]!, 10)
          try {
            const fs = require("node:fs")
            const source = fs.readFileSync(filePath, "utf8") as string
            const lines = source.split("\n")
            const start = Math.max(0, lineNum - 4)
            const end = Math.min(lines.length, lineNum + 4)
            const sourceLines: string[] = []
            for (let i = start; i < end; i++) {
              sourceLines.push(` ${String(i + 1).padStart(String(end).length)}: ${lines[i]}`)
            }
            sourceBlock = sourceLines.join("\n")
          } catch {
            // Can't read source, skip
          }
        }
      }

      // Build stack trace display
      const traceLines = frames.map((f) => {
        const m = f.match(/at (.+)/)
        return m ? ` - ${m[1]}` : ` - ${f}`
      })

      const parts = [
        "",
        `  ERROR  ${err.message}`,
        "",
      ]
      if (location) {
        parts.push(` ${location}`)
        parts.push("")
      }
      if (sourceBlock) {
        parts.push(...sourceBlock.split("\n"))
        parts.push("")
      }
      parts.push(...traceLines)

      return React.createElement(
        "silvery-box",
        null,
        React.createElement("silvery-text", null, parts.join("\n")),
      )
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

    // Set up stdin input handling if stdin is provided
    if (stdin) {
      const onReadable = () => {
        let chunk: string | null
        while ((chunk = (stdin as any).read?.()) !== null && chunk !== undefined) {
          inputEmitter.emit("input", chunk)
        }
      }
      stdin.on("readable", onReadable)
    }

    // Wrap element with contexts for useApp/useInput/useStdout
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
      wrapped = React.createElement(TermContext.Provider, { value: term }, wrapped)
      wrapped = React.createElement(StdoutContext.Provider, { value: stdoutCtx }, wrapped)
      wrapped = React.createElement(RuntimeContext.Provider, { value: runtimeCtx }, wrapped)
      return wrapped
    }

    // renderFrame with context wrapping
    function renderFrameWithContext(el: import("react").ReactNode): string {
      const wrapped = wrapElement(el)
      const bufferHeight = (stdout as any).rows ?? 24
      let layoutContentHeight = 0
      let output = renderStringSync(wrapped as any, {
        width: (stdout as any).columns ?? 80,
        height: bufferHeight,
        plain,
        trimTrailingWhitespace: false,
        trimEmptyLines: false,
        onContentHeight: (h: number) => {
          layoutContentHeight = h
        },
      })
      // Strip trailing spaces from each line (buffer fill padding), then trim rows.
      // With ANSI colors, trailing spaces may be followed by reset codes like \x1b[0m.
      output = output.replace(/ +(\x1b\[[0-9;]*m)*$/gm, "")
      if (layoutContentHeight > 0 && layoutContentHeight < bufferHeight) {
        // Use layout content height to trim buffer padding rows
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

    // Initial render
    let currentElement = element
    renderFrameWithContext(currentElement)

    // If an error was caught during render, reject the exit promise
    if (lastRenderError) {
      exitReject?.(lastRenderError)
      // Prevent unhandled rejection by catching the promise
      exitPromise.catch(() => {})
    }

    // Listen for resize events on stdout to re-render (like Ink does)
    const onResize = () => {
      if (!unmounted) {
        renderFrameWithContext(currentElement)
      }
    }
    stdout.on("resize", onResize)

    // Build instance with working rerender
    const instance: InkInstance = {
      rerender: (newElement: import("react").ReactNode) => {
        if (unmounted) return
        currentElement = newElement
        renderFrameWithContext(newElement)
      },
      unmount: () => {
        if (unmounted) return
        unmounted = true
        stdout.off("resize", onResize)
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

export { measureElement } from "@silvery/react/measureElement"
export type { MeasureElementOutput } from "@silvery/react/measureElement"

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
    trimTrailingWhitespace: false,
    trimEmptyLines: false,
    onContentHeight: (h: number) => {
      layoutContentHeight = h
    },
  })
  // Strip trailing spaces from each line (buffer fill padding).
  // With ANSI colors, trailing spaces may be followed by reset codes like \x1b[0m,
  // so strip spaces + trailing ANSI escapes together.
  output = output.replace(/ +(\x1b\[[0-9;]*m)*$/gm, "")
  // Then trim buffer padding rows using content height from layout
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
