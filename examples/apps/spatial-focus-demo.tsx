/**
 * Spatial Focus Navigation Demo — Kanban Board
 *
 * A kanban board where arrow keys spatially navigate between cards across columns.
 * Uses React state for focus tracking with spatial nearest-neighbor lookup.
 *
 * Cards have varied heights to prove spatial navigation handles non-uniform layouts.
 * Focus is shown via yellow border and bold title on the focused card.
 *
 * Run: bun examples/apps/spatial-focus-demo.tsx
 */

import React, { useState, useMemo } from "react"
import { Box, Text } from "silvery"
import { run, useInput, type Key } from "silvery/runtime"

// ============================================================================
// Data
// ============================================================================

interface CardData {
  id: string
  title: string
  description?: string
  tags: string[]
  priority?: "low" | "medium" | "high"
}

interface ColumnData {
  id: string
  title: string
  cards: CardData[]
}

const columns: ColumnData[] = [
  {
    id: "backlog",
    title: "Backlog",
    cards: [
      { id: "b1", title: "Design system audit", tags: ["design"], priority: "low" },
      {
        id: "b2",
        title: "Refactor auth module",
        description:
          "Move from JWT to session-based auth.\nUpdate all middleware.\nAdd refresh token rotation.",
        tags: ["backend", "security"],
        priority: "high",
      },
      { id: "b3", title: "Add dark mode", tags: ["frontend"] },
      {
        id: "b4",
        title: "Database migration tool",
        description: "Schema versioning with rollback support.",
        tags: ["backend", "devops"],
        priority: "medium",
      },
      { id: "b5", title: "Update dependencies", tags: ["maintenance"] },
    ],
  },
  {
    id: "todo",
    title: "To Do",
    cards: [
      {
        id: "t1",
        title: "User dashboard",
        description: "Activity feed, stats overview,\nrecent projects, and quick actions.",
        tags: ["frontend", "ux"],
        priority: "high",
      },
      { id: "t2", title: "API rate limiting", tags: ["backend"], priority: "medium" },
      {
        id: "t3",
        title: "E2E test suite",
        description:
          "Cover critical user flows:\n- Login/signup\n- Project CRUD\n- Team management\n- Billing",
        tags: ["testing"],
        priority: "high",
      },
      { id: "t4", title: "Webhook support", tags: ["backend", "api"] },
    ],
  },
  {
    id: "progress",
    title: "In Progress",
    cards: [
      {
        id: "p1",
        title: "Search feature",
        description: "Full-text search with filters.",
        tags: ["frontend", "backend"],
        priority: "high",
      },
      { id: "p2", title: "Fix memory leak", tags: ["bug"], priority: "high" },
      {
        id: "p3",
        title: "CI/CD pipeline",
        description:
          "GitHub Actions workflow:\n- Lint + typecheck\n- Unit tests\n- E2E tests\n- Deploy to staging",
        tags: ["devops"],
        priority: "medium",
      },
    ],
  },
  {
    id: "done",
    title: "Done",
    cards: [
      { id: "d1", title: "Project setup", tags: ["devops"] },
      {
        id: "d2",
        title: "Auth system",
        description: "Login, signup, password reset,\nOAuth providers.",
        tags: ["backend", "security"],
      },
      { id: "d3", title: "Landing page", tags: ["frontend", "design"] },
    ],
  },
]

// ============================================================================
// Spatial navigation — find nearest card in direction
// ============================================================================

interface CardPosition {
  id: string
  colIndex: number
  cardIndex: number
}

function buildIndex(): Map<string, CardPosition> {
  const index = new Map<string, CardPosition>()
  for (let ci = 0; ci < columns.length; ci++) {
    for (let ri = 0; ri < columns[ci]!.cards.length; ri++) {
      const card = columns[ci]!.cards[ri]!
      index.set(card.id, { id: card.id, colIndex: ci, cardIndex: ri })
    }
  }
  return index
}

function navigate(
  currentId: string,
  direction: "up" | "down" | "left" | "right",
  index: Map<string, CardPosition>,
): string {
  const pos = index.get(currentId)
  if (!pos) return currentId

  switch (direction) {
    case "up": {
      if (pos.cardIndex > 0) {
        return columns[pos.colIndex]!.cards[pos.cardIndex - 1]!.id
      }
      return currentId
    }
    case "down": {
      const col = columns[pos.colIndex]!
      if (pos.cardIndex < col.cards.length - 1) {
        return col.cards[pos.cardIndex + 1]!.id
      }
      return currentId
    }
    case "left": {
      if (pos.colIndex > 0) {
        const targetCol = columns[pos.colIndex - 1]!
        const targetIdx = Math.min(pos.cardIndex, targetCol.cards.length - 1)
        return targetCol.cards[targetIdx]!.id
      }
      return currentId
    }
    case "right": {
      if (pos.colIndex < columns.length - 1) {
        const targetCol = columns[pos.colIndex + 1]!
        const targetIdx = Math.min(pos.cardIndex, targetCol.cards.length - 1)
        return targetCol.cards[targetIdx]!.id
      }
      return currentId
    }
  }
}

// ============================================================================
// Tag colors
// ============================================================================

