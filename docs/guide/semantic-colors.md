# Semantic Colors

_How to color the shiniest Silvery apps_

Colors tarnish fast. A hardcoded `"red"` here, a `"$success"` where you meant "brand emphasis" there — suddenly your UI is a patchwork that breaks on every theme. These principles keep your colors **shiny**.

## 1. Don't Specify Colors

Most Silvery components already use the correct semantic colors by default. **The best color code is no color code.**

| Component | What's automatic |
| --- | --- |
| `<Text>` | `$fg` text color |
| `<TextInput>` | `$inputborder` → `$focusborder` on focus, `$control` prompt, cursor |
| `<TextArea>` | `$inputborder` → `$focusborder` on focus |
| `<ModalDialog>` | `$surfacebg` bg, `$border` border, `$primary` title |
| `<CommandPalette>` | `$surfacebg` bg, `$border` border |
| `<Toast>` | `$surfacebg` bg, `$border` border |
| `<SelectList>` | `inverse` for selection, `dimColor` for disabled |
| `<Badge>` | Variant colors: `$success`, `$error`, `$warning`, `$primary` |
| `<ErrorBoundary>` | `$error` border |
| `<Divider>` | `dimColor` for line character |
| `<ProgressBar>` | `dimColor` for empty portion |
| `<Spinner>` | `$fg` |
| `<Button>` | `inverse` when focused/active |

::: tip ✨ Shiny
```tsx
<ModalDialog title="Confirm">
  <Text>Are you sure?</Text>
</ModalDialog>

<TextInput borderStyle="round" />
```
Zero color props. The modal gets `$surfacebg`, `$border`, `$primary` title. The input gets `$inputborder` → `$focusborder` on focus. All automatic.
:::

::: danger 🩶 Tarnished
```tsx
<Box backgroundColor="$surfacebg" borderColor="$border" borderStyle="round">
  <Text color="$primary" bold>Confirm</Text>
  <Text color="$fg">Are you sure?</Text>
  <TextInput borderColor={focused ? "$focusborder" : "$inputborder"} />
</Box>
```
Rebuilding what the component already does. If you're writing `color="$fg"` or `borderColor="$border"`, you're spelling out the default — just remove it.
:::

→ [Components guide](/guides/components) · [Theming reference](/reference/theming)

## 2. Build Hierarchy with Color + Typography

TUIs can't vary font size — bold, dim, and italic are your only typographic tools. That makes color **more important** for hierarchy than in web UIs. Use intentional combinations of color + bold/dim to create clear levels.

| Level | Style | Visual effect |
| --- | --- | --- |
| H1 — Page title | `$primary` + `bold` | Colored, bold — maximum emphasis |
| H2 — Section | `$accent` + `bold` | Contrasting color, bold — distinct from H1 |
| H3 — Group | `$fg` + `bold` | Bright, bold — stands out without accent color |
| Body | `$fg` | Normal text |
| Meta / caption | `$muted` | Dimmed, recedes |
| Disabled | `$disabledfg` | Faded — clearly inactive |

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

