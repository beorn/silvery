# SplitView

Recursive binary-tree pane tiling component. Renders a layout tree of split panes using flexbox. Each leaf renders via `renderPane(id)`. Splits divide space according to ratio (0-1, proportion given to first child).

## Import

```tsx
import { SplitView } from "silvery"
```

## Props

| Prop                   | Type                        | Default      | Description                                      |
| ---------------------- | --------------------------- | ------------ | ------------------------------------------------ |
| `layout`               | `LayoutNode`                | **required** | Layout tree describing the split arrangement     |
| `renderPane`           | `(id: string) => ReactNode` | **required** | Render function for each leaf pane               |
| `focusedPaneId`        | `string`                    | --           | ID of the focused pane (for border highlighting) |
| `showBorders`          | `boolean`                   | `true`       | Show borders around panes                        |
| `focusedBorderColor`   | `string`                    | `"green"`    | Border color for focused pane                    |
| `unfocusedBorderColor` | `string`                    | `"gray"`     | Border color for unfocused panes                 |
| `renderPaneTitle`      | `(id: string) => string`    | --           | Render pane title in border                      |

### LayoutNode

The layout tree is built using helper functions:

```ts
import {
  createLeaf,
  splitPane,
  removePane,
  getPaneIds,
  findAdjacentPane,
  resizeSplit,
  swapPanes,
} from "silvery"

// Create a single pane
const single = createLeaf("main")

// Split horizontally
const split = splitPane(single, "main", "horizontal", "sidebar")

// Split vertically
const nested = splitPane(split, "main", "vertical", "bottom")
```

## Usage

```tsx
<SplitView
  layout={layout}
  renderPane={(id) => {
    switch (id) {
      case "main":
        return <MainContent />
      case "sidebar":
        return <Sidebar />
      default:
        return <Text>Unknown pane: {id}</Text>
    }
  }}
  focusedPaneId={focusedPane}
  renderPaneTitle={(id) => id.toUpperCase()}
/>
```

## Helper Functions

| Function                                      | Description                 |
| --------------------------------------------- | --------------------------- |
| `createLeaf(id)`                              | Create a single leaf pane   |
| `splitPane(layout, paneId, direction, newId)` | Split a pane into two       |
| `removePane(layout, paneId)`                  | Remove a pane from the tree |
| `getPaneIds(layout)`                          | Get all pane IDs            |
| `findAdjacentPane(layout, paneId, direction)` | Find adjacent pane          |
| `resizeSplit(layout, splitId, ratio)`         | Resize a split              |
| `swapPanes(layout, id1, id2)`                 | Swap two panes              |
| `getSplitTabOrder(layout)`                    | Get tab order of panes      |

## See Also

- [Box](./Box.md) -- base layout container
- [Screen](./Screen.md) -- fullscreen root component