const tagColors: Record<string, string> = {
  frontend: "$info",
  backend: "$accent",
  design: "$warning",
  devops: "$success",
  testing: "$primary",
  ux: "$muted",
  security: "$error",
  bug: "$error",
  api: "$primary",
  maintenance: "$muted",
}

const prioritySymbols: Record<string, { symbol: string; color: string }> = {
  high: { symbol: "▲", color: "$error" },
  medium: { symbol: "◆", color: "$warning" },
  low: { symbol: "▽", color: "$muted" },
}

// ============================================================================
// Components
// ============================================================================

function Tag({ name }: { name: string }) {
  const color = tagColors[name] ?? "$muted"
  return (
    <Text color={color} dim>
      #{name}
    </Text>
  )
}

function CardView({ card, focused }: { card: CardData; focused: boolean }) {
  const priority = card.priority ? prioritySymbols[card.priority] : null

  return (
    <Box
      testID={card.id}
      flexDirection="column"
      borderStyle="round"
      borderColor={focused ? "$warning" : "$border"}
    >
      <Box paddingX={1} gap={1}>
        {priority && <Text color={priority.color}>{priority.symbol}</Text>}
        <Text bold={focused} color={focused ? "$warning" : undefined} wrap="truncate">
          {card.title}
        </Text>
      </Box>
      {card.description && (
        <Box paddingX={1}>
          <Text color="$muted" dim wrap="truncate">
            {card.description}
          </Text>
        </Box>
      )}
      <Box gap={1} paddingX={1}>
        {card.tags.map((tag) => (
          <Tag key={tag} name={tag} />
        ))}
      </Box>
    </Box>
  )
}

function ColumnView({
  column,
  focusedCardId,
}: {
  column: ColumnData
  focusedCardId: string | null
}) {
  const hasFocus = column.cards.some((c) => c.id === focusedCardId)

  return (
    <Box
      flexDirection="column"
      flexGrow={1}
      flexBasis={0}
      borderStyle="single"
      borderColor={hasFocus ? "$warning" : "$border"}
    >
      <Box backgroundColor={hasFocus ? "$warning" : undefined} paddingX={1}>
        <Text bold color={hasFocus ? "$warning-fg" : undefined}>
          {column.title}
        </Text>
        <Text color={hasFocus ? "$warning-fg" : "$muted"}> ({column.cards.length})</Text>
      </Box>
      <Box flexDirection="column" paddingX={1} flexGrow={1}>
        {column.cards.map((card) => (
          <CardView key={card.id} card={card} focused={card.id === focusedCardId} />
        ))}
      </Box>
    </Box>
  )
}

function StatusBar({ focusedId }: { focusedId: string | null }) {
  let focusedColumn: string | null = null
  let focusedCard: CardData | null = null
  for (const col of columns) {
    const card = col.cards.find((c) => c.id === focusedId)
    if (card) {
      focusedColumn = col.title
      focusedCard = card
      break
    }
  }

  return (
    <Box paddingX={1} gap={2}>
      <Text color="$muted" dim>
        ←↑↓→/hjkl navigate
      </Text>
      <Text color="$muted" dim>
        q quit
      </Text>
      {focusedCard && (
        <>
          <Text color="$border">│</Text>
          <Text color="$warning">{focusedColumn}</Text>
          <Text color="$muted">→</Text>
          <Text>{focusedCard.title}</Text>
        </>
      )}
    </Box>
  )
}

function SpatialFocusBoard() {
  const [focusedId, setFocusedId] = useState<string>("b1")
  const index = useMemo(() => buildIndex(), [])

  useInput((input: string, key: Key) => {
    if (input === "q") return "exit"

    // Use arrow keys OR hjkl — but not both for the same direction.
    // Arrow keys take priority (key.upArrow etc. are set by the parser).
    const hasArrow = key.upArrow || key.downArrow || key.leftArrow || key.rightArrow
    const dir = key.upArrow
      ? "up"
      : key.downArrow
        ? "down"
        : key.leftArrow
          ? "left"
          : key.rightArrow
            ? "right"
            : !hasArrow && input === "k"
              ? "up"
              : !hasArrow && input === "j"
                ? "down"
                : !hasArrow && input === "h"
                  ? "left"
                  : !hasArrow && input === "l"
                    ? "right"
                    : null

    if (dir) {
      setFocusedId((id) => navigate(id, dir, index))
    }
  })

  return (
    <Box flexDirection="column" padding={1} height="100%">
      <Box marginBottom={1} paddingX={1} gap={1}>
        <Text bold color="$warning">
          Spatial Focus
        </Text>
        <Text color="$muted">— arrow keys / hjkl navigate between cards across columns</Text>
      </Box>

      <Box flexGrow={1} flexDirection="row" gap={1} overflow="hidden">
        {columns.map((column) => (
          <ColumnView key={column.id} column={column} focusedCardId={focusedId} />
        ))}
      </Box>

      <StatusBar focusedId={focusedId} />
    </Box>
  )
}

// ============================================================================
// Main
// ============================================================================

export const meta = {
  name: "Spatial Focus",
  description:
    "Kanban board with spatial navigation — arrow keys / hjkl move between cards across columns",
  demo: true,
  features: ["spatial navigation", "kanban layout", "varied card heights", "column focus tracking"],
}

export async function main() {
  using handle = await run(<SpatialFocusBoard />, { mode: "fullscreen" })
  await handle.waitUntilExit()
}
