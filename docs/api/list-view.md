# ListView

Unified virtualized list component. Renders only visible items plus overscan for smooth scrolling. Supports passive (parent-controlled scroll) and navigable (built-in keyboard/mouse) modes.

## Import

```tsx
import { ListView } from "silvery"
```

## Usage

```tsx
// Passive — parent controls scroll position
<ListView
  items={logs}
  height={20}
  renderItem={(item, index) => <Text>{item.message}</Text>}
/>

// Navigable — built-in j/k, arrows, PgUp/PgDn, Home/End, G, mouse wheel
<ListView
  items={items}
  height={20}
  navigable
  renderItem={(item, i, meta) => (
    <Text inverse={meta.isCursor}>{item.name}</Text>
  )}
  onSelect={(index) => openItem(items[index])}
/>
```

## Props

### Core

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `items` | `T[]` | *required* | Array of items to render |
| `height` | `number` | *required* | Viewport height in rows |
| `renderItem` | `(item: T, index: number, meta: ListItemMeta) => ReactNode` | *required* | Render function for each item |
| `estimateHeight` | `number \| (index: number) => number` | `1` | Estimated height per item in rows |
| `getKey` | `(item: T, index: number) => string \| number` | index | Key extractor |
| `width` | `number` | — | Viewport width (uses parent width if omitted) |

### Scrolling

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `scrollTo` | `number` | — | Index to scroll to (ignored when navigable) |
| `overscan` | `number` | `5` | Extra items rendered beyond viewport |
| `maxRendered` | `number` | `100` | Maximum items rendered at once |
| `scrollPadding` | `number` | `2` | Padding from edge before scrolling (in items) |
| `overflowIndicator` | `boolean` | `false` | Show overflow indicators |
| `gap` | `number` | `0` | Gap between items in rows |
| `renderSeparator` | `() => ReactNode` | — | Custom separator between items |
| `listFooter` | `ReactNode` | — | Content after all items in scroll container |
| `virtualized` | `(item: T, index: number) => boolean` | — | Predicate for already-virtualized prefix items |

### Navigable Mode

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `navigable` | `boolean` | — | Enable built-in keyboard and mouse navigation |
| `cursorIndex` | `number` | — | Controlled cursor position |
| `onCursorIndexChange` | `(index: number) => void` | — | Called when cursor moves |
| `onSelect` | `(index: number) => void` | — | Called when Enter is pressed |
| `active` | `boolean` | `true` | Whether keyboard input is captured |

### Infinite Scroll

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `onEndReached` | `() => void` | — | Called when near the end of the list |
| `onEndReachedThreshold` | `number` | `5` | Items from end to trigger onEndReached |

### ListItemMeta

```ts
interface ListItemMeta {
  /** Whether this item is at the cursor position (navigable mode only) */
  isCursor: boolean
}
```

### Ref Handle (ListViewHandle)

| Method | Type | Description |
| --- | --- | --- |
| `scrollToItem(index)` | `(index: number) => void` | Imperatively scroll to an item |

## Keyboard Shortcuts (navigable mode)

| Key | Action |
| --- | --- |
| `j` / `Down` | Move cursor down |
| `k` / `Up` | Move cursor up |
| `G` / `End` | Jump to last item |
| `Home` | Jump to first item |
| `PgDn` / `Ctrl+D` | Page down (half viewport) |
| `PgUp` / `Ctrl+U` | Page up (half viewport) |
| `Enter` | Select item at cursor |

## Examples

### Variable Height Items

```tsx
<ListView
  items={messages}
  height={20}
  estimateHeight={(index) => messages[index].lines}
  renderItem={(msg) => <Text>{msg.content}</Text>}
  scrollTo={messages.length - 1}
/>
```

### With Custom Separators

```tsx
<ListView
  items={sections}
  height={15}
  navigable
  renderItem={(item, i, meta) => (
    <Text inverse={meta.isCursor}>{item.title}</Text>
  )}
  renderSeparator={() => <Text color="$border">{"─".repeat(40)}</Text>}
/>
```

### Infinite Scroll

```tsx
<ListView
  items={feed}
  height={20}
  navigable
  renderItem={(item) => <Text>{item.title}</Text>}
  onEndReached={loadMore}
  onEndReachedThreshold={10}
/>
```
