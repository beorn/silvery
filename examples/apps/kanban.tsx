/**
 * Kanban Board Example
 *
 * A 3-column kanban board demonstrating:
 * - Todo, In Progress, Done columns
 * - Move items between columns with arrow keys
 * - Each column uses native overflow="scroll" for scrolling
 * - Flexbox layout for proportional sizing
 */

import React, { useState } from "react"
import { render, Box, Text, Muted, useInput, useApp, createTerm, type Key } from "../../src/index.js"
import { ExampleBanner, type ExampleMeta } from "../_banner.js"

export const meta: ExampleMeta = {
  name: "Kanban Board",
  description: "3-column kanban with card movement and independent scroll",
  demo: true,
  features: ["Box flexDirection", "useInput", "backgroundColor", "multi-column layout"],
}

// ============================================================================
// Types
// ============================================================================

type ColumnId = "todo" | "inProgress" | "done"

interface Card {
  id: number
  title: string
  tags: string[]
  priority?: "high" | "medium" | "low"
  assignee?: string
}

interface Column {
  id: ColumnId
  title: string
  cards: Card[]
}

// ============================================================================
// Initial Data
// ============================================================================

const initialColumns: Column[] = [
  {
    id: "todo",
    title: "To Do",
    cards: [
      { id: 1, title: "Design landing page", tags: ["design"], priority: "high", assignee: "Alice" },
      { id: 2, title: "Write API docs", tags: ["docs"], priority: "medium" },
      { id: 3, title: "Monitoring alerts", tags: ["devops"], priority: "high", assignee: "Carlos" },
      { id: 4, title: "Onboarding flow", tags: ["ux"], priority: "medium", assignee: "Alice" },
      { id: 5, title: "DB optimization", tags: ["backend"], priority: "low" },
      { id: 6, title: "Mobile fixes", tags: ["frontend"], priority: "medium", assignee: "Bob" },
    ],
  },
  {
    id: "inProgress",
    title: "In Progress",
    cards: [
      { id: 9, title: "OAuth login", tags: ["security"], priority: "high", assignee: "Carlos" },
      { id: 10, title: "Dashboard v2", tags: ["frontend"], priority: "medium", assignee: "Alice" },
      { id: 11, title: "Rate limiting", tags: ["backend"], priority: "high", assignee: "Bob" },
    ],
  },
  {
    id: "done",
    title: "Done",
    cards: [
      { id: 12, title: "Project setup", tags: ["devops"], assignee: "Carlos" },
      { id: 13, title: "CI/CD pipeline", tags: ["devops"], assignee: "Carlos" },
      { id: 14, title: "Wireframes", tags: ["design"], assignee: "Alice" },
      { id: 15, title: "Schema design", tags: ["backend"], assignee: "Bob" },
    ],
  },
]

// ============================================================================
// Components
// ============================================================================

const tagColors: Record<string, string> = {
  frontend: "$info",
  backend: "$accent",
  design: "$warning",
  devops: "$success",
  docs: "$primary",
  ux: "$muted",
  security: "$error",
}

function Tag({ name }: { name: string }) {
  const color = tagColors[name] ?? "$muted"
  return (
    <Text backgroundColor={color} color="$bg" bold>
      {` ${name} `}
    </Text>
  )
}

const priorityIndicators: Record<string, { symbol: string; color: string }> = {
  high: { symbol: "!", color: "$error" },
  medium: { symbol: "-", color: "$warning" },
  low: { symbol: " ", color: "$muted" },
}

function CardComponent({ card, isSelected }: { card: Card; isSelected: boolean }) {
  const pri = card.priority ? priorityIndicators[card.priority] : undefined
  return (
    <Box flexDirection="column">
      <Box>
        {pri && (
          <Text color={pri.color} bold>
            {pri.symbol === " " ? "  " : pri.symbol + " "}
          </Text>
        )}
        {!pri && <Text>{"  "}</Text>}
        {isSelected ? (
          <Text backgroundColor="$primary" color="$primary-fg" bold>
            {card.title}
          </Text>
        ) : (
          <Text>{card.title}</Text>
        )}
      </Box>
      <Box gap={1}>
        <Text>{"  "}</Text>
        {card.tags.map((tag) => (
          <Tag key={tag} name={tag} />
        ))}
        {card.assignee && <Muted>@{card.assignee}</Muted>}
      </Box>
    </Box>
  )
}

