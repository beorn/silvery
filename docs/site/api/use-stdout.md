# useStdout

Access the stdout stream for terminal dimensions and direct output.

## Import

```tsx
import { useStdout } from "silvery"
```

## Usage

```tsx
function TerminalInfo() {
  const { stdout } = useStdout()

  return (
    <Text>
      Terminal: {stdout.columns}x{stdout.rows}
    </Text>
  )
}
```

## Return Value

| Property | Type                     | Description              |
| -------- | ------------------------ | ------------------------ |
| `stdout` | `NodeJS.WriteStream`     | The stdout stream        |
| `write`  | `(data: string) => void` | Write directly to stdout |

## Examples

### Get Terminal Dimensions

```tsx
function TerminalSize() {
  const { stdout } = useStdout()

  return (
    <Text>
      {stdout.columns} columns x {stdout.rows} rows
    </Text>
  )
}
```

### Responsive Layout Based on Terminal Size

```tsx
function ResponsiveApp() {
  const { stdout } = useStdout()

  const isNarrow = stdout.columns < 80

  return (
    <Box flexDirection={isNarrow ? "column" : "row"}>
      <Box flexGrow={1}>
        <Text>Panel 1</Text>
      </Box>
      <Box flexGrow={1}>
        <Text>Panel 2</Text>
      </Box>
    </Box>
  )
}
```

### Write Directly to Stdout

```tsx
function DirectOutput() {
  const { write } = useStdout()

  useEffect(() => {
    write("\x1b[?25l") // Hide cursor
    return () => {
      write("\x1b[?25h") // Show cursor on unmount
    }
  }, [])

  return <Text>Cursor hidden</Text>
}
```

### Debug Output

```tsx
function DebugComponent() {
  const { write } = useStdout()

  useInput((input, key) => {
    // Write debug info outside the rendered area
    write(`\x1b[1;1H[DEBUG] Key: ${input}\x1b[0m`)
  })

  return <Text>Press keys to debug</Text>
}
```

## Notes

- The `stdout` object is the standard Node.js `WriteStream`
- Use `stdout.columns` and `stdout.rows` for terminal dimensions
- The `write` function bypasses Silvery rendering and writes directly to the terminal
- Direct writes may interfere with Silvery's output - use sparingly
