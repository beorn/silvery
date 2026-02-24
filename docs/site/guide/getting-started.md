<script setup>
import LiveDemo from '../.vitepress/components/LiveDemo.vue'
</script>

# Getting Started

inkx is a terminal UI framework for React that lets components know their computed dimensions. It's a drop-in replacement for Ink with one key addition: the `useContentRect()` hook.

## Installation

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

<LiveDemo xtermSrc="/inkx/examples/showcase.html?demo=layout-feedback" :height="250" />

## Your First App

Create a file called `app.tsx`:

```tsx
import { Box, Text, render, createTerm } from "inkx"

function App() {
  return (
    <Box borderStyle="round" padding={1}>
      <Text>Hello from inkx!</Text>
    </Box>
  )
}

using term = createTerm()
await render(<App />, term)
```

Run it:

```bash
bun app.tsx
# or: npx tsx app.tsx
```

You should see a rounded box with "Hello from inkx!" inside.

## Using Layout Feedback

The key feature of inkx is `useContentRect()`. Components can query their computed dimensions:

```tsx
import { Box, Text, render, useContentRect, createTerm } from "inkx"

function SizedBox() {
  const { width, height } = useContentRect()
  return (
    <Box borderStyle="single" flexGrow={1}>
      <Text>
        I am {width}x{height}
      </Text>
    </Box>
  )
}

function App() {
  return (
    <Box flexDirection="row" width="100%">
      <SizedBox />
      <SizedBox />
      <SizedBox />
    </Box>
  )
}

using term = createTerm()
await render(<App />, term)
```

Each `SizedBox` will display its actual computed dimensions. No prop threading needed!

## Scrollable Lists

inkx handles scrolling automatically. Just use `overflow="scroll"`:

```tsx
import { Box, Text, render, useInput, createTerm } from "inkx"
import { useState } from "react"

const items = Array.from({ length: 100 }, (_, i) => `Item ${i + 1}`)

function App() {
  const [selected, setSelected] = useState(0)

  useInput((input, key) => {
    if (key.downArrow) setSelected((s) => Math.min(s + 1, items.length - 1))
    if (key.upArrow) setSelected((s) => Math.max(s - 1, 0))
  })

  return (
    <Box flexDirection="column" height={10} overflow="scroll" scrollTo={selected}>
      {items.map((item, i) => (
        <Text key={i} inverse={i === selected}>
          {item}
        </Text>
      ))}
    </Box>
  )
}

using term = createTerm()
await render(<App />, term)
```

inkx measures all children, calculates which are visible, and only renders content for visible items. No height estimation or virtualization config needed.

## Next Steps

- [Components](/guide/components) - Learn about Box, Text, and other components
- [Hooks](/guide/hooks) - Deep dive into useContentRect, useInput, and more
- [Migration from Ink](/guide/migration) - Switching from an existing Ink app
- [API Reference](/api/box) - Complete API documentation
