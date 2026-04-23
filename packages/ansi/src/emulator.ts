/**
 * Terminal emulator identity — facts about *what terminal this IS*, as
 * opposed to {@link ./caps#TerminalCaps} which describes what it can DO.
 *
 * Identity doesn't gate rendering; it's what tests, diagnostics, and
 * probe-cache keys discriminate on (e.g. `program@version` is the cache key
 * used by `@silvery/ag-term/text-sizing` per km-silvery.unicode-plateau
 * Phase 2).
 *
 * Resolved once by {@link ./profile#createTerminalProfile} and exposed as
 * `profile.emulator` — no other module reads TERM / TERM_PROGRAM.
 */

/**
 * Environment identity — facts about what terminal this IS. Separate from
 * {@link ./caps#TerminalCaps} because identity doesn't gate rendering; it's
 * what tests, diagnostics, and probe-cache keys discriminate on.
 *
 * Post km-silvery.plateau-naming-polish (2026-04-23): renamed from
 * `TerminalIdentity` → `TerminalEmulator` (the thing IS a terminal emulator,
 * matches `TERM_PROGRAM` provenance) and `termName` → `TERM` (matches the
 * env var name and shell convention).
 */
export interface TerminalEmulator {
  /** Terminal program name (from TERM_PROGRAM). */
  readonly program: string
  /** Terminal program version string (from TERM_PROGRAM_VERSION). Empty when
   * the host doesn't advertise a version. Together with `program`, forms the
   * `program@version` fingerprint used as the probe-cache key in
   * `@silvery/ag-term/text-sizing`. See km-silvery.unicode-plateau Phase 2. */
  readonly version: string
  /** Value of the `TERM` env var (`"xterm-kitty"`, `"xterm-256color"`, …).
   * Named `TERM` rather than `termName` to mirror the env-var name
   * explicitly — the field's sole source is the `TERM` environment entry,
   * resolved once by `createTerminalProfile`. */
  readonly TERM: string
}

/**
 * Default emulator identity — unknown terminal, unversioned, no `TERM` set.
 * Matches what a non-TTY Node process sees when run from CI without env vars.
 */
export function defaultEmulator(): TerminalEmulator {
  return {
    program: "",
    version: "",
    TERM: "",
  }
}
