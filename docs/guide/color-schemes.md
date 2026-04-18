---
title: Color Schemes
description: The 22-slot color scheme, theme derivation, and the 84+ bundled schemes silvery ships.
---

# Color Schemes

Silvery's color system is a two-layer architecture borrowed straight from terminal emulators:

```
Layer 1:  ColorScheme   →  22 slots (16 ANSI + 6 semantic)  — what the terminal exposes
Layer 2:  Theme         →  ~33 tokens ($primary, $muted, …) — what your UI code uses
```

Every UI token you style with (`$primary`, `$muted`, `$success`, …) resolves back to a slot in the user's color scheme. When the terminal changes theme, tokens re-resolve automatically.

## The ColorScheme shape

`ColorScheme` is framework-agnostic — it's the same shape iTerm2, Windows Terminal, Ghostty, and every other emulator expose:

```ts
interface ColorScheme {
  name?: string
  dark?: boolean
  primary?: string               // optional brand anchor

  // 16 ANSI slots (ANSI 0–15)
  black: string; red: string; green: string; yellow: string
  blue: string; magenta: string; cyan: string; white: string
  brightBlack: string; brightRed: string; brightGreen: string
  brightYellow: string; brightBlue: string; brightMagenta: string
  brightCyan: string; brightWhite: string

  // 6 semantic slots
  foreground: string
  background: string
  cursorColor: string            // the cursor's BACKGROUND color
  cursorText: string             // the character UNDER the cursor
  selectionBackground: string
  selectionForeground: string
}
```

Values are `#RRGGBB` hex strings. For ANSI-16-only terminals, tokens resolve to ANSI color names (`"red"`, `"brightBlue"`) instead of hex — same API.

## Deriving a Theme from a scheme

`deriveTheme(scheme)` computes the ~33 semantic tokens from the 22 slots. Every token resolves to a concrete value — no token is "theme-dependent" at render time.

```ts
import { deriveTheme } from "silvery/theme"
import { dracula } from "silvery/theme/schemes"

const theme = deriveTheme(dracula)
// theme.primary → "#BD93F9"
// theme.muted → "#8B8DA2" (derived: blend of fg + bg)
// theme.error → "#FF5555" (from dracula.red, AA-contrast verified)
```

Derivation is OKLCH-native throughout — blends, lightness adjustments, and hue rotations happen in the perceptually-uniform OKLCH color space. The result: tokens look visually balanced regardless of which scheme you start with.

### Contrast auto-repair

`deriveTheme` runs `ensureContrast()` on every text/bg pair it builds with the project-tweaked thresholds (AA=4.5, DIM=3.0, FAINT=1.5, CONTROL=3.0). If a palette color is too close to the background, it gets L-shifted in OKLCH space (hue + chroma preserved) until it meets the target. Apps don't need to worry about contrast — tokens are always legible.

### Visibility repair

`deriveTheme` also repairs selection + cursor visibility:

- **selection** — `selectionbg` must differ from `bg` by ΔL ≥ 0.08 (OKLCH). Invisible selections get nudged.
- **cursor** — `cursorbg` must differ from `bg` by ΔE ≥ 0.15 (OKLCH ΔE). Low-contrast cursors get pushed away from bg.

These are independent invariants — `ensureContrast` handles text pairs, but selection/cursor visibility are separate checks.

## The bundled catalog (84+ schemes)

Silvery ships with 84+ color schemes out of the box — the full Catppuccin family, Dracula, Tokyo Night (all variants), Gruvbox, Nord, Solarized, One Dark/Light, Rose Pine (all variants), Kanagawa, Everforest, Monokai, Material, Night Owl, Ayu, GitHub Dark/Light, plus terminal defaults (Apple Terminal, Windows Terminal Campbell, GNOME Terminal Tango, xterm, VGA) and silvery's own signature `silvery-dark` / `silvery-light`.

```ts
import { builtinPalettes, getSchemeByName } from "silvery/theme/schemes"

Object.keys(builtinPalettes).length // 84+
const nord = getSchemeByName("nord")
const mocha = getSchemeByName("catppuccin-mocha")
```

## Authoring your own scheme

Just export a `ColorScheme` object:

```ts
// my-scheme.ts
import type { ColorScheme } from "silvery/theme"

export const myScheme: ColorScheme = {
  name: "my-scheme",
  dark: true,
  primary: "#7FB3FF",
  black: "#1A1D23",
  // …all 16 ANSI slots…
  foreground: "#D8DCE3",
  background: "#1E2128",
  cursorColor: "#7FB3FF",
  cursorText: "#1E2128",
  selectionBackground: "#3A4350",
  selectionForeground: "#E4E8EF",
}
```

Use it:

```tsx
import { ThemeProvider, deriveTheme } from "silvery/theme"
import { myScheme } from "./my-scheme"

const theme = deriveTheme(myScheme)
// or: loadTheme(myScheme, { enforce: "strict", wcag: true })  — build-time audit

<ThemeProvider theme={theme}>
  <App />
</ThemeProvider>
```

### Building from fewer colors

If you don't want to fill in all 22 slots, generate the rest from a background, foreground, and primary:

```ts
import { fromColors } from "silvery/theme"

const scheme = fromColors({
  background: "#0D1117",
  foreground: "#C9D1D9",
  primary: "#58A6FF",
  dark: true,
})
// Returns a full 22-slot ColorScheme with accent ring derived by OKLCH hue rotation.
```

Accents are generated by rotating the primary's OKLCH hue through 8 target positions (red, orange, yellow, green, teal, blue, purple, pink) at constant L + C — the ring has equal perceived lightness and chroma. Visually balanced without manual tuning.

## Auto-detection

Silvery queries the terminal on startup for its scheme via OSC 10/11 (fg/bg), OSC 4 (ANSI palette), and OSC 12 (cursor). If detection succeeds, the user's terminal theme becomes the app's theme. If it fails, silvery falls back to `silvery-dark` (dark background) or `silvery-light` (light background).

For more: see [Capability Tiers](./capability-tiers).

### Fingerprint matching

Detection can also match the probed colors against the bundled catalog to give you a *named* scheme:

```ts
import { fingerprintMatch } from "silvery/theme"
import { builtinPalettes } from "silvery/theme/schemes"

const match = fingerprintMatch(probedSlots, Object.values(builtinPalettes))
if (match) {
  console.log(`Detected: ${match.scheme.name} (${(match.confidence * 100).toFixed(0)}% confidence)`)
}
```

Criteria: total OKLCH ΔE < 30 AND max per-slot ΔE < 8. Both must pass — the per-slot check prevents false positives where most slots match but one wildly differs.

## Related

- **[Token Taxonomy](./token-taxonomy)** — when to use `$brand` vs `$red` vs `$error` vs `$color1` vs `$primary`. The decision tree for every token category.
- [Capability Tiers](./capability-tiers) — truecolor / 256 / ANSI16 / mono degradation
- [Custom Tokens](./custom-tokens) — extending the theme with app-specific semantic tokens
- [Styling Guide](./styling) — using tokens in components
