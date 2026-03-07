# ansi Roadmap

## v0.1.0 (Current)

- [x] Extended underline styles (curly, dotted, dashed, double)
- [x] Independent underline color (RGB)
- [x] Combined style + color
- [x] OSC 8 hyperlinks
- [x] Terminal capability detection
- [x] Graceful fallback system
- [x] `stripAnsi()` and `displayLength()` utilities
- [x] Storybook for visual testing

## v0.2.0 (Planned)

### Enhanced Hyperlinks

- [ ] `hyperlink()` with optional `id` parameter for grouped links
- [ ] `hyperlinkWithFallback()` - show URL in parentheses on unsupported terminals
- [ ] Detection function `supportsHyperlinks()`

### File and Custom Protocol Links

- [ ] `fileLink(path, text)` - create `file://` links
- [ ] `vscodeLink(path, line?, column?)` - create `vscode://` links
- [ ] `customLink(protocol, path, text)` - arbitrary protocols

### Improved Detection

- [ ] Per-feature detection (not just boolean)
- [ ] Runtime terminal capability query (OSC 4/10/11)
- [ ] SSH session detection (graceful degradation)
- [ ] tmux/screen passthrough mode

## v0.3.0 (Planned)

### Extended Attributes

- [ ] `overline(text)` - SGR 53/55
- [ ] `superscript(text)` - terminal-dependent
- [ ] `subscript(text)` - terminal-dependent

### Cursor Styles

- [ ] `hideCursor()` / `showCursor()` - CSI ?25l/?25h
- [ ] `saveCursor()` / `restoreCursor()` - CSI s/u
- [ ] Cursor shape control (block, underline, bar)

### Text Decoration Stacking

- [ ] Multiple decoration styles on same text
- [ ] Proper nesting and reset handling

## v0.4.0 (Future)

### Images (Kitty Graphics Protocol)

- [ ] Inline image support for Kitty/iTerm2
- [ ] Base64 image embedding
- [ ] Image sizing and placement

### Notifications

- [ ] Desktop notifications via OSC 9 (iTerm2) / OSC 777 (urxvt)

### Clipboard

- [ ] Read/write clipboard via OSC 52

### Advanced Unicode

- [ ] Proper width calculation for CJK, emoji
- [ ] Grapheme cluster handling

## Fallback Strategy

ansi implements a tiered fallback approach:

| Feature          | Modern Terminal     | Basic Terminal | No Color  |
| ---------------- | ------------------- | -------------- | --------- |
| Curly underline  | `\x1b[4:3m`         | `\x1b[4m`      | (none)    |
| Underline color  | `\x1b[58:2::r:g:bm` | (ignored)      | (none)    |
| Hyperlink        | Full OSC 8          | Text only      | Text only |
| Bold + underline | Both applied        | Both applied   | (none)    |

Detection happens once at startup and caches the result. Override via `createTerm()` capability options.
