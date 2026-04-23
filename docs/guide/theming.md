# Theming

_How to use palettes, tokens, and theme switching in your Silvery apps_

Silvery auto-detects your terminal's color palette and generates a full theme from it — your app matches whatever the user has configured (Dracula, Nord, Catppuccin, etc.) with zero work on your end. This guide shows you how to take control when you need to.

For type definitions and derivation rules, see the [@silvery/theme reference](/reference/theme).

## Quick Start

Pick a palette, derive a theme, wrap your app:

```tsx
import { ThemeProvider, Box, Text } from "silvery"
import { presetTheme } from "silvery/theme"

const theme = presetTheme("catppuccin-mocha")

function App() {
  return (
    <ThemeProvider theme={theme}>
      <Box borderStyle="single">
        <Text color="$primary">Deploy complete</Text>
        <Text color="$muted">3 files changed</Text>
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
<Text color="$primary">Brand accent — headings, active items</Text>
<Text color="$accent">Attention color — complements primary</Text>
<Text color="$muted">Secondary text — descriptions, timestamps</Text>
<Text color="$link">Hyperlinks — always accessible blue</Text>
<Text color="$disabledfg">Disabled items — intentionally dim</Text>
```

### Status Colors

```tsx
<Text color="$success">All tests passed</Text>
<Text color="$warning">3 deprecation warnings</Text>
<Text color="$error">Build failed</Text>
<Text color="$info">Tip: run with --verbose for details</Text>
```

### Surfaces and Backgrounds

```tsx
{
  /* Elevated card */
}
;<Box backgroundColor="$surface-bg" borderStyle="single" borderColor="$border">
  <Text color="$surface">Card content</Text>
</Box>

{
  /* Popover / floating panel */
}
;<Box backgroundColor="$popover-bg" borderStyle="round" borderColor="$inputborder">
  <Text color="$popover">Menu item</Text>
</Box>

{
  /* Status bar */
}
;<Box backgroundColor="$inverse-bg">
  <Text color="$inverse"> main 3 files Ln 42 </Text>
</Box>
```

### Accent Areas

Accent tokens use **reversed pairing** — the base name is the area background, `*-fg` is text on it:

```tsx
{
  /* Primary button */
}
;<Box backgroundColor="$primary">
  <Text color="$primary-fg">Deploy</Text>
</Box>

{
  /* Error banner */
}
;<Box backgroundColor="$error">
  <Text color="$error-fg">Build failed: missing dependency</Text>
</Box>

{
  /* Success badge */
}
;<Box backgroundColor="$success">
  <Text color="$success-fg"> PASS </Text>
</Box>
```

### Raw Palette Access

Access the 16 ANSI colors directly with `$color0` through `$color15`:

```tsx
<Text color="$color1">ANSI red</Text>
<Text color="$color4">ANSI blue</Text>
<Text color="$color14">ANSI bright cyan</Text>
```

These bypass semantic meaning — prefer named tokens like `$error` or `$primary` in most cases.

### Accessing the Theme Object

Read the current theme from any component with `useTheme()`:

```tsx
import { useTheme } from "silvery/theme"

function StatusLine() {
  const theme = useTheme()
  // theme.primary, theme.muted, etc. are resolved hex strings
  return <Text color="$primary">{theme.name}</Text>
}
```

## Switching Palettes

### At Startup

Choose a built-in palette and derive a theme before rendering:

```tsx
import { ThemeProvider } from "silvery"
import { presetTheme } from "silvery/theme"

const theme = presetTheme("tokyo-night")

function App() {
  return <ThemeProvider theme={theme}>{/* ... */}</ThemeProvider>
}
```

### At Runtime

Store the theme in state and swap it on demand:

```tsx
import { useState } from "react"
import { ThemeProvider, Box, Text } from "silvery"
import { presetTheme } from "silvery/theme"

const themes = {
  nord: presetTheme("nord"),
  dracula: presetTheme("dracula"),
  "rose-pine": presetTheme("rose-pine"),
}

function App() {
  const [name, setName] = useState<keyof typeof themes>("nord")

  return (
    <ThemeProvider theme={themes[name]}>
      <Text color="$primary">Current: {name}</Text>
      {/* Cycle themes on 't' keypress */}
    </ThemeProvider>
  )
}
```

