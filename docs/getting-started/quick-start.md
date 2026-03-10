<script setup>
import LiveDemo from '../.vitepress/components/LiveDemo.vue'
</script>

# Quick Start

Silvery is a React framework for building terminal applications -- a drop-in replacement for Ink with layout feedback, scrollable containers, and 100x+ faster interactive updates. If you know Ink, the core API (`Box`, `Text`, `useInput`) is familiar. The key addition: `useContentRect()` lets components query their own dimensions during render.

## Installation

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

> **Package note:** `silvery` is an umbrella package that re-exports `@silvery/react` (components, hooks, render). For terminal-specific APIs (buffer, pipeline), import from `@silvery/term`. For theming, import from `@silvery/theme`.

<LiveDemo xtermSrc="/examples/showcase.html?demo=layout-feedback" :height="250" />

## Your First App

Create a file called `app.tsx`:

```tsx
import { Box, Text, render, createTerm } from "silvery"

function App() {
  return (
    <Box borderStyle="round" padding={1}>
      <Text>Hello from Silvery!</Text>
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

You should see a rounded box with "Hello from Silvery!" inside.

## Using Layout Feedback

The key feature of Silvery is `useContentRect()`. Components can query their computed dimensions:

```tsx
import { Box, Text, render, useContentRect, createTerm } from "silvery"

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

Silvery handles scrolling automatically. Just use `overflow="scroll"`:

```tsx
import { Box, Text, render, useInput, createTerm } from "silvery"
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

Silvery measures all children, calculates which are visible, and only renders content for visible items. No height estimation or virtualization config needed.

## Next Steps

- [Components](/guides/components) -- Learn about Box, Text, and other components
- [Terminal Apps](/guides/terminal-apps) -- Build a full terminal application step by step
- [Migrate from Ink](/getting-started/migrate-from-ink) -- Switching from an existing Ink app
- [API Reference](/api/box) -- Complete API documentation
