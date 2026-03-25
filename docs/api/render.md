# render

Render a React element to the terminal.

## Import

```tsx
import { render, createTerm } from "silvery"
```

## Signature

```tsx
function render(element: ReactElement, term?: Term, options?: RenderOptions): RenderHandle
```

### Parameters

| Parameter | Type            | Description                           |
| --------- | --------------- | ------------------------------------- |
| `element` | `ReactElement`  | React element to render               |
| `term`    | `Term`          | Terminal instance from `createTerm()` |
| `options` | `RenderOptions` | Optional render configuration         |

### Options

| Option            | Type      | Default | Description                                             |
| ----------------- | --------- | ------- | ------------------------------------------------------- |
| `exitOnCtrlC`     | `boolean` | `true`  | Exit the app when Ctrl+C is pressed                     |
| `patchConsole`    | `boolean` | `true`  | Patch console methods to work with Silvery output       |
| `debug`           | `boolean` | `false` | Enable verbose debug logging                            |
| `alternateScreen` | `boolean` | `false` | Use alternate screen buffer (restores terminal on exit) |

### Return Value

Returns a `RenderHandle` synchronously. The handle is thenable (implements `PromiseLike<Instance>`), so `await render(...)` works as a shortcut to get the `Instance` directly. For the common case of rendering and waiting for exit, use `.run()`.

**RenderHandle methods:**

| Method | Type                | Description                                                      |
| ------ | ------------------- | ---------------------------------------------------------------- |
| `run`  | `() => Promise<void>` | Start the event loop and wait until the app exits              |
| `then` | `PromiseLike<Instance>` | Thenable — `await render(...)` resolves to an `Instance`     |

**Instance methods** (returned by `await render(...)` or inside `.then()`):

| Method          | Type                           | Description                              |
| --------------- | ------------------------------ | ---------------------------------------- |
| `rerender`      | `(element: ReactNode) => void` | Re-render with a new element             |
| `unmount`       | `() => void`                   | Unmount the component and clean up       |
| `waitUntilExit` | `() => Promise<void>`          | Promise that resolves when the app exits |
| `clear`         | `() => void`                   | Clear the terminal output                |

## Examples

### Basic Usage

```tsx
import { render, Box, Text, createTerm } from "silvery"

using term = createTerm()

const app = render(
  <Box>
    <Text>Hello, World!</Text>
  </Box>,
  term,
)
await app.run()
```

### With Custom Options

```tsx
import { render, Box, Text, createTerm } from "silvery"

using term = createTerm()

const app = render(
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
await app.run()
```

### Programmatic Re-render

```tsx
import { render, Text, createTerm } from "silvery"

using term = createTerm()

const instance = await render(<Text>Count: 0</Text>, term)

let count = 0
setInterval(() => {
  count++
  instance.rerender(<Text>Count: {count}</Text>)
}, 1000)
```

### Async App with waitUntilExit

```tsx
import { render, Box, Text, useApp, useInput, createTerm } from "silvery"

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

  const app = render(<App />, term)
  await app.run()
  console.log("App exited!")
}

main()
```

### Alternate Screen Mode

```tsx
import { render, Box, Text, createTerm } from "silvery"

using term = createTerm()

// Uses alternate screen buffer - terminal is restored on exit
const app = render(
  <Box flexDirection="column" padding={1}>
    <Text>Full-screen app</Text>
    <Text>Terminal will be restored when you exit</Text>
  </Box>,
  term,
  { alternateScreen: true },
)
await app.run()
```

### Using Term in Components

```tsx
import { render, Box, Text, useTerm, createTerm } from "silvery"

function ColoredOutput() {
  const term = useTerm()

  return (
    <Box>
      <Text>{term.green("Success!")} Operation completed.</Text>
    </Box>
  )
}

using term = createTerm()
const app = render(<ColoredOutput />, term)
await app.run()
```

## Synchronous Variant

For cases where the layout engine is already initialized, use `renderSync`:

```tsx
import { render, renderSync, Text, createTerm } from "silvery"

using term = createTerm()

// Initialize layout engine with first render (await the thenable)
const instance = await render(<Text>Loading...</Text>, term)

// Subsequent renders can be synchronous
const instance2 = renderSync(<Text>Ready!</Text>, term)
```

## Notes

- `render()` is synchronous — it returns a `RenderHandle`, not a Promise
- `RenderHandle` is thenable (`PromiseLike<Instance>`), so `await render(...)` works to get the `Instance`
- `.run()` on the handle starts the event loop and waits for exit — the common case for interactive apps
- The `term` parameter is optional — without it, Silvery creates a default term internally
- Use `using term = createTerm()` for automatic cleanup with explicit resource management
- Use `alternateScreen: true` for full-screen apps to restore terminal state on exit
- The `patchConsole` option prevents console output from corrupting the UI
- Components can access the term via `useTerm()` hook