### Per-Subtree Overrides

Use the `theme` prop on `Box` to override tokens for a subtree — useful for light panels inside a dark app:

```tsx
import { presetTheme } from "silvery/theme"

const lightTheme = presetTheme("catppuccin-latte")

function App() {
  return (
    <ThemeProvider theme={presetTheme("catppuccin-mocha")}>
      <Text color="$primary">Dark context</Text>

      <Box theme={lightTheme} borderStyle="single">
        {/* All $tokens resolve against lightTheme here */}
        <Text color="$primary">Light context</Text>
      </Box>
    </ThemeProvider>
  )
}
```

## Custom Palettes

### From a Single Color

The fastest way to get a unique theme — provide one hex color and Silvery generates everything else:

```typescript
import { quickTheme } from "silvery/theme"

const theme = quickTheme("#818cf8") // indigo, dark mode
const light = quickTheme("#818cf8", "light") // indigo, light mode
const named = quickTheme("teal", "dark") // named color
```

Or with full palette auto-generation:

```typescript
import { autoGenerateTheme } from "silvery/theme"

const theme = autoGenerateTheme("#5E81AC", "dark")
// Background, foreground, accents, status colors — all derived from one hex
```

### With the Builder

The chainable builder API gives fine-grained control:

```typescript
import { createTheme } from "silvery/theme"

// Start from a preset and override the primary
const theme = createTheme().preset("nord").primary("#A3BE8C").build()

// Start from scratch with just bg + fg + primary
const theme = createTheme().bg("#1e1e2e").fg("#cdd6f4").primary("#89b4fa").dark().build()

// Override individual palette colors
const theme = createTheme()
  .preset("dracula")
  .color("red", "#FF6E6E")
  .color("green", "#69FF94")
  .build()
```

Builder methods: `.bg()`, `.fg()`, `.primary()`, `.accent()`, `.dark()`, `.light()`, `.color(name, value)`, `.palette(p)`, `.preset(name)`, `.build()`.

### Full Manual Palette

For complete control, provide all 22 colors as a `ColorScheme` and derive a theme from it:

```typescript
import { deriveTheme } from "silvery/theme"
import type { ColorScheme } from "silvery/theme"

const myPalette: ColorScheme = {
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

See the [ColorScheme type definition](/reference/theme#colorscheme-22-colors) for all fields, or the [Color Schemes guide](/guide/color-schemes) for the broader model.

## CLI Usage

For non-React CLI output (spinners, log messages, progress lines), use `@silvery/ansi` instead of chalk. It resolves the same `$tokens` without React:

```typescript
import { createStyle } from "@silvery/ansi"
import { presetTheme } from "silvery/theme"

const theme = presetTheme("nord")
const s = createStyle({ theme })

console.log(s.primary("deploy") + " " + s.muted("starting..."))
console.log(s.success("done") + " " + s.muted("(3 files)"))
console.log(s.bold.error("FAIL") + " missing dependency")
```

Without a theme, token names fall back to sensible ANSI colors (e.g., `primary` becomes yellow, `error` becomes red):

```typescript
const s = createStyle()

s.primary("text") // yellow (ANSI 33)
s.error("text") // red (ANSI 31)
s.success("text") // green (ANSI 32)
s.bold.red("text") // standard chalk-style chaining still works
```

This means CLI tools get reasonable colors even without configuring a theme. See the [@silvery/ansi reference](/reference/style) for the full chainable API.

## Color Level Degradation

Silvery detects the terminal's color capabilities and adapts automatically. The same `$token` code works everywhere — only the visual fidelity changes.

### Three Color Levels

| Level       | Colors | When                                      | Token Resolution                           |
| ----------- | ------ | ----------------------------------------- | ------------------------------------------ |
| `truecolor` | 16M    | Modern terminals (Ghostty, Kitty, iTerm2) | Hex blending, contrast-adjusted derivation |
| `256`       | 256    | Older terminals, some SSH sessions        | Hex values downsampled to nearest 256      |
| `basic`     | 16     | Very old terminals, CI, pipes             | Direct ANSI color name mapping             |

Detection is automatic via `@silvery/ansi`. Override with environment variables:

```bash
FORCE_COLOR=1   # Force basic (16 colors)
FORCE_COLOR=2   # Force 256 colors
FORCE_COLOR=3   # Force truecolor
NO_COLOR=1      # Disable all color
```

### What Changes Per Level

In **truecolor** mode, `deriveTheme()` blends palette colors and enforces WCAG contrast ratios. A `$muted` token might resolve to `#8A91A8` — a precise blend 40% toward the background.

