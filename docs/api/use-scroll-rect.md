# useScrollRect

Returns the **scroll-adjusted position** of the component, *before* sticky clamping. For non-sticky nodes this equals [`useScreenRect`](/api/use-screen-rect). For sticky nodes (`position="sticky"`), the scroll-rect reflects where the node would be without sticky adjustment — so it can go off-screen (negative y, etc.) when scrolled past.

Like [`useBoxRect`](/api/use-box-rect), this hook returns the **committed** rect: the value as of the most recent event-batch commit boundary, invariant across every convergence pass within a batch.

## Import

```tsx
import { useScrollRect } from "silvery"
```

## Usage

```tsx
function Card({ id }: { id: string }) {
  const { y } = useScrollRect()
  return <Box>Scroll y: {y}</Box>
}
```

## Signature

```ts
function useScrollRect(): Rect
```

Same shape as [`useBoxRect`](/api/use-box-rect): `{ width, height, x, y }`.

## When to use

- Cross-component visual navigation that needs the natural (pre-clamp) position.
- Building scroll-aware UI such as "active section" highlighting in a long-scrolling list, where you want the element's position in scroll coordinates regardless of sticky behavior.

For the actual paint position on the terminal screen (sticky-clamped), use [`useScreenRect`](/api/use-screen-rect). For responsive sizing inside a component, use [`useBoxRect`](/api/use-box-rect).

## See also

- [`useBoxRect`](/api/use-box-rect) — layout position (border-box minus padding/border)
- [`useScreenRect`](/api/use-screen-rect) — actual paint position on the terminal screen
- [`useResponsiveBoxProps`](/api/use-responsive-box-props) — declarative responsive layout
