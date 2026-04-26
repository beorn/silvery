---
title: Sterling
description: Silvery's canonical design system — Sterling tokens, roles, derivation, and how to use them.
---

# Sterling

_Silvery's canonical design system_

Sterling is the design-token system that ships with silvery. As of **silvery 0.20.0**, Sterling is **THE Theme** — `export type Theme = SterlingTheme`. There is no other theme shape; every silvery component, every `$token`, every theme you author flows through Sterling.

Sterling is opinionated where the legacy system was loose:

- **Two access paths to every leaf**: nested roles (`theme.accent.bg`) and flat hyphen-keys (`theme["bg-accent"]`) reference the same string on the same object.
- **Real semantic roles** instead of single-hex blobs. `theme.accent` is `{ fg, bg, fgOn, border, hover: { fg, bg }, active: { fg, bg } }` — not just a string.
- **Status / interactive / surface separation**. Status roles (`error`, `warning`, `success`, `info`) only carry surface state (`bg-hover`, `bg-active`); interactive text-color hover lives on `accent` (the canonical link-like role).
- **Auto-lift contrast** in OKLCH. Author a scheme, Sterling fixes the WCAG holes.
- **One DesignSystem contract**. `sterling.deriveFromScheme(...)`, `sterling.deriveFromColor(...)`, `sterling.deriveFromPair(...)`, `sterling.deriveFromSchemeWithBrand(...)`, `sterling.theme(partial)` — everything goes through the same shape.

If you're starting from scratch, read this and then [Styling](/guide/styling).
If you're migrating from silvery 0.19.x, read this then jump to the [migration map](#migrating-from-pre-0-20-0).

## The shape

Every Sterling Theme is a single frozen object. The same hex leaves appear at two paths:

```ts
import { sterling } from "@silvery/theme"

const theme = sterling.deriveFromScheme(myScheme)

// Nested roles — programmatic access
theme.accent.bg // "#5B8DEF"
theme.accent.hover.bg // "#6498F6"
theme.surface.raised // "#3B4252"
theme.cursor.fg // "#E5E9F0"

// Flat hyphen keys — token resolution path (used by `$tokens` in JSX)
theme["bg-accent"] // "#5B8DEF" — same string as theme.accent.bg
theme["bg-accent-hover"] // "#6498F6" — same string as theme.accent.hover.bg
theme["bg-surface-raised"] // "#3B4252"
theme["fg-cursor"] // "#E5E9F0"

// Root pair — the heavy-traffic JSX hooks
theme.fg // = scheme.foreground
theme.bg // = scheme.background = theme["bg-surface-default"]
```

Both paths are real fields on the same object — there is no Proxy. `theme.accent.bg === theme["bg-accent"]` always.

### Roles

| Role       | Shape                                                             | Use for                                                          |
| ---------- | ----------------------------------------------------------------- | ---------------------------------------------------------------- |
| `accent`   | `{ fg, bg, fgOn, border, hover: { fg, bg }, active: { fg, bg } }` | Brand emphasis, focus, primary action, interactive text          |
| `info`     | `{ fg, bg, fgOn, hover: { bg }, active: { bg } }`                 | Neutral status                                                   |
| `success`  | same as info                                                      | Positive status                                                  |
| `warning`  | same as info                                                      | Caution                                                          |
| `error`    | same as info                                                      | Errors / destructive                                             |
| `muted`    | `{ fg, bg }`                                                      | Secondary text (`muted.fg`); subtle hover surface (`muted.bg`)   |
| `surface`  | `{ default, subtle, raised, overlay, hover }`                     | Canvas + card stack (default → subtle → raised → overlay)        |
| `border`   | `{ default, focus, muted }`                                       | Structural rules, focus ring, faint dividers                     |
| `cursor`   | `{ fg, bg }`                                                      | Cursor color and the glyph under it                              |
| `selected` | `{ bg, fgOn, hover: { bg } }`                                     | Cursor row, mouse selection, search match highlight              |
| `inverse`  | `{ bg, fgOn }`                                                    | Status bars, modal chrome — the "you are here" inverse band      |
| `link`     | `{ fg }`                                                          | Hyperlink text (distinct from `accent` if you want classic blue) |

Status roles only carry **surface** state (`hover.bg`, `active.bg`). They don't carry text-color hover variants — text on a status role isn't a link, so `fg-error-hover` would be a category error. `accent` is the only role with `fg.hover` / `fg.active`, because it _is_ a link-like role.

### Flat tokens

Same data, hyphen-keyed. The full list (every flat token Sterling emits):

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

Info        fg-info | bg-info | fg-on-info
            | bg-info-hover | bg-info-active

Success     fg-success | bg-success | fg-on-success
            | bg-success-hover | bg-success-active

Warning     fg-warning | bg-warning | fg-on-warning
            | bg-warning-hover | bg-warning-active

Error       fg-error | bg-error | fg-on-error
            | bg-error-hover | bg-error-active

Selected    bg-selected | fg-on-selected | bg-selected-hover

Inverse     bg-inverse | fg-on-inverse

