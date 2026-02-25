---
title: Building Kanban Boards with inkx
description: Build terminal kanban boards with multi-column layout, spatial focus navigation, scrollable columns, and mouse support using inkx.
---

<script setup>
import LiveDemo from '../.vitepress/components/LiveDemo.vue'
</script>

# Kanban & Project Boards

Terminal-based kanban boards need multi-column layouts that adapt to the terminal width, independent scrolling per column, two-axis keyboard navigation, and ideally mouse support for quick card selection. inkx provides all of these as built-in primitives, not manual abstractions you wire together yourself.

Other terminal UI frameworks either lack scrollable containers entirely (Ink), require imperative resize callbacks (BubbleTea, Ratatui), or use CSS-like styling that doesn't map naturally to React components (Textual). inkx gives you flexbox layout with `Box`, layout-aware components via `useContentRect()`, and `overflow="scroll"` that just works -- the same mental model as building a web app, but for the terminal.

<LiveDemo xtermSrc="/inkx/examples/showcase.html?demo=kanban" :height="400" />

## Key Benefits

- **Multi-column layout** -- Flexbox `Box` components with `flexGrow={1}` create equal-width columns that automatically redistribute when the terminal resizes. No manual width arithmetic or resize event handlers.

- **Focus system** -- Tree-based spatial navigation lets users press Left/Right to move between columns and Up/Down within them. Mark any `Box` as `focusable`, add `autoFocus` to the default card, and inkx handles Tab cycling and `useFocusWithin` for column-level focus indicators.

- **Scrollable columns** -- Each column gets `overflow="scroll"` with its own `scrollTo` index. inkx measures all children with Yoga, determines which are visible, and only renders content for visible cards. No height estimation or virtualization config.

- **Mouse support** -- SGR mouse protocol gives you `onClick` and `onDoubleClick` props on card components for editing, `onWheel` for per-column scrolling, and automatic click-to-focus so users can click a card in any column to jump directly to it.

- **Command system** -- `withCommands` assigns every board action (move card, create card, archive, filter) an ID with configurable keybindings. `withKeybindings` resolves keypresses to commands. You get a searchable command palette and AI-accessible action introspection for free.

## Code Example

A complete 3-column kanban board with keyboard navigation, card movement between columns, and independent column scrolling:

```tsx
import { Box, Text, useContentRect, useFocusable, useFocusWithin } from "inkx"
import { run, useInput } from "inkx/runtime"
import { useState } from "react"

type Card = { id: string; title: string }
type Column = { id: string; name: string; cards: Card[] }

const columns: Column[] = [
  {
    id: "todo",
    name: "To Do",
    cards: [
      { id: "1", title: "Research competitors" },
      { id: "2", title: "Design system audit" },
      { id: "3", title: "Write API docs" },
      { id: "4", title: "Performance benchmarks" },
    ],
  },
  {
    id: "doing",
    name: "In Progress",
    cards: [
      { id: "5", title: "Implement scroll" },
      { id: "6", title: "Migration guide" },
    ],
  },
  {
    id: "done",
    name: "Done",
    cards: [
      { id: "7", title: "Project setup" },
      { id: "8", title: "React reconciler" },
      { id: "9", title: "Basic components" },
    ],
  },
]

function App() {
  const [board, setBoard] = useState(columns)
  const [col, setCol] = useState(0)
  const [row, setRow] = useState(0)

  useInput((input, key) => {
    if (input === "q") return "exit"
    const maxRow = Math.max(0, board[col].cards.length - 1)
    if (input === "j" || key.downArrow) setRow((r) => Math.min(r + 1, maxRow))
    if (input === "k" || key.upArrow) setRow((r) => Math.max(r - 1, 0))
    if (input === "l" || key.rightArrow) {
      setCol((c) => {
        const next = Math.min(c + 1, board.length - 1)
        setRow((r) => Math.min(r, Math.max(0, board[next].cards.length - 1)))
        return next
      })
    }
    if (input === "h" || key.leftArrow) {
      setCol((c) => {
        const prev = Math.max(c - 1, 0)
        setRow((r) => Math.min(r, Math.max(0, board[prev].cards.length - 1)))
        return prev
      })
    }
    if (input === "m" && col < board.length - 1) {
      const card = board[col].cards[row]
      if (!card) return
      setBoard((b) =>
        b.map((column, i) => {
          if (i === col) return { ...column, cards: column.cards.filter((c) => c.id !== card.id) }
          if (i === col + 1) return { ...column, cards: [...column.cards, card] }
          return column
        }),
      )
      setRow((r) => Math.min(r, Math.max(0, board[col].cards.length - 2)))
    }
  })

  return (
    <Box flexDirection="column" width="100%" height="100%">
      <Box flexDirection="row" flexGrow={1}>
        {board.map((column, ci) => (
          <KanbanColumn key={column.id} column={column} isActive={ci === col} selectedCard={ci === col ? row : -1} />
        ))}
      </Box>
      <Box paddingX={1}>
        <Text dimColor>h/l: columns j/k: cards m: move right q: quit</Text>
      </Box>
    </Box>
  )
}

function KanbanColumn({ column, isActive, selectedCard }: { column: Column; isActive: boolean; selectedCard: number }) {
  return (
    <Box flexDirection="column" flexGrow={1} borderStyle="single" borderColor={isActive ? "cyan" : undefined}>
      <Box paddingX={1}>
        <Text bold color={isActive ? "cyan" : undefined}>
          {column.name}
        </Text>
        <Text dimColor> ({column.cards.length})</Text>
      </Box>
      <Box
        flexDirection="column"
        flexGrow={1}
        overflow="scroll"
        scrollTo={selectedCard >= 0 ? selectedCard : undefined}
        paddingX={1}
      >
        {column.cards.map((card, i) => (
          <Text
            key={card.id}
            backgroundColor={i === selectedCard ? "cyan" : undefined}
            color={i === selectedCard ? "black" : undefined}
          >
            {i === selectedCard ? "> " : "  "}
            {card.title}
          </Text>
        ))}
      </Box>
    </Box>
  )
}

await run(<App />)
```

