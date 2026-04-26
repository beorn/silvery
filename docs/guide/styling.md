# Styling

_Colors, typography, and component defaults for the shiniest Silvery apps_

Colors tarnish fast. Typography gets inconsistent. A hardcoded `"red"` here, a `"$fg-success"` where you meant "brand emphasis" there — suddenly your UI is a patchwork that breaks on every theme. These principles keep your apps **shiny**.

::: info Sterling is the system
Silvery 0.20.0 ships [Sterling](/guide/sterling) as **THE Theme**. The tokens used below — `$fg-accent`, `$fg-muted`, `$bg-surface-subtle`, `$border-focus`, `$bg-selected`, `$fg-on-error` — are Sterling's flat hyphen-keys. Every silvery component already speaks them.

Migrating from silvery 0.19.x? Legacy `$tokens` (`$primary`, `$muted`, `$selectionbg`, …) keep resolving through 0.20.x via a kebab-fallback path. Migrate during this window — they're removed in 0.21.0. The full map is in the [Sterling primer](/guide/sterling#token-migration-map).
:::

## 1. Don't Specify Colors

Most Silvery components already use the correct semantic colors by default. **The best color code is no color code.**

| Component              | What's automatic                                                           |
| ---------------------- | -------------------------------------------------------------------------- |
| `<Text>`               | `$fg` text color                                                           |
| `<TextInput>`          | `$border-default` → `$border-focus` on focus, prompt, cursor               |
| `<TextArea>`           | `$border-default` → `$border-focus` on focus                               |
| `<ModalDialog>`        | `$bg-surface-raised` bg, `$border-default` border, `$fg-accent` title      |
| `<CommandPalette>`     | `$bg-surface-raised` bg, `$border-default` border                          |
| `<Toast>`              | `$bg-surface-raised` bg, `$border-default` border                          |
| `<SelectList>`         | `$bg-selected` / `$fg-on-selected` for selection, `$fg-muted` for disabled |
| `<Badge>`              | Variant colors: `$fg-success`, `$fg-error`, `$fg-warning`, `$fg-accent`    |
| `<ErrorBoundary>`      | `$fg-error` border                                                         |
| `<Divider>`            | `$border-default` for line character                                       |
| `<ProgressBar>`        | `$fg-muted` for empty portion                                              |
| `<Spinner>`            | `$fg`                                                                      |
| `<Button>`             | inverse (`$bg-inverse` / `$fg-on-inverse`) when focused/active             |
| `<H1>`, `<H2>`, `<H3>` | `$fg-accent` / `$fg-accent` / `$fg` + bold (variant table)                 |
| `<Muted>`              | `$fg-muted` text                                                           |
| `<Small>`              | `$fg-muted` (pre-dimmed at truecolor)                                      |
| `<Lead>`               | `italic` text                                                              |
| `<Code>`               | `$bg-muted` background                                                     |
| `<Blockquote>`         | `$fg-muted` border + italic                                                |
| `<P>`                  | body text (semantic wrapper)                                               |
| `<LI>`                 | `•` bullet + indented content                                              |

::: tip ✨ Shiny

```tsx
<ModalDialog title="Confirm">
  <Text>Are you sure?</Text>
</ModalDialog>

<TextInput borderStyle="round" />

<SelectList items={items} />

<Badge variant="success">Passed</Badge>

<Divider />

<ProgressBar value={75} total={100} />
```

Zero color props. The modal gets `$bg-surface-raised`, `$border-default`, `$fg-accent` title. The input gets `$border-default` → `$border-focus` on focus. SelectList handles selection highlighting, Badge picks the right status color, Divider and ProgressBar use Sterling defaults automatically. All automatic.
:::

::: danger 🩶 Tarnished

```tsx
<Box backgroundColor="$bg-surface-raised" borderColor="$border-default" borderStyle="round">
  <Text color="$fg-accent" bold>Confirm</Text>
  <Text color="$fg">Are you sure?</Text>
  <TextInput borderColor={focused ? "$border-focus" : "$border-default"} />
</Box>

<SelectList items={items} color="$fg-accent" />        // already handles selection
<Badge variant="success" color="$fg-success">OK</Badge> // Badge maps variant → color
<Divider color="$fg-muted" />                           // Divider is already dimmed
<ProgressBar value={75} total={100} color="$fg-accent" emptyColor="$fg-muted" />
```

Rebuilding what the component already does. If you're writing `color="$fg"` or `borderColor="$border-default"`, you're spelling out the default — just remove it. Same goes for SelectList, Badge, Divider, and ProgressBar — they already know how to color themselves.
:::

→ [Components guide](/guides/components) · [Theming reference](/reference/theming)

## 2. Build Hierarchy with Color + Typography

TUIs can't vary font size — bold, dim, and italic are your only typographic tools. That makes color **more important** for hierarchy than in web UIs. Use intentional combinations of color + bold/dim to create clear levels.