Link        fg-link
```

Plus the **root pair** `fg` and `bg`, the **categorical hues** (`red`, `orange`, `yellow`, `green`, `teal`, `blue`, `purple`, `pink`), the 16-slot ANSI **palette** (`$color0` … `$color15`), the **typography variants** map, and metadata (`name`, `mode`, optional `derivationTrace`).

The grammar is `prefix-role[-state]` or `prefix-on-role`:

- `bg-X` — fill of role X
- `fg-X` — foreground of role X
- `fg-on-X` — text drawn ON the bg of role X (contrast-picked)
- `border-X` — border for role X
- `*-hover`, `*-active` — state variants

### `$tokens` in JSX

`$tokens` resolve against the flat keys via `resolveToken`. Use `$bg-accent` for the kebab form or `$bgAccent` for the camelCase fallback — both work. Hyphens are stripped at lookup, so legacy single-word names that happened to match Sterling shape (`$bg`, `$fg`) keep working.

```tsx
<Text color="$fg-accent">Deploy</Text>
<Box backgroundColor="$bg-surface-raised" borderColor="$border-default">…</Box>
<Text color="$fg-on-error" backgroundColor="$bg-error">Build failed</Text>
```

For the full token-picking decision tree, see [Token Taxonomy](/guide/token-taxonomy). For component-level styling discipline, see [Styling](/guide/styling).

## Building a Theme

Sterling is exposed as a `DesignSystem` value. Pick the entry point that matches what you have:

```ts
import { sterling } from "@silvery/theme"

// 1. From a 22-color terminal scheme — Sterling's primary path
const theme = sterling.deriveFromScheme(myColorScheme)

// 2. From a single seed color — Material-style
const theme = sterling.deriveFromColor("#5B8DEF", { mode: "dark" })

// 3. From a light/dark scheme pair — emit both at once
const { light, dark } = sterling.deriveFromPair(latte, mocha)

// 4. From a scheme + brand-color overlay
const theme = sterling.deriveFromSchemeWithBrand(myScheme, "#5B8DEF")

// 5. Defaults (no input) — Sterling's built-in baseline
const theme = sterling.defaults("dark") // or "light"

// 6. Hand-curated theme over the defaults
const theme = sterling.theme({ accent: { bg: "#5B8DEF" } }, { mode: "dark" })
```

Every entry point returns a frozen `Theme` with both nested roles AND flat keys populated.

### `DeriveOptions`

```ts
interface DeriveOptions {
  /** "auto-lift" (default) or "strict". Strict throws on AA failure; auto-lift OKLCH-shifts. */
  contrast?: "auto-lift" | "strict"
  /** Attach `derivationTrace` to the returned Theme — for storybook / debug tooling. */
  trace?: boolean
  /** Per-token pins. Skips auto-adjustment for these specific tokens. */
  pins?: Record<string, string>
  /** Force light/dark inference. Default: from `scheme.dark` or WCAG luminance of bg. */
  mode?: "light" | "dark"
}
```

`auto-lift` is the safe default — author a scheme, ship a theme. Switch to `strict` in your test suite to catch palette regressions before they ship.

### Pinning specific tokens

Pins use either nested or flat path syntax — they're equivalent:

```ts
sterling.deriveFromScheme(scheme, {
  pins: {
    "accent.bg": "#5B8DEF", // nested
    "fg-on-error": "#FFFFFF", // flat
    "error.fg": "#bf616a", // nested
  },
})
```

### Tracing derivation

```ts
const theme = sterling.deriveFromScheme(scheme, { trace: true })

for (const step of theme.derivationTrace ?? []) {
  console.log(`${step.token}: ${step.rule} → ${step.output}`, step.inputs)
}
```

Each step records the token path, the rule that produced it, the inputs, the output, and `liftedFrom` if auto-lift adjusted it.

## Authoring an alternative DesignSystem

Sterling implements the `DesignSystem` contract. Other systems (Material, Primer, custom in-house) implement the same shape:

```ts
interface DesignSystem {
  readonly name: string
  readonly shape: ThemeShape
  readonly flatten?: boolean | FlattenRule

