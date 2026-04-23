/**
 * Terminal capability flags — what the terminal *can* do at the wire level,
 * plus low-confidence environment heuristics about theme/font/emoji rendering.
 *
 * {@link TerminalCaps} is the single caps type across the stack. Renderers,
 * the measurer, and style factories all branch on it. Resolution is owned by
 * {@link ./profile} — call `createTerminalProfile()` (sync) or
 * `probeTerminalProfile()` (async, theme-aware) once and read `profile.caps`
 * everywhere downstream. No other module reads `process.env` to decide caps.
 *
 * History (post unicode-plateau, 2026-04-23):
 * - `detectColor()` / `detectTerminalCaps()` shims were removed in H6 of the
 *   /big review — every "what's the color tier?" / "what's the full caps?"
 *   call now routes through the profile factory.
 * - `detectUnicode()` / `detectExtendedUnderline()` were retired in Phase 1 —
 *   their env-reading logic lives on `caps.unicode` / `caps.underlineStyles` /
 *   `caps.underlineColor`, resolved by `detectTerminalProfileFromEnv`.
 * - `detectCursor(stdout)` was retired in Phase 3 — its `"isTTY + !dumb"` gate
 *   lives on `caps.cursor`.
 * - `detectInput(stdin)` was retired in Phase 4 — its `"stdin.isTTY +
 *   setRawMode-available"` gate lives on `caps.input`, derived from the
 *   optional `stdin` argument on `createTerminalProfile`.
 *
 * The former `TerminalHeuristics` namespace (plateau-naming-polish 2026-04-23)
 * was absorbed into `TerminalCaps` with a `maybe` prefix per-field
 * (`maybeDarkBackground`, `maybeNerdFont`, `maybeWideEmojis`) — the prefix
 * keeps uncertainty loud at every read site instead of hiding it behind a
 * struct. Three fields don't earn a namespace.
 */

import type { ColorLevel, UnderlineStyle } from "./types"

// Forward re-export — profile.ts defines ColorProvenance but caps consumers
// want one import for everything they need.
export type { ColorProvenance } from "./profile"
import type { ColorProvenance } from "./profile"

/**
 * Pure protocol capability flags plus low-confidence environment heuristics —
 * what the terminal *can* do at the wire level, plus what the system guesses
 * about theme/font/emoji rendering. Used by renderers / measurer for
 * pre-flight branching.
 *
 * Post km-silvery.plateau-naming-polish (2026-04-23):
 * - `TerminalHeuristics` was absorbed into this type. Guesses live alongside
 *   hard facts but carry a `maybe` prefix so the uncertainty is loud at every
 *   read site (`caps.maybeDarkBackground` vs `caps.cursor`).
 *
 * Post km-silvery.caps-restructure (Phase 7, 2026-04-23): the original flat
 * 22-field shape was split into {@link TerminalCaps} (this type) and
 * {@link TerminalEmulator} (environment identity — program/version/TERM).
 * Both live on `profile.{caps,emulator}`.
 *
 * Renames from the old flat shape:
 * - `textSizingSupported` → `textSizing` (drops the verbose suffix)
 * - `underlineStyles: boolean` → `underlineStyles: readonly UnderlineStyle[]`
 *   so a terminal that supports curly but not dotted can report that precisely
 * - `colorForced` + `colorProvenance` moved INTO caps (they describe color
 *   resolution, which is caps-adjacent)
 *
 * Phase 7 briefly renamed `colorLevel` → `colorTier` on caps, then reverted
 * in plateau-naming-polish (2026-04-23) because `level` was already the
 * canonical vocabulary across the stack (Style.level, createStyle({ level }),
 * pickColorLevel, Pipeline.ColorLevel, run({ colorLevel })). Alignment won.
 */
export interface TerminalCaps {
  // -------------------------------------------------------------------------
  // IO / screen
  // -------------------------------------------------------------------------

  /** Can the host reposition the cursor? True when the output stream is a
   * TTY and `TERM` is not `"dumb"`. Absorbed from the standalone
   * `detectCursor()` helper in unicode-plateau Phase 3. */
  readonly cursor: boolean
  /** Can the host read raw keystrokes? True when the input stream is a TTY
   * and supports `setRawMode`. Absorbed from the standalone
   * `detectInput()` helper in unicode-plateau Phase 4. */
  readonly input: boolean

  // -------------------------------------------------------------------------
  // Color (gradation)
  // -------------------------------------------------------------------------