const columnIcons: Record<ColumnId, string> = {
  todo: "○",
  inProgress: "◐",
  done: "●",
}

function ColumnComponent({
  column,
  isSelected,
  selectedCardIndex,
}: {
  column: Column
  isSelected: boolean
  selectedCardIndex: number
}) {
  const icon = columnIcons[column.id]
  return (
    <Box flexDirection="column" flexGrow={1} borderStyle="single" borderColor={isSelected ? "$primary" : "$border"}>
      <Box backgroundColor={isSelected ? "$primary" : undefined} paddingX={1}>
        <Text bold color={isSelected ? "$primary-fg" : "$text"}>
          {icon} {column.title}
        </Text>
        <Text color={isSelected ? "$primary-fg" : "$muted"}> ({column.cards.length})</Text>
      </Box>

      <Box flexDirection="column" overflow="scroll" scrollTo={isSelected ? selectedCardIndex : undefined} flexGrow={1}>
        {column.cards.map((card, cardIndex) => (
          <CardComponent key={card.id} card={card} isSelected={isSelected && cardIndex === selectedCardIndex} />
        ))}

        {column.cards.length === 0 && (
          <Text dim italic>
            No cards
          </Text>
        )}
      </Box>
    </Box>
  )
}

export function KanbanBoard() {
  const { exit } = useApp()
  const [columns, setColumns] = useState<Column[]>(initialColumns)
  const [selectedColumn, setSelectedColumn] = useState(0)
  const [selectedCard, setSelectedCard] = useState(0)

  const currentColumn = columns[selectedColumn]
  const currentColumnCards = currentColumn?.cards ?? []
  const boundedSelectedCard = Math.min(selectedCard, Math.max(0, currentColumnCards.length - 1))

  useInput((input: string, key: Key) => {
    if (input === "q" || key.escape) {
      exit()
    }

    // Column navigation
    if (key.leftArrow || input === "h") {
      setSelectedColumn((prev) => Math.max(0, prev - 1))
      setSelectedCard(0)
    }
    if (key.rightArrow || input === "l") {
      setSelectedColumn((prev) => Math.min(columns.length - 1, prev + 1))
      setSelectedCard(0)
    }

    // Card navigation
    if (key.upArrow || input === "k") {
      setSelectedCard((prev) => Math.max(0, prev - 1))
    }
    if (key.downArrow || input === "j") {
      setSelectedCard((prev) => Math.min(currentColumnCards.length - 1, prev + 1))
    }

    // Move card between columns
    if (input === "<" || input === ",") {
      moveCard(-1)
    }
    if (input === ">" || input === ".") {
      moveCard(1)
    }
  })

  function moveCard(direction: number): void {
    const targetColumnIndex = selectedColumn + direction
    if (targetColumnIndex < 0 || targetColumnIndex >= columns.length) return
    if (currentColumnCards.length === 0) return

    const cardToMove = currentColumnCards[boundedSelectedCard]
    if (!cardToMove) return

    setColumns((prev) => {
      const next = prev.map((col) => ({ ...col, cards: [...col.cards] }))
      next[selectedColumn]!.cards.splice(boundedSelectedCard, 1)
      next[targetColumnIndex]!.cards.push(cardToMove)
      return next
    })

    setSelectedColumn(targetColumnIndex)
    setSelectedCard(columns[targetColumnIndex]!.cards.length)
  }

  return (
    <Box flexDirection="column" height="100%">
      <Box flexGrow={1} flexDirection="row" gap={1} overflow="hidden">
        {columns.map((column, colIndex) => (
          <ColumnComponent
            key={column.id}
            column={column}
            isSelected={colIndex === selectedColumn}
            selectedCardIndex={colIndex === selectedColumn ? boundedSelectedCard : -1}
          />
        ))}
      </Box>
    </Box>
  )
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  using term = createTerm()
  const { waitUntilExit } = await render(
    <ExampleBanner meta={meta} controls="h/l column  j/k card  </> move  Esc/q quit">
      <KanbanBoard />
    </ExampleBanner>,
    term,
  )
  await waitUntilExit()
}

if (import.meta.main) {
  main().catch(console.error)
}
