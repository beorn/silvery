# Installation

## Requirements

- Node.js 18+ or Bun 1.0+
- React 18+

## Install InkX

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

InkX includes TypeScript definitions out of the box. No additional `@types` packages needed.

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

InkX apps are just TypeScript/JavaScript files. Run them directly:

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

## Testing InkX Apps

InkX includes a testing helper for rendering components and examining buffer output:

```tsx
import { renderToBuffer } from "inkx/testing";

test("renders hello", async () => {
  const buffer = await renderToBuffer(<Text>Hello</Text>);
  expect(buffer.toString()).toContain("Hello");
});
```
