# Theming Reference

`$token` shorthand, special values, the `Box theme={…}` prop, `ThemeProvider`, and `useTheme()` — the React-side reference for working with [Sterling](/guide/sterling) themes in components.

For the underlying type system (`Theme`, `ColorScheme`, `DesignSystem`, derivation rules), see the [@silvery/theme reference](/reference/theme). For day-to-day styling discipline, see the [Styling guide](/guide/styling).

## Setup

Wrap your app in `ThemeProvider` with a theme object:

```tsx
import { ThemeProvider, defaultDarkTheme, Box, Text } from "silvery"

function App() {
  return (
    <ThemeProvider theme={defaultDarkTheme}>
      <Box borderStyle="single">
        <Text color="$fg-accent">Hello</Text>
        <Text color="$fg-muted">world</Text>
      </Box>
    </ThemeProvider>
  )
}
```

For themed subtrees (where the theme differs from the terminal), use `Box theme={…}`:

```tsx
<Box theme={lightTheme} borderStyle="single">
  {/* All text auto-inherits $fg, bg auto-fills from theme.bg */}
  <Text color="$fg-accent">Themed content</Text>
</Box>
```

`Box theme={}` handles everything: `$token` resolution, fg inheritance, bg fill, and pipeline context. No explicit `color="$fg"` or `backgroundColor="$bg"` needed.

## $token Shorthand

Any color prop on `Box` or `Text` that starts with `$` resolves against the active theme. Sterling's flat hyphen-keys are the canonical surface; both kebab (`$fg-accent`) and camelCase (`$fgAccent`) forms work — hyphens are stripped before lookup.

| Prop              | Components | Example                            |
| ----------------- | ---------- | ---------------------------------- |
| `color`           | Box, Text  | `color="$fg-accent"`               |
| `backgroundColor` | Box, Text  | `backgroundColor="$bg-surface-raised"` |
| `borderColor`     | Box        | `borderColor="$border-default"`    |
| `outlineColor`    | Box        | `outlineColor="$border-focus"`     |

Non-`$` values pass through unchanged (`color="red"`, `color="#ff0000"`).

**Default border color**: When `borderStyle` or `outlineStyle` is set without an explicit color, `$border-default` is used automatically. `<TextInput>` / `<TextArea>` upgrade to `$border-focus` on focus.

### Special Color Values

| Value               | Description                                                                                                                                          |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `"inherit"`         | Skip color override, inherit from parent element. Useful for components with default colors (e.g., `<Link color="inherit">` to skip `$fg-link` blue). |
| `"mix(c1, c2, N%)"` | Blend `c1` and `c2` at N% ratio. Supports `$tokens`, named colors, and hex. Amount is 0–100% or 0.0–1.0.                                              |
| `"$default"`        | Terminal's actual default background (SGR 49). Unlike `$bg`, this matches the user's terminal emulator setting exactly.                              |

```tsx
{/* Link inherits parent color instead of defaulting to $fg-link */}
<Text color="$fg-error">
  Error: <Link color="inherit" href="...">details</Link>
</Text>

{/* Subtle tint using mix */}
<Box backgroundColor="mix($bg, $fg-error, 15%)">
  <Text color="$fg-error">3 errors</Text>
</Box>
```

## Token Reference

### Root pair

| Token | Use                                                |
| ----- | -------------------------------------------------- |
| `$fg` | Default text color (= `scheme.foreground`)         |
| `$bg` | Default canvas (= `scheme.background`)             |

### Surface

| Token                   | Use                                          |
| ----------------------- | -------------------------------------------- |
| `$bg-surface-default`   | Same as `$bg` — the canvas                   |
| `$bg-surface-subtle`    | Cards, list rows, subtle elevation           |
| `$bg-surface-raised`    | Dialogs, modals, raised panels               |
| `$bg-surface-overlay`   | Tooltips, dropdowns, overlays                |
| `$bg-surface-hover`     | Surface hover state (+0.04L)                 |

### Border

| Token              | Use                                              |
| ------------------ | ------------------------------------------------ |
| `$border-default`  | Structural rules and dividers (1.5:1 contrast)   |
| `$border-focus`    | Focus ring on inputs (3:1 WCAG 1.4.11 minimum)   |
| `$border-muted`    | Faint subdivider                                 |

### Cursor

