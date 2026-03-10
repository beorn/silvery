<script setup>
import LiveDemo from '../.vitepress/components/LiveDemo.vue'
</script>

# Quick Start

Silvery is a React renderer for terminal applications — use it as just a renderer, or add optional packages for a complete framework. The core API (`Box`, `Text`, `useInput`) works like other React terminal renderers. What's different: responsive layout, native scrolling, and per-node incremental rendering.

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

> **One package is all you need.** `silvery` includes everything to build terminal apps — components, hooks, and rendering. The `@silvery/*` scoped packages exist for advanced users who want finer-grained imports.

<LiveDemo xtermSrc="/examples/showcase.html?demo=dashboard" :height="400" />

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

## Responsive Layout

Components can query their own dimensions during render — no prop drilling needed:

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

## Interactive Lists

`SelectList` gives you keyboard-navigable selection out of the box — arrow keys, j/k, Home/End, disabled items, and scroll windowing. No manual `useInput()` or cursor state needed:

```tsx
import { Box, Text, SelectList, render, createTerm } from "silvery"

function App() {
  return (
    <Box flexDirection="column" padding={1}>
      <Text bold>Pick a framework:</Text>
      <SelectList
        items={[
          { label: "React", value: "react" },
          { label: "Vue", value: "vue" },
          { label: "Svelte", value: "svelte" },
          { label: "Angular (coming soon)", value: "angular", disabled: true },
        ]}
        onSelect={(item) => console.log(`Selected: ${item.value}`)}
        maxVisible={5}
      />
    </Box>
  )
}

using term = createTerm()
await render(<App />, term)
```

For large datasets, use `VirtualList` with `interactive` mode — it renders only visible items and handles keyboard navigation (j/k, Page Up/Down, Home/End):

```tsx
import { Box, VirtualList, Text, render, createTerm } from "silvery"

const items = Array.from({ length: 1000 }, (_, i) => `Item ${i + 1}`)

function App() {
  return (
    <VirtualList
      items={items}
      height={15}
      itemHeight={1}
      interactive
      renderItem={(item, index, meta) => (
        <Text inverse={meta?.isSelected}> {item} </Text>
      )}
      onSelect={(index) => console.log(`Selected: ${items[index]}`)}
    />
  )
}

using term = createTerm()
await render(<App />, term)
```

## Next Steps

- [Components](/guides/components) -- Learn about Box, Text, and other components
- [Terminal Apps](/guides/terminal-apps) -- Build a full terminal application step by step
- [Migrate from Ink](/getting-started/migrate-from-ink) -- Switching from an existing Ink app
- [API Reference](/api/box) -- Complete API documentation
