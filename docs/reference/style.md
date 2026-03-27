# @silvery/style

Theme-aware terminal styling with a chalk-compatible chainable API. Use `@silvery/style` for CLI output that respects terminal color capabilities and resolves semantic theme tokens.

## Installation

::: code-group

```bash [npm]
npm install @silvery/style
```

```bash [bun]
bun add @silvery/style
```

```bash [pnpm]
pnpm add @silvery/style
```

```bash [yarn]
yarn add @silvery/style
```

:::

## createStyle()

The primary entry point. Returns a chainable, callable style object.

```typescript
import { createStyle } from "@silvery/style"

const s = createStyle()
s.bold.red("Error!")              // bold red text
s.hex("#818cf8")("Indigo")       // truecolor foreground
s.bgYellow.black("Warning")     // black text on yellow background
```

### Options

```typescript
interface StyleOptions {
  /** Color level override. Auto-detected from terminal if omitted. */
  level?: "truecolor" | "256" | "basic" | null
  /** Theme object for $token resolution. */
  theme?: ThemeLike
}
```

| Option  | Type                                | Default       | Description                                |
| ------- | ----------------------------------- | ------------- | ------------------------------------------ |
| `level` | `"truecolor" \| "256" \| "basic" \| null` | auto-detected | Color support level. `null` disables all color. |
| `theme` | `ThemeLike`                         | `undefined`   | Theme object for token resolution          |

When `level` is omitted, `createStyle()` auto-detects from `process.stdout` using `@silvery/ansi`'s `detectColor()`, respecting `NO_COLOR` and `FORCE_COLOR` environment variables.

## Chainable API

Every property returns a new `Style` that can be chained further or called with text to apply:

```typescript
const s = createStyle()

// Single modifier
s.bold("text")                    // bold
s.dim("text")                     // dim

// Chained modifiers
s.bold.italic("text")             // bold + italic
s.bold.underline.red("text")     // bold + underline + red
```

### Modifiers

| Property        | SGR Open | SGR Close | Description      |
| --------------- | -------- | --------- | ---------------- |
| `bold`          | 1        | 22        | Bold intensity   |
| `dim`           | 2        | 22        | Faint/dim        |
| `italic`        | 3        | 23        | Italic           |
| `underline`     | 4        | 24        | Underline        |
| `inverse`       | 7        | 27        | Swap fg/bg       |
| `hidden`        | 8        | 28        | Hidden text      |
| `strikethrough` | 9        | 29        | Strikethrough    |

### Foreground Colors

Standard ANSI foreground colors:

| Property        | Code | Color         |
| --------------- | ---- | ------------- |
| `black`         | 30   | Black         |
| `red`           | 31   | Red           |
| `green`         | 32   | Green         |
| `yellow`        | 33   | Yellow        |
| `blue`          | 34   | Blue          |
| `magenta`       | 35   | Magenta       |
| `cyan`          | 36   | Cyan          |
| `white`         | 37   | White         |
| `blackBright`   | 90   | Bright black  |
| `gray` / `grey` | 90   | Gray (alias)  |
| `redBright`     | 91   | Bright red    |
| `greenBright`   | 92   | Bright green  |
| `yellowBright`  | 93   | Bright yellow |
| `blueBright`    | 94   | Bright blue   |
| `magentaBright` | 95   | Bright magenta|
| `cyanBright`    | 96   | Bright cyan   |
| `whiteBright`   | 97   | Bright white  |

### Background Colors

Same names prefixed with `bg`:

```typescript
s.bgRed("text")
s.bgBlueBright("text")
s.bgBlack.whiteBright("text")
```

Available: `bgBlack`, `bgRed`, `bgGreen`, `bgYellow`, `bgBlue`, `bgMagenta`, `bgCyan`, `bgWhite`, `bgBlackBright`, `bgRedBright`, `bgGreenBright`, `bgYellowBright`, `bgBlueBright`, `bgMagentaBright`, `bgCyanBright`, `bgWhiteBright`.

### Color Methods

For arbitrary colors beyond the 16 ANSI palette:

```typescript
// Hex colors (foreground and background)
s.hex("#ff6347")("Tomato")
s.bgHex("#1e1e2e")("Dark bg")

// RGB values (foreground and background)
s.rgb(255, 99, 71)("Tomato")
s.bgRgb(30, 30, 46)("Dark bg")

// ANSI 256 color index
s.ansi256(196)("Bright red")
s.bgAnsi256(17)("Navy bg")
```

| Method       | Signature                     | Description                    |
| ------------ | ----------------------------- | ------------------------------ |
| `hex`        | `(color: string) => Style`    | Foreground from hex (`#rrggbb`) |
| `bgHex`      | `(color: string) => Style`    | Background from hex            |
| `rgb`        | `(r, g, b) => Style`         | Foreground from RGB values     |
| `bgRgb`      | `(r, g, b) => Style`         | Background from RGB values     |
| `ansi256`    | `(code: number) => Style`    | Foreground from 256-color index |
| `bgAnsi256`  | `(code: number) => Style`    | Background from 256-color index |

## Theme Token Resolution

When a `theme` is provided to `createStyle()`, semantic token names resolve to their theme colors:

```typescript
import { createStyle } from "@silvery/style"
import { defaultDarkTheme } from "silvery/theme"

const s = createStyle({ theme: defaultDarkTheme })

s.primary("Deploy")        // resolves theme.primary -> hex -> ANSI
s.error("Failed!")         // resolves theme.error -> hex -> ANSI
s.success("Passed")        // resolves theme.success -> hex -> ANSI
s.muted("(3 files)")       // resolves theme.muted -> hex -> ANSI
s.warning("Caution")       // resolves theme.warning -> hex -> ANSI
s.info("Note")             // resolves theme.info -> hex -> ANSI
s.link("https://...")      // resolves theme.link + adds underline
s.bold.primary("DEPLOY")  // chain modifiers with tokens
```

### Available Tokens

| Token       | Without theme (fallback)     | With theme                    |
| ----------- | ---------------------------- | ----------------------------- |
| `primary`   | yellow (ANSI 33)             | `theme.primary` as hex        |
| `secondary` | cyan (ANSI 36)               | `theme.secondary` as hex      |
| `accent`    | magenta (ANSI 35)            | `theme.accent` as hex         |
| `error`     | red (ANSI 31)                | `theme.error` as hex          |
| `warning`   | yellow (ANSI 33)             | `theme.warning` as hex        |
| `success`   | green (ANSI 32)              | `theme.success` as hex        |
| `info`      | cyan (ANSI 36)               | `theme.info` as hex           |
| `muted`     | dim (SGR 2)                  | `theme.muted` as hex          |
| `link`      | blue + underline (ANSI 34)   | `theme.link` as hex + underline |
| `border`    | gray (ANSI 90)               | `theme.border` as hex         |
| `surface`   | white (ANSI 37)              | `theme.surface` as hex        |

When no theme is provided, tokens fall back to standard ANSI codes. The `link` token always adds underline in addition to the color.

### resolve()

Programmatically resolve a token to its hex value:

```typescript
const s = createStyle({ theme })

s.resolve("primary")       // "#EBCB8B"
s.resolve("$primary")      // "#EBCB8B" ($ prefix also accepted)
s.resolve("$color0")       // theme.palette[0]
s.resolve("$surface-bg")   // theme.surfacebg (hyphens stripped)
```

## Color Level Detection and Degradation

`createStyle()` auto-detects the terminal's color capability and degrades gracefully:

| Level        | Capability        | Hex/RGB handling                    |
| ------------ | ----------------- | ----------------------------------- |
| `"truecolor"` | 16 million colors | `38;2;R;G;B` — exact color          |
| `"256"`      | 256 colors        | `38;5;N` — nearest in 6x6x6 cube  |
| `"basic"`    | 16 colors         | `30`--`37` / `90`--`97` — nearest ANSI |
| `null`       | No color          | All styling stripped, plain text returned |

The degradation from truecolor to 256 uses the 6x6x6 color cube (indices 16--231) and the 24-shade gray ramp (indices 232--255). The degradation from 256 to basic uses Euclidean distance in RGB space against the standard ANSI 16 color values.

### Forcing a Color Level

```typescript
// Force truecolor regardless of terminal
const s = createStyle({ level: "truecolor" })

// Force no color (useful for tests or file output)
const s = createStyle({ level: null })

// Force ANSI 16 for maximum compatibility
const s = createStyle({ level: "basic" })
```

## ThemeLike Interface

The `theme` option accepts any object with string-valued properties. It does not require the full `@silvery/theme` `Theme` type:

```typescript
interface ThemeLike {
  [key: string]: string | string[] | undefined
  palette?: string[]
}
```

This means you can pass a partial theme or any plain object:

```typescript
const s = createStyle({
  theme: {
    primary: "#818cf8",
    error: "#f7768e",
    success: "#9ece6a",
  },
})

s.primary("Styled")  // uses #818cf8
s.warning("Warn")    // falls back to yellow (ANSI 33) — not in theme
```

## Template Literal Support

Style functions accept template literals:

```typescript
const name = "world"
s.bold`Hello, ${name}!`  // bold "Hello, world!"
s.red`Error: ${code}`    // red text with interpolation
```

## Examples

### CLI Progress Output

```typescript
import { createStyle } from "@silvery/style"

const s = createStyle()

console.log(s.bold("Building..."))
console.log(s.green("  ✓ Compiled 42 files"))
console.log(s.yellow("  ⚠ 3 warnings"))
console.log(s.red("  ✗ 1 error"))
console.log(s.dim("  Duration: 1.2s"))
```

### Theme-aware Status Bar

```typescript
import { createStyle } from "@silvery/style"
import { defaultDarkTheme } from "silvery/theme"

const s = createStyle({ theme: defaultDarkTheme })

function statusLine(branch: string, files: number, errors: number) {
  const parts = [
    s.primary(` ${branch} `),
    s.muted(` ${files} files`),
    errors > 0
      ? s.error(` ${errors} errors`)
      : s.success(" clean"),
  ]
  return parts.join(s.muted(" | "))
}
```

### Migrating from Chalk

`@silvery/style` is a drop-in replacement for most chalk usage:

```typescript
// Before (chalk)
import chalk from "chalk"
chalk.bold.red("Error!")
chalk.hex("#818cf8")("Indigo")
chalk.rgb(255, 99, 71)("Tomato")

// After (@silvery/style)
import { createStyle } from "@silvery/style"
const s = createStyle()
s.bold.red("Error!")
s.hex("#818cf8")("Indigo")
s.rgb(255, 99, 71)("Tomato")
```

The main difference: `createStyle()` returns a new instance each time (no global state), and theme tokens are available as chainable properties.

See the [Migrate from Chalk](/getting-started/migrate-from-chalk) guide for a detailed migration walkthrough.
