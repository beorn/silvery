/**
 * ANSI primitives — Term factory, styling, detection, underlines, hyperlinks.
 *
 * Pure ANSI utilities (detection, SGR codes, constants, types) live in
 * `@silvery/ansi` and are re-exported here for backwards compatibility.
 *
 * ```ts
 * import { createTerm, patchConsole } from '@silvery/ag-term'
 *
 * using term = createTerm()
 * term.red('error')
 * term.bold.green('success')
 *
 * using patched = patchConsole(console)
 * patched.subscribe(() => console.log('new entry'))
 * ```
 *
 * @module
 */

// =============================================================================
// Term API (NewWay)
// =============================================================================

export { createTerm } from "./term"
export type { Term, StyleChain, TermState, TermEvents } from "./term"

import { createTerm as _createTerm } from "./term"
import type { Term } from "./term"

/**
 * Default term instance for convenience, lazily initialized on first access.
 * This avoids running terminal detection (including spawnSync) at import time.
 * Use this for simple scripts. For apps, prefer createTerm() with `using`.
 *
 * @example
 * ```ts
 * import { term } from '@silvery/ag-term'
 *
 * console.log(term.green('success'))
 * if (term.hasColor()) { ... }
 * ```
 */
let _lazyTerm: Term | undefined
export const term: Term = new Proxy({} as Term, {
  get(_target, prop, receiver) {
    if (!_lazyTerm) _lazyTerm = _createTerm()
    return Reflect.get(_lazyTerm, prop, receiver)
  },
  apply(_target, thisArg, args) {
    if (!_lazyTerm) _lazyTerm = _createTerm()
    return Reflect.apply(_lazyTerm as unknown as (...args: unknown[]) => unknown, thisArg, args)
  },
  has(_target, prop) {
    if (!_lazyTerm) _lazyTerm = _createTerm()
    return Reflect.has(_lazyTerm, prop)
  },
})

export { patchConsole } from "./patch-console"
export type { PatchedConsole, PatchConsoleOptions, ConsoleStats } from "./patch-console"

// =============================================================================
// Types
// =============================================================================

export type {
  UnderlineStyle,
  RGB,
  ColorLevel,
  Color,
  AnsiColorName,
  StyleOptions,
  ConsoleMethod,
  ConsoleEntry,
  CreateTermOptions,
  TermEmulator,
  TermEmulatorBackend,
  TermScreen,
} from "./types"

// =============================================================================
// Detection Functions
// =============================================================================

export {
  detectCursor,
  detectInput,
  detectColor,
  detectUnicode,
  detectExtendedUnderline,
  detectTerminalCaps,
  defaultCaps,
} from "./detection"
export type { TerminalCaps } from "./detection"

// =============================================================================
// Utilities
// =============================================================================

export { ANSI_REGEX, stripAnsi, displayLength } from "./utils"

// =============================================================================
// Underline Functions
// =============================================================================

export {
  underline,
  curlyUnderline,
  dottedUnderline,
  dashedUnderline,
  doubleUnderline,
  underlineColor,
  styledUnderline,
} from "./underline"

// =============================================================================
// Hyperlink Functions
// =============================================================================

export { hyperlink } from "./hyperlink"

// =============================================================================
// ANSI Terminal Control Helpers
// =============================================================================

export {
  enterAltScreen,
  leaveAltScreen,
  clearScreen,
  clearLine,
  cursorTo,
  cursorHome,
  cursorHide,
  cursorShow,
  cursorStyle,
  setTitle,
  enableMouse,
  disableMouse,
  enableBracketedPaste,
  disableBracketedPaste,
  enableSyncUpdate,
  disableSyncUpdate,
  setScrollRegion,
  resetScrollRegion,
  scrollUp,
  scrollDown,
  enableKittyKeyboard,
  disableKittyKeyboard,
} from "./ansi"

// =============================================================================
// Background Override — Compose styled text inside Box with backgroundColor
// =============================================================================

/**
 * SGR code recognized by silvery to signal intentional bg override.
 * When text is wrapped with this, silvery won't warn/throw about chalk bg + silvery bg conflicts.
 * Exported for silvery to detect this marker in text content.
 */
export const BG_OVERRIDE_CODE = 9999

/**
 * Compose styled text with an explicit background inside a Box that has its own
 * `backgroundColor`. This is the correct way to layer chalk/term background
 * colors on top of an silvery Box background.
 *
 * Without `bgOverride`, silvery throws (by default) when it detects both an ANSI
 * background in the text content AND a `backgroundColor` prop on an ancestor
 * Box, because the two conflict and produce visual artifacts (the ANSI bg
 * only covers the text, leaving gaps at line edges).
 *
 * `bgOverride` wraps the text with a private SGR marker that tells silvery
 * "this background is intentional — don't throw." Use it when you need
 * pixel-precise background control within a styled container.
 *
 * @param text - Text containing ANSI background codes (e.g. from `chalk.bgBlack()`)
 * @returns The same text prefixed with a marker SGR code
 *
 * @example
 * ```tsx
 * import { bgOverride } from '@silvery/chalk'
 *
 * // Without bgOverride — silvery throws:
 * <Box backgroundColor="cyan">
 *   <Text>{chalk.bgBlack('text')}</Text>  // Error!
 * </Box>
 *
 * // With bgOverride — explicitly allowed:
 * <Box backgroundColor="cyan">
 *   <Text>{bgOverride(chalk.bgBlack('text'))}</Text>  // OK
 * </Box>
 *
 * // Also works with term styling:
 * <Box backgroundColor="$surface-bg">
 *   <Text>{bgOverride(term.bgRgb(30, 30, 30)('highlighted'))}</Text>
 * </Box>
 * ```
 */
export function bgOverride(text: string): string {
  return `\x1b[${BG_OVERRIDE_CODE}m${text}`
}
