# Styling

_Colors, typography, and component defaults for the shiniest Silvery apps_

Colors tarnish fast. Typography gets inconsistent. A hardcoded `"red"` here, a `"$success"` where you meant "brand emphasis" there — suddenly your UI is a patchwork that breaks on every theme. These principles keep your apps **shiny**.

## 1. Don't Specify Colors

Most Silvery components already use the correct semantic colors by default. **The best color code is no color code.**

| Component              | What's automatic                                                    |
| ---------------------- | ------------------------------------------------------------------- |
| `<Text>`               | `$fg` text color                                                    |
| `<TextInput>`          | `$inputborder` → `$focusborder` on focus, `$control` prompt, cursor |
| `<TextArea>`           | `$inputborder` → `$focusborder` on focus                            |
| `<ModalDialog>`        | `$surfacebg` bg, `$border` border, `$primary` title                 |
| `<CommandPalette>`     | `$surfacebg` bg, `$border` border                                   |
| `<Toast>`              | `$surfacebg` bg, `$border` border                                   |
| `<SelectList>`         | `inverse` for selection, `dimColor` for disabled                    |
| `<Badge>`              | Variant colors: `$success`, `$error`, `$warning`, `$primary`        |
| `<ErrorBoundary>`      | `$error` border                                                     |
| `<Divider>`            | `dimColor` for line character                                       |
| `<ProgressBar>`        | `dimColor` for empty portion                                        |
| `<Spinner>`            | `$fg`                                                               |
| `<Button>`             | `inverse` when focused/active                                       |
| `<H1>`, `<H2>`, `<H3>` | `$primary`/`$accent`/`$fg` + bold                                   |
| `<Muted>`              | `$muted` text                                                       |
| `<Small>`              | `$muted` + `dimColor`                                               |
| `<Lead>`               | `italic` text                                                       |
| `<Code>`               | `$mutedbg` background                                               |
| `<Blockquote>`         | `$muted` border + italic                                            |
| `<P>`                  | body text (semantic wrapper)                                        |
| `<LI>`                 | `•` bullet + indented content                                       |

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

Zero color props. The modal gets `$surfacebg`, `$border`, `$primary` title. The input gets `$inputborder` → `$focusborder` on focus. SelectList handles selection highlighting, Badge picks the right status color, Divider and ProgressBar use dim automatically. All automatic.
:::

::: danger 🩶 Tarnished

```tsx
<Box backgroundColor="$surfacebg" borderColor="$border" borderStyle="round">
  <Text color="$primary" bold>Confirm</Text>
  <Text color="$fg">Are you sure?</Text>
  <TextInput borderColor={focused ? "$focusborder" : "$inputborder"} />
</Box>

<SelectList items={items} color="$primary" />       // already handles selection
<Badge variant="success" color="$success">OK</Badge> // Badge maps variant → color
<Divider color="$muted" />                            // Divider is already dimmed
<ProgressBar value={75} total={100} color="$primary" emptyColor="$muted" />
```

Rebuilding what the component already does. If you're writing `color="$fg"` or `borderColor="$border"`, you're spelling out the default — just remove it. Same goes for SelectList, Badge, Divider, and ProgressBar — they already know how to color themselves.
:::

→ [Components guide](/guides/components) · [Theming reference](/reference/theming)

## 2. Build Hierarchy with Color + Typography

TUIs can't vary font size — bold, dim, and italic are your only typographic tools. That makes color **more important** for hierarchy than in web UIs. Use intentional combinations of color + bold/dim to create clear levels.

| Level           | Style               | Visual effect                                  |
| --------------- | ------------------- | ---------------------------------------------- |
| H1 — Page title | `$primary` + `bold` | Colored, bold — maximum emphasis               |
| H2 — Section    | `$accent` + `bold`  | Contrasting color, bold — distinct from H1     |
| H3 — Group      | `$fg` + `bold`      | Bright, bold — stands out without accent color |
| Body            | `$fg`               | Normal text                                    |
| Meta / caption  | `$muted`            | Dimmed, recedes                                |
| Fine print      | `$muted` + `dim`    | Maximally receded — captions, footnotes        |
| Disabled        | `$disabledfg`       | Faded — clearly inactive                       |

