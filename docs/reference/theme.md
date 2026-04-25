# Theme System

The silvery theme system transforms a 22-color terminal scheme into a Sterling-shaped `Theme` — nested role objects (`theme.accent`, `theme.surface`, …) plus flat hyphen-keys (`theme["bg-accent"]`, `theme["fg-on-error"]`, …) on the same frozen object. The pipeline flows in one direction:

```
ColorScheme (22) → sterling.deriveFromScheme() → Theme (nested roles + flat tokens) → resolveToken() → ANSI output
```

Components never reference raw colors directly. They use `$token` strings (`color="$fg-accent"`) that resolve against the active theme at render time. This decouples UI code from any specific palette.

::: info Sterling is THE Theme
As of silvery 0.20.0, `export type Theme = SterlingTheme`. The legacy single-hex `Theme` interface is gone. See the [Sterling primer](/guide/sterling) for the full design-system surface and the [migration map](/guide/sterling#migrating-from-pre-0-20-0) if you're upgrading from 0.19.x.
:::

## ColorScheme (22 Colors)

The universal terminal color format. Every modern terminal emulator uses this shape — Ghostty, Kitty, Alacritty, iTerm2, WezTerm, and others all export/import these 22 fields.

### Fields

**16 ANSI colors** (indices 0–15):

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

| Field                 | Description                    |
| --------------------- | ------------------------------ |
| `foreground`          | Default text color             |
| `background`          | Default background color       |
| `cursorColor`         | Cursor block/line color        |
| `cursorText`          | Text rendered under the cursor |
| `selectionBackground` | Background of selected text    |
| `selectionForeground` | Text color of selected text    |

**Optional metadata:**

| Field     | Type      | Description                                            |
| --------- | --------- | ------------------------------------------------------ |
| `name`    | `string`  | Human-readable scheme name                             |
| `dark`    | `boolean` | Whether this is a dark scheme                          |
| `primary` | `string`  | Brand-anchor override (hex). Used by `accent` role.    |

When `primary` is set, derivation uses it as the input for `theme.accent`. Otherwise the default ANSI slot mapping is used.

### Type Definition

```typescript
interface ColorScheme {
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

## Theme (Sterling Shape)

The `Theme` type re-exports `SterlingTheme`. Every `Theme` is a frozen object that exposes the same hex leaves through two paths: nested roles (`theme.accent.bg`) and flat hyphen-keys (`theme["bg-accent"]`).

### Roles (nested form)

Programmatic access — typed, IDE-completable, structured:

| Role       | Shape                                                                | Use for                                                          |
| ---------- | -------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `accent`   | `{ fg, bg, fgOn, border, hover: { fg, bg }, active: { fg, bg } }`    | Brand emphasis, focus, primary action, interactive text          |
| `info`     | `{ fg, bg, fgOn, hover: { bg }, active: { bg } }`                    | Neutral status                                                   |
| `success`  | same as `info`                                                       | Positive status                                                  |
| `warning`  | same as `info`                                                       | Caution                                                          |
| `error`    | same as `info`                                                       | Errors / destructive                                             |
| `muted`    | `{ fg, bg }`                                                         | Secondary text (`muted.fg`); subtle hover surface (`muted.bg`)   |
| `surface`  | `{ default, subtle, raised, overlay, hover }`                        | Canvas + card stack                                              |
| `border`   | `{ default, focus, muted }`                                          | Structural rules, focus ring, faint dividers                     |
| `cursor`   | `{ fg, bg }`                                                         | Cursor color and the glyph under it                              |
| `selected` | `{ bg, fgOn, hover: { bg } }`                                        | Cursor row, mouse selection, search match highlight              |
| `inverse`  | `{ bg, fgOn }`                                                       | Status bars, modal chrome                                        |
| `link`     | `{ fg }`                                                             | Hyperlink text (distinct from `accent`)                          |

### Flat tokens (the `$token` resolution path)

Same data, hyphen-keyed. Grammar: `prefix-role[-state]` or `prefix-on-role`.

```
Surface     bg-surface-default | bg-surface-subtle | bg-surface-raised
            | bg-surface-overlay | bg-surface-hover

Border      border-default | border-focus | border-muted

Cursor      fg-cursor | bg-cursor

Muted       fg-muted | bg-muted

Accent      fg-accent | bg-accent | fg-on-accent
            | fg-accent-hover | bg-accent-hover
            | fg-accent-active | bg-accent-active
            | border-accent

Info        fg-info | bg-info | fg-on-info | bg-info-hover | bg-info-active
Success     fg-success | bg-success | fg-on-success | bg-success-hover | bg-success-active
Warning     fg-warning | bg-warning | fg-on-warning | bg-warning-hover | bg-warning-active
Error       fg-error | bg-error | fg-on-error | bg-error-hover | bg-error-active

Selected    bg-selected | fg-on-selected | bg-selected-hover

Inverse     bg-inverse | fg-on-inverse

Link        fg-link
```

`theme.accent.bg === theme["bg-accent"]` always — same string, two paths, no Proxy.

### Root pair, palette, and metadata

| Field             | Type                       | Description                                                                       |
| ----------------- | -------------------------- | --------------------------------------------------------------------------------- |
| `fg`              | `string`                   | Default text color (= `scheme.foreground`)                                        |
| `bg`              | `string`                   | Default canvas (= `scheme.background` = `bg-surface-default`)                     |
| `palette`         | `readonly string[]`        | 16-slot ANSI catalog used by `$color0` … `$color15`                               |
| `red` … `pink`    | `string`                   | 8-slot categorical hue ring — contrast-adjusted (`$red`, `$orange`, `$yellow`, `$green`, `$teal`, `$blue`, `$purple`, `$pink`) |
| `variants`        | `Record<string, Variant>`  | Typography preset bundles resolved by `<Text variant="…">`                        |
| `name`            | `string \| undefined`      | Scheme display name (if derived from a named scheme)                              |
| `mode`            | `"light" \| "dark"`        | Light or dark — determines auto-lift direction                                     |
| `derivationTrace` | `DerivationTrace?`         | Per-token derivation record (only present when `{ trace: true }` was passed)      |

### Type Definition

```typescript
import type { Theme } from "@silvery/theme"

// Type-level: Theme = SterlingTheme = FlatTokens & Roles & { ...metadata } & CategoricalHues
//
// At runtime every Theme is frozen and double-populated — both nested roles
// AND flat hyphen-keys reference the same string on the same object.
```

See [`Theme`](/guide/sterling#the-shape) in the Sterling primer for the full structural breakdown, or `packages/ansi/src/sterling/types.ts` for the source of truth.

## Sterling DesignSystem

Sterling is exposed as the canonical `DesignSystem` value. All theme construction goes through it.

```typescript
import { sterling } from "@silvery/theme"

// Five derivation entry points
sterling.deriveFromScheme(scheme, opts?)              // 22-color scheme → Theme
sterling.deriveFromColor(color, opts?)                // single seed hex → Theme
sterling.deriveFromPair(light, dark, opts?)           // → { light: Theme, dark: Theme }
sterling.deriveFromSchemeWithBrand(scheme, brand, opts?)  // scheme + brand overlay → Theme
sterling.defaults(mode?)                              // baseline Theme (no input)

// Plus
sterling.theme(partial?, opts?)                       // defaults + per-role overrides
```

### DeriveOptions

```typescript
interface DeriveOptions {
  /** "auto-lift" (default) — OKLCH-shifts failing tokens. "strict" — throws on AA failure. */
  contrast?: "auto-lift" | "strict"
  /** If true, attach `derivationTrace` to the returned Theme. */
  trace?: boolean
  /** Per-token pins. Skips auto-adjustment for these specific tokens. */
  pins?: Record<string, string>
  /** Force light/dark inference. Default: from `scheme.dark` or WCAG luminance of bg. */
  mode?: "light" | "dark"
}
```

Pins accept either nested or flat path syntax — `{ "accent.bg": "#5B8DEF" }` and `{ "bg-accent": "#5B8DEF" }` are equivalent.

### Contrast targets

`auto-lift` mode shifts OKLCH lightness (preserving hue and chroma) until the target ratio is met:

| Target  | Ratio | Applied to                                                |
| ------- | ----- | --------------------------------------------------------- |
| AA      | 4.5:1 | Body text, muted text, accent / status fg, `fg-on-X`      |
| FAINT   | 1.5:1 | `border-default` — faint structural element               |
| CONTROL | 3.0:1 | `border-focus` — WCAG 1.4.11 non-text minimum             |

`strict` mode throws `SterlingContrastError` on AA failure of core role pairs. Use it in your test suite to catch palette regressions.

### Derivation rules (truecolor)

Sterling uses a **blend-first-then-ensure** pattern: an initial blend sets the color's character from the scheme's aesthetic, then `ensureContrast()` only adjusts lightness if the ratio falls short.

| Token                | Source                                                       | Contrast target |
| -------------------- | ------------------------------------------------------------ | --------------- |
| `fg`                 | `scheme.foreground` ensured against `bg-surface-overlay`     | AA              |
| `accent.fg`          | `scheme.primary` (or yellow dark / blue light)               | AA              |
| `accent.bg`          | derived from `accent.fg` for fill                            | —               |
| `accent.fgOn`        | `contrastFg(accent.bg)` — black or white                     | —               |
| `accent.hover.*`     | OKLCH ±0.04L from `accent.{fg,bg}`                           | —               |
| `accent.active.*`    | OKLCH ±0.08L from `accent.{fg,bg}`                           | —               |
| `accent.border`      | `accent.fg` lifted for border contrast                       | CONTROL         |
| `error.fg`           | `scheme.red`                                                 | AA              |
| `warning.fg`         | `scheme.yellow`                                              | AA              |
| `success.fg`         | `scheme.green`                                               | AA              |
| `info.fg`            | blend of `fg` and `accent.fg` at 50%                         | AA              |
| `link.fg`            | `scheme.brightBlue` (dark) / `scheme.blue` (light)           | AA              |
| `muted.fg`           | `fg` blended 40% toward `bg`                                 | AA              |
| `muted.bg`           | `bg` blended 4% toward `fg`                                  | —               |
| `surface.subtle`     | `bg` blended 5% toward `fg`                                  | —               |
| `surface.raised`     | `bg` blended 8% toward `fg`                                  | —               |
| `surface.overlay`    | `bg` blended 10% toward `fg`                                 | —               |
| `surface.hover`      | OKLCH +0.04L from `surface.default`                          | —               |
| `inverse.bg`         | `fg` blended 10% toward `bg`                                 | —               |
| `inverse.fgOn`       | `contrastFg(inverse.bg)`                                     | —               |
| `selected.bg`        | `scheme.selectionBackground` repaired for visibility (ΔL≥0.08) | —              |
| `selected.fgOn`      | `scheme.selectionForeground` ensured against `selected.bg`   | AA              |
| `cursor.bg`          | `scheme.cursorColor` repaired for visibility (ΔE≥0.15)       | —               |
| `cursor.fg`          | `scheme.cursorText` ensured against `cursor.bg`              | AA              |
| `border.default`     | `bg` blended 15% toward `fg`                                 | FAINT           |
| `border.focus`       | same hue as `accent.fg`                                      | CONTROL         |
| `border.muted`       | `bg` blended 8% toward `fg`                                  | —               |
| `red` … `pink`       | scheme accents rotated through OKLCH; contrast-adjusted     | AA              |

**Primary inference:** when `scheme.primary` is not set, `accent` defaults to `scheme.yellow` (dark) or `scheme.blue` (light). Set `scheme.primary` explicitly to override.

### ANSI 16 Mode

For terminals limited to 16 colors, derivation uses direct ANSI name mapping. Token values are ANSI color names (e.g. `"yellow"`, `"redBright"`, `"gray"`) rather than hex strings. Two pre-derived themes ship: `ansi16DarkTheme`, `ansi16LightTheme`. They activate automatically when the detected color level is `ansi16`.

### DerivationStep / Trace

When the optional `trace: true` option is passed, every derivation step is recorded:

```typescript
interface DerivationStep {
  /** Token path (e.g. `"accent.hover.bg"` or flat `"bg-accent-hover"`). */
  readonly token: string
  /** Human-readable rule name (e.g. `"OKLCH +0.04L on accent.bg"`). */
  readonly rule: string
  /** Input hex(es) the rule operated on. */
  readonly inputs: readonly string[]
  /** Output hex. */
  readonly output: string
  /** If auto-lift adjusted this token, the original value before adjustment. */
  readonly liftedFrom?: string
  /** If pinned by scheme author, true. */
  readonly pinned?: boolean
}

type DerivationTrace = readonly DerivationStep[]
```

This is useful for the [Theme Explorer](/themes) and for debugging unexpected token values.

## resolveToken()

Resolves a `$token` string against a `Theme` object. Both kebab and camelCase forms work; hyphens are stripped before lookup.

```typescript
import { resolveToken } from "@silvery/ansi"

resolveToken("$fg-accent", theme)        // theme["fg-accent"]
resolveToken("$bg-surface-raised", theme) // theme["bg-surface-raised"]
resolveToken("$color0", theme)            // theme.palette[0]
resolveToken("$fg", theme)                // theme.fg
resolveToken("#ff0000", theme)            // pass-through
resolveToken("red", theme)                // pass-through (named CSS color)
```

| Input                     | Behavior                                | Example                      |
| ------------------------- | --------------------------------------- | ---------------------------- |
| `undefined`               | Returns `undefined`                     | —                            |
| `"$fg-accent"`            | Lookup `theme["fg-accent"]`             | `"#EBCB8B"`                  |
| `"$bgAccent"`             | camelCase form — same lookup            | `"#EBCB8B"`                  |
| `"$color0"`–`"$color15"`  | Index into `theme.palette`              | `"#2E3440"`                  |
| `"#ff0000"`               | Pass through unchanged                  | `"#ff0000"`                  |
| `"red"`                   | Pass through unchanged                  | `"red"`                      |
| Unknown `$token`          | Pass through as-is                      | `"$unknown"` → `"$unknown"`  |

## Built-in Schemes

`@silvery/theme` ships 84 color schemes covering popular terminal and editor color schemes.

### Scheme Families

| Family      | Schemes                         | Count |
| ----------- | ------------------------------- | ----- |
| Catppuccin  | mocha, frappe, macchiato, latte | 4     |
| Nord        | nord                            | 1     |
| Dracula     | dracula                         | 1     |
| Solarized   | dark, light                     | 2     |
| Tokyo Night | tokyo-night, storm, day         | 3     |
| One Dark    | one-dark                        | 1     |
| Gruvbox     | dark, light                     | 2     |
| Rose Pine   | rose-pine, moon, dawn           | 3     |
| Kanagawa    | wave, dragon, lotus             | 3     |
| Everforest  | dark, light                     | 2     |
| Monokai     | monokai, monokai-pro            | 2     |
| Snazzy      | snazzy                          | 1     |
| Material    | dark, light                     | 2     |
| Palenight   | palenight                       | 1     |
| Ayu         | dark, mirage, light             | 3     |
| Nightfox    | nightfox, dawnfox               | 2     |
| Horizon     | horizon                         | 1     |
| Moonfly     | moonfly                         | 1     |
| Nightfly    | nightfly                        | 1     |
| Oxocarbon   | dark, light                     | 2     |
| Sonokai     | sonokai                         | 1     |
| Edge        | dark, light                     | 2     |
| Modus       | vivendi, operandi               | 2     |

### Using Schemes

```typescript
import { sterling, builtinPalettes, getSchemeByName, nord, catppuccinMocha } from "silvery/theme"

// List all scheme names
const names = Object.keys(builtinPalettes)

// Look up by name
const scheme = getSchemeByName("catppuccin-mocha")
if (scheme) {
  const theme = sterling.deriveFromScheme(scheme)
}

// Import directly
const nordTheme = sterling.deriveFromScheme(nord)
```

### Pre-derived Themes

Four themes ship pre-derived for instant use:

| Export              | Scheme           | Mode  |
| ------------------- | ---------------- | ----- |
| `defaultDarkTheme`  | Nord             | dark  |
| `defaultLightTheme` | Catppuccin Latte | light |
| `ansi16DarkTheme`   | (hardcoded)      | dark  |
| `ansi16LightTheme`  | (hardcoded)      | light |

```typescript
import {
  defaultDarkTheme,
  defaultLightTheme,
  ansi16DarkTheme,
  ansi16LightTheme,
  getThemeByName,
} from "silvery/theme"

const theme = getThemeByName("dark-truecolor")
const light = getThemeByName("light-ansi16")
const catppuccin = getThemeByName("catppuccin-mocha")
```

## Color Utilities

Low-level color manipulation, available from `@silvery/color` (re-exported by `@silvery/theme` and `silvery/theme`).

### Blending and Manipulation

```typescript
import { blend, brighten, darken, desaturate, complement } from "silvery/theme"

blend("#2E3440", "#ECEFF4", 0.5)  // OKLCH midpoint
brighten("#2E3440", 0.1)          // 10% lighter
darken("#ECEFF4", 0.1)            // 10% darker
desaturate("#BF616A", 0.4)        // reduce chroma 40%
complement("#EBCB8B")             // 180-degree hue rotation
```

`@silvery/color` is OKLCH-native throughout: blends and lightness adjustments operate in the perceptually-uniform space.

### Contrast

```typescript
import { contrastFg, checkContrast, ensureContrast } from "silvery/theme"

contrastFg("#2E3440")                       // "#FFFFFF"
contrastFg("#ECEFF4")                       // "#000000"
checkContrast("#FFFFFF", "#000000")         // { ratio: 21, aa: true, aaa: true }
ensureContrast("#FFAB91", "#FFFFFF", 4.5)   // "#B35600" (darkened to meet AA)
```

`ensureContrast` uses binary search over OKLCH lightness; hue and chroma are preserved.

### Conversion

```typescript
import { hexToRgb, rgbToHex, hexToHsl, hslToHex, rgbToHsl } from "silvery/theme"

hexToRgb("#BF616A")  // [191, 97, 106]
rgbToHex(191, 97, 106) // "#BF616A"
```

## Usage in Components

Components reference theme tokens with the `$` prefix. Resolution happens automatically within a `ThemeProvider`.

```tsx
import { ThemeProvider, defaultDarkTheme, Box, Text } from "silvery"

function App() {
  return (
    <ThemeProvider theme={defaultDarkTheme}>
      <Text color="$fg-accent">Deploy</Text>
      <Text color="$fg-muted">3 files changed</Text>
      <Box backgroundColor="$bg-surface-raised" borderStyle="single">
        <Text color="$fg-success">All tests passed</Text>
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
  const accent = theme.accent.fg          // nested
  const accentFlat = theme["fg-accent"]   // flat — same string
  return <Text color="$fg-accent">Status</Text>
}
```

Returns `defaultDarkTheme` when no `ThemeProvider` is present.

### Per-subtree Overrides

Use the `theme` prop on `Box` to override token resolution for a subtree:

```tsx
<Box theme={lightTheme} borderStyle="single">
  <Text color="$fg-accent">Themed content</Text>
</Box>
```

See the [Theming guide](/guide/theming) for runtime swapping, brand overlays, and per-role pinning.

## Usage in CLI (@silvery/ansi)

For non-React CLI output, [`@silvery/ansi`](/reference/style) provides the same theme token resolution without React.

## Custom Schemes

### Manual ColorScheme

Create a `ColorScheme` object with all 22 required hex fields and pass it to Sterling:

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

### From minimal input

`fromColors()` generates a full scheme from 1–3 hex colors via OKLCH hue rotation:

```typescript
import { fromColors, sterling } from "silvery/theme"

const scheme = fromColors({
  background: "#1e1e2e",
  foreground: "#cdd6f4",
  primary: "#89b4fa",
  dark: true,
})
const theme = sterling.deriveFromScheme(scheme)
```

At minimum, provide `background` or `primary`. Missing colors are generated via surface ramps and hue rotation.

## Data Flow

```
Terminal scheme file (Ghostty, Kitty, etc.)
           │
           ▼
    ┌──────────────┐
    │ ColorScheme │  22 hex colors — universal pivot format
    │   (Layer 1)  │
    └──────┬───────┘
           │
sterling.deriveFromScheme()    contrast targets, OKLCH blending,
           │                   contrastFg, auto-lift, role expansion
           ▼
    ┌──────────────┐
    │    Theme     │  Sterling: nested roles + flat hyphen-keys
    │   (Layer 2)  │  on the same frozen object
    └──────┬───────┘
           │
       resolveToken()    "$fg-accent" → theme["fg-accent"]
           │
           ├──► Component props      color="$fg-accent"
           ├──► createStyle()        s["fg-accent"]("text")
           └──► Programmatic access  useTheme().accent.fg
```

## Related

- **[Sterling primer](/guide/sterling)** — design-system fundamentals: roles, flat tokens, derivation entry points, full migration map.
- **[Theming guide](/guide/theming)** — using schemes, switching at runtime, brand overlays, custom themes.
- **[Theming reference](/reference/theming)** — `$token` shorthand on Box / Text, special values (`inherit`, `mix()`).
- **[Styling guide](/guide/styling)** — when to use tokens vs letting components handle it.
- **[Color Schemes guide](/guide/color-schemes)** — the 22-slot scheme model and the 84+ bundled schemes.
- **[@silvery/ansi style reference](/reference/style)** — CLI styling API.
