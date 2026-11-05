/**
 * Built-in themes and palette registry.
 *
 * Exports:
 * - Pre-derived Theme objects (ansi16Dark, ansi16Light, defaultDark, defaultLight)
 * - ColorScheme definitions from popular theme systems (70+ palettes)
 * - Registry functions (getThemeByName, getSchemeByName)
 */

import {
  deriveTheme,
  ansi16DarkTheme as _ansi16DarkTheme,
  ansi16LightTheme as _ansi16LightTheme,
} from "@silvery/ansi"
import type { Theme, ColorScheme } from "@silvery/ansi"

// ── Re-export all palette definitions ──────────────────────────────
export {
  catppuccinMocha,
  catppuccinFrappe,
  catppuccinMacchiato,
  catppuccinLatte,
} from "./catppuccin"
export { nord } from "./nord"
export { dracula } from "./dracula"
export { solarizedDark, solarizedLight } from "./solarized"
export { tokyoNight, tokyoNightStorm, tokyoNightDay } from "./tokyo-night"
export { oneDark } from "./one-dark"
export { gruvboxDark, gruvboxLight } from "./gruvbox"
export { rosePine, rosePineMoon, rosePineDawn } from "./rose-pine"
export { kanagawaWave, kanagawaDragon, kanagawaLotus } from "./kanagawa"
export { everforestDark, everforestLight } from "./everforest"
export { monokai, monokaiPro } from "./monokai"
export { snazzy } from "./snazzy"
export { materialDark, materialLight } from "./material"
export { palenight } from "./palenight"
export { ayuDark, ayuMirage, ayuLight } from "./ayu"
export { nightfox, dawnfox } from "./nightfox"
export { horizon } from "./horizon"
export { moonfly } from "./moonfly"
export { nightfly } from "./nightfly"
export { oxocarbonDark, oxocarbonLight } from "./oxocarbon"
export { sonokai } from "./sonokai"
export { edgeDark, edgeLight } from "./edge"
export { modusVivendi, modusOperandi } from "./modus"
// New palettes
export { githubDark, githubLight } from "./github"
export { cobalt2 } from "./cobalt2"
export { synthwave, synthwave84 } from "./synthwave"
export { tomorrowNight, tomorrowNightBlue, tomorrowNightEighties } from "./tomorrow-night"
export { zenburn } from "./zenburn"
export { ubuntu } from "./ubuntu"
export { tangoDark, tangoLight } from "./tango"
export { cyberpunk } from "./cyberpunk"
export { vscodeDark } from "./vscode"
export { oneLight, oneHalfDark, oneHalfLight } from "./one-light"
export { nightOwlLight } from "./night-owl"
export { shadesOfPurple } from "./shades-of-purple"
export { homebrew } from "./homebrew"
export { neon } from "./neon"
export { challengerDeep } from "./challenger-deep"
export { doomOne } from "./doom-one"
export { mariana } from "./mariana"
export { darcula } from "./darcula"
export { espresso } from "./espresso"
export { icebergDark, icebergLight } from "./iceberg"
export { serendipityMidnight, serendipityMorning } from "./serendipity"
export { twilight } from "./twilight"
export { breeze } from "./breeze"
export { andromeda } from "./andromeda"
export { relaxed } from "./relaxed"
export { silveryDark, silveryLight } from "./silvery"
export {
  vga,
  xtermDefault,
  appleTerminalBasic,
  windowsTerminalCampbell,
  gnomeTerminalTango,
} from "./classics"

