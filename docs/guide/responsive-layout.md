# Responsive Layout

Silvery supports responsive layout in three layers, ordered by how often you'll reach for them:

1. **`useResponsiveBoxProps`** — declarative `<Box>`-prop spread driven by the global viewport. The canonical primitive for app chrome (sidebars, headers, multi-pane shells).
2. **`useResponsiveValue`** — pick a non-Box-prop value (string, enum, callback) keyed by viewport breakpoint.
3. **`useBoxRect` / `useScrollRect` / `useScreenRect`** — read the **committed** measured rect of the current Box. Use when the decision genuinely depends on the parent's measured size, not the global terminal width.

## The mental model

silvery uses Bootstrap/Tailwind/Polaris-style mobile-first breakpoints:

| Breakpoint | Default threshold (terminal columns) |
| ---------- | ------------------------------------ |
| `default`  | applies below `xs`                   |
| `xs`       | ≥ 30                                 |
| `sm`       | ≥ 60                                 |
| `md`       | ≥ 90                                 |
| `lg`       | ≥ 120                                |
| `xl`       | ≥ 150                                |

Each breakpoint is **cumulative** — a `lg` value applies at `lg` and `xl` unless `xl` overrides it. Specifying `default` is mandatory; every other breakpoint is optional.

## Pattern 1: Declarative Box-prop spread

The most common case: layout chrome that switches between column and row, narrows padding on small terminals, or hides a sidebar below some width. Reach for `useResponsiveBoxProps`:

```tsx
import { useResponsiveBoxProps } from "silvery"

function AppShell({ sidebar, main }: { sidebar: React.ReactNode; main: React.ReactNode }) {
  const containerLayout = useResponsiveBoxProps({
    default: { flexDirection: "column" },
    md: { flexDirection: "row" },
  })
  const sidebarLayout = useResponsiveBoxProps({
    default: { width: "100%", height: 8 },
    md: { width: 28, height: "100%" },
  })

  return (
    <Box {...containerLayout}>
      <Box {...sidebarLayout}>{sidebar}</Box>
      <Box flexGrow={1}>{main}</Box>
    </Box>
  )
}
```

`useResponsiveBoxProps` accepts either a flat `Partial<BoxProps>` (no responsive variants — short-circuits without breakpoint resolution) or a `{ default, xs?, sm?, md?, lg?, xl? }` cascade. Each breakpoint variant merges on top of the previous one; you only specify the keys that change.

This is the **canonical** responsive primitive — prefer it over reading `useBoxRect` for layout decisions.

## Pattern 2: Non-Box-prop responsive values

`useResponsiveValue` handles the cases `useResponsiveBoxProps` doesn't cover — picking a string, an enum, a callback, or any non-`BoxProps` value:

```tsx
import { useResponsiveValue } from "silvery"

const panelMode = useResponsiveValue<"overlay" | "inline">({
  default: "overlay",
  sm: "inline",
})

const truncationLength = useResponsiveValue({
  default: 20,
  md: 60,
  lg: 100,
})
```

## Pattern 3: Measured-rect decisions

When the responsive decision depends on the **measured rect of the current Box** (not the global terminal width), reach for `useBoxRect`:

```tsx
function ResponsiveCard() {
  const { width } = useBoxRect()
  const direction = width < 60 ? "column" : "row"
  return (
    <Box flexDirection={direction}>
      <Box flexGrow={1}>
        <Text>Panel 1</Text>
      </Box>
      <Box flexGrow={1}>
        <Text>Panel 2</Text>
      </Box>
    </Box>
  )
}
```

The reactive form of `useBoxRect` returns the **committed** rect: invariant across every convergence pass within one event batch. A render that branches on the read value produces the same output every pass — the convergence loop terminates in one pass. The historical "useBoxRect-driven width oscillation" feedback loop is impossible by construction.

The cost is **one frame late on mount**: the first paint shows the empty-rect fallback (`{ width: 0, height: 0 }`), and the measured value arrives on the next render. For app chrome decisions where this flash is visible, prefer `useResponsiveBoxProps` — it doesn't depend on layout measurement.

## Migration from the old anti-pattern

Pre-2026-05-06 silvery exposed the layout hooks with **in-flight** semantics — each rect read returned the latest measurement, which could change between convergence passes within a single batch. A render that branched on `useBoxRect` width and structurally mounted/unmounted a sidebar (`width >= 90 ? <WithSidebar/> : <NoSidebar/>`) could ping-pong: pass 1 measures 95 → renders WithSidebar → pass 2 measures 88 (sidebar took 7 cols) → renders NoSidebar → pass 3 measures 95 → loop until the convergence cap fired.

Under the deferred contract this can't happen. But the canonical fix for the pattern is still cleaner with `useResponsiveBoxProps`:

```tsx
// Old anti-pattern (works under deferred semantics, but flashes on mount):
function Panel() {
  const { width } = useBoxRect()
  return width >= 90 ? <WithSidebar /> : <NoSidebar />
}

// Canonical:
function Panel() {
  const layout = useResponsiveBoxProps({
    default: {}, // no sidebar by default
    md: {
      /* sidebar visible */
    },
  })
  // ... render driven by `layout` spread ...
}
```

The declarative form has no first-frame flash and doesn't depend on layout measurement at all.

## See also

- [`useResponsiveBoxProps`](/api/use-responsive-box-props)
- [`useResponsiveValue`](/api/use-responsive-value)
- [`useBoxRect`](/api/use-box-rect) / [`useScrollRect`](/api/use-scroll-rect) / [`useScreenRect`](/api/use-screen-rect)
