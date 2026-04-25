# Prose

Optional typography sugar around long-form text (markdown, message bodies, paragraphs). Documents intent ("this content is long-form text") and provides column-stacking defaults. Wrap chains work without `<Prose>` — silvery's CSS-correct flex defaults handle wrap automatically.

## Import

```tsx
import { Prose } from "silvery"
```

## Status: optional sugar

silvery uses CSS-correct flex defaults (`flexShrink: 1`, `alignContent: stretch`, plus CSS §4.5 flex-item auto min-size). Wrap chains work without ceremony — both forms below produce the same wrapping behavior:

```tsx
// Both work — choose Prose for typography intent
<Box flexDirection="column">
  <MarkdownView source={text} />
</Box>

<Prose>
  <MarkdownView source={text} />
</Prose>
```

Use `<Prose>` when the surrounding context benefits from a named "this is prose" boundary (e.g., when typography presets like `H1`, `Muted`, `Blockquote` are nested inside).

## History

Before silvery's CSS-defaults flip (April 2026), flexily defaulted `flex-shrink: 0` (Yoga semantics). Without `flexShrink={1} minWidth={0}` on every box in the chain from a fixed-width ancestor down to a `<Text wrap="wrap">`, an intermediate row/column measured at `sum(children.maxContent)` and the wrappable Text never wrapped. `<Prose>` was created as a named primitive so consumers didn't have to remember that incantation. The flip to CSS-correct defaults plus flexily's auto min-size implementation made the chain unnecessary; `<Prose>` survives as a typography primitive.

## Defaults

- `flexDirection: "column"` — paragraphs stack vertically.

Other flex props (`flexShrink: 1`, `alignContent: stretch`, auto min-size) come from silvery's CSS-correct defaults; `<Prose>` doesn't need to set them. Any prop can be overridden — pass `flexGrow={1}` for a row child that should fill, or `flexDirection="row"` if your prose stitches inline runs.

## Props

`ProseProps` extends [`BoxProps`](./Box.md), so every Box prop is available. The defaults above apply unless a caller-provided prop overrides them.

## Examples

### Wrapping a markdown view

```tsx
import { Prose } from "silvery"
import { MarkdownView } from "./MarkdownView"

<Prose>
  <MarkdownView source={longMarkdown} />
</Prose>
```

### Wrapping multiple paragraphs

```tsx
<Prose gap={1} paddingX={1}>
  <Text wrap="wrap">{paragraph1}</Text>
  <Text wrap="wrap">{paragraph2}</Text>
</Prose>
```

### Inside a flex row

```tsx
<Box flexDirection="row" gap={1}>
  <Text bold color="$fg-accent">●</Text>
  <Prose flexGrow={1}>
    <MarkdownView source={response} />
  </Prose>
</Box>
```

## Historical anti-pattern (now obsolete)

Pre-CSS-defaults, the wrap chain required threading `flexShrink={1} minWidth={0}` from any fixed-width ancestor down to wrappable text:

```tsx
// ❌ Pre-flip (Yoga defaults) — easy to forget one prop in a deep chain
<Box flexDirection="column" flexShrink={1} minWidth={0}>
  <MarkdownView source={text} />
</Box>
```

Both forms now wrap correctly — `<Prose>` survives as documentation of typography intent, not as a wrap-enablement primitive.

## See Also

- [Box](./Box.md) -- the primitive Prose wraps.
- [Text](./Text.md) -- `wrap="wrap"` is the typical leaf inside Prose.
- [typography](./typography.md) -- typography presets (`H1`, `Muted`, `Blockquote`) compose with Prose for full document layouts.