  defaults(mode?: "light" | "dark"): Theme
  theme(partial?: DeepPartial<Theme>, opts?: DeriveOptions): Theme
  deriveFromScheme(scheme: ColorScheme, opts?: DeriveOptions): Theme
  deriveFromColor(color: string, opts?: DeriveOptions & { mode?: "light" | "dark" }): Theme
  deriveFromPair(
    light: ColorScheme,
    dark: ColorScheme,
    opts?: DeriveOptions,
  ): { light: Theme; dark: Theme }
  deriveFromSchemeWithBrand(scheme: ColorScheme, brand: string, opts?: DeriveOptions): Theme
}
```

`flatten: true` opts into the framework's default flat-projection rule (channel-role-state — Sterling style). Pass a custom `FlattenRule` to express system-specific naming (e.g., Material's `onPrimary`).

`defineDesignSystem(raw)` wraps a raw system with the auto-`bakeFlat` pipeline so consumers always get both nested and flat keys.

## Migrating from pre-0.20.0

silvery 0.19.x had a legacy `Theme` interface with single-hex role fields (`theme.primary`, `theme.errorfg`, `theme.surfacebg`, …). At 0.20.0 it's gone at the type level — `export type Theme = SterlingTheme`. **TypeScript dot-access on legacy fields breaks now.**

JSX `$token` references keep resolving through the 0.20.x window via `resolveToken`'s direct kebab lookup. Migrate during this release window — the legacy runtime emit will be deleted in 0.21.0.

### `$token` migration map

| Legacy `$token` | Sterling `$token`          |
| --------------- | -------------------------- |
| `$primary`      | `$fg-accent`               |
| `$primaryfg`    | `$fg-on-accent`            |
| `$accent`       | `$fg-accent`               |
| `$accentfg`     | `$fg-on-accent`            |
| `$muted`        | `$fg-muted`                |
| `$mutedbg`      | `$bg-muted`                |
| `$secondary`    | `$fg-muted`                |
| `$error`        | `$fg-error`                |
| `$warning`      | `$fg-warning`              |
| `$success`      | `$fg-success`              |
| `$info`         | `$fg-info`                 |
| `$inverse`      | `$fg-on-inverse`           |
| `$inversebg`    | `$bg-inverse`              |
| `$surface`      | `$fg`                      |
| `$surfacebg`    | `$bg-surface-subtle`       |
| `$popover`      | `$fg`                      |
| `$popoverbg`    | `$bg-surface-overlay`      |
| `$selection`    | `$fg-on-selected`          |
| `$selectionbg`  | `$bg-selected`             |
| `$cursor`       | `$fg-cursor`               |
| `$cursorbg`     | `$bg-cursor`               |
| `$border`       | `$border-default`          |
| `$inputborder`  | `$border-default`          |
| `$focusborder`  | `$border-focus`            |
| `$link`         | `$fg-link`                 |
| `$disabledfg`   | `$fg-muted`                |
| `$bg`           | unchanged (still resolves) |
| `$fg`           | unchanged (still resolves) |

### Dot-access migration map

For TypeScript code that read fields off `Theme` directly:

| Legacy field        | Sterling nested         | Sterling flat                 |
| ------------------- | ----------------------- | ----------------------------- |
| `theme.primary`     | `theme.accent.fg`       | `theme["fg-accent"]`          |
| `theme.primaryfg`   | `theme.accent.fgOn`     | `theme["fg-on-accent"]`       |
| `theme.accent`      | `theme.accent.fg`       | `theme["fg-accent"]`          |
| `theme.error`       | `theme.error.fg`        | `theme["fg-error"]`           |
| `theme.errorfg`     | `theme.error.fgOn`      | `theme["fg-on-error"]`        |
| `theme.warning`     | `theme.warning.fg`      | `theme["fg-warning"]`         |
| `theme.success`     | `theme.success.fg`      | `theme["fg-success"]`         |
| `theme.info`        | `theme.info.fg`         | `theme["fg-info"]`            |
| `theme.cursor`      | `theme.cursor.fg`       | `theme["fg-cursor"]`          |
| `theme.cursorbg`    | `theme.cursor.bg`       | `theme["bg-cursor"]`          |
| `theme.selection`   | `theme.selected.fgOn`   | `theme["fg-on-selected"]`     |
| `theme.selectionbg` | `theme.selected.bg`     | `theme["bg-selected"]`        |
| `theme.inverse`     | `theme.inverse.fgOn`    | `theme["fg-on-inverse"]`      |
| `theme.inversebg`   | `theme.inverse.bg`      | `theme["bg-inverse"]`         |
| `theme.surfacebg`   | `theme.surface.subtle`  | `theme["bg-surface-subtle"]`  |
| `theme.popoverbg`   | `theme.surface.overlay` | `theme["bg-surface-overlay"]` |
| `theme.muted`       | `theme.muted.fg`        | `theme["fg-muted"]`           |
| `theme.mutedbg`     | `theme.muted.bg`        | `theme["bg-muted"]`           |
| `theme.border`      | `theme.border.default`  | `theme["border-default"]`     |
| `theme.focusborder` | `theme.border.focus`    | `theme["border-focus"]`       |
| `theme.link`        | `theme.link.fg`         | `theme["fg-link"]`            |
| `theme.disabledfg`  | `theme.muted.fg`        | `theme["fg-muted"]`           |

## Related

- **[Styling](/guide/styling)** — components, presets, anti-patterns. The day-to-day rules.
- **[Token Taxonomy](/guide/token-taxonomy)** — the decision tree: `$brand` vs `$red` vs `$error` vs `$color1` vs `$fg-accent`.
- **[Theming](/guide/theming)** — `ThemeProvider`, `Box theme={}`, switching schemes at runtime.
- **[Color Schemes](/guide/color-schemes)** — the 22-slot terminal scheme model that feeds Sterling.
- **[@silvery/theme reference](/reference/theme)** — full type definitions for ColorScheme, Theme, DesignSystem.
- **[Custom Tokens](/guide/custom-tokens)** — `defineTokens()` for app-specific roles on top of Sterling.
- **[Capability Tiers](/guide/capability-tiers)** — how Sterling tokens degrade across truecolor / 256 / ANSI 16 / mono.