In **basic** (ANSI 16) mode, `deriveTheme(palette, "ansi16")` maps tokens directly to ANSI color names. The same `$muted` becomes `"white"` (ANSI 7) — no blending, just the closest match.

```typescript
import { deriveTheme, nord, ansi16DarkTheme } from "silvery/theme"

// Truecolor — rich blended colors
const rich = deriveTheme(nord)
// rich.muted === "#8A91A8" (blended)
// rich.surfacebg === "#313744" (bg + 5% toward fg)

// ANSI 16 — direct mapping, no blending
const basic = deriveTheme(nord, "ansi16")
// basic.muted === "white"
// basic.surfacebg === "black"
```

For most apps, you never deal with this — Silvery picks the right mode. If you need to force it:

```typescript
import { createStyle } from "@silvery/ansi"

// Force basic color for CI output
const s = createStyle({ level: "basic" })
```

### Pre-built ANSI 16 Themes

Two hardcoded themes ship for terminals limited to 16 colors:

```typescript
import { ansi16DarkTheme, ansi16LightTheme } from "silvery/theme"

// Token values are ANSI color names ("yellow", "red", "whiteBright")
// instead of hex strings — no blending math needed
```

These activate automatically when the detected color level is `basic`.

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
  fallback: () => "dark", // macOS or other fallback
})

detector.start()
// detector.scheme is "dark", "light", or "unknown"

// React to scheme changes (e.g., user toggles system dark mode)
detector.subscribe((scheme) => {
  console.log("Color scheme changed:", scheme)
})
```

**How it works:**

1. Sends `\x1b[?2031h` to enable color scheme reporting
2. Parses the terminal's response within a timeout (default 200ms)
3. If the terminal supports Mode 2031: uses the response and listens for live changes
4. If no response: falls back to the provided `fallback` function (e.g., macOS `AppleInterfaceStyle`)
5. On dispose: sends `\x1b[?2031l` to disable reporting

**Supported terminals:** Contour, foot, WezTerm (1.0+), and growing. Terminals that don't support Mode 2031 are handled gracefully via the timeout + fallback mechanism.

The `darkBackground` field on `createTerminalProfile().caps` still uses synchronous environment-variable heuristics and the macOS `defaults` command. The Mode 2031 detector is async and designed for apps that can wait for terminal responses at startup.

## Debugging Themes

Pass an `adjustments` array to `deriveTheme()` to see every contrast adjustment it makes:

```typescript
import { deriveTheme, nord } from "silvery/theme"
import type { ThemeAdjustment } from "silvery/theme"

const adjustments: ThemeAdjustment[] = []
const theme = deriveTheme(nord, "truecolor", adjustments)

for (const adj of adjustments) {
  console.log(
    `${adj.token}: ${adj.from} -> ${adj.to} ` +
      `(${adj.ratioBefore.toFixed(1)} -> ${adj.ratioAfter.toFixed(1)} against ${adj.against})`,
  )
}
```

This is useful for understanding why a token looks different from the raw palette color — `deriveTheme()` adjusts lightness to meet WCAG contrast minimums while preserving hue and saturation.

## Further Reading

- [@silvery/theme reference](/reference/theme) — full type definitions, derivation rules, built-in palettes
- [Theming reference](/reference/theming) — `$token` shorthand, special values, `ThemeProvider` API
- [Styling guide](/guide/styling) — when to use tokens vs letting components handle it
- [@silvery/ansi reference](/reference/style) — CLI styling API
- [Theme Explorer](/themes) — browse all 84 color schemes interactively
