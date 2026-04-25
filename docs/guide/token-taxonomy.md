---
title: Token Taxonomy
description: Every token category silvery ships — when to use each, how they relate, and which to reach for by default.
---

# Token Taxonomy

<p class="page-tagline">Six token families, one decision tree</p>

Silvery ships six distinct token categories. Each has a _different contract_ — picking the right one makes your UI adapt correctly across 84 schemes, four tiers, and every user's terminal. Picking the wrong one produces hardcoded-looking apps that don't respect user themes.

::: info Sterling tokens
Silvery 0.20.0 ships [Sterling](/guide/sterling) as THE Theme. The `$fg-accent` / `$fg-muted` / `$bg-selected` tokens used below are Sterling's flat hyphen-keys. Migrating from pre-0.20.0? Legacy `$tokens` keep resolving through 0.20.x — see the [migration map](/guide/sterling#token-migration-map).
:::

The decision tree, memorized:

1. **Want app identity?** → `$brand`
2. **Want a color for a tag / category / chart series / priority?** → `$red`, `$blue`, `$green`, … (one of 8)
3. **Want to signal state or validation?** → `$fg-error`, `$fg-success`, `$fg-warning`, `$fg-info`
4. **Want UI chrome (background, border, text)?** → `$fg`, `$bg`, `$fg-muted`, `$border-default`, `$fg-accent`, …
5. **Writing a syntax highlighter?** → `$color0`–`$color15`
6. **Emphasizing something hierarchically?** → typography preset (`<H1>`, `<Small>`, etc.)

Each branch below explains when it's the right answer.

## 1. App identity — `$brand`

**The one color that's _you_.** Your logo, your chrome, the signature accent that says "this is my app."

```tsx
<Text color="$brand">MyApp v2.3</Text>
<Box borderColor="$brand">…</Box>
```

| Token           | Resolves to                                                                                                                                                                                            |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `$brand`        | App's primary identity color. Defaults to `scheme.primary` (often the cursor color or the scheme's declared primary). Apps pin via <span v-pre>`<ThemeProvider tokens={{ brand: "#5B8DEF" }}>`</span>. |
| `$brand-hover`  | +0.04 L in OKLCH (+darken on light themes). For interactive hover states.                                                                                                                              |
| `$brand-active` | +0.08 L in OKLCH. For active/pressed states.                                                                                                                                                           |

**Apple analogue**: `UIColor.tintColor` / the per-app accent. Each app has ONE.

**Don't use for**: categorical tagging (use `$red` etc), semantic state (use `$fg-error` etc), or body text (use `$fg`).

**`$brand` vs `$fg-accent`?** `$fg-accent` is the _scheme's_ canonical interactive color (Sterling derives it from `scheme.primary` or the scheme's accent slot). `$brand` is the _app's_ identity. Apps that want their brand to dominate pin `$brand`; apps that want to blend in let `$brand` default to `$fg-accent`.

## 2. Categorical color ring — `$red`, `$orange`, `$yellow`, `$green`, `$teal`, `$blue`, `$purple`, `$pink`

**Eight harmonious hues for tagging.** Contrast-adjusted per scheme; visually balanced so no single hue pops more than another. These look great regardless of whether the user is in Dracula or Solarized.

```tsx
// Tags
<Text color="$red">urgent</Text>
<Text color="$blue">research</Text>
<Text color="$green">done</Text>

// Calendar categories
<CalendarEvent color="$purple" title="Code review" />

// Chart series
<Series data={cpu} color="$teal" />
<Series data={mem} color="$orange" />
```

| Token     | Resolves to                            |
| --------- | -------------------------------------- |
| `$red`    | Scheme's red, contrast-adjusted.       |
| `$orange` | Blend of scheme's red + yellow.        |
| `$yellow` | Scheme's yellow.                       |
| `$green`  | Scheme's green.                        |
| `$teal`   | Blend of scheme's green + cyan.        |
| `$blue`   | Scheme's blue (bright on dark themes). |
| `$purple` | Scheme's magenta.                      |
| `$pink`   | Blend of scheme's magenta + red.       |

**Prior art**: Apple's `.systemRed/.systemIndigo/.systemTeal/…`, Tailwind's `bg-red-500`, Material's `red.500`.

**Don't use for**: state semantics (use `$fg-error`). Don't hardcode tag colors in your app config — let the theme pick.

