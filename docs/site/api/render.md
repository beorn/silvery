# render

Render a React element to the terminal.

## Import

```tsx
import { render } from "inkx";
```

## Signature

```tsx
async function render(
  element: ReactElement,
  options?: RenderOptions
): Promise<Instance>
```

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `stdout` | `NodeJS.WriteStream` | `process.stdout` | Output stream to render to |
| `stdin` | `NodeJS.ReadStream` | `process.stdin` | Input stream for keyboard events |
| `exitOnCtrlC` | `boolean` | `true` | Exit the app when Ctrl+C is pressed |
| `patchConsole` | `boolean` | `true` | Patch console methods to work with Inkx output |
| `debug` | `boolean` | `false` | Enable verbose debug logging |
| `alternateScreen` | `boolean` | `false` | Use alternate screen buffer (restores terminal on exit) |

### Return Value

Returns a `Promise<Instance>` with the following methods:

| Method | Type | Description |
|--------|------|-------------|
| `rerender` | `(element: ReactNode) => void` | Re-render with a new element |
| `unmount` | `() => void` | Unmount the component and clean up |
| `waitUntilExit` | `() => Promise<void>` | Promise that resolves when the app exits |
| `clear` | `() => void` | Clear the terminal output |

## Examples

### Basic Usage

```tsx
import { render, Box, Text } from "inkx";

await render(
  <Box>
    <Text>Hello, World!</Text>
  </Box>
);
```

### With Custom Options

```tsx
import { render, Box, Text } from "inkx";
import { createWriteStream } from "fs";

const logStream = createWriteStream("/tmp/output.log");

await render(
  <Box>
    <Text>Logging to file...</Text>
  </Box>,
  {
    stdout: logStream,
    exitOnCtrlC: false,
    debug: true,
  }
);
```

### Programmatic Re-render

```tsx
import { render, Box, Text } from "inkx";

const { rerender } = await render(<Text>Count: 0</Text>);

let count = 0;
setInterval(() => {
  count++;
  rerender(<Text>Count: {count}</Text>);
}, 1000);
```

### Async App with waitUntilExit

```tsx
import { render, Box, Text, useApp, useInput } from "inkx";

function App() {
  const { exit } = useApp();

  useInput((input) => {
    if (input === "q") {
      exit();
    }
  });

  return (
    <Box>
      <Text>Press 'q' to quit</Text>
    </Box>
  );
}

async function main() {
  const { waitUntilExit } = await render(<App />);

  await waitUntilExit();
  console.log("App exited!");
}

main();
```

### Alternate Screen Mode

```tsx
import { render, Box, Text } from "inkx";

// Uses alternate screen buffer - terminal is restored on exit
const { waitUntilExit } = await render(
  <Box flexDirection="column" padding={1}>
    <Text>Full-screen app</Text>
    <Text>Terminal will be restored when you exit</Text>
  </Box>,
  { alternateScreen: true }
);

await waitUntilExit();
```

## Synchronous Variant

For cases where Yoga is already initialized, use `renderSync`:

```tsx
import { render, renderSync, Box, Text } from "inkx";

// Initialize Yoga with first render
await render(<Text>Loading...</Text>);

// Subsequent renders can be synchronous
const instance = renderSync(<Text>Ready!</Text>);
```

## Notes

- `render()` is async because it initializes the Yoga layout engine on first call
- Multiple calls to `render()` with the same `stdout` reuse the same instance
- Use `alternateScreen: true` for full-screen apps to restore terminal state on exit
- The `patchConsole` option prevents console output from corrupting the UI
