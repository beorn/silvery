/**
 * Terminal profile — single source of truth for terminal detection.
 *
 * One function, one profile. Collapses the previously redundant trio of
 * `detectColor()`, `detectTerminalCaps()`, and `resolveColorTier()` into a
 * single entry point: {@link createTerminalProfile}.
 *
 * Phase 3 of `km-silvery.terminal-profile-plateau`. Phase 4 (unify entry
 * points) will thread the profile through `run()`, `createApp().run()`, and
 * `render()` so every Term instance is populated from one detection pass.
 */

import { defaultCaps } from "./detection"
import type { TerminalCaps } from "./detection"
import type { ColorTier } from "./types"
import { detectTheme } from "./theme/detect"
import type { DetectThemeOptions, ProbeInputOwner } from "./theme/detect"
import type { Theme } from "./theme/types"
import { pickColorLevel } from "./color-maps"

/**
 * Which rung of the precedence chain resolved the profile's color tier.
 *
 * Scoped specifically to **color tier** — not whole-profile provenance. Other
 * caps fields (unicode, kittyKeyboard, …) come from `detectTerminalCapsFromEnv`
 * or a caller-supplied caps object; their provenance is not tracked here.
 *
 * - `"env"` — `NO_COLOR` or `FORCE_COLOR` env var won.
 * - `"override"` — caller-supplied `colorOverride` won.
 * - `"caller-caps"` — `options.caps.colorLevel` fallback won. Note this
 *   conflates "pre-detected real caps the Term committed to" with
 *   "synthetically forced caps from a test fixture / user config"; callers
 *   that need to tell those apart pass `colorOverride` explicitly instead.
 * - `"auto"` — env-based auto-detection (TERM/COLORTERM/TERM_PROGRAM) won.
 *
 * Consumers that only need "was the tier forced?" should read
 * {@link TerminalProfile.colorForced} instead of comparing against this enum.
 * Phase 5 of `km-silvery.terminal-profile-plateau` (per /pro review 2026-04-23):
 * the flat `source` field was retired because it read like whole-profile
 * provenance but only described color tier.
 */
export type ColorProvenance = "env" | "override" | "caller-caps" | "auto"

/**
 * @deprecated Renamed to {@link ColorProvenance} (Phase 5 — /pro review
 * 2026-04-23). The old name claimed to describe the whole profile but only
 * covered color. This alias is kept so external consumers of `@silvery/ansi`
 * that imported the name directly don't break on upgrade; remove in 1.1.
 */
export type TerminalProfileSource = ColorProvenance

/**
 * A fully-resolved view of the current terminal.
 *
 * Bundled intentionally — callers shouldn't mix and match detection sources.
 * `colorTier` mirrors `caps.colorLevel`; it's exposed as a top-level field so
 * callers that only need the tier (e.g. `createStyle({ level })`) don't have
 * to reach into the caps object.
 *
 * **Immutability**: profiles are snapshot values — the whole plateau depends
 * on `colorTier === caps.colorLevel` never drifting. Every field is
 * `readonly` at the type level, and `createTerminalProfile` freezes the
 * returned object (and its nested `caps`) in dev builds so accidental
 * mutation crashes loudly. Production builds skip the freeze to keep the
 * allocation cheap; the type-level `readonly` already blocks TS writers.
 *
 * @see createTerminalProfile
 */
export interface TerminalProfile {
  /** Full terminal capabilities (including colorLevel, unicode, kittyKeyboard, etc.) */
  readonly caps: Readonly<TerminalCaps>
  /** Convenience alias for `caps.colorLevel`. */
  readonly colorTier: ColorTier
  /**
   * Was the color tier forced by env vars or a caller-supplied
   * {@link CreateTerminalProfileOptions.colorOverride}? Equivalent to
   * `colorProvenance === "env" || colorProvenance === "override"` — exposed
   * as a precomputed boolean because that's the question every pre-quantize
   * gate in run.tsx / create-app.tsx actually asks.
   *
   * "Forced" here specifically means forced *color tier* — other caps fields
   * (unicode, kittyGraphics, …) can still come from any source regardless of
   * this flag's value.
   */
  readonly colorForced: boolean
  /**
   * Which rung of the precedence chain resolved {@link colorTier}. Use
   * {@link colorForced} for the common "was the tier forced?" check; use this
   * enum only when the specific rung matters (e.g. diagnostics, theme
   * detection, debug output). See {@link ColorProvenance} for the scope
   * caveat — this describes color tier, not whole-profile provenance.
   */
  readonly colorProvenance: ColorProvenance
  /**
   * OSC-detected terminal theme, populated only when the profile was built via
   * {@link probeTerminalProfile}. Pre-quantized to {@link colorTier} when the
   * tier was {@link colorForced} so token hex values match what the pipeline
   * will actually emit.
   *
   * Absent on sync {@link createTerminalProfile} — theme detection is an async
   * OSC probe and can't run inside a sync call. Entry points that need a
   * theme (run, createApp) should use `probeTerminalProfile` instead.
   *
   * Post km-silvery.plateau-profile-theme (H2 of the /big review 2026-04-23).
   */
  readonly theme?: Theme
}

