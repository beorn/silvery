# Dashboard Example

A multi-pane dashboard demonstrating InkX's layout system.

## Features

- **3-column layout** using `flexGrow` for equal distribution
- **Keyboard navigation** between panes with arrow keys
- **Styled borders** that highlight the selected pane
- **Progress bars** with visual indicators

## Run

```bash
bun run examples/dashboard/index.tsx
```

## Controls

- `Left Arrow` / `h` - Select previous pane
- `Right Arrow` / `l` - Select next pane
- `q` / `Escape` - Quit

## Key InkX Features Demonstrated

- `Box` with `flexGrow` for proportional layouts
- `useInput()` for keyboard handling
- `useApp()` for exit control
- `borderStyle` and `borderColor` for visual styling
- Nested `Box` layouts with `flexDirection`
- Conditional styling based on selection state
