# Theme System

The silvery theme system transforms a 22-color terminal palette into 33 semantic tokens for UI consumption. The pipeline flows in one direction:

```
ColorPalette (22) → deriveTheme() → Theme (33) → resolveThemeColor() → ANSI output
```

Components never reference raw colors directly. They use `$token` strings (`color="$primary"`) that resolve against the active theme at render time. This decouples UI code from any specific palette.

## ColorPalette (22 Colors)

The universal terminal color format. Every modern terminal emulator uses this shape — Ghostty, Kitty, Alacritty, iTerm2, WezTerm, and others all export/import these 22 fields.

### Fields

**16 ANSI colors** (indices 0--15):

| Field           | ANSI Index | Description    |
| --------------- | ---------- | -------------- |
| `black`         | 0          | Normal black   |
| `red`           | 1          | Normal red     |
| `green`         | 2          | Normal green   |
| `yellow`        | 3          | Normal yellow  |
| `blue`          | 4          | Normal blue    |
| `magenta`       | 5          | Normal magenta |
| `cyan`          | 6          | Normal cyan    |
| `white`         | 7          | Normal white   |
| `brightBlack`   | 8          | Bright black   |
| `brightRed`     | 9          | Bright red     |
| `brightGreen`   | 10         | Bright green   |
| `brightYellow`  | 11         | Bright yellow  |
| `brightBlue`    | 12         | Bright blue    |
| `brightMagenta` | 13         | Bright magenta |
| `brightCyan`    | 14         | Bright cyan    |
| `brightWhite`   | 15         | Bright white   |

**6 special colors:**

| Field                 | Description                   |
| --------------------- | ----------------------------- |
| `foreground`          | Default text color            |
| `background`          | Default background color      |
| `cursorColor`         | Cursor block/line color       |
| `cursorText`          | Text rendered under the cursor |
| `selectionBackground` | Background of selected text   |
| `selectionForeground` | Text color of selected text   |

**Optional metadata:**

| Field     | Type      | Description                                           |
| --------- | --------- | ----------------------------------------------------- |
| `name`    | `string`  | Human-readable palette name                           |
| `dark`    | `boolean` | Whether this is a dark palette                        |
| `primary` | `string`  | Semantic primary accent override (hex, e.g. `#89b4fa`) |

When `primary` is set, `deriveTheme()` uses it instead of inferring from ANSI slots. Builder APIs (`createTheme().primary()`, `quickTheme()`, `autoGenerateTheme()`) set this automatically. Built-in palettes leave it unset and rely on the default ANSI slot mapping.

### Type Definition

```typescript
interface ColorPalette {
  name?: string
  dark?: boolean
  primary?: string

  // 16 ANSI palette — all required hex strings (#RRGGBB)
  black: string
  red: string
  green: string
  yellow: string
  blue: string
  magenta: string
  cyan: string
  white: string
  brightBlack: string
  brightRed: string
  brightGreen: string
  brightYellow: string
  brightBlue: string
  brightMagenta: string
  brightCyan: string
  brightWhite: string

  // 6 special colors — all required hex strings
  foreground: string
  background: string
  cursorColor: string
  cursorText: string
  selectionBackground: string
  selectionForeground: string
}
```

## Theme (33 Semantic Tokens)

The `Theme` interface is what UI components consume. Every property name is **lowercase with no hyphens** (e.g., `surfacebg`, not `surface-bg`). All color values are hex strings in truecolor mode, or ANSI color names in ANSI 16 mode.

### Pairing Conventions

Tokens follow two pairing conventions depending on their role:

**Surface pairs** — `$name` is text, `$name-bg` is background:

| Token pair                 | Purpose                         |
| -------------------------- | ------------------------------- |
| `$muted` / `$muted-bg`       | Secondary text / hover surface  |
| `$surface` / `$surface-bg`   | Elevated content text / bg      |
| `$popover` / `$popover-bg`   | Floating content text / bg      |
| `$inverse` / `$inverse-bg`   | Chrome area text / bg           |
| `$cursor` / `$cursor-bg`     | Text under cursor / cursor color |
| `$selection` / `$selection-bg` | Selected text / selection bg    |