/**
 * Minimal stdout shape needed for detection.
 *
 * Using a structural type (not `NodeJS.WriteStream`) keeps `@silvery/ansi`
 * browser-safe — the canvas/DOM backends can pass `{ isTTY: false }` without
 * pulling in Node's tty types.
 */
export interface TerminalProfileStdout {
  isTTY?: boolean
  columns?: number
  rows?: number
}

/**
 * Options for {@link createTerminalProfile}.
 */
export interface CreateTerminalProfileOptions {
  /** Environment (default: `process.env`). */
  env?: Record<string, string | undefined>
  /** Output stream (default: `process.stdout`). */
  stdout?: TerminalProfileStdout
  /**
   * Explicit color tier override. Wins over `caps.colorLevel` but NOT over
   * NO_COLOR / FORCE_COLOR env vars. `null` is accepted as an alias for
   * `"mono"` (pre-plateau no-color spelling).
   */
  colorOverride?: ColorTier | null
  /**
   * Base capabilities. When provided, skips the env-based caps detection —
   * the profile uses these as the starting point. `caps.colorLevel` acts as
   * the fallback tier (used only if env+override both decline to set one).
   *
   * Typical uses:
   * - Term constructors already computed full caps → pass them here to avoid
   *   a redundant detection pass.
   * - Tests want a known-good caps fixture → pass a fully-populated object.
   */
  caps?: Partial<TerminalCaps>
}

/**
 * Build a {@link TerminalProfile} from the current environment.
 *
 * Priority for the final `colorTier` (highest wins):
 *   1. `NO_COLOR` env var → `"mono"`
 *   2. `FORCE_COLOR` env var → `0/false → mono, 1 → ansi16, 2 → 256, 3 → truecolor`
 *   3. `options.colorOverride` (caller-supplied explicit tier)
 *   4. `options.caps.colorLevel` (base caps' pre-detected tier)
 *   5. Auto-detected tier from env (TERM, COLORTERM, TERM_PROGRAM, …)
 *
 * The env-var precedence (1 & 2) matches the existing `detectColor()` semantics
 * and is observed on every silvery entry point — tests pass with explicit
 * env vars even when a caller forces a tier via `colorOverride`.
 *
 * When `options.caps` is provided, the profile treats those as the base
 * capabilities and skips the env-based caps detection — only the color tier
 * is resolved through the precedence chain above. When `options.caps` is
 * absent, the full `detectTerminalCapsFromEnv` pass runs.
 *
 * No I/O beyond whatever `detectTerminalCaps()` already does (a `defaults read`
 * call on macOS for Apple Terminal dark-mode heuristics — cached).
 *
 * @example
 * ```ts
 * // Auto-detect from process.env + process.stdout
 * const profile = createTerminalProfile()
 * console.log(profile.colorTier) // "truecolor" on Ghostty
 *
 * // Force a tier (still honors NO_COLOR / FORCE_COLOR env precedence)
 * const forced = createTerminalProfile({ colorOverride: "256" })
 *
 * // Term path — base caps already detected, just resolve color tier.
 * const termProfile = createTerminalProfile({
 *   colorOverride: userColorLevel,
 *   caps: term.caps,
 * })
 *
 * // Headless/test fixture — zero env influence
 * const fake = createTerminalProfile({
 *   env: {},
 *   stdout: { isTTY: true },
 *   colorOverride: "truecolor",
 * })
 * ```
 */
