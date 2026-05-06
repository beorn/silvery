# Terminal Compatibility Matrix

_Terminal capabilities last verified: 2026-03._

Comprehensive reference of terminal emulator feature support as detected by Silvery.

## Capability Matrix

| Terminal     | Colors   | Kitty KB | Kitty Gfx | Sixel | OSC 52 | Hyperlinks | Notify | Paste | Mouse | Sync | Unicode |
| ------------ | -------- | -------- | --------- | ----- | ------ | ---------- | ------ | ----- | ----- | ---- | ------- |
| Ghostty      | 24-bit   | Yes      | Yes       | -     | Yes    | Yes        | -      | Yes   | Yes   | Yes  | Yes     |
| kitty        | 24-bit   | Yes      | Yes       | -     | Yes    | Yes        | Yes    | Yes   | Yes   | Yes  | Yes     |
| WezTerm      | 24-bit   | Yes      | -         | Yes   | Yes    | Yes        | -      | Yes   | Yes   | Yes  | Yes     |
| iTerm2       | 24-bit   | -        | -         | -     | Yes    | Yes        | Yes    | Yes   | Yes   | Yes  | Yes     |
| foot         | 24-bit   | Yes      | -         | Yes   | Yes    | Yes        | -      | Yes   | Yes   | Yes  | Yes     |
| Alacritty    | 24-bit   | -        | -         | -     | Yes    | Yes        | -      | Yes   | Yes   | Yes  | Yes     |
| VS Code      | 24-bit   | -        | -         | -     | -      | -          | -      | Yes   | Yes   | -    | Yes     |
| Terminal.app | 256      | -        | -         | -     | -      | -          | -      | Yes   | Yes   | -    | Yes     |
| tmux         | 24-bit\* | -        | -         | -     | -      | -          | -      | Yes   | Yes   | -    | Yes     |
| TERM=dumb    | -        | -        | -         | -     | -      | -          | -      | Yes   | Yes   | -    | Yes     |

\* tmux color support depends on the outer terminal and tmux configuration.