**Accent pairs** — `$name` is area background, `$name-fg` is text on that area:

| Token pair                   | Purpose                       |
| ---------------------------- | ----------------------------- |
| `$primary` / `$primary-fg`     | Brand accent area             |
| `$secondary` / `$secondary-fg` | Alternate accent area         |
| `$accent` / `$accent-fg`       | Attention/pop accent area     |
| `$error` / `$error-fg`         | Error/destructive area        |
| `$warning` / `$warning-fg`     | Warning/caution area          |
| `$success` / `$success-fg`     | Success/positive area         |
| `$info` / `$info-fg`           | Neutral info area             |

**5 standalone tokens:**

| Token          | Purpose                                     |
| -------------- | ------------------------------------------- |
| `$border`      | Structural dividers and borders             |
| `$inputborder` | Interactive control borders (inputs, buttons) |
| `$focusborder` | Focus ring (always blue for accessibility)  |
| `$link`        | Hyperlinks                                  |
| `$disabledfg`  | Disabled/placeholder text                   |

**16 palette passthrough:** `$color0` through `$color15` map to the `palette` array.

### Complete Token Table

| Token          | Property      | Category  | Purpose                                  |
| -------------- | ------------- | --------- | ---------------------------------------- |
| `$bg`          | `bg`          | Root      | Default background                       |
| `$fg`          | `fg`          | Root      | Default text                             |
| `$muted`       | `muted`       | Surface   | Secondary/muted text (~70% contrast)     |
| `$muted-bg`    | `mutedbg`     | Surface   | Muted area background (hover state)      |
| `$surface`     | `surface`     | Surface   | Text on elevated surface                 |
| `$surface-bg`  | `surfacebg`   | Surface   | Elevated content area background         |
| `$popover`     | `popover`     | Surface   | Text on floating content                 |
| `$popover-bg`  | `popoverbg`   | Surface   | Floating content background              |
| `$inverse`     | `inverse`     | Surface   | Text on chrome area                      |
| `$inverse-bg`  | `inversebg`   | Surface   | Chrome area background (status/title bar) |
| `$cursor`      | `cursor`      | Surface   | Text under cursor                        |
| `$cursor-bg`   | `cursorbg`    | Surface   | Cursor color                             |
| `$selection`   | `selection`   | Surface   | Text on selected items                   |
| `$selection-bg`| `selectionbg` | Surface   | Selected items background                |
| `$primary`     | `primary`     | Accent    | Brand accent area                        |
| `$primary-fg`  | `primaryfg`   | Accent    | Text on primary accent area              |
| `$secondary`   | `secondary`   | Accent    | Alternate accent area                    |
| `$secondary-fg`| `secondaryfg` | Accent    | Text on secondary accent area            |
| `$accent`      | `accent`      | Accent    | Attention/pop accent area                |
| `$accent-fg`   | `accentfg`    | Accent    | Text on accent area                      |
| `$error`       | `error`       | Accent    | Error/destructive area                   |
| `$error-fg`    | `errorfg`     | Accent    | Text on error area                       |
| `$warning`     | `warning`     | Accent    | Warning/caution area                     |
| `$warning-fg`  | `warningfg`   | Accent    | Text on warning area                     |
| `$success`     | `success`     | Accent    | Success/positive area                    |
| `$success-fg`  | `successfg`   | Accent    | Text on success area                     |
| `$info`        | `info`        | Accent    | Neutral info area                        |
| `$info-fg`     | `infofg`      | Accent    | Text on info area                        |
| `$border`      | `border`      | Standalone | Structural dividers                      |
| `$inputborder` | `inputborder` | Standalone | Interactive control borders              |
| `$focusborder` | `focusborder` | Standalone | Focus border (always blue)               |
| `$link`        | `link`        | Standalone | Hyperlinks                               |
| `$disabledfg`  | `disabledfg`  | Standalone | Disabled/placeholder text                |

### Type Definition

