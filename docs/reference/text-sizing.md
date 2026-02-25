# Text Sizing Protocol (OSC 66)

The text sizing protocol (OSC 66) lets the application tell the terminal exactly how many cells a character should occupy. This solves the long-standing measurement/rendering mismatch for Private Use Area (PUA) characters -- nerdfont icons and powerline symbols that `string-width` reports as 1-cell but terminals render as 2-cell.

## The Problem

Nerdfont icons (U+E000-U+F8FF) cause layout misalignment:

1. `string-width` says the icon is 1 cell wide (per Unicode EAW tables)
2. The terminal renders the icon as 2 cells wide (because the font's glyph is double-width)
3. Text after the icon is placed at the wrong column, causing truncation

Example: A column header "FAMILY SPRINT" (where is a nerdfont icon) gets truncated to "FAMILY SPRIN" because the layout engine allocates 1 cell for the icon but the terminal uses 2.

## The Solution

With OSC 66, the app wraps PUA characters in a sequence that specifies the exact width:

```
ESC ] 66 ; w=2 ; <character> BEL
```

When both the layout engine and the terminal agree on 2 cells, alignment is correct.

## Enabling Text Sizing

### Via `run()` (recommended)

```tsx
import { run } from "inkx/runtime"

// Auto-detect: enable if terminal supports it (Kitty 0.40+, Ghostty)
await run(<App />, { textSizing: "auto" })

// Force enable
await run(<App />, { textSizing: true })
```

### Programmatic Control

```typescript
import { setTextSizingEnabled, isTextSizingEnabled } from "inkx"

// Enable manually (e.g., after your own detection)
setTextSizingEnabled(true)

// Check current state
console.log(isTextSizingEnabled()) // true

// Disable on cleanup
setTextSizingEnabled(false)
```

## Terminal Support

| Terminal  | Version | Status       |
| --------- | ------- | ------------ |
| Kitty     | v0.40+  | Full support |
| Ghostty   | all     | Full support |
| WezTerm   | --      | Not yet      |
| iTerm2    | --      | Not yet      |
| Alacritty | --      | Not yet      |

Use `isTextSizingLikelySupported()` for a fast synchronous env-var check, or `detectTextSizingSupport()` for definitive cursor-position-based detection.

## API Reference

### `textSized(text: string, width: number): string`

Wrap text in an OSC 66 sequence that tells the terminal to render it in exactly `width` cells.

```typescript
import { textSized } from "inkx"

textSized("\uE0B0", 2) // "\x1b]66;w=2;\uE0B0\x07"
```

### `isPrivateUseArea(cp: number): boolean`

Check if a code point is in the Private Use Area. Covers BMP PUA (U+E000-U+F8FF) and Supplementary PUA-A/B.

```typescript
import { isPrivateUseArea } from "inkx"

isPrivateUseArea(0xe0b0) // true (Powerline separator)
isPrivateUseArea(0x41) // false (ASCII 'A')
```

### `isTextSizingLikelySupported(): boolean`

Fast synchronous check based on `TERM_PROGRAM` and `TERM_PROGRAM_VERSION` environment variables. Returns `true` for Kitty v0.40+ and Ghostty.

### `detectTextSizingSupport(write, read, timeout?): Promise<{ supported, widthOnly }>`

Definitive detection using cursor position reports. Sends an OSC 66 test sequence and checks if the cursor advanced by the expected amount.

### `setTextSizingEnabled(enabled: boolean): void`

Enable or disable text sizing mode globally. When enabled:

- `graphemeWidth()` returns 2 for PUA characters
- `displayWidth()` accounts for PUA width
- The output phase wraps PUA characters in OSC 66 sequences

Clears the display width cache when toggled.

### `isTextSizingEnabled(): boolean`

Check if text sizing mode is currently active.

## How It Works Internally

When text sizing is enabled:

1. **Measurement**: `graphemeWidth()` returns 2 for PUA characters (normally 1). This flows through `displayWidth()`, `wrapText()`, `truncateText()`, and all layout calculations.

2. **Buffer**: PUA characters are stored as wide characters in the terminal buffer (like CJK) -- the character occupies cells [x] and [x+1] with a continuation marker.

3. **Output**: When generating ANSI output, PUA characters in wide cells are wrapped in `ESC]66;w=2;...BEL` so the terminal renders them at the correct width.

The protocol is opt-in and disabled by default, so existing behavior is unchanged for terminals that do not support OSC 66.
