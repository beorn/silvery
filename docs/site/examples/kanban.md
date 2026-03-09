---
prev:
  text: Task List
  link: /examples/task-list
next:
  text: AI Assistants
  link: /examples/ai-assistants
---

<script setup>
import LiveDemo from '../.vitepress/components/LiveDemo.vue'
</script>

# Kanban Board Example

A multi-column kanban board with independent scroll regions.

[[toc]]

## Live Demo

<LiveDemo xtermSrc="/examples/showcase.html?demo=kanban" :height="500" />

## What It Demonstrates

- **Multiple scroll regions** - Each column scrolls independently
- **Column-based layouts** with proportional `flexGrow`
- **Cross-column navigation** with arrow keys
- **Moving items between columns**
- **State management** for cursor position

## Running the Example

```bash
cd silvery
bun run examples/kanban/app.tsx
```

## Full Source Code

::: code-group

```tsx [app.tsx]
import { Box, Text, render, useContentRect, useInput, useApp, createTerm } from "@silvery/term"
import { useState } from "react"

interface Card {
  id: string
  title: string
  tags?: string[]
}

interface Column {
  id: string
  name: string
  cards: Card[]
}

const initialColumns: Column[] = [
  {
    id: "todo",
    name: "To Do",
    cards: [
      { id: "1", title: "Research competitors", tags: ["research"] },
      { id: "2", title: "Design system audit", tags: ["design"] },
      { id: "3", title: "Write API documentation", tags: ["docs"] },
      { id: "4", title: "Performance benchmarks", tags: ["dev"] },
      { id: "5", title: "User interviews", tags: ["research"] },
    ],
  },
  {
    id: "doing",
    name: "In Progress",
    cards: [
      { id: "6", title: "Implement useContentRect hook", tags: ["dev"] },
      { id: "7", title: "Scrolling component", tags: ["dev"] },
      { id: "8", title: "Write migration guide", tags: ["docs"] },
    ],
  },
  {
    id: "done",
    name: "Done",
    cards: [
      { id: "9", title: "Initial project setup" },
      { id: "10", title: "Yoga integration" },
      { id: "11", title: "React reconciler" },
      { id: "12", title: "Basic Box component" },
      { id: "13", title: "Text component" },
      { id: "14", title: "useInput hook" },
      { id: "15", title: "Border rendering" },
      { id: "16", title: "Flexbox layout" },
    ],
  },
]

interface CursorPosition {
  columnIndex: number
  cardIndex: number
}

function App() {
  const { exit } = useApp()
  const [columns, setColumns] = useState(initialColumns)
  const [cursor, setCursor] = useState<CursorPosition>({
    columnIndex: 0,
    cardIndex: 0,
  })

  useInput((input, key) => {
    if (input === "q" || key.escape) {
      exit()
    }

    const currentColumn = columns[cursor.columnIndex]
    const maxCardIndex = Math.max(0, currentColumn.cards.length - 1)

    // Vertical navigation (j/k or arrows)
    if (input === "j" || key.downArrow) {
      setCursor((c) => ({
        ...c,
        cardIndex: Math.min(c.cardIndex + 1, maxCardIndex),
      }))
    }

    if (input === "k" || key.upArrow) {
      setCursor((c) => ({
        ...c,
        cardIndex: Math.max(c.cardIndex - 1, 0),
      }))
    }

    // Horizontal navigation (h/l or arrows)
    if (input === "l" || key.rightArrow) {
      setCursor((c) => {
        const newColIndex = Math.min(c.columnIndex + 1, columns.length - 1)
        const newColCards = columns[newColIndex].cards.length
        return {
          columnIndex: newColIndex,
          cardIndex: Math.min(c.cardIndex, Math.max(0, newColCards - 1)),
        }
      })
    }

    if (input === "h" || key.leftArrow) {
      setCursor((c) => {
        const newColIndex = Math.max(c.columnIndex - 1, 0)
        const newColCards = columns[newColIndex].cards.length
        return {
          columnIndex: newColIndex,
          cardIndex: Math.min(c.cardIndex, Math.max(0, newColCards - 1)),
        }
      })
    }

    // Move card to next column
    if (input === "m" || key.return) {
      moveCardRight()
    }

    // Move card to previous column
    if (input === "M") {
      moveCardLeft()
    }
  })

  function moveCardRight() {
    if (cursor.columnIndex >= columns.length - 1) return

    const sourceCol = columns[cursor.columnIndex]
    if (sourceCol.cards.length === 0) return

    const card = sourceCol.cards[cursor.cardIndex]
    const targetColIndex = cursor.columnIndex + 1

    setColumns((cols) =>
      cols.map((col, i) => {
        if (i === cursor.columnIndex) {
          return { ...col, cards: col.cards.filter((c) => c.id !== card.id) }
        }
        if (i === targetColIndex) {
          return { ...col, cards: [...col.cards, card] }
        }
        return col
      }),
    )

    // Adjust cursor if we removed the last card
    setCursor((c) => ({
      ...c,
      cardIndex: Math.min(c.cardIndex, Math.max(0, sourceCol.cards.length - 2)),
    }))
  }

  function moveCardLeft() {
    if (cursor.columnIndex <= 0) return

    const sourceCol = columns[cursor.columnIndex]
    if (sourceCol.cards.length === 0) return

    const card = sourceCol.cards[cursor.cardIndex]
    const targetColIndex = cursor.columnIndex - 1

    setColumns((cols) =>
      cols.map((col, i) => {
        if (i === cursor.columnIndex) {
          return { ...col, cards: col.cards.filter((c) => c.id !== card.id) }
        }
        if (i === targetColIndex) {
          return { ...col, cards: [...col.cards, card] }
        }
        return col
      }),
    )

    setCursor((c) => ({
      ...c,
      cardIndex: Math.min(c.cardIndex, Math.max(0, sourceCol.cards.length - 2)),
    }))
  }

  return (
    <Box flexDirection="column" width="100%" height="100%">
      <Board columns={columns} cursor={cursor} />
      <HelpBar />
    </Box>
  )
}

function Board({ columns, cursor }: { columns: Column[]; cursor: CursorPosition }) {
  return (
    <Box flexDirection="row" flexGrow={1}>
      {columns.map((column, colIndex) => (
        <KanbanColumn
          key={column.id}
          column={column}
          isSelected={colIndex === cursor.columnIndex}
          selectedCardIndex={colIndex === cursor.columnIndex ? cursor.cardIndex : -1}
        />
      ))}
    </Box>
  )
}

function KanbanColumn({
  column,
  isSelected,
  selectedCardIndex,
}: {
  column: Column
  isSelected: boolean
  selectedCardIndex: number
}) {
  return (
    <Box flexDirection="column" flexGrow={1} borderStyle="single" borderColor={isSelected ? "cyan" : undefined}>
      <ColumnHeader name={column.name} count={column.cards.length} isSelected={isSelected} />
      <CardList cards={column.cards} selectedIndex={selectedCardIndex} />
    </Box>
  )
}

function ColumnHeader({ name, count, isSelected }: { name: string; count: number; isSelected: boolean }) {
  const { width } = useContentRect()

  // Truncate name if needed
  const countStr = ` (${count})`
  const maxNameWidth = Math.max(0, width - countStr.length)
  const truncatedName = name.length > maxNameWidth ? name.slice(0, maxNameWidth - 1) + "..." : name

  return (
    <Box paddingX={1} marginBottom={1}>
      <Text bold color={isSelected ? "cyan" : undefined}>
        {truncatedName}
      </Text>
      <Text dimColor>{countStr}</Text>
    </Box>
  )
}

function CardList({ cards, selectedIndex }: { cards: Card[]; selectedIndex: number }) {
  if (cards.length === 0) {
    return (
      <Box paddingX={1}>
        <Text dimColor italic>
          No cards
        </Text>
      </Box>
    )
  }

  return (
    <Box
      flexDirection="column"
      flexGrow={1}
      overflow="scroll"
      scrollTo={selectedIndex >= 0 ? selectedIndex : undefined}
      paddingX={1}
    >
      {cards.map((card, i) => (
        <CardRow key={card.id} card={card} isSelected={i === selectedIndex} />
      ))}
    </Box>
  )
}

function CardRow({ card, isSelected }: { card: Card; isSelected: boolean }) {
  const { width } = useContentRect()

  const prefix = isSelected ? "> " : "  "
  const titleWidth = Math.max(0, width - 2)

  const truncatedTitle = card.title.length > titleWidth ? card.title.slice(0, titleWidth - 1) + "..." : card.title

  return (
    <Box flexDirection="column">
      <Text backgroundColor={isSelected ? "cyan" : undefined} color={isSelected ? "black" : undefined}>
        {prefix}
        {truncatedTitle}
      </Text>
      {card.tags && card.tags.length > 0 && <TagRow tags={card.tags} isSelected={isSelected} />}
    </Box>
  )
}

function TagRow({ tags, isSelected }: { tags: string[]; isSelected: boolean }) {
  return (
    <Text
      dimColor={!isSelected}
      backgroundColor={isSelected ? "cyan" : undefined}
      color={isSelected ? "black" : undefined}
    >
      {"  "}
      {tags.map((tag) => `[${tag}]`).join(" ")}
    </Text>
  )
}

function HelpBar() {
  return (
    <Box paddingX={1} marginTop={1}>
      <Text dimColor>h/l or arrows: switch column | j/k or arrows: navigate | m/M: move card | q: quit</Text>
    </Box>
  )
}

using term = createTerm()
await render(<App />, term)
```

