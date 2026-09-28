# Responsive Layout

Silvery supports responsive layout in three layers, ordered by how often you'll reach for them:

1. **`useResponsiveBoxProps`** — declarative `<Box>`-prop spread driven by the global viewport. The canonical primitive for app chrome (sidebars, headers, multi-pane shells).
2. **`useResponsiveValue`** — pick a non-Box-prop value (string, enum, callback) keyed by viewport breakpoint.
3. **`useBoxRectDangerously` / `useScrollRect` / `useScreenRect`** — read the **committed** measured rect of the current Box. Use when the decision genuinely depends on the parent's measured size, not the global terminal width.

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

## Dimension expressions

With the Flexily backend, Box, Text and Island accept length strings on `width`, `height`, `minWidth`, `minHeight`, `maxWidth`, `maxHeight` and `flexBasis`.
Use `calc()`, `min()`, `max()` and `clamp()` to combine a responsive size with a floor or ceiling:

```tsx
<Box width="clamp(20ch, 50%, 80ch)" height="max(2lh, 25%)">
  <Text width="calc(100% - 2ch)">A bounded panel</Text>
</Box>
```

| Unit  | Meaning in the terminal                                                                                                         |
| ----- | ------------------------------------------------------------------------------------------------------------------------------- |
| `ch`  | One column; accepted on width and other inline-axis dimensions.                                                                 |
| `lh`  | One row; accepted on height and other block-axis dimensions.                                                                    |
| `%`   | A percentage of the corresponding containing axis.                                                                              |
| `cqi` | One percent of the nearest ancestor's frozen query inline size, or the layout root's inline size when no query ancestor exists. |

Numeric props still count cells: `width={10}` is ten columns and `height={3}` is three rows.
The terminal adapter supplies the `ch` and `lh` scale. `px` strings are refused with an error pointing to `ch` and `lh`.
Cross-axis strings such as `height="2ch"`, `width="2lh"` or `height="10cqi"` are refused because this adapter has no cell aspect ratio.
For `flexBasis`, the parent direction determines the axis, so an incompatible unit is reported at first layout.

### Accepted syntax and fixes

- Function names and units are case-insensitive: `MIN(10CH, 50%)` works.
- Functions can nest and group expressions: `calc((100% - 2ch) / 2)`.
- Every length carries a unit. Write `max(50%, 2ch)` instead of `max(50%, 2)`.
- Arithmetic belongs inside a math function. Wrap `100% - 2ch` as `calc(100% - 2ch)`.
- Binary `+` and `-` require spaces on both sides. Write `calc(100% - 2ch)` instead of `calc(100%-2ch)`.
- Multiplication and division take a unitless constant: `calc(2ch*3)` and `calc(6lh/2)`. Division by zero is an error.
- Fractional lengths such as `0.5ch` are valid. Layout keeps fractional sizes; final box edges snap to whole terminal cells, so a small expression can occupy zero cells.

### Container-relative dimensions

Give the query ancestor `containerType="inline-size"` and `containSize` so its inline size does not depend on the descendants that query it:

```tsx
<Box width={100} containerType="inline-size" containSize>
  <Box width="max(1ch, 10cqi)">
    <Text>At least one column, otherwise ten percent of the query width</Text>
  </Box>
</Box>
```

The size is frozen before dependent descendants lay out. A query container's own length queries its ancestor, rather than itself.
With no query ancestor, the layout root supplies the viewport fallback.

This is a deliberate CSS subset. Math on padding, margin, gap and position offsets is refused; numeric spacing and margin `auto` keep their existing behavior.
`cqmin`, `cqb` and `cqmax` are refused in dimension expressions until both query axes are supported. The existing `fitWidth` API retains its earlier `cqmin` behavior.
`var()` and other units are unsupported. The Yoga backend accepts its existing numbers, percentages and keywords, and reports a prop-named error for these expressions.
Percent dimensions against an indefinite, auto-sized parent can resolve to zero in Flexily where CSS uses auto sizing; this page does not claim browser-identical layout.

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

This is the **canonical** responsive primitive — prefer it over reading `useBoxRectDangerously` for layout decisions.

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

When the responsive decision depends on the **measured rect of the current Box** (not the global terminal width), reach for `useBoxRectDangerously`:

```tsx
function ResponsiveCard() {
  const { width } = useBoxRectDangerously()
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

The reactive form of `useBoxRectDangerously` returns the **committed** rect: invariant across every convergence pass within one event batch. A render that branches on the read value produces the same output every pass — the convergence loop terminates in one pass. The historical "useBoxRectDangerously-driven width oscillation" feedback loop is impossible by construction.

The cost is **one frame late on mount**: the first paint shows the empty-rect fallback (`{ width: 0, height: 0 }`), and the measured value arrives on the next render. For app chrome decisions where this flash is visible, prefer `useResponsiveBoxProps` — it doesn't depend on layout measurement.

## Migration from the old anti-pattern

Pre-2026-05-06 silvery exposed the layout hooks with **in-flight** semantics — each rect read returned the latest measurement, which could change between convergence passes within a single batch. A render that branched on `useBoxRectDangerously` width and structurally mounted/unmounted a sidebar (`width >= 90 ? <WithSidebar/> : <NoSidebar/>`) could ping-pong: pass 1 measures 95 → renders WithSidebar → pass 2 measures 88 (sidebar took 7 cols) → renders NoSidebar → pass 3 measures 95 → loop until the convergence cap fired.

Under the deferred contract this can't happen. But the canonical fix for the pattern is still cleaner with `useResponsiveBoxProps`:

```tsx
// Old anti-pattern (works under deferred semantics, but flashes on mount):
function Panel() {
  const { width } = useBoxRectDangerously()
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
- [`useBoxRectDangerously`](/api/use-box-rect) / [`useScrollRect`](/api/use-scroll-rect) / [`useScreenRect`](/api/use-screen-rect)