**Why not use `$color1` etc?** `$color0..$color15` are raw ANSI slots (user's terminal exactly). `$red` is contrast-adjusted so it's readable on every scheme. Use raw colors only for syntax highlighters where exact terminal parity matters.

## 3. Semantic state — `$fg-error`, `$fg-success`, `$fg-warning`, `$fg-info`

**Colors that _communicate meaning_.** The reader parses "yellow = caution" because the token says so semantically, not because the hue happens to be warning-shaped.

```tsx
<Text color="$fg-error">Build failed</Text>
<Text color="$fg-success">Deployed</Text>
<Text color="$fg-warning">Deprecated API</Text>
<Text color="$fg-info">3 updates available</Text>
```

Status roles ship a full surface pair plus contrast-picked text-on-fill:

| Status text   | Status fill   | Text on fill        | Use for                    |
| ------------- | ------------- | ------------------- | -------------------------- |
| `$fg-error`   | `$bg-error`   | `$fg-on-error`      | danger, validation errors  |
| `$fg-warning` | `$bg-warning` | `$fg-on-warning`    | caution, deprecations      |
| `$fg-success` | `$bg-success` | `$fg-on-success`    | completions, confirmations |
| `$fg-info`    | `$bg-info`    | `$fg-on-info`       | neutral info, tips         |

Plus `bg-X-hover` and `bg-X-active` for interactive surfaces. Note that text on a status role doesn't carry hover variants — `fg-error-hover` would be a category error (text on a status role isn't a link). For interactive text-color hover, use `$fg-accent-hover`.

**When an app needs a red that's NOT an error** (e.g. "delete button" or a red tag category): use `$red` or `$brand`. `$fg-error` is reserved for _error state_.

**Visual state cue chain**: don't rely on color alone. Pair with icons / attrs / text prefixes so colorblind users and monochrome terminals still convey state. See the [Capability Tiers](/guide/capability-tiers) tier degradation section.

## 4. UI chrome — `$fg`, `$bg`, `$fg-accent`, `$fg-muted`, `$border-default`, and friends

**The design-system scaffolding.** Most component code uses these. If a token isn't in one of the other categories, it's here.

### Root + text hierarchy

| Token                    | Meaning                                                    |
| ------------------------ | ---------------------------------------------------------- |
| `$fg`                    | Default body text                                          |
| `$bg`                    | Default background                                         |
| `$fg-muted`              | Secondary text (captions, hints, disabled)                 |
| `$fg-on-inverse`         | Text on `$bg-inverse` (status bars, modal chrome)          |

Sterling collapses pre-0.20 `$muted` / `$secondary` / `$disabledfg` / `$faint` onto a single role: `$fg-muted`. The `<Small>` typography preset emits a pre-dimmed variant for fine print.

### Surface stack

Every "surface" comes as a `bg-X` background paired with `$fg` (text) or `$fg-on-X` (text on filled surface).

```tsx
<Box backgroundColor="$bg-surface-raised">
  <Text>Card content</Text>
</Box>

<Box backgroundColor="$bg-error">
  <Text color="$fg-on-error">Build failed</Text>
</Box>
```

| Surface                    | Use                                  |
| -------------------------- | ------------------------------------ |
| `$bg` / `$fg`              | Default root canvas                  |
| `$bg-surface-subtle`       | Cards, list rows                     |
| `$bg-surface-raised`       | Dialogs, modals, raised panels       |
| `$bg-surface-overlay`      | Tooltips, dropdowns, overlays        |
| `$bg-inverse` / `$fg-on-inverse` | Status bars, footers           |
| `$bg-muted` / `$fg`        | Inline muted chips, code            |

### Accent (the canonical interactive role)

| Token                | Meaning                                                                                |
| -------------------- | -------------------------------------------------------------------------------------- |
| `$fg-accent`         | Brand emphasis text — headings, links, focus indicators, nav highlights                |
| `$bg-accent`         | Primary action button fill                                                             |
| `$fg-on-accent`      | Text on `$bg-accent` (contrast-picked)                                                 |
| `$fg-accent-hover`   | Text-color hover (link hover) — Sterling's only role with `fg.hover` / `fg.active`     |
| `$bg-accent-hover`   | Surface hover on accent fill                                                           |
| `$border-accent`     | Accent-emphasized borders (focus rings, etc.)                                          |

**`$fg-accent` vs `$brand`?** `$fg-accent` is the _scheme's_ canonical interactive color (derives from `scheme.primary`). `$brand` is the _app's_ identity. Apps that want their brand to dominate pin `$brand`; apps that want to blend in let `$brand` default to `$fg-accent`.

### Borders + links

| Token              | Meaning                                                                   |
| ------------------ | ------------------------------------------------------------------------- |
| `$border-default`  | Default structural border — faint, not prominent (1.5:1 contrast target). |
| `$border-focus`    | Focused input border (3:1 WCAG 1.4.11).                                   |
| `$border-muted`    | Faint subdivider for dense layouts                                        |
| `$fg-link`         | Hyperlink color — distinct from `$fg-accent` (often classic blue)         |

### Selection + cursor

| Token             | Meaning                                                                   |
| ----------------- | ------------------------------------------------------------------------- |
| `$bg-selected`    | Cursor row, mouse selection, search match highlight                       |
| `$fg-on-selected` | Text on `$bg-selected` (contrast-picked)                                  |
| `$bg-cursor`      | Cursor block/line color                                                   |
| `$fg-cursor`      | Glyph color under the cursor                                              |

## 5. Raw ANSI palette — `$color0`–`$color15`

**The user's terminal colors, verbatim.** No contrast adjustment, no theming. What the user configured in their emulator is what you get.