| Token         | Use                            |
| ------------- | ------------------------------ |
| `$fg-cursor`  | Glyph color under the cursor   |
| `$bg-cursor`  | Cursor block/line color        |

### Muted

| Token        | Use                                  |
| ------------ | ------------------------------------ |
| `$fg-muted`  | Secondary text — captions, hints     |
| `$bg-muted`  | Subtle hover surface, code chips     |

### Accent (the canonical interactive-text role)

| Token                  | Use                                              |
| ---------------------- | ------------------------------------------------ |
| `$fg-accent`           | Brand emphasis text — headings, focus, links     |
| `$bg-accent`           | Primary action button fill                       |
| `$fg-on-accent`        | Text on `$bg-accent` (contrast-picked)           |
| `$fg-accent-hover`     | Link hover state (+0.04L)                        |
| `$bg-accent-hover`     | Surface hover on accent fill                     |
| `$fg-accent-active`    | Pressed text (+0.08L)                            |
| `$bg-accent-active`    | Pressed surface                                  |
| `$border-accent`       | Border on accent-emphasized panels               |

### Status (info / success / warning / error)

Each status role has surface state (`bg-X-hover`, `bg-X-active`) but **no text-color hover** — text on a status role isn't a link.

| Token                  | Use                                              |
| ---------------------- | ------------------------------------------------ |
| `$fg-info` / `$bg-info` / `$fg-on-info`            | Neutral info                          |
| `$bg-info-hover` / `$bg-info-active`               | Surface state                         |
| `$fg-success` / `$bg-success` / `$fg-on-success`   | Positive status                       |
| `$bg-success-hover` / `$bg-success-active`         | Surface state                         |
| `$fg-warning` / `$bg-warning` / `$fg-on-warning`   | Caution                               |
| `$bg-warning-hover` / `$bg-warning-active`         | Surface state                         |
| `$fg-error` / `$bg-error` / `$fg-on-error`         | Destructive / errors                  |
| `$bg-error-hover` / `$bg-error-active`             | Surface state                         |

### Selected

| Token                | Use                                                       |
| -------------------- | --------------------------------------------------------- |
| `$bg-selected`       | Cursor row, mouse selection, search match highlight       |
| `$fg-on-selected`    | Text on `$bg-selected` (contrast-picked)                  |
| `$bg-selected-hover` | SelectList row hover (+0.04L on `$bg-selected`)           |

### Inverse

| Token            | Use                                                |
| ---------------- | -------------------------------------------------- |
| `$bg-inverse`    | Status bars, modal chrome, "you are here" bands    |
| `$fg-on-inverse` | Text on `$bg-inverse` (contrast-picked)            |

### Link

| Token      | Use                                                                |
| ---------- | ------------------------------------------------------------------ |
| `$fg-link` | Hyperlink text — distinct from `$fg-accent` (often classic blue)   |

### Categorical Hue Ring (8 tokens)

Eight harmonious hues for tagging — contrast-adjusted per scheme so they look balanced everywhere. Prefer these over raw `$color*` for everyday categorization.

```tsx
<Text color="$red">urgent</Text>
<Text color="$blue">research</Text>
<Text color="$green">done</Text>
<Text color="$purple">docs</Text>
```

Available: `$red`, `$orange`, `$yellow`, `$green`, `$teal`, `$blue`, `$purple`, `$pink`.

### Content Palette (16 indexed colors)

For exact ANSI parity — syntax highlighters, git diff viewers:

```tsx
<Text color="$color5">purple tag</Text>
<Text color="$color1">red badge</Text>
```

`$color0` through `$color15` map to the theme's `palette` array. At ANSI 16 these are the standard terminal colors; at truecolor they are the curated 16-slot ANSI catalog from the scheme.

## Progressive Enhancement

The same token vocabulary works across all terminal capability tiers — see [Capability Tiers](/guide/capability-tiers).

### ANSI 16 (baseline)

Each token resolves to one of the 16 standard colors plus the bright variants. No blending or contrast adjustment is possible — Sterling falls back to direct ANSI name mapping. Differentiation comes from the bright variants (e.g., `yellow` vs `yellowBright`) and SGR attributes.

### 256-color

Truecolor hex values are downsampled to the nearest 256-cube color (indices 16–231) or the 24-shade gray ramp (indices 232–255).

### Truecolor (24-bit)

