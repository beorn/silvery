# Installation

## Requirements

- Node.js 18+ or Bun 1.0+
- React 18+

## Install inkx

::: code-group

```bash [bun]
bun add @hightea/term
```

```bash [npm]
npm install @hightea/term
```

```bash [yarn]
yarn add @hightea/term
```

```bash [pnpm]
pnpm add @hightea/term
```

:::

## TypeScript Support

inkx includes TypeScript definitions out of the box. No additional `@types` packages needed.

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

inkx apps are just TypeScript/JavaScript files. Run them directly:

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

## Testing inkx Apps

inkx includes a testing library with auto-cleanup between renders:

```tsx
import { createRenderer } from "@hightea/term/testing"
import { Text } from "@hightea/term"

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