```typescript
interface Theme {
  name: string

  // Root pair
  bg: string
  fg: string

  // 6 surface pairs (base = text, *bg = background)
  muted: string
  mutedbg: string
  surface: string
  surfacebg: string
  popover: string
  popoverbg: string
  inverse: string
  inversebg: string
  cursor: string
  cursorbg: string
  selection: string
  selectionbg: string

  // 7 accent pairs (base = area bg, *fg = text on area)
  primary: string
  primaryfg: string
  secondary: string
  secondaryfg: string
  accent: string
  accentfg: string
  error: string
  errorfg: string
  warning: string
  warningfg: string
  success: string
  successfg: string
  info: string
  infofg: string

  // 5 standalone tokens
  border: string
  inputborder: string
  focusborder: string
  link: string
  disabledfg: string

  // 16 ANSI colors ($color0--$color15)
  palette: string[]
}
```

## deriveTheme()

Transforms a 22-color `ColorPalette` into a 33-token `Theme`.

```typescript
function deriveTheme(
  palette: ColorPalette,
  mode?: "truecolor" | "ansi16",
  adjustments?: ThemeAdjustment[],
): Theme
```

### Parameters

| Parameter     | Type               | Default       | Description                                           |
| ------------- | ------------------ | ------------- | ----------------------------------------------------- |
| `palette`     | `ColorPalette`     | required      | The 22-color terminal palette                         |
| `mode`        | `"truecolor" \| "ansi16"` | `"truecolor"` | Derivation mode                              |
| `adjustments` | `ThemeAdjustment[]` | `undefined`   | Optional array to collect contrast adjustments made   |

### Truecolor Mode

The default mode. Uses blending and contrast-aware adjustment to produce rich, harmonious themes.

**Contrast targets** — minimums that `ensureContrast()` enforces. Most themes exceed them without adjustment:

| Target   | Ratio | Applied to                                        | Rationale                               |
| -------- | ----- | ------------------------------------------------- | --------------------------------------- |
| AA       | 4.5:1 | Body text, muted text, accent-as-text, selection  | WCAG AA for normal text                 |
| DIM      | 3.0:1 | Disabled text                                     | Intentionally dim but still visible     |
| FAINT    | 1.5:1 | Borders, structural dividers                      | Faint structural element                |
| CONTROL  | 3.0:1 | Input borders                                     | WCAG 1.4.11 non-text minimum           |

**Derivation rules:**

| Token        | Source                                        | Contrast target |
| ------------ | --------------------------------------------- | --------------- |
| `fg`         | `palette.foreground` ensured against `popoverbg` | AA (4.5:1)    |
| `primary`    | `palette.primary` or yellow (dark) / blue (light) | AA (4.5:1)  |
| `accent`     | Complement of `primary`                       | AA (4.5:1)      |
| `secondary`  | Blend of `primary` and `accent` at 35%        | AA (4.5:1)      |
| `error`      | `palette.red`                                 | AA (4.5:1)      |
| `warning`    | `palette.yellow`                              | AA (4.5:1)      |
| `success`    | `palette.green`                               | AA (4.5:1)      |
| `info`       | Blend of `fg` and `accent` at 50%            | AA (4.5:1)      |
| `link`       | `brightBlue` (dark) / `blue` (light)         | AA (4.5:1)      |
| `muted`      | `fg` blended 40% toward `bg`, against `mutedbg` | AA (4.5:1)   |
| `disabledfg` | `fg` blended 50% toward `bg`                | DIM (3.0:1)     |
| `border`     | `bg` blended 15% toward `fg`                | FAINT (1.5:1)   |
| `inputborder`| `bg` blended 25% toward `fg`                | CONTROL (3.0:1) |
| `surfacebg`  | `bg` blended 5% toward `fg`                 | --              |
| `popoverbg`  | `bg` blended 8% toward `fg`                 | --              |
| `mutedbg`    | `bg` blended 4% toward `fg`                 | --              |
| `inversebg`  | `fg` blended 10% toward `bg`                | --              |
| `inverse`    | `contrastFg(inversebg)` (black or white)     | --              |
| `selection`  | `palette.selectionForeground`                | AA (4.5:1)      |
| `cursor`     | `palette.cursorText`                         | AA (4.5:1)      |
| `focusborder`| Same as `link`                               | --              |
| `*fg` tokens | `contrastFg(base)` (black or white)          | --              |