Run it with `bun app.tsx` or `npx tsx app.tsx`.

## Adding Focus and Mouse Support

The example above uses manual cursor state for simplicity. For a production board, use inkx's focus system to get click-to-focus, Tab navigation, and focus-aware styling for free:

```tsx
function FocusableCard({ card }: { card: Card }) {
  const { focused } = useFocusable()

  return (
    <Box
      testID={card.id}
      focusable
      onClick={() => {
        /* click-to-focus is automatic */
      }}
    >
      <Text inverse={focused}>
        {focused ? "> " : "  "}
        {card.title}
      </Text>
    </Box>
  )
}

function FocusableColumn({ column }: { column: Column }) {
  const hasFocus = useFocusWithin(column.id)

  return (
    <Box
      testID={column.id}
      flexDirection="column"
      flexGrow={1}
      borderStyle="single"
      borderColor={hasFocus ? "cyan" : undefined}
    >
      <Box paddingX={1}>
        <Text bold color={hasFocus ? "cyan" : undefined}>
          {column.name}
        </Text>
      </Box>
      <Box flexDirection="column" flexGrow={1} overflow="scroll" paddingX={1}>
        {column.cards.map((card) => (
          <FocusableCard key={card.id} card={card} />
        ))}
      </Box>
    </Box>
  )
}
```

Enable mouse events by passing `mouse: true` to `run()`:

```tsx
await run(<App />, { mouse: true })
```

Cards respond to `onClick`, `onDoubleClick` (to open a detail view), and columns respond to `onWheel` for trackpad or mouse scrolling -- all with DOM-style event bubbling and `stopPropagation()`.

## What inkx Adds

Building a kanban board in most TUI frameworks means writing your own focus tree, scroll management, and mouse handling. inkx provides all three: a tree-based focus system for spatial navigation between columns, `overflow="scroll"` for independent column scrolling, and DOM-style mouse events (`onClick`, `onWheel`, click-to-focus) for natural card interaction. Together, these save hundreds of lines of infrastructure code.

## Next Steps

- [Getting Started](/guide/getting-started) -- Install inkx and build your first app
- [Kanban Example](/examples/kanban) -- Full source with card tags, drag preview, and architecture notes
- [Focus Hooks](/api/use-focus) -- Tree-based focus system API reference
- [Scrolling Guide](/guide/scrolling) -- Deep dive into `overflow="scroll"` and `scrollTo`
- [Mouse Events](/guide/components#mouse-events) -- SGR protocol, click handlers, and wheel scrolling