// ── Import for registry ────────────────────────────────────────────
import {
  catppuccinMocha,
  catppuccinFrappe,
  catppuccinMacchiato,
  catppuccinLatte,
} from "./catppuccin"
import { nord } from "./nord"
import { dracula } from "./dracula"
import { solarizedDark, solarizedLight } from "./solarized"
import { tokyoNight, tokyoNightStorm, tokyoNightDay } from "./tokyo-night"
import { oneDark } from "./one-dark"
import { gruvboxDark, gruvboxLight } from "./gruvbox"
import { rosePine, rosePineMoon, rosePineDawn } from "./rose-pine"
import { kanagawaWave, kanagawaDragon, kanagawaLotus } from "./kanagawa"
import { everforestDark, everforestLight } from "./everforest"
import { monokai, monokaiPro } from "./monokai"
import { snazzy } from "./snazzy"
import { materialDark, materialLight } from "./material"
import { palenight } from "./palenight"
import { ayuDark, ayuMirage, ayuLight } from "./ayu"
import { nightfox, dawnfox } from "./nightfox"
import { horizon } from "./horizon"
import { moonfly } from "./moonfly"
import { nightfly } from "./nightfly"
import { oxocarbonDark, oxocarbonLight } from "./oxocarbon"
import { sonokai } from "./sonokai"
import { edgeDark, edgeLight } from "./edge"
import { modusVivendi, modusOperandi } from "./modus"
// New palettes
import { githubDark, githubLight } from "./github"
import { cobalt2 } from "./cobalt2"
import { synthwave, synthwave84 } from "./synthwave"
import { tomorrowNight, tomorrowNightBlue, tomorrowNightEighties } from "./tomorrow-night"
import { zenburn } from "./zenburn"
import { ubuntu } from "./ubuntu"
import { tangoDark, tangoLight } from "./tango"
import { cyberpunk } from "./cyberpunk"
import { vscodeDark } from "./vscode"
import { oneLight, oneHalfDark, oneHalfLight } from "./one-light"
import { nightOwlLight } from "./night-owl"
import { shadesOfPurple } from "./shades-of-purple"
import { homebrew } from "./homebrew"
import { neon } from "./neon"
import { challengerDeep } from "./challenger-deep"
import { doomOne } from "./doom-one"
import { mariana } from "./mariana"
import { darcula } from "./darcula"
import { espresso } from "./espresso"
import { icebergDark, icebergLight } from "./iceberg"
import { serendipityMidnight, serendipityMorning } from "./serendipity"
import { twilight } from "./twilight"
import { breeze } from "./breeze"
import { andromeda } from "./andromeda"
import { relaxed } from "./relaxed"
import { silveryDark, silveryLight } from "./silvery"
import {
  vga,
  xtermDefault,
  appleTerminalBasic,
  windowsTerminalCampbell,
  gnomeTerminalTango,
} from "./classics"

// ============================================================================
// ANSI 16 Themes (derived from default dark/light schemes — hex-valued)
// ============================================================================

/**
 * Dark ANSI 16 theme — hex-valued, derived from the default dark scheme.
 * All token values are hex strings (no ANSI slot names).
 * Terminal rendering quantizes hex to 4-bit ANSI codes when colorLevel === "ansi16".
 *
 * Sterling flat tokens (`bg-surface-subtle`, `fg-on-accent`, `border-focus`, …)
 * are baked in by `@silvery/ansi`'s `deriveAnsi16Theme` — consumers read either
 * legacy fields or Sterling flat keys off the same object.
 */
export const ansi16DarkTheme: Theme = _ansi16DarkTheme

/**
 * Light ANSI 16 theme — hex-valued, derived from the default light scheme.
 * All token values are hex strings (no ANSI slot names).
 * Terminal rendering quantizes hex to 4-bit ANSI codes when colorLevel === "ansi16".
 */
export const ansi16LightTheme: Theme = _ansi16LightTheme

// ============================================================================
// Default Truecolor Themes (derived from Nord palette)
// ============================================================================

/** Dark truecolor theme — derived from Nord. Sterling flat tokens baked in by `deriveTheme`. */
export const defaultDarkTheme: Theme = deriveTheme(nord)

/** Light truecolor theme — derived from Catppuccin Latte. Sterling flat tokens baked in by `deriveTheme`. */
export const defaultLightTheme: Theme = deriveTheme(catppuccinLatte)

// ============================================================================
// Registry
// ============================================================================

