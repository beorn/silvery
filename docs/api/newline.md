# Newline

Renders newline characters for vertical spacing in text content.

## Import

```tsx
import { Newline } from "silvery"
```

## Usage

```tsx
<Text>Line 1</Text>
<Newline />
<Text>Line 3 (after blank line)</Text>
```

## Props

| Prop    | Type     | Default | Description                  |
| ------- | -------- | ------- | ---------------------------- |
| `count` | `number` | `1`     | Number of newlines to render |

## Examples

### Basic Spacing

```tsx
<Box flexDirection="column">
  <Text>First paragraph</Text>
  <Newline />
  <Text>Second paragraph (with blank line above)</Text>
</Box>
```

Output:

```
First paragraph

Second paragraph (with blank line above)
```

### Multiple Newlines

```tsx
<Box flexDirection="column">
  <Text>Section 1</Text>
  <Newline count={2} />
  <Text>Section 2 (with extra spacing)</Text>
</Box>
```

Output:

```
Section 1


Section 2 (with extra spacing)
```

### Spacing Between Elements

```tsx
function Header({ title }: { title: string }) {
  return (
    <>
      <Text bold color="cyan">
        {title}
      </Text>
      <Text color="gray">{"─".repeat(40)}</Text>
      <Newline />
    </>
  )
}

<Box flexDirection="column">
  <Header title="My App" />
  <Text>Content goes here</Text>
</Box>
```
