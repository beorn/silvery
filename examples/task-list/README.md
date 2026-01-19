# Task List Example

A scrollable task list with 60+ items demonstrating InkX's overflow handling.

## Features

- **60 tasks** to demonstrate scrolling behavior
- **Virtual scrolling** - only visible items are rendered
- **Variable height items** - some tasks have expandable subtasks
- **Priority badges** with color coding
- **Toggle completion** with space key

## Run

```bash
bun run examples/task-list/index.tsx
```

## Controls

- `Up Arrow` / `k` - Move cursor up
- `Down Arrow` / `j` - Move cursor down
- `Page Up` - Jump up by page
- `Page Down` - Jump down by page
- `Home` - Jump to first item
- `End` - Jump to last item
- `Space` - Toggle task completion
- `Enter` / `e` - Expand/collapse subtasks
- `q` / `Escape` - Quit

## Key InkX Features Demonstrated

- `overflow="hidden"` to clip content
- Manual scroll state management with cursor tracking
- `Box` with `flexGrow` for dynamic sizing
- Conditional styling with `strikethrough` and `dim`
- `backgroundColor` for selection highlighting
- `useInput()` with full key support (arrows, page up/down, home/end)
