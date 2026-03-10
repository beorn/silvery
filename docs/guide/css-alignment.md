# W3C CSS Alignment

Silvery's layout engine follows W3C CSS Flexbox specifications more closely than Ink/Yoga in several key areas, while making intentional adaptations for terminal environments.

## More CSS-Correct Than Ink/Yoga

### `flexShrink` Defaults to `1`

The [CSS Flexbox spec (W3C CR)](https://www.w3.org/TR/css-flexbox-1/#flex-shrink-property) defines `flex-shrink` with an initial value of `1`. Silvery follows this:

```tsx
// Silvery: items shrink by default (CSS spec behavior)
<Box flexDirection="row" width={20}>
  <Box width={15}><Text>Shrinks</Text></Box>
  <Box width={15}><Text>Shrinks</Text></Box>
</Box>
// Both items shrink proportionally to fit 20 columns
```

Yoga (used by Ink and React Native) defaults `flexShrink` to `0`, meaning items overflow their container by default. This is a deliberate deviation from the CSS spec that React Native chose for mobile layouts, but it creates surprising behavior in terminal UIs where overflow is often invisible.

```tsx
// Ink/Yoga: items overflow by default (flexShrink: 0)
<Box flexDirection="row" width={20}>
  <Box width={15}><Text>Overflows</Text></Box>
  <Box width={15}><Text>Overflows</Text></Box>
</Box>
// Total 30 columns in a 20-column container -- content clips
```

### `overflow: hidden` with `flexShrink: 0`

CSS [section 4.5](https://www.w3.org/TR/css-flexbox-1/#min-size-auto) specifies that the automatic minimum size of a flex item is `0` when `overflow` is not `visible`. This means `overflow: hidden` combined with `flexShrink: 0` produces a box that respects its container's bounds.

Silvery follows this behavior. Yoga does not consistently apply the auto minimum size rule, which can cause items to overflow their containers even when clipping is expected.

```tsx
// Silvery: overflow hidden + flexShrink 0 works as CSS spec dictates
<Box height={10}>
  <Box flexShrink={0} overflow="hidden" height={20}>
    <Text>Clipped content that respects parent bounds</Text>
  </Box>
</Box>
```

### Position Offsets

Silvery supports `position="absolute"` and `position="relative"` as layout properties, matching CSS positioning:

```tsx
<Box position="relative" width={40} height={10}>
  <Text>Background content</Text>
  <Box position="absolute">
    <Text>Overlaid content</Text>
  </Box>
</Box>
```

Silvery also extends CSS positioning with `position="sticky"` for scroll containers and normal parents, including `stickyTop` and `stickyBottom` offsets.

### Overflow Modes

CSS defines three overflow values. Silvery supports all three:

```tsx
<Box overflow="visible">  {/* Default: content extends beyond bounds */}
<Box overflow="hidden">   {/* Content clipped at box boundaries */}
<Box overflow="scroll">   {/* Content clipped with scroll support */}
```

Ink supports only `visible` and `hidden`. Scrolling -- the [#1 feature request](https://github.com/vadimdemedes/ink/issues/222) since 2019 -- requires manual virtualization.

## Intentional TUI Adaptations

### `flexDirection` Defaults to `column`

CSS defaults `flex-direction` to `row` (horizontal). Silvery defaults to `column` (vertical). This is a conscious choice: terminals are portrait-oriented -- text flows top-to-bottom, and most TUI layouts stack elements vertically. The override is trivial:

```tsx
// Vertical stack (silvery default -- no prop needed)
<Box>
  <Text>Top</Text>
  <Text>Bottom</Text>
</Box>

// Horizontal row (explicit)
<Box flexDirection="row">
  <Text>Left</Text>
  <Text>Right</Text>
</Box>
```

Ink defaults to `row` because it inherited Yoga's web-oriented defaults. Silvery's Ink compatibility layer (`silvery/ink`) restores `row` as the default for migration.

### Box-in-Text Nesting

CSS strictly separates block and inline formatting contexts. A `<div>` inside a `<span>` is technically invalid HTML. Silvery is more permissive: nesting a Box inside Text produces a warning rather than an error, since terminal layouts frequently mix block and inline content in ways that would violate strict W3C rules.

## Comparison Table

| Property | CSS Spec | Silvery | Ink/Yoga |
|---|---|---|---|
| `flexShrink` default | `1` | `1` | `0` |
| `flexDirection` default | `row` | `column` (TUI adaptation) | `row` |
| `overflow` values | `visible`, `hidden`, `scroll`, `auto` | `visible`, `hidden`, `scroll` | `visible`, `hidden` |
| Auto min-size when `overflow: hidden` | `0` (CSS 4.5) | Follows spec | Inconsistent |
| `position` values | `static`, `relative`, `absolute`, `fixed`, `sticky` | `relative`, `absolute`, `sticky` | `relative`, `absolute` |
| `gap` | Supported | Supported | Not supported (Ink) |
| `display: none` | Supported | Supported | Supported |
| `flexWrap` | Supported | Supported | Supported |
| `alignItems` / `justifyContent` | Supported | Supported | Supported |

### Reading the Table

- **Silvery matches CSS spec** on `flexShrink`, overflow behavior, and auto minimum sizing.
- **Silvery adapts CSS** for terminals with `flexDirection: column` default and permissive nesting.
- **Ink/Yoga deviates from CSS** on `flexShrink` default (React Native convention), lacks scroll overflow, and does not support `gap`.

::: tip For Ink Migrators
Import from `silvery/ink` to get Ink-compatible defaults (`flexDirection: row`, `flexShrink: 1`). When you are ready, switch to `silvery` imports and add explicit `flexDirection="row"` where needed.
:::