The derivation uses a **blend-first-then-ensure** pattern: the initial blend sets the color's character from the palette's aesthetic, then `ensureContrast()` only adjusts lightness (preserving hue and saturation) if the ratio falls short.

**Primary color inference:** When `palette.primary` is not set, the primary defaults to `palette.yellow` for dark themes and `palette.blue` for light themes. Set `palette.primary` explicitly to override this.

### ANSI 16 Mode

Direct mapping with no blending or hex math. Token values are ANSI color names rather than hex strings.

```typescript
const theme = deriveTheme(palette, "ansi16")
// theme.primary === palette.yellow (dark) or palette.blue (light)
// theme.border === palette.brightBlack
// theme.fg === palette.foreground
```

### ThemeAdjustment

When the optional `adjustments` array is passed, `deriveTheme()` records every contrast adjustment it makes:

```typescript
interface ThemeAdjustment {
  token: string       // Token name (e.g. "primary", "muted")
  from: string        // Original color before adjustment
  to: string          // Adjusted color
  against: string     // Background used for contrast check
  target: number      // Target contrast ratio
  ratioBefore: number // Contrast ratio before adjustment
  ratioAfter: number  // Contrast ratio after adjustment
}
```

This is useful for debugging and for theme preview tooling.

## resolveThemeColor()

Resolves a `$token` string against a `Theme` object.

```typescript
function resolveThemeColor(
  color: string | undefined,
  theme: Theme,
): string | undefined
```

**Resolution rules:**

| Input              | Behavior                                      | Example                        |
| ------------------ | --------------------------------------------- | ------------------------------ |
| `undefined`        | Returns `undefined`                           | --                             |
| `"$primary"`       | Lookup `theme.primary`                        | `"#EBCB8B"`                    |
| `"$surface-bg"`    | Strip hyphens, lookup `theme.surfacebg`       | `"#323845"`                    |
| `"$color0"`--`"$color15"` | Index into `theme.palette`            | `"#2E3440"`                    |
| `"#ff0000"`        | Pass through unchanged                        | `"#ff0000"`                    |
| `"red"`            | Pass through unchanged                        | `"red"`                        |
| Unknown `$token`   | Pass through as-is                            | `"$unknown"` -> `"$unknown"`  |

Both `$surfacebg` and `$surface-bg` resolve identically — hyphens are stripped before lookup.

## Built-in Palettes

The `@silvery/theme` package ships 38 palettes across 23 palette files, covering the most popular terminal and editor color schemes.

### Palette Families

| Family        | Palettes                                          | Count |
| ------------- | ------------------------------------------------- | ----- |
| Catppuccin    | mocha, frappe, macchiato, latte                   | 4     |
| Nord          | nord                                              | 1     |
| Dracula       | dracula                                           | 1     |
| Solarized     | dark, light                                       | 2     |
| Tokyo Night   | tokyo-night, storm, day                           | 3     |
| One Dark      | one-dark                                          | 1     |
| Gruvbox       | dark, light                                       | 2     |
| Rose Pine     | rose-pine, moon, dawn                             | 3     |
| Kanagawa      | wave, dragon, lotus                               | 3     |
| Everforest    | dark, light                                       | 2     |
| Monokai       | monokai, monokai-pro                              | 2     |
| Snazzy        | snazzy                                            | 1     |
| Material      | dark, light                                       | 2     |
| Palenight     | palenight                                         | 1     |
| Ayu           | dark, mirage, light                               | 3     |
| Nightfox      | nightfox, dawnfox                                 | 2     |
| Horizon       | horizon                                           | 1     |
| Moonfly       | moonfly                                           | 1     |
| Nightfly      | nightfly                                          | 1     |
| Oxocarbon     | dark, light                                       | 2     |
| Sonokai       | sonokai                                           | 1     |
| Edge          | dark, light                                       | 2     |
| Modus         | vivendi, operandi                                 | 2     |

### Using Palettes