```tsx
<Text color="$color1">red</Text>  {/* scheme.red directly */}
<Text color="$color14">cyan bright</Text>  {/* scheme.brightCyan directly */}
```

| Index | Slot                         |
| ----- | ---------------------------- |
| 0     | black                        |
| 1     | red                          |
| 2     | green                        |
| 3     | yellow                       |
| 4     | blue                         |
| 5     | magenta                      |
| 6     | cyan                         |
| 7     | white                        |
| 8–15  | bright variants of the above |

**Use for**: syntax highlighters (Prettier/tree-sitter-style) where exact terminal color parity matters. Git diff viewers. Anywhere the app explicitly wants the user's ANSI verbatim.

**Don't use for**: everyday UI. `$red` / `$blue` / `$green` are always preferable — they're contrast-adjusted, they don't look muddy on themes where the raw ANSI red is a subtle brown.

## 6. Typography presets — `<H1>`, `<H2>`, `<H3>`, `<Muted>`, `<Small>`, `<Strong>`, `<Em>`, `<Code>`, `<Blockquote>`

**Not tokens per se, but the hierarchy primitives.** Each preset bundles color + attrs so you don't hand-write `<Text color="$fg-accent" bold>`.

```tsx
<H1>Page title</H1>
<H2>Section</H2>
<H3>Group</H3>
<Muted>Caption text</Muted>
<Small>Fine print</Small>
<Strong>Emphasis</Strong>
<Em>Italic emphasis</Em>
<Code>inline code</Code>
<Blockquote>pull quote</Blockquote>
```

**Under the hood**: these resolve to `<Text variant="h1">` etc. against Sterling's `theme.variants` table. Apps extend the variant table via <span v-pre>`<ThemeProvider tokens={{ variants: { hero: { color: "$brand", bold: true } } }}>`</span>.

## Decision tree, visualized

```
What color are you choosing for?
│
├── The app's identity / logo / signature chrome → $brand (+ -hover/-active)
│
├── A tag / category / chart series / priority level (no state meaning)
│    → $red / $orange / $yellow / $green / $teal / $blue / $purple / $pink
│
├── Communicating STATE (error, warning, success, info)
│    → $fg-error / $fg-warning / $fg-success / $fg-info
│
├── UI chrome (text, bg, borders, surfaces)
│    → $fg / $bg / $fg-muted / $border-default / $fg-accent / $bg-surface-* / …
│
├── Hierarchy (heading, fine print, emphasis)
│    → <H1>, <Small>, <Strong>, <Muted>, <Em>, <Code>, <Blockquote>
│
└── Raw terminal ANSI (syntax highlighter, user-exact parity)
     → $color0..$color15
```

## Anti-patterns

- **`$fg-error` for anything that isn't literally an error** — e.g. "delete" buttons, red tags. Use `$red` or `$brand` instead.
- **`$color1` for everyday UI** — it's the user's raw ANSI, not contrast-adjusted. Use `$red` unless you're writing a syntax highlighter.
- **`$fg-accent` for app brand** — `$fg-accent` is the _scheme's_ canonical interactive color. For _app brand_, use `$brand`.
- **Hardcoded hex for a tinted surface** — use `$bg-surface-subtle` / `$bg-surface-overlay` or `mix($bg, $token, N%)`.
- **`dim` or `dimColor` anywhere** — `dim` is a rendering detail. Use `$fg-muted` or `<Small>` instead. (See the [Styling Guide](/guide/styling) for the full deprecation rationale.)
- **Legacy `$tokens` after migrating** — `$primary`, `$muted`, `$selectionbg`, etc. resolve through 0.20.x but go away in 0.21.0. Migrate now via the [Sterling migration map](/guide/sterling#token-migration-map).

## Defining your own tokens

If you need a token that isn't covered above — priority levels, calendar-specific accents, brand sub-colors — use `defineTokens()`:

```tsx
import { defineTokens } from "silvery/theme"

const appTokens = defineTokens({
  "$priority-p0": { derive: (s) => s.brightRed },   // derivation — adapts to scheme
  "$priority-p1": { derive: (_, t) => t.red },
  "$priority-p2": { derive: (_, t) => t.orange },
  "$my-brand": { rgb: "#5B8DEF", ansi16: "brightBlue" },  // fixed brand
})

<ThemeProvider tokens={appTokens}>
  <App />
</ThemeProvider>
```

See the [Custom Tokens](/guide/custom-tokens) guide for the full API.

## See also

- **[Sterling primer](/guide/sterling)** — silvery's design system: roles, flat tokens, derivation, migration.
- [Color Schemes](/guide/color-schemes) — the 22-slot ColorScheme model (what `$tokens` derive from)
- [Capability Tiers](/guide/capability-tiers) — how tokens render at truecolor / 256 / ANSI 16 / mono
- [Custom Tokens](/guide/custom-tokens) — `defineTokens()` API for app extensions
- [Styling Guide](/guide/styling) — component defaults, typography presets, contrast guarantees
