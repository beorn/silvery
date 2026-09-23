# @silvery/color

Pure color math utilities — hex/RGB/HSL conversion, blending, contrast checking. Zero dependencies.

Used by [@silvery/ansi](../ansi/) for terminal styling and theme derivation, and by [@silvery/theme](../theme/) for palette generation.

## Install

> Install from npm; a git install resolves the TypeScript source and runs only under Bun.

```bash
npm install @silvery/color
```

## Usage

```ts
import { hexToRgb, rgbToHex, blend, brighten, darken, checkContrast } from "@silvery/color"

// Conversion
hexToRgb("#ff0") // → [255, 255, 0]
rgbToHex(128, 128, 128) // → "#808080"

// Blending
blend("#000", "#fff", 0.5) // → "#808080"

// Lightness
brighten("#333", 0.2) // → lighter
darken("#ccc", 0.2) // → darker

// WCAG 2.1 contrast
checkContrast("#fff", "#000")
// → { ratio: 21, aa: true, aaa: true }

// Ensure minimum contrast
ensureContrast("#777", "#888", 4.5)
// → adjusted color meeting AA ratio
```

## API

### Conversion

- `hexToRgb(hex)` — `#rrggbb` or `#rgb` to `[r, g, b]`
- `rgbToHex(r, g, b)` — `[r, g, b]` to `#RRGGBB`
- `hexToHsl(hex)` — hex to `{ h, s, l }`
- `hslToHex(hsl)` — HSL to hex

### Manipulation

- `blend(a, b, t)` — linear interpolation between two hex colors
- `brighten(hex, amount)` — increase lightness
- `darken(hex, amount)` — decrease lightness
- `contrastFg(bg)` — pick black or white for best contrast on background

### Luminance & Contrast

- `relativeLuminance(hex)` — WCAG 2.1 relative luminance (0-1)
- `channelLuminance(value)` — single channel (0-255) to linear luminance
- `checkContrast(fg, bg)` — ratio + AA/AAA compliance
- `ensureContrast(fg, bg, target)` — adjust fg until it meets target ratio

## Relationship to Other Packages

```
@silvery/color          ← pure math, zero deps
  └─ @silvery/ansi      ← terminal styling, detection, theme derivation
       └─ @silvery/theme ← 84 color schemes, ThemeProvider, useTheme
            └─ silvery   ← full framework barrel
```

## License

MIT
