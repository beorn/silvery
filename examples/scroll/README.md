# Scroll Example

Demonstrates `overflow="scroll"` with keyboard navigation.

## Run

```bash
bun run examples/scroll/index.tsx
```

## Features

- 50 items in a 10-row viewport
- Arrow keys to navigate
- `scrollTo={selectedIndex}` keeps selection visible
- Scroll indicators on border (e.g., `▼42` showing items below)
- Press `q` to exit

## Key Code

```tsx
<Box
  flexDirection="column"
  height={10}
  overflow="scroll"
  scrollTo={selectedIndex}
  borderStyle="single"
>
  {items.map((item, i) => (
    <Text key={i} inverse={i === selectedIndex}>
      {item}
    </Text>
  ))}
</Box>
```
