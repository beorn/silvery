---
title: Live Demo
description: Silvery rendered in the browser via xterm.js
prev:
  text: Overview
  link: /examples/
next:
  text: Dashboard
  link: /examples/dashboard
---

# Live Demo

An Silvery React component rendered in the browser via xterm.js — the same ANSI output you'd see in a real terminal.

<script setup>
import LiveDemo from '../.vitepress/components/LiveDemo.vue'
</script>

<LiveDemo />

## How It Works

Silvery's `RenderAdapter` interface abstracts the rendering target. The same component tree runs through the same layout engine (Flexily) and render pipeline. The xterm adapter writes ANSI escape sequences to an xterm.js terminal emulator running in the browser.

### The Component

```tsx
import { Box, Text, useContentRect } from "silvery";

function App() {
  const { width, height } = useContentRect();
  return (
    <Box flexDirection="column" padding={1}>
      <Box borderStyle="single" borderColor="cyan" padding={1}>
        <Text bold color="cyan">
          Silvery Rendering
        </Text>
        <Text color="green">
          Size: {width} x {height}
        </Text>
      </Box>
      <Box marginTop={1} flexDirection="row" gap={1}>
        <Box backgroundColor="red" padding={1}>
          <Text color="white">Red</Text>
        </Box>
        <Box backgroundColor="green" padding={1}>
          <Text color="black">Green</Text>
        </Box>
        <Box backgroundColor="blue" padding={1}>
          <Text color="white">Blue</Text>
        </Box>
      </Box>
    </Box>
  );
}
```

## Building Locally

```bash
cd vendor/silvery
bun run examples/web/build.ts
```

This builds the JavaScript bundles into `examples/web/dist/`. The HTML pages load these bundles and render the demo applications.