:::

## Code Walkthrough

### Independent Scroll Regions

Each column has its own scroll container:

```tsx
function CardList({ cards, selectedIndex }: { cards: Card[]; selectedIndex: number }) {
  return (
    <Box
      flexDirection="column"
      flexGrow={1}
      overflow="scroll"
      scrollTo={selectedIndex >= 0 ? selectedIndex : undefined}
      paddingX={1}
    >
      {cards.map((card, i) => (
        <CardRow key={card.id} card={card} isSelected={i === selectedIndex} />
      ))}
    </Box>
  )
}
```

Each column scrolls independently based on its own `selectedIndex`.

### Column Layout

Columns use `flexGrow={1}` to share space equally:

```tsx
function Board({ columns, cursor }: { columns: Column[]; cursor: CursorPosition }) {
  return (
    <Box flexDirection="row" flexGrow={1}>
      {columns.map((column, colIndex) => (
        <KanbanColumn
          key={column.id}
          column={column}
          flexGrow={1} // Each column gets equal width
          // ...
        />
      ))}
    </Box>
  )
}
```

### Cursor State

The cursor tracks both column and card position:

```tsx
interface CursorPosition {
  columnIndex: number
  cardIndex: number
}

const [cursor, setCursor] = useState<CursorPosition>({
  columnIndex: 0,
  cardIndex: 0,
})
```

