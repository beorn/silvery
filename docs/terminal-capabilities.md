# Terminal Capabilities Reference

This document explains terminal capabilities, the `@beorn/term` and `@beorn/tui` packages, and how to choose the right render strategy.

## The Two Core Capabilities

Terminal output boils down to **two independent capabilities**:

### 1. Cursor Control (`term.hasCursor()`)

Can the terminal interpret ANSI CSI (Control Sequence Introducer) escape sequences?

```
ESC [ <params> <command>
```

If **yes**, ALL cursor operations work:

- Move cursor: `\x1b[A` (up), `\x1b[B` (down), `\x1b[H` (home)
- Clear: `\x1b[2J` (screen), `\x1b[K` (line)
- Alternate screen: `\x1b[?1049h` (enter), `\x1b[?1049l` (leave)
- Hide/show cursor: `\x1b[?25l` / `\x1b[?25h`

If **no**, only append-only output works (use `renderString()`).

**Detection:**

```ts
term.hasCursor() // stdout.isTTY && TERM !== 'dumb'
```

### 2. Color Level (`term.hasColor()`)

What color codes does the terminal support?

| Level         | Detection                     | Codes              |
| ------------- | ----------------------------- | ------------------ |
| `null`        | `NO_COLOR` set or `TERM=dumb` | None               |
| `'basic'`     | Most terminals                | 16 ANSI colors     |
| `'256'`       | `TERM` contains `256color`    | `\x1b[38;5;Nm`     |
| `'truecolor'` | `COLORTERM=truecolor`         | `\x1b[38;2;R;G;Bm` |

**Detection:**

```ts
term.hasColor() // null | 'basic' | '256' | 'truecolor'
```

### 3. Input Capability (`term.hasInput()`)

Can the app read individual keystrokes (raw mode)?

```ts
term.hasInput() // stdin.isTTY && setRawMode available
```

Required for: `useInput`, keyboard navigation, interactive TUIs.

## Why These Three Are Enough

You might think there are separate capabilities for "line update", "region update", "fullscreen". But these are **app choices**, not terminal capabilities. If cursor control works, ALL cursor operations work.

## Environment Factors

Beyond raw capabilities, the **environment** affects what's practical:

### TTY Status

```ts
process.stdout.isTTY // true if connected to terminal
```

When `false` (piped, redirected, CI):

- Cursor control codes are written but ignored/garbled
- Output may be buffered differently
- No resize events

### Exclusive Output

Does your app have exclusive access to stdout?

| Situation                     | Exclusive? | Safe Strategies            |
| ----------------------------- | ---------- | -------------------------- |
| Standalone CLI                | Yes        | fullscreen, inline, stream |
| Test reporter (worker output) | No         | stream or `<Console />`    |
| Subprocess                    | Maybe      | depends on parent          |

If you don't have exclusive stdout, use the `<Console />` component to handle interleaved output.

## Render Functions

### `render(element, term)` - Interactive Rendering

```ts
using term = createTerm()
using app = await render(<App />, term)
using app = await render(<App />, term, { fullscreen: true })
```

- Default: **inline mode** (updates in place from current cursor)
- Optional: `fullscreen: true` for alternate screen buffer
- Requires: cursor control (`term.hasCursor()`)
- Returns a Disposable

**Options:**

```ts
{
  fullscreen?: boolean    // Use alternate screen (default: false)
  exitOnCtrlC?: boolean   // Exit on Ctrl+C (default: true)
}
```

**Instance methods:**

```ts
app.rerender(<App newProps />)
app.clear()
await app.waitUntilExit()
app.dispose()  // or app.unmount()
```

### `renderString()` - Static Rendering

```ts
const output: string = renderString(<Summary />)
const output: string = renderString(<Summary />, { width: 80, plain: true })
```

- Returns a string (caller decides where to write)
- No cursor control needed - always safe
- Use for: logging, streaming, static output, testing

**Options:**

```ts
{
  width?: number    // Default: 80
  plain?: boolean   // Strip ANSI codes (default: false)
}
```

### When to Use Which

| Situation              | Function                                | Why                 |
| ---------------------- | --------------------------------------- | ------------------- |
| Fullscreen TUI         | `render(<App />, { fullscreen: true })` | Takes over terminal |
| Progress bar           | `render(<Progress />)`                  | Updates in place    |
| Worker output handling | `<Console />` component                 | Composition pattern |
| CI / no cursor         | `renderString(<Summary />)`             | Always safe         |
| Streaming output       | `renderString()` in a loop              | Append-only         |
| Piped output           | `renderString(<X />, { plain: true })`  | No ANSI codes       |

## Console Patching

When using `inline` or `fullscreen` modes, external console.log calls would corrupt the display. Inkx can intercept these:

```ts
await render(<App />, { patchConsole: true })
```

Behavior:

1. Intercepts `console.log`, `console.error`, etc.
2. Pauses UI rendering
3. Outputs console content above the UI
4. Re-renders UI below

This is how Ink handles the same problem.

**For test reporters:** Console patching lets you buffer worker output and display it cleanly alongside your UI.

## Creating a Term

```ts
import { createTerm } from "@beorn/term"

// Default (process.stdout/stdin) - Disposable
using term = createTerm()

// Custom streams
using term = createTerm({ stdout: customOut, stdin: customIn })

// For testing
using term = createTerm({
  stdout: new MockWriteStream({ cols: 80, rows: 24 }),
  stdin: new MockReadStream(),
})
```

## Term API

```ts
// Detection
term.hasCursor() // boolean - can use cursor control?
term.hasInput() // boolean - can read keystrokes (raw mode)?
term.hasColor() // null | 'basic' | '256' | 'truecolor'

// Dimensions
term.cols // number | undefined
term.rows // number | undefined

// Styling
term.chalk.red("error")
term.chalk.bold.green("success")

// Utilities
term.stripAnsi(str)
term.write(str)

// Cleanup
term.dispose() // or let `using` handle it
```

## Code Examples

### Detect Before Rendering

```ts
import { createTerm } from '@beorn/term'
import { render, renderString } from '@beorn/tui'

using term = createTerm()

if (term.hasCursor() && term.hasInput()) {
  // Full interactive TUI
  using app = await render(<InteractiveApp />, { fullscreen: true })
  await app.waitUntilExit()
} else if (term.hasCursor()) {
  // Output-only live updates
  using app = await render(<ProgressDisplay />)
} else {
  // Static output
  console.log(renderString(<SimpleOutput />, { width: term.cols }))
}
```

### Adaptive Components

```tsx
import { useTerm, Box, Text } from "@beorn/tui"

function StatusLine({ status }: { status: string }) {
  const term = useTerm()

  // Same component, adapts to capabilities
  const color = term.hasColor() ? "green" : undefined

  return (
    <Box>
      <Text color={color}>{status}</Text>
    </Box>
  )
}
```

### Console Component

```tsx
import { createTerm } from "@beorn/term"
import { render, Console, Box, Text } from "@beorn/tui"

using term = createTerm()

using app = await render(
  <Box flexDirection="column">
    <Console /> {/* Worker output appears here */}
    <Text>My UI below</Text>
  </Box>,
)

// Now console.log() calls appear in the Console component
console.log("This shows in <Console />")
```

### Test Reporter Pattern

```tsx
import { createTerm } from "@beorn/term"
import { render, renderString, Console, Box } from "@beorn/tui"

class Reporter {
  private term = createTerm()
  private app: RenderInstance | null = null

  async onTestRunStart() {
    if (this.term.hasCursor()) {
      this.app = await render(
        this.term,
        <Box flexDirection="column">
          <Console />
          <ReporterUI state={this.state} />
        </Box>,
      )
    }
  }

  onTestCaseResult(result: TestResult) {
    if (this.app) {
      this.setState({ results: [...this.state.results, result] })
    } else {
      console.log(renderString(<ResultDot result={result} />))
    }
  }

  onTestRunEnd() {
    this.app?.dispose()
    console.log(renderString(<Summary stats={this.stats} />))
    this.term.dispose()
  }
}
```

### Using Disposables

```ts
// Automatic cleanup with `using`
{
  using term = createTerm()
  using app = await render(<App />)

  // ... app runs ...

}  // Both cleaned up automatically

// Manual cleanup
const term = createTerm()
const app = await render(<App />)
// ...
app.dispose()
term.dispose()
```

## Standards Reference

### ECMA-48 (ISO 6429)

The standard defining CSI and OSC sequences. Published 1976, still the foundation.

- CSI format: `ESC [ <params> <intermediate> <final>`
- OSC format: `ESC ] <params> <ST>`

### XTerm Control Sequences

De facto standard for modern terminals. Extends ECMA-48 with:

- Mouse reporting
- Bracketed paste
- Window manipulation
- True color

Documentation: https://invisible-island.net/xterm/ctlseqs/ctlseqs.html

### terminfo/termcap

Database of terminal capabilities. Largely obsolete for modern apps - most now assume xterm-compatible baseline.

Key capability names:

- `cup` - cursor position
- `clear` - clear screen
- `smcup`/`rmcup` - enter/exit alternate screen
- `setaf`/`setab` - set foreground/background color

## See Also

- [ANSI escape code (Wikipedia)](https://en.wikipedia.org/wiki/ANSI_escape_code)
- [Escape Code Standards (Julia Evans)](https://jvns.ca/blog/2025/03/07/escape-code-standards/)
- [The Chaos of Terminal Standards](https://or1k.net/posts/ansi-escape-codes-terminal-standards/)
