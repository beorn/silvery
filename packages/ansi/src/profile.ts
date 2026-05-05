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
 *
 * Post km-silvery.plateau-naming-polish (2026-04-23): 2-layer shape —
 * `profile.caps` (protocol flags + `maybe*` heuristics) and `profile.emulator`
 * (program/version/TERM). The former `profile.heuristics` namespace was
 * absorbed into caps with a `maybe` prefix per-field.
 *
 * Phase 7 of `km-silvery.caps-restructure` (Pro verdict 2026-04-23) originally
 * split the flat `TerminalCaps` into three layers; the heuristics layer proved
 * too small to earn its own namespace and was collapsed in the naming polish.
 */

import { defaultCaps, type TerminalCaps } from "./caps"
import { defaultEmulator, type TerminalEmulator } from "./emulator"
import type { ColorLevel } from "./types"
import { detectTheme } from "./theme/detect"
import type { DetectThemeOptions, ProbeInputOwner } from "./theme/detect"
import type { Theme } from "./theme/types"
import { pickColorLevel } from "./color-maps"

/**
 * Which rung of the precedence chain resolved the profile's color tier.
 *
 * Scoped specifically to **color tier** — not whole-profile provenance. Other
 * caps fields (unicode, kittyKeyboard, …) come from `detectTerminalProfileFromEnv`
 * or a caller-supplied caps object; their provenance is not tracked here.
 *
 * - `"env"` — `NO_COLOR` or `FORCE_COLOR` env var won.
 * - `"override"` — caller-supplied `colorLevel` won.
 * - `"caller-caps"` — `options.caps.colorLevel` fallback won. Note this
 *   conflates "pre-detected real caps the Term committed to" with
 *   "synthetically forced caps from a test fixture / user config"; callers
 *   that need to tell those apart pass `colorLevel` explicitly instead.
 * - `"auto"` — env-based auto-detection (TERM/COLORTERM/TERM_PROGRAM) won.
 *
 * Consumers that only need "was the tier forced?" should read
 * {@link TerminalCaps.colorForced} instead of comparing against this enum.
 * Phase 5 of `km-silvery.terminal-profile-plateau` (per /pro review 2026-04-23):
 * the flat `source` field was retired because it read like whole-profile
 * provenance but only described color tier.
 */
export type ColorProvenance = "env" | "override" | "caller-caps" | "auto"

/**
 * A fully-resolved view of the current terminal.
 *
 * Bundled intentionally — callers shouldn't mix and match detection sources.
 * `colorLevel` mirrors `caps.colorLevel`; it's exposed as a top-level field so
 * callers that only need the tier (e.g. `createStyle({ level })`) don't have
 * to reach into the caps object.
 *
 * **Immutability**: profiles are snapshot values — the whole plateau depends
 * on `colorLevel === caps.colorLevel` never drifting. Every field is
 * `readonly` at the type level, and `createTerminalProfile` freezes the
 * returned object (and its nested `caps`) in dev builds so accidental
 * mutation crashes loudly. Production builds skip the freeze to keep the
 * allocation cheap; the type-level `readonly` already blocks TS writers.
 *
 * Post km-silvery.plateau-naming-polish (2026-04-23): 2-layer shape — `emulator`
 * (what terminal IS this) and `caps` (what can it do, including `maybe*`
 * heuristics). The original Phase 7 3-layer shape collapsed because the
 * 3-field heuristics namespace was pulling its weight.
 *
 * @see createTerminalProfile
 */