```typescript
import { builtinPalettes, getPaletteByName, deriveTheme } from "silvery/theme"

// List all palette names
const names = Object.keys(builtinPalettes)
// ["catppuccin-mocha", "catppuccin-frappe", ..., "modus-operandi"]

// Look up by name
const palette = getPaletteByName("catppuccin-mocha")
if (palette) {
  const theme = deriveTheme(palette)
}

// Import a specific palette directly
import { nord, catppuccinMocha } from "silvery/theme"
const nordTheme = deriveTheme(nord)
```

### Pre-derived Themes

Four themes ship pre-derived for instant use:

| Export             | Palette           | Mode  | Primary |
| ------------------ | ----------------- | ----- | ------- |
| `defaultDarkTheme` | Nord              | dark  | #EBCB8B |
| `defaultLightTheme`| Catppuccin Latte  | light | #1E66F5 |
| `ansi16DarkTheme`  | (hardcoded)       | dark  | yellow  |
| `ansi16LightTheme` | (hardcoded)       | light | blue    |

```typescript
import {
  defaultDarkTheme,
  defaultLightTheme,
  ansi16DarkTheme,
  ansi16LightTheme,
  getThemeByName,
} from "silvery/theme"

// Look up by name
const theme = getThemeByName("dark-truecolor")   // defaultDarkTheme
const light = getThemeByName("light-ansi16")      // ansi16LightTheme
const catppuccin = getThemeByName("catppuccin-mocha") // derived on access
```

## ANSI 16 Fallback

Two hardcoded themes provide baseline support for terminals limited to 16 colors.

### ansi16DarkTheme

Token values are ANSI color names (e.g., `"yellow"`, `"whiteBright"`, `"gray"`) rather than hex strings. The `palette` array contains the 16 standard color names.

Key mappings:
- `primary` = `"yellow"`, `accent` = `"blueBright"`
- `fg` = `"whiteBright"`, `muted` = `"white"`, `disabledfg` = `"gray"`
- `border` / `inputborder` = `"gray"`, `focusborder` / `link` = `"blueBright"`
- `error` = `"redBright"`, `success` = `"greenBright"`, `warning` = `"yellow"`

### ansi16LightTheme

Same structure, inverted for light backgrounds:
- `primary` = `"blue"`, `accent` = `"cyan"`
- `fg` = `"black"`, `muted` = `"blackBright"`, `disabledfg` = `"gray"`
- `error` = `"red"`, `success` = `"green"`

### When They Activate

ANSI 16 themes are used when:
- `deriveTheme(palette, "ansi16")` is called explicitly
- The detected color level is `"basic"` (only 16 colors supported)
- No palette detection is available and the application falls back to safe defaults

## Color Utilities

Low-level functions for color manipulation, available from `silvery/theme` or `@silvery/theme`.

### Blending and Manipulation

```typescript
import { blend, brighten, darken, desaturate, complement } from "silvery/theme"

blend("#2E3440", "#ECEFF4", 0.5)   // midpoint between two colors
brighten("#2E3440", 0.1)           // 10% toward white
darken("#ECEFF4", 0.1)             // 10% toward black
desaturate("#BF616A", 0.4)         // reduce saturation by 40%
complement("#EBCB8B")              // 180-degree hue rotation
```

| Function     | Signature                          | Description                                      |
| ------------ | ---------------------------------- | ------------------------------------------------ |
| `blend`      | `(a, b, t) => string`             | Linear RGB blend. `t=0` returns `a`, `t=1` returns `b`. |
| `brighten`   | `(color, amount) => string`       | Blend toward white by `amount` (0--1).            |
| `darken`     | `(color, amount) => string`       | Blend toward black by `amount` (0--1).            |
| `desaturate` | `(color, amount) => string`       | Reduce saturation by `amount` (0--1) in HSL.     |
| `complement` | `(color) => string`               | 180-degree hue rotation in HSL.                  |

All functions accept hex strings (`#RRGGBB`). Non-hex inputs are returned unchanged.

### Contrast

