# ListView

Unified virtualized list component. Merges core virtualization (viewport rendering, placeholders) with navigation (keyboard, mouse wheel, cursor state) into a single component. The recommended list component for all use cases.

## Import

```tsx
import { ListView } from "silvery"
```

## Props

| Prop                    | Type                                                        | Default      | Description                                                     |
| ----------------------- | ----------------------------------------------------------- | ------------ | --------------------------------------------------------------- |
| `items`                 | `T[]`                                                       | **required** | Array of items to render                                        |
| `height`                | `number`                                                    | **required** | Height of the viewport in rows                                  |
| `renderItem`            | `(item: T, index: number, meta: ListItemMeta) => ReactNode` | **required** | Render function for each item                                   |
| `estimateHeight`        | `number \| ((index: number) => number)`                     | `1`          | Estimated height per item (fallback before measurement)         |
| `scrollTo`              | `number`                                                    | --           | Index to scroll to (declarative). Ignored when `navigable=true` |
| `overscan`              | `number`                                                    | `5`          | Extra items to render beyond viewport                           |
| `maxRendered`           | `number`                                                    | `100`        | Maximum items to render at once                                 |
| `scrollPadding`         | `number`                                                    | `2`          | Padding from edge before scrolling (in items)                   |
| `overflowIndicator`     | `boolean`                                                   | `false`      | Show overflow indicators                                        |
| `getKey`                | `(item: T, index: number) => string \| number`              | index        | Key extractor                                                   |
| `width`                 | `number`                                                    | --           | Viewport width (uses parent width if not specified)             |
| `gap`                   | `number`                                                    | `0`          | Gap between items in rows                                       |
| `renderSeparator`       | `() => ReactNode`                                           | --           | Render separator between items                                  |
| `onWheel`               | `(event: { deltaY: number }) => void`                       | --           | Mouse wheel handler (passive mode only)                         |
| `onEndReached`          | `() => void`                                                | --           | Called when visible range nears end (infinite scroll)           |
| `onEndReachedThreshold` | `number`                                                    | `5`          | Items from end to trigger onEndReached                          |
| `listFooter`            | `ReactNode`                                                 | --           | Content rendered after all items                                |
| `virtualized`           | `(item: T, index: number) => boolean`                       | --           | Predicate for items already virtualized                         |

### Navigable Mode

| Prop                  | Type                      | Default | Description                                         |
| --------------------- | ------------------------- | ------- | --------------------------------------------------- |
| `navigable`           | `boolean`                 | --      | Enable built-in keyboard and mouse wheel navigation |
| `cursorIndex`         | `number`                  | --      | Controlled cursor index                             |
| `onCursorIndexChange` | `(index: number) => void` | --      | Called when cursor position changes                 |
| `onSelect`            | `(index: number) => void` | --      | Called when Enter is pressed on cursor item         |
| `active`              | `boolean`                 | `true`  | Whether this ListView is active for keyboard input  |

### History / Surface

| Prop          | Type                       | Default | Description                                   |
| ------------- | -------------------------- | ------- | --------------------------------------------- |
| `surfaceId`   | `string`                   | --      | Surface identity for search/selection routing |
| `textAdapter` | `ListTextAdapter<T>`       | --      | Text extraction for search/history            |
| `history`     | `ListViewHistoryConfig<T>` | --      | History configuration                         |

### ListItemMeta

```ts
interface ListItemMeta {
  isCursor: boolean
}
```

### Ref: ListViewHandle

```ts
interface ListViewHandle {
  scrollToItem(index: number): void
  getHistoryBuffer(): HistoryBuffer | null
  getComposedViewport(): ComposedViewport | null
}
```

## Usage

```tsx
// Passive (parent controls scroll)
<ListView
  items={logs}
  height={20}
  renderItem={(item, index) => <LogEntry data={item} />}
  estimateHeight={() => 3}
/>

// Navigable (built-in j/k, arrows, PgUp/PgDn, Home/End, G, mouse wheel)
<ListView
  items={items}
  height={20}
  navigable
  renderItem={(item, i, meta) => (
    <Text>{meta.isCursor ? '> ' : '  '}{item.name}</Text>
  )}
  onSelect={(index) => openItem(items[index])}
/>
```

## Dynamic Height Measurement

ListView automatically measures each rendered item's actual height after layout and uses those measurements for accurate scroll calculations. The `estimateHeight` prop is used as a fallback for items that haven't been rendered yet (above or below the viewport). As the user scrolls, measurements accumulate and scroll accuracy improves.

This means variable-height items (e.g., cards with 3-6 rows depending on title length and children) work correctly without manual height calculation. Set `estimateHeight` to the most common item height for a smooth initial render.

## See Also

- [VirtualList](./VirtualList.md) -- deprecated wrapper (use ListView)
- [VirtualView](./VirtualView.md) -- deprecated wrapper (use ListView)
- [SelectList](./SelectList.md) -- simple non-virtualized select list
