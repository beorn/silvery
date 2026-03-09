# Theming

silvery provides a modern, progressively enhanced theme system with semantic color
tokens. Themes work across terminal capability tiers — from ANSI 16 colors to
full 24-bit truecolor — using the same token vocabulary.

## Setup

Wrap your app in `ThemeProvider` with a theme object:

```tsx
import { ThemeProvider, ansi16DarkTheme, Box, Text } from "@silvery/term"

function App() {
  return (
    <ThemeProvider theme={ansi16DarkTheme}>
      <Box borderStyle="single">
        <Text color="$primary">Hello</Text>
        <Text color="$text2">world</Text>
      </Box>
    </ThemeProvider>
  )
}
```

## $token Shorthand

Any color prop on `Box` or `Text` that starts with `$` resolves against the active theme:

| Prop              | Components | Example                      |
| ----------------- | ---------- | ---------------------------- |
| `color`           | Box, Text  | `color="$primary"`           |
| `backgroundColor` | Box, Text  | `backgroundColor="$surface"` |
| `borderColor`     | Box        | `borderColor="$separator"`   |
| `outlineColor`    | Box        | `outlineColor="$focusring"`  |

Non-`$` values pass through unchanged (`color="red"`, `color="#ff0000"`).

**Default border color**: When `borderStyle` or `outlineStyle` is set without an
explicit color, the theme's `$separator` token is used automatically.

## Token Reference

### Brand (3 tokens)

| Token      | Use                                          | ANSI 16 Dark | Truecolor Dark |
| ---------- | -------------------------------------------- | ------------ | -------------- |
| `$primary` | Brand tint, active indicators, headings      | yellow       | #EBCB8B        |
| `$link`    | Hyperlinks, references                       | yellowBright | #ECCC90        |
| `$control` | Interactive chrome, shortcuts, input borders | yellow       | #B8A06E        |

### Selection (3 tokens)

| Token         | Use                                  | ANSI 16 Dark | Truecolor Dark |
| ------------- | ------------------------------------ | ------------ | -------------- |
| `$selected`   | Selection highlight background       | cyan         | #88C0D0        |
| `$selectedfg` | Text on selected background          | black        | #2E3440        |
| `$focusring`  | Keyboard focus outline (always blue) | blueBright   | #5E81AC        |

### Text (4 tokens)

| Token    | Use                                 | ANSI 16 Dark | Truecolor Dark |
| -------- | ----------------------------------- | ------------ | -------------- |
| `$text`  | Primary content — headings, body    | whiteBright  | #ECEFF4        |
| `$text2` | Secondary — descriptions, metadata  | white        | #D8DEE9        |
| `$text3` | Tertiary — timestamps, hints        | gray         | #7B88A1        |
| `$text4` | Quaternary — ghost text, decorative | gray (+dim)  | #545E72        |

### Surface (5 tokens)

| Token        | Use                                   | ANSI 16 Dark | Truecolor Dark |
| ------------ | ------------------------------------- | ------------ | -------------- |
| `$bg`        | Default background                    | (default)    | #2E3440        |
| `$surface`   | Dialogs, overlays, popovers           | black        | #3B4252        |
| `$separator` | Dividers, borders, rules              | gray         | #4C566A        |
| `$chromebg`  | Title bars, status bars (inverted bg) | whiteBright  | #ECEFF4        |
| `$chromefg`  | Text on chrome areas (inverted fg)    | black        | #2E3440        |

### Status (3 tokens)

| Token      | Use                          | ANSI 16 Dark | Truecolor Dark |
| ---------- | ---------------------------- | ------------ | -------------- |
| `$error`   | Destructive, overdue, errors | redBright    | #BF616A        |
| `$warning` | Caution, unsaved changes     | yellow       | #EBCB8B        |
| `$success` | Positive, completed, saved   | greenBright  | #A3BE8C        |

### Content Palette (16 indexed colors)

For categorization — tags, calendar colors, chart series:

```tsx
<Text color="$color5">purple tag</Text>
<Text color="$color1">red badge</Text>
```

`$color0` through `$color15` map to the theme's `palette` array. At ANSI 16
these are the standard terminal colors; at truecolor they are curated
equal-weight hues designed for readability in both dark and light modes.

## Progressive Enhancement

The same token vocabulary works across all terminal capability tiers:

### ANSI 16 (baseline — every terminal)

Each token maps to one of the 16 standard colors. Differentiation comes from
the bright variants (e.g., `yellow` vs `yellowBright`) and the `dimColor`
attribute. No color derivation is possible — all tokens are independent.

### 256-color

Tokens can use the 216-color cube (indices 16–231) and the 24-shade gray ramp
(indices 232–255). This enables 2-3 levels of tint/shade per hue.

### Truecolor (24-bit)

Full derivation from a single primary hue. The token relationships become
mathematical:

- `link` = primary lightened 5%
- `control` = primary at 70% lightness
- `selected` = contrasting hue at 30% opacity over bg
- `text2` = text at 85% opacity
- `text3` = text at 50% opacity
- `text4` = text at 30% opacity
- `surface` = bg lightened 5% (dark mode) or darkened 3% (light mode)
- `separator` = text at 20% opacity
- `chromebg` = text color (inverted for use as background on title bars)
- `chromefg` = bg color (inverted for use as text on title bars)

## generateTheme()

Generate a complete ANSI 16 theme from a primary color:

```tsx
import { generateTheme } from "@silvery/term"

const theme = generateTheme("cyan", true) // primary=cyan, dark=true
const light = generateTheme("blue", false) // primary=blue, light mode
```

