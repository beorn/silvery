# Silvery Examples & Showcases

## Directory Structure

| Directory      | What                                                                       |
| -------------- | -------------------------------------------------------------------------- |
| `components/`  | Simple component demos — `run()` + React hooks, one per component          |
| `apps/`        | Full apps — `render()` / `createApp()` / `pipe()`, richer state management |
| `interactive/` | Debug tools (underscore-prefixed files only)                               |
| `inline/`      | Inline mode examples (no alt screen)                                       |
| `kitty/`       | Kitty protocol demos                                                       |
| `layout/`      | Layout engine examples                                                     |
| `runtime/`     | Runtime layer demos (run, createApp, createStore)                          |
| `playground/`  | Quick prototyping                                                          |
| `web/`         | Browser renderers (DOM, Canvas2D)                                          |
| `screenshots/` | Reference screenshots for visual regression                                |

### Two tiers of examples

**Component examples** (`components/`) use `run()` + `useState`/`useInput` — no store, no TEA, no `@silvery/create`. They are the "getting started" examples: short (30-60 lines), self-contained, one component per file.

**App examples** (`apps/`) demonstrate full app patterns: `render()` with `createTerm()`, `createApp()` with stores, `pipe()` composition. They showcase real-world usage with multiple components working together.

## Making a Great Showcase

### Design Principles

1. **Show, don't tell.** A showcase should demonstrate Silvery features through working UI, not walls of text. Intro text is fine — but collapse it once the demo starts.

2. **Auto-size to content.** `ListView` auto-sizes to its content — no manual height management. The output phase caps output at terminal height independently. Content that exceeds terminal height causes natural terminal scrolling.

3. **Single status bar.** Keep the status bar to one line. Include: context bar, elapsed time, cost, and key hints. Remove anything that doesn't help the user interact.

4. **Conditional headers.** Show feature bullets before the demo starts (when there's space). Collapse to a one-liner once content fills the screen.

5. **Respect terminal width.** Boxes with borders at 120 cols should leave room for the border characters. Test at 80 and 120 cols.

6. **Streaming feels real.** For coding agent demos: thinking spinner (1-2s) → word-by-word text reveal → tool call spinner → output. Use `setInterval` at 50ms with 8-12% fraction increments.

### Scrollback Pattern

Use `ListView` — it handles terminal height, footer pinning, and overflow automatically:

```tsx
function App() {
  return (
    <ListView
      items={items}
      getKey={(item) => item.id}
      height={process.stdout.rows ?? 24}
      estimateHeight={3}
      renderItem={(item) => <ItemView item={item} />}
      cache={{
        mode: "virtual",
        isCacheable: (item) => item.done,
      }}
      listFooter={<StatusBar />}
    />
  )
}

await render(<App />, term, { mode: "inline" })
```

`ListView` with cache mode "virtual" caches completed items for performance. The output phase independently caps output at terminal height, so content that exceeds the terminal causes natural scrolling. The `listFooter` stays pinned at the bottom of the content.

### Theme Tokens

Use semantic `$token` colors instead of hardcoded values:

| Token             | Use for                               |
| ----------------- | ------------------------------------- |
| `$fg-accent`      | Active elements, progress bars, links |
| `$fg-success`     | Completed items, checkmarks           |
| `$fg-warning`     | Caution, compaction                   |
| `$fg-error`       | Failures, diff removals               |
| `$fg-muted`       | Secondary info, timestamps            |
| `$border-default` | Default border color                  |

### Testing Showcases

1. **Visual check**: Run in TTY and step through all states
2. **Resize**: Verify layout adapts to terminal resize
3. **Scrollback**: After frozen items, scroll up — verify colors/borders preserved
4. **Width**: Test at 80 and 120 columns
5. **Fast mode**: `--fast` flag should skip all animation for quick validation
