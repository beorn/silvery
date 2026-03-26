# VirtualView

> **Deprecated**: Use [ListView](./ListView.md) instead. VirtualView is now a thin wrapper.

App-managed scrolling within a Screen rectangle. A scrollable area where items mount/unmount based on scroll position, managed entirely by the app.

Unlike ScrollbackView (which uses native terminal scrollback), VirtualView keeps everything in the React tree.

## Import

```tsx
import { VirtualView } from "silvery"
```

## Props

| Prop                | Type                                           | Default      | Description                           |
| ------------------- | ---------------------------------------------- | ------------ | ------------------------------------- |
| `items`             | `T[]`                                          | **required** | Array of items to render              |
| `height`            | `number`                                       | **required** | Height of the viewport in rows        |
| `renderItem`        | `(item: T, index: number) => ReactNode`        | **required** | Render function for each item         |
| `estimateHeight`    | `number \| ((index: number) => number)`        | `1`          | Estimated height of each item         |
| `scrollTo`          | `number`                                       | --           | Index to scroll to (declarative)      |
| `overscan`          | `number`                                       | `5`          | Extra items to render beyond viewport |
| `maxRendered`       | `number`                                       | `100`        | Maximum items to render at once       |
| `scrollPadding`     | `number`                                       | `2`          | Padding from edge before scrolling    |
| `overflowIndicator` | `boolean`                                      | `false`      | Show overflow indicators              |
| `keyExtractor`      | `(item: T, index: number) => string \| number` | index        | Key extractor                         |
| `width`             | `number`                                       | --           | Viewport width                        |
| `gap`               | `number`                                       | `0`          | Gap between items in rows             |
| `renderSeparator`   | `() => ReactNode`                              | --           | Render separator between items        |

### Ref: VirtualViewHandle

```ts
interface VirtualViewHandle {
  scrollToItem(index: number): void
}
```

## Usage

```tsx
<Screen>
  <Header />
  <VirtualView
    items={logs}
    height={20}
    renderItem={(item, index) => <LogEntry key={item.id} data={item} />}
    estimateHeight={() => 3}
  />
  <StatusBar />
</Screen>
```

## See Also

- [ListView](./ListView.md) -- the replacement component
- [ScrollbackView](./ScrollbackView.md) -- native terminal scrollback
