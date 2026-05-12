# Text

The primitive for rendering text content. Supports styling (colors, bold, italic, etc.), text wrapping/truncation modes, and nested Text elements for inline style changes.

## Import

```tsx
import { Text } from "silvery"
```

## Props

`TextProps` extends `StyleProps`, `TestProps`, and `MouseEventProps`.

| Prop              | Type                                                                                                                      | Default  | Description                                            |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------ |
| `children`        | `ReactNode`                                                                                                               | --       | Text content (string, number, or nested Text elements) |
| `color`           | `string`                                                                                                                  | --       | Foreground color (name, hex, or `$token`)              |
| `backgroundColor` | `string`                                                                                                                  | --       | Background color                                       |
| `bold`            | `boolean`                                                                                                                 | --       | Bold text                                              |
| `dim`             | `boolean`                                                                                                                 | --       | Dim text                                               |
| `dimColor`        | `boolean`                                                                                                                 | --       | Dim text (alias, Ink compatibility)                    |
| `italic`          | `boolean`                                                                                                                 | --       | Italic text                                            |
| `underline`       | `boolean`                                                                                                                 | --       | Enable underline                                       |
| `underlineStyle`  | `"single" \| "double" \| "curly" \| "dotted" \| "dashed" \| false`                                                        | --       | Underline style variant                                |
| `underlineColor`  | `string`                                                                                                                  | --       | Underline color                                        |
| `strikethrough`   | `boolean`                                                                                                                 | --       | Strikethrough text                                     |
| `inverse`         | `boolean`                                                                                                                 | --       | Inverse (swap fg/bg)                                   |
| `wrap`            | `"wrap" \| "wrap-truncate" \| "truncate" \| "truncate-start" \| "truncate-middle" \| "truncate-end" \| "clip" \| boolean` | `"wrap"` | Text wrapping/truncation mode                          |

### Ref: TextHandle

```ts
interface TextHandle {
  getNode(): AgNode | null
}
```

## Usage

```tsx
// Basic text
<Text>Hello, world!</Text>

// Colored text
<Text color="green">Success!</Text>
<Text color="#ff6600">Orange text</Text>

// Styled text
<Text bold>Important</Text>
<Text italic underline>Emphasized</Text>

// Combined styles
<Text color="red" bold inverse>Alert!</Text>

// Nested text with different styles
<Text>
  Normal <Text bold>bold</Text> normal
</Text>

// Truncation modes
<Text wrap="truncate">This long text will be truncated...</Text>
<Text wrap="truncate-middle">Long...text</Text>

// Semantic theme colors (Sterling)
<Text color="$fg-accent">Brand emphasis</Text>
<Text color="$fg-muted">Secondary info</Text>
```

## Wrap modes — what each one does

`wrap` is the only knob today. Each mode bundles three CSS-equivalent axes (`white-space`, `overflow-wrap`, `text-overflow`) into one named composite. The CSS column is the canonical reference for what each mode actually does — useful when porting from web/Polaris and when reasoning about the upcoming canvas/DOM targets (silvery is a multi-target framework; the modes are designed to map cleanly).

| `wrap=`             | Behavior                                                                                                                                                                                                                                                                                                                                                                                                                                                  | CSS-equivalent axes                                                                                    |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `"wrap"` (default)  | Multi-line word wrap. Breaks at word boundaries (space, hyphen). Falls back to soft-break separators (`/`, `\`, `.`, `_`, `:`, `,`) for long path-style tokens. Last-resort character wrap when no separator fits.                                                                                                                                                                                                                                        | `white-space: normal` + `overflow-wrap: break-word`                                                    |
| `"wrap-truncate"`   | Multi-line word wrap with ellipsis fallback. Same as `"wrap"` but when an unbreakable atomic token (no soft-break separators) would otherwise character-wrap, the offending line ends with `…` and the rest of that token is dropped. Subsequent text continues wrapping from the next word boundary. Use for body text where information loss is preferable to mid-token character wrapping (e.g. card bodies that contain occasional long identifiers). | `white-space: normal` + `overflow-wrap: break-word` + `text-overflow: ellipsis`                        |
| `"truncate"`        | Single-line. Trims at end with `…` ellipsis when content exceeds available width.                                                                                                                                                                                                                                                                                                                                                                         | `white-space: nowrap` + `overflow: hidden` + `text-overflow: ellipsis`                                 |
| `"truncate-end"`    | Alias of `"truncate"` — explicit "trim at end".                                                                                                                                                                                                                                                                                                                                                                                                           | `white-space: nowrap` + `overflow: hidden` + `text-overflow: ellipsis`                                 |
| `"truncate-start"`  | Single-line. Trims at start with `…` prefix.                                                                                                                                                                                                                                                                                                                                                                                                              | (no direct CSS analogue; named composite — equivalent to `direction: rtl` + `text-overflow: ellipsis`) |
| `"truncate-middle"` | Single-line. Trims in the middle (e.g. `path/to/.../file.md`). Useful for long paths where both ends matter.                                                                                                                                                                                                                                                                                                                                              | (no direct CSS analogue; named composite)                                                              |
| `"clip"`            | Single-line. Hard clips at right edge **without** ellipsis. Use only when the truncation marker would itself be misleading (e.g. tabular cells).                                                                                                                                                                                                                                                                                                          | `white-space: nowrap` + `overflow: hidden` + `text-overflow: clip`                                     |
| `false`             | No wrapping, no clipping. Text overflows its container. **Avoid** in bordered cells; use `"wrap"` or `"truncate"` instead.                                                                                                                                                                                                                                                                                                                                | `white-space: nowrap` + `overflow: visible`                                                            |

### Picking a mode

- **Body text** (paragraphs, descriptions, list items) → `"wrap"` (default).
- **Bordered card bodies** that may contain occasional long identifiers (UUIDs, hashes, paste-bin output) → `"wrap-truncate"`. Wraps prose normally, ellipsis-truncates atomic tokens that would otherwise character-wrap and look like garbled text.
- **Titles and labels in fixed-width chrome** (status bars, table headers, card titles) → `"truncate"`.
- **File paths** that need both ends visible → `"truncate-middle"`.
- **Numeric or tabular cells** where `…` would be confused with content → `"clip"`.
- **Never** `wrap={false}` inside a bordered Box — it produces the "text painted past border" failure shape that selected backgrounds amplify.

### Soft-break separators in `"wrap"` mode

Long path-style or identifier tokens like `.claude/skills/{claim,do}/SKILL.md` are unbreakable from a pure word-boundary perspective. `"wrap"` breaks them at the SECONDARY break points `/`, `\`, `.`, `_`, `:`, `,` (after the separator) — `path/` ends one line, `to` starts the next. Brackets and parens (`{` `}` `[` `]` `(` `)`) are **not** soft breaks — paired delimiters shouldn't be orphaned, matching CSS behavior.

For atomic tokens with no separators (e.g. `aaaaaaaaaaaaaaaaaaaa`), `"wrap"` falls back to character wrap (the token spans multiple lines). If you'd prefer `…` truncation in that case, use `"wrap-truncate"`: the wrap algorithm is the same, but when an unbreakable token would otherwise character-wrap, the offending line ends with `…` and the rest of that token is dropped. Subsequent text after the next word boundary continues wrapping normally — only the offending atomic run is truncated, not the entire text. Tracked: `@km/silvery/card-body-truncate-ellipsis` (closed) and `@km/silvery/css-aligned-wrap-overflow-terminology`.

## See Also

- [Box](./Box.md) -- layout container
- [Typography](./typography.md) -- semantic text presets (H1, H2, P, etc.)
