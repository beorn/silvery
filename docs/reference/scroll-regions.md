# Scroll Region Optimization (DECSTBM)

Terminal scroll regions allow the terminal emulator to natively shift
content up or down within a defined row range, avoiding full re-renders.

## How It Works

1. **Set scroll region** -- DECSTBM (`ESC [ top ; bottom r`) restricts
   scrolling operations to the specified row range.
2. **Scroll content** -- SU (`ESC [ n S`) scrolls up, SD (`ESC [ n T`)
   scrolls down within the region.
3. **Reset** -- `ESC [ r` restores the scroll region to the full terminal.

The terminal hardware-accelerates the content shift. Only the newly
revealed rows need to be painted by the application, which reduces
both CPU work and visual tearing.

## Utility Functions

```ts
import {
  setScrollRegion,
  resetScrollRegion,
  scrollUp,
  scrollDown,
  moveCursor,
  supportsScrollRegions,
} from "@silvery/term";
```

| Function                               | Description                           |
| -------------------------------------- | ------------------------------------- |
| `setScrollRegion(stdout, top, bottom)` | Set DECSTBM region (1-indexed rows)   |
| `resetScrollRegion(stdout)`            | Reset to full terminal                |
| `scrollUp(stdout, lines?)`             | Scroll content up (default: 1 line)   |
| `scrollDown(stdout, lines?)`           | Scroll content down (default: 1 line) |
| `moveCursor(stdout, row, col)`         | Move cursor to position (1-indexed)   |
| `supportsScrollRegions()`              | Auto-detect terminal support          |

## useScrollRegion Hook

```ts
import { useScrollRegion } from "@silvery/term/hooks";
```

Tracks scroll offset changes and emits DECSTBM sequences automatically.
Returns the scroll delta so the renderer knows which rows to repaint.

```tsx
function ScrollableArea({ items, scrollOffset }) {
  const { isActive, scrollDelta } = useScrollRegion({
    top: 2, // 0-indexed screen row
    bottom: 20, // 0-indexed screen row
    scrollOffset,
    // enabled: true  // default: auto-detect
  });

  // scrollDelta tells you how many rows shifted:
  //   > 0 = scrolled down (new rows at bottom)
  //   < 0 = scrolled up (new rows at top)
  //   0   = no scroll (full repaint)
  return <VirtualList items={items} />;
}
```

### Options

| Option         | Type                 | Default        | Description             |
| -------------- | -------------------- | -------------- | ----------------------- |
| `top`          | `number`             | --             | Top row (0-indexed)     |
| `bottom`       | `number`             | --             | Bottom row (0-indexed)  |
| `scrollOffset` | `number`             | --             | Current scroll position |
| `enabled`      | `boolean`            | auto-detect    | Force on/off            |
| `stdout`       | `NodeJS.WriteStream` | process.stdout | Output stream           |

### Return Value

| Field         | Type      | Description                                  |
| ------------- | --------- | -------------------------------------------- |
| `isActive`    | `boolean` | Whether scroll region optimization is active |
| `scrollDelta` | `number`  | Lines shifted since last render              |

## Terminal Compatibility

DECSTBM is widely supported by modern terminals:

| Terminal  | Supported |
| --------- | --------- |
| Ghostty   | Yes       |
| iTerm2    | Yes       |
| Kitty     | Yes       |
| WezTerm   | Yes       |
| xterm     | Yes       |
| tmux      | Yes       |
| screen    | Yes       |
| VS Code   | Yes       |
| Linux tty | No        |

`supportsScrollRegions()` checks `TERM_PROGRAM` and `TERM` environment
variables to auto-detect support. Override with the `enabled` option
when you know the target environment.