export function createTerminalProfile(
  options: CreateTerminalProfileOptions = {},
): TerminalProfile {
  const env = options.env ?? (process.env as Record<string, string | undefined>)
  const stdout: TerminalProfileStdout =
    options.stdout ?? (process.stdout as unknown as TerminalProfileStdout)

  // Env vars always win — even over an explicit caller override. This mirrors
  // `detectColor()` and is observable via FORCE_COLOR=0 forcing mono regardless
  // of what silvery was told to use.
  const envTier = envColorTier(env)

  // Non-env caller override. Accepts `null` as the legacy no-color spelling.
  const overrideTier: ColorTier | undefined =
    options.colorOverride === null ? "mono" : (options.colorOverride ?? undefined)

  // Pre-detected caps' color tier (used when caller passes full `caps` from a
  // Term constructor or test fixture).
  const baseCapsTier = options.caps?.colorLevel

  // Precedence chain: env > override > base caps > env-based auto-detect.
  // Walk the rungs explicitly so we can record which one won — callers use
  // `profile.colorForced` to tell "forced tier" from "natural tier" and
  // `profile.colorProvenance` when the specific rung matters.
  let resolvedTier: ColorTier
  let colorProvenance: ColorProvenance
  if (envTier !== undefined) {
    resolvedTier = envTier
    colorProvenance = "env"
  } else if (overrideTier !== undefined) {
    resolvedTier = overrideTier
    colorProvenance = "override"
  } else if (baseCapsTier !== undefined) {
    resolvedTier = baseCapsTier
    colorProvenance = "caller-caps"
  } else {
    resolvedTier = detectColorFromEnv(env, stdout)
    colorProvenance = "auto"
  }

  // When the caller supplied a caps base, use it as-is — don't re-detect every
  // flag from env (that would clobber backend-specific caps the Term already
  // chose, e.g. headless mono defaults). Otherwise run the full env probe.
  const baseCaps: TerminalCaps = options.caps
    ? { ...defaultCaps(), ...options.caps }
    : detectTerminalCapsFromEnv(env, stdout)

  const caps: TerminalCaps = { ...baseCaps, colorLevel: resolvedTier }

  const profile: TerminalProfile = {
    caps,
    colorTier: resolvedTier,
    colorForced: colorProvenance === "env" || colorProvenance === "override",
    colorProvenance,
  }

  return freezeProfileInDev(profile)
}

/**
 * Freeze a profile (plus its nested caps) in dev builds so
 * `profile.colorTier === profile.caps.colorLevel` and every other invariant
 * can't silently drift via direct mutation. Production builds skip the freeze
 * to keep the allocation cheap; the type-level `readonly` fields already
 * block TS-side writes.
 *
 * Per km-silvery.profile-immutable (/pro review 2026-04-23): profiles are
 * snapshot values by contract. Any caller that needs to "change" a profile
 * must build a new one — the plateau-era single-source-of-truth guarantee
 * leans on this.
 */
function freezeProfileInDev(profile: TerminalProfile): TerminalProfile {
  if (process.env.NODE_ENV === "production") return profile
  Object.freeze(profile.caps)
  Object.freeze(profile)
  return profile
}

// ============================================================================
// probeTerminalProfile — async profile with bundled theme detection
// ============================================================================

/**
 * Options for {@link probeTerminalProfile}. Extends the sync factory options
 * with the async-only fields a theme probe needs.
 */
export interface ProbeTerminalProfileOptions extends CreateTerminalProfileOptions {
  /**
   * Probe the terminal's theme via OSC 10/11/4 and bundle the result as
   * `profile.theme`. Default `true` — the whole point of using the async
   * variant is to get the theme alongside caps. Set `false` to skip the
   * probe (no OSC writes) while still resolving a {@link TerminalProfile}
   * identical to the sync path.
   */
  probeTheme?: boolean
  /**
   * Fallback scheme when the OSC probe returns partial / no data. Matches
   * {@link DetectThemeOptions.fallbackDark}.
   */
  fallbackDark?: DetectThemeOptions["fallbackDark"]
  /** Fallback for light terminals (overrides `fallbackDark`). */
  fallbackLight?: DetectThemeOptions["fallbackLight"]
  /** Per-OSC-query timeout in ms (default 150 — matches `detectTheme`). */
  timeoutMs?: number
  /**
   * Optional {@link ProbeInputOwner} (the structural type `detectTheme`
   * accepts). When provided, the probe routes OSC queries through the
   * owner's `probe()` method instead of touching `process.stdin` directly —
   * required inside a running TUI session. Callers in `@silvery/ag-term`
   * construct a transient `InputOwner` around this call; standalone callers
   * can omit it.
   */
  input?: ProbeInputOwner
}

