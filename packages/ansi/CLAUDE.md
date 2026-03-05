# chalkx - Terminal Primitives and Extended ANSI Features

Core terminal abstraction with Disposable pattern support plus extended ANSI features (curly underlines, hyperlinks).

**Note:** If you're building a TUI with `inkx`, import term primitives from `inkx`:

- **From inkx:** `createTerm`, `term`, `patchConsole`, `Term`, `StyleChain`, `PatchedConsole`, `ColorLevel`, `ConsoleEntry`
- **From chalkx only:** `curlyUnderline`, `hyperlink`, `bgOverride`, `displayLength`, `styledUnderline`, `underlineColor`, detection functions

## Imports

```ts
// Term API (main)
import { createTerm, patchConsole } from "@hightea/ansi"

// Types
import type { Term, StyleChain, PatchedConsole, ColorLevel, ConsoleEntry } from "@hightea/ansi"

// Detection (usually accessed via term instance)
import { detectColor, detectCursor, detectInput, detectUnicode } from "@hightea/ansi"

// Utilities
import { stripAnsi, displayLength, hyperlink, curlyUnderline } from "@hightea/ansi"
```

## Common Patterns

### Basic Usage

```ts
import { createTerm } from "@hightea/ansi"

// Create term (Disposable)
using term = createTerm()

// Detection
term.hasCursor() // boolean - can reposition cursor?
term.hasInput() // boolean - can read raw keystrokes?
term.hasColor() // 'basic' | '256' | 'truecolor' | null
term.hasUnicode() // boolean - can render unicode?

// Dimensions
term.cols // number | undefined
term.rows // number | undefined

// Output
term.write("hello")
term.writeLine("world")
```

### Flattened Styling

```ts
// term IS the style chain - no .chalk prefix
term.red("error")
term.bold.green("success")
term.rgb(255, 100, 0).bold("orange bold")
term.bgBlue.white("inverted")

// Combine with write
term.write(term.red.bold("Error: "))
term.writeLine(term.dim("details here"))
```

### Console Patching

```ts
import { patchConsole } from "@hightea/ansi"

// Patch console - Disposable
using patched = patchConsole(console)

// All console calls are captured
console.log("hello")
console.error("oops")

// Read captured entries
patched.getSnapshot() // ConsoleEntry[]

// Subscribe to changes (useSyncExternalStore compatible)
const unsubscribe = patched.subscribe(() => {
  const entries = patched.getSnapshot()
  // react to new entries
})
```

### Testing with Overrides

```ts
// Force specific capabilities for testing
using term = createTerm({ color: null }) // No colors
using term = createTerm({ color: "truecolor" }) // Force truecolor
using term = createTerm({ unicode: false }) // Force ASCII
using term = createTerm({ cursor: false }) // No cursor control

// Custom streams
using term = createTerm({ stdout: mockStream, stdin: mockStdin })
```

### Extended Underlines

```ts
import { curlyUnderline, dottedUnderline, hyperlink } from "@hightea/ansi"

// Wavy underline (spell-check style)
curlyUnderline("misspelled")

// Hyperlinks
hyperlink("Click here", "https://example.com")

// Combined with term styling
term.red(curlyUnderline("error"))
```

## Anti-Patterns

### Wrong: Using chalk directly

```ts
// WRONG - loses color level synchronization
import chalk from "chalk"
import { createTerm } from "@hightea/ansi"

using term = createTerm({ color: null })
chalk.red("still colored!") // chalk doesn't know about term's color setting

// RIGHT - use term's styling
term.red("properly no-color")
```

### Wrong: Using .style() (removed API)

```ts
// WRONG - .style() method was removed
term.style().red("error")
term.style().bold.green("success")

// RIGHT - term IS the style chain directly
term.red("error")
term.bold.green("success")
```

### Wrong: Forgetting Disposable cleanup

```ts
// WRONG - leaks resources
const term = createTerm()
const patched = patchConsole(console)
// ... console stays patched forever

// RIGHT - use 'using' or manual dispose
using term = createTerm()
using patched = patchConsole(console)
// automatically cleaned up

// OR
const term = createTerm()
try {
  // ... use term
} finally {
  term[Symbol.dispose]()
}
```

## Type-Safe Colors

```ts
import type { Color, AnsiColorName } from "@hightea/ansi"

// Color is the union of all supported color formats:
// AnsiColorName | HexColor | RgbColor | ThemeToken | (string & {})
const c: Color = "$primary" // theme token
const c: Color = "#ff0000" // hex
const c: Color = "red" // ANSI name
```

## Lazy Detection

macOS dark mode detection (`defaults read`) is cached — the subprocess only runs once per process, not per `createTerm()` call. The global `term` singleton is also lazy (Proxy-based) — no detection runs until first property access.

## Key Types

| Type             | Description                                                                   |
| ---------------- | ----------------------------------------------------------------------------- |
| `Term`           | Main terminal interface with detection, styling, I/O                          |
| `StyleChain`     | Chainable styling methods (bold, red, rgb, etc)                               |
| `PatchedConsole` | Console interceptor with getSnapshot/subscribe                                |
| `ColorLevel`     | `'basic' \| '256' \| 'truecolor'`                                             |
| `ConsoleEntry`   | `{ method, args, stream }`                                                    |
| `Color`          | Union: `AnsiColorName \| HexColor \| RgbColor \| ThemeToken \| (string & {})` |
| `AnsiColorName`  | String literal union of all ANSI color names                                  |

## Detection Details

| Method         | What it checks                         |
| -------------- | -------------------------------------- |
| `hasCursor()`  | `stdout.isTTY && TERM !== 'dumb'`      |
| `hasInput()`   | `stdin.isTTY && setRawMode available`  |
| `hasColor()`   | NO_COLOR, FORCE_COLOR, COLORTERM, TERM |
| `hasUnicode()` | LANG, TERM_PROGRAM, KITTY_WINDOW_ID    |
