/**
 * KanbanShowcase — polished kanban board
 *
 * Three-column kanban with selectable cards, tag badges, and mouse support.
 */

import React, { useState } from "react"
import { Box, Text, useContentRect, useInput } from "@silvery/term/xterm/index.ts"
import { useMouseClick, KeyHints } from "./shared.js"

// --- Types ---

interface KanbanCard {
  title: string
  tag: { name: string; color: string; bg: string }
}

interface KanbanColumn {
  title: string
  headerBg: string
  headerColor: string
  cards: KanbanCard[]
}

// --- Data ---

const KANBAN_DATA: KanbanColumn[] = [
  {
    title: "Todo",
    headerBg: "#302030",
    headerColor: "#f38ba8",
    cards: [
      { title: "Design landing page", tag: { name: "design", color: "#f9e2af", bg: "#303020" } },
      { title: "Write API docs", tag: { name: "docs", color: "#89b4fa", bg: "#1e2030" } },
      { title: "Set up monitoring", tag: { name: "devops", color: "#a6e3a1", bg: "#1e3020" } },
    ],
  },
  {
    title: "In Progress",
    headerBg: "#303020",
    headerColor: "#f9e2af",
    cards: [
      { title: "User authentication", tag: { name: "backend", color: "#cba6f7", bg: "#251e30" } },
      { title: "Dashboard redesign", tag: { name: "frontend", color: "#89dceb", bg: "#1e2530" } },
      { title: "Rate limiting", tag: { name: "backend", color: "#cba6f7", bg: "#251e30" } },
    ],
  },
  {
    title: "Done",
    headerBg: "#203020",
    headerColor: "#a6e3a1",
    cards: [
      { title: "Project setup", tag: { name: "devops", color: "#a6e3a1", bg: "#1e3020" } },
      { title: "CI/CD pipeline", tag: { name: "devops", color: "#a6e3a1", bg: "#1e3020" } },
      { title: "Initial wireframes", tag: { name: "design", color: "#f9e2af", bg: "#303020" } },
    ],
  },
]

export function KanbanShowcase(): JSX.Element {
  const [col, setCol] = useState(1)
  const [card, setCard] = useState(0)
  const { width } = useContentRect()

  useInput((_input, key) => {
    if (key.leftArrow) {
      setCol((c) => Math.max(0, c - 1))
      setCard(0)
    }
    if (key.rightArrow) {
      setCol((c) => Math.min(2, c + 1))
      setCard(0)
    }
    if (key.upArrow) setCard((c) => Math.max(0, c - 1))
    if (key.downArrow) {
      const maxCards = KANBAN_DATA[col]?.cards.length ?? 3
      setCard((c) => Math.min(maxCards - 1, c + 1))
    }
  })

  // Mouse click to select column and card
  // Layout: padding=1, 3 columns with gap=1, each with border
  // Column starts: roughly at x = padding + colIdx * (colWidth + gap)
  // Cards start at y ~= 4 (padding + header + border + marginTop), each card ~4 rows tall
  useMouseClick(({ x, y }) => {
    const contentWidth = (width || 80) - 2 // subtract padding
    const colWidth = Math.floor((contentWidth - 2) / 3) // 3 cols with 2 gaps
    const colIdx = Math.min(2, Math.max(0, Math.floor((x - 1) / (colWidth + 1))))

    // Cards start around row 4 (1 padding + 1 border + 1 header + 1 marginTop)
    // Each card is ~4 rows (1 border-top + 1 title + 1 tag + 1 border-bottom)
    const cardStartY = 4
    const cardHeight = 4
    if (y >= cardStartY) {
      const cardIdx = Math.floor((y - cardStartY) / cardHeight)
      const maxCards = KANBAN_DATA[colIdx]?.cards.length ?? 3
      if (cardIdx < maxCards) {
        setCol(colIdx)
        setCard(cardIdx)
      } else {
        setCol(colIdx)
        setCard(Math.max(0, maxCards - 1))
      }
    } else {
      // Clicked on header area — just select the column
      setCol(colIdx)
      setCard(0)
    }
  })

  return (
    <Box flexDirection="column" padding={1}>
      <Box flexDirection="row" gap={1} flexGrow={1}>
        {KANBAN_DATA.map((column, colIdx) => {
          const isFocused = colIdx === col
          return (
            <Box
              key={column.title}
              flexDirection="column"
              flexGrow={1}
              borderStyle="round"
              borderColor={isFocused ? "#89b4fa" : "#313244"}
            >
              {/* Column header */}
              <Box paddingX={1} gap={1} backgroundColor={column.headerBg}>
                <Text bold color={column.headerColor}>
                  {column.title}
                </Text>
                <Text color="#6c7086">{column.cards.length}</Text>
              </Box>

              {/* Cards */}
              <Box flexDirection="column" paddingX={1} marginTop={1}>
                {column.cards.map((c, cardIdx) => {
                  const isSelected = colIdx === col && cardIdx === card
                  return (
                    <Box
                      key={c.title}
                      flexDirection="column"
                      marginBottom={1}
                      borderStyle="round"
                      borderColor={isSelected ? "#89dceb" : isFocused ? "#45475a" : "#313244"}
                      paddingX={1}
                    >
                      <Text
                        color={isSelected ? "#cdd6f4" : isFocused ? "#a6adc8" : "#6c7086"}
                        bold={isSelected}
                      >
                        {isSelected && <Text color="#89dceb">{"\u25B8"} </Text>}
                        {c.title}
                      </Text>
                      <Box>
                        <Box backgroundColor={c.tag.bg} paddingX={1}>
                          <Text color={c.tag.color}>{c.tag.name}</Text>
                        </Box>
                      </Box>
                    </Box>
                  )
                })}
              </Box>
            </Box>
          )
        })}
      </Box>

      <KeyHints hints={"\u2190\u2192 columns  \u2191\u2193 cards  click to select"} />
    </Box>
  )
}
