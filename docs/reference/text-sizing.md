# Text Sizing Protocol (OSC 66)

The text sizing protocol (OSC 66) lets the application tell the terminal exactly how many cells a character should occupy. This solves measurement/rendering mismatches for two categories of characters:

1. **Private Use Area (PUA)** — nerdfont icons and powerline symbols that `string-width` reports as 1-cell but terminals render as 2-cell
2. **Text-presentation emoji** — characters like warning sign, checkmark, airplane that have ambiguous width across terminals

## The Problem

### PUA Characters

Nerdfont icons (U+E000-U+F8FF) cause layout misalignment:

1. `string-width` says the icon is 1 cell wide (per Unicode EAW tables)
2. The terminal renders the icon as 2 cells wide (because the font's glyph is double-width)
3. Text after the icon is placed at the wrong column, causing truncation

### Text-Presentation Emoji

Characters like `\u26A0` (warning sign), `\u2611` (checkmark), `\u2708` (airplane) are `Extended_Pictographic` but do NOT have the `Emoji_Presentation` property. Terminals render them as 2-wide emoji glyphs, but `string-width` reports them as 1 cell.

## The Solution

With OSC 66, the app wraps ambiguous-width characters in a sequence that specifies the exact width:

```
ESC ] 66 ; w=2 ; <character> BEL
```

When both the layout engine and the terminal agree on 2 cells, alignment is correct.

## Enabling Text Sizing

### Via `run()` (recommended)

```tsx
import { run } from "@silvery/ag-term/runtime"

// Auto-detect: enable if terminal supports it (Kitty 0.40+, Ghostty)
await run(<App />, { textSizing: "auto" })

// Force enable
await run(<App />, { textSizing: true })
```

### Programmatic Control

```typescript
import { createMeasurer, runWithMeasurer, isTextSizingEnabled } from "@silvery/ag-term"

// Create a measurer with text sizing enabled
const measurer = createMeasurer({ textSizingEnabled: true })

// Use the measurer for width calculations
measurer.graphemeWidth("\uE0B0") // 2 (PUA treated as double-width)
measurer.displayWidth("icon\uE0B0text") // accounts for PUA width

// Scope a measurer for pipeline operations (output phase, etc.)
runWithMeasurer(measurer, () => {
  // All module-level functions (graphemeWidth, displayWidth, etc.)
  // use this measurer within the callback
})

// Check current state (module-level default)
console.log(isTextSizingEnabled()) // false (default)
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

## Font Scale (OSC 66 s= parameter)

Beyond cell-width control, OSC 66 also supports **font size scaling** via the `s=` parameter. This lets you render headings at 2x, annotations at 0.5x, and body text at 1x — all in one terminal session.

### `textScaled(scale: number): string`

Generate an OSC 66 escape sequence to set the text scale (font size multiplier). The scale applies to all subsequent text until reset or changed.

```typescript
import { textScaled, resetTextScale } from "@silvery/ag-term"

// Set 2x size for a heading
process.stdout.write(textScaled(2) + "Big Heading" + resetTextScale())

// Set 0.5x for annotations
process.stdout.write(textScaled(0.5) + "fine print" + resetTextScale())
```

Scale values:

- `3.0` — triple size (display titles)
- `2.0` — double size (headings)
- `1.5` — large (subheadings)
- `1.0` — normal (body text, default)
- `0.75` — slightly smaller
- `0.5` — half size (annotations, captions)
- `0.25` — quarter size (fine print)

### `resetTextScale(): string`

Generate an OSC 66 escape sequence to reset text scale to default (1.0). Equivalent to `textScaled(1)`.

### `textSize` prop

The `textSize` style prop is available on `Box` and `Text` components. It declares the desired OSC 66 font scale for the node's content. Currently a hint for terminal-aware renderers — the standard terminal pipeline emits the escape sequences around the node's rendered content on terminals that support OSC 66.

```tsx
<Text textSize={2} bold color="$primary">
  Large Heading
</Text>
<Text textSize={0.5} color="$muted">
  Fine print annotation
</Text>
```

## API Reference

### `textSized(text: string, width: number): string`

Wrap text in an OSC 66 sequence that tells the terminal to render it in exactly `width` cells.

```typescript
import { textSized } from "@silvery/ag-term"

textSized("\uE0B0", 2) // "\x1b]66;w=2;\uE0B0\x07"
```

### `isPrivateUseArea(cp: number): boolean`

Check if a code point is in the Private Use Area. Covers BMP PUA (U+E000-U+F8FF) and Supplementary PUA-A/B.

```typescript
import { isPrivateUseArea } from "@silvery/ag-term"

isPrivateUseArea(0xe0b0) // true (Powerline separator)
isPrivateUseArea(0x41) // false (ASCII 'A')
```

### `isTextSizingLikelySupported(): boolean`

Fast synchronous check based on `TERM_PROGRAM` and `TERM_PROGRAM_VERSION` environment variables. Returns `true` for Kitty v0.40+ and Ghostty.

### `detectTextSizingSupport(write, read, timeout?): Promise<{ supported, widthOnly }>`

Definitive detection using cursor position reports. Sends an OSC 66 test sequence and checks if the cursor advanced by the expected amount.

### `createMeasurer(opts: { textSizingEnabled: boolean }): Measurer`

Create a measurer instance with the given text sizing configuration. When `textSizingEnabled` is true:

- `measurer.graphemeWidth()` returns 2 for PUA characters
- `measurer.displayWidth()` accounts for PUA width
- Used with `runWithMeasurer()` to scope the output phase for OSC 66 wrapping

Each measurer has its own independent width cache.

### `runWithMeasurer(measurer: Measurer, fn: () => T): T`

Run a function with a scoped measurer. All module-level width functions (`graphemeWidth`, `displayWidth`, etc.) use the provided measurer within the callback. This is how the output phase and other pipeline stages get text sizing awareness without threading measurer arguments.

### `isTextSizingEnabled(): boolean`

Check if text sizing mode is currently active at the module level (default measurer).

## How It Works Internally

When text sizing is enabled:

1. **Measurement**: `graphemeWidth()` returns 2 for PUA characters (normally 1). This flows through `displayWidth()`, `wrapText()`, `truncateText()`, and all layout calculations.

2. **Buffer**: PUA characters are stored as wide characters in the terminal buffer (like CJK) -- the character occupies cells [x] and [x+1] with a continuation marker.

3. **Output**: When generating ANSI output, PUA characters in wide cells are wrapped in `ESC]66;w=2;...BEL` so the terminal renders them at the correct width.

`run()` auto-enables text sizing on supported terminals (Kitty 0.40+, Ghostty). Unsupported terminals ignore the sequences harmlessly.
