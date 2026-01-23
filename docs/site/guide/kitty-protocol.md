# Kitty Keyboard Protocol Support

This document outlines the research and implementation plan for adding Kitty keyboard protocol support to inkx (issue km-ax55).

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

For inkx, flags `1` (disambiguate) and `2` (event types) are the most valuable.

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
stdout.write("\x1b[?u");

// Terminal will respond with:
// CSI ? flags u   (if supported)
// Nothing         (if not supported, will show garbage or be ignored)
```

### Robust Detection Pattern

```typescript
async function detectKittyProtocol(stdin, stdout): Promise<boolean> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      cleanup();
      resolve(false);
    }, 100);

    function onData(data: Buffer) {
      const str = data.toString();
      // Look for CSI ? <number> u response
      if (/\x1b\[\?\d+u/.test(str)) {
        cleanup();
        resolve(true);
      }
    }

    function cleanup() {
      clearTimeout(timeout);
      stdin.removeListener("data", onData);
    }

    stdin.on("data", onData);

    // Query current mode, then query device attributes (fallback)
    stdout.write("\x1b[?u\x1b[c");
  });
}
```

### Using Primary Device Attributes as Fallback

If the terminal doesn't respond to `CSI ? u`, it will respond to `CSI c` (device attributes). By sending both, you can detect support with a timeout:

1. Send `\x1b[?u\x1b[c`
2. If you get `CSI ? <n> u` before `CSI ? <attrs> c`, protocol is supported
3. If you only get device attributes, protocol is not supported

## Implementation Plan for inkx

### Phase 1: Protocol Detection and Opt-in

Add protocol detection at render initialization:

```typescript
interface KittyProtocolOptions {
  /** Enable Kitty keyboard protocol if supported */
  kittyKeyboard?:
    | boolean
    | {
        /** Request key release events */
        reportRelease?: boolean;
        /** Request key repeat events */
        reportRepeat?: boolean;
        /** Report all keys (including plain letters) as CSI sequences */
        reportAllKeys?: boolean;
      };
}

interface RenderOptions {
  // ... existing options ...
  kittyKeyboard?: KittyProtocolOptions["kittyKeyboard"];
}
```

### Phase 2: Enhanced Key Type

Extend the `Key` interface to expose new capabilities:

```typescript
export interface Key {
  // Existing properties
  upArrow: boolean;
  downArrow: boolean;
  leftArrow: boolean;
  rightArrow: boolean;
  return: boolean;
  escape: boolean;
  ctrl: boolean;
  shift: boolean;
  meta: boolean;
  tab: boolean;
  backspace: boolean;
  delete: boolean;
  pageUp: boolean;
  pageDown: boolean;
  home: boolean;
  end: boolean;

  // New: Enhanced modifier support (Kitty protocol)
  /** Super/Windows/Command key (distinct from meta in Kitty) */
  super?: boolean;
  /** Hyper modifier */
  hyper?: boolean;
  /** Caps Lock state */
  capsLock?: boolean;
  /** Num Lock state */
  numLock?: boolean;

  // New: Event type (Kitty protocol with flag 2)
  /**
   * Event type: 'press', 'repeat', or 'release'
   * Only available when Kitty protocol is enabled with reportRelease/reportRepeat
   * @default 'press'
   */
  eventType?: "press" | "repeat" | "release";

  // New: Disambiguation (Kitty protocol)
  /**
   * Whether this key event came from Kitty protocol (unambiguous)
   * When true, Ctrl+I and Tab are distinguishable
   */
  kittyProtocol?: boolean;
}
```

### Phase 3: Protocol Lifecycle Management

Enable/disable the protocol with proper cleanup:

```typescript
// On render start (if kittyKeyboard enabled)
function enableKittyProtocol(flags: number): void {
  // Push current mode to stack, set new mode
  stdout.write(`\x1b[>${flags}u`);
}

// On render unmount (CRITICAL: must always run)
function disableKittyProtocol(): void {
  // Pop from stack to restore previous mode
  stdout.write("\x1b[<u");
}
```

**Important**: The cleanup must happen even on crash/SIGINT to avoid leaving the terminal in an unusable state. This is similar to how raw mode cleanup works.

### Phase 4: Parser Updates

Add Kitty protocol parsing to `parseKeypress`:

```typescript
// New regex for CSI u format
const KITTY_KEY_RE =
  /^\x1b\[(\d+)(?::(\d+))?(?:;(\d+)(?::(\d+))?)?(?:;([^u]*))?u$/;

function parseKittyKeypress(s: string): ParsedKeypress | null {
  const match = KITTY_KEY_RE.exec(s);
  if (!match) return null;

  const keyCode = parseInt(match[1], 10);
  const shiftedKey = match[2] ? parseInt(match[2], 10) : undefined;
  const modifiers = match[3] ? parseInt(match[3], 10) - 1 : 0;
  const eventType = match[4] ? parseInt(match[4], 10) : 1;
  const text = match[5];

  return {
    name: keyCodeToName(keyCode),
    ctrl: !!(modifiers & 4),
    shift: !!(modifiers & 1),
    meta: !!(modifiers & 2), // Alt
    super: !!(modifiers & 8),
    hyper: !!(modifiers & 16),
    capsLock: !!(modifiers & 64),
    numLock: !!(modifiers & 128),
    eventType:
      eventType === 1 ? "press" : eventType === 2 ? "repeat" : "release",
    sequence: s,
    keyCode,
    kittyProtocol: true,
  };
}
```

### Phase 5: Context Integration

Add protocol state to the input context:

```typescript
interface InputContextValue {
  eventEmitter: EventEmitter;
  exitOnCtrlC: boolean;
  // New
  kittyProtocolEnabled: boolean;
  kittyProtocolFlags: number;
}
```

## API Design Examples

### Basic Usage (Auto-detection)

```tsx
import { render, useInput } from "inkx";

function App() {
  useInput((input, key) => {
    // With Kitty protocol, these are now distinguishable!
    if (key.tab && !key.ctrl) {
      // User pressed Tab
    }
    if (key.ctrl && input === "i") {
      // User pressed Ctrl+I (NOT Tab!)
    }
  });

  return <Text>Tab and Ctrl+I are now different!</Text>;
}

// Enable Kitty protocol (falls back gracefully)
render(<App />, { kittyKeyboard: true });
```

### Key Release Events

```tsx
function Game() {
  const [isJumping, setIsJumping] = useState(false);

  useInput((input, key) => {
    if (input === " ") {
      if (key.eventType === "press") {
        setIsJumping(true);
      } else if (key.eventType === "release") {
        setIsJumping(false);
      }
    }
  });

  return <Text>{isJumping ? "Jumping!" : "On ground"}</Text>;
}

render(<Game />, {
  kittyKeyboard: { reportRelease: true },
});
```

### Checking Protocol Support

```tsx
function App() {
  const { kittyProtocolEnabled } = useStdin();

  return (
    <Box flexDirection="column">
      <Text>
        Kitty protocol: {kittyProtocolEnabled ? "enabled" : "not available"}
      </Text>
      {!kittyProtocolEnabled && (
        <Text dimColor>
          Tip: Use Kitty, WezTerm, or iTerm2 for enhanced keyboard support
        </Text>
      )}
    </Box>
  );
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
});

// Enhanced code can check for disambiguation
useInput((input, key) => {
  if (key.kittyProtocol) {
    // Can trust that Tab and Ctrl+I are distinct
  }
});
```

## Before/After Comparison

### Before (Legacy Protocol)

```tsx
useInput((input, key) => {
  // PROBLEM: Cannot distinguish these
  if (key.tab) {
    // Could be Tab OR Ctrl+I - no way to know
    handleIndent(); // User wanted Ctrl+I for something else!
  }

  // PROBLEM: Cannot detect key release
  if (input === "w") {
    moveForward(); // Keeps triggering on repeat
    // No way to know when user lifts finger
  }

  // PROBLEM: No Super/Hyper modifiers
  if (key.meta && input === "s") {
    // This is Alt+S, but user pressed Cmd+S
    // Cmd is intercepted by terminal
  }
});
```

### After (Kitty Protocol)

```tsx
useInput((input, key) => {
  // SOLVED: Tab and Ctrl+I are distinct
  if (key.tab && !key.ctrl) {
    handleIndent();
  }
  if (key.ctrl && input === "i") {
    showInfo(); // Separate action!
  }

  // SOLVED: Key release detection
  if (input === "w") {
    if (key.eventType === "press") {
      startMovingForward();
    } else if (key.eventType === "release") {
      stopMovingForward();
    }
  }

  // SOLVED: Super modifier available (if terminal supports)
  if (key.super && input === "s") {
    save(); // Actually Cmd+S on macOS
  }
});
```

## Implementation Checklist

- [ ] Add protocol detection function
- [ ] Add render option for enabling protocol
- [ ] Extend `Key` interface with new properties
- [ ] Add `CSI u` parser for Kitty sequences
- [ ] Add protocol enable/disable lifecycle
- [ ] Ensure cleanup on process exit/crash
- [ ] Update `InputContext` with protocol state
- [ ] Add `kittyProtocolEnabled` to `useStdin` return value
- [ ] Write tests with mock terminal responses
- [ ] Update documentation
- [ ] Add example showing new capabilities

## References

- [Kitty Keyboard Protocol Specification](https://sw.kovidgoyal.net/kitty/keyboard-protocol/)
- [Terminal Compatibility Matrix](https://tmuxai.dev/terminal-compatibility/)
- [notcurses implementation](https://github.com/dankamongmen/notcurses)
- [crossterm implementation](https://github.com/crossterm-rs/crossterm)