/** All built-in ColorScheme definitions (70+ palettes). */
export const builtinPalettes: Record<string, ColorScheme> = {
  // Catppuccin
  "catppuccin-mocha": catppuccinMocha,
  "catppuccin-frappe": catppuccinFrappe,
  "catppuccin-macchiato": catppuccinMacchiato,
  "catppuccin-latte": catppuccinLatte,
  // Nord
  nord: nord,
  // Dracula
  dracula: dracula,
  // Solarized
  "solarized-dark": solarizedDark,
  "solarized-light": solarizedLight,
  // Tokyo Night
  "tokyo-night": tokyoNight,
  "tokyo-night-storm": tokyoNightStorm,
  "tokyo-night-day": tokyoNightDay,
  // One Dark
  "one-dark": oneDark,
  // Gruvbox
  "gruvbox-dark": gruvboxDark,
  "gruvbox-light": gruvboxLight,
  // Rose Pine
  "rose-pine": rosePine,
  "rose-pine-moon": rosePineMoon,
  "rose-pine-dawn": rosePineDawn,
  // Kanagawa
  "kanagawa-wave": kanagawaWave,
  "kanagawa-dragon": kanagawaDragon,
  "kanagawa-lotus": kanagawaLotus,
  // Everforest
  "everforest-dark": everforestDark,
  "everforest-light": everforestLight,
  // Monokai
  monokai: monokai,
  "monokai-pro": monokaiPro,
  // Snazzy
  snazzy: snazzy,
  // Material
  "material-dark": materialDark,
  "material-light": materialLight,
  // Palenight
  palenight: palenight,
  // Ayu
  "ayu-dark": ayuDark,
  "ayu-mirage": ayuMirage,
  "ayu-light": ayuLight,
  // Nightfox
  nightfox: nightfox,
  dawnfox: dawnfox,
  // Horizon
  horizon: horizon,
  // Moonfly
  moonfly: moonfly,
  // Nightfly
  nightfly: nightfly,
  // Oxocarbon
  "oxocarbon-dark": oxocarbonDark,
  "oxocarbon-light": oxocarbonLight,
  // Sonokai
  sonokai: sonokai,
  // Edge
  "edge-dark": edgeDark,
  "edge-light": edgeLight,
  // Modus
  "modus-vivendi": modusVivendi,
  "modus-operandi": modusOperandi,
  // GitHub
  "github-dark": githubDark,
  "github-light": githubLight,
  // Cobalt2
  cobalt2: cobalt2,
  // Synthwave
  synthwave: synthwave,
  "synthwave-84": synthwave84,
  // Tomorrow Night
  "tomorrow-night": tomorrowNight,
  "tomorrow-night-blue": tomorrowNightBlue,
  "tomorrow-night-eighties": tomorrowNightEighties,
  // Zenburn
  zenburn: zenburn,
  // Ubuntu
  ubuntu: ubuntu,
  // Tango
  "tango-dark": tangoDark,
  "tango-light": tangoLight,
  // Cyberpunk
  cyberpunk: cyberpunk,
  // VS Code
  "vscode-dark": vscodeDark,
  // One Light / One Half
  "one-light": oneLight,
  "one-half-dark": oneHalfDark,
  "one-half-light": oneHalfLight,
  // Night Owl
  "night-owl-light": nightOwlLight,
  // Shades of Purple
  "shades-of-purple": shadesOfPurple,
  // Homebrew
  homebrew: homebrew,
  // Neon
  neon: neon,
  // Challenger Deep
  "challenger-deep": challengerDeep,
  // Doom One
  "doom-one": doomOne,
  // Mariana
  mariana: mariana,
  // Darcula (JetBrains)
  darcula: darcula,
  // Espresso
  espresso: espresso,
  // Iceberg
  "iceberg-dark": icebergDark,
  "iceberg-light": icebergLight,
  // Serendipity
  "serendipity-midnight": serendipityMidnight,
  "serendipity-morning": serendipityMorning,
  // Twilight
  twilight: twilight,
  // Breeze (KDE)
  breeze: breeze,
  // Andromeda
  andromeda: andromeda,
  // Relaxed
  relaxed: relaxed,
  // Silvery signatures (defaults)
  "silvery-dark": silveryDark,
  "silvery-light": silveryLight,
  // Classic terminal defaults (anchor points for fingerprint matching)
  vga: vga,
  "xterm-default": xtermDefault,
  "apple-terminal-basic": appleTerminalBasic,
  "windows-terminal-campbell": windowsTerminalCampbell,
  "gnome-terminal-tango": gnomeTerminalTango,
}

/** All built-in themes, indexed by name (includes backward-compat aliases). */
export const builtinThemes: Record<string, Theme> = {
  // ANSI 16
  "dark-ansi16": ansi16DarkTheme,
  "light-ansi16": ansi16LightTheme,
  // Truecolor defaults
  "dark-truecolor": defaultDarkTheme,
  "light-truecolor": defaultLightTheme,
  // Old names as aliases
  dark: defaultDarkTheme,
  light: defaultLightTheme,
  "ansi16-dark": ansi16DarkTheme,
  "ansi16-light": ansi16LightTheme,
}

/** Resolve a theme by name. Defaults to dark-ansi16. */
export function getThemeByName(name?: string): Theme {
  if (!name) return ansi16DarkTheme
  // Check pre-built themes first
  const builtin = builtinThemes[name]
  if (builtin) return builtin
  // Check palettes (derive on first access). `deriveTheme` bakes Sterling
  // flat tokens so `$fg-accent` / `$bg-surface-subtle` / etc. resolve the
  // same way the default themes do.
  const palette = builtinPalettes[name]
  if (palette) return deriveTheme(palette)
  return ansi16DarkTheme
}

/** Resolve a palette by name. Returns undefined if not found. */
export function getSchemeByName(name: string): ColorScheme | undefined {
  return builtinPalettes[name]
}