For comprehensive, feature-by-feature terminal compatibility data beyond what Silvery detects, see [terminfo.dev](https://terminfo.dev).

## Column Descriptions

| Column     | Protocol/Standard | Description                                                |
| ---------- | ----------------- | ---------------------------------------------------------- |
| Colors     | SGR               | Color depth: 24-bit (truecolor), 256, 16 (basic), or none  |
| Kitty KB   | CSI > u           | Kitty keyboard protocol for unambiguous key identification |
| Kitty Gfx  | APC G             | Kitty graphics protocol for inline image display           |
| Sixel      | DCS q             | Sixel graphics for inline image display                    |
| OSC 52     | OSC 52            | Clipboard access (works over SSH)                          |
| Hyperlinks | OSC 8             | Clickable hyperlinks in terminal output                    |
| Notify     | OSC 9/99          | Desktop notifications (OSC 9 = iTerm2, OSC 99 = Kitty)     |
| Paste      | DEC 2004          | Bracketed paste mode (distinguish pasted from typed input) |
| Mouse      | SGR 1003/1006/1016 | SGR mouse tracking (click, drag, scroll); optional SGR-Pixels |
| Sync       | DEC 2026          | Synchronized output (batch rendering to prevent tearing)   |
| Unicode    | -                 | Unicode and emoji rendering                                |

## Terminal Details

### Ghostty

- **Env**: `TERM_PROGRAM=ghostty`, `COLORTERM=truecolor`
- **Keyboard**: Full Kitty keyboard protocol (Cmd, Hyper, event types)
- **Images**: Kitty graphics protocol
- **Clipboard**: OSC 52 (works over SSH)
- **Notes**: Modern GPU-accelerated terminal. No OSC 9/99 notifications.

### kitty

- **Env**: `TERM=xterm-kitty`, `COLORTERM=truecolor`
- **Keyboard**: Full Kitty keyboard protocol (originator of the spec)
- **Images**: Kitty graphics protocol (originator of the spec)
- **Clipboard**: OSC 52
- **Notifications**: OSC 99
- **Notes**: Feature-rich terminal, defines many protocols used by others.

### WezTerm

- **Env**: `TERM_PROGRAM=WezTerm`, `COLORTERM=truecolor`
- **Keyboard**: Kitty keyboard protocol
- **Images**: Sixel graphics
- **Clipboard**: OSC 52
- **Notes**: Cross-platform (macOS, Linux, Windows). Also supports iTerm2 image protocol.

### iTerm2

- **Env**: `TERM_PROGRAM=iTerm.app`, `COLORTERM=truecolor`
- **Keyboard**: Legacy xterm sequences only (no Kitty protocol)
- **Images**: Proprietary iTerm2 inline image protocol (not Kitty or Sixel)
- **Clipboard**: OSC 52
- **Notifications**: OSC 9
- **Notes**: macOS only. Most popular macOS terminal after Terminal.app.

### foot

- **Env**: `TERM=foot` or `TERM=foot-extra`, `COLORTERM=truecolor`
- **Keyboard**: Kitty keyboard protocol
- **Images**: Sixel graphics
- **Clipboard**: OSC 52
- **Notes**: Wayland-native, minimalist, fast. Linux only.

### Alacritty

- **Env**: `TERM_PROGRAM=Alacritty`, `COLORTERM=truecolor`
- **Keyboard**: Legacy xterm sequences only
- **Images**: None (no image protocol support)
- **Clipboard**: OSC 52
- **Notes**: GPU-accelerated, cross-platform. Focused on performance over features. Sync output since 0.14.

### VS Code Integrated Terminal

- **Env**: `TERM_PROGRAM=vscode`, `COLORTERM=truecolor`
- **Notes**: Embedded terminal in VS Code. Basic capabilities. xterm.js-based.

### Terminal.app (macOS)

- **Env**: `TERM_PROGRAM=Apple_Terminal`, `TERM=xterm-256color`
- **Colors**: 256 only (no truecolor)
- **Notes**: macOS built-in. Most limited of common terminals. No OSC 52, no hyperlinks.

### tmux

- **Env**: `TERM=tmux-256color`, also `TMUX` env var set
- **Colors**: Passes through outer terminal's color support (configure with `set -as terminal-features ",*:RGB"`)
- **Keyboard**: Does not pass through Kitty keyboard protocol
- **Notes**: Terminal multiplexer. Capabilities largely depend on the outer terminal and configuration. Use `set -sg escape-time 0` for responsive input.

### CI / Headless (TERM=dumb)

- **Env**: `TERM=dumb` or no TERM set
- **Notes**: No advanced capabilities. Use `renderString()` with `plain: true` for clean output.

## Detection Method

Silvery detects capabilities synchronously from environment variables at startup:

| Variable       | Purpose                                               |
| -------------- | ----------------------------------------------------- |
| `TERM`         | Terminal type (e.g., `xterm-256color`, `xterm-kitty`) |
| `TERM_PROGRAM` | Terminal emulator name (e.g., `ghostty`, `iTerm.app`) |
| `COLORTERM`    | Color capability hint (`truecolor` or `24bit`)        |
| `NO_COLOR`     | Disable all color output when set                     |

```typescript
import { createTerminalProfile } from "@silvery/ag-term"

const profile = createTerminalProfile()
const caps = profile.caps
// caps.colorLevel, caps.kittyKeyboard, caps.osc52, etc.
// profile.colorLevel, profile.colorProvenance — resolved + attribution
```

No I/O is performed -- detection is instant but limited to what env vars reveal. For runtime detection of specific protocols (like Kitty keyboard support), use:

```typescript
import { detectKittyFromStdio } from "@silvery/ag-term"

const result = await detectKittyFromStdio(process.stdout, process.stdin, 200)
// result.supported: boolean, result.flags: number
```

## References

- [ECMA-48 / ISO 6429](https://www.ecma-international.org/publications-and-standards/standards/ecma-48/) -- CSI/OSC standard
- [XTerm Control Sequences](https://invisible-island.net/xterm/ctlseqs/ctlseqs.html) -- de facto terminal standard
- [Kitty Keyboard Protocol](https://sw.kovidgoyal.net/kitty/keyboard-protocol/)
- [Kitty Graphics Protocol](https://sw.kovidgoyal.net/kitty/graphics-protocol/)
- [Sixel Graphics](https://en.wikipedia.org/wiki/Sixel)
- [OSC 8 Hyperlinks](https://gist.github.com/egmontkob/eb114294efbcd5adb1944c9f3cb5feda)
- [Synchronized Output](https://gist.github.com/christianparpart/d8a62cc1ab659194337d73e399004036)
- [Bracketed Paste](https://cirw.in/blog/bracketed-paste)
- [NO_COLOR Standard](https://no-color.org/)
