# Input Features

Silvery provides best-in-class terminal input handling: full Kitty keyboard protocol support, SGR mouse events, macOS modifier symbols, and hotkey parsing with unambiguous key identification.

## Keyboard Input

### Legacy ANSI

Standard terminal input that works everywhere. Handles arrow keys, function keys, Ctrl combinations, Alt/Meta sequences, and printable characters.

```tsx
import { useInput, type Key } from "@silvery/term/runtime"

useInput((input, key) => {
  if (input === "j" || key.downArrow) moveDown()
  if (key.ctrl && input === "s") save()
  if (key.meta && input === "p") openPalette() // ⌥P
  if (key.return) submit()
  if (input === "q") return "exit"
})
```

**Limitations**: Legacy ANSI cannot distinguish Cmd ⌘ from other modifiers, cannot report key release events, and many key combinations produce ambiguous sequences.

### Kitty Keyboard Protocol

The [Kitty protocol](https://sw.kovidgoyal.net/kitty/keyboard-protocol/) eliminates legacy ambiguities. Silvery supports the full specification.

**What it enables:**

- Cmd ⌘ (Super) and Hyper ✦ modifiers — impossible with legacy ANSI
- Key press/repeat/release event types
- CapsLock and NumLock detection
- Shifted key and base layout key reporting (international keyboard support)
- Associated text (the actual text a key combination would produce)

#### Enabling in Your App

```tsx
import { run } from "@silvery/term/runtime"
import { KittyFlags } from "@silvery/term"

// Auto-enabled by default — ⌘ and ✦ modifiers just work
await run(<App />)

// Opt out if needed
await run(<App />, { kitty: false })

// Specific flags for advanced features (key release, associated text)
await run(<App />, {
  kitty: KittyFlags.DISAMBIGUATE | KittyFlags.REPORT_EVENTS,
})
```

#### Using Cmd ⌘ and Hyper ✦

```tsx
useInput((input, key) => {
  if (key.super && input === "s") save() // ⌘S
  if (key.super && key.shift && input === "p") {
    // ⌘⇧P
    openCommandPalette()
  }
  if (key.hyper && input === "j") hyperJump() // ✦J
})
```

#### Event Types (Press/Repeat/Release)

Requires `KittyFlags.REPORT_EVENTS`:

```tsx
await run(<App />, {
  kitty: KittyFlags.DISAMBIGUATE | KittyFlags.REPORT_EVENTS,
})

// In your component:
useInput((input, key) => {
  if (key.eventType === 1) onKeyDown(input) // Press
  if (key.eventType === 2) onKeyHeld(input) // Repeat (key held down)
  if (key.eventType === 3) onKeyUp(input) // Release
})
```

#### Extended Key Fields

The `ParsedKeypress` object (from `parseKeypress()`) includes additional Kitty fields:

| Field            | Type      | Requires Flag      | Description                                      |
| ---------------- | --------- | ------------------ | ------------------------------------------------ |
| `shiftedKey`     | `string`  | `REPORT_ALTERNATE` | Character when Shift is held (e.g., `!` for `1`) |
| `baseLayoutKey`  | `string`  | `REPORT_ALTERNATE` | Key on US layout (for AZERTY, Dvorak, etc.)      |
| `capsLock`       | `boolean` | Any                | CapsLock is active                               |
| `numLock`        | `boolean` | Any                | NumLock is active                                |
| `associatedText` | `string`  | `REPORT_TEXT`      | Actual text the key combination produces         |

#### Protocol Detection

Detect whether the terminal supports Kitty protocol before enabling:

```tsx
import { detectKittyFromStdio } from "@silvery/term"

const result = await detectKittyFromStdio(process.stdout, process.stdin)
if (result.supported) {
  console.log(`Kitty protocol supported, flags: ${result.flags}`)
}
```

Low-level detection for custom I/O:

```tsx
import { detectKittySupport } from "@silvery/term"

const result = await detectKittySupport(
  (s) => socket.write(s),
  (ms) => readWithTimeout(socket, ms),
  200, // timeout in ms
)
```

#### Low-Level Protocol Control

For manual protocol management (auto-enable handles this for you):

```tsx
import { enableKittyKeyboard, disableKittyKeyboard, queryKittyKeyboard, KittyFlags } from "@silvery/term"

stdout.write(enableKittyKeyboard(KittyFlags.DISAMBIGUATE | KittyFlags.REPORT_EVENTS))
// ... app runs ...
stdout.write(disableKittyKeyboard()) // Restore previous mode
```

#### KittyFlags Reference

| Flag               | Value | Description                                       |
| ------------------ | ----- | ------------------------------------------------- |
| `DISAMBIGUATE`     | 1     | Disambiguate escape codes (minimum useful flag)   |
| `REPORT_EVENTS`    | 2     | Report press/repeat/release event types           |
| `REPORT_ALTERNATE` | 4     | Report shifted key and base layout key            |
| `REPORT_ALL_KEYS`  | 8     | Report all keys as escape codes (even Enter, Tab) |
| `REPORT_TEXT`      | 16    | Report associated text as codepoints              |

Combine with bitwise OR: `KittyFlags.DISAMBIGUATE | KittyFlags.REPORT_EVENTS`.

#### Terminal Support

| Terminal     | Kitty Protocol | Notes                   |
| ------------ | -------------- | ----------------------- |
| Ghostty      | Yes            | Full support            |
| Kitty        | Yes            | Original implementation |
| WezTerm      | Yes            | Full support            |
| foot         | Yes            | Full support            |
| iTerm2       | No             | Ignores enable sequence |
| Terminal.app | No             | Ignores enable sequence |

Unsupported terminals safely ignore the protocol sequences.

## Mouse Events

### SGR Mouse Protocol (Mode 1006)

Silvery supports SGR mouse tracking for click, drag, scroll, and motion events with modifier detection.

#### Enabling in Your App

Mouse tracking is enabled by default in `run()`. When active, native text selection (copy/paste) requires holding Shift (or Option on macOS).

```tsx
// Mouse is on by default
await run(<App />)

// Disable to restore native copy/paste behavior
await run(<App />, { mouse: false })
```

#### Mouse Event Handling

Mouse events flow through the runtime event system. The `ParsedMouse` type describes each event:

```tsx
import { parseMouseSequence, isMouseSequence, type ParsedMouse } from "@silvery/term"

// Manual parsing (runtime handles this automatically)
const event = parseMouseSequence("\x1b[<0;10;5M")
// → { button: 0, x: 9, y: 4, action: "down", shift: false, meta: false, ctrl: false }
```

#### ParsedMouse Fields

| Field    | Type                                  | Description                                         |
| -------- | ------------------------------------- | --------------------------------------------------- |
| `button` | `number`                              | 0=left, 1=middle, 2=right                           |
| `x`      | `number`                              | Column (0-indexed)                                  |
| `y`      | `number`                              | Row (0-indexed)                                     |
| `action` | `"down" \| "up" \| "move" \| "wheel"` | Event action                                        |
| `delta`  | `number`                              | Scroll: -1=up, +1=down (only for `action: "wheel"`) |
| `shift`  | `boolean`                             | ⇧ Shift was held                                    |
| `meta`   | `boolean`                             | ⌥ Alt/Meta was held                                 |
| `ctrl`   | `boolean`                             | ⌃ Ctrl was held                                     |

#### Button Encoding

SGR button field encoding:

| Bits      | Meaning                           |
| --------- | --------------------------------- |
| 0-1       | Button: 0=left, 1=middle, 2=right |
| 2 (+4)    | ⇧ Shift held                      |
| 3 (+8)    | ⌥ Meta/Alt held                   |
| 4 (+16)   | ⌃ Ctrl held                       |
| 5 (+32)   | Motion event (drag)               |
| 6-7 (+64) | Wheel: 64=up, 65=down             |

#### Terminal Support

| Terminal     | SGR Mouse | Notes         |
| ------------ | --------- | ------------- |
| Ghostty      | Yes       |               |
| Kitty        | Yes       |               |
| WezTerm      | Yes       |               |
| iTerm2       | Yes       |               |
| foot         | Yes       |               |
| Terminal.app | Yes       | Basic support |
| xterm        | Yes       | 277+          |

#### Protocol Details

SGR mouse format: `CSI < button;x;y M` (press/motion) or `CSI < button;x;y m` (release).

Silvery enables three mouse modes for comprehensive tracking:

| Mode            | Code         | Description                           |
| --------------- | ------------ | ------------------------------------- |
| X10 basic       | `CSI ?1000h` | Button press events                   |
| Button tracking | `CSI ?1002h` | Button press + drag motion            |
| SGR encoding    | `CSI ?1006h` | Extended format (no 223-column limit) |

All three are enabled/disabled together by `enableMouse()`/`disableMouse()`.

## Hotkey Parsing

### parseHotkey

Parse a hotkey string into its base key and modifier flags. Supports multiple formats:

```tsx
import { parseHotkey } from "@silvery/term"

// Playwright-style (plus-separated)
parseHotkey("Control+c") // { key: 'c', ctrl: true, ... }
parseHotkey("Shift+ArrowUp") // { key: 'ArrowUp', shift: true, ... }
parseHotkey("Super+Shift+p") // { key: 'p', super: true, shift: true, ... }

// Lowercase aliases
parseHotkey("ctrl+c") // { key: 'c', ctrl: true, ... }
parseHotkey("cmd+s") // { key: 's', super: true, ... }
parseHotkey("opt+x") // { key: 'x', alt: true, ... }

// macOS symbol prefix (no + needed)
parseHotkey("⌘j") // { key: 'j', super: true, ... }
parseHotkey("⌃⇧a") // { key: 'a', ctrl: true, shift: true, ... }
parseHotkey("✦⌘x") // { key: 'x', hyper: true, super: true, ... }
parseHotkey("⌥⌘p") // { key: 'p', alt: true, super: true, ... }
```

### matchHotkey

Match a parsed hotkey against a live key event:

```tsx
import { parseHotkey, matchHotkey } from "@silvery/term"

const saveHotkey = parseHotkey("⌘s")

useInput((input, key) => {
  if (matchHotkey(saveHotkey, key, input)) {
    save()
  }
})
```

### ParsedHotkey Type

```tsx
interface ParsedHotkey {
  key: string // Base key name or character
  ctrl: boolean // ⌃ Control
  meta: boolean // Meta
  shift: boolean // ⇧ Shift
  alt: boolean // ⌥ Alt/Option
  super: boolean // ⌘ Cmd/Super
  hyper: boolean // ✦ Hyper
}
```

## Modifier Reference

### macOS Modifier Symbols

| Symbol | Name  | Aliases                               | Key field   |
| ------ | ----- | ------------------------------------- | ----------- |
| ⌘      | Cmd   | `cmd`, `command`, `super`, `Super`    | `key.super` |
| ⌥      | Opt   | `alt`, `opt`, `option`, `Alt`, `Meta` | `key.meta`  |
| ⌃      | Ctrl  | `ctrl`, `control`, `Control`          | `key.ctrl`  |
| ⇧      | Shift | `shift`, `Shift`                      | `key.shift` |
| ✦      | Hyper | `hyper`, `Hyper`                      | `key.hyper` |

Symbols can be used as prefixes without a `+` separator: `⌘j`, `⌃⇧a`, `✦⌘x`.

Lowercase names require `+`: `cmd+j`, `ctrl+shift+a`, `hyper+cmd+x`.

### Modifier Detection by Protocol

| Modifier  | Legacy ANSI                    | Kitty Protocol |
| --------- | ------------------------------ | -------------- |
| ⌃ Ctrl    | Yes                            | Yes            |
| ⇧ Shift   | Partial (letters, some combos) | Yes            |
| ⌥ Opt/Alt | Yes (ESC prefix)               | Yes            |
| ⌘ Cmd     | No                             | Yes            |
| ✦ Hyper   | No                             | Yes            |
| CapsLock  | No                             | Yes            |
| NumLock   | No                             | Yes            |

## Runtime Options

`run()` auto-detects and enables input protocols by default. `createApp().run()` requires explicit options.

```tsx
// run() — auto-enabled, opt out if needed
await run(<App />, { kitty: false, mouse: false })

// createApp().run() — explicit
await app.run(<App />, { kitty: true, mouse: true })
```

When Kitty is enabled (auto-detected or explicit), the runtime:

1. Sends `CSI ? u` to query terminal support
2. If supported, enables with `KittyFlags.DISAMBIGUATE`
3. On cleanup, sends `CSI < u` to restore previous mode

When `mouse: true`, the runtime:

1. Enables X10 + button tracking + SGR encoding
2. Parses incoming mouse sequences and dispatches events
3. On cleanup, disables all mouse modes