/**
 * Build a {@link TerminalProfile} with an OSC-detected `theme` bundled in.
 *
 * Async because the theme probe writes OSC queries to stdout and waits for
 * responses on stdin. This is the Phase-H2 variant of
 * {@link createTerminalProfile} — everything the sync factory does, plus:
 *
 * 1. Run `detectTheme` (OSC 4/10/11 probe with fallback) once.
 * 2. Pre-quantize the resulting theme via {@link pickColorLevel} when the
 *    tier was forced ({@link TerminalProfile.colorForced} is `true`) so
 *    token hex values match what the pipeline will actually emit.
 * 3. Return the profile with `theme` populated — one detection, one profile
 *    flowing end-to-end through run() / createApp().
 *
 * Call sites previously ran `createTerminalProfile(...)` + `detectTheme(...)`
 * + `pickColorLevel(...)` as three separate steps on both the Term-path and
 * options-path branches. Collapsing that into one function removes the
 * duplication and the possibility of the three views disagreeing about
 * what was forced.
 *
 * When `probeTheme` is `false`, behaves like the sync {@link createTerminalProfile}
 * but wrapped in a Promise — useful for call sites that want uniform async
 * treatment regardless of whether a probe is needed.
 *
 * @example
 * ```ts
 * // Node entry point with TUI-safe probing.
 * const profile = await probeTerminalProfile({
 *   colorOverride: options.colorLevel,
 *   caps: term.profile.caps,
 *   fallbackDark: nord,
 *   fallbackLight: catppuccinLatte,
 *   input: probeOwner, // structural InputOwner from @silvery/ag-term
 * })
 * // profile.caps, profile.colorTier, profile.colorForced, profile.theme
 * ```
 *
 * @see createTerminalProfile — sync variant, no theme probe
 * @see DetectThemeOptions — the underlying probe options this wraps
 */
export async function probeTerminalProfile(
  options: ProbeTerminalProfileOptions = {},
): Promise<TerminalProfile> {
  // Reuse the sync resolution for caps + colorTier + source — single source
  // of truth for the precedence chain. Only the theme bundling is new.
  const profile = createTerminalProfile(options)

  // `probeTheme: false` skips the OSC round-trip but still returns a valid
  // Promise — lets callers unify their entry-point flow on one async path.
  if (options.probeTheme === false) return profile

  // Run the OSC probe. The detectTheme docstring documents its own fallbacks
  // (mono/ansi16 tiers skip the probe and return canned themes); we pass the
  // profile's caps through so those short-circuits fire when appropriate.
  const theme = await detectTheme({
    caps: profile.caps,
    fallbackDark: options.fallbackDark,
    fallbackLight: options.fallbackLight,
    timeoutMs: options.timeoutMs,
    input: options.input,
  })

  // Pre-quantize when the tier was forced — same gate run.tsx applied
  // inline. With the gate co-located with the profile factory, entry-point
  // branches collapse to one `await probeTerminalProfile(...)` call.
  const resolvedTheme = profile.colorForced ? pickColorLevel(theme, profile.colorTier) : theme

  // Re-freeze: the sync factory already froze `profile`, but `{ ...profile,
  // theme }` creates a fresh object that's not frozen. The theme-bundled
  // profile must keep the same immutability contract as the sync variant.
  return freezeProfileInDev({ ...profile, theme: resolvedTheme })
}

// ============================================================================
// Internal — parameterized variants of the legacy detection functions.
// ============================================================================

/**
 * Deterministic variant of {@link detectColor} that takes env+stdout as args.
 * Exported-internal so the shim `detectColor()` can delegate without reading
 * `process.env` twice.
 */
