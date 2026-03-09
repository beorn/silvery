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

**No height estimation needed.** Silvery uses Yoga to measure each item's actual height.

## How It Works

Silvery uses a **measure-then-render** approach:

```
1. React creates all child elements
2. Yoga measures all children (fast - ~1ms for 500 items)
3. Calculate scroll position from scrollTo prop
4. Render content ONLY for visible children
5. Paint visible content to terminal
```

**Key insight**: Yoga layout is extremely fast. The expensive part is building terminal strings. Silvery skips that for non-visible items.

### Performance

| List Size  | Yoga Layout | Content Render    | Total |
| ---------- | ----------- | ----------------- | ----- |
| 100 items  | <1ms        | ~1ms (20 visible) | ~2ms  |
| 500 items  | ~1ms        | ~1ms (20 visible) | ~2ms  |
| 1000 items | ~2ms        | ~1ms (20 visible) | ~3ms  |

## overflow="hidden"

Use `overflow="hidden"` to clip without scroll indicators:

```tsx
<Box overflow="hidden" height={5}>
  <Text>This content will be clipped if too tall</Text>
</Box>
```

## When NOT to Use Scrolling

For truly massive lists (10,000+ items), even Yoga layout becomes noticeable. At that scale:

- **Paginate** instead of scrolling
- **Filter/search** to reduce the list
- This is a **UX problem**, not a rendering problem

If users can't reasonably navigate 10,000 items, scrolling isn't the answer.

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
