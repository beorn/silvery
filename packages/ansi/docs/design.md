# @hightea/ansi Design Document

## Overview

chalkx extends the popular [chalk](https://github.com/chalk/chalk) library with modern terminal features that chalk doesn't support:

- **Extended underline styles**: curly, dotted, dashed, double
- **Independent underline color**: set underline color separately from text color
- **Hyperlinks**: OSC 8 clickable links

## Architecture Decision: Layer on Chalk

### Why Not Absorb/Reimplement Chalk?

We considered several approaches:

| Approach                    | Pros                                                     | Cons                           |
| --------------------------- | -------------------------------------------------------- | ------------------------------ |
| **Layer on chalk** (chosen) | Leverage chalk's maturity, small scope, easy maintenance | Extra dependency               |
| Fork/absorb chalk           | Full control, single package                             | Huge maintenance burden        |
| Build on ansi-styles        | Lower-level control                                      | Still need chalk-like API      |
| Pure implementation         | Zero deps, full control                                  | Duplicating battle-tested work |

**Decision: Layer on chalk**

Reasons:

1. **Chalk is mature** - 21k stars, battle-tested color handling, active maintenance
2. **Focused scope** - chalkx adds ONLY what chalk lacks
3. **Smaller maintenance** - We don't duplicate 256-color/truecolor logic
4. **Users need both** - chalkx re-exports chalk for single-import convenience

### Chalk-Free Utilities

For users who only need ANSI stripping without chalk, we provide:

```ts
import { stripAnsi, displayLength, ANSI_REGEX } from "@hightea/ansi/utils"
```

This export has zero dependencies.

## Module Structure

```
src/
  index.ts        # Main exports, re-exports chalk
  types.ts        # TypeScript type definitions
  constants.ts    # ANSI escape codes (SGR, OSC 8)
  detection.ts    # Terminal capability detection
  utils.ts        # Chalk-free ANSI utilities
  underline.ts    # Extended underline functions
  hyperlink.ts    # OSC 8 hyperlink functions
```

### Why Split Into Modules?

1. **Tree-shaking** - Bundlers can exclude unused code
2. **Testability** - Each module can be tested in isolation
3. **Readability** - Clear separation of concerns
4. **Maintainability** - Changes are localized

## Terminal Detection Strategy

### Problem

Extended underlines (SGR 4:N) and underline colors (SGR 58) are not universally supported. We need to detect terminal capabilities and fall back gracefully.

### Approach

1. **Environment-based detection** - Check `TERM`, `TERM_PROGRAM`, `KITTY_WINDOW_ID`
2. **Conservative defaults** - Unknown terminals default to fallback
3. **User override** - `setExtendedUnderlineSupport()` for testing/forcing

### Detection Logic

```ts
function detectExtendedUnderlineSupport(): boolean {
  // Check TERM for known modern terminals
  if (term includes 'xterm-ghostty' | 'xterm-kitty' | 'wezterm') return true;

  // Check TERM_PROGRAM for known apps
  if (termProgram includes 'Ghostty' | 'iTerm.app' | 'WezTerm') return true;

  // Kitty-specific env var
  if (KITTY_WINDOW_ID exists) return true;

  // Default to fallback
  return false;
}
```

### Why Not Runtime Detection?

Runtime terminal queries (like OSC 4/10/11 responses) are complex:

- Require async I/O
- May not work in all contexts (CI, pipes)
- Add latency to first render

Environment variables are synchronous and reliable.

## Fallback Strategy

### Extended Underlines

When `supportsExtendedUnderline()` returns false:

| Function            | Fallback                                    |
| ------------------- | ------------------------------------------- |
| `curlyUnderline()`  | `chalk.underline()`                         |
| `dottedUnderline()` | `chalk.underline()`                         |
| `dashedUnderline()` | `chalk.underline()`                         |
| `doubleUnderline()` | `chalk.underline()`                         |
| `underlineColor()`  | `chalk.underline()` (color ignored)         |
| `styledUnderline()` | `chalk.underline()` (style + color ignored) |

### Hyperlinks

OSC 8 hyperlinks are emitted unconditionally because:

- Most modern terminals support them
- Unsupported terminals just show the text (harmless)
- No visual degradation in fallback

## ANSI Code Reference

### Extended Underline Styles (ISO 8613-6)

Format: `ESC [ 4 : N m`

| N   | Style                |
| --- | -------------------- |
| 0   | No underline         |
| 1   | Single underline     |
| 2   | Double underline     |
| 3   | Curly/wavy underline |
| 4   | Dotted underline     |
| 5   | Dashed underline     |

### Underline Color (SGR 58/59)

Set color: `ESC [ 58 : 2 : : R : G : B m`
Reset color: `ESC [ 59 m`

### OSC 8 Hyperlinks

Format: `ESC ] 8 ; ; URL ST TEXT ESC ] 8 ; ; ST`

Where:

- `ESC ]` = OSC (Operating System Command)
- `ST` = String Terminator (`ESC \`)
- URL = target URI (http, https, file, etc.)

## API Design Principles

### 1. Function-First

Named exports for all functions:

```ts
import { curlyUnderline, hyperlink } from "@hightea/ansi"
```

### 2. Convenience Object

For users who prefer object-style:

```ts
import { chalkX } from "@hightea/ansi"
chalkX.curlyUnderline("text")
chalkX.red("text") // chalk methods available too
```

### 3. Chalk Re-export

Single import for everything:

```ts
import { chalk, curlyUnderline } from "@hightea/ansi"
```

### 4. Type Safety

Full TypeScript types:

```ts
type UnderlineStyle = "single" | "double" | "curly" | "dotted" | "dashed"
type RGB = [r: number, g: number, b: number]
```

## Future Considerations

### Potential v0.2.0 Features

- Hyperlink `id` parameter for grouped links
- `supportsHyperlinks()` detection
- `fileLink(path, text)` helper
- Per-feature detection (not just boolean)

### Out of Scope

- Full chalk reimplementation
- Color manipulation (use chalk)
- Cursor control (separate concern)
- Graphics protocols (Kitty, iTerm2 inline images)
