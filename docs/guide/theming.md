# Theming

_How to use schemes, tokens, and theme switching in your Silvery apps_

Silvery auto-detects your terminal's color palette and runs it through [Sterling](/guide/sterling) — silvery's canonical design system — to produce a complete theme. Your app matches whatever the user has configured (Dracula, Nord, Catppuccin, etc.) with zero work on your end. This guide shows you how to take control when you need to.

For type definitions and derivation rules, see the [@silvery/theme reference](/reference/theme). For the design-system fundamentals, see the [Sterling primer](/guide/sterling).

## Quick Start

Pick a scheme, derive a theme, wrap your app:

```tsx
import { ThemeProvider, Box, Text } from "silvery"
import { sterling, catppuccinMocha } from "silvery/theme"

const theme = sterling.deriveFromScheme(catppuccinMocha)

function App() {
  return (
    <ThemeProvider theme={theme}>
      <Box borderStyle="single">
        <Text color="$fg-accent">Deploy complete</Text>
        <Text color="$fg-muted">3 files changed</Text>
      </Box>
    </ThemeProvider>
  )
}
```

Without `ThemeProvider`, Silvery uses the auto-detected terminal theme. You only need it when you want to pin a specific look.

## Using Theme Tokens

Any color prop starting with `$` resolves against the active theme. This is the primary way to color things in Silvery.

### Text and Emphasis

```tsx
<Text color="$fg-accent">Brand emphasis — headings, active items, focus</Text>
<Text color="$fg-muted">Secondary text — descriptions, timestamps</Text>
<Text color="$fg-link">Hyperlinks — distinct from accent</Text>
```

### Status Colors

```tsx
<Text color="$fg-success">All tests passed</Text>
<Text color="$fg-warning">3 deprecation warnings</Text>
<Text color="$fg-error">Build failed</Text>
<Text color="$fg-info">Tip: run with --verbose for details</Text>
```

### Surfaces and Backgrounds

```tsx
{
  /* Subtle elevation — cards, list rows */
}
;<Box backgroundColor="$bg-surface-subtle">
  <Text>Card content</Text>
</Box>

{
  /* Raised elevation — dialogs, modals */
}
;<Box backgroundColor="$bg-surface-raised" borderStyle="single">
  <Text>Dialog content</Text>
</Box>

{
  /* Overlay elevation — tooltips, dropdowns */
}
;<Box backgroundColor="$bg-surface-overlay">
  <Text>Menu item</Text>
</Box>

{
  /* Status bar / chrome */
}
;<Box backgroundColor="$bg-inverse">
  <Text color="$fg-on-inverse"> main 3 files Ln 42 </Text>
</Box>
```

### Filled Areas (status / accent / selected)

For tokens with `bg-X` fill, use the matching `fg-on-X` for guaranteed-contrast text:

```tsx
{
  /* Primary action — accent fill */
}
;<Box backgroundColor="$bg-accent">
  <Text color="$fg-on-accent">Deploy</Text>
</Box>

{
  /* Error banner */
}
;<Box backgroundColor="$bg-error">
  <Text color="$fg-on-error">Build failed: missing dependency</Text>
</Box>

{
  /* Success badge */
}
;<Box backgroundColor="$bg-success">
  <Text color="$fg-on-success"> PASS </Text>
</Box>

{
  /* Cursor row / selection */
}
;<Box backgroundColor="$bg-selected">
  <Text color="$fg-on-selected"> active line </Text>
</Box>
```

`$fg-on-X` is contrast-picked (black or white) at derivation time, so legibility is guaranteed across all 84 bundled schemes.

### Raw Palette Access

Access the 16 ANSI colors directly with `$color0` through `$color15`:

```tsx
<Text color="$color1">ANSI red</Text>
<Text color="$color4">ANSI blue</Text>
<Text color="$color14">ANSI bright cyan</Text>
```

These bypass semantic meaning — prefer Sterling's categorical hue ring (`$red`, `$blue`, `$green`, …) for tagging, or named tokens like `$fg-error` / `$fg-accent` for chrome. Reach for `$color*` only when you need exact ANSI parity (syntax highlighters, git diff viewers).

### Accessing the Theme Object

Read the current theme from any component with `useTheme()`:

```tsx
import { useTheme } from "silvery/theme"

function StatusLine() {
  const theme = useTheme()
  // theme.accent.fg, theme.muted.fg, etc. are resolved hex strings
  // theme["fg-accent"] / theme["fg-muted"] reference the same hex strings
  return <Text color="$fg-accent">{theme.name}</Text>
}
```

## Switching Schemes

### At Startup

Pick a built-in scheme and derive a theme before rendering:

