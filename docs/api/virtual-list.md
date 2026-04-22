# VirtualList

::: warning Deprecated
Use [ListView](./list-view) instead. VirtualList is a thin wrapper that maps old prop names to ListView.
:::

React-level virtualized list. Only renders items within the visible viewport plus overscan.

## Import

```tsx
import { VirtualList } from "silvery"
```

## Usage

```tsx
<VirtualList
  items={cards}
  height={20}
  itemHeight={1}
  scrollTo={selectedIndex}
  renderItem={(card, index) => <Text inverse={index === selected}>{card.title}</Text>}
/>
```

## Props

| Prop                | Type                                                     | Default    | Description                                         |
| ------------------- | -------------------------------------------------------- | ---------- | --------------------------------------------------- |
| `items`             | `T[]`                                                    | _required_ | Array of items to render                            |
| `height`            | `number`                                                 | _required_ | Viewport height in rows                             |
| `itemHeight`        | `number \| (item: T, index: number) => number`           | `1`        | Height per item in rows                             |
| `renderItem`        | `(item: T, index: number, meta?: ItemMeta) => ReactNode` | _required_ | Render function                                     |
| `scrollTo`          | `number`                                                 | —          | Index to keep visible (ignored in interactive mode) |
| `overscan`          | `number`                                                 | `5`        | Extra items rendered beyond viewport                |
| `maxRendered`       | `number`                                                 | `100`      | Maximum items rendered at once                      |
| `overflowIndicator` | `boolean`                                                | —          | Show overflow indicators                            |
| `keyExtractor`      | `(item: T, index: number) => string \| number`           | index      | Key extractor                                       |
| `width`             | `number`                                                 | —          | Viewport width                                      |
| `gap`               | `number`                                                 | `0`        | Gap between items                                   |
| `renderSeparator`   | `() => ReactNode`                                        | —          | Custom separator between items                      |
| `virtualized`       | `(item: T, index: number) => boolean`                    | —          | Predicate for virtualized prefix                    |
| `listFooter`        | `ReactNode`                                              | —          | Content after all items                             |

### Interactive Mode

| Prop                    | Type                      | Default | Description                      |
| ----------------------- | ------------------------- | ------- | -------------------------------- |
| `interactive`           | `boolean`                 | —       | Enable keyboard/mouse navigation |
| `selectedIndex`         | `number`                  | —       | Controlled selected index        |
| `onSelectionChange`     | `(index: number) => void` | —       | Called when selection changes    |
| `onSelect`              | `(index: number) => void` | —       | Called on Enter                  |
| `onEndReached`          | `() => void`              | —       | Infinite scroll callback         |
| `onEndReachedThreshold` | `number`                  | `5`     | Items from end to trigger        |

### ItemMeta

```ts
interface ItemMeta {
  isSelected: boolean
}
```

## Examples

### Interactive List

```tsx
<VirtualList
  items={items}
  height={20}
  itemHeight={1}
  interactive
  onSelect={(index) => openItem(items[index])}
  renderItem={(item, index, meta) => (
    <Text inverse={meta?.isSelected}>
      {meta?.isSelected ? "> " : "  "}
      {item.name}
    </Text>
  )}
/>
```
