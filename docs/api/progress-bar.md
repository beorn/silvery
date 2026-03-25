# ProgressBar

Terminal progress bar with determinate and indeterminate (animated bounce) modes. Auto-sizes to available width.

## Import

```tsx
import { ProgressBar } from "silvery"
```

## Usage

```tsx
// Determinate — shows filled progress
<ProgressBar value={0.5} />

// Indeterminate — animated bouncing block
<ProgressBar />

// With label and color
<ProgressBar value={0.75} color="green" label="Downloading..." />
```

## Props

| Prop             | Type      | Default                | Description                                     |
| ---------------- | --------- | ---------------------- | ----------------------------------------------- |
| `value`          | `number`  | —                      | Progress 0-1 (omit for indeterminate animation) |
| `width`          | `number`  | available width        | Width in columns                                |
| `fillChar`       | `string`  | `"█"`                  | Character for the filled portion                |
| `emptyChar`      | `string`  | `"░"`                  | Character for the empty portion                 |
| `showPercentage` | `boolean` | `true` for determinate | Show percentage label                           |
| `label`          | `string`  | —                      | Label text before the bar                       |
| `color`          | `string`  | —                      | Color of the filled portion                     |

## Modes

### Determinate

When `value` is provided (0-1), the bar shows a filled portion proportional to the value.

```
Downloading... ████████████░░░░░░░░░░░░░░░░░░  40%
```

### Indeterminate

When `value` is omitted, the bar shows an animated bouncing block that moves back and forth.

```
Loading... ░░░░░░████░░░░░░░░░░░░░░░░░░░░
```

## Examples

### Download Progress

```tsx
<ProgressBar value={bytesReceived / totalBytes} label="Downloading..." color="$primary" />
```

### File Processing

```tsx
<Box flexDirection="column" gap={1}>
  <Text>
    Processing files ({processed}/{total})
  </Text>
  <ProgressBar value={processed / total} />
</Box>
```

### Indeterminate Loading

```tsx
<ProgressBar label="Connecting..." />
```

### Custom Characters

```tsx
<ProgressBar value={0.6} fillChar="=" emptyChar="-" showPercentage={false} />
```

Output: `============------------------`
