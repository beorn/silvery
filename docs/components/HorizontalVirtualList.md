# HorizontalVirtualList

React-level virtualization for horizontal lists. Only renders items within the visible viewport plus overscan. Items outside the viewport are not rendered -- scrolling changes which items are in the render window.

## Import

```tsx
import { HorizontalVirtualList } from "silvery"
```

## Props

| Prop                      | Type                                                                 | Default      | Description                                  |
| ------------------------- | -------------------------------------------------------------------- | ------------ | -------------------------------------------- |
| `items`                   | `T[]`                                                                | **required** | Array of items to render                     |
| `width`                   | `number`                                                             | **required** | Width of the list viewport in columns        |
| `itemWidth`               | `number \| ((item: T, index: number) => number)`                     | **required** | Width of each item                           |
| `renderItem`              | `(item: T, index: number) => ReactNode`                              | **required** | Render function for each item                |
| `scrollTo`                | `number`                                                             | --           | Index to keep visible                        |
| `overscan`                | `number`                                                             | `1`          | Extra items to render left/right of viewport |
| `maxRendered`             | `number`                                                             | `20`         | Maximum items to render at once              |
| `overflowIndicator`       | `boolean`                                                            | --           | Show built-in overflow indicators            |
| `renderOverflowIndicator` | `(direction: "before" \| "after", hiddenCount: number) => ReactNode` | --           | Custom overflow indicator renderer           |
| `overflowIndicatorWidth`  | `number`                                                             | `0`          | Width in chars of each overflow indicator    |
| `keyExtractor`            | `(item: T, index: number) => string \| number`                       | index        | Key extractor                                |
| `height`                  | `number`                                                             | --           | Height of the list                           |
| `gap`                     | `number`                                                             | `0`          | Gap between items in columns                 |
| `renderSeparator`         | `() => ReactNode`                                                    | --           | Render separator between items               |

### Ref: HorizontalVirtualListHandle

```ts
interface HorizontalVirtualListHandle {
  scrollToItem(index: number): void
}
```

## Usage

```tsx
<HorizontalVirtualList
  items={columns}
  width={80}
  itemWidth={20}
  scrollTo={selectedIndex}
  renderItem={(column, index) => (
    <Column key={column.id} column={column} isSelected={index === selected} />
  )}
/>
```

## See Also

- [ListView](./ListView.md) -- vertical virtualized list