::: info 💡 Future: Typography presets
We plan to add typography preset components (similar to [shadcn/ui](https://ui.shadcn.com/docs/components/typography)'s `<H1>`, `<H2>`, `<Muted>`, `<Lead>`) so you don't need to remember which combination of color + bold to use:

```tsx
// Planned API — not yet available
<H1>Settings</H1>           // auto: $primary + bold
<H2>General</H2>             // auto: $accent + bold
<H3>Appearance</H3>          // auto: $fg + bold
<Muted>Requires restart</Muted>  // auto: $muted
<Lead>Welcome to the app</Lead>  // auto: $fg + italic
```
Until then, use the color + typography combinations from the table above.
:::

→ [Text reference](/api/text) · [Theme tokens](/reference/theming#token-reference)

## 3. Use Tokens for Meaning, Not Decoration

Every `$token` carries semantic weight. Users learn that green means success and red means error. When you borrow those colors for decoration, you train users to ignore them.

Two special-purpose text tokens for interactive elements:

| Token | Use for |
| --- | --- |
| `$link` | Hyperlinks, clickable references |
| `$control` | Interactive chrome — prompts, keyboard shortcuts, input labels |

::: tip ✨ Shiny
```tsx
<Text color="$success">✓ Tests passed</Text>           // actually means success
<Text color="$error">✗ Build failed</Text>              // actually means error
<Text color="$control">❯</Text>                         // interactive prompt
<Link href={url}>documentation</Link>                    // auto $link
```
Each color matches its meaning. A new user knows what green and red mean without reading docs.
:::

::: danger 🩶 Tarnished
```tsx
<Text color="$success">Agent</Text>             // agent name ≠ success
<Box outlineColor="$success">                   // decorative border ≠ success
<Text color="$error">Delete</Text>              // missing icon — is this an error or a button?
<Text color="$link">Not a link</Text>            // blue non-interactive text confuses users
```
When status colors are used for decoration, actual status signals get lost in the noise.
:::

→ [Theme tokens](/reference/theming#token-reference) · [Badge component](/guides/components#badge)

## 4. Always Pair Surfaces

Every surface background has a matching text token. Set both or set neither — never gamble on contrast.

| Background | Text | Use for |
| --- | --- | --- |
| `$bg` | `$fg` | Default app background |
| `$surfacebg` | `$surface` | Panels, dialogs, cards |
| `$popoverbg` | `$popover` | Tooltips, dropdowns |
| `$inversebg` | `$inverse` | Status bars, title bars |
| `$mutedbg` | `$fg` | Hover highlights |

::: tip ✨ Shiny
```tsx
<Box backgroundColor="$surfacebg">
  <Text color="$surface">Dialog content</Text>
</Box>

<Box backgroundColor="$inversebg">
  <Text color="$inverse">main • 3 files changed</Text>
</Box>
```
Each background is paired with its text token. Contrast is guaranteed across all themes.
:::

::: danger 🩶 Tarnished
```tsx
<Box backgroundColor="$surfacebg">
  <Text>Content</Text>
</Box>
```
`$fg` on `$surfacebg` — might work in your theme, will break in others. Always pair explicitly.
:::

→ [Theming reference](/reference/theming#surface-tokens)

## 5. Add Redundant Signals for Status

Color-blind users can't distinguish red from green. In 16-color mode, `$warning` and `$primary` may be the same yellow. **Always pair status colors with icons or text labels.**

| Token | Icon convention |
| --- | --- |
| `$success` | ✓ ✔ ◆ |
| `$warning` | ⚠ △ |
| `$error` | ✗ ✘ ● |
| `$info` | ℹ ○ |

::: tip ✨ Shiny
```tsx
<Text color="$success">✓ Tests passed</Text>
<Text color="$error">✗ 3 failures</Text>
<Text color="$warning">⚠ Unsaved changes</Text>
```
Works in monochrome. Works for color-blind users. The icon carries the meaning even without color.
:::

::: danger 🩶 Tarnished
```tsx
<Text color="$success">Tests passed</Text>
<Text color="$error">3 failures</Text>
<Text color="$warning">Unsaved changes</Text>
```
In a 16-color terminal, these might all look yellow. Without icons, there's no way to tell them apart.
:::

→ [Badge component](/guides/components#badge) · [Terminal constraints](/reference/theming#progressive-enhancement)

## 6. Use `$accent` for Contrast, Not Hierarchy

`$accent` is the **complement** of `$primary` — a contrasting hue for momentary attention. In truecolor themes, it's the color wheel opposite of primary. Use it when something needs to pop _against_ the brand color without implying status.

| Good use | Why `$accent` | Why not something else |
| --- | --- | --- |
| "New" / "Beta" badge | Attention, not status | `$success` implies completion |
| Notification count | Urgent but not an error | `$error` implies failure |
| Search match highlight | Temporary emphasis | `$primary` already used for headings |
| Active tab (when `$primary` is the heading) | Distinct from heading | Two `$primary` elements compete |

::: tip ✨ Shiny
```tsx
<Text bold color="$accent">NEW</Text>                    // badge — pops against brand
<Text color="$accent">●3</Text>                          // notification count
<Text>Found: <Text backgroundColor="$accent" color="$accentfg">query</Text></Text>
```
`$accent` draws the eye to something novel or urgent — distinct from headings and status.
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

| Tier | Token | Applied by |
| --- | --- | --- |
| Structural | `$border` | Box (automatic default) |
| Interactive (unfocused) | `$inputborder` | TextInput, TextArea (automatic) |
| Focused | `$focusborder` | TextInput, TextArea (automatic) |

::: tip ✨ Shiny
```tsx
<TextInput borderStyle="round" />                // auto: $inputborder → $focusborder

<Box borderStyle="single">                       // structural — auto $border
  <Text>Panel content</Text>
</Box>
```
:::

::: danger 🩶 Tarnished
```tsx
<Box borderColor={focused ? "blue" : "gray"} borderStyle="round">
  <TextInput />
</Box>
```
Manual focus switching with hardcoded colors — breaks on every theme.
:::

→ [TextInput reference](/api/text-input) · [Box reference](/api/box)

## 8. Keep Palette Colors for Data

`$color0`–`$color15` are for **categorization** — tags, calendar colors, chart series, syntax highlighting. They're the 16 ANSI palette colors, themed for visual harmony but not tied to semantic meaning.

::: tip ✨ Shiny
```tsx
<Text color="$color1">bug</Text>
<Text color="$color4">feature</Text>
<Text color="$color5">docs</Text>
```
Data categories — each tag gets a consistent palette slot.
:::

::: danger 🩶 Tarnished
```tsx
<Box borderColor="$color4">                      // UI border — use $border
<Text color="$color1">Error occurred</Text>       // status — use $error
```
Palette colors for UI chrome strips them of their data-categorization role and bypasses semantic meaning.
:::

→ [Palette reference](/reference/theming#content-palette)

## Quick Reference

### Decision Flowchart

**"What color should this element use?"**

1. **Is there a standard component for this?** → Use it. Don't specify colors.
2. **Is it body text?** → `$fg` (default — don't specify)
3. **Is it secondary/supporting?** → `$muted`
4. **Is it disabled or placeholder?** → `$disabledfg`
5. **Is it a heading?** → `$primary` + bold (H1), `$accent` + bold (H2), bold (H3)
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

| Smell | What it means |
| --- | --- |
| `color="$fg"` | Writing the default — remove it |
| `color="red"` or `"#hex"` | Hardcoded — use a `$token` |
| Status tokens (`$success`, `$error`) for headings | Status colors imply meaning — use `$primary` / `$accent` / `$fg` for hierarchy |
| `borderColor={focused ? ... : ...}` | Manual focus switching — let the component handle it |
| `backgroundColor` without matching text token | Unpaired surface — add the matching text token |
| `$success` / `$error` without icon or label | Color-only status — add redundant text signal |
| `$success` on a border or background for decoration | Misused status — use `$border` or `$primary` |
| `$accent` where `$primary` would work | Accent is for contrast, not emphasis |
| `$color0`–`$color15` for UI chrome | Palette is for data categorization only |
| Specifying colors a component already handles | Fighting the framework — remove and trust defaults |

### Terminal Notes

- **No transparency**: Every color is solid. Use `$mutedbg` for hover instead of opacity.
- **dim attribute**: `$muted` may use ANSI dim in 16-color mode — don't use it for critical info.
- **16-color fallback**: Status colors may map to the same ANSI color. Always pair with icons.
- **Progressive enhancement**: Same vocabulary works ANSI 16 → 256 → truecolor.
