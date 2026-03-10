# Text

Renders styled text. Supports ANSI escape codes and Chalk strings.

## Import

```tsx
import { Text } from "silvery";
```

## Usage

```tsx
<Text color="green" bold>
  Success!
</Text>
```

## Props

| Prop              | Type                                                                              | Default      | Description                    |
| ----------------- | --------------------------------------------------------------------------------- | ------------ | ------------------------------ |
| `color`           | `string`                                                                          | -            | Text color (named or hex)      |
| `backgroundColor` | `string`                                                                          | -            | Background color               |
| `bold`            | `boolean`                                                                         | `false`      | Bold text                      |
| `italic`          | `boolean`                                                                         | `false`      | Italic text                    |
| `underline`       | `boolean`                                                                         | `false`      | Underlined text                |
| `strikethrough`   | `boolean`                                                                         | `false`      | Strikethrough text             |
| `dimColor`        | `boolean`                                                                         | `false`      | Dimmed color                   |
| `inverse`         | `boolean`                                                                         | `false`      | Swap foreground and background |
| `wrap`            | `"wrap" \| "truncate" \| "truncate-start" \| "truncate-middle" \| "truncate-end"` | `"truncate"` | How to handle overflow         |

## Colors

### Named Colors

```tsx
<Text color="red">Red text</Text>
<Text color="green">Green text</Text>
<Text color="blue">Blue text</Text>
<Text color="yellow">Yellow text</Text>
<Text color="magenta">Magenta text</Text>
<Text color="cyan">Cyan text</Text>
<Text color="white">White text</Text>
<Text color="gray">Gray text</Text>
```

### Hex Colors

```tsx
<Text color="#ff6600">Orange text</Text>
<Text color="#663399">Purple text</Text>
```

### Background Colors

```tsx
<Text backgroundColor="blue" color="white">White on blue</Text>
<Text backgroundColor="#ff0000">Red background</Text>
```

## Text Styles

```tsx
// Bold
<Text bold>Bold text</Text>

// Italic
<Text italic>Italic text</Text>

// Underline
<Text underline>Underlined text</Text>

// Strikethrough
<Text strikethrough>Crossed out</Text>

// Dim
<Text dimColor>Dimmed text</Text>

// Inverse (swap fg/bg)
<Text inverse>Inverted colors</Text>

// Combined
<Text bold italic underline color="green">
  Bold italic underlined green
</Text>
```

## Text Wrapping

By default, Text truncates at the container boundary (Silvery improvement over Ink).

### Truncation Modes

```tsx
// Truncate at end (default)
<Box width={15}>
  <Text wrap="truncate">This is a long text</Text>
</Box>
// Output: "This is a lon…"

// Truncate at start
<Box width={15}>
  <Text wrap="truncate-start">This is a long text</Text>
</Box>
// Output: "…s a long text"

// Truncate in middle
<Box width={15}>
  <Text wrap="truncate-middle">This is a long text</Text>
</Box>
// Output: "This i…ng text"

// Wrap to multiple lines
<Box width={15}>
  <Text wrap="wrap">This is a long text</Text>
</Box>
// Output:
// "This is a long"
// "text"
```

## Nested Text Elements

Text elements can be nested, with child styles properly overriding and then restoring parent styles:

```tsx
// Child color overrides parent, then restores
<Text color="black">
  before <Text color="red">RED</Text> after
</Text>
// Output: black "before ", red "RED", black " after"

// Parent bold + white, child adds dim for count
<Text bold color="white">
  Title<Text dimColor> (5)</Text> more
</Text>
// Output: bold white "Title", bold white dim " (5)", bold white " more"

// Deep nesting with proper restoration
<Text color="white">
  W<Text color="red">R<Text color="blue">B</Text>R</Text>W
</Text>
// Output: white "W", red "R", blue "B", red "R", white "W"
```

This is an Silvery improvement over Ink. Nested styles use a push/pop mechanism that properly restores parent styles after each nested element.

## Chalk Compatibility

Text preserves Chalk ANSI escape codes:

```tsx
import chalk from "chalk";

<Text>
  {chalk.red("Red")} and {chalk.blue.bold("bold blue")}
</Text>

// Mixed styles
<Text color="green">
  Green with {chalk.yellow("yellow")} inside
</Text>
```

## Examples

### Status Indicator

```tsx
function Status({ type, message }: { type: "success" | "error" | "warning"; message: string }) {
  const colors = {
    success: "green",
    error: "red",
    warning: "yellow",
  };
  const icons = {
    success: "✓",
    error: "✗",
    warning: "⚠",
  };

  return (
    <Text color={colors[type]}>
      {icons[type]} {message}
    </Text>
  );
}
```

### Highlighted Selection

```tsx
function MenuItem({ label, isSelected }: { label: string; isSelected: boolean }) {
  return (
    <Text inverse={isSelected} bold={isSelected}>
      {isSelected ? "> " : "  "}
      {label}
    </Text>
  );
}
```

### Code Block

```tsx
function Code({ children }: { children: string }) {
  return (
    <Text backgroundColor="gray" color="white">
      {` ${children} `}
    </Text>
  );
}
```