```tsx
import { ThemeProvider } from "silvery"
import { sterling, tokyoNight } from "silvery/theme"

const theme = sterling.deriveFromScheme(tokyoNight)

function App() {
  return <ThemeProvider theme={theme}>{/* ... */}</ThemeProvider>
}
```

### At Runtime

Store the theme in state and swap it on demand:

```tsx
import { useState } from "react"
import { ThemeProvider, Box, Text } from "silvery"
import { sterling, nord, dracula, rosePine } from "silvery/theme"

const themes = {
  nord: sterling.deriveFromScheme(nord),
  dracula: sterling.deriveFromScheme(dracula),
  "rose-pine": sterling.deriveFromScheme(rosePine),
}

function App() {
  const [name, setName] = useState<keyof typeof themes>("nord")

  return (
    <ThemeProvider theme={themes[name]}>
      <Text color="$fg-accent">Current: {name}</Text>
      {/* Cycle themes on 't' keypress */}
    </ThemeProvider>
  )
}
```

### Per-Subtree Overrides

Use the `theme` prop on `Box` to override tokens for a subtree — useful for light panels inside a dark app:

```tsx
import { sterling, catppuccinMocha, catppuccinLatte } from "silvery/theme"

const lightTheme = sterling.deriveFromScheme(catppuccinLatte)

function App() {
  return (
    <ThemeProvider theme={sterling.deriveFromScheme(catppuccinMocha)}>
      <Text color="$fg-accent">Dark context</Text>

      <Box theme={lightTheme} borderStyle="single">
        {/* All $tokens resolve against lightTheme here */}
        <Text color="$fg-accent">Light context</Text>
      </Box>
    </ThemeProvider>
  )
}
```

## Custom Themes

