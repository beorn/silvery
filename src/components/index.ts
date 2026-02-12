/**
 * Inkx Components
 *
 * Public component exports for the Inkx library.
 */

// Layout
export { Box } from "./Box.js"
export type { BoxProps, BoxHandle } from "./Box.js"

// Text
export { Text } from "./Text.js"
export type { TextProps, TextHandle } from "./Text.js"

// Error Handling
export { ErrorBoundary } from "./ErrorBoundary.js"
export type { ErrorBoundaryProps } from "./ErrorBoundary.js"

// Utilities
export { Newline } from "./Newline.js"
export { Spacer } from "./Spacer.js"
export { Static } from "./Static.js"

// Input Components
export { TextInput } from "./TextInput.js"
export type { TextInputProps, TextInputHandle } from "./TextInput.js"

export { ReadlineInput } from "./ReadlineInput.js"
export type { ReadlineInputProps, ReadlineInputHandle } from "./ReadlineInput.js"

export { TextArea } from "./TextArea.js"
export type { TextAreaProps, TextAreaHandle } from "./TextArea.js"

// Input Hooks
export { useReadline } from "./useReadline.js"
export type { ReadlineState, UseReadlineOptions, UseReadlineResult } from "./useReadline.js"
