# useScreenRect

Returns the actual paint position on the terminal screen — the silvery analogue of CSS `getBoundingClientRect()`. For non-sticky nodes this equals [`useScrollRect`](/api/use-scroll-rect). For sticky nodes (`position="sticky"`), it reflects the clamped position where pixels actually land on screen.

Like [`useBoxRect`](/api/use-box-rect), this hook returns the **committed** rect: invariant across every convergence pass within a batch, advancing only at the next batch's commit boundary.

## Import

```tsx
import { useScreenRect } from "silvery"
```

## Usage

```tsx
function StickyHeader() {
  const { y } = useScreenRect()
  return (
    <Box position="sticky" stickyTop={0}>
      <Text>Header at row {y}</Text>
    </Box>
  )
}
```

## Signature

```ts
function useScreenRect(): Rect
```

Same shape as [`useBoxRect`](/api/use-box-rect): `{ width, height, x, y }`.

## When to use

- **Hit testing** — given a terminal cell coordinate, determine which component is at that cell.
- **Cursor positioning** — place a cursor or caret at a node's painted location.
- **Cross-component visual navigation** — line up overlays, tooltips, popovers with the actual painted position.

For the layout-pass position before sticky clamping, use [`useScrollRect`](/api/use-scroll-rect). For the inner content rect, use [`useBoxRect`](/api/use-box-rect).

## See also

- [`useBoxRect`](/api/use-box-rect) — layout position (border-box minus padding/border)
- [`useScrollRect`](/api/use-scroll-rect) — scroll-adjusted position, pre-sticky clamping
- [`useResponsiveBoxProps`](/api/use-responsive-box-props) — declarative responsive layout