### Two-Axis Navigation

Horizontal navigation moves between columns, vertical within a column:

```tsx
// Horizontal: h/l or left/right arrows
if (input === "l" || key.rightArrow) {
  setCursor((c) => {
    const newColIndex = Math.min(c.columnIndex + 1, columns.length - 1)
    const newColCards = columns[newColIndex].cards.length
    return {
      columnIndex: newColIndex,
      // Clamp card index to new column's bounds
      cardIndex: Math.min(c.cardIndex, Math.max(0, newColCards - 1)),
    }
  })
}

// Vertical: j/k or up/down arrows
if (input === "j" || key.downArrow) {
  setCursor((c) => ({
    ...c,
    cardIndex: Math.min(c.cardIndex + 1, maxCardIndex),
  }))
}
```

### Moving Cards

Cards move between columns while maintaining cursor validity:

```tsx
function moveCardRight() {
  if (cursor.columnIndex >= columns.length - 1) return

  const sourceCol = columns[cursor.columnIndex]
  if (sourceCol.cards.length === 0) return

  const card = sourceCol.cards[cursor.cardIndex]
  const targetColIndex = cursor.columnIndex + 1

  setColumns((cols) =>
    cols.map((col, i) => {
      if (i === cursor.columnIndex) {
        // Remove from source
        return { ...col, cards: col.cards.filter((c) => c.id !== card.id) }
      }
      if (i === targetColIndex) {
        // Add to target
        return { ...col, cards: [...col.cards, card] }
      }
      return col
    }),
  )

  // Adjust cursor if we removed the last card
  setCursor((c) => ({
    ...c,
    cardIndex: Math.min(c.cardIndex, Math.max(0, sourceCol.cards.length - 2)),
  }))
}
```