  /** Color support level. See {@link ColorLevel}. */
  readonly colorLevel: ColorLevel
  /**
   * Was the color tier forced by env vars (NO_COLOR / FORCE_COLOR) or a
   * caller-supplied `colorLevel`? Equivalent to
   * `colorProvenance === "env" || colorProvenance === "override"` — exposed
   * as a precomputed boolean because that's the question every pre-quantize
   * gate in run.tsx / create-app.tsx actually asks.
   *
   * Moved from {@link ./profile#TerminalProfile} into caps in Phase 7 — it
   * describes *color* resolution, which is caps-adjacent, so grouping it here
   * means all color-tier metadata travels as one unit.
   */
  readonly colorForced: boolean
  /**
   * Which rung of the precedence chain resolved {@link colorLevel}. Use
   * {@link colorForced} for the common "was the tier forced?" check; use this
   * enum only when the specific rung matters (e.g. diagnostics, theme
   * detection, debug output).
   */
  readonly colorProvenance: ColorProvenance

  // -------------------------------------------------------------------------
  // Text / unicode
  // -------------------------------------------------------------------------

  /** Unicode/emoji support */
  readonly unicode: boolean
  /**
   * Extended SGR 4:x underline styles this terminal advertises. Empty array
   * means "only the standard SGR 4 single underline is known to work" and
   * consumers should fall back accordingly.
   *
   * Phase 7 upgrade: was a single `boolean` (all-or-nothing). With the array
   * a terminal that supports curly but not dotted can report that precisely;
   * style.ts now checks `caps.underlineStyles.includes("curly")` per style.
   */
  readonly underlineStyles: readonly UnderlineStyle[]
  /** SGR 58 underline color */
  readonly underlineColor: boolean
  /** OSC 66 text sizing protocol likely supported (Kitty 0.40+, Ghostty).
   * Phase 7 rename: dropped the verbose `Supported` suffix. */
  readonly textSizing: boolean

  // -------------------------------------------------------------------------
  // Input protocols
  // -------------------------------------------------------------------------

  /** Kitty keyboard protocol supported */
  readonly kittyKeyboard: boolean
  /** Bracketed paste mode */
  readonly bracketedPaste: boolean
  /** SGR mouse tracking */
  readonly mouse: boolean

  // -------------------------------------------------------------------------
  // Graphics
  // -------------------------------------------------------------------------

  /** Kitty graphics protocol (inline images) */
  readonly kittyGraphics: boolean
  /** Sixel graphics supported */
  readonly sixel: boolean

  // -------------------------------------------------------------------------
  // OSC / control
  // -------------------------------------------------------------------------

  /** OSC 52 clipboard */
  readonly osc52: boolean
  /** OSC 8 hyperlinks */
  readonly hyperlinks: boolean
  /** OSC 9/99 notifications */
  readonly notifications: boolean
  /** Synchronized output (DEC 2026) */
  readonly syncOutput: boolean

  // -------------------------------------------------------------------------
  // Environment heuristics (low-confidence guesses)
  //
  // These are *guesses* based on env-var sniffing, not protocol-verified
  // facts. They travel alongside hard caps because call sites need both
  // classes of information, but the `maybe` prefix keeps the uncertainty
  // visible inline. Callers override them in `createTerminalProfile({caps})`
  // without touching hard caps.
  //
  // Absorbed from the former `TerminalHeuristics` namespace in
  // km-silvery.plateau-naming-polish (2026-04-23).
  // -------------------------------------------------------------------------

  /** Heuristic: likely dark background (for theme selection). Use
   * {@link probeTerminalProfile} with OSC 11 to resolve definitively. */
  readonly maybeDarkBackground: boolean
  /** Heuristic: likely has Nerd Font installed (for icon selection).
   * Sniffed from TERM / LC_TERMINAL / known-modern terminal programs. */
  readonly maybeNerdFont: boolean
  /** Heuristic: text-presentation emoji (`⚠` `☑` `⭐` — `Extended_Pictographic`
   * without default `Emoji_Presentation`) rendered as 2 cells. Modern terminals
   * (Ghostty, iTerm, Kitty) render these at emoji width (2 cells); Terminal.app
   * renders them at text width (1 cell). Affects measurer + layout. */
  readonly maybeWideEmojis: boolean
}

/**
 * Default capabilities — modern-terminal-ish defaults for headless / emulator /
 * unknown contexts. Heuristic fields (`maybe*`) bake in "probably dark, no
 * nerd font, wide emojis like Ghostty/iTerm" — callers override via
 * `createTerminalProfile({caps})`.
 */
export function defaultCaps(): TerminalCaps {
  return {
    cursor: false,
    input: false,
    colorLevel: "truecolor",
    colorForced: false,
    colorProvenance: "auto",
    unicode: true,
    underlineStyles: ["double", "curly", "dotted", "dashed"],
    underlineColor: true,
    textSizing: false,
    kittyKeyboard: false,
    bracketedPaste: true,
    mouse: true,
    kittyGraphics: false,
    sixel: false,
    osc52: false,
    hyperlinks: false,
    notifications: false,
    syncOutput: false,
    maybeDarkBackground: true,
    maybeNerdFont: false,
    maybeWideEmojis: true,
  }
}
