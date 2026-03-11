<script setup>
import LiveDemo from '../.vitepress/components/LiveDemo.vue'
</script>

# Scrolling

Silvery makes scrolling effortless. Just render your content and let Silvery handle the rest.

<LiveDemo xtermSrc="/examples/showcase.html?demo=scroll" :height="300" />

## Basic Usage

Add `overflow="scroll"` to any Box:

```tsx
import { Box, Text } from "silvery"

const items = Array.from({ length: 100 }, (_, i) => `Item ${i + 1}`)

function App() {
  return (
    <Box flexDirection="column" height={10} overflow="scroll">
      {items.map((item, i) => (
        <Text key={i}>{item}</Text>
      ))}
    </Box>
  )
}
```

Silvery will:

- Measure all 100 children
- Determine which fit in the viewport
- Only render content for visible items
- Show overflow indicators ("▲ N more", "▼ N more")

## Keeping Selection Visible

Use `scrollTo` to keep a specific item visible:

```tsx
import { Box, Text, useInput } from "silvery"
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
```

The selected item will be centered in the viewport when possible.

## Variable Height Items

Silvery handles variable heights automatically:

```tsx
function TaskList({ tasks, selectedIndex }) {
  return (
    <Box flexDirection="column" overflow="scroll" scrollTo={selectedIndex}>
      {tasks.map((task, i) => (
        <TaskRow key={task.id} task={task} isSelected={i === selectedIndex} />
      ))}
    </Box>
  )
}

function TaskRow({ task, isSelected }) {
  // Variable height - some tasks have subtasks
  return (
    <Box flexDirection="column" backgroundColor={isSelected ? "blue" : undefined}>
      <Text>
        {task.done ? "✓" : "○"} {task.title}
      </Text>
      {task.subtasks?.map((st) => (
        <Text key={st.id} dimColor>
          {" "}
          • {st.title}
        </Text>
      ))}
    </Box>
  )
}
```

**No height estimation needed.** Silvery uses its layout engine to measure each item's actual height.

## How It Works

Silvery uses a **measure-then-render** approach:

```
1. React creates all child elements
2. Layout engine measures all children (fast - ~1ms for 500 items)
3. Calculate scroll position from scrollTo prop
4. Render content ONLY for visible children
5. Paint visible content to terminal
```

**Key insight**: Layout is extremely fast. The expensive part is building terminal strings. Silvery skips that for non-visible items.

### Performance

| List Size  | Layout | Content Render    | Total |
| ---------- | ------ | ----------------- | ----- |
| 100 items  | <1ms   | ~1ms (20 visible) | ~2ms  |
| 500 items  | ~1ms   | ~1ms (20 visible) | ~2ms  |
| 1000 items | ~2ms   | ~1ms (20 visible) | ~3ms  |

## overflow="hidden"

Use `overflow="hidden"` to clip without scroll indicators:

```tsx
<Box overflow="hidden" height={5}>
  <Text>This content will be clipped if too tall</Text>
</Box>
```

## List Components

Silvery has three ways to render scrollable lists. They form a progression — start with `overflow="scroll"` and reach for the others when your use case demands it.

### Box overflow="scroll" — The Default

What this page covers. Render all your children, let the layout engine handle the rest. Works great for lists up to ~1000 items.

```tsx
<Box flexDirection="column" overflow="scroll" scrollTo={selected}>
  {items.map((item, i) => (
    <Row key={item.id} item={item} />
  ))}
</Box>
```

### VirtualList — Large Lists

For 1000+ items, layout itself becomes noticeable. [`VirtualList`](/guides/components#display-components) skips React rendering entirely for off-screen items — O(visible) regardless of list size. Same `scrollTo` pattern, plus an `interactive` mode with built-in keyboard navigation (j/k, arrows, PgUp/PgDn, Home/End):

```tsx
import { VirtualList } from "silvery"

<VirtualList
  items={items}
  height={20}
  itemHeight={1}
  scrollTo={selected}
  renderItem={(item, i) => <Row item={item} />}
/>

// Or with built-in keyboard navigation:
<VirtualList
  items={items}
  height={20}
  itemHeight={1}
  interactive
  onSelect={(i) => openItem(items[i])}
  renderItem={(item, i, meta) => (
    <Text>{meta?.isSelected ? "> " : "  "}{item.name}</Text>
  )}
/>
```

### ScrollbackList — Streaming / Inline Mode

For lists where items complete over time — task runners, test output, chat messages. Completed items freeze into terminal scrollback and become part of the terminal history. Only works with [inline mode](/examples/scrollback).

```tsx
import { ScrollbackList } from "silvery"
;<ScrollbackList items={tasks} keyExtractor={(t) => t.id} isFrozen={(t) => t.done} footer={<StatusBar />}>
  {(task) => <TaskRow task={task} />}
</ScrollbackList>
```

### Which One?

|                 | overflow="scroll"                           | VirtualList                                     | ScrollbackList                                    |
| --------------- | ------------------------------------------- | ----------------------------------------------- | ------------------------------------------------- |
| **List size**   | Up to ~1000                                 | Any size                                        | Any size                                          |
| **Rendering**   | All children created, visible ones rendered | Only visible items created                      | Active items rendered, frozen items in scrollback |
| **Screen mode** | Fullscreen or inline                        | Fullscreen                                      | Inline only                                       |
| **Height**      | Set on Box                                  | `height` prop                                   | Auto-sized                                        |
| **Keyboard**    | Manual (`useInput`)                         | Built-in (`interactive`) or manual (`scrollTo`) | Manual                                            |
| **Use case**    | General scrolling                           | Large data sets, file lists, logs               | Task runners, REPLs, chat, CI output              |

## Comparison with Ink

**Ink**: Manual virtualization with height estimation

```tsx
// Complex setup required
<ScrollableList
  items={items}
  height={availableHeight}
  estimateHeight={(item) => calculateHeight(item, width)}
  renderItem={(item) => <Card item={item} />}
/>
```

**Silvery**: Just render everything

```tsx
// It just works
<Box overflow="scroll" scrollTo={selectedIdx}>
  {items.map((item) => (
    <Card key={item.id} item={item} />
  ))}
</Box>
```
