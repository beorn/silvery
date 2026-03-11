# Theming

You don't need to configure theming. Silvery auto-detects your terminal's color palette and generates a complete theme from it — your app automatically matches whatever theme the user has configured in their terminal (Dracula, Solarized, Nord, etc.). Use `$token` color props like `color="$primary"` and they resolve to the right colors everywhere.

If detection isn't available (CI, tmux, pipes), Silvery falls back to a sensible ANSI-16 dark theme that works on any terminal.

## Zero Configuration

The simplest setup — no theme code at all:

```tsx
import { Box, Text } from "silvery"

function App() {
  return (
    <Box borderStyle="single">
      <Text color="$primary">Accent text</Text>
      <Text color="$muted">Secondary text</Text>
      <Text color="$error">Error state</Text>
    </Box>
  )
}
```

`$token` colors resolve against the active theme. Without any `ThemeProvider`, Silvery uses a built-in default. Non-`$` values pass through unchanged (`color="red"`, `color="#ff0000"`).

## Taking Control

When you want a specific look, you have three layers — each optional:

```
1 color ──→ Color Palette (22) ──→ Theme (33 design tokens)
             ↑                       ↑
             preset or terminal      what components consume
```

1. **Seed** (1 color) -- A single hex color like `"#5E81AC"` auto-generates a full palette via HSL manipulation.
2. **Color Palette** (22 colors) -- 16 ANSI colors + 6 special colors (foreground, background, cursor, selection). From a seed, a built-in preset (38 included), or the terminal's own colors via OSC queries.
3. **Theme** (33 design tokens) -- What components consume. Derived from the palette via `deriveTheme()`. Follows shadcn-style pairing: `$name` (area background) + `$namefg` (text on that area).

Enter at any layer: one color, a full palette, or a complete theme.

### Builder API

```typescript
import { createTheme } from "@silvery/theme"

// From a built-in palette
const theme = createTheme().preset("catppuccin-mocha").build()

// From a single color
const theme = createTheme().primary("#5E81AC").dark().build()

// From background + primary
const theme = createTheme().bg("#2E3440").fg("#ECEFF4").primary("#EBCB8B").build()
```

### Convenience functions

```typescript
import { presetTheme, quickTheme, autoGenerateTheme, detectTheme } from "@silvery/theme"

// Load a preset
const nord = presetTheme("nord")

// Quick theme from a color name or hex
const theme = quickTheme("blue", "dark")
const custom = quickTheme("#E06C75", "light")

// Full auto-generation from a single hex color
const generated = autoGenerateTheme("#5E81AC", "dark")

// Explicit terminal detection (Silvery does this automatically,
// but you can call it yourself for custom fallback logic)
const detected = await detectTheme()
```

## Auto-Generation

Generate a complete theme from a single primary color. The system uses HSL color manipulation to derive all 22 palette colors:

- **Background/foreground** from lightness inversion
- **Accent colors** from hue rotation (red at 0, green at 130, blue at 220, etc.)
- **Surface ramp** from background blending
- **Status colors** (error, warning, success, info) from standard hue positions

```typescript
import { autoGenerateTheme } from "@silvery/theme"

const dark = autoGenerateTheme("#5E81AC", "dark")
// Generates a full dark theme with blue as the primary accent

const light = autoGenerateTheme("#E06C75", "light")
// Generates a full light theme with red/rose as the primary accent
```

The auto-generated theme uses the input color as the exact `primary` token, then derives everything else to be harmonious with it.

## Terminal Palette Detection

Silvery reads the terminal's actual colors at startup via OSC 4 (ANSI colors), OSC 10 (foreground), and OSC 11 (background), then derives a full theme from whatever the terminal reports. This happens automatically — Dracula users get Dracula colors, Solarized users get Solarized colors, with no configuration on your end. Dark/light mode is detected from the background luminance.

If you need explicit control over detection (e.g., custom fallback logic), call `detectTheme()` directly:

```typescript
import { detectTheme, getPaletteByName } from "@silvery/theme"

// Explicit detection with a custom fallback for terminals that don't respond to OSC queries
const theme = await detectTheme({ fallback: getPaletteByName("nord") })
```

Supported terminals: Ghostty, Kitty, WezTerm, iTerm2, foot, Alacritty, xterm. Falls back gracefully in tmux, CI, and pipe environments.

## Using Themes in Components

To use a specific theme, wrap your app in `ThemeProvider`:

```tsx
import { ThemeProvider, Box, Text } from "silvery"
import { presetTheme } from "@silvery/theme"

const theme = presetTheme("dracula")

function App() {
  return (
    <ThemeProvider theme={theme}>
      <Box borderStyle="single">
        <Text color="$primary">Primary accent</Text>
        <Text color="$muted">Secondary text</Text>
        <Text color="$error">Error state</Text>
      </Box>
    </ThemeProvider>
  )
}
```

Without `ThemeProvider`, the auto-detected or default theme is used — you only need this when you want to override.

