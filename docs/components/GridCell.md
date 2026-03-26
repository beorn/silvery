# GridCell

Auto-registering wrapper for items in a 2D grid. Wraps a child component and automatically registers its screen position in the `PositionRegistry`. Unregisters on unmount.

## Import

```tsx
import { GridCell } from "silvery"
```

## Props

| Prop           | Type        | Default      | Description                                          |
| -------------- | ----------- | ------------ | ---------------------------------------------------- |
| `sectionIndex` | `number`    | **required** | Section index (e.g., column index in a kanban board) |
| `itemIndex`    | `number`    | **required** | Item index within the section                        |
| `children`     | `ReactNode` | **required** | Child content to render                              |

## Usage

```tsx
<VirtualList
  items={column.items}
  renderItem={(item, idx) => (
    <GridCell sectionIndex={colIndex} itemIndex={idx}>
      <Card {...item} />
    </GridCell>
  )}
/>
```

## Behavior

Renders a transparent Box (no visual impact) around children. Position tracking uses `useScreenRectCallback` (zero re-renders). Requires a `PositionRegistryProvider` ancestor.

## See Also

- [ListView](./ListView.md) -- virtualized list
- [HorizontalVirtualList](./HorizontalVirtualList.md) -- horizontal virtualization
