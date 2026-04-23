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

/**
 * A fully-resolved view of the current terminal.
 *
 * Bundled intentionally — callers shouldn't mix and match detection sources.
 * `colorTier` mirrors `caps.colorLevel`; it's exposed as a top-level field so
 * callers that only need the tier (e.g. `createStyle({ level })`) don't have
 * to reach into the caps object.
 *
 * @see createTerminalProfile
 */
export interface TerminalProfile {
  /** Full terminal capabilities (including colorLevel, unicode, kittyKeyboard, etc.) */
  caps: TerminalCaps
  /** Convenience alias for `caps.colorLevel`. */
  colorTier: ColorTier
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
  // `detectColorFromEnv` is called only when every earlier source declines.
  const resolvedTier: ColorTier =
    envTier ?? overrideTier ?? baseCapsTier ?? detectColorFromEnv(env, stdout)

  // When the caller supplied a caps base, use it as-is — don't re-detect every
  // flag from env (that would clobber backend-specific caps the Term already
  // chose, e.g. headless mono defaults). Otherwise run the full env probe.
  const baseCaps: TerminalCaps = options.caps
    ? { ...defaultCaps(), ...options.caps }
    : detectTerminalCapsFromEnv(env, stdout)

  const caps: TerminalCaps = { ...baseCaps, colorLevel: resolvedTier }

  return {
    caps,
    colorTier: resolvedTier,
  }
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
  const term = env.TERM ?? ""
  const noColor = env.NO_COLOR !== undefined

  const isAppleTerminal = program === "Apple_Terminal"
  const colorLevel: ColorTier = noColor ? "mono" : detectColorFromEnv(env, stdout)

  const isKitty = term === "xterm-kitty"
  const isITerm = program === "iTerm.app"
  const isGhostty = program === "ghostty"
  const isWezTerm = program === "WezTerm"
  const isAlacritty = program === "Alacritty"
  const isFoot = term === "foot" || term === "foot-extra"
  const isModern = isKitty || isITerm || isGhostty || isWezTerm || isFoot

  let isKittyWithTextSizing = false
  if (isKitty) {
    const version = env.TERM_PROGRAM_VERSION ?? ""
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

  // defaultCaps supplies the structural shape; we overwrite every dynamic field
  // explicitly so any future addition in defaultCaps gets a sensible default.
  return {
    ...defaultCaps(),
    program,
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
    unicode: true,
    underlineStyles: underlineExtensions,
    underlineColor: underlineExtensions,
    textEmojiWide: !isAppleTerminal,
    textSizingSupported: isKittyWithTextSizing,
    darkBackground,
    nerdfont,
  }
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
