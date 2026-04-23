# @silvery/ansi

Everything terminal — styling, ANSI primitives, color detection, theme derivation, terminal control sequences.

A standalone package that replaces chalk, supports-color, and terminal-kit primitives in one place. Powers the styling layer of [silvery](https://silvery.dev).

## Install

```bash
npm install @silvery/ansi
```

## Usage

### Styled output (chalk replacement)

```ts
import { style } from "@silvery/ansi"

// Standard colors
style.bold.red("error")
style.dim.cyan("info")

// Semantic theme tokens — adapts to terminal palette
style.primary("active item")
style.muted("timestamp")
style.success("done")
style.error("failed")

// Create your own instance
import { createStyle } from "@silvery/ansi"
const s = createStyle({ theme })
```

### Terminal control sequences

```ts
import {
  enterAltScreen,
  leaveAltScreen,
  cursorTo,
  cursorHide,
  cursorShow,
  enableMouse,
  disableMouse,
  enableKittyKeyboard,
  disableKittyKeyboard,
  enableBracketedPaste,
  disableBracketedPaste,
} from "@silvery/ansi"

process.stdout.write(enterAltScreen)
process.stdout.write(cursorTo(10, 5))
process.stdout.write(enableMouse)
```

### Terminal profile (color + caps in one call)

```ts
import { createTerminalProfile } from "@silvery/ansi"

const profile = createTerminalProfile()
profile.colorLevel // → "mono" | "ansi16" | "256" | "truecolor"
profile.caps // → full TerminalCaps (unicode, cursor, underlineStyles, kittyKeyboard, …)
profile.colorForced // → true if NO_COLOR / FORCE_COLOR pinned the tier
profile.colorProvenance // → "env" | "override" | "caller-caps" | "auto"
```

The `createTerminalProfile` factory is the single source of truth for
terminal detection — it reads `process.env` exactly once and returns a
frozen `{ caps, colorLevel, … }` bundle. Every other API (styles, Term,
runtimes) accepts a caps / profile argument so nothing else re-probes env.
Use `probeTerminalProfile()` for the async variant that bundles an
OSC-detected `theme`.

### Theme derivation

```ts
import { deriveTheme, detectTheme } from "@silvery/ansi"

// Derive theme from terminal palette (async, queries terminal via OSC)
const theme = await detectTheme()

// Derive from known palette
const theme = deriveTheme(palette)
```

### Extended underlines

```ts
import { curlyUnderline, dottedUnderline, underlineColor } from "@silvery/ansi"

// Curly underline (supported in Kitty, Ghostty, WezTerm, iTerm2)
process.stdout.write(curlyUnderline("squiggly"))
process.stdout.write(underlineColor("#ff0000") + curlyUnderline("red squiggly"))
```

### ANSI utilities

```ts
import { stripAnsi, displayLength, nearestAnsi16, rgbToAnsi256 } from "@silvery/ansi"

stripAnsi("\x1b[31mred\x1b[0m") // → "red"
displayLength("hello\x1b[1m!") // → 6
nearestAnsi16([255, 0, 0]) // → nearest 16-color index
```

## API Surface

| Category             | Exports                                                                                     |
| -------------------- | ------------------------------------------------------------------------------------------- |
| **Style**            | `style`, `createStyle`, `createPlainStyle`, `createMixedStyle`                              |
| **Detection**        | `createTerminalProfile`, `probeTerminalProfile`, `defaultCaps`                              |
| **Terminal control** | `enterAltScreen`, `cursorTo`, `enableMouse`, `enableKittyKeyboard`, ...                     |
| **SGR codes**        | `fgColorCode`, `bgColorCode`, `fgFromRgb`, `bgFromRgb`                                      |
| **Color maps**       | `nearestAnsi16`, `rgbToAnsi256`, `ANSI_16_COLORS`                                           |
| **Underlines**       | `curlyUnderline`, `dottedUnderline`, `dashedUnderline`, `doubleUnderline`, `underlineColor` |
| **Theme**            | `deriveTheme`, `detectTheme`, `defaultDarkScheme`, `defaultLightScheme`                     |
| **OSC protocol**     | `queryPaletteColor`, `queryForegroundColor`, `detectColorScheme`                            |
| **Utilities**        | `stripAnsi`, `displayLength`, `ANSI_REGEX`                                                  |
| **Hyperlinks**       | `hyperlink`, `HYPERLINK_START`, `HYPERLINK_END`                                             |

## Relationship to Other Packages

```
@silvery/color          ← pure math (hex/RGB/HSL, blending, contrast)
  └─ @silvery/ansi      ← THIS: terminal styling + detection + control
       └─ @silvery/theme ← palettes, ThemeProvider, useTheme
            └─ silvery   ← full framework barrel
```

## License

MIT
