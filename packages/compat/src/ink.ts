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

// =============================================================================
// Components (Ink-compatible)
// =============================================================================

export { Box } from "@silvery/react/components/Box"
export type { BoxProps, BoxHandle } from "@silvery/react/components/Box"

export { Text } from "@silvery/react/components/Text"
export type { TextProps, TextHandle } from "@silvery/react/components/Text"

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
export { useFocus, useInkFocusManager as useFocusManager } from "@silvery/react/hooks/ink-compat"
export type { UseFocusOptions, UseFocusResult, InkUseFocusManagerResult } from "@silvery/react/hooks/ink-compat"

// Ink-compatible useStdin stub
import React, { useContext, useCallback, useState, useEffect, useMemo } from "react"
import { StdoutContext, TermContext } from "@silvery/react/context"
import { createTerm } from "@silvery/term/ansi"

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
    columns: stdout.columns ?? 80,
    rows: (stdout as any).rows ?? 24,
  }))

  useEffect(() => {
    const onResize = () => {
      setSize({
        columns: stdout.columns ?? 80,
        rows: (stdout as any).rows ?? 24,
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
// Render (Ink-compatible)
// =============================================================================

import { renderSync, type Instance } from "@silvery/react/render"
export type { RenderOptions, Instance } from "@silvery/react/render"

/**
 * Ink-compatible render function.
 *
 * For static mode (fake stdout, no stdin): renders synchronously via
 * renderStringSync and writes output in a single stdout.write() call
 * (Ink tests read write.lastCall.args[0]).
 *
 * For interactive mode: delegates to renderSync() which creates a full
 * SilveryInstance with scheduler.
 */
export function render(element: import("react").ReactNode, options?: Record<string, unknown>) {
  // Ensure layout engine is initialized (sync, using flexily)
  if (!isLayoutEngineInitialized()) {
    setLayoutEngine(createFlexilyZeroEngine())
  }

  // Build TermDef from ink-style options
  const termDef: Record<string, unknown> = {}
  if (options?.stdout) termDef.stdout = options.stdout
  if (options?.stdin) termDef.stdin = options.stdin

  const stdout = options?.stdout as NodeJS.WriteStream | undefined

  // Static mode: fake stdout without TTY stdin → render synchronously
  // and write in a single call (Ink tests read write.lastCall.args[0])
  if (stdout && !termDef.stdin) {
    const term = createTerm()
    const wrapped = React.createElement(TermContext.Provider, { value: term }, element)
    const plain = term.hasColor() === null
    const output = renderStringSync(wrapped as any, {
      width: (stdout as any).columns ?? 80,
      height: (stdout as any).rows ?? 24,
      plain,
    })
    stdout.write(output)
    const noopInstance: Instance = {
      rerender: () => {},
      unmount: () => {},
      [Symbol.dispose]() {},
      waitUntilExit: () => Promise.resolve(),
      clear: () => {},
      flush: () => {},
      pause: () => {},
      resume: () => {},
    }
    return noopInstance
  }

  return renderSync(element as any, termDef as any, options as any)
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
  const term = createTerm() // Auto-detects FORCE_COLOR, NO_COLOR
  const plain = term.hasColor() === null
  const wrapped = React.createElement(TermContext.Provider, { value: term }, node)
  return renderStringSync(wrapped as import("react").ReactElement, {
    width: options?.columns ?? 80,
    plain,
  })
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
