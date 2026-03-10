# Installation

## Requirements

- Node.js 18+ or Bun 1.0+
- React 18+

## Install Silvery

::: code-group

```bash [bun]
bun add silvery
```

```bash [npm]
npm install silvery
```

```bash [yarn]
yarn add silvery
```

```bash [pnpm]
pnpm add silvery
```

:::

## TypeScript Support

Silvery includes TypeScript definitions out of the box. No additional `@types` packages needed.

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

Silvery apps are just TypeScript/JavaScript files. Run them directly:

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

## Testing Silvery Apps

Silvery includes a testing library with auto-cleanup between renders:

```tsx
import { createRenderer } from "@silvery/test";
import { Text } from "silvery";

const render = createRenderer();

test("renders hello", () => {
  const app = render(<Text>Hello</Text>);
  expect(app.text).toContain("Hello");
});

test("renders world", () => {
  // Previous render is auto-cleaned when render() is called again
  const app = render(<Text>World</Text>);
  expect(app.text).toContain("World");
});
```
