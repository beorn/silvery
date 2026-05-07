# useResponsiveBoxProps

Pick a `<Box>` prop bag based on the current viewport breakpoint, with mobile-first cascade semantics. The canonical primitive for responsive layout in silvery.

Pass either a flat `Partial<BoxProps>` (no responsive variants) or a `Responsive<Partial<BoxProps>>` shape with a `default` key plus optional per-breakpoint overrides. Each breakpoint's variant is **merged on top of** the previous (mobile-first cascade), so you only specify the keys that change at each step.

Returns a `Partial<BoxProps>` ready to spread into a `<Box>`.

## Import

```tsx
import { useResponsiveBoxProps } from "silvery"
```

## Usage

```tsx
function ResponsiveLayout({ children }: { children: React.ReactNode }) {
  const layout = useResponsiveBoxProps({
    default: { flexDirection: "column", padding: 1 },
    md: { flexDirection: "row", padding: 2 },
    lg: { padding: 3 },          // inherits flexDirection: "row" from md
  })
  return <Box {...layout}>{children}</Box>
}
```

The cascade above resolves to:

| Breakpoint | Resolved props                                        |
| ---------- | ----------------------------------------------------- |
| `default`  | `{ flexDirection: "column", padding: 1 }`             |
| `xs`       | `{ flexDirection: "column", padding: 1 }` (inherits)  |
| `sm`       | `{ flexDirection: "column", padding: 1 }` (inherits)  |
| `md`       | `{ flexDirection: "row", padding: 2 }`                |
| `lg`       | `{ flexDirection: "row", padding: 3 }` (inherits row) |
| `xl`       | `{ flexDirection: "row", padding: 3 }` (inherits)     |

## Signature

```ts
type Responsive<T> = T | ResponsiveValues<T>

function useResponsiveBoxProps(
  map: Responsive<Partial<BoxProps>>,
): Partial<BoxProps>
```

The hook is reactive on viewport-size changes — same backing store as [`useResponsiveValue`](/api/use-responsive-value). Default breakpoint thresholds (terminal columns) are `xs=30`, `sm=60`, `md=90`, `lg=120`, `xl=150`.

## When to use which primitive

| Need                                                          | Use                                  |
| ------------------------------------------------------------- | ------------------------------------ |
| Spread a Box-prop bag based on viewport width                 | `useResponsiveBoxProps`              |
| Pick a non-Box-prop value (string, enum, callback)            | `useResponsiveValue`                 |
| Read the **measured** rect of the current Box                 | `useBoxRect`                         |
| Position something on the screen relative to scroll / sticky  | `useScrollRect` / `useScreenRect`    |

## Examples

### Flat (non-responsive) shape

The hook short-circuits when you pass a flat prop bag — useful for keeping mixed responsive / non-responsive call sites uniform:

```tsx
function MaybeResponsive({ responsive }: { responsive?: Responsive<Partial<BoxProps>> }) {
  const layout = useResponsiveBoxProps(responsive ?? { flexDirection: "row" })
  return <Box {...layout}>...</Box>
}
```

### Responsive sidebar

```tsx
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

### Compared to Tailwind responsive variants

Tailwind: `class="flex-col md:flex-row p-1 md:p-2 lg:p-3"`.

silvery:

```tsx
const layout = useResponsiveBoxProps({
  default: { flexDirection: "column", padding: 1 },
  md: { flexDirection: "row", padding: 2 },
  lg: { padding: 3 },
})
return <Box {...layout}>...</Box>
```

Same mobile-first cascade. The mental model translates directly: each breakpoint adds to (overrides keys in) the previous one.

## Why prefer `useResponsiveBoxProps` over reading `useBoxRect`

Reading `useBoxRect` and branching on width is safe under [deferred-rect semantics](/api/use-box-rect#first-render-behavior--one-frame-late-by-design) — the committed rect is batch-invariant — but it has two downsides for layout decisions:

1. **One-frame-late on mount.** The first render returns a zero rect; the measured rect arrives one batch later. For app chrome decisions (sidebar visible, columns vs rows) this produces a visible flash on mount.
2. **Multi-layer chains accumulate frame delay.** `<MeasuredBox>` wrapping a child that itself reads `useBoxRect` needs one batch per layer to settle. Each layer = one extra paint at startup.

`useResponsiveBoxProps` reads the global terminal width directly via `useResponsiveValue` — no layout pass dependency. The first paint already shows the correct breakpoint variant.

For decisions that genuinely depend on the parent's measured size (not the global terminal width), `useBoxRect` is the right tool; the deferred contract still applies.

## See also

- [`useResponsiveValue`](/api/use-responsive-value) — for non-Box-prop responsive values
- [`useBoxRect`](/api/use-box-rect) — read the committed rect of the current Box
- [Responsive layout guide](/guide/responsive-layout) — how to think about layout in silvery
