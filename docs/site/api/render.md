# render

Render a React element to the terminal.

## Import

```tsx
import { render, createTerm } from "@silvery/term"
```

## Signature

```tsx
function render(element: ReactElement, term?: Term | TermDef, options?: RenderOptions): RenderHandle
```

### Parameters

| Parameter | Type              | Description                           |
| --------- | ----------------- | ------------------------------------- |
| `element` | `ReactElement`    | React element to render               |
| `term`    | `Term \| TermDef` | Terminal instance from `createTerm()` |
| `options` | `RenderOptions`   | Optional render configuration         |

### Options

| Option            | Type      | Default | Description                                             |
| ----------------- | --------- | ------- | ------------------------------------------------------- |
| `exitOnCtrlC`     | `boolean` | `true`  | Exit the app when Ctrl+C is pressed                     |
| `patchConsole`    | `boolean` | `true`  | Patch console methods to work with silvery output       |
| `debug`           | `boolean` | `false` | Enable verbose debug logging                            |
| `alternateScreen` | `boolean` | `false` | Use alternate screen buffer (restores terminal on exit) |

### Return Value

Returns a `Promise<Instance>` with the following methods:

| Method          | Type                           | Description                              |
| --------------- | ------------------------------ | ---------------------------------------- |
| `rerender`      | `(element: ReactNode) => void` | Re-render with a new element             |
| `unmount`       | `() => void`                   | Unmount the component and clean up       |
| `waitUntilExit` | `() => Promise<void>`          | Promise that resolves when the app exits |
| `clear`         | `() => void`                   | Clear the terminal output                |

## Examples

### Basic Usage

```tsx
import { render, Box, Text, createTerm } from "@silvery/term"

using term = createTerm()

await render(
  <Box>
    <Text>Hello, World!</Text>
  </Box>,
  term,
)
```

### With Custom Options

```tsx
import { render, Box, Text, createTerm } from "@silvery/term"

using term = createTerm()

await render(
  <Box>
    <Text>Full-screen mode...</Text>
  </Box>,
  term,
  {
    exitOnCtrlC: false,
    alternateScreen: true,
    debug: true,
  },
)
```

### Programmatic Re-render

```tsx
import { render, Text, createTerm } from "@silvery/term"

using term = createTerm()

const { rerender } = await render(<Text>Count: 0</Text>, term)

let count = 0
setInterval(() => {
  count++
  rerender(<Text>Count: {count}</Text>)
}, 1000)
```

### Async App with waitUntilExit

```tsx
import { render, Box, Text, useApp, useInput, createTerm } from "@silvery/term"

function App() {
  const { exit } = useApp()

  useInput((input) => {
    if (input === "q") {
      exit()
    }
  })

  return (
    <Box>
      <Text>Press 'q' to quit</Text>
    </Box>
  )
}

async function main() {
  using term = createTerm()

  const { waitUntilExit } = await render(<App />, term)

  await waitUntilExit()
  console.log("App exited!")
}

main()
```

### Alternate Screen Mode

```tsx
import { render, Box, Text, createTerm } from "@silvery/term"

using term = createTerm()

// Uses alternate screen buffer - terminal is restored on exit
const { waitUntilExit } = await render(
  term,
  <Box flexDirection="column" padding={1}>
    <Text>Full-screen app</Text>
    <Text>Terminal will be restored when you exit</Text>
  </Box>,
  { alternateScreen: true },
)

await waitUntilExit()
```

### Using Term in Components

```tsx
import { render, Box, Text, useTerm, createTerm } from "@silvery/term"

function ColoredOutput() {
  const term = useTerm()

  return (
    <Box>
      <Text>{term.green("Success!")} Operation completed.</Text>
    </Box>
  )
}

using term = createTerm()
await render(<ColoredOutput />, term)
```

## Synchronous Variant

For cases where Yoga is already initialized, use `renderSync`:

```tsx
import { render, renderSync, Text, createTerm } from "@silvery/term"

using term = createTerm()

// Initialize Yoga with first render
await render(<Text>Loading...</Text>, term)

// Subsequent renders can be synchronous
const instance = renderSync(<Text>Ready!</Text>, term)
```

## Notes

- `render()` is async because it initializes the Yoga layout engine on first call
- The `term` parameter is required - use `createTerm()` to create one
- Use `using term = createTerm()` for automatic cleanup with explicit resource management
- Use `alternateScreen: true` for full-screen apps to restore terminal state on exit
- The `patchConsole` option prevents console output from corrupting the UI
- Components can access the term via `useTerm()` hook
