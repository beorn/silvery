# Spacer

A flexible space that expands to fill available space in its parent container.

## Import

```tsx
import { Spacer } from "silvery"
```

## Usage

```tsx
<Box flexDirection="row">
  <Text>Left</Text>
  <Spacer />
  <Text>Right</Text>
</Box>
```

## Props

Spacer has no props. It uses `flexGrow={1}` internally to fill available space.

## Examples

### Push Items to Opposite Ends

```tsx
<Box flexDirection="row" width={40}>
  <Text>File.txt</Text>
  <Spacer />
  <Text color="gray">1.2 KB</Text>
</Box>
```

Output:

```
File.txt                          1.2 KB
```

### Center an Element

```tsx
<Box flexDirection="row" width={40}>
  <Spacer />
  <Text bold>Centered Title</Text>
  <Spacer />
</Box>
```

Output:

```
             Centered Title
```

### Header with Left and Right Content

```tsx
function Header({ title, status }: { title: string; status: string }) {
  return (
    <Box flexDirection="row" borderStyle="single" paddingX={1}>
      <Text bold>{title}</Text>
      <Spacer />
      <Text color="green">{status}</Text>
    </Box>
  )
}

<Header title="My App" status="Connected" />
```

Output:

```
┌──────────────────────────────────┐
│ My App                 Connected │
└──────────────────────────────────┘
```

### Multiple Spacers for Equal Distribution

```tsx
<Box flexDirection="row" width={50}>
  <Text>A</Text>
  <Spacer />
  <Text>B</Text>
  <Spacer />
  <Text>C</Text>
</Box>
```

Output:

```
A                   B                   C
```
