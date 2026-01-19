# Kanban Board Example

A 3-column kanban board demonstrating InkX's multi-pane layouts and scrolling.

## Features

- **3 columns** - Todo, In Progress, Done
- **Move cards** between columns with `<` and `>` keys
- **Independent scrolling** per column
- **Color-coded tags** for card categorization

## Run

```bash
bun run examples/kanban/index.tsx
```

## Controls

- `Left Arrow` / `h` - Select previous column
- `Right Arrow` / `l` - Select next column
- `Up Arrow` / `k` - Select previous card in column
- `Down Arrow` / `j` - Select next card in column
- `<` / `,` - Move selected card to previous column
- `>` / `.` - Move selected card to next column
- `q` / `Escape` - Quit

## Key InkX Features Demonstrated

- Multiple `Box` containers with `flexGrow={1}` for equal column widths
- Independent scroll state per column
- `overflow="hidden"` with manual scroll offset tracking
- Nested borders with conditional `borderColor`
- Dynamic card movement between columns with state management
- `backgroundColor` for column header highlighting
