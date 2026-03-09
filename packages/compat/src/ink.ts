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

// =============================================================================
// Render (Ink-compatible)
// =============================================================================

export { render } from "@silvery/react/render"
export type { RenderOptions, Instance } from "@silvery/react/render"

export { measureElement } from "@silvery/react/measureElement"
export type { MeasureElementOutput } from "@silvery/react/measureElement"

// =============================================================================
// Term primitives (so consumers don't need ansi directly)
// =============================================================================

export { createTerm, term } from "@silvery/ansi"
export type { Term } from "@silvery/ansi"