| Level           | Style                       | Visual effect                                  |
| --------------- | --------------------------- | ---------------------------------------------- |
| H1 — Page title | `$fg-accent` + `bold`       | Brand color, bold — maximum emphasis           |
| H2 — Section    | `$fg-accent` + `bold`       | Brand color, bold (typography variant tunes)   |
| H3 — Group      | `$fg` + `bold`              | Bright, bold — stands out without accent color |
| Body            | `$fg`                       | Normal text                                    |
| Meta / caption  | `$fg-muted`                 | Dimmed, recedes                                |
| Fine print      | `$fg-muted` (via `<Small>`) | Maximally receded — captions, footnotes        |
| Disabled        | `$fg-muted`                 | Faded — clearly inactive                       |

::: tip ✨ Rule — `dim` is a rendering detail, not a design primitive

**Don't write `dim` in application or component code.** Ever. It's a terminal-level SGR modifier with [uneven support](https://terminfo.dev/extensions) and renderer-specific behavior — exactly the kind of thing semantic tokens exist to hide.

Use semantic tokens to express intent:

- **`$fg-muted`** — meta text, captions, labels, hints, secondary info. The canonical "grey". **Use by default.**
- **`<Small>` preset** — fine print. Resolves to a pre-dimmed `$fg-muted` at truecolor; dim attrs only at ANSI 16 / monochrome. Keybinding legends, footnotes, timestamps.
- **None of the above** — primary body text. `$fg` is inherited; don't set it.

Where `dim` _is_ allowed (inside the token system only):

1. `<Small>` preset — the canonical composition
2. Monochrome derivation — dim/bold/italic are the only expressive channels at mono tier
3. Custom-token `attrs` — explicit opt-in at registration via `defineTokens({ "$x": { attrs: ["dim"] } })`
4. Renderer realization at ANSI 16 tier — the system may emit `SGR 2` as the concrete form of a token whose truecolor value is a pre-dimmed hex

Where `dim` is **forbidden**:

- `<Text dimColor>` in component code
- `<Box dim>` inline props
- Manual `$fg-muted + dimColor` pairing
- Anywhere views express rendering details rather than semantic meaning

If you need "this should look dim here," the answer is always: `$fg-muted` or `<Small>`. Let the design system + tier decide what to emit.
:::

Since TUIs lack font-size variation, using 2-3 colors for heading levels is natural and expected — just use **brand tokens** (`$fg-accent`, `$fg`) rather than status colors (`$fg-success`, `$fg-error`).

::: tip ✨ Shiny

```tsx
<Text bold color="$fg-accent">Settings</Text>             // H1 — brand color
<Text bold color="$fg-accent">General</Text>              // H2 — brand color
<Text bold>Appearance</Text>                              // H3 — bold alone
<Text>Use dark colors for the UI</Text>                   // body
<Text color="$fg-muted">Requires restart</Text>           // caption
```

Three heading levels using brand tokens + bold. Each level is visually distinct without borrowing status colors.
:::

::: danger 🩶 Tarnished

```tsx
<Text bold color="$fg-accent">Settings</Text>
<Text bold color="$fg-success">General</Text>     // success ≠ hierarchy
<Text bold color="$fg-error">Appearance</Text>     // error ≠ hierarchy
<Text bold color="$fg-warning">Theme</Text>        // warning ≠ hierarchy
```

Status colors for heading hierarchy — "green heading" looks like success, "red heading" looks like an error. Use brand tokens for hierarchy, reserve status tokens for meaning.
:::

::: tip ✨ Shiny — Typography presets
Use the built-in typography presets (inspired by [shadcn/ui](https://ui.shadcn.com/docs/components/typography)) instead of remembering which combination of color + bold to use:

```tsx
import { H1, H2, H3, Muted, Small, Lead, Code, Blockquote, P, LI } from "silvery"

<H1>Settings</H1>                    // $fg-accent + bold
<H2>General</H2>                      // $fg-accent + bold
<H3>Appearance</H3>                   // bold
<P>Use dark colors for the UI.</P>    // plain body text
<Muted>Requires restart</Muted>       // $fg-muted
<Small>Last updated 2 hours ago</Small> // $fg-muted (pre-dimmed)
<Lead>Welcome to the app</Lead>       // italic
<Code>npm install silvery</Code>      // $bg-muted background
<Blockquote>Less is more.</Blockquote> // │ border + italic
<LI>First item</LI>                   // • bullet
<LI>Second item</LI>
```

Zero color props — the presets handle it. This is the easiest way to get correct hierarchy.
:::

::: tip ✨ Shiny — `<Text variant=…>` resolves from the theme
Variants are theme tokens — `h1`, `h2`, `h3`, `body`, `body-muted`, `fine-print`, `strong`, `em`, `link`, `key`, `code`, `kbd` come built in. The `<H1>` / `<H2>` / … components are thin wrappers over `<Text variant=…>`.

```tsx
<Text variant="h1">Settings</Text>              // = H1 — $fg-accent + bold
<Text variant="body-muted">Context</Text>       // $fg-muted
<Text variant="kbd">⌘K</Text>                   // $bg-muted + $fg-accent + bold
```

Apps extend the variant table via <span v-pre>`<ThemeProvider tokens={{ variants: { hero: { color: "$brand", bold: true } } }}>`</span>. Caller props always win over the variant (`<Text variant="h1" color="$fg-success">` overrides color, keeps bold).
:::

→ [Typography reference](/components/typography) · [Text reference](/api/text) · [Theme tokens](/reference/theming#token-reference)

## 3. Use Tokens for Meaning, Not Decoration

Every `$token` carries semantic weight. Users learn that green means success and red means error. When you borrow those colors for decoration, you train users to ignore them.

::: tip ✨ Shiny

```tsx
<Text color="$fg-success">✓ Tests passed</Text>          // actually means success
<Text color="$fg-error">✗ Build failed</Text>             // actually means error
<Text color="$fg-accent">❯</Text>                          // interactive prompt
<Link href={url}>documentation</Link>                      // auto $fg-link
<Text color="$fg-warning">⚠ Rate limit exceeded</Text>     // actually a warning
<Text color="$fg-info">ℹ 3 items updated</Text>            // informational
<Text color="$fg-accent">Tab</Text>                        // keyboard shortcut label
<Text color="$fg-link" underline>docs.silvery.dev</Text>   // clickable
```

Each color matches its meaning. A new user knows what green and red mean without reading docs. `$fg-accent` marks interactive chrome — prompts, shortcuts, labels. `$fg-link` marks clickable text.
:::

::: danger 🩶 Tarnished

```tsx
<Text color="$fg-success">Agent</Text>            // agent name ≠ success
<Box outlineColor="$fg-success">                  // decorative border ≠ success
<Text color="$fg-error">Delete</Text>             // missing icon — is this an error or a button?
<Text color="$fg-link">Not a link</Text>           // blue non-interactive text confuses users
<Text color="$fg-warning">Settings</Text>          // heading ≠ warning
<Text color="$fg-info">Username</Text>             // label ≠ info
<Text color="$fg-accent">✓ Saved</Text>             // completion ≠ brand
```

When status colors are used for decoration, actual status signals get lost in the noise. "Settings" isn't a warning, "Username" isn't info, and "Saved" is a success — not a brand moment.
:::

→ [Theme tokens](/reference/theming#token-reference) · [Badge component](/guides/components#badge)

## 4. Always Pair Surfaces

Every surface background has a matching text token. Set both or set neither — never gamble on contrast. Sterling's `fg-on-X` tokens are contrast-picked: drawing `$fg-on-error` on `$bg-error` is always legible across all 84 schemes.

::: info Box theme={} handles pairing automatically
`<Box theme={t}>` auto-inherits `$fg` for all descendant text AND auto-fills `$bg` as the background. No explicit `color` or `backgroundColor` props needed — just set `theme` and layout props on the same Box.
:::

| Background            | Text              | Use for                            |
| --------------------- | ----------------- | ---------------------------------- |
| `$bg`                 | `$fg`             | Default app background             |
| `$bg-surface-subtle`  | `$fg`             | Cards, subtle elevation            |
| `$bg-surface-raised`  | `$fg`             | Dialogs, modals, raised panels     |
| `$bg-surface-overlay` | `$fg`             | Tooltips, dropdowns, overlays      |
| `$bg-inverse`         | `$fg-on-inverse`  | Status bars, title bars            |
| `$bg-muted`           | `$fg`             | Hover highlights, muted chips      |
| `$bg-selected`        | `$fg-on-selected` | Cursor row, mouse selection        |
| `$bg-accent`          | `$fg-on-accent`   | Primary action buttons             |
| `$bg-error`           | `$fg-on-error`    | Destructive buttons, error banners |
| `$bg-success`         | `$fg-on-success`  | Success badges                     |
| `$bg-warning`         | `$fg-on-warning`  | Warning banners                    |
| `$bg-info`            | `$fg-on-info`     | Informational chrome               |

::: tip ✨ Shiny

```tsx
<Box backgroundColor="$bg-surface-raised">
  <Text>Dialog content</Text>
</Box>

<Box backgroundColor="$bg-inverse">
  <Text color="$fg-on-inverse">main • 3 files changed</Text>
</Box>

<Box backgroundColor="$bg-surface-overlay">
  <Text>Tooltip: press Ctrl+K for commands</Text>
</Box>

<Box backgroundColor="$bg-error">
  <Text color="$fg-on-error">Build failed</Text>
</Box>
```

Each background is paired with its text token. Contrast is guaranteed across all themes via Sterling's `fg-on-X` contrast-pick. Note `$fg` is inherited automatically on default-style surfaces, so an explicit `color` is only needed on inverse/accent/status fills.
:::

::: danger 🩶 Tarnished

```tsx
<Box backgroundColor="$bg-error">
  <Text>Build failed</Text>           // $fg on $bg-error — gambling on contrast
</Box>

<Box backgroundColor="$bg-inverse">
  <Text>Status bar</Text>              // missing $fg-on-inverse
</Box>

<Box backgroundColor="$bg-surface-raised">
  <Text color="$fg-on-inverse">Wrong token</Text>  // inverse fg on surface bg — wrong tier
</Box>
```

Always use the `fg-on-X` companion when drawing on a status / inverse / accent fill. A token designed for one surface is not interchangeable with another.
:::

→ [Theming reference](/reference/theming#surface-tokens)

## 5. Add Redundant Signals for Status

Color-blind users can't distinguish red from green. In 16-color mode, `$fg-warning` and `$fg-accent` may be the same yellow. **Always pair status colors with icons or text labels.**

| Token         | Icon convention |
| ------------- | --------------- |
| `$fg-success` | ✓ ✔ ◆           |
| `$fg-warning` | ⚠ △             |
| `$fg-error`   | ✗ ✘ ●           |
| `$fg-info`    | ℹ ○             |

::: tip ✨ Shiny

```tsx
<Text color="$fg-success">✓ Tests passed</Text>
<Text color="$fg-error">✗ 3 failures</Text>
<Text color="$fg-warning">⚠ Unsaved changes</Text>
<Text color="$fg-info">ℹ Documentation updated</Text>
<Text color="$fg-success">◆ Build #247 — all green</Text>
<Text color="$fg-error">● Connection refused — retry in 5s</Text>
```

Works in monochrome. Works for color-blind users. The icon carries the meaning even without color. Each status has a distinct icon shape (✓ ✗ ⚠ ℹ ◆ ●), so they're distinguishable even in a 16-color terminal where colors may collide.
:::

::: danger 🩶 Tarnished

```tsx
<Text color="$fg-success">Tests passed</Text>
<Text color="$fg-error">3 failures</Text>
<Text color="$fg-warning">Unsaved changes</Text>

<Badge variant="success" />                            // badge with no label — just a green dot
<Text color="$fg-error" bold>FAILED</Text>             // color-only, no icon
<Box borderColor="$fg-warning" borderStyle="round">    // warning border, no text/icon explanation
  <Text>Session expiring</Text>
</Box>
```

In a 16-color terminal, these might all look yellow. Without icons, there's no way to tell them apart. A color-only badge is invisible to color-blind users. Bold text alone doesn't convey status.
:::

→ [Badge component](/guides/components#badge)

## 6. Use `$fg-accent` for Brand Emphasis

Sterling collapses the legacy `$primary` / `$accent` distinction onto a single role: **`accent` is the canonical interactive-text role**. Use `$fg-accent` for headings, links, focus indicators, primary action buttons — anything where "this is the brand color, look here" is the intent.

For **app-specific identity** (your logo, signature chrome) use `$brand` — defined separately so apps can pin a fixed color without overriding scheme-derived `$fg-accent`. See [Token Taxonomy](/guide/token-taxonomy#app-identity-brand).

| Good use                                  | Why `$fg-accent`        |
| ----------------------------------------- | ----------------------- |
| Heading titles                            | Maximum emphasis        |
| Active tab / focus indicator              | "You are here"          |
| Notification count                        | Urgent but not an error |
| "New" / "Beta" badge                      | Attention, not status   |
| Search match highlight                    | Temporary emphasis      |
| Primary action button (`$bg-accent` fill) | Call to action          |

::: tip ✨ Shiny

```tsx
<Text bold color="$fg-accent">NEW</Text>                  // badge — pops against bg
<Text color="$fg-accent">●3</Text>                        // notification count
<Box backgroundColor="$bg-accent">
  <Text color="$fg-on-accent">query</Text>                // primary button
</Box>
<Text bold color="$fg-accent">BETA</Text>                  // feature flag badge
<Text color="$fg-accent">→</Text>                          // directional attention
```

`$fg-accent` draws the eye to brand emphasis — distinct from status. Feature flags, unread counts, and directional cues are all "look here" moments that don't imply success, error, or info.
:::

::: danger 🩶 Tarnished

```tsx
<Text color="$fg-accent">✓ Done</Text>              // completion — use $fg-success
<Text color="$fg-accent">Name</Text>                 // body text — use $fg
```

If you can't explain why this element needs accent emphasis, you probably want `$fg` or `$fg` + `bold` instead.
:::

→ [Token Taxonomy](/guide/token-taxonomy)

## 7. Let Components Handle Borders

Three border roles exist — `border-default` (structural), `border-focus` (focus ring), `border-muted` (faint subdivider) — and **components handle the transitions automatically**. You just set `borderStyle`.

| Role          | Token             | Applied by                               |
| ------------- | ----------------- | ---------------------------------------- |
| Structural    | `$border-default` | Box (automatic default)                  |
| Focus ring    | `$border-focus`   | TextInput, TextArea (automatic on focus) |
| Faint divider | `$border-muted`   | Subtle dividers in dense layouts         |

::: tip ✨ Shiny

```tsx
<TextInput borderStyle="round" />                // auto: $border-default → $border-focus

<TextArea borderStyle="single" />                 // auto: $border-default → $border-focus

<Box borderStyle="single">                       // structural — auto $border-default
  <Text>Panel content</Text>
</Box>

<Box borderStyle="round">                         // structural — auto $border-default
  <SelectList items={options} />
</Box>
```

Set `borderStyle` and let the component pick the right token. Interactive components get focus on focus automatically; plain Boxes get the structural role.
:::

::: danger 🩶 Tarnished

```tsx
<Box borderColor={focused ? "blue" : "gray"} borderStyle="round">
  <TextInput />
</Box>

<TextInput borderColor="$fg-accent" />             // brand color on input — use defaults

<Box borderColor="$fg-success" borderStyle="round"> // status color for structure — use $border-default
  <Text>Panel</Text>
</Box>
```

Manual focus switching with hardcoded colors — breaks on every theme. Overriding input borders with `$fg-accent` fights the role system. Using `$fg-success` on a structural border implies status meaning where there is none.
:::

→ [Box reference](/api/box)

## 8. Keep Palette Colors for Data

`$color0`–`$color15` are for **categorization** — tags, calendar colors, chart series, syntax highlighting. They're the 16 ANSI palette colors, themed for visual harmony but not tied to semantic meaning.

Sterling also ships a curated **categorical hue ring** — `$red`, `$orange`, `$yellow`, `$green`, `$teal`, `$blue`, `$purple`, `$pink` — eight harmonious hues, contrast-adjusted so they look balanced on every scheme. Prefer those over raw `$color1`–`$color15` for everyday tagging; reach for the raw palette only when you need exact ANSI parity (syntax highlighters, git diff viewers).

### Color Index Reference

| Token                | ANSI Index | Standard Hue    | Typical Use                                   |
| -------------------- | ---------- | --------------- | --------------------------------------------- |
| `$color0`            | 0          | Black           | Background variant, dark overlay              |
| `$color1`            | 1          | Red             | Bug tags, critical priority, deletion markers |
| `$color2`            | 2          | Green           | Enhancement tags, online status, added lines  |
| `$color3`            | 3          | Yellow          | Warning tags, pending status, modified lines  |
| `$color4`            | 4          | Blue            | Feature tags, info markers, links in data     |
| `$color5`            | 5          | Magenta         | Documentation tags, special categories        |
| `$color6`            | 6          | Cyan            | Test tags, metadata, timestamps               |
| `$color7`            | 7          | White           | Default data text, neutral category           |
| `$color8`–`$color15` | 8–15       | Bright variants | Extended categories, chart second series      |

::: tip ✨ Shiny

```tsx
// Tag labels — assign colors by category (categorical hues — contrast-adjusted)
<Text color="$red">bug</Text>
<Text color="$blue">feature</Text>
<Text color="$purple">docs</Text>
<Text color="$green">enhancement</Text>

// Calendar colors — each calendar gets a slot
<Text color="$blue">■ Work</Text>
<Text color="$green">■ Personal</Text>
<Text color="$purple">■ Family</Text>
<Text color="$orange">■ Fitness</Text>

// Git diff — added/removed/modified (raw ANSI for terminal parity)
<Text color="$color2">+ added line</Text>
<Text color="$color1">- removed line</Text>
<Text color="$color3">~ modified line</Text>

// Syntax highlighting — language tokens (raw ANSI)
<Text color="$color4">const</Text> <Text color="$color6">name</Text> <Text>=</Text> <Text color="$color2">"silvery"</Text>

// Priority levels in a task list
<Text color="$red">● P0 Critical</Text>
<Text color="$yellow">● P1 High</Text>
<Text color="$blue">● P2 Medium</Text>
<Text color="$fg-muted">● P3 Low</Text>

// Chart series / data visualization
<Text color="$blue">━━━ Revenue</Text>
<Text color="$green">━━━ Profit</Text>
<Text color="$red">━━━ Expenses</Text>
```

Data categories — each tag, calendar, diff line, syntax token, priority, or chart series gets a consistent slot. The colors carry no semantic meaning beyond "this is category N."
:::

::: danger 🩶 Tarnished

```tsx
// Using palette for UI chrome
<Box borderColor="$color4">                          // UI border — use $border-default
<Text color="$color1">Error: file not found</Text>   // status — use $fg-error

// Using semantic tokens for data categories
<Text color="$fg-success">enhancement</Text>          // tag — use $green
<Text color="$fg-error">bug</Text>                    // tag — use $red
<Text color="$fg-warning">pending</Text>              // tag — use $yellow

// Mixing categorical and raw for the same purpose
<Text color="$red">critical</Text>                   // categorical...
<Text color="$color1">red badge</Text>                // ...then raw for same list? Pick one system.
```

Palette colors for UI chrome strips them of their data-categorization role. Using `$fg-success`/`$fg-error` for tags trains users to see "bug" as an error state rather than a category. Mixing categorical and raw in the same list is confusing — pick one system and be consistent.
:::

### Assignment Strategies

- **Static mapping**: Assign colors at design time (e.g., "bug" always gets `$red`). Best for known, stable categories.
- **Dynamic mapping**: Assign by index (e.g., the 8 categorical hues for user-created tags). Best for user-created categories.
- **Avoid `$color0` and `$color7`**: `$color0` (black) may be invisible on dark themes, `$color7` (white) on light themes. Prefer `$color1`–`$color6` and `$color8`–`$color14` for raw ANSI use.

### Truecolor Theming

In truecolor mode, each theme curates the 16 palette colors for visual harmony — equal-weight hues that look cohesive together. Sterling's categorical hue ring (`$red`–`$pink`) goes a step further with OKLCH contrast-adjustment per scheme. Your component code stays the same; the theme does the heavy lifting.

→ [Token Taxonomy](/guide/token-taxonomy#categorical-color-ring) · [Palette reference](/reference/theming#content-palette)

## 9. Color Inheritance and Mixing

Two escape hatches for when tokens and defaults aren't enough.

### Inherit

Use `color="inherit"` to skip a component's default color and inherit from the parent:

```tsx
<Text color="red">
  Red parent.{" "}
  <Link color="inherit" href="...">
    Inherits red
  </Link>
</Text>
```

This is essential for `<Link>` (which defaults to `$fg-link`) inside colored containers like status bars.

### State variants

Sterling's interactive roles ship `-hover` and `-active` companions — derived in OKLCH (`±0.04L` / `±0.08L`) so they stay in-palette. Use them when mouse hover or press state matters:

```tsx
<Text color={hovered ? "$fg-accent-hover" : "$fg-accent"}>Click me</Text>
<Box backgroundColor={pressed ? "$bg-selected-hover" : "$bg-selected"}>…</Box>
```

Available state-aware tokens:

- `$fg-accent-hover` / `$fg-accent-active`
- `$bg-accent-hover` / `$bg-accent-active`
- `$bg-info-hover` / `$bg-info-active` (and same for `success` / `warning` / `error`)
- `$bg-selected-hover`
- `$bg-surface-hover`

### Mix

Blend two colors with `mix(color1, color2, amount)`:

```tsx
{
  /* Subtle blue hover tint over dark background */
}
;<Box backgroundColor="mix($bg, $fg-link, 10%)">
  <Text>Hover state</Text>
</Box>

{
  /* 50/50 blend of two theme colors */
}
;<Text color="mix($fg-accent, $fg-link, 50%)">Blended</Text>
```

Supports theme tokens (`$bg`, `$fg-link`, …), named colors (`red`, `blue`), and hex (`#ff0000`). Amount is 0-100% or 0.0-1.0.

::: tip ✨ Shiny

```tsx
<Box backgroundColor="$bg-inverse">
  <Text color="$fg-on-inverse">Status: </Text>
  <Link color="inherit" href="/docs">docs</Link>
</Box>

<Box backgroundColor="mix($bg, $fg-error, 15%)">
  <Text color="$fg-error">✗ Build failed — 3 errors</Text>
</Box>
```

`inherit` lets the Link blend into the inverse text color instead of injecting `$fg-link` blue. `mix()` creates a subtle error-tinted background without a dedicated token.
:::

::: danger 🩶 Tarnished

```tsx
<Box backgroundColor="$bg-inverse">
  <Link href="/docs" color="$fg-link">docs</Link>
</Box>

<Box backgroundColor="#3a1111">
  <Text color="$fg-error">Build failed</Text>
</Box>
```

`$fg-link` blue on `$bg-inverse` may have poor contrast. Hardcoded `#3a1111` for an error tint breaks across themes — `mix($bg, $fg-error, 15%)` adapts automatically.
:::

## 10. Use `<Backdrop>` to Dim a Region

`<Backdrop fade={n}>` is a render-time fade effect: every cell covered by its rect has its `fg` and `bg` blended toward the theme neutral (pure black for dark themes, pure white for light). It works standalone — no modal required — as long as a `<ThemeProvider>` is in scope.

```tsx
// Dim the entire board while a side panel is open
<Backdrop fade={0.7}>
  <Board />
</Backdrop>
<SidePanel />  {/* crisp, not wrapped */}
```

The fade amount is in `[0, 1]`: `0` is a passthrough (no-op), `1` is fully converged to the neutral (essentially invisible). A value around `0.4`–`0.7` is typical for "active but background" regions.

**Two-channel transform (with `ThemeProvider`):** when a `<ThemeProvider>` is in scope, both `fg` and `bg` are blended toward the neutral. This gives the classic "modal spotlight" depth effect — colored surfaces (panels, borders, badges) all recede toward the same dark or light neutral, amplifying the visual separation.

**Legacy fallback (no `ThemeProvider`):** without a theme in scope, only `fg` is blended (toward the cell's own `bg`). Explicit `bg` values are left unchanged. This produces a milder fade but still distinguishes the region.

**Color tiers:**

| Tier            | What happens                                               |
| --------------- | ---------------------------------------------------------- |
| truecolor / 256 | OKLab blend toward neutral — exact, perceptually uniform   |
| ANSI 16         | SGR 2 (dim) stamped on cells — best-effort, single-channel |
| monochrome      | no-op — modal border carries separation                    |

::: tip ✨ Shiny — standalone Backdrop

```tsx
<Box flexDirection="row">
  <Backdrop fade={0.5}>
    <FileTree />
  </Backdrop>
  <Editor /> {/* crisp */}
</Box>
```

:::

::: tip ✨ Shiny — Backdrop inside ModalDialog

For modals, prefer the `fade` prop on `ModalDialog` / `PickerDialog` — it fades everything **outside** the dialog automatically:

```tsx
<ModalDialog title="Confirm" fade={0.4}>
  <Text>Are you sure?</Text>
</ModalDialog>
```

:::

::: danger 🩶 Tarnished

```tsx
const [fade, setFade] = useState(0)
useEffect(() => { const t = setInterval(() => setFade(f => Math.min(f + 0.1, 0.7)), 50); return () => clearInterval(t) }, [])
<Backdrop fade={fade}>...</Backdrop>

<Box style={{ opacity: 0.5 }}>...</Box>   // opacity doesn't exist in terminal rendering
```

`Backdrop` is a render-time transform, not an animation primitive. Fade values set in React state are fine for instant transitions; don't animate them in a 50ms loop. And there's no `opacity` in TUIs — `Backdrop` is the only semantic way to dim a region.
:::

→ See `Backdrop` and `ModalDialog` in the [components index](/api/).

## Quick Reference

### Decision Flowchart

**"What color should this element use?"**

1. **Is there a standard component for this?** → Use it. Don't specify colors.
2. **Is it body text?** → `$fg` (default — don't specify)
3. **Is it secondary/supporting?** → `$fg-muted`
4. **Is it disabled or placeholder?** → `$fg-muted`
5. **Is it a heading?** → `<H1>` / `<H2>` / `<H3>` presets
6. **Is it a hyperlink?** → `$fg-link`
7. **Is it interactive chrome (prompt, shortcut)?** → `$fg-accent`
8. **Does it indicate success/error/warning?** → `$fg-success` / `$fg-error` / `$fg-warning` + icon
9. **Does it need brand emphasis?** → `$fg-accent`
10. **Is it a structural border?** → don't specify (`$border-default` is automatic)
11. **Is it a focus ring?** → set `borderStyle` (auto `$border-default` / `$border-focus`)
12. **Is it an elevated surface?** → `$bg-surface-subtle` / `-raised` / `-overlay`
13. **Is it a status/chrome bar?** → `$bg-inverse` + `$fg-on-inverse`
14. **Is it a primary action?** → `$bg-accent` + `$fg-on-accent`
15. **Is it a status banner?** → `$bg-error` / `$bg-warning` / `$bg-success` / `$bg-info` + matching `$fg-on-X`
16. **Is it the cursor row / selection?** → `$bg-selected` + `$fg-on-selected`
17. **Is it a data category?** → `$red` / `$blue` / `$green` etc. (categorical hues) or `$color0`–`$color15` (raw ANSI)
18. **Should it inherit the parent's color?** → `color="inherit"` (e.g., Link inside a colored container)
19. **Need a derived/blended color?** → `mix(color1, color2, amount)`

### Smell Summary

| Smell                                                   | What it means                                                                         |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `color="$fg"`                                           | Writing the default — remove it                                                       |
| `color="red"` or `"#hex"`                               | Hardcoded — use a `$token`                                                            |
| Status tokens (`$fg-success`, `$fg-error`) for headings | Status colors imply meaning — use `$fg-accent` / `$fg` for hierarchy                  |
| `borderColor={focused ? ... : ...}`                     | Manual focus switching — let the component handle it                                  |
| `backgroundColor` without matching `fg-on-X`            | Unpaired status/inverse/accent surface — add the contrast-picked text token           |
| `$fg-success` / `$fg-error` without icon or label       | Color-only status — add redundant text signal                                         |
| `$fg-success` on a structural border for decoration     | Misused status — use `$border-default` or `$fg-accent`                                |
| `$color0`–`$color15` for UI chrome                      | Palette is for data categorization only                                               |
| `$primary` / `$muted` / `$selectionbg`                  | Legacy `$tokens` — migrate to Sterling (`$fg-accent`, `$fg-muted`, `$bg-selected`, …) |
| Specifying colors a component already handles           | Fighting the framework — remove and trust defaults                                    |
| Hardcoded hex for a tinted surface                      | Use `mix($bg, $token, N%)` — adapts to any theme                                      |
| `<Link>` inside a colored container using `$fg-link`    | Use `color="inherit"` — inherits from the parent instead of forcing blue              |

### Contrast Guarantees

Sterling's `auto-lift` derivation ensures minimum contrast ratios on the core role pairs. If a token already meets the target, it's returned unchanged. If not, OKLCH lightness is shifted (preserving hue and chroma) until the target is met.

| Token class                                                | Target ratio | Rationale                                          |
| ---------------------------------------------------------- | ------------ | -------------------------------------------------- |
| Body text (`$fg`) on all surfaces (`$bg`, `$bg-surface-*`) | 4.5:1 (AA)   | Primary text must be readable everywhere           |
| Muted text (`$fg-muted`) on `$bg` and `$bg-muted`          | 4.5:1 (AA)   | Secondary text must be readable                    |
| Accent / status fg on `$bg`                                | 4.5:1 (AA)   | Colored text on root background                    |
| `$fg-on-accent` / `$fg-on-error` / etc. on their `$bg-X`   | 4.5:1 (AA)   | Contrast-picked black or white                     |
| Selected text on `$bg-selected`                            | 4.5:1 (AA)   | Selected text must be readable                     |
| Cursor text on `$bg-cursor`                                | 4.5:1 (AA)   | Text under cursor must be readable                 |
| `$border-default` on `$bg`                                 | 1.5:1        | Faint structural dividers — visible, not prominent |
| `$border-focus` on `$bg`                                   | 3.0:1        | WCAG 1.4.11 non-text minimum for controls          |

Sterling is OKLCH-native throughout: blends, lightness adjustments, and contrast lifts all happen in the perceptually-uniform space.

### Terminal Notes

- **No transparency**: Every color is solid. Use `$bg-muted` for hover instead of opacity.
- **dim attribute**: `$fg-muted` may use ANSI dim in 16-color mode — don't use it for critical info.
- **16-color fallback**: Status colors may map to the same ANSI color. Always pair with icons.
- **Progressive enhancement**: Same vocabulary works ANSI 16 → 256 → truecolor.
- **Vibrancy/saturation**: Apple-style super-saturated colors don't translate to terminals. Pick a truecolor scheme with vivid palette colors (Catppuccin, Tokyo Night) — the scheme does the heavy lifting, not your component code.

## CSS Sizing Mappings

silvery components mirror CSS sizing properties so the same code lays out the same way in a terminal, on canvas, and in the browser.

### `field-sizing` — `<TextArea>` auto-grow

CSS [`field-sizing`](https://developer.mozilla.org/en-US/docs/Web/CSS/field-sizing) controls whether a form control sizes to its content. silvery's `<TextArea>` exposes the same two values:

| CSS                     | silvery prop                                | Behavior                                                                 |
| ----------------------- | ------------------------------------------- | ------------------------------------------------------------------------ |
| `field-sizing: content` | `<TextArea fieldSizing="content" />`        | Height tracks content, clamped between `minRows` and `maxRows`. Default. |
| `field-sizing: fixed`   | `<TextArea fieldSizing="fixed" rows={N} />` | Height stays at `rows` regardless of content.                            |

`<TextArea rows={N}>` mirrors HTML's `<textarea rows={N}>`. silvery adds `minRows` / `maxRows` for the auto-grow range — the cross-platform / web-target convention for chat inputs.

```tsx
// Chat input — defaults are minRows=1, maxRows=8
<TextArea value={msg} onChange={setMsg} onSubmit={send} />

// Fixed-height code editor pane
<TextArea value={code} fieldSizing="fixed" rows={16} />
```

**Don't compute wrap math in your consumer.** A common anti-pattern is calling `useBoxRect` + `countVisualLines` to derive a `height={N}` for `<TextArea>`. Use `fieldSizing` / `minRows` / `maxRows` instead — the component knows about wrap, scroll, and clamping. Hand-rolled height math drifts from the wrap algorithm under width changes and IME input.

## See Also

- **[Sterling](/guide/sterling)** — silvery's canonical design system: roles, flat tokens, derivation entry points, full migration map.
- **[Token Taxonomy](/guide/token-taxonomy)** — every token category silvery ships and the decision tree for which to use (`$brand` vs `$red` vs `$fg-error` vs `$color1` vs `$fg-accent`).
- **[Color Schemes](/guide/color-schemes)** — the 22-slot scheme model, derivation entry points, and the 84+ bundled schemes.
- **[Capability Tiers](/guide/capability-tiers)** — how tokens render at truecolor / 256 / ANSI 16 / monochrome, and the four opt-out modes (`NO_COLOR`, `SILVERY_COLOR=mono|plain`, `SILVERY_STRIP_ALL`).
- **[Custom Tokens](/guide/custom-tokens)** — `defineTokens()` for app-specific semantic tokens and brand colors with proper fallbacks.
