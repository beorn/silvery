---
layout: home

hero:
  name: "InkX"
  text: "Ink, but components know their size"
  tagline: A terminal UI framework for React with two-phase rendering
  actions:
    - theme: brand
      text: Get Started
      link: /guide/getting-started
    - theme: alt
      text: View on GitHub
      link: https://github.com/beorn/inkx

features:
  - icon: 📐
    title: Layout Feedback
    details: Components can access their computed dimensions via useLayout(). No more manual width prop threading.
  - icon: 🔄
    title: Drop-in Replacement
    details: Same API as Ink - Box, Text, useInput, render() all work unchanged. Just swap the import.
  - icon: 📜
    title: Automatic Scrolling
    details: Use overflow="scroll" and scrollTo={index} - InkX handles virtualization automatically.
  - icon: ✂️
    title: Auto-Truncation
    details: Text automatically truncates to fit available width. No more layout overflow bugs.
---

## Quick Start

```bash
bun add inkx
```

```tsx
import { Box, Text, render, useLayout } from "inkx";

function Card({ title }) {
  const { width } = useLayout(); // Components know their size!
  return (
    <Box borderStyle="round" width={width}>
      <Text>{title}</Text>
    </Box>
  );
}

function App() {
  return (
    <Box flexDirection="column">
      <Card title="First Card" />
      <Card title="Second Card" />
    </Box>
  );
}

render(<App />);
```

## The Problem InkX Solves

In Ink, components render *before* layout is computed. You can't know a component's dimensions, so you manually thread width props everywhere:

```tsx
// Ink: width props cascade through the entire tree
function Board({ width }) {
  const colWidth = Math.floor((width - 2) / 3);
  return (
    <Box flexDirection="row">
      <Column width={colWidth} items={todo} />
      <Column width={colWidth} items={doing} />
      <Column width={colWidth} items={done} />
    </Box>
  );
}
```

Real apps have 100+ lines of this. Every layout change means updating arithmetic everywhere.

**InkX fixes this** by computing layout first, then letting components query their dimensions:

```tsx
// InkX: no width props needed
function Column({ items }) {
  const { width } = useLayout();
  return (
    <Box flexGrow={1}>
      {items.map(item => <Card item={item} />)}
    </Box>
  );
}
```
