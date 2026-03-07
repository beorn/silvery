# ansi

[![npm version](https://img.shields.io/npm/v/@hightea/ansi.svg)](https://www.npmjs.com/package/@hightea/ansi)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Terminal primitives with capability detection, extended underlines, and hyperlinks.

## Quick Start

```typescript
import { createTerm } from "@hightea/ansi"

// Create term (Disposable pattern)
using term = createTerm()

// Flattened styling - term IS the style chain
term.red("error")
term.bold.green("success")
term.rgb(255, 100, 0).bold("orange bold")

// Terminal capability detection
term.hasColor() // 'basic' | '256' | 'truecolor' | null
term.hasCursor() // boolean - can reposition cursor?
term.hasInput() // boolean - can read raw keystrokes?
term.hasUnicode() // boolean - can render unicode?

// Dimensions
console.log(`${term.cols}x${term.rows}`)
```

### Console Capture

```typescript
import { createTerm, patchConsole } from "@hightea/ansi"

using term = createTerm()
using patched = patchConsole(console)

// All console calls are captured
console.log("hello")
console.error("oops")

// Read captured entries
patched.getSnapshot() // ConsoleEntry[]

// Subscribe to changes (useSyncExternalStore compatible)
const unsubscribe = patched.subscribe(() => {
  const entries = patched.getSnapshot()
})
```

### Using with hightea

If you're building a TUI app with [hightea](https://github.com/beorn/hightea), import term primitives from `hightea` directly - it re-exports everything from ansi:

```typescript
// Preferred for hightea apps - one import source
import { render, Box, Text, createTerm, patchConsole } from "@hightea/term"

// Only import from ansi for extended ANSI features not re-exported
import { curlyUnderline, hyperlink, bgOverride } from "@hightea/ansi"
```

For CLI tools, scripts, or non-hightea projects, import directly from ansi.

### Default Term for Simple Scripts

```typescript
import { term } from "@hightea/ansi"

console.log(term.green("success"))
console.log(`Terminal size: ${term.cols}x${term.rows}`)
```

### Testing with Capability Overrides

```typescript
using term = createTerm({ color: null }) // No colors
using term = createTerm({ color: "truecolor" }) // Force truecolor
using term = createTerm({ unicode: false }) // Force ASCII
using term = createTerm({ cursor: false }) // No cursor control
```

## Extended ANSI Features

Beyond the Term API, ansi provides extended ANSI features not found in any other npm package:

```typescript
import { curlyUnderline, hyperlink, chalk } from "@hightea/ansi"

// Spell-check style wavy underline
console.log(curlyUnderline("mispelled"))

// Clickable terminal link
console.log(hyperlink("Open docs", "https://example.com/docs"))

// Combine with chalk colors
console.log(chalk.red(curlyUnderline("Error: typo detected")))
```

### Full Underline API

```typescript
import {
  curlyUnderline,
  dottedUnderline,
  dashedUnderline,
  doubleUnderline,
  underlineColor,
  styledUnderline,
} from "@hightea/ansi"

curlyUnderline("spelling error") // wavy underline
dottedUnderline("embedded content") // dotted underline
dashedUnderline("draft text") // dashed underline
doubleUnderline("important") // double underline
underlineColor(255, 0, 0, "error") // red underline
styledUnderline("curly", [255, 0, 0], "error") // curly + red
```

Unsupported terminals gracefully fall back to regular underlines.

## Features

### Term Primitives

- **Terminal detection** - `hasCursor()`, `hasInput()`, `hasColor()`, `hasUnicode()`
- **Flattened styling** - `term.bold.red('text')` - term IS the style chain
- **Disposable pattern** - Automatic cleanup with `using term = createTerm()`
- **Console capture** - `patchConsole()` intercepts console calls
- **Testable** - Inject mock capabilities without global mocking

### Extended ANSI

- **Extended underline styles** - curly (wavy), dotted, dashed, double
- **Independent underline color** - set underline color separately from text color
- **Hyperlinks** - clickable OSC 8 terminal hyperlinks
- **hightea compatibility** - `bgOverride()` for safe chalk bg usage with hightea
- **Graceful fallback** - degrades to regular underlines on unsupported terminals
- **ANSI utilities** - `stripAnsi()`, `displayLength()`

## Installation

```bash
bun add @hightea/ansi
# or
npm install @hightea/ansi
```

## hightea Background Override

When using chalk with [hightea](https://github.com/beorn/hightea), mixing chalk backgrounds with hightea `backgroundColor` props causes visual artifacts. Use `bgOverride()` to explicitly allow this:

```tsx
import { bgOverride, chalk } from "@hightea/ansi"
import { Box, Text } from "@hightea/term"
;<Box backgroundColor="cyan">
  <Text>{bgOverride(chalk.bgBlack("text"))}</Text>
</Box>
```

Control detection via `HIGHTEA_BG_CONFLICT` env var: `throw` (default), `warn`, or `ignore`.

## Terminal Support

### Extended Underline Styles

| Terminal             | Curly | Dotted | Dashed | Double |
| -------------------- | ----- | ------ | ------ | ------ |
| **Ghostty**          | yes   | yes    | yes    | yes    |
| **Kitty**            | yes   | yes    | yes    | yes    |
| **WezTerm**          | yes   | yes    | yes    | yes    |
| **iTerm2**           | yes   | yes    | yes    | yes    |
| **Alacritty**        | ~     | ~      | ~      | ~      |
| **Terminal.app**     | no    | no     | no     | no     |
| **Windows Terminal** | ~     | ~      | ~      | ~      |

### Hyperlinks (OSC 8)

| Terminal             | Clickable | Hover Preview |
| -------------------- | --------- | ------------- |
| **Ghostty**          | yes       | yes           |
| **Kitty**            | yes       | yes           |
| **WezTerm**          | yes       | yes           |
| **iTerm2**           | yes       | yes           |
| **Terminal.app**     | yes       | no            |
| **Windows Terminal** | yes       | yes           |
| **VS Code Terminal** | yes       | yes           |

## Package Comparison

| Package       | Extended Underlines | Underline Color | Hyperlinks | Term Detection |
| ------------- | ------------------- | --------------- | ---------- | -------------- |
| **ansi**    | yes                 | yes             | yes        | yes            |
| chalk         | no                  | no              | no         | no             |
| kleur         | no                  | no              | no         | no             |
| picocolors    | no                  | no              | no         | no             |
| terminal-link | N/A                 | N/A             | yes        | no             |

## Anti-Patterns

```typescript
// WRONG - loses color level synchronization
import chalk from "chalk"
using term = createTerm({ color: null })
chalk.red("still colored!") // chalk ignores term's color setting

// RIGHT - use term's styling
term.red("properly no-color")
```

```typescript
// WRONG - deprecated API
import ansi from "@hightea/ansi"

// RIGHT - use createTerm
import { createTerm } from "@hightea/ansi"
using term = createTerm()
```

## Storybook

Visual demo of all features:

```bash
bun ./src/storybook.ts
```

## Documentation

| Document                                         | Description                                 |
| ------------------------------------------------ | ------------------------------------------- |
| [Design](docs/design.md)                         | Architecture decisions and rationale        |
| [Chalk Comparison](docs/chalk-comparison.md)     | Feature comparison with other libraries     |
| [Terminal Reference](docs/terminal-reference.md) | ANSI/VT standards, SGR codes, OSC sequences |
| [Roadmap](docs/roadmap.md)                       | Planned features and fallback strategy      |

## Related Projects

| Project                                       | Description                                     |
| --------------------------------------------- | ----------------------------------------------- |
| [hightea](https://github.com/beorn/hightea)   | React terminal UI framework (re-exports ansi) |
| [chalk](https://github.com/chalk/chalk)       | Industry-standard terminal styling              |
| [Flexture](https://github.com/beorn/flexture) | Pure JS flexbox layout engine                   |

## License

MIT
