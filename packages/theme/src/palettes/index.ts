/**
 * Built-in themes and palette registry.
 *
 * Exports:
 * - Pre-derived Theme objects (ansi16Dark, ansi16Light, defaultDark, defaultLight)
 * - ColorPalette definitions from popular theme systems (45 palettes)
 * - Registry functions (getThemeByName, getPaletteByName)
 */

import { deriveTheme } from "../derive"
import type { Theme, ColorPalette } from "../types"

// ── Re-export all palette definitions ──────────────────────────────
export { catppuccinMocha, catppuccinFrappe, catppuccinMacchiato, catppuccinLatte } from "./catppuccin"
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

// ── Import for registry ────────────────────────────────────────────
import { catppuccinMocha, catppuccinFrappe, catppuccinMacchiato, catppuccinLatte } from "./catppuccin"
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

// ============================================================================
// ANSI 16 Themes (no palette required — hardcoded for any terminal)
// ============================================================================

/** Dark ANSI 16 theme — works on any terminal. Primary = yellow. */
export const ansi16DarkTheme: Theme = {
  name: "dark-ansi16",
  bg: "",
  fg: "whiteBright",
  muted: "white",
  mutedbg: "black",
  surface: "whiteBright",
  surfacebg: "black",
  popover: "whiteBright",
  popoverbg: "black",
  inverse: "black",
  inversebg: "whiteBright",
  cursor: "black",
  cursorbg: "yellow",
  selection: "black",
  selectionbg: "yellow",
  primary: "yellow",
  primaryfg: "black",
  secondary: "yellow",
  secondaryfg: "black",
  accent: "yellow",
  accentfg: "black",
  error: "redBright",
  errorfg: "black",
  warning: "yellow",
  warningfg: "black",
  success: "greenBright",
  successfg: "black",
  info: "cyanBright",
  infofg: "black",
  border: "gray",
  inputborder: "gray",
  focusborder: "blueBright",
  link: "blueBright",
  disabledfg: "gray",
  palette: [
    "black",
    "red",
    "green",
    "yellow",
    "blue",
    "magenta",
    "cyan",
    "white",
    "blackBright",
    "redBright",
    "greenBright",
    "yellowBright",
    "blueBright",
    "magentaBright",
    "cyanBright",
    "whiteBright",
  ],
}

/** Light ANSI 16 theme — works on any terminal. Primary = blue. */
export const ansi16LightTheme: Theme = {
  name: "light-ansi16",
  bg: "",
  fg: "black",
  muted: "blackBright",
  mutedbg: "white",
  surface: "black",
  surfacebg: "white",
  popover: "black",
  popoverbg: "white",
  inverse: "whiteBright",
  inversebg: "black",
  cursor: "black",
  cursorbg: "blue",
  selection: "black",
  selectionbg: "cyan",
  primary: "blue",
  primaryfg: "black",
  secondary: "blue",
  secondaryfg: "black",
  accent: "cyan",
  accentfg: "black",
  error: "red",
  errorfg: "black",
  warning: "yellow",
  warningfg: "black",
  success: "green",
  successfg: "black",
  info: "cyan",
  infofg: "black",
  border: "gray",
  inputborder: "gray",
  focusborder: "blue",
  link: "blueBright",
  disabledfg: "gray",
  palette: [
    "black",
    "red",
    "green",
    "yellow",
    "blue",
    "magenta",
    "cyan",
    "white",
    "blackBright",
    "redBright",
    "greenBright",
    "yellowBright",
    "blueBright",
    "magentaBright",
    "cyanBright",
    "whiteBright",
  ],
}

// ============================================================================
// Default Truecolor Themes (derived from Nord palette)
// ============================================================================

/** Dark truecolor theme — derived from Nord. */
export const defaultDarkTheme: Theme = deriveTheme(nord)

/** Light truecolor theme — derived from Catppuccin Latte. */
export const defaultLightTheme: Theme = deriveTheme(catppuccinLatte)

// ============================================================================
// Registry
// ============================================================================

/** All built-in ColorPalette definitions (45 palettes). */
export const builtinPalettes: Record<string, ColorPalette> = {
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
  // Check palettes (derive on first access)
  const palette = builtinPalettes[name]
  if (palette) return deriveTheme(palette)
  return ansi16DarkTheme
}

/** Resolve a palette by name. Returns undefined if not found. */
export function getPaletteByName(name: string): ColorPalette | undefined {
  return builtinPalettes[name]
}