```typescript
import { contrastFg, checkContrast, ensureContrast } from "silvery/theme"

contrastFg("#2E3440")                    // "#FFFFFF" (white text on dark bg)
contrastFg("#ECEFF4")                    // "#000000" (black text on light bg)

checkContrast("#FFFFFF", "#000000")      // { ratio: 21, aa: true, aaa: true }
checkContrast("#777777", "#888888")      // { ratio: ~1.3, aa: false, aaa: false }

ensureContrast("#FFAB91", "#FFFFFF", 4.5) // "#B35600" (darkened to meet AA)
ensureContrast("#5C9FFF", "#1A1A2E", 4.5) // "#5C9FFF" (already passes)
```

| Function         | Signature                                | Description                                                  |
| ---------------- | ---------------------------------------- | ------------------------------------------------------------ |
| `contrastFg`     | `(bg) => "#000000" \| "#FFFFFF"`         | Pick black or white for readability on `bg`.                 |
| `checkContrast`  | `(fg, bg) => ContrastResult \| null`     | WCAG 2.1 contrast ratio with AA/AAA pass/fail.              |
| `ensureContrast` | `(color, against, minRatio) => string`   | Adjust lightness until the contrast target is met. Preserves hue and saturation. |

`ensureContrast` uses binary search over lightness in HSL space. It returns the original color unchanged if the target is already met.

### Conversion

```typescript
import { hexToRgb, rgbToHex, hexToHsl, hslToHex, rgbToHsl } from "silvery/theme"

hexToRgb("#BF616A")          // [191, 97, 106]
rgbToHex(191, 97, 106)       // "#BF616A"
hexToHsl("#BF616A")          // [354.3, 0.39, 0.56]
hslToHex(354.3, 0.39, 0.56)  // "#BF616A"
rgbToHsl(191, 97, 106)       // [354.3, 0.39, 0.56]
```

## Usage in Components

Components reference theme tokens with the `$` prefix. Resolution happens automatically within a `ThemeProvider`.

```tsx
import { ThemeProvider, defaultDarkTheme, Box, Text } from "silvery"

function App() {
  return (
    <ThemeProvider theme={defaultDarkTheme}>
      <Text color="$primary">Deploy</Text>
      <Text color="$muted">3 files changed</Text>
      <Box backgroundColor="$surface-bg" borderStyle="single" borderColor="$border">
        <Text color="$success">All tests passed</Text>
      </Box>
    </ThemeProvider>
  )
}
```

### ThemeProvider

Wraps the app (or a subtree) to enable `$token` resolution:

```tsx
<ThemeProvider theme={defaultDarkTheme}>
  <App />
</ThemeProvider>
```

### useTheme()

Read the current theme from any component:

```tsx
import { useTheme } from "silvery/theme"

function StatusLine() {
  const theme = useTheme()
  const color = theme.primary // hex string
  return <Text color="$primary">Status</Text>
}
```

Returns `defaultDarkTheme` when no `ThemeProvider` is present.

### Per-subtree Overrides

Use the `theme` prop on `Box` to override token resolution for a subtree:

```tsx
<Box theme={lightTheme} borderStyle="single">
  {/* All $token references resolve against lightTheme here */}
  <Text color="$primary">Themed content</Text>
</Box>
```

See the [Theming guide](/reference/theming) for more detail on `$token` shorthand, special values (`inherit`, `mix()`, `$default`), and backward-compatible aliases.

## Usage in CLI (@silvery/style)

For non-React CLI output, use [`@silvery/style`](/reference/style) which provides the same theme token resolution without React:

```typescript
import { createStyle } from "@silvery/style"

const s = createStyle({ theme })
s.primary("deploy")     // resolves theme.primary -> hex -> ANSI
s.success("done")       // resolves theme.success -> hex -> ANSI
s.muted("(3 files)")    // resolves theme.muted -> hex -> ANSI
s.bold.red("error!")     // standard chalk-compatible styling
```

## Custom Palettes

### Manual ColorPalette

Create a `ColorPalette` object with all 22 required hex fields:

