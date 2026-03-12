/**
 * Ink compat Kitty keyboard protocol support.
 * @internal
 */

import { KittyFlags, type KittyManagerOptions } from "@silvery/term"

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
// Kitty Protocol Manager — delegates to @silvery/term
// =============================================================================

/** Convert Ink-compatible KittyKeyboardOptions to @silvery/term KittyManagerOptions. */
export function resolveKittyManagerOptions(
  opts: KittyKeyboardOptions | undefined,
): KittyManagerOptions | undefined {
  if (!opts) return undefined
  return {
    mode: opts.mode,
    flags: opts.flags ? resolveFlags(opts.flags) : undefined,
  }
}