### Visual Focus Indicators

The selected column has a colored border:

```tsx
<Box
  borderStyle="single"
  borderColor={isSelected ? "cyan" : undefined}
>
```

The selected card has inverted colors:

```tsx
<Text
  backgroundColor={isSelected ? "cyan" : undefined}
  color={isSelected ? "black" : undefined}
>
```

## Key silvery Features Used

| Feature             | Usage                                    |
| ------------------- | ---------------------------------------- |
| `overflow="scroll"` | Each column scrolls independently        |
| `scrollTo={index}`  | Keep selected card visible in its column |
| `flexGrow={1}`      | Equal-width columns                      |
| `useContentRect()`  | Text truncation in cards and headers     |
| `useInput()`        | Two-axis keyboard navigation             |
| Variable heights    | Cards with tags are taller               |

### Why silvery for Kanban Boards

- **Focus system** -- Tree-based spatial navigation lets users press Left/Right to move between columns and Up/Down within them. Mark any `Box` as `focusable`, add `autoFocus` to the default card, and silvery handles Tab cycling and `useFocusWithin` for column-level focus indicators.

- **Mouse support** -- SGR mouse protocol gives you `onClick` and `onDoubleClick` props on card components, `onWheel` for per-column scrolling, and automatic click-to-focus so users can click a card in any column to jump directly to it.

- **Command system** -- `withCommands` assigns every board action (move card, create card, archive, filter) an ID with configurable keybindings. `withKeybindings` resolves keypresses to commands. You get a searchable command palette and AI-accessible action introspection for free.

## Architecture Notes

### State Shape

The state is designed for easy updates:

```tsx
// Columns array - each column owns its cards
const [columns, setColumns] = useState<Column[]>(initialColumns)

// Cursor is separate - just indices
const [cursor, setCursor] = useState<CursorPosition>({
  columnIndex: 0,
  cardIndex: 0,
})
```

This makes moving cards a simple filter/concat operation.

### Scroll Independence

Each `CardList` component has its own `overflow="scroll"`. silvery handles multiple scroll regions on the same screen automatically - no coordination needed.

### Empty State

Empty columns show a placeholder instead of an empty scroll container:

```tsx
if (cards.length === 0) {
  return (
    <Box paddingX={1}>
      <Text dimColor italic>
        No cards
      </Text>
    </Box>
  )
}
```

## Exercises

1. **Add card creation** - Press `a` to add a card to current column
2. **Add card editing** - Press `e` to edit the selected card's title
3. **Add drag preview** - Show where the card will go when moving
4. **Add search/filter** - Press `/` to filter cards by title or tag
5. **Add persistence** - Save board state to a JSON file
6. **Add swimlanes** - Group cards by tag within columns