```typescript
import { deriveTheme } from "silvery/theme"
import type { ColorPalette } from "silvery/theme"

const myPalette: ColorPalette = {
  name: "my-palette",
  dark: true,
  black: "#1a1b26",
  red: "#f7768e",
  green: "#9ece6a",
  yellow: "#e0af68",
  blue: "#7aa2f7",
  magenta: "#bb9af7",
  cyan: "#7dcfff",
  white: "#a9b1d6",
  brightBlack: "#414868",
  brightRed: "#f7768e",
  brightGreen: "#9ece6a",
  brightYellow: "#e0af68",
  brightBlue: "#7aa2f7",
  brightMagenta: "#bb9af7",
  brightCyan: "#7dcfff",
  brightWhite: "#c0caf5",
  foreground: "#c0caf5",
  background: "#1a1b26",
  cursorColor: "#c0caf5",
  cursorText: "#1a1b26",
  selectionBackground: "#33467c",
  selectionForeground: "#c0caf5",
}

const theme = deriveTheme(myPalette)
```

### Theme Builder

The chainable builder API generates a full `ColorPalette` from minimal input:

```typescript
import { createTheme } from "silvery/theme"

// From just a background color
const theme = createTheme().bg("#1e1e2e").build()

// With foreground and primary
const theme = createTheme()
  .bg("#1e1e2e")
  .fg("#cdd6f4")
  .primary("#89b4fa")
  .build()

// From a built-in preset with an override
const theme = createTheme()
  .preset("nord")
  .primary("#A3BE8C")
  .build()

// Force dark/light mode
const theme = createTheme().primary("#EBCB8B").dark().build()
```

Builder methods:

| Method            | Description                              |
| ----------------- | ---------------------------------------- |
| `.bg(color)`      | Set background color                     |
| `.fg(color)`      | Set foreground color                     |
| `.primary(color)` | Set primary accent color                 |
| `.accent(color)`  | Alias for `.primary()`                   |
| `.dark()`         | Force dark mode                          |
| `.light()`        | Force light mode                         |
| `.color(name, value)` | Set any palette color by name        |
| `.palette(p)`     | Set full palette at once                 |
| `.preset(name)`   | Load a built-in palette by name          |
| `.build()`        | Derive the final `Theme`                 |

### quickTheme()

Create a theme from a single color:

```typescript
import { quickTheme } from "silvery/theme"

quickTheme("#818cf8")          // indigo primary, dark mode (default)
quickTheme("#818cf8", "light") // indigo primary, light mode
quickTheme("blue")             // named color, dark mode
quickTheme("green", "dark")    // named color, explicit dark
```

Supported named colors: `red`, `orange`, `yellow`, `green`, `teal`, `cyan`, `blue`, `purple`, `pink`, `magenta`, `white`.

### autoGenerateTheme()

Generate a complete theme from a single hex color with automatic palette derivation:

```typescript
import { autoGenerateTheme } from "silvery/theme"

const theme = autoGenerateTheme("#5E81AC", "dark")
const light = autoGenerateTheme("#E06C75", "light")
```

Uses HSL manipulation to derive complementary accents, surface ramps, and status colors from the primary.

### fromColors()

Generate a full `ColorPalette` from 1--3 hex colors:

```typescript
import { fromColors, deriveTheme } from "silvery/theme"

const palette = fromColors({
  background: "#1e1e2e",
  foreground: "#cdd6f4",
  primary: "#89b4fa",
  dark: true,
})
const theme = deriveTheme(palette)
```

At minimum, provide `background` or `primary`. Missing colors are generated via surface ramps and hue rotation.

## Data Flow

```
Terminal palette file (Ghostty, Kitty, etc.)
           │
           ▼
    ┌──────────────┐
    │ ColorPalette │  22 hex colors — universal pivot format
    │   (Layer 1)  │
    └──────┬───────┘
           │
     deriveTheme()    contrast targets, blending, contrastFg()
           │
           ▼
    ┌──────────────┐
    │    Theme     │  33 semantic tokens — what UI consumes
    │   (Layer 2)  │
    └──────┬───────┘
           │
   resolveThemeColor()    "$primary" → "#EBCB8B"
           │
           ├──► Component props      color="$primary"
           ├──► createStyle()        s.primary("text")
           └──► Programmatic access  useTheme().primary
```
