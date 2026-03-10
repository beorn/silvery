---
title: Terminal Protocols — Kitty Keyboard, Mouse, Images
description: Leverage modern terminal protocols in Silvery — Kitty keyboard protocol, mouse events, sixel/kitty image rendering, and OSC queries.
prev:
  text: Scrollback
  link: /examples/scrollback
next:
  text: AI Chat
  link: /examples/ai-chat
---

<script setup>
import LiveDemo from '../.vitepress/components/LiveDemo.vue'
</script>

# Terminal Protocols

Modern terminals support far more than basic ANSI escape codes. Silvery provides comprehensive protocol support: the Kitty keyboard protocol for unambiguous key identification, mouse tracking for click and scroll events, sixel/kitty graphics for inline images, and OSC queries for terminal capability detection.

## Kitty Keyboard Protocol

The Kitty keyboard protocol eliminates ambiguity in key identification. Silvery can distinguish:

- **Cmd+K vs Ctrl+K** — modifier keys are reported separately
- **Key press vs release** — enable release events for chord systems
- **Numpad vs main keyboard** — `KP_Enter` vs `Return`
- **Shifted keys** — `Shift+Tab` reported unambiguously

```tsx
import { useInput } from "silvery"

function App() {
  useInput((input, key) => {
    // With Kitty protocol, these are distinguishable:
    if (key.ctrl && input === "k") {
      /* Ctrl+K */
    }
    if (key.meta && input === "k") {
      /* Cmd+K on macOS */
    }
    if (key.shift && key.tab) {
      /* Shift+Tab */
    }
  })
  return <Text>Press keys...</Text>
}
```

### Hotkey Parsing

Define keyboard shortcuts using macOS modifier symbols:

```tsx
import { parseHotkey, matchHotkey } from "silvery"

const hotkey = parseHotkey("⌘K") // Cmd+K
// or: parseHotkey("⌃⇧P")        // Ctrl+Shift+P

useInput((input, key) => {
  if (matchHotkey(hotkey, key)) {
    openCommandPalette()
  }
})
```

## Mouse Events

Silvery supports mouse tracking across terminals that support it:

```tsx
import { useMouse } from "silvery"

function App() {
  useMouse((event) => {
    if (event.type === "click") {
      setSelected(event.y) // Row clicked
    }
    if (event.type === "scroll") {
      setOffset((o) => o + event.direction)
    }
  })
  return <List items={items} />
}
```

Mouse events work in:

- Kitty, iTerm2, WezTerm (full support)
- macOS Terminal, Windows Terminal (basic click/scroll)
- xterm.js in the browser (full support)

## Inline Images

Display images directly in the terminal using Kitty graphics or Sixel protocol:

```tsx
import { Image } from "silvery"

function App() {
  return (
    <Box flexDirection="column">
      <Image src="./logo.png" width={40} height={20} />
      <Text>Image rendered inline in the terminal</Text>
    </Box>
  )
}
```

Silvery auto-detects the best protocol:

1. **Kitty graphics** — Full color, any size (Kitty, WezTerm)
2. **Sixel** — Wide support (iTerm2, xterm, mlterm)
3. **Text fallback** — Placeholder in unsupported terminals

### Canvas Rendering

For dynamic graphics, use the Canvas component with Kitty graphics:

```tsx
import { Canvas } from "silvery"

function Chart() {
  return (
    <Canvas width={200} height={100}>
      {(ctx) => {
        ctx.fillStyle = "#a6e3a1"
        ctx.fillRect(10, 10, 180, 80)
        // Standard Canvas2D API
      }}
    </Canvas>
  )
}
```

## OSC Queries

Silvery queries terminal capabilities at startup and adapts:

```tsx
import { useTerm } from "silvery"

function App() {
  const term = useTerm()
  return (
    <Box>
      <Text>Terminal: {term.capabilities.name}</Text>
      <Text>Colors: {term.capabilities.colorDepth}</Text>
      <Text>Kitty keyboard: {term.capabilities.kittyKeyboard ? "yes" : "no"}</Text>
      <Text>Images: {term.capabilities.imageProtocol || "none"}</Text>
    </Box>
  )
}
```

## Running the Examples

```bash
cd silvery

# Key chord tester
bun examples/kitty/keys.tsx

# Kitty keyboard input demo
bun examples/kitty/input.tsx

# Image rendering
bun examples/kitty/image-component.tsx

# Canvas painting
bun examples/kitty/paint.tsx
```

## Features Used

| Feature            | Usage                                 |
| ------------------ | ------------------------------------- |
| Kitty keyboard     | Unambiguous key identification        |
| `parseHotkey()`    | macOS modifier symbol shortcuts       |
| `matchHotkey()`    | Match keys against hotkey definitions |
| Mouse tracking     | Click and scroll events               |
| `Image` component  | Inline image rendering                |
| `Canvas` component | Dynamic graphics via Canvas2D         |
| OSC queries        | Terminal capability detection         |
| Protocol fallbacks | Graceful degradation                  |

## Terminal Compatibility

| Terminal           | Kitty Keys | Mouse        | Images         | OSC      |
| ------------------ | ---------- | ------------ | -------------- | -------- |
| Kitty              | Full       | Full         | Kitty graphics | Full     |
| WezTerm            | Full       | Full         | Kitty graphics | Full     |
| iTerm2             | Partial    | Full         | Sixel          | Partial  |
| Ghostty            | Full       | Full         | Kitty graphics | Full     |
| macOS Terminal     | Basic      | Click/scroll | None           | None     |
| Windows Terminal   | Partial    | Full         | Sixel          | Partial  |
| xterm.js (browser) | Full       | Full         | None           | Emulated |

## Exercises

1. **Key logger** — Display all key events with their modifier flags
2. **Mouse drawing** — Click to place characters on a grid
3. **Image gallery** — Navigate through images with arrow keys
4. **Terminal info** — Query and display all terminal capabilities