export function detectColorFromEnv(
  env: Record<string, string | undefined>,
  stdout: TerminalProfileStdout,
): ColorTier {
  // NO_COLOR takes precedence (see https://no-color.org/)
  if (env.NO_COLOR !== undefined) return "mono"

  // FORCE_COLOR overrides detection
  const forceColor = env.FORCE_COLOR
  if (forceColor !== undefined) {
    if (forceColor === "0" || forceColor === "false") return "mono"
    if (forceColor === "1") return "ansi16"
    if (forceColor === "2") return "256"
    if (forceColor === "3") return "truecolor"
    return "ansi16"
  }

  if (!stdout.isTTY) return "mono"
  if (env.TERM === "dumb") return "mono"

  const colorTerm = env.COLORTERM
  if (colorTerm === "truecolor" || colorTerm === "24bit") return "truecolor"

  const term = env.TERM ?? ""
  if (
    term.includes("truecolor") ||
    term.includes("24bit") ||
    term.includes("xterm-ghostty") ||
    term.includes("xterm-kitty") ||
    term.includes("wezterm")
  ) {
    return "truecolor"
  }
  if (term.includes("256color") || term.includes("256")) return "256"

  const termProgram = env.TERM_PROGRAM
  if (termProgram === "iTerm.app" || termProgram === "Apple_Terminal") {
    return termProgram === "iTerm.app" ? "truecolor" : "256"
  }
  if (termProgram === "Ghostty" || termProgram === "WezTerm") return "truecolor"
  if (env.KITTY_WINDOW_ID) return "truecolor"

  if (term.includes("xterm") || term.includes("color") || term.includes("ansi")) {
    return "ansi16"
  }

  if (CI_ENVS.some((name) => env[name] !== undefined)) return "ansi16"
  if (env.WT_SESSION) return "truecolor"

  return "ansi16"
}

/**
 * Env-only FORCE_COLOR / NO_COLOR tier probe. Returns `undefined` when no
 * env override applies. Used by {@link createTerminalProfile} to enforce that
 * env always beats caller-supplied overrides.
 */
function envColorTier(
  env: Record<string, string | undefined>,
): ColorTier | undefined {
  if (env.NO_COLOR !== undefined) return "mono"
  const force = env.FORCE_COLOR
  if (force !== undefined) {
    if (force === "0" || force === "false") return "mono"
    if (force === "1") return "ansi16"
    if (force === "2") return "256"
    if (force === "3") return "truecolor"
    return "ansi16"
  }
  return undefined
}

/**
 * Deterministic variant of {@link detectTerminalCaps}. Reads env explicitly
 * (no `process.env` access) so callers can inject custom environments in
 * tests. Color tier is derived via {@link detectColorFromEnv} and therefore
 * honors FORCE_COLOR / NO_COLOR.
 */
