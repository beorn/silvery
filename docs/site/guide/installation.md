# Installation

## Requirements

- Node.js 18+ or Bun 1.0+
- React 18+

## Install Inkx

::: code-group

```bash [bun]
bun add inkx
```

```bash [npm]
npm install inkx
```

```bash [yarn]
yarn add inkx
```

```bash [pnpm]
pnpm add inkx
```

:::

## TypeScript Support

Inkx includes TypeScript definitions out of the box. No additional `@types` packages needed.

```json
// tsconfig.json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true
  }
}
```

## Running Your App

Inkx apps are just TypeScript/JavaScript files. Run them directly:

::: code-group

```bash [bun]
bun run app.tsx
```

```bash [tsx]
npx tsx app.tsx
```

```bash [ts-node]
npx ts-node --esm app.tsx
```

:::

## Testing Inkx Apps

Inkx includes a testing library with auto-cleanup between renders:

```tsx
import { createRenderer } from "inkx/testing"
import { Text } from "inkx"

const render = createRenderer()

test("renders hello", () => {
  const { lastFrame } = render(<Text>Hello</Text>)
  expect(lastFrame()).toContain("Hello")
})

test("renders world", () => {
  // Previous render is auto-cleaned when render() is called again
  const { lastFrame } = render(<Text>World</Text>)
  expect(lastFrame()).toContain("World")
})
```
