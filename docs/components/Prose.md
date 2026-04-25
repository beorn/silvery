# Prose

Text-wrapping container primitive. Drop-in replacement for the hand-rolled `<Box flexDirection="column" flexShrink={1} minWidth={0}>` pattern around long-form text (markdown, message bodies, paragraphs). Encapsulates the flex chain that lets `<Text wrap="wrap">` actually wrap at the parent's available width.

## Import

```tsx
import { Prose } from "silvery"
```

## Why It Exists

Flexily defaults `flex-shrink` to `0`, and silvery's reconciler does not apply CSS §4.5's "overflow:hidden ⇒ flex-shrink:1" inference rule. Without `flexShrink={1} minWidth={0}` on every box in the chain from a fixed-width ancestor down to a `<Text wrap="wrap">`, an intermediate row or column measures at `sum(children.maxContent)` and the wrappable Text receives that wide measure -- and never wraps.

`Prose` sets the canonical defaults so consumers don't need to remember the incantation:

- `flexDirection: "column"`
- `flexShrink: 1`
- `minWidth: 0`

Any prop can be overridden -- pass `flexGrow={1}` for a row child that should fill, or `flexDirection="row"` if your prose stitches inline runs.

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
  <Text bold color="$primary">●</Text>
  <Prose flexGrow={1}>
    <MarkdownView source={response} />
  </Prose>
</Box>
```

## Anti-pattern this replaces

```tsx
// Hand-rolled — easy to forget one prop in a deeply nested chain
<Box flexDirection="column" flexShrink={1} minWidth={0}>
  <MarkdownView source={text} />
</Box>

// Prose — intent is named, defaults are correct
<Prose>
  <MarkdownView source={text} />
</Prose>
```

## See Also

- [Box](./Box.md) -- the primitive Prose wraps.
- [Text](./Text.md) -- `wrap="wrap"` is the typical leaf inside Prose.
- [typography](./typography.md) -- typography presets (`H1`, `Muted`, `Blockquote`) compose with Prose for full document layouts.