Since TUIs lack font-size variation, using 2-3 colors for heading levels is natural and expected — just use **semantic tokens** (`$primary`, `$accent`, `$fg`) rather than status colors (`$success`, `$error`).

::: tip ✨ Shiny

```tsx
<Text bold color="$primary">Settings</Text>              // H1 — brand color
<Text bold color="$accent">General</Text>                 // H2 — contrasting accent
<Text bold>Appearance</Text>                               // H3 — bold alone
<Text>Use dark colors for the UI</Text>                    // body
<Text color="$muted">Requires restart</Text>              // caption
```

Three heading levels using brand tokens + bold. Each level is visually distinct without borrowing status colors.
:::

::: danger 🩶 Tarnished

```tsx
<Text bold color="$primary">Settings</Text>
<Text bold color="$success">General</Text>       // success ≠ hierarchy
<Text bold color="$error">Appearance</Text>       // error ≠ hierarchy
<Text bold color="$warning">Theme</Text>          // warning ≠ hierarchy
```

Status colors for heading hierarchy — "green heading" looks like success, "red heading" looks like an error. Use brand/accent tokens for hierarchy, reserve status tokens for meaning.
:::

::: tip ✨ Shiny — Typography presets
Use the built-in typography presets (inspired by [shadcn/ui](https://ui.shadcn.com/docs/components/typography)) instead of remembering which combination of color + bold to use:

```tsx
import { H1, H2, H3, Muted, Small, Lead, Code, Blockquote, P, LI } from "silvery"

<H1>Settings</H1>                    // $primary + bold
<H2>General</H2>                      // $accent + bold
<H3>Appearance</H3>                   // bold
<P>Use dark colors for the UI.</P>    // plain body text
<Muted>Requires restart</Muted>       // $muted
<Small>Last updated 2 hours ago</Small> // $muted + dim
<Lead>Welcome to the app</Lead>       // italic
<Code>npm install silvery</Code>      // $mutedbg background
<Blockquote>Less is more.</Blockquote> // │ border + italic
<LI>First item</LI>                   // • bullet
<LI>Second item</LI>
```

Zero color props — the presets handle it. This is the easiest way to get correct hierarchy.
:::

→ [Typography reference](/components/typography) · [Text reference](/api/text) · [Theme tokens](/reference/theming#token-reference)

## 3. Use Tokens for Meaning, Not Decoration

Every `$token` carries semantic weight. Users learn that green means success and red means error. When you borrow those colors for decoration, you train users to ignore them.

Two special-purpose text tokens for interactive elements:

| Token      | Use for                                                        |
| ---------- | -------------------------------------------------------------- |
| `$link`    | Hyperlinks, clickable references                               |
| `$control` | Interactive chrome — prompts, keyboard shortcuts, input labels |

::: tip ✨ Shiny

```tsx
<Text color="$success">✓ Tests passed</Text>           // actually means success
<Text color="$error">✗ Build failed</Text>              // actually means error
<Text color="$control">❯</Text>                         // interactive prompt
<Link href={url}>documentation</Link>                    // auto $link
<Text color="$warning">⚠ Rate limit exceeded</Text>      // actually a warning
<Text color="$info">ℹ 3 items updated</Text>              // informational
<Text color="$control">Tab</Text>                         // keyboard shortcut label
<Text color="$link" underline>docs.silvery.dev</Text>      // clickable
```

Each color matches its meaning. A new user knows what green and red mean without reading docs. `$control` marks interactive chrome — prompts, shortcuts, labels. `$link` marks clickable text.
:::

::: danger 🩶 Tarnished

```tsx
<Text color="$success">Agent</Text>             // agent name ≠ success
<Box outlineColor="$success">                   // decorative border ≠ success
<Text color="$error">Delete</Text>              // missing icon — is this an error or a button?
<Text color="$link">Not a link</Text>            // blue non-interactive text confuses users
<Text color="$warning">Settings</Text>           // heading ≠ warning
<Text color="$info">Username</Text>              // label ≠ info
<Text color="$control">Loading...</Text>          // status ≠ control
<Text color="$primary">✓ Saved</Text>             // completion ≠ brand
```

When status colors are used for decoration, actual status signals get lost in the noise. "Settings" isn't a warning, "Username" isn't info, "Loading..." isn't interactive chrome, and "Saved" is a success — not a brand moment.
:::

→ [Theme tokens](/reference/theming#token-reference) · [Badge component](/guides/components#badge)

## 4. Always Pair Surfaces

Every surface background has a matching text token. Set both or set neither — never gamble on contrast.

::: info ThemeProvider handles foreground automatically
`<ThemeProvider theme={t}>` wraps children in a `<Box color="$fg">` by default, so all text inherits the theme's foreground. You still need to set `backgroundColor="$bg"` on your own root Box (where you set border, overflow, etc.). Pass `root={false}` to opt out of the wrapper (useful for tests).
:::

| Background   | Text       | Use for                 |
| ------------ | ---------- | ----------------------- |
| `$bg`        | `$fg`      | Default app background  |
| `$surfacebg` | `$surface` | Panels, dialogs, cards  |
| `$popoverbg` | `$popover` | Tooltips, dropdowns     |
| `$inversebg` | `$inverse` | Status bars, title bars |
| `$mutedbg`   | `$fg`      | Hover highlights        |

::: tip ✨ Shiny

```tsx
<Box backgroundColor="$surfacebg">
  <Text color="$surface">Dialog content</Text>
</Box>

<Box backgroundColor="$inversebg">
  <Text color="$inverse">main • 3 files changed</Text>
</Box>

<Box backgroundColor="$popoverbg">
  <Text color="$popover">Tooltip: press Ctrl+K for commands</Text>
</Box>

<Box backgroundColor="$mutedbg">
  <Text>Highlighted row</Text>
</Box>
```

Each background is paired with its text token. Contrast is guaranteed across all themes. `$mutedbg` pairs with `$fg` (the default), so no explicit text token is needed there.
:::

::: danger 🩶 Tarnished

```tsx
<Box backgroundColor="$surfacebg">
  <Text>Content</Text>
</Box>

<Box backgroundColor="$popoverbg">
  <Text color="$fg">Tooltip text</Text>
</Box>

<Box backgroundColor="$inversebg">
  <Text>Status bar</Text>
</Box>

<Box backgroundColor="$surfacebg">
  <Text color="$inverse">Wrong token</Text>
</Box>
```

`$fg` on `$surfacebg` — might work in your theme, will break in others. `$fg` on `$popoverbg` is the same mistake. `$inversebg` without `$inverse` text, or `$inverse` text on `$surfacebg`, means a token designed for one surface is on another. Always pair explicitly.
:::

→ [Theming reference](/reference/theming#surface-tokens)

## 5. Add Redundant Signals for Status

Color-blind users can't distinguish red from green. In 16-color mode, `$warning` and `$primary` may be the same yellow. **Always pair status colors with icons or text labels.**

| Token      | Icon convention |
| ---------- | --------------- |
| `$success` | ✓ ✔ ◆           |
| `$warning` | ⚠ △             |
| `$error`   | ✗ ✘ ●           |
| `$info`    | ℹ ○             |

::: tip ✨ Shiny

```tsx
<Text color="$success">✓ Tests passed</Text>
<Text color="$error">✗ 3 failures</Text>
<Text color="$warning">⚠ Unsaved changes</Text>
<Text color="$info">ℹ Documentation updated</Text>
<Text color="$success">◆ Build #247 — all green</Text>
<Text color="$error">● Connection refused — retry in 5s</Text>
```

Works in monochrome. Works for color-blind users. The icon carries the meaning even without color. Each status has a distinct icon shape (✓ ✗ ⚠ ℹ ◆ ●), so they're distinguishable even in a 16-color terminal where colors may collide.
:::

::: danger 🩶 Tarnished

```tsx
<Text color="$success">Tests passed</Text>
<Text color="$error">3 failures</Text>
<Text color="$warning">Unsaved changes</Text>

<Badge variant="success" />                       // badge with no label — just a green dot
<Text color="$error" bold>FAILED</Text>            // color-only, no icon
<Box borderColor="$warning" borderStyle="round">   // warning border, no text/icon explanation
  <Text>Session expiring</Text>
</Box>
```

In a 16-color terminal, these might all look yellow. Without icons, there's no way to tell them apart. A color-only badge is invisible to color-blind users. Bold text alone doesn't convey status. A warning border with no icon or label inside forces the user to infer meaning from the border color alone.
:::

→ [Badge component](/guides/components#badge) · [Terminal constraints](/reference/theming#progressive-enhancement)

## 6. Use `$accent` for Contrast, Not Hierarchy

`$accent` is the **complement** of `$primary` — a contrasting hue for momentary attention. In truecolor themes, it's the color wheel opposite of primary. Use it when something needs to pop _against_ the brand color without implying status.

| Good use                                    | Why `$accent`           | Why not something else               |
| ------------------------------------------- | ----------------------- | ------------------------------------ |
| "New" / "Beta" badge                        | Attention, not status   | `$success` implies completion        |
| Notification count                          | Urgent but not an error | `$error` implies failure             |
| Search match highlight                      | Temporary emphasis      | `$primary` already used for headings |
| Active tab (when `$primary` is the heading) | Distinct from heading   | Two `$primary` elements compete      |

::: tip ✨ Shiny

```tsx
<Text bold color="$accent">NEW</Text>                    // badge — pops against brand
<Text color="$accent">●3</Text>                          // notification count
<Text>Found: <Text backgroundColor="$accent" color="$accentfg">query</Text></Text>
<Text bold color="$accent">BETA</Text>                    // feature flag badge
<Text color="$accent">⬤ 12</Text>                        // unread count
<Text bold color="$accent">→</Text>                       // directional attention
```

`$accent` draws the eye to something novel or urgent — distinct from headings and status. Feature flags, unread counts, and directional cues are all "look here" moments that don't imply success, error, or brand.
:::

::: danger 🩶 Tarnished

```tsx
<Text bold color="$accent">Settings</Text>       // heading — use $primary
<Text color="$accent">✓ Done</Text>               // completion — use $success
<Text color="$accent">Name</Text>                 // body text — use $fg
```

If you can't explain why this element needs to contrast with `$primary`, you probably want `$primary` or `$fg` + `bold` instead.
:::

→ [Theme generation](/reference/theming#generatetheme)

## 7. Let Components Handle Borders

Three border tiers exist — structural, interactive, focused — and **components handle the transitions automatically**. You just set `borderStyle`.

| Tier                    | Token          | Applied by                      |
| ----------------------- | -------------- | ------------------------------- |
| Structural              | `$border`      | Box (automatic default)         |
| Interactive (unfocused) | `$inputborder` | TextInput, TextArea (automatic) |
| Focused                 | `$focusborder` | TextInput, TextArea (automatic) |

::: tip ✨ Shiny

```tsx
<TextInput borderStyle="round" />                // auto: $inputborder → $focusborder

<TextArea borderStyle="single" />                 // auto: $inputborder → $focusborder

<Box borderStyle="single">                       // structural — auto $border
  <Text>Panel content</Text>
</Box>

<Box borderStyle="round">                         // structural — auto $border
  <SelectList items={options} />
</Box>
```

Set `borderStyle` and let the component pick the right token. Interactive components get the input/focus tier automatically; plain Boxes get the structural tier.
:::

::: danger 🩶 Tarnished

```tsx
<Box borderColor={focused ? "blue" : "gray"} borderStyle="round">
  <TextInput />
</Box>

<TextInput borderColor="$primary" />              // brand color on input — use defaults

<Box borderColor="$success" borderStyle="round">  // status color for structure — use $border
  <Text>Panel</Text>
</Box>
```

Manual focus switching with hardcoded colors — breaks on every theme. Overriding input borders with `$primary` fights the three-tier system. Using `$success` on a structural border implies status meaning where there is none.
:::

→ [Box reference](/api/box)

## 8. Keep Palette Colors for Data

`$color0`–`$color15` are for **categorization** — tags, calendar colors, chart series, syntax highlighting. They're the 16 ANSI palette colors, themed for visual harmony but not tied to semantic meaning.

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
// Tag labels — assign colors by category
<Text color="$color1">bug</Text>
<Text color="$color4">feature</Text>
<Text color="$color5">docs</Text>
<Text color="$color2">enhancement</Text>

// Calendar colors — each calendar gets a slot
<Text color="$color4">■ Work</Text>
<Text color="$color2">■ Personal</Text>
<Text color="$color5">■ Family</Text>
<Text color="$color3">■ Fitness</Text>

// Git diff — added/removed/modified
<Text color="$color2">+ added line</Text>
<Text color="$color1">- removed line</Text>
<Text color="$color3">~ modified line</Text>

// Syntax highlighting — language tokens
<Text color="$color4">const</Text> <Text color="$color6">name</Text> <Text>=</Text> <Text color="$color2">"silvery"</Text>

// Priority levels in a task list
<Text color="$color1">● P0 Critical</Text>
<Text color="$color3">● P1 High</Text>
<Text color="$color4">● P2 Medium</Text>
<Text color="$color7">● P3 Low</Text>

// Chart series / data visualization
<Text color="$color4">━━━ Revenue</Text>
<Text color="$color2">━━━ Profit</Text>
<Text color="$color1">━━━ Expenses</Text>
```

Data categories — each tag, calendar, diff line, syntax token, priority, or chart series gets a consistent palette slot. The colors carry no semantic meaning beyond "this is category N."
:::

::: danger 🩶 Tarnished

```tsx
// Using palette for UI chrome
<Box borderColor="$color4">                      // UI border — use $border
<Text color="$color1">Error: file not found</Text> // status — use $error

// Using semantic tokens for data categories
<Text color="$success">enhancement</Text>          // tag — use $color2
<Text color="$error">bug</Text>                    // tag — use $color1
<Text color="$warning">pending</Text>              // tag — use $color3

// Mixing palette with semantic for the same purpose
<Text color="$color1">critical</Text>              // palette...
<Text color="$error">error</Text>                  // ...then semantic for same list? Pick one system.
```

Palette colors for UI chrome strips them of their data-categorization role and bypasses semantic meaning. Using `$success`/`$error` for tags trains users to see "bug" as an error state rather than a category. Mixing palette and semantic in the same list is confusing — pick one system and be consistent.
:::

### Assignment Strategies

- **Static mapping**: Assign colors at design time (e.g., "bug" always gets `$color1`). Best for known, stable categories.
- **Dynamic mapping**: Assign colors by index from an array (e.g., `$color${i % 16}`). Best for user-created categories (tags, labels, calendars).
- **Avoid `$color0` and `$color7`**: `$color0` (black) may be invisible on dark themes, `$color7` (white) on light themes. Prefer `$color1`–`$color6` and `$color8`–`$color14` for maximum visibility.

### Truecolor Theming

In truecolor mode, each theme curates the 16 palette colors for visual harmony — equal-weight hues that look cohesive together. The same index may be a vivid red in one theme and a muted rose in another, but the relative relationships (warm/cool, light/dark) are preserved. Your component code stays the same; the theme does the heavy lifting.

→ [Palette reference](/reference/theming#content-palette)

## Quick Reference

### Decision Flowchart

**"What color should this element use?"**

1. **Is there a standard component for this?** → Use it. Don't specify colors.
2. **Is it body text?** → `$fg` (default — don't specify)
3. **Is it secondary/supporting?** → `$muted`
4. **Is it disabled or placeholder?** → `$disabledfg`
5. **Is it a heading?** → `<H1>` / `<H2>` / `<H3>` presets (or `$primary` + bold, `$accent` + bold, bold)
6. **Is it a hyperlink?** → `$link`
7. **Is it interactive chrome (prompt, shortcut)?** → `$control`
8. **Does it indicate success/error/warning?** → `$success` / `$error` / `$warning` + icon
9. **Does it need to pop against the brand color?** → `$accent`
10. **Is it a structural border?** → don't specify (`$border` is automatic)
11. **Is it an input border?** → set `borderStyle` (auto `$inputborder` / `$focusborder`)
12. **Is it an elevated surface?** → `$surfacebg` + `$surface` text
13. **Is it a status/chrome bar?** → `$inversebg` + `$inverse`
14. **Is it a data category?** → `$color0`–`$color15`
15. **None of the above?** → `$fg` or `$muted`. If neither fits, add a token to the theme.

### Smell Summary

| Smell                                               | What it means                                                                  |
| --------------------------------------------------- | ------------------------------------------------------------------------------ |
| `color="$fg"`                                       | Writing the default — remove it                                                |
| `color="red"` or `"#hex"`                           | Hardcoded — use a `$token`                                                     |
| Status tokens (`$success`, `$error`) for headings   | Status colors imply meaning — use `$primary` / `$accent` / `$fg` for hierarchy |
| `borderColor={focused ? ... : ...}`                 | Manual focus switching — let the component handle it                           |
| `backgroundColor` without matching text token       | Unpaired surface — add the matching text token                                 |
| `$success` / `$error` without icon or label         | Color-only status — add redundant text signal                                  |
| `$success` on a border or background for decoration | Misused status — use `$border` or `$primary`                                   |
| `$accent` where `$primary` would work               | Accent is for contrast, not emphasis                                           |
| `$color0`–`$color15` for UI chrome                  | Palette is for data categorization only                                        |
| Specifying colors a component already handles       | Fighting the framework — remove and trust defaults                             |

### Contrast Guarantees

`deriveTheme()` ensures minimum contrast ratios for all derived tokens using `ensureContrast()` — a function that adjusts lightness (preserving hue and saturation) until the target ratio is met. If a token already meets the target, it's returned unchanged.

| Token class                                                                              | Target ratio | Rationale                                          |
| ---------------------------------------------------------------------------------------- | ------------ | -------------------------------------------------- |
| Body text (`$fg`) on all surfaces (`$bg`, `$surface-bg`, `$popover-bg`)                  | 4.5:1 (AA)   | Primary text must be readable everywhere           |
| Muted text (`$muted`) on `$bg` and `$muted-bg`                                           | 4.5:1 (AA)   | Secondary text must be readable                    |
| Disabled text (`$disabled-fg`) on `$bg`                                                  | 3.0:1        | Intentionally dim but visible                      |
| Accent-as-text (`$primary`, `$error`, `$warning`, `$success`, `$info`, `$link`) on `$bg` | 4.5:1 (AA)   | Colored text on root background                    |
| Selection text on selection background                                                   | 4.5:1 (AA)   | Selected text must be readable                     |
| Cursor text on cursor background                                                         | 4.5:1 (AA)   | Text under cursor must be readable                 |
| Borders (`$border`) on `$bg`                                                             | 1.5:1        | Faint structural dividers — visible, not prominent |
| Input borders (`$inputborder`) on `$bg`                                                  | 3.0:1        | WCAG 1.4.11 non-text minimum for controls          |

**How it works**: Tokens start from their aesthetic blend or palette color. If the resulting contrast against the background is below the target, `ensureContrast()` shifts lightness in HSL space (darken for light backgrounds, lighten for dark) using binary search to find the minimum adjustment. The color stays recognizable — only lightness changes.

**What it adjusts**: Body text (`$fg`) is ensured against `$popover-bg` (the hardest surface, since it's the most shifted from `$bg`). This guarantees readability on `$bg`, `$surface-bg`, and `$popover-bg` simultaneously. For palettes with low fg/bg contrast (like Tokyo Night Day), `$fg` gets a minimal lightness shift to reach AA.

### Terminal Notes

- **No transparency**: Every color is solid. Use `$mutedbg` for hover instead of opacity.
- **dim attribute**: `$muted` may use ANSI dim in 16-color mode — don't use it for critical info.
- **16-color fallback**: Status colors may map to the same ANSI color. Always pair with icons.
- **Progressive enhancement**: Same vocabulary works ANSI 16 → 256 → truecolor.
- **Vibrancy/saturation**: Apple-style super-saturated colors (like macOS window tints or iOS label colors) don't translate to terminals. Terminal colors are ANSI — no blur, no transparency, no variable saturation. Design with solid, readable colors. If you want vibrancy, pick a truecolor theme with vivid palette colors (like Catppuccin or Tokyo Night) — the theme does the heavy lifting, not your component code.
