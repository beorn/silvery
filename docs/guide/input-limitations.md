# Input Handling Limitations

Terminal input handling is fundamentally constrained by how terminals communicate with applications. This page documents the known limitations when using `useInput()` in Silvery.

## Keyboard Protocol Limitations

Traditional terminals use a simple protocol where each keypress is sent as a character or escape sequence. This protocol predates modern keyboard conventions and has fundamental ambiguities.

### Indistinguishable Keys

Several key combinations produce identical byte sequences:

| Keys                    | Both Send | Reason                                      |
| ----------------------- | --------- | ------------------------------------------- |
| `Ctrl+I` / `Tab`        | `0x09`    | Tab is ASCII character 9, same as Ctrl+I    |
| `Ctrl+M` / `Enter`      | `0x0D`    | Carriage return is ASCII 13, same as Ctrl+M |
| `Ctrl+[` / `Escape`     | `0x1B`    | Escape is ASCII 27, same as Ctrl+[          |
| `Ctrl+H` / `Backspace`  | `0x08`    | Backspace is ASCII 8, same as Ctrl+H        |
| `Shift+Enter` / `Enter` | `\r`      | Most terminals don't distinguish            |

This means your `useInput` handler cannot tell these apart:

```tsx
useInput((input, key) => {
  // These are IDENTICAL - you cannot distinguish them
  if (key.tab) {
    // Could be Tab OR Ctrl+I
  }
  if (key.return) {
    // Could be Enter OR Ctrl+M
  }
})
```

### Kitty Keyboard Protocol

The [Kitty keyboard protocol](https://sw.kovidgoyal.net/kitty/keyboard-protocol/) solves these ambiguities by encoding modifier state explicitly. Silvery fully supports this protocol:

- Supported terminals: Kitty, WezTerm, foot, Ghostty, Alacritty, iTerm2, rio
- Auto-enabled by `run()` on supported terminals — falls back gracefully on others
- When active, Tab vs Ctrl+I, Enter vs Ctrl+M, and all modifier combinations are fully distinguishable

See [Kitty Protocol](/guide/kitty-protocol) for details.

### Undetectable Key Combinations

Some key combinations cannot be detected at all in traditional terminal mode:

- `Ctrl+Shift+<letter>` - Shift state is lost
- `Ctrl+<number>` - Most produce no output
- `Ctrl+,` / `Ctrl+.` / `Ctrl+;` - No assigned control codes
- `Cmd/Super+<key>` - Usually intercepted by the OS/window manager

## CJK and IME Input

Input Method Editors (IMEs) for Chinese, Japanese, and Korean present challenges for terminal applications.

### IME Composition Window

When typing with an IME, a composition window shows candidate characters. In terminal applications:

- The composition window may flicker during rapid input
- Positioning of the composition window varies by terminal
- Some terminals overlay it at the cursor, others use a separate position

### Synchronized Update Mode

Silvery uses Synchronized Update Mode (SUM) to reduce flicker:

```
\x1b[?2026h  // Begin synchronized update
... render output ...
\x1b[?2026l  // End synchronized update
```

This helps with IME flicker, but:

- Not all terminals support SUM (macOS Terminal does not)
- Terminal multiplexers may have partial support

### Recommendations for CJK Input

1. Use a terminal with good IME support (iTerm2, Kitty, WezTerm)
2. Avoid rapid re-renders during composition
3. Test your app with actual IME input, not just ASCII

## Terminal-Specific Behavior

Different terminals send different escape sequences for the same keys. Silvery handles the most common variants, but edge cases exist.

### Function Key Variations

Function keys F1-F12 have multiple encodings:

| Terminal Style  | F1         | F5         |
| --------------- | ---------- | ---------- |
| xterm (O-style) | `\x1bOP`   | -          |
| xterm ([~style) | `\x1b[11~` | `\x1b[15~` |
| Cygwin/libuv    | `\x1b[[A`  | `\x1b[[E`  |

Silvery recognizes all these variants, but some obscure terminals may use others.

### Navigation Key Variations

Home/End keys also vary:

| Terminal          | Home      | End       |
| ----------------- | --------- | --------- |
| xterm (standard)  | `\x1b[H`  | `\x1b[F`  |
| xterm (alternate) | `\x1b[1~` | `\x1b[4~` |
| rxvt              | `\x1b[7~` | `\x1b[8~` |

### Terminal Comparison

| Feature               | macOS Terminal | iTerm2       | Kitty | WezTerm |
| --------------------- | -------------- | ------------ | ----- | ------- |
| Synchronized Update   | No             | Yes          | Yes   | Yes     |
| Kitty Protocol        | No             | No           | Yes   | Yes     |
| Function keys F1-F12  | Yes            | Yes          | Yes   | Yes     |
| Function keys F13-F24 | Partial        | Yes          | Yes   | Yes     |
| Meta/Alt key          | Option+Esc     | Configurable | Yes   | Yes     |
| IME support           | Basic          | Good         | Good  | Good    |

## Modifier Key Handling

### Meta/Alt Key

The Meta (Alt on PC, Option on Mac) key behavior varies:

- **macOS Terminal**: Option key types special characters by default
- **iTerm2**: Configurable - can send `Esc+<key>` or special characters
- **Linux terminals**: Usually send `Esc+<key>`

Silvery detects meta when it receives `\x1b` followed by a character:

```tsx
useInput((input, key) => {
  if (key.meta && input === "a") {
    // Alt+A or Option+A (when configured to send escape)
  }
})
```

### Ctrl+Shift Combinations

Most terminals cannot distinguish Ctrl+Shift+Letter from Ctrl+Letter:

```tsx
useInput((input, key) => {
  // key.shift may be false even if Shift was held with Ctrl
  if (key.ctrl && input === "a") {
    // Could be Ctrl+A OR Ctrl+Shift+A
  }
})
```

### Shift Detection for Letters

Shift is reliably detected for regular letter input (uppercase vs lowercase):

```tsx
useInput((input, key) => {
  if (input === "A" && key.shift) {
    // Shift+A - this works reliably
  }
})
```

## Terminal Multiplexers

Using tmux, screen, or similar multiplexers adds another layer:

### Additional Limitations in tmux

- Some escape sequences are intercepted by tmux
- Passthrough mode may be required for certain sequences
- Synchronized Update support varies by version
- Function keys may need special configuration

### Recommendations

1. Test your app both inside and outside tmux
2. Document any tmux-specific configuration needed
3. Use simpler key bindings that work universally

## Keys That Work Universally

Despite these limitations, many keys work reliably everywhere:

| Key                   | Reliability                                   |
| --------------------- | --------------------------------------------- |
| Arrow keys            | Excellent                                     |
| Enter/Return          | Excellent                                     |
| Escape                | Excellent                                     |
| Tab                   | Excellent (but indistinguishable from Ctrl+I) |
| Backspace             | Excellent                                     |
| Delete                | Good                                          |
| Home/End              | Good                                          |
| Page Up/Down          | Good                                          |
| F1-F12                | Good                                          |
| Ctrl+A through Ctrl+Z | Good (except Ctrl+I, Ctrl+M, Ctrl+[)          |
| Shift+Tab             | Good                                          |
| Letters and numbers   | Excellent                                     |
| Common punctuation    | Excellent                                     |

## Best Practices

### Design for Compatibility

```tsx
// Good: Use keys that work everywhere
useInput((input, key) => {
  if (key.upArrow || input === "k") moveUp()
  if (key.downArrow || input === "j") moveDown()
  if (key.return) select()
  if (key.escape || input === "q") quit()
})

// Risky: Relies on Ctrl combinations that may conflict
useInput((input, key) => {
  if (key.ctrl && input === "i") {
    // User pressing Tab will trigger this too!
  }
})
```

### Provide Alternative Bindings

When using keys with known limitations, offer alternatives:

```tsx
useInput((input, key) => {
  // Multiple ways to trigger the same action
  if (input === "?" || input === "h" || (key.ctrl && input === "h")) {
    showHelp()
  }
})
```

### Document Your Keybindings

Be explicit about which keys your app uses and any known limitations:

```tsx
function HelpScreen() {
  return (
    <Box flexDirection="column">
      <Text bold>Keybindings:</Text>
      <Text>j/Down - Move down</Text>
      <Text>k/Up - Move up</Text>
      <Text>Enter - Select</Text>
      <Text>Escape - Back</Text>
      <Text dimColor>Note: Ctrl+M is the same as Enter</Text>
    </Box>
  )
}
```

## Enhanced Protocol Support

Silvery ships with full support for modern terminal protocols that resolve the limitations above:

1. **Kitty keyboard protocol** — Enables full modifier detection (Ctrl+Shift, Super, Hyper), key release events, and unambiguous key identification. Auto-enabled by `run()`. See [Kitty Protocol](/guide/kitty-protocol).
2. **Bracketed paste mode** — Distinguishes pasted text from typed input. Built into the runtime with `usePaste()` hook.
3. **Mouse input** — Click, drag, and scroll events via SGR protocol (modes 1003/1006, upgraded to 1016 SGR-Pixels when `run()` can probe terminal cell metrics). Auto-enabled by `run()`. Set `mouse: false` to restore native copy/paste. Components receive DOM-style `onClick`, `onWheel`, etc.
4. **Focus events** — Detect when the terminal gains/loses focus via the focus system and `useFocusable()` hook. Auto-enabled by `run()`.

All features are auto-enabled by `run()` and gracefully degrade in unsupported terminals. Pass `false` to opt out.