The function derives all 17 tokens from the primary color + dark/light preference:

- **Warm primaries** (yellow, red, magenta, green, white) get cyan as the
  contrasting selection color
- **Cool primaries** (cyan, blue) get yellow as the selection color
- `focusring` is always blue (accessibility — must always be distinguishable)
- `warning` equals `primary` (context always disambiguates via icons/labels)

Available primaries: `yellow`, `cyan`, `magenta`, `green`, `red`, `blue`, `white`.

## Creating Custom Themes

Implement the `Theme` interface:

```tsx
import { type Theme, ThemeProvider } from "@silvery/term"

const myTheme: Theme = {
  name: "my-theme",
  dark: true,

  primary: "#E0A526",
  link: "#E5B34A",
  control: "#B8871F",

  selected: "#4A90D9",
  selectedfg: "#1A1A1A",
  focusring: "#4A90D9",

  text: "#E8E8E8",
  text2: "#C0C0C0",
  text3: "#808080",
  text4: "#505050",

  bg: "#1A1A2E",
  surface: "#242440",
  separator: "#3A3A5A",

  error: "#E74C3C",
  warning: "#E0A526",
  success: "#2ECC71",

  palette: [
    /* 16 content colors */
  ],
}
```

### Deriving Colors

When building truecolor themes, derive related tokens from a base color to
maintain visual harmony:

```typescript
// Lighten: mix toward white
function lighten(hex: string, amount: number): string {
  // Increase each RGB channel by amount% toward 255
}

// Darken: mix toward black
function darken(hex: string, amount: number): string {
  // Decrease each RGB channel by amount%
}

// Opacity: blend toward background
function withOpacity(fg: string, bg: string, opacity: number): string {
  // result = fg * opacity + bg * (1 - opacity)
}

// Contrast: pick black or white text for readability
function contrastFg(bg: string): string {
  // Calculate relative luminance (0.2126*R + 0.7152*G + 0.0722*B)
  // Return dark text if luminance > 0.5, light text otherwise
}
```

**Recommended derivation from a single accent hue:**

| Token        | Algorithm                                            |
| ------------ | ---------------------------------------------------- |
| `link`       | `lighten(primary, 5%)`                               |
| `control`    | `withOpacity(primary, bg, 0.7)`                      |
| `selected`   | Pick contrasting hue, 30% over bg                    |
| `selectedfg` | `contrastFg(selected)`                               |
| `text2`      | `withOpacity(text, bg, 0.85)`                        |
| `text3`      | `withOpacity(text, bg, 0.50)`                        |
| `text4`      | `withOpacity(text, bg, 0.30)`                        |
| `surface`    | `lighten(bg, 5%)` (dark) or `darken(bg, 3%)` (light) |
| `separator`  | `withOpacity(text, bg, 0.20)`                        |
| `chromebg`   | `text` (inverted: text color becomes background)     |
| `chromefg`   | `bg` or `contrastFg(chromebg)` (dark on light)       |

## Per-Subtree Theme Override

Use the `theme` prop on `Box` to override `$token` resolution for an entire subtree:

```tsx
const dimmedTheme: Theme = { ...baseTheme, selected: "gray", selectedfg: "white" }

<Box theme={dimmedTheme}>
  {/* All $selected references here resolve to "gray" */}
  <Text color="$selected">dimmed</Text>
</Box>
<Text color="$selected">normal</Text>
```

This works like CSS custom properties — the nearest ancestor `Box` with a `theme` prop
determines token resolution for its descendants. Nested `theme` props cascade (innermost wins).
When `theme` is `undefined`, tokens resolve against the root `ThemeProvider` theme.

The override happens during the content phase tree walk (no React re-renders). Cost is ~2ns
per `getActiveTheme()` call — negligible.

## useTheme() Hook

Read the current theme from any component:

```tsx
import { useTheme } from "@silvery/term"

function StatusLine() {
  const theme = useTheme()
  return <Text color={theme.dark ? "$text" : "$text2"}>Status</Text>
}
```

Returns `ansi16DarkTheme` when no `ThemeProvider` is present.

## resolveThemeColor()

For advanced use cases, resolve tokens programmatically:

```tsx
import { resolveThemeColor, useTheme } from "@silvery/term"

function CustomComponent({ highlight }: { highlight?: string }) {
  const theme = useTheme()
  const color = resolveThemeColor(highlight, theme) ?? theme.text
  // ...
}
```

## Backward Compatibility

Old token names from v1 are aliased automatically:

| Old Token     | Resolves To  |
| ------------- | ------------ |
| `$accent`     | `$primary`   |
| `$muted`      | `$text2`     |
| `$raisedbg`   | `$surface`   |
| `$background` | `$bg`        |
| `$border`     | `$separator` |

These aliases allow gradual migration. New code should use the v2 token names.

## Built-in Themes

| Name                | Tier      | Primary | Mode  |
| ------------------- | --------- | ------- | ----- |
| `ansi16DarkTheme`   | ANSI 16   | yellow  | dark  |
| `ansi16LightTheme`  | ANSI 16   | blue    | light |
| `defaultDarkTheme`  | Truecolor | #EBCB8B | dark  |
| `defaultLightTheme` | Truecolor | #0056B3 | light |

Select by name at runtime:

```tsx
import { getThemeByName } from "@silvery/term"

const theme = getThemeByName("dark-ansi16") // or "dark-truecolor", "light-ansi16", etc.
```
