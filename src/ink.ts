/**
 * hightea/ink -- Minimal Ink-compatible drop-in replacement.
 *
 * This entry point exports ONLY the symbols you need to replace Ink
 * with hightea. If you're migrating from Ink, start here:
 *
 * ```tsx
 * // Before:
 * import { Box, Text, render, useInput, useApp } from 'ink'
 *
 * // After:
 * import { Box, Text, render, useInput, useApp } from '@hightea/term/ink'
 * ```
 *
 * For hightea-specific features (layout feedback, focus system, plugins, etc.),
 * see the layered entry points:
 * - `hightea/layout`     -- useContentRect, useScreenRect
 * - `hightea/components`  -- VirtualList, Table, SelectList, TextInput, ...
 * - `hightea/focus`       -- FocusManager, useFocusable, InputLayer
 * - `hightea/input`       -- Mouse, clipboard, Kitty keyboard, paste
 * - `hightea/theme`       -- ThemeProvider, useTheme
 * - `hightea/animation`   -- useAnimation, easing
 * - `hightea/images`      -- Image component, Kitty/Sixel encoders
 * - `hightea/plugins`     -- withCommands, withKeybindings, withDiagnostics
 *
 * Or import everything from `hightea` (backwards-compatible, all 161+ symbols).
 *
 * @packageDocumentation
 */

// =============================================================================
// Components (Ink-compatible)
// =============================================================================

export { Box } from "./components/Box.js"
export type { BoxProps, BoxHandle } from "./components/Box.js"

export { Text } from "./components/Text.js"
export type { TextProps, TextHandle } from "./components/Text.js"

export { Newline } from "./components/Newline.js"
export { Spacer } from "./components/Spacer.js"
export { Static } from "./components/Static.js"
export { Transform } from "./components/Transform.js"
export type { TransformProps } from "./components/Transform.js"

// =============================================================================
// Hooks (Ink-compatible)
// =============================================================================

export { useInput } from "./hooks/useInput.js"
export type { Key, InputHandler, UseInputOptions } from "./hooks/useInput.js"

export { useApp } from "./hooks/useApp.js"
export type { UseAppResult } from "./hooks/useApp.js"

export { useStdout } from "./hooks/useStdout.js"
export type { UseStdoutResult } from "./hooks/useStdout.js"

// Ink-compatible focus hooks
export { useFocus, useInkFocusManager as useFocusManager } from "./hooks/ink-compat.js"
export type { UseFocusOptions, UseFocusResult, InkUseFocusManagerResult } from "./hooks/ink-compat.js"

// =============================================================================
// Render (Ink-compatible)
// =============================================================================

export { render } from "./render.js"
export type { RenderOptions, Instance } from "./render.js"

export { measureElement } from "./measureElement.js"
export type { MeasureElementOutput } from "./measureElement.js"

// =============================================================================
// Term primitives (so consumers don't need ansi directly)
// =============================================================================

export { createTerm, term } from "@hightea/ansi"
export type { Term } from "@hightea/ansi"
