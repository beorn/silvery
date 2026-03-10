# useApp

Access app-level controls like exiting the application.

## Import

```tsx
import { useApp } from "silvery";
```

## Usage

```tsx
function App() {
  const { exit } = useApp();

  useInput((input) => {
    if (input === "q") {
      exit();
    }
  });

  return <Text>Press q to quit</Text>;
}
```

## Return Value

| Property | Type                      | Description          |
| -------- | ------------------------- | -------------------- |
| `exit`   | `(error?: Error) => void` | Exit the application |

The `exit` function accepts an optional `Error` argument. When called with an error, the app indicates it exited due to a failure.

## Examples

### Exit on Keypress

```tsx
function QuitOnQ() {
  const { exit } = useApp();

  useInput((input) => {
    if (input === "q") {
      exit();
    }
  });

  return <Text>Press q to quit</Text>;
}
```

### Exit with Error

```tsx
function CriticalOperation() {
  const { exit } = useApp();

  async function runOperation() {
    try {
      await riskyOperation();
    } catch (err) {
      exit(err as Error);
    }
  }

  useEffect(() => {
    runOperation();
  }, []);

  return <Text>Running...</Text>;
}
```

### Confirm Before Exit

```tsx
function ConfirmExit() {
  const { exit } = useApp();
  const [confirmQuit, setConfirmQuit] = useState(false);

  useInput((input) => {
    if (confirmQuit) {
      if (input === "y") exit();
      if (input === "n") setConfirmQuit(false);
    } else if (input === "q") {
      setConfirmQuit(true);
    }
  });

  if (confirmQuit) {
    return <Text>Really quit? (y/n)</Text>;
  }

  return <Text>Press q to quit</Text>;
}
```

### Exit with Ctrl+C

```tsx
function App() {
  const { exit } = useApp();

  useInput((input, key) => {
    if (input === "c" && key.ctrl) {
      exit();
    }
  });

  return <Text>Press Ctrl+C to exit</Text>;
}
```
