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
 * - `@silvery/ag-react`   — base components, reconciler, hooks
 * - `@silvery/ag-react/ui`      — TextInput, TextArea, Table, Picker, Modal, etc.
 * - `@silvery/ag-term`    — runtime, pipeline, terminal protocols
 * - `@silvery/ansi`    — styling, colors, terminal control
 * - `@silvery/theme`   — ThemeProvider, useTheme, semantic tokens
 * - `@silvery/create`     — store, core types, tree utilities
 * - `@silvery/test`    — testing utilities, buffer assertions
 *
 * Or import everything from `silvery`.
 *
 * @packageDocumentation
 */

// =============================================================================
// Utilities (chalk integration, terminal dimensions, VS16 handling)
// =============================================================================

export { currentChalkLevel, stripSilveryVS16 } from "./ink-utils"

// =============================================================================
// ANSI sanitization
// =============================================================================

export { restoreColonFormatSGR } from "./ink-sanitize"

// =============================================================================
// Components
// =============================================================================

export { Box, Text, Static, Newline, Spacer, Transform } from "./ink-components"
export type { BoxProps, BoxHandle, TextProps, TextHandle, TransformProps } from "./ink-components"

// =============================================================================
// Background context (Ink 7.0 API)
// =============================================================================

export { backgroundContext } from "./bg-context"
export type { BackgroundColor } from "./bg-context"

// =============================================================================
// Hooks
// =============================================================================

export {
  useFocus,
  useFocusManager,
  useStdin,
  usePaste,
  useCursor,
  useBoxMetrics,
  useWindowSize,
  useInput,
  useApp,
  useStdout,
  useStderr,
  useAnimation,
  useIsScreenReaderEnabled,
} from "./ink-hooks"
export type {
  UseFocusOptions,
  UseFocusResult,
  InkUseFocusManagerResult,
  Key,
  InputHandler,
  UseInputOptions,
  UseAppResult,
  UseStdoutResult,
  AnimationResult,
  UseAnimationOptions,
} from "./ink-hooks"

// =============================================================================
// Render
// =============================================================================

export { render, renderToString, initInkCompat, measureElement } from "./ink-render"
export type { RenderOptions, Instance, MeasureElementOutput } from "./ink-render"

// =============================================================================
// Types
// =============================================================================

export type DOMElement = any

// =============================================================================
// Term primitives (so consumers don't need ansi directly)
// =============================================================================

export { createTerm, term } from "@silvery/ag-term/ansi"
export type { Term } from "@silvery/ag-term/ansi"

// =============================================================================
// Measurement
// =============================================================================

export { measureText } from "./ink-measure-text"

// =============================================================================
// Kitty keyboard protocol
// =============================================================================

export { kittyFlags, resolveFlags, kittyModifiers } from "./ink-hooks"
export type { KittyFlagName, KittyKeyboardOptions } from "./ink-hooks"
