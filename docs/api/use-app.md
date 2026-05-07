# useApp

Access app-level controls like exiting the application or panicking to the real terminal.

## Import

```tsx
import { useApp, usePanic } from "silvery"
```

`usePanic()` returns the same `panic` function directly.

## Usage

```tsx
function App() {
  const { exit, panic } = useApp()

  useInput((input) => {
    if (input === "q") {
      exit()
    }
    if (input === "P") {
      panic("provider invariant failed", { title: "my-app" })
    }
  })

  return <Text>Press q to quit</Text>
}
```

## Return Value

| Property | Type                                                        | Description                                                                 |
| -------- | ----------------------------------------------------------- | --------------------------------------------------------------------------- |
| `exit`   | `(error?: Error) => void`                                   | Exit the application                                                        |
| `panic`  | `(reason: unknown, options?: PanicOptions) => void`         | Exit, restore terminal state, then print a copyable diagnostic to `stderr`  |

The `exit` function accepts an optional `Error` argument. When called with an error, the app indicates it exited due to a failure.

Use `panic` for fatal diagnostics that must survive fullscreen/alt-screen teardown. Silvery restores raw mode, leaves alt-screen, then prints the message on the regular terminal screen.

## Examples

### Exit on Keypress

```tsx
function QuitOnQ() {
  const { exit } = useApp()

  useInput((input) => {
    if (input === "q") {
      exit()
    }
  })

  return <Text>Press q to quit</Text>
}
```

### Exit with Error

```tsx
function CriticalOperation() {
  const { exit } = useApp()

  async function runOperation() {
    try {
      await riskyOperation()
    } catch (err) {
      exit(err as Error)
    }
  }

  useEffect(() => {
    runOperation()
  }, [])

  return <Text>Running...</Text>
}
```

### Panic to Regular Screen

```tsx
function FatalInvariant({ sessionId }: { sessionId: string }) {
  const { panic } = useApp()

  useEffect(() => {
    panic(new Error("subagent activity invariant failed"), {
      title: "silvercode",
      details: [`session ${sessionId}`],
      exitCode: 1,
    })
  }, [panic, sessionId])

  return <Text>Loading...</Text>
}
```

### Confirm Before Exit

```tsx
function ConfirmExit() {
  const { exit } = useApp()
  const [confirmQuit, setConfirmQuit] = useState(false)

  useInput((input) => {
    if (confirmQuit) {
      if (input === "y") exit()
      if (input === "n") setConfirmQuit(false)
    } else if (input === "q") {
      setConfirmQuit(true)
    }
  })

  if (confirmQuit) {
    return <Text>Really quit? (y/n)</Text>
  }

  return <Text>Press q to quit</Text>
}
```

### Exit with Ctrl+C

```tsx
function App() {
  const { exit } = useApp()

  useInput((input, key) => {
    if (input === "c" && key.ctrl) {
      exit()
    }
  })

  return <Text>Press Ctrl+C to exit</Text>
}
```
