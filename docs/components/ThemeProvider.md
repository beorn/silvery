# ThemeProvider

Delivers a Theme to the React component tree. Sets React context so `useTheme()` returns the active theme.

For pipeline `$token` resolution and automatic fg/bg, use `Box theme={}` instead -- it handles fg, bg, and `$tokens` automatically.

## Import

```tsx
import { ThemeProvider } from "silvery"
```

## Props

| Prop       | Type        | Default      | Description             |
| ---------- | ----------- | ------------ | ----------------------- |
| `theme`    | `Theme`     | **required** | Theme object to provide |
| `children` | `ReactNode` | **required** | Child components        |

## Usage

```tsx
// Root app -- ThemeProvider for useTheme()
<ThemeProvider theme={detectedTheme}>
  <App />
</ThemeProvider>

// Themed subtree -- Box theme handles fg, bg, and $tokens automatically
<Box theme={lightTheme} borderStyle="single">
  <Text color="$primary">Uses light theme</Text>
</Box>
```

## Related

```tsx
import { useTheme, defaultDarkTheme, defaultLightTheme, detectTheme } from "silvery"

const theme = useTheme() // Access current theme in components
```

## See Also

- [Box](./Box.md) -- layout container with `theme` prop
