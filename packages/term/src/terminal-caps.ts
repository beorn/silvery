/**
 * Terminal capability detection -- re-exported from ansi.
 *
 * The canonical source of TerminalCaps is now in ansi.
 * This module re-exports for backward compatibility.
 */

export { detectTerminalCaps, defaultCaps, type TerminalCaps } from "@silvery/ansi"
