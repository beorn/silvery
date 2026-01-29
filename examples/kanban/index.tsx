/**
 * Kanban Board Example
 *
 * A 3-column kanban board demonstrating:
 * - Todo, In Progress, Done columns
 * - Move items between columns with arrow keys
 * - Each column is independently scrollable
 * - Flexbox layout for proportional sizing
 */

import React, { useState, useMemo } from "react";
import {
  render,
  Box,
  Text,
  useInput,
  useApp,
  createTerm,
  type Key,
} from "../../src/index.js";

// ============================================================================
// Types
// ============================================================================

type ColumnId = "todo" | "inProgress" | "done";

interface Card {
  id: number;
  title: string;
  tags: string[];
}

interface Column {
  id: ColumnId;
  title: string;
  cards: Card[];
}

// ============================================================================
// Initial Data
// ============================================================================

const initialColumns: Column[] = [
  {
    id: "todo",
    title: "To Do",
    cards: [
      { id: 1, title: "Design new landing page", tags: ["design"] },
      { id: 2, title: "Write API documentation", tags: ["docs"] },
      { id: 3, title: "Set up monitoring", tags: ["devops"] },
      { id: 4, title: "Create onboarding flow", tags: ["ux"] },
      { id: 5, title: "Database optimization", tags: ["backend"] },
      { id: 6, title: "Mobile responsive fixes", tags: ["frontend"] },
      { id: 7, title: "Add dark mode", tags: ["frontend", "ux"] },
      { id: 8, title: "Implement caching", tags: ["backend"] },
    ],
  },
  {
    id: "inProgress",
    title: "In Progress",
    cards: [
      { id: 9, title: "User authentication", tags: ["backend", "security"] },
      { id: 10, title: "Dashboard redesign", tags: ["frontend", "design"] },
      { id: 11, title: "API rate limiting", tags: ["backend"] },
    ],
  },
  {
    id: "done",
    title: "Done",
    cards: [
      { id: 12, title: "Project setup", tags: ["devops"] },
      { id: 13, title: "CI/CD pipeline", tags: ["devops"] },
      { id: 14, title: "Initial wireframes", tags: ["design"] },
      { id: 15, title: "Database schema", tags: ["backend"] },
    ],
  },
];

// ============================================================================
// Components
// ============================================================================

const tagColors: Record<string, string> = {
  frontend: "cyan",
  backend: "magenta",
  design: "yellow",
  devops: "green",
  docs: "blue",
  ux: "white",
  security: "red",
};

function Tag({ name }: { name: string }): JSX.Element {
  const color = tagColors[name] ?? "gray";
  return (
    <Text color={color} dim>
      #{name}
    </Text>
  );
}

function CardComponent({
  card,
  isSelected,
}: {
  card: Card;
  isSelected: boolean;
}): JSX.Element {
  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={isSelected ? "cyan" : "gray"}
      paddingX={1}
      marginBottom={1}
    >
      {isSelected ? (
        <Text backgroundColor="cyan" color="black" bold>
          {card.title}
        </Text>
      ) : (
        <Text>{card.title}</Text>
      )}
      <Box gap={1}>
        {card.tags.map((tag) => (
          <Tag key={tag} name={tag} />
        ))}
      </Box>
    </Box>
  );
}

function ColumnComponent({
  column,
  isSelected,
  selectedCardIndex,
  scrollOffset,
  visibleCount,
}: {
  column: Column;
  isSelected: boolean;
  selectedCardIndex: number;
  scrollOffset: number;
  visibleCount: number;
}): JSX.Element {
  const visibleCards = column.cards.slice(
    scrollOffset,
    scrollOffset + visibleCount,
  );
  const hasMoreAbove = scrollOffset > 0;
  const hasMoreBelow = scrollOffset + visibleCount < column.cards.length;

  return (
    <Box
      flexDirection="column"
      flexGrow={1}
      borderStyle="single"
      borderColor={isSelected ? "cyan" : "gray"}
    >
      <Box backgroundColor={isSelected ? "cyan" : undefined} paddingX={1}>
        <Text bold color={isSelected ? "black" : "white"}>
          {column.title}
        </Text>
        <Text color={isSelected ? "black" : "gray"}>
          {" "}
          ({column.cards.length})
        </Text>
      </Box>

      <Box
        flexDirection="column"
        paddingX={1}
        paddingY={1}
        overflow="hidden"
        flexGrow={1}
      >
        {hasMoreAbove && (
          <Text dim color="cyan">
            {" "}
            ... {scrollOffset} more above
          </Text>
        )}

        {visibleCards.map((card, visibleIndex) => {
          const actualIndex = scrollOffset + visibleIndex;
          return (
            <CardComponent
              key={card.id}
              card={card}
              isSelected={isSelected && actualIndex === selectedCardIndex}
            />
          );
        })}

        {column.cards.length === 0 && (
          <Text dim italic>
            No cards
          </Text>
        )}

        {hasMoreBelow && (
          <Text dim color="cyan">
            {" "}
            ... {column.cards.length - scrollOffset - visibleCount} more below
          </Text>
        )}
      </Box>
    </Box>
  );
}

