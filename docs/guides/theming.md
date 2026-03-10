# Theming

Silvery ships with a comprehensive theme system via `@silvery/theme`. It provides 45 built-in palettes from popular theme systems, a builder API for custom themes, and auto-generation from a single color.

## Architecture

The theme system has a two-layer design:

1. **ColorPalette** (22 colors) -- The universal terminal format: 16 ANSI colors + 6 special colors (foreground, background, cursor, selection). This is what palette generators produce.
2. **Theme** (33 tokens) -- Semantic UI tokens that components consume. Follows shadcn-style pairing: `$name` (area background) + `$namefg` (text on that area).

The pipeline is straightforward:

```
Palette generators --> ColorPalette (22) --> deriveTheme() --> Theme (33)
```

## Quick Start

The fastest way to use a theme is with the builder API:

```typescript
import { createTheme } from "@silvery/theme"

// From a built-in palette
const theme = createTheme().preset("catppuccin-mocha").build()

// From a single color
const theme = createTheme().primary("#5E81AC").dark().build()

// From background + primary
const theme = createTheme()
  .bg("#2E3440")
  .fg("#ECEFF4")
  .primary("#EBCB8B")
  .build()
```

Or use the convenience functions:

```typescript
import { presetTheme, quickTheme, autoGenerateTheme } from "@silvery/theme"

// Load a preset
const nord = presetTheme("nord")

// Quick theme from a color name or hex
const theme = quickTheme("blue", "dark")
const custom = quickTheme("#E06C75", "light")

// Full auto-generation from a single hex color
const generated = autoGenerateTheme("#5E81AC", "dark")
```

## Using Themes in Components

Wrap your app in `ThemeProvider` and reference tokens with the `$` prefix:

```tsx
import { ThemeProvider, Box, Text } from "silvery"
import { presetTheme } from "@silvery/theme"

const theme = presetTheme("dracula")

function App() {
  return (
    <ThemeProvider theme={theme}>
      <Box borderStyle="single">
        <Text color="$primary">Primary accent</Text>
        <Text color="$mutedfg">Secondary text</Text>
        <Text color="$error">Error state</Text>
      </Box>
    </ThemeProvider>
  )
}
```

Any color prop starting with `$` resolves against the active theme. Non-`$` values pass through unchanged (`color="red"`, `color="#ff0000"`).

## Theme Explorer

Browse all 45 built-in palettes, preview how they look in a terminal, or generate a custom theme from any color.

<script setup>
import ThemeExplorer from '../.vitepress/components/ThemeExplorer.vue'
</script>

<ThemeExplorer />

## Built-in Palettes

The `@silvery/theme` package includes 45 palettes from these theme families:

| Family | Variants | Mode |
|--------|----------|------|
| Catppuccin | Mocha, Frappe, Macchiato, Latte | 3 dark + 1 light |
| Nord | Nord | dark |
| Dracula | Dracula | dark |
| Solarized | Dark, Light | 1 dark + 1 light |
| Tokyo Night | Night, Storm, Day | 2 dark + 1 light |
| One Dark | One Dark | dark |
| Gruvbox | Dark, Light | 1 dark + 1 light |
| Rose Pine | Pine, Moon, Dawn | 2 dark + 1 light |
| Kanagawa | Wave, Dragon, Lotus | 2 dark + 1 light |
| Everforest | Dark, Light | 1 dark + 1 light |
| Monokai | Classic, Pro | 2 dark |
| Snazzy | Snazzy | dark |
| Material | Dark, Light | 1 dark + 1 light |
| Palenight | Palenight | dark |
| Ayu | Dark, Mirage, Light | 2 dark + 1 light |
| Nightfox | Nightfox, Dawnfox | 1 dark + 1 light |
| Horizon | Horizon | dark |
| Moonfly | Moonfly | dark |
| Nightfly | Nightfly | dark |
| Oxocarbon | Dark, Light | 1 dark + 1 light |
| Sonokai | Sonokai | dark |
| Edge | Dark, Light | 1 dark + 1 light |
| Modus | Vivendi, Operandi | 1 dark + 1 light |

Access any palette by name:

```typescript
import { getPaletteByName, builtinPalettes } from "@silvery/theme"

// Get a specific palette
const palette = getPaletteByName("catppuccin-mocha")

// List all palette names
const names = Object.keys(builtinPalettes) // 45 entries
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

## Theme Builder

The chainable builder API gives you control at every level:

```typescript
import { createTheme } from "@silvery/theme"

// Minimal -- just a background (mode inferred from luminance)
const theme = createTheme().bg("#2E3440").build()

// Override specific palette colors
const theme = createTheme()
  .preset("nord")
  .primary("#A3BE8C")
  .color("red", "#FF0000")
  .build()

// Force light mode regardless of background
const theme = createTheme()
  .bg("#1a1a2e")
  .light()
  .build()
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

## Semantic Tokens

The 33 semantic tokens in a Theme follow a consistent naming pattern. Each area has a background token and a foreground (`fg`) token:

| Token Pair | Purpose |
|------------|---------|
| `bg` / `fg` | Default background and text |
| `surface` / `surfacefg` | Elevated content areas |
| `popover` / `popoverfg` | Floating content (dropdowns, tooltips) |
| `muted` / `mutedfg` | Hover states, secondary text |
| `primary` / `primaryfg` | Brand accent |
| `secondary` / `secondaryfg` | Alternate accent |
| `accent` / `accentfg` | Attention/pop accent |
| `error` / `errorfg` | Error/destructive states |
| `warning` / `warningfg` | Caution states |
| `success` / `successfg` | Positive states |
| `info` / `infofg` | Neutral information |
| `selection` / `selectionfg` | Selected items |
| `inverse` / `inversefg` | Chrome (title/status bars) |
| `cursor` / `cursorfg` | Text cursor |

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
