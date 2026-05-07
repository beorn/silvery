# useResponsiveValue

Returns a value picked by viewport breakpoint — the primitive for any responsive lookup that isn't a `Box` prop. For Box-prop spread, use [`useResponsiveBoxProps`](/api/use-responsive-box-props) (the canonical sugar).

The hook reads from the global terminal width signal (`term.size.cols()`) and re-renders when the breakpoint zone changes.

## Import

```tsx
import { useResponsiveValue } from "silvery"
```

## Usage

### Pick a string

```tsx
function StatusLabel() {
  const label = useResponsiveValue<string>({
    default: "OK",
    md: "Operational",
    lg: "All systems operational",
  })
  return <Text>{label}</Text>
}
```

### Pick a callback

```tsx
const onSelect = useResponsiveValue<() => void>({
  default: () => openModal(),
  lg: () => openInline(),
})
```

### Pick a component

```tsx
const Banner = useResponsiveValue<React.ComponentType>({
  default: BannerCompact,
  md: BannerStandard,
  lg: BannerWide,
})
return <Banner />
```

## Signature

```ts
function useResponsiveValue<T>(map: Responsive<T>): T

type Responsive<T> =
  | T
  | ({ default: T } & Partial<Record<Breakpoint, T>>)
```

A flat `T` is returned as-is. A `{ default, xs?, sm?, md?, lg?, xl? }` cascade resolves mobile-first: take the largest breakpoint at or below the current width that has a defined value, else fall back to `default`.

## Breakpoints

Default thresholds (terminal columns):

| Token  | Width |
| ------ | ----- |
| `xs`   | 30    |
| `sm`   | 60    |
| `md`   | 90    |
| `lg`   | 120   |
| `xl`   | 150   |

Customize per call via the second argument:

```tsx
const tier = useResponsiveValue<Tier>(
  { default: "small", md: "large" },
  { md: 100 }, // override md threshold to 100 cols
)
```

## When to use

- **Strings, enums, callbacks, components** — anything that varies by viewport but isn't a `Box` prop.
- **Container queries** — when the relevant width is a parent's measured rect rather than the terminal, pass that width through your own breakpoint resolver instead.

For Box-prop spread, prefer [`useResponsiveBoxProps`](/api/use-responsive-box-props) — it's a typed, declarative wrapper specialized to the most common case.

## See also

- [`useResponsiveBoxProps`](/api/use-responsive-box-props) — declarative `Box`-prop spread for responsive layout
- [`useBoxRect`](/api/use-box-rect) — measured rect for container-query patterns
