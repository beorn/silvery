# inkx Examples & Showcases

## Directory Structure

| Directory      | What                                                       |
| -------------- | ---------------------------------------------------------- |
| `interactive/` | Full apps — run with `bun examples/interactive/<name>.tsx` |
| `inline/`      | Inline mode examples (no alt screen)                       |
| `kitty/`       | Kitty protocol demos                                       |
| `layout/`      | Layout engine examples                                     |
| `runtime/`     | Runtime layer demos (run, createApp, createStore)          |
| `playground/`  | Quick prototyping                                          |
| `web/`         | Browser renderers (DOM, Canvas2D)                          |
| `screenshots/` | Reference screenshots for visual regression                |

## Making a Great Showcase

### Design Principles

1. **Show, don't tell.** A showcase should demonstrate inkx features through working UI, not walls of text. Intro text is fine — but collapse it once the demo starts.

2. **Auto-size to content.** `ScrollbackView`/`ScrollbackList` auto-size to their content — no manual height management. The output phase caps output at terminal height independently. Content that exceeds terminal height causes natural terminal scrolling.

3. **Single status bar.** Keep the status bar to one line. Include: context bar, elapsed time, cost, and key hints. Remove anything that doesn't help the user interact.

4. **Conditional headers.** Show feature bullets before the demo starts (when there's space). Collapse to a one-liner once content fills the screen.

5. **Respect terminal width.** Boxes with borders at 120 cols should leave room for the border characters. Test at 80 and 120 cols.

6. **Streaming feels real.** For coding agent demos: thinking spinner (1-2s) → word-by-word text reveal → tool call spinner → output. Use `setInterval` at 50ms with 8-12% fraction increments.

7. **Clean exit.** Call `process.exit(0)` after `waitUntilExit()` until the event loop hang is fixed (see `km-inkx.event-loop-hang`).

### Scrollback Pattern

Use `ScrollbackList` (or `ScrollbackView`) — they handle terminal height, footer pinning, and overflow automatically:

```tsx
function App() {
  return (
    <ScrollbackList
      items={items}
      keyExtractor={(item) => item.id}
      isFrozen={(item) => item.done}
      markers={true}
      footer={<StatusBar />}
      footerHeight={1}
    >
      {(item) => <ItemView item={item} />}
    </ScrollbackList>
  )
}

await render(<App />, term, { mode: "inline" })
```

`ScrollbackView` auto-sizes to its content — no manual height management. The output phase independently caps output at terminal height (via `inlineFullRender()`), so content that exceeds the terminal causes natural scrolling. The footer stays pinned at the bottom of the content.

### Theme Tokens

Use semantic `$token` colors instead of hardcoded values:

| Token      | Use for                               |
| ---------- | ------------------------------------- |
| `$primary` | Active elements, progress bars, links |
| `$success` | Completed items, checkmarks           |
| `$warning` | Caution, compaction                   |
| `$error`   | Failures, diff removals               |
| `$muted`   | Secondary info, timestamps            |
| `$border`  | Default border color                  |

### Testing Showcases

1. **Visual check**: Run in TTY and step through all states
2. **Resize**: Verify layout adapts to terminal resize
3. **Scrollback**: After frozen items, scroll up — verify colors/borders preserved
4. **Width**: Test at 80 and 120 columns
5. **Fast mode**: `--fast` flag should skip all animation for quick validation

## Known Issues

- **Event loop hang**: `render()` unmount doesn't fully release all event loop references. Use `process.exit(0)` after `waitUntilExit()` as a workaround. Tracked in `km-inkx.event-loop-hang`.