export interface TerminalProfile {
  /** Environment identity — what terminal IS this (program, version, TERM). */
  readonly emulator: TerminalEmulator
  /** Protocol-capability flags + low-confidence `maybe*` heuristics. Also
   * carries `colorLevel` / `colorForced` / `colorProvenance`. */
  readonly caps: TerminalCaps
  /** Convenience alias for `caps.colorLevel`. Exposed as a top-level field
   * because callers that only need the tier (e.g. `createStyle({ level })`)
   * shouldn't have to reach into the caps object. */
  readonly colorLevel: ColorLevel
  /**
   * OSC-detected terminal theme, populated only when the profile was built via
   * {@link probeTerminalProfile}. Pre-quantized to {@link colorLevel} when the
   * tier was {@link TerminalCaps.colorForced} so token hex values match what
   * the pipeline will actually emit.
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
 * Default profile — bundles {@link defaultCaps} and {@link defaultEmulator}
 * into a single TerminalProfile value. Handy when a caller wants a
 * deterministic profile without running detection (tests, the headless Term,
 * canvas/DOM backends).
 */
export function defaultProfile(): TerminalProfile {
  const caps = defaultCaps()
  return {
    emulator: defaultEmulator(),
    caps,
    colorLevel: caps.colorLevel,
  }
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
 * Minimal stdin shape needed for input capability detection.
 *
 * Structural like {@link TerminalProfileStdout} — browser/canvas backends
 * that have no stdin pass `undefined` and `caps.input` resolves to `false`
 * via the default. Absorbed from the retired `detectInput(stdin)` helper
 * in unicode-plateau Phase 4.
 */
export interface TerminalProfileStdin {
  isTTY?: boolean
  setRawMode?: (mode: boolean) => unknown
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
   * Input stream (default: `process.stdin`). Used to derive `caps.input` —
   * whether the host can read raw keystrokes. Pass `undefined` explicitly
   * (or omit on non-Node targets) to force `caps.input = false`.
   */
  stdin?: TerminalProfileStdin
  /**
   * Explicit color tier override. Wins over `caps.colorLevel` but NOT over
   * NO_COLOR / FORCE_COLOR env vars. `null` is accepted as an alias for
   * `"mono"` (pre-plateau no-color spelling).
   */
  colorLevel?: ColorLevel | null
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
  /**
   * Base emulator identity. When provided, skips identity detection and uses
   * these values. Typical use: Term constructors that already resolved
   * TERM_PROGRAM from their stdin/stdout context.
   */
  emulator?: Partial<TerminalEmulator>
}

/**
 * Build a {@link TerminalProfile} from the current environment.
 *
 * Priority for the final `colorLevel` (highest wins):
 *   1. `NO_COLOR` env var → `"mono"`
 *   2. `FORCE_COLOR` env var → `0/false → mono, 1 → ansi16, 2 → 256, 3 → truecolor`
 *   3. `options.colorLevel` (caller-supplied explicit tier)
 *   4. `options.caps.colorLevel` (base caps' pre-detected tier)
 *   5. Auto-detected tier from env (TERM, COLORTERM, TERM_PROGRAM, …)
 *
 * The env-var precedence (1 & 2) matches the existing `detectColor()` semantics
 * and is observed on every silvery entry point — tests pass with explicit
 * env vars even when a caller forces a tier via `colorLevel`.
 *
 * When `options.caps` is provided, the profile treats those as the base
 * capabilities and skips the env-based caps detection — only the color tier
 * is resolved through the precedence chain above. When `options.caps` is
 * absent, the full `detectTerminalProfileFromEnv` pass runs.
 *
 * No I/O beyond whatever `detectTerminalCaps()` already does (a `defaults read`
 * call on macOS for Apple Terminal dark-mode heuristics — cached).
 *
 * @example
 * ```ts
 * // Auto-detect from process.env + process.stdout
 * const profile = createTerminalProfile()
 * console.log(profile.colorLevel) // "truecolor" on Ghostty
 *
 * // Force a tier (still honors NO_COLOR / FORCE_COLOR env precedence)
 * const forced = createTerminalProfile({ colorLevel: "256" })
 *
 * // Term path — base caps already detected, just resolve color tier.
 * const termProfile = createTerminalProfile({
 *   colorLevel: userColorLevel,
 *   caps: term.caps,
 * })
 *
 * // Headless/test fixture — zero env influence
 * const fake = createTerminalProfile({
 *   env: {},
 *   stdout: { isTTY: true },
 *   colorLevel: "truecolor",
 * })
 * ```
 */
export function createTerminalProfile(options: CreateTerminalProfileOptions = {}): TerminalProfile {
  const env = options.env ?? (process.env as Record<string, string | undefined>)
  const stdout: TerminalProfileStdout =
    options.stdout ?? (process.stdout as unknown as TerminalProfileStdout)
  // stdin defaults to `process.stdin` — same ambient-node pattern as stdout.
  // Callers on non-Node targets (browser, canvas) pass `stdin: undefined`
  // explicitly and `caps.input` resolves to false via the check below.
  const stdin: TerminalProfileStdin | undefined =
    "stdin" in options ? options.stdin : (process.stdin as unknown as TerminalProfileStdin)

  // Env vars always win — even over an explicit caller override. This mirrors
  // `detectColor()` and is observable via FORCE_COLOR=0 forcing mono regardless
  // of what silvery was told to use.
  const envTier = envColorTier(env)

  // Non-env caller override. Accepts `null` as the legacy no-color spelling.
  const overrideTier: ColorLevel | undefined =
    options.colorLevel === null ? "mono" : (options.colorLevel ?? undefined)

  // Pre-detected caps' color tier (used when caller passes full `caps` from a
  // Term constructor or test fixture).
  const baseCapsTier = options.caps?.colorLevel

  // Precedence chain: env > override > base caps > env-based auto-detect.
  // Walk the rungs explicitly so we can record which one won — callers use
  // `caps.colorForced` to tell "forced tier" from "natural tier" and
  // `caps.colorProvenance` when the specific rung matters.
  let resolvedTier: ColorLevel
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
  const detected: TerminalProfile | undefined = options.caps
    ? undefined
    : detectTerminalProfileFromEnv(env, stdout)

  const baseCaps: TerminalCaps = options.caps
    ? { ...defaultCaps(), ...options.caps }
    : (detected as TerminalProfile).caps

  const baseEmulator: TerminalEmulator = options.emulator
    ? { ...defaultEmulator(), ...options.emulator }
    : (detected?.emulator ?? defaultEmulator())

  // caps.input is orthogonal to env — it depends on stdin's TTY + raw-mode
  // availability. When a caller passed pre-computed `options.caps`, honor
  // their `input` flag (if set); otherwise derive from stdin. Keeping this
  // as a separate overlay avoids confusing the env-probe path.
  const inputResolved =
    options.caps?.input ?? (stdin?.isTTY === true && typeof stdin.setRawMode === "function")

  const caps: TerminalCaps = {
    ...baseCaps,
    colorLevel: resolvedTier,
    colorForced: colorProvenance === "env" || colorProvenance === "override",
    colorProvenance,
    input: inputResolved,
  }

  const profile: TerminalProfile = {
    emulator: baseEmulator,
    caps,
    colorLevel: resolvedTier,
  }

  return freezeProfileInDev(profile)
}

/**
 * Freeze a profile (plus its nested caps / emulator) in dev builds so
 * `profile.colorLevel === profile.caps.colorLevel` and every other invariant
 * can't silently drift via direct mutation. Production builds skip the
 * freeze to keep the allocation cheap; the type-level `readonly` fields
 * already block TS-side writes.
 *
 * Per km-silvery.profile-immutable (/pro review 2026-04-23): profiles are
 * snapshot values by contract. Any caller that needs to "change" a profile
 * must build a new one — the plateau-era single-source-of-truth guarantee
 * leans on this.
 */
function freezeProfileInDev(profile: TerminalProfile): TerminalProfile {
  if (process.env.NODE_ENV === "production") return profile
  Object.freeze(profile.caps)
  Object.freeze(profile.emulator)
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
 *    tier was forced ({@link TerminalCaps.colorForced} is `true`) so
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
 *   colorLevel: options.colorLevel,
 *   caps: term.profile.caps,
 *   fallbackDark: nord,
 *   fallbackLight: catppuccinLatte,
 *   input: probeOwner, // structural InputOwner from @silvery/ag-term
 * })
 * // profile.caps, profile.colorLevel, profile.caps.colorForced, profile.theme
 * ```
 *
 * @see createTerminalProfile — sync variant, no theme probe
 * @see DetectThemeOptions — the underlying probe options this wraps
 */
export async function probeTerminalProfile(
  options: ProbeTerminalProfileOptions = {},
): Promise<TerminalProfile> {
  // Reuse the sync resolution for caps + colorLevel + source — single source
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
  const resolvedTheme = profile.caps.colorForced ? pickColorLevel(theme, profile.colorLevel) : theme

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
): ColorLevel {
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
function envColorTier(env: Record<string, string | undefined>): ColorLevel | undefined {
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
 * Deterministic env-based detection of the full two-layer profile
 * ({@link TerminalCaps} + {@link TerminalEmulator}). Reads env explicitly
 * (no `process.env` access) so callers can inject custom environments in
 * tests. Color tier is derived via {@link detectColorFromEnv} and therefore
 * honors FORCE_COLOR / NO_COLOR.
 */
export function detectTerminalProfileFromEnv(
  env: Record<string, string | undefined>,
  stdout: TerminalProfileStdout,
): TerminalProfile {
  const program = env.TERM_PROGRAM ?? ""
  const programLower = program.toLowerCase()
  const version = env.TERM_PROGRAM_VERSION ?? ""
  const TERM = env.TERM ?? ""
  const noColor = env.NO_COLOR !== undefined

  const isAppleTerminal = programLower === "apple_terminal"
  const colorLevel: ColorLevel = noColor ? "mono" : detectColorFromEnv(env, stdout)

  const isKitty = TERM === "xterm-kitty"
  const isITerm = programLower === "iterm.app"
  // Case-insensitive TERM_PROGRAM compare. Ghostty's own builds emit
  // "ghostty" (lowercase) while iTerm2's and some multiplexers normalize
  // to "Ghostty" (capitalized). Comparing lowercase on both sides covers
  // both — prior two incidents (pre-plateau false-false and the 2026-04-23
  // cmux/ghostty overline-missing report) were each just one casing.
  // Applied uniformly so every terminal-detect site is robust.
  const isGhostty = programLower === "ghostty"
  const isWezTerm = programLower === "wezterm"
  const isAlacritty = programLower === "alacritty"
  const isFoot = TERM === "foot" || TERM === "foot-extra"
  const isDumb = TERM === "dumb"
  const isModern = !isDumb && (isKitty || isITerm || isGhostty || isWezTerm || isFoot)

  let isKittyWithTextSizing = false
  if (isKitty) {
    const parts = version.split(".")
    const major = Number(parts[0]) || 0
    const minor = Number(parts[1]) || 0
    isKittyWithTextSizing = major > 0 || (major === 0 && minor >= 40)
  }

  let maybeDarkBackground = !isAppleTerminal
  const colorFgBg = env.COLORFGBG
  if (colorFgBg) {
    const parts = colorFgBg.split(";")
    const bg = parseInt(parts[parts.length - 1] ?? "", 10)
    if (!isNaN(bg)) maybeDarkBackground = bg < 7
  } else if (isAppleTerminal) {
    maybeDarkBackground = detectMacOSDarkMode()
  }

  let maybeNerdFont = isModern || isAlacritty
  const nfEnv = env.NERDFONT
  if (nfEnv === "0" || nfEnv === "false") maybeNerdFont = false
  else if (nfEnv === "1" || nfEnv === "true") maybeNerdFont = true

  const underlineExtensions = isModern || (!isDumb && isAlacritty)
  // Phase 7 semantic upgrade: underlineStyles is now an array of supported
  // SGR 4:x styles (was a single boolean). Modern terminals + Alacritty get
  // the full modern set; others get an empty list ("stick to SGR 4").
  const underlineStyles: readonly import("./types").UnderlineStyle[] = underlineExtensions
    ? ["double", "curly", "dotted", "dashed"]
    : []

  // Unicode: modern terminals + explicit UTF-8 locales + Windows Terminal +
  // CI runners we know emit UTF-8. Absorbed from the pre-plateau standalone
  // `detectUnicode()` helper (km-silvery.unicode-plateau Phase 1) so caps is
  // the single source of truth and every consumer reads `caps.unicode` rather
  // than re-probing env. Default `false` matches the legacy helper's "unknown
  // terminal → be safe" behavior.
  const unicode =
    isModern ||
    (!isDumb && env.WT_SESSION !== undefined) ||
    env.KITTY_WINDOW_ID !== undefined ||
    utf8Locale(env) ||
    (!isDumb && termImpliesUnicode(TERM)) ||
    (env.CI !== undefined && env.GITHUB_ACTIONS !== undefined)

  // Cursor control: same TTY + !dumb gate that the retired `detectCursor`
  // helper used. Exposed on caps so every Term constructor + downstream
  // consumer reads one source of truth instead of re-probing stdout/env.
  const cursor = stdout.isTTY === true && TERM !== "dumb"

  const emulator: TerminalEmulator = { program, version, TERM }
  const caps: TerminalCaps = {
    cursor,
    input: false, // filled in by createTerminalProfile from stdin shape
    colorLevel,
    colorForced: noColor || env.FORCE_COLOR !== undefined,
    colorProvenance: noColor || env.FORCE_COLOR !== undefined ? "env" : "auto",
    unicode,
    underlineStyles,
    underlineColor: underlineExtensions,
    // Overline (SGR 53) piggybacks on the same "extended SGR" family as
    // SGR 58 underline color. Terminals advertising extended underline
    // attrs have always also rendered overline in practice (Ghostty,
    // iTerm2, xterm extended). Per-terminal overrides can flip this off.
    overline: underlineExtensions,
    textSizing: isKittyWithTextSizing,
    kittyKeyboard: !isDumb && (isKitty || isGhostty || isWezTerm || isFoot),
    bracketedPaste: true,
    mouse: true,
    kittyGraphics: !isDumb && (isKitty || isGhostty),
    sixel: !isDumb && (isFoot || isWezTerm),
    osc52: isModern || (!isDumb && isAlacritty),
    hyperlinks: isModern || (!isDumb && isAlacritty),
    notifications: isITerm || isKitty,
    syncOutput: isModern || (!isDumb && isAlacritty),
    maybeDarkBackground,
    maybeNerdFont,
    maybeWideEmojis: !isAppleTerminal,
  }

  return {
    emulator,
    caps,
    colorLevel,
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
export { defaultCaps, defaultEmulator }
