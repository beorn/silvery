# Kitty Keyboard Protocol Support

Silvery fully supports the Kitty keyboard protocol for unambiguous key identification, modifier detection, and key event types.

## What is the Kitty Keyboard Protocol?

The [Kitty keyboard protocol](https://sw.kovidgoyal.net/kitty/keyboard-protocol/) is a modern terminal keyboard protocol that solves fundamental limitations of traditional terminal input handling. It was created by Kovid Goyal for the Kitty terminal emulator and has since been adopted by many other terminals.

### The Problem with Traditional Terminal Input

Traditional terminals encode keypresses using ASCII control codes and escape sequences. This creates ambiguities:

| Keys                   | Both Send | Why?                                        |
| ---------------------- | --------- | ------------------------------------------- |
| `Ctrl+I` / `Tab`       | `0x09`    | Tab is ASCII character 9, same as Ctrl+I    |
| `Ctrl+M` / `Enter`     | `0x0D`    | Carriage return is ASCII 13, same as Ctrl+M |
| `Ctrl+[` / `Escape`    | `0x1B`    | Escape is ASCII 27, same as Ctrl+[          |
| `Ctrl+H` / `Backspace` | `0x08`    | Backspace is ASCII 8, same as Ctrl+H        |

Additionally, many key combinations are simply undetectable:

- `Ctrl+Shift+<letter>` - Shift state is lost
- `Ctrl+<number>` - Most produce no output
- Key release events - Not reported at all
- `Super/Hyper` modifiers - Not transmitted

### Progressive Enhancement Mode

The Kitty protocol uses **progressive enhancement** - applications opt-in to enhanced features using a flags bitmask. This allows:

1. Applications to request only the features they need
2. Graceful fallback when features aren't supported
3. Backward compatibility with legacy applications

Enhancement flags (binary bitmask):

| Bit     | Value | Feature                                                                 |
| ------- | ----- | ----------------------------------------------------------------------- |
| 0b1     | 1     | **Disambiguate escape codes** - All keys use unambiguous `CSI u` format |
| 0b10    | 2     | **Report event types** - Distinguish press, repeat, and release         |
| 0b100   | 4     | **Report alternate keys** - Include shifted/alternate key variants      |
| 0b1000  | 8     | **Report all keys as escape codes** - Even plain letters                |
| 0b10000 | 16    | **Report associated text** - Include Unicode text for the key           |

For Silvery, flags `1` (disambiguate), `2` (event types), and `8` (all keys) are the most valuable. With all three enabled, Silvery can track modifier-only key presses (bare ⌘, bare ⇧) and bridge that state into mouse events — so `e.metaKey` on click events accurately reflects whether Cmd is held. See [Unified Modifier Tracking](../reference/input-features.md#unified-modifier-tracking).

### Key Encoding Format

Keys are encoded as:

```
CSI unicode-key-code : alternates ; modifiers : event-type ; text u
```

Only `unicode-key-code` is mandatory. For example:

- `a` key: `CSI 97 u` (97 = Unicode for 'a')
- `Ctrl+a`: `CSI 97 ; 5 u` (5 = 1 + ctrl modifier)
- `Tab`: `CSI 9 u` (9 = tab key code)
- `Ctrl+i`: `CSI 105 ; 5 u` (105 = 'i', with ctrl - DISTINGUISHABLE from Tab!)

### Modifier Encoding

Modifiers use a bitmask with an offset of +1:

```
Value = 1 + modifiers

where modifiers bits are:
  shift     = 0b1       (1)
  alt       = 0b10      (2)
  ctrl      = 0b100     (4)
  super     = 0b1000    (8)
  hyper     = 0b10000   (16)
  meta      = 0b100000  (32)
  caps_lock = 0b1000000 (64)
  num_lock  = 0b10000000 (128)
```

For example, `Ctrl+Shift` = `1 + 1 + 4 = 6`.

### Event Types

When flag 2 is enabled, event types are reported:

| Type    | Code | Description                          |
| ------- | ---- | ------------------------------------ |
| Press   | 1    | Key pressed (default, often omitted) |
| Repeat  | 2    | Key held down, repeating             |
| Release | 3    | Key released                         |

Example: `CSI 97 ; 1 : 3 u` = 'a' key released.

## Terminal Support

### Terminals with Full Support

| Terminal                                   | Platform              | Notes                        |
| ------------------------------------------ | --------------------- | ---------------------------- |
| [Kitty](https://sw.kovidgoyal.net/kitty/)  | Linux, macOS          | The reference implementation |
| [WezTerm](https://wezfurlong.org/wezterm/) | Linux, macOS, Windows | Full support                 |
| [foot](https://codeberg.org/dnkl/foot)     | Linux (Wayland)       | Full support                 |
| [Ghostty](https://ghostty.org/)            | macOS, Linux          | Full support                 |
| [Alacritty](https://alacritty.org/)        | Cross-platform        | Full support (added 2024)    |
| [iTerm2](https://iterm2.com/)              | macOS                 | Full support                 |
| [rio](https://raphamorim.io/rio/)          | Cross-platform        | Full support                 |

### Terminals Without Support

| Terminal           | Platform | Notes                          |
| ------------------ | -------- | ------------------------------ |
| macOS Terminal.app | macOS    | No plans for support           |
| GNOME Terminal     | Linux    | Uses VTE, no support yet       |
| Konsole            | Linux    | No support                     |
| Windows Terminal   | Windows  | No support (may add in future) |

### Terminal Multiplexers

| Multiplexer | Support | Notes                        |
| ----------- | ------- | ---------------------------- |
| tmux        | Partial | Must enable passthrough mode |
| screen      | No      | Legacy protocol only         |
| Zellij      | Yes     | Full passthrough support     |

### Applications Using the Protocol

Major applications that have adopted the protocol:

- **Editors**: Neovim, Vim, Helix, Kakoune, dte
- **Shells**: fish, nushell
- **File managers**: Yazi, far2l
- **Libraries**: notcurses, crossterm, textual, bubbletea, vaxis

## Detecting Terminal Support

### Query-based Detection

Send the query sequence and check for a response:

```typescript
// Query current keyboard mode
stdout.write("\x1b[?u")

// Terminal will respond with:
// CSI ? flags u   (if supported)
// Nothing         (if not supported, will show garbage or be ignored)
```

### Robust Detection Pattern

```typescript
async function detectKittyProtocol(stdin, stdout): Promise<boolean> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      cleanup()
      resolve(false)
    }, 100)

    function onData(data: Buffer) {
      const str = data.toString()
      // Look for CSI ? <number> u response
      if (/\x1b\[\?\d+u/.test(str)) {
        cleanup()
        resolve(true)
      }
    }

    function cleanup() {
      clearTimeout(timeout)
      stdin.removeListener("data", onData)
    }

    stdin.on("data", onData)

    // Query current mode, then query device attributes (fallback)
    stdout.write("\x1b[?u\x1b[c")
  })
}
```

### Using Primary Device Attributes as Fallback

If the terminal doesn't respond to `CSI ? u`, it will respond to `CSI c` (device attributes). By sending both, you can detect support with a timeout:

1. Send `\x1b[?u\x1b[c`
2. If you get `CSI ? <n> u` before `CSI ? <attrs> c`, protocol is supported
3. If you only get device attributes, protocol is not supported

## Usage in Silvery

### Enabling the Protocol

`run()` auto-detects Kitty protocol support and enables it by default on supported terminals (Ghostty, Kitty, WezTerm, foot):

```tsx
import { run } from "@silvery/ag-term/runtime"

// Auto-enabled — ⌘ and ✦ modifiers just work
await run(<App />)

// Opt out if needed
await run(<App />, { kitty: false })

// Specific flags for advanced features:
import { KittyFlags } from "silvery"
await run(<App />, { kitty: KittyFlags.DISAMBIGUATE | KittyFlags.REPORT_EVENTS })
```

Silvery handles the full lifecycle: detect support, enable on startup, disable on exit (including crash/SIGINT).

### Enhanced Key Fields

When the protocol is active, the `Key` object includes additional fields:

| Field            | Type          | Description                                                        |
| ---------------- | ------------- | ------------------------------------------------------------------ |
| `super`          | `boolean`     | Cmd/Super modifier (Kitty bit 3)                                   |
| `hyper`          | `boolean`     | Hyper modifier (Kitty bit 4)                                       |
| `eventType`      | `1 \| 2 \| 3` | Press (1), repeat (2), release (3). Requires `REPORT_EVENTS` flag. |
| `capsLock`       | `boolean`     | CapsLock is active                                                 |
| `numLock`        | `boolean`     | NumLock is active                                                  |
| `shiftedKey`     | `string`      | Character produced when Shift is held                              |
| `baseLayoutKey`  | `string`      | Key on standard US layout (for non-Latin keyboards)                |
| `associatedText` | `string`      | Decoded text from `REPORT_TEXT` mode                               |

### Protocol Control Functions

```typescript
import { enableKittyKeyboard, disableKittyKeyboard, queryKittyKeyboard, KittyFlags } from "silvery"

enableKittyKeyboard(KittyFlags.DISAMBIGUATE) // CSI > flags u
disableKittyKeyboard() // CSI < u (pop stack)
queryKittyKeyboard() // CSI ? u (detect support)
```

### Detection

```typescript
import { detectKittySupport, detectKittyFromStdio } from "silvery"

// Low-level: send query, parse response
const supported = await detectKittySupport(write, read, timeout)

// Convenience: detect using real stdio
const supported = await detectKittyFromStdio(stdout, stdin, timeout)
```

## API Design Examples

### Basic Usage (Auto-detection)

```tsx
import { render, useInput } from "silvery"

function App() {
  useInput((input, key) => {
    // With Kitty protocol, these are now distinguishable!
    if (key.tab && !key.ctrl) {
      // User pressed Tab
    }
    if (key.ctrl && input === "i") {
      // User pressed Ctrl+I (NOT Tab!)
    }
  })

  return <Text>Tab and Ctrl+I are now different!</Text>
}

// Enable Kitty protocol (falls back gracefully)
using term = createTerm()
const app = render(<App />, term, { kittyKeyboard: true })
await app.run()
```

### Key Release Events

```tsx
function Game() {
  const [isJumping, setIsJumping] = useState(false)

  useInput((input, key) => {
    if (input === " ") {
      if (key.eventType === "press") {
        setIsJumping(true)
      } else if (key.eventType === "release") {
        setIsJumping(false)
      }
    }
  })

  return <Text>{isJumping ? "Jumping!" : "On ground"}</Text>
}

using term = createTerm()
const app = render(<Game />, term, {
  kittyKeyboard: { reportRelease: true },
})
await app.run()
```

### Checking Protocol Support

```tsx
function App() {
  const rt = useRuntime()
  // Kitty support is auto-detected at startup — run() enables it by default
  // on supported terminals (Ghostty, Kitty, WezTerm, foot)

  return (
    <Box flexDirection="column">
      <Text>Kitty protocol: check terminal capabilities</Text>
      <Text dimColor>Tip: Use Kitty, WezTerm, or iTerm2 for enhanced keyboard support</Text>
    </Box>
  )
}
```

## Backward Compatibility

### Graceful Degradation

When Kitty protocol is requested but not supported:

1. Detection returns false
2. `kittyProtocolEnabled` context value is false
3. Input parsing uses legacy escape sequences
4. All existing code continues to work

### API Stability

The existing `Key` interface properties remain unchanged. New properties are optional and only populated when the protocol is active:

```typescript
// Existing code continues to work
useInput((input, key) => {
  if (key.tab) {
    // Still works - might be Tab or Ctrl+I
  }
})

// Enhanced code can check for disambiguation
useInput((input, key) => {
  if (key.kittyProtocol) {
    // Can trust that Tab and Ctrl+I are distinct
  }
})
```

## Before/After Comparison

### Before (Legacy Protocol)

```tsx
useInput((input, key) => {
  // PROBLEM: Cannot distinguish these
  if (key.tab) {
    // Could be Tab OR Ctrl+I - no way to know
    handleIndent() // User wanted Ctrl+I for something else!
  }

  // PROBLEM: Cannot detect key release
  if (input === "w") {
    moveForward() // Keeps triggering on repeat
    // No way to know when user lifts finger
  }

  // PROBLEM: No Super/Hyper modifiers
  if (key.meta && input === "s") {
    // This is Alt+S, but user pressed Cmd+S
    // Cmd is intercepted by terminal
  }
})
```

### After (Kitty Protocol)

```tsx
useInput((input, key) => {
  // SOLVED: Tab and Ctrl+I are distinct
  if (key.tab && !key.ctrl) {
    handleIndent()
  }
  if (key.ctrl && input === "i") {
    showInfo() // Separate action!
  }

  // SOLVED: Key release detection
  if (input === "w") {
    if (key.eventType === "press") {
      startMovingForward()
    } else if (key.eventType === "release") {
      stopMovingForward()
    }
  }

  // SOLVED: Super modifier available (if terminal supports)
  if (key.super && input === "s") {
    save() // Actually Cmd+S on macOS
  }
})
```

## Testing

Use `kittyMode: true` on `createRenderer` to route `press()` through Kitty encoding, and `keyToKittyAnsi()` to generate raw sequences:

```tsx
import { createRenderer, keyToKittyAnsi } from "@silvery/test"

const render = createRenderer({ cols: 80, rows: 24, kittyMode: true })

test("Super+j triggers action", async () => {
  const app = render(<App />)
  await app.press("Super+j")
  expect(app.text).toContain("action triggered")
})

// Generate raw sequences for direct stdin writing
keyToKittyAnsi("Super+j") // '\x1b[106;9u'
keyToKittyAnsi("Meta+Enter") // '\x1b[13;3u'
```

## References

- [Kitty Keyboard Protocol Specification](https://sw.kovidgoyal.net/kitty/keyboard-protocol/)
- [Terminal Compatibility Matrix](https://tmuxai.dev/terminal-compatibility/)
- [notcurses implementation](https://github.com/dankamongmen/notcurses)
- [crossterm implementation](https://github.com/crossterm-rs/crossterm)