Full Sterling derivation with OKLCH-native blends and contrast-aware auto-lift. See the [Sterling primer](/guide/sterling) for the role expansion and the [theme reference](/reference/theme#derivation-rules-truecolor) for the per-token derivation table.

## ThemeProvider

Wraps a subtree (or the whole app) and sets the React context that `useTheme()` reads. `Box theme={…}` handles pipeline-side resolution and surface fg/bg auto-fill — `ThemeProvider` is what hooks see.

```tsx
import { ThemeProvider, defaultDarkTheme } from "silvery"

<ThemeProvider theme={defaultDarkTheme}>
  <App />
</ThemeProvider>
```

| Prop       | Type        | Default      | Description             |
| ---------- | ----------- | ------------ | ----------------------- |
| `theme`    | `Theme`     | **required** | Theme object to provide |
| `children` | `ReactNode` | **required** | Child components        |

## useTheme()

Read the current theme from any component:

```tsx
import { useTheme } from "silvery/theme"

function StatusLine() {
  const theme = useTheme()
  // Access via nested roles or flat keys — both reference the same hex
  const accent = theme.accent.fg            // nested
  const accentFlat = theme["fg-accent"]     // flat
  return <Text color="$fg-accent">{theme.name}</Text>
}
```

Returns `defaultDarkTheme` when no `ThemeProvider` is present.

## Per-Subtree Theme Override (`Box theme={…}`)

Use the `theme` prop on `Box` to override `$token` resolution for an entire subtree:

```tsx
import { sterling, catppuccinLatte } from "silvery/theme"

const lightTheme = sterling.deriveFromScheme(catppuccinLatte)

<Box theme={lightTheme}>
  {/* All $tokens resolve against lightTheme here */}
  <Text color="$fg-accent">Light context</Text>
</Box>
<Text color="$fg-accent">Default context</Text>
```

The override happens during the render-phase tree walk (no React re-renders). Cost is ~2ns per token resolution — negligible.

`Box theme={…}` also auto-inherits `$fg` for descendant text and auto-fills `$bg` as the background. No explicit `color` / `backgroundColor` needed when the subtree is fully themed.

## resolveToken()

For advanced use cases, resolve `$tokens` programmatically:

```tsx
import { resolveToken } from "@silvery/ansi"
import { useTheme } from "silvery/theme"

function CustomComponent({ highlight }: { highlight?: string }) {
  const theme = useTheme()
  const color = resolveToken(highlight, theme) ?? theme.fg
  // ...
}
```

See [`resolveToken`](/reference/theme#resolvetoken) for the full resolution rules.

## Migration from pre-0.20.0

silvery 0.19.x had a flatter `Theme` interface with single-hex role fields (`theme.primary`, `theme.errorfg`, …). At 0.20.0 it's gone at the type level — `export type Theme = SterlingTheme`.

Legacy `$tokens` (`$primary`, `$muted`, `$selectionbg`, …) keep resolving through 0.20.x via `resolveToken`'s direct kebab lookup. Migrate during this window — they're removed in 0.21.0.

The full migration map (both `$token` strings and TypeScript dot-access fields) lives in the [Sterling primer](/guide/sterling#migrating-from-pre-0-20-0).

## Built-in Themes

| Name                | Tier      | Mode  |
| ------------------- | --------- | ----- |
| `ansi16DarkTheme`   | ANSI 16   | dark  |
| `ansi16LightTheme`  | ANSI 16   | light |
| `defaultDarkTheme`  | Truecolor | dark  |
| `defaultLightTheme` | Truecolor | light |

Select by name at runtime:

```tsx
import { getThemeByName } from "silvery/theme"

const theme = getThemeByName("dark-ansi16")
// or "dark-truecolor", "light-ansi16", "light-truecolor",
// or any of the 84 bundled scheme names ("catppuccin-mocha", "nord", …)
```

## Related

- **[Sterling primer](/guide/sterling)** — design-system fundamentals: roles, flat tokens, derivation entry points, migration.
- **[@silvery/theme reference](/reference/theme)** — type definitions, derivation rules, color utilities.
- **[Theming guide](/guide/theming)** — using schemes, switching at runtime, custom themes.
- **[Styling guide](/guide/styling)** — when to use which token, anti-patterns, contrast guarantees.
- **[Token Taxonomy](/guide/token-taxonomy)** — the decision tree for picking the right token.
