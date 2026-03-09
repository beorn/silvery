# silvery

Multi-target rendering framework for React — terminal, browser, and beyond.

## Packages

| Package          | Description                                    |
| ---------------- | ---------------------------------------------- |
| `silvery`        | Umbrella package (re-exports all `@silvery/*`) |
| `@silvery/react` | Core React reconciler and runtime              |
| `@silvery/term`  | Terminal rendering target                      |
| `@silvery/ansi`  | ANSI styling (chalk replacement)               |
| `@silvery/theme` | Theming with semantic color tokens             |
| `@silvery/tea`   | TEA state machine store                        |
| `@silvery/ui`    | Component library                              |
| `@silvery/test`  | Testing utilities                              |

## Getting Started

```bash
bun add silvery react
```

```tsx
import { run, Box, Text, useInput } from "silvery"

function App() {
  const [count, setCount] = useState(0)

  useInput((input) => {
    if (input === "j") setCount((c) => c + 1)
    if (input === "q") return "exit"
  })

  return <Text>Count: {count}</Text>
}

await run(<App />)
```

## Development

```bash
bun install
bun test
bun run lint
```

## License

MIT