Sterling exposes the [DesignSystem contract](/guide/sterling#authoring-an-alternative-designsystem) with five entry points — pick the one that matches what you have.

### From a single seed color

The fastest way to get a unique theme — provide one hex color and Sterling generates everything else:

```typescript
import { sterling } from "silvery/theme"

const theme = sterling.deriveFromColor("#818cf8") // dark mode (default)
const light = sterling.deriveFromColor("#818cf8", { mode: "light" })
```

### From a light/dark scheme pair

Derive both modes at once — useful when you ship a paired theme:

```typescript
import { sterling, catppuccinLatte, catppuccinMocha } from "silvery/theme"

const { light, dark } = sterling.deriveFromPair(catppuccinLatte, catppuccinMocha)
```

### From a scheme + brand overlay

Apply your brand color on top of an existing scheme — your theme keeps the scheme's character but pivots around your brand:

```typescript
import { sterling, nord } from "silvery/theme"

const theme = sterling.deriveFromSchemeWithBrand(nord, "#5B8DEF")
```

### From the defaults, with overrides

Sterling ships built-in defaults you can layer onto:

```typescript
import { sterling } from "silvery/theme"

// Defaults — silvery's baseline (no input)
const theme = sterling.defaults("dark")

// Defaults plus per-role overrides
const theme = sterling.theme(
  {
    accent: { bg: "#5B8DEF" },
    error: { fg: "#bf616a" },
  },
  { mode: "dark" },
)
```

### Full manual scheme

For complete control, provide all 22 colors as a `ColorScheme` and derive:

```typescript
import { sterling } from "silvery/theme"
import type { ColorScheme } from "silvery/theme"

const myScheme: ColorScheme = {
  name: "my-scheme",
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

const theme = sterling.deriveFromScheme(myScheme)
```

See the [ColorScheme type definition](/reference/theme#colorscheme-22-colors) for all fields, the [Color Schemes guide](/guide/color-schemes) for the broader model, and the [Sterling primer](/guide/sterling#deriveoptions) for `DeriveOptions` (`contrast`, `pins`, `trace`, `mode`).

### Pinning specific tokens

If auto-lift is adjusting a token you want untouched, pin it explicitly. Pins accept either nested or flat path syntax:

```typescript
const theme = sterling.deriveFromScheme(myScheme, {
  pins: {
    "accent.bg": "#5B8DEF", // nested
    "fg-on-error": "#FFFFFF", // flat
  },
})
```

### Strict-mode contrast checking

Use `contrast: "strict"` in tests to catch palettes that fail WCAG AA:

```typescript
const theme = sterling.deriveFromScheme(myScheme, { contrast: "strict" })
// Throws SterlingContrastError on AA failure of core role pairs.
```

## CLI Usage

For non-React CLI output (spinners, log messages, progress lines), use `@silvery/ansi` instead of chalk. It resolves the same `$tokens` without React:

```typescript
import { createStyle } from "@silvery/ansi"
import { sterling, nord } from "silvery/theme"

const theme = sterling.deriveFromScheme(nord)
const s = createStyle({ theme })

console.log(s["fg-accent"]("deploy") + " " + s["fg-muted"]("starting..."))
console.log(s["fg-success"]("done") + " " + s["fg-muted"]("(3 files)"))
console.log(s.bold["fg-error"]("FAIL") + " missing dependency")
```

Without a theme, token names fall back to sensible ANSI colors. See the [@silvery/ansi reference](/reference/style) for the full chainable API.

## Color Level Degradation

Silvery detects the terminal's color capabilities and adapts automatically. The same `$token` code works everywhere — only the visual fidelity changes.

### Three Color Levels

| Level       | Colors | When                                      | Token Resolution                           |
| ----------- | ------ | ----------------------------------------- | ------------------------------------------ |
| `truecolor` | 16M    | Modern terminals (Ghostty, Kitty, iTerm2) | Hex blending, contrast-adjusted derivation |
| `256`       | 256    | Older terminals, some SSH sessions        | Hex values downsampled to nearest 256      |
| `basic`     | 16     | Very old terminals, CI, pipes             | Direct ANSI color name mapping             |

Detection is automatic. Override with environment variables:

```bash
FORCE_COLOR=1   # Force basic (16 colors)
FORCE_COLOR=2   # Force 256 colors
FORCE_COLOR=3   # Force truecolor
NO_COLOR=1      # Disable all color
```

### Pre-built Themes

Four themes ship pre-derived for instant use:

```typescript
import {
  ansi16DarkTheme,
  ansi16LightTheme,
  defaultDarkTheme,
  defaultLightTheme,
  getThemeByName,
} from "silvery/theme"

const theme = getThemeByName("dark-truecolor") // defaultDarkTheme
const light = getThemeByName("light-ansi16") // ansi16LightTheme
const catppuccin = getThemeByName("catppuccin-mocha") // derived on access
```

## Terminal Palette Detection

Silvery reads the terminal's actual colors at startup via OSC escape sequences (OSC 4 for ANSI colors, OSC 10/11 for fg/bg). This means a Dracula user gets Dracula colors and a Nord user gets Nord colors — automatically.

```typescript
import { detectTheme, getSchemeByName } from "silvery/theme"

// Manual detection with a custom fallback
const theme = await detectTheme({
  fallback: getSchemeByName("nord"),
})
```

Supported terminals: Ghostty, Kitty, WezTerm, iTerm2, foot, Alacritty, xterm. Falls back gracefully in tmux, CI, and pipe environments.

`detectTheme` is Sterling-aware — its result has flat hyphen-keys baked, so `$bg-accent` etc. resolve immediately without an explicit augment call.

## Color Scheme Detection (Mode 2031)

Silvery can detect whether the terminal is in dark or light mode using Mode 2031 — a terminal protocol where the terminal self-reports its color scheme. This works cross-platform (Linux, Windows Terminal, SSH sessions), unlike the macOS-only `AppleInterfaceStyle` approach.

```typescript
import { createBgModeDetector } from "@silvery/ansi"

using detector = createBgModeDetector({
  write: (data) => process.stdout.write(data),
  onData: (handler) => {
    process.stdin.on("data", handler)
    return () => process.stdin.off("data", handler)
  },
  fallback: () => "dark",
})

detector.start()
detector.subscribe((scheme) => {
  console.log("Color scheme changed:", scheme)
})
```

**Supported terminals:** Contour, foot, WezTerm (1.0+), and growing. Terminals that don't support Mode 2031 are handled gracefully via the timeout + fallback mechanism.

## Debugging Themes

Pass `trace: true` to any Sterling derivation entry point to see how each token was produced:

```typescript
import { sterling, nord } from "silvery/theme"

const theme = sterling.deriveFromScheme(nord, { trace: true })

for (const step of theme.derivationTrace ?? []) {
  console.log(`${step.token}: ${step.rule} → ${step.output}`, step.inputs)
  if (step.liftedFrom) {
    console.log(`  (auto-lifted from ${step.liftedFrom})`)
  }
}
```

Each step records the token path, the rule that produced it, the inputs, the output, and `liftedFrom` if `auto-lift` adjusted the value to meet contrast.

## Further Reading

- **[Sterling primer](/guide/sterling)** — silvery's canonical design system: roles, flat tokens, derivation entry points, full migration map.
- [@silvery/theme reference](/reference/theme) — full type definitions, derivation rules, built-in palettes
- [Theming reference](/reference/theming) — `$token` shorthand, special values, `ThemeProvider` API
- [Styling guide](/guide/styling) — when to use tokens vs letting components handle it
- [@silvery/ansi reference](/reference/style) — CLI styling API
- [Theme Explorer](/themes) — browse all 84 color schemes interactively