function HelpBar(): JSX.Element {
  return (
    <Box paddingX={1} gap={2}>
      <Text dim>
        <Text bold>h/l</Text> switch column
      </Text>
      <Text dim>
        <Text bold>j/k</Text> select card
      </Text>
      <Text dim>
        <Text bold>{"</>>"}</Text> move card
      </Text>
      <Text dim>
        <Text bold>q</Text> quit
      </Text>
    </Box>
  );
}

function KanbanBoard(): JSX.Element {
  const { exit } = useApp();
  const [columns, setColumns] = useState<Column[]>(initialColumns);
  const [selectedColumn, setSelectedColumn] = useState(0);
  const [selectedCard, setSelectedCard] = useState(0);
  const [scrollOffsets, setScrollOffsets] = useState<number[]>([0, 0, 0]);

  // Fixed visible cards per column (in a real app, this would use useLayout)
  const visibleCardsPerColumn = 5;

  // Current column data
  const currentColumn = columns[selectedColumn];
  const currentColumnCards = currentColumn?.cards ?? [];

  // Ensure selected card is within bounds
  const boundedSelectedCard = Math.min(
    selectedCard,
    Math.max(0, currentColumnCards.length - 1),
  );

  // Update scroll offset to keep selected card visible
  useMemo(() => {
    if (currentColumnCards.length === 0) return;

    const currentOffset = scrollOffsets[selectedColumn] ?? 0;
    let newOffset = currentOffset;

    // If selected card is above visible area, scroll up
    if (boundedSelectedCard < currentOffset) {
      newOffset = boundedSelectedCard;
    }
    // If selected card is below visible area, scroll down
    else if (boundedSelectedCard >= currentOffset + visibleCardsPerColumn) {
      newOffset = boundedSelectedCard - visibleCardsPerColumn + 1;
    }

    if (newOffset !== currentOffset) {
      setScrollOffsets((prev) => {
        const next = [...prev];
        next[selectedColumn] = newOffset;
        return next;
      });
    }
  }, [
    boundedSelectedCard,
    selectedColumn,
    visibleCardsPerColumn,
    scrollOffsets,
    currentColumnCards.length,
  ]);

  useInput((input: string, key: Key) => {
    if (input === "q" || key.escape) {
      exit();
    }

    // Column navigation
    if (key.leftArrow || input === "h") {
      setSelectedColumn((prev) => Math.max(0, prev - 1));
      setSelectedCard(0);
    }
    if (key.rightArrow || input === "l") {
      setSelectedColumn((prev) => Math.min(columns.length - 1, prev + 1));
      setSelectedCard(0);
    }

    // Card navigation
    if (key.upArrow || input === "k") {
      setSelectedCard((prev) => Math.max(0, prev - 1));
    }
    if (key.downArrow || input === "j") {
      setSelectedCard((prev) =>
        Math.min(currentColumnCards.length - 1, prev + 1),
      );
    }

    // Move card between columns
    if (input === "<" || input === ",") {
      moveCard(-1);
    }
    if (input === ">" || input === ".") {
      moveCard(1);
    }
  });

  function moveCard(direction: number): void {
    const targetColumnIndex = selectedColumn + direction;
    if (targetColumnIndex < 0 || targetColumnIndex >= columns.length) return;
    if (currentColumnCards.length === 0) return;

    const cardToMove = currentColumnCards[boundedSelectedCard];
    if (!cardToMove) return;

    setColumns((prev) => {
      const next = prev.map((col) => ({ ...col, cards: [...col.cards] }));

      // Remove from current column
      next[selectedColumn]!.cards.splice(boundedSelectedCard, 1);

      // Add to target column
      next[targetColumnIndex]!.cards.push(cardToMove);

      return next;
    });

    // Move focus to target column and select the moved card
    setSelectedColumn(targetColumnIndex);
    setSelectedCard(columns[targetColumnIndex]!.cards.length); // Will be at end
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="yellow">
          Kanban Board
        </Text>
      </Box>

      <Box flexDirection="row" gap={1} height={20} overflow="hidden">
        {columns.map((column, colIndex) => (
          <ColumnComponent
            key={column.id}
            column={column}
            isSelected={colIndex === selectedColumn}
            selectedCardIndex={
              colIndex === selectedColumn ? boundedSelectedCard : -1
            }
            scrollOffset={scrollOffsets[colIndex] ?? 0}
            visibleCount={visibleCardsPerColumn}
          />
        ))}
      </Box>

      <HelpBar />
    </Box>
  );
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  using term = createTerm();
  const { waitUntilExit } = await render(<KanbanBoard />, term);
  await waitUntilExit();
}

main().catch(console.error);