## Theme Explorer

Browse all 38 built-in palettes and generate custom themes.

::: tip Interactive Tool
[Open Theme Explorer →](/themes) — full-width page with palette browser, terminal preview, and custom theme generator.
:::

## Built-in Palettes

The `@silvery/theme` package includes 38 palettes from these theme families:

| Family      | Variants                        | Mode             |
| ----------- | ------------------------------- | ---------------- |
| Catppuccin  | Mocha, Frappe, Macchiato, Latte | 3 dark + 1 light |
| Nord        | Nord                            | dark             |
| Dracula     | Dracula                         | dark             |
| Solarized   | Dark, Light                     | 1 dark + 1 light |
| Tokyo Night | Night, Storm, Day               | 2 dark + 1 light |
| One Dark    | One Dark                        | dark             |
| Gruvbox     | Dark, Light                     | 1 dark + 1 light |
| Rose Pine   | Pine, Moon, Dawn                | 2 dark + 1 light |
| Kanagawa    | Wave, Dragon, Lotus             | 2 dark + 1 light |
| Everforest  | Dark, Light                     | 1 dark + 1 light |
| Monokai     | Classic, Pro                    | 2 dark           |
| Snazzy      | Snazzy                          | dark             |
| Material    | Dark, Light                     | 1 dark + 1 light |
| Palenight   | Palenight                       | dark             |
| Ayu         | Dark, Mirage, Light             | 2 dark + 1 light |
| Nightfox    | Nightfox, Dawnfox               | 1 dark + 1 light |
| Horizon     | Horizon                         | dark             |
| Moonfly     | Moonfly                         | dark             |
| Nightfly    | Nightfly                        | dark             |
| Oxocarbon   | Dark, Light                     | 1 dark + 1 light |
| Sonokai     | Sonokai                         | dark             |
| Edge        | Dark, Light                     | 1 dark + 1 light |
| Modus       | Vivendi, Operandi               | 1 dark + 1 light |

Access any palette by name:

```typescript
import { getPaletteByName, builtinPalettes } from "@silvery/theme"

// Get a specific palette
const palette = getPaletteByName("catppuccin-mocha")

// List all palette names
const names = Object.keys(builtinPalettes) // 45 entries
```

## Theme Builder

The chainable builder API gives you control at every level:

```typescript
import { createTheme } from "@silvery/theme"

// Minimal -- just a background (mode inferred from luminance)
const theme = createTheme().bg("#2E3440").build()

// Override specific palette colors
const theme = createTheme().preset("nord").primary("#A3BE8C").color("red", "#FF0000").build()

// Force light mode regardless of background
const theme = createTheme().bg("#1a1a2e").light().build()
```

## CSS Export

Convert any theme to CSS custom properties for web use:

```typescript
import { themeToCSSVars } from "@silvery/theme"
import { presetTheme } from "@silvery/theme"

const theme = presetTheme("dracula")
const vars = themeToCSSVars(theme)
// { "--bg": "#282A36", "--fg": "#F8F8F2", "--primary": "#F1FA8C", ... }

// Apply to a DOM element
Object.assign(element.style, vars)
```

## Design Tokens

Silvery's theme system uses [design tokens](https://tr.designtokens.org/format/) -- named values that represent visual decisions. The 33 tokens in a Theme follow two pairing conventions:

**Surface pairs** — base name = text color, `*bg` = background:

| Token Pair                  | Purpose                                |
| --------------------------- | -------------------------------------- |
| `bg` / `fg`                 | Default background and text            |
| `surfacebg` / `surface`     | Elevated content areas                 |
| `popoverbg` / `popover`     | Floating content (dropdowns, tooltips) |
| `mutedbg` / `muted`         | Hover states, secondary text           |
| `selectionbg` / `selection` | Selected items                         |
| `inversebg` / `inverse`     | Chrome (title/status bars)             |
| `cursorbg` / `cursor`       | Text cursor                            |

**Accent pairs** — base name = area background, `*fg` = text on that area:

| Token Pair                  | Purpose                  |
| --------------------------- | ------------------------ |
| `primary` / `primaryfg`     | Brand accent             |
| `secondary` / `secondaryfg` | Alternate accent         |
| `accent` / `accentfg`       | Attention/pop accent     |
| `error` / `errorfg`         | Error/destructive states |
| `warning` / `warningfg`     | Caution states           |
| `success` / `successfg`     | Positive states          |
| `info` / `infofg`           | Neutral information      |

Plus 5 standalone tokens: `border`, `inputborder`, `focusborder`, `link`, `disabledfg`.

## Contrast Checking

The `@silvery/theme` package includes WCAG 2.1 contrast checking:

```typescript
import { checkContrast } from "@silvery/theme"

const result = checkContrast("#FFFFFF", "#000000")
// { ratio: 21, aa: true, aaa: true }

const poor = checkContrast("#777777", "#888888")
// { ratio: ~1.3, aa: false, aaa: false }
```
