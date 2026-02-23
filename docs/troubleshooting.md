# Troubleshooting

## Common Issues

### Blank screen / no output

- Check that `using term = createTerm()` is called before `render()`.
- Ensure stdout is a TTY. Piped output needs `renderString()` instead of `render()`.
- Verify the component returns visible content (not `null` or empty fragments).

### Content overflows / truncation

- Text auto-truncates by default. Use `wrap="wrap"` on Text to wrap instead, or `wrap="overflow"` to allow overflow.
- Check `overflow="hidden"` on the parent Box to clip children.
- For scrollable content, use `overflow="scroll"` with a `scrollTo` prop.

### Incremental rendering mismatches

- Run with `INKX_STRICT=1` to compare incremental vs fresh render output on every frame.
- If a mismatch is found, file a bug with the minimal reproduction.
- Use `withDiagnostics({ checkIncremental: true })` in tests to catch these automatically.

### useInput not receiving keys

- Ensure `InputLayerProvider` wraps your app if using `useInputLayer`.
- Check that stdin is in raw mode (`term.hasInput()` returns `true`).
- Verify no other input layer is consuming the key before yours (layers are LIFO).

### Layout oscillation / infinite loops

- inkx has built-in containment for `useContentRect` (see [containment.md](containment.md)).
- If you see oscillation, check for circular dependencies in layout — e.g., a component that changes its size based on `useContentRect` in a way that triggers another layout.
- Avoid setting `width` or `height` dynamically based on `useContentRect` of the same Box.

### Flickering in tmux / Zellij

- inkx uses Synchronized Update Mode (DEC 2026) by default, which prevents flicker. Verify your multiplexer version supports it (tmux 3.2+).
- To disable sync updates for debugging: `INKX_SYNC_UPDATE=0`.

### Colors not appearing

- Check `term.hasColor()` — returns `null` if `NO_COLOR` is set or `TERM=dumb`.
- Verify `COLORTERM=truecolor` is set for true color support.
- Some CI environments strip ANSI codes. Use `renderString(<App />, { plain: true })` for those.

### Kitty keyboard shortcuts not working

- Pass `kitty: true` to `run()` to enable the Kitty keyboard protocol.
- Check that your terminal supports it (Ghostty, Kitty, WezTerm, foot — see [terminal-capabilities.md](terminal-capabilities.md)).
- iTerm2 and Terminal.app do not support the Kitty protocol.

## Debugging

### Runtime Debug

```bash
# Enable incremental vs fresh render comparison
INKX_STRICT=1 bun run app.ts

# Write debug output to file
DEBUG=inkx:* DEBUG_LOG=/tmp/inkx.log bun run app.ts
tail -f /tmp/inkx.log
```

### Test Debug

```tsx
const app = render(<MyComponent />)
app.debug() // Print current frame to console
console.log(app.ansi) // Print with colors
console.log(app.text) // Print plain text (no ANSI)
```