export function detectTerminalCapsFromEnv(
  env: Record<string, string | undefined>,
  stdout: TerminalProfileStdout,
): TerminalCaps {
  const program = env.TERM_PROGRAM ?? ""
  const version = env.TERM_PROGRAM_VERSION ?? ""
  const term = env.TERM ?? ""
  const noColor = env.NO_COLOR !== undefined

  const isAppleTerminal = program === "Apple_Terminal"
  const colorLevel: ColorTier = noColor ? "mono" : detectColorFromEnv(env, stdout)

  const isKitty = term === "xterm-kitty"
  const isITerm = program === "iTerm.app"
  // TERM_PROGRAM is capitalized "Ghostty" (matches detectColorFromEnv and every
  // other silvery comparison site). Pre-plateau lowercase comparison meant every
  // Ghostty cap flag (kittyKeyboard, kittyGraphics, osc52, hyperlinks, …) was
  // falsely false. Regression test in tests/profile.test.ts pins the full cap
  // matrix so this can't drift again. See km-silvery.ghostty-case-sensitivity.
  const isGhostty = program === "Ghostty"
  const isWezTerm = program === "WezTerm"
  const isAlacritty = program === "Alacritty"
  const isFoot = term === "foot" || term === "foot-extra"
  const isModern = isKitty || isITerm || isGhostty || isWezTerm || isFoot

  let isKittyWithTextSizing = false
  if (isKitty) {
    const parts = version.split(".")
    const major = Number(parts[0]) || 0
    const minor = Number(parts[1]) || 0
    isKittyWithTextSizing = major > 0 || (major === 0 && minor >= 40)
  }

  let darkBackground = !isAppleTerminal
  const colorFgBg = env.COLORFGBG
  if (colorFgBg) {
    const parts = colorFgBg.split(";")
    const bg = parseInt(parts[parts.length - 1] ?? "", 10)
    if (!isNaN(bg)) darkBackground = bg < 7
  } else if (isAppleTerminal) {
    darkBackground = detectMacOSDarkMode()
  }

  let nerdfont = isModern || isAlacritty
  const nfEnv = env.NERDFONT
  if (nfEnv === "0" || nfEnv === "false") nerdfont = false
  else if (nfEnv === "1" || nfEnv === "true") nerdfont = true

  const underlineExtensions = isModern || isAlacritty

  // Unicode: modern terminals + explicit UTF-8 locales + Windows Terminal +
  // CI runners we know emit UTF-8. Absorbed from the pre-plateau standalone
  // `detectUnicode()` helper (km-silvery.unicode-plateau Phase 1) so caps is
  // the single source of truth and every consumer reads `caps.unicode` rather
  // than re-probing env. Default `false` matches the legacy helper's "unknown
  // terminal → be safe" behavior.
  const unicode =
    isModern ||
    env.WT_SESSION !== undefined ||
    env.KITTY_WINDOW_ID !== undefined ||
    utf8Locale(env) ||
    termImpliesUnicode(term) ||
    (env.CI !== undefined && env.GITHUB_ACTIONS !== undefined)

  // defaultCaps supplies the structural shape; we overwrite every dynamic field
  // explicitly so any future addition in defaultCaps gets a sensible default.
  return {
    ...defaultCaps(),
    program,
    version,
    term,
    colorLevel,
    kittyKeyboard: isKitty || isGhostty || isWezTerm || isFoot,
    kittyGraphics: isKitty || isGhostty,
    sixel: isFoot || isWezTerm,
    osc52: isModern || isAlacritty,
    hyperlinks: isModern || isAlacritty,
    notifications: isITerm || isKitty,
    bracketedPaste: true,
    mouse: true,
    syncOutput: isModern || isAlacritty,
    unicode,
    underlineStyles: underlineExtensions,
    underlineColor: underlineExtensions,
    textEmojiWide: !isAppleTerminal,
    textSizingSupported: isKittyWithTextSizing,
    darkBackground,
    nerdfont,
  }
}

/**
 * Does `env.LANG` / `LC_ALL` / `LC_CTYPE` name a UTF-8 locale? Absorbed from
 * the retired `detectUnicode()` helper.
 */
function utf8Locale(env: Record<string, string | undefined>): boolean {
  const lang = (env.LANG ?? env.LC_ALL ?? env.LC_CTYPE ?? "").toLowerCase()
  return lang.includes("utf-8") || lang.includes("utf8")
}

/**
 * Does the `TERM` value imply a multiplexer / terminal family we know renders
 * unicode correctly? Absorbed from the retired `detectUnicode()` helper.
 */
function termImpliesUnicode(term: string): boolean {
  return (
    term.includes("xterm") ||
    term.includes("rxvt") ||
    term.includes("screen") ||
    term.includes("tmux")
  )
}

// ============================================================================
// Legacy helpers re-used from detection.ts
// ============================================================================

const CI_ENVS = [
  "CI",
  "GITHUB_ACTIONS",
  "GITLAB_CI",
  "JENKINS_URL",
  "BUILDKITE",
  "CIRCLECI",
  "TRAVIS",
]

let cachedMacOSDarkMode: boolean | undefined

function detectMacOSDarkMode(): boolean {
  if (cachedMacOSDarkMode !== undefined) return cachedMacOSDarkMode
  try {
    const { spawnSync } = require("child_process") as typeof import("child_process")
    const result = spawnSync("defaults", ["read", "-g", "AppleInterfaceStyle"], {
      encoding: "utf-8",
      timeout: 500,
    })
    cachedMacOSDarkMode = result.stdout?.trim() === "Dark"
  } catch {
    cachedMacOSDarkMode = false
  }
  return cachedMacOSDarkMode
}

// Re-export the shim consumers still need to import alongside the profile.
export { defaultCaps }
