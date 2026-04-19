/**
 * Build the StorybookEntry list from @silvery/theme builtin palettes.
 *
 * For each scheme we pre-derive both a truecolor and an ansi16 Theme so the
 * tier toggle has zero-latency switching.
 */

import { builtinPalettes, deriveTheme, type ThemeAdjustment } from "@silvery/theme"
import type { StorybookEntry } from "./types"

export function buildEntries(): StorybookEntry[] {
  const entries = Object.entries(builtinPalettes).map(([name, palette]) => {
    const adjustments: ThemeAdjustment[] = []
    const theme = deriveTheme(palette, "truecolor", adjustments)
    const themeAnsi16 = deriveTheme(palette, "ansi16")
    return {
      name,
      palette,
      theme,
      themeAnsi16,
      adjustments,
      dark: palette.dark !== false,
    }
  })

  // Sort so dark-first, then light, each group alphabetical. The SchemeBrowser
  // renders the same order (with a group divider interleaved), so pressing j
  // always advances to the next visually-adjacent entry — no jump across groups.
  entries.sort((a, b) => {
    if (a.dark !== b.dark) return a.dark ? -1 : 1
    return a.name.localeCompare(b.name)
  })

  return entries
}
