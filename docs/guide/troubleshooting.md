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

- Run with `SILVERY_STRICT=1` to compare incremental vs fresh render output on every frame.
- If a mismatch is found, file a bug with the minimal reproduction.
- Use `withDiagnostics({ checkIncremental: true })` in tests to catch these automatically.

### useInput not receiving keys

- Ensure `InputLayerProvider` wraps your app if using `useInputLayer`.
- Check that stdin is in raw mode (`term.hasInput()` returns `true`).
- Verify no other input layer is consuming the key before yours (layers are LIFO).

### Layout oscillation / infinite loops

- Silvery has built-in containment for `useContentRect` that detects and breaks oscillation loops.
- If you see oscillation, check for circular dependencies in layout — e.g., a component that changes its size based on `useContentRect` in a way that triggers another layout.
- Avoid setting `width` or `height` dynamically based on `useContentRect` of the same Box.

### Flickering in tmux / Zellij

- Silvery uses Synchronized Update Mode (DEC 2026) by default, which prevents flicker. Verify your multiplexer version supports it (tmux 3.2+).
- To disable sync updates for debugging: `SILVERY_SYNC_UPDATE=0`.

### Colors not appearing

- Check `term.hasColor()` — returns `null` if `NO_COLOR` is set or `TERM=dumb`.
- Verify `COLORTERM=truecolor` is set for true color support.
- Some CI environments strip ANSI codes. Use `renderString(<App />, { plain: true })` for those.

### Kitty keyboard shortcuts not working

- `run()` auto-enables the Kitty protocol on supported terminals. If using `createApp().run()`, pass `kitty: true` explicitly.
- Check that your terminal supports it (Ghostty, Kitty, WezTerm, foot — see [Terminal Capabilities](/reference/terminal-capabilities)).
- iTerm2 and Terminal.app do not support the Kitty protocol.

### Flexily vs Yoga layout differences

If you migrated from Ink (which uses Yoga), some layout behaviors differ with Flexily:

- **Percentage widths**: Flexily resolves `width="50%"` against the parent's content area. Yoga resolves against the parent's total width including padding. If your layout is off by a few cells, check padding on the parent.
- **Default `flexShrink`**: Both default to 1, but Flexily may clamp earlier on zero-width children. If a child collapses unexpectedly, set `flexShrink={0}` explicitly.
- **`flexBasis="auto"`**: Yoga uses the intrinsic content size. Flexily does the same but measures text differently for multi-line content. If text wraps unexpectedly, set an explicit `width`.
- **Gap**: Flexily supports `gap`, `rowGap`, `columnGap` the same as Yoga. If gaps don't appear, verify `flexDirection` is set (gap only applies between flex children along the main axis).

Switch engines to isolate: `SILVERY_ENGINE=yoga bun run app.ts`

### Focus routing debugging

If focus isn't moving where expected:

1. **Enable inspector**: `SILVERY_DEV=1` to visualize the focus tree and see which nodes are `focusable`.
2. **Check `focusable` prop**: Only `<Box focusable>` nodes participate in focus. Text nodes cannot receive focus.
3. **Verify `testID`**: Spatial navigation overrides (`nextFocusUp`, `nextFocusDown`, etc.) reference nodes by `testID`. Missing or mismatched IDs are silently ignored.
4. **Scope boundaries**: If Tab doesn't leave a subtree, a parent has `focusScope` which restricts cycling to that subtree. Remove or restructure the scope.
5. **Debug with `FocusManager`**: Access `fm.activeId` and `fm.focusOrigin` to see what's focused and why.

### VirtualList blank rendering

VirtualList shows blank rows when:

- **`estimateHeight` is far off**: ListView/VirtualList measures actual rendered heights after layout and uses them for scroll math. However, a very inaccurate `estimateHeight` can cause jumpiness on the first render before measurements stabilize. Set it to the most common item height.
- **`data` array changes identity on every render**: Wrap with `useMemo` or hoist the array. Identity changes cause VirtualList to recalculate offsets.
- **Container has no height**: VirtualList needs a parent with a known height (explicit `height` prop or flex layout). Without it, the visible window is zero and nothing renders.
- **`scrollTo` is out of range**: A `scrollTo` value past the last item shows blank space. Clamp to `Math.max(0, data.length - visibleCount)`.

### useContentRect returning zeros

`useContentRect()` returns `{ width: 0, height: 0 }` on the first render because layout hasn't run yet. This is by design.

- **Normal case**: The component re-renders once layout completes (usually the same frame). Your UI should handle `width === 0` gracefully (return `null` or a placeholder).
- **Not updating at all**: Ensure the component's parent has a concrete size. A chain of `flexGrow={1}` without a root-level size means layout can't resolve.
- **In tests**: Call `app.debug()` after render — if the layout is correct in the debug output, the hook is working. If `width` stays 0, check that `createRenderer` has `cols` and `rows` set.
- **Oscillation**: If the component changes its own size based on `useContentRect`, it can loop. Silvery's built-in containment detects this and breaks the cycle automatically.

## Debugging

### Runtime Debug

See **[debugging.md](./debugging.md)** for the full reference: STRICT verification modes, diagnostic workflow, and symptom→check cross-reference.

```bash
SILVERY_STRICT=1 bun run app.ts              # Buffer-level (includes vt100 output check)
SILVERY_STRICT_TERMINAL=xterm bun run app.ts # Independent terminal verification
DEBUG=silvery:* DEBUG_LOG=/tmp/silvery.log bun run app.ts  # Pipeline traces
```

### Test Debug

```tsx
const app = render(<MyComponent />)
app.debug() // Print current frame to console
console.log(app.ansi) // Print with colors
console.log(app.text) // Print plain text (no ANSI)
```
