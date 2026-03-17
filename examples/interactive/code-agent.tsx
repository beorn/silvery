/**
 * Code Agent Demo — Virtual Inline Mode Showcase
 *
 * A minimal Claude Code-like agent UI demonstrating all virtual inline features:
 * - Virtual scrollback with scrollable conversation history
 * - Text selection with auto-copy via OSC 52
 * - Search (Ctrl+F) across entire conversation
 * - Zero flicker via altscreen rendering
 *
 * Run: bun vendor/silvery/examples/interactive/code-agent.tsx
 */

import React, { useState, useEffect } from "react"
import { Box, Text, render, createTerm, useInput, useApp, type Key } from "../../src/index.js"

// ============================================================================
// Data
// ============================================================================

interface Message {
  role: "user" | "assistant"
  content: string
}

const conversation: Message[] = [
  { role: "user", content: "How do I sort an array in TypeScript?" },
  {
    role: "assistant",
    content: `You can sort arrays in TypeScript using the built-in \`.sort()\` method:

\`\`\`typescript
// Sort numbers ascending
const numbers = [3, 1, 4, 1, 5, 9, 2, 6]
numbers.sort((a, b) => a - b)
// [1, 1, 2, 3, 4, 5, 6, 9]

// Sort strings alphabetically
const words = ["banana", "apple", "cherry"]
words.sort()
// ["apple", "banana", "cherry"]
\`\`\`

Note that \`.sort()\` mutates the original array. Use \`[...arr].sort()\` to preserve the original.`,
  },
  { role: "user", content: "What about sorting objects by a key?" },
  {
    role: "assistant",
    content: `For sorting objects by a property, pass a comparator function:

\`\`\`typescript
interface User {
  name: string
  age: number
}

const users: User[] = [
  { name: "Alice", age: 30 },
  { name: "Bob", age: 25 },
  { name: "Charlie", age: 35 },
]

// Sort by age ascending
users.sort((a, b) => a.age - b.age)

// Sort by name alphabetically
users.sort((a, b) => a.name.localeCompare(b.name))
\`\`\`

For descending order, swap \`a\` and \`b\` in the comparator.`,
  },
  { role: "user", content: "Can you show stable sorting?" },
  {
    role: "assistant",
    content: `JavaScript's \`.sort()\` is guaranteed stable since ES2019 (and in all modern engines).

\`\`\`typescript
const items = [
  { name: "A", priority: 2 },
  { name: "B", priority: 1 },
  { name: "C", priority: 2 },
  { name: "D", priority: 1 },
]

// Stable sort preserves relative order of equal elements
items.sort((a, b) => a.priority - b.priority)
// B(1), D(1), A(2), C(2) — B stays before D, A stays before C
\`\`\`

This means you can do multi-key sorting by sorting from least to most significant key.`,
  },
  { role: "user", content: "How about a custom sort for dates?" },
  {
    role: "assistant",
    content: `Dates can be compared using \`.getTime()\` or direct subtraction:

\`\`\`typescript
const events = [
  { name: "Launch", date: new Date("2024-03-15") },
  { name: "Beta", date: new Date("2024-01-10") },
  { name: "Alpha", date: new Date("2023-11-01") },
]

// Sort by date ascending (oldest first)
events.sort((a, b) => a.date.getTime() - b.date.getTime())

// Sort by date descending (newest first)
events.sort((a, b) => b.date.getTime() - a.date.getTime())
\`\`\`

For ISO date strings, you can compare them directly since ISO format is lexicographically sortable:
\`\`\`typescript
const dates = ["2024-03-15", "2024-01-10", "2023-11-01"]
dates.sort() // Natural string comparison works for ISO dates
\`\`\``,
  },
  { role: "user", content: "What's the time complexity of .sort()?" },
  {
    role: "assistant",
    content: `V8 (Chrome/Node/Bun) uses Timsort, which has these characteristics:

- **Best case**: O(n) — when data is already sorted
- **Average case**: O(n log n)
- **Worst case**: O(n log n)
- **Space**: O(n) auxiliary

Timsort is a hybrid algorithm combining merge sort and insertion sort. It's optimized for real-world data that often has "runs" of already-sorted subsequences.

For very small arrays (< ~10 elements), the engine may use insertion sort instead, which is faster for small inputs due to lower constant factors.`,
  },
  { role: "user", content: "Can you show sorting with a locale-aware comparison?" },
  {
    role: "assistant",
    content: `Use \`Intl.Collator\` for locale-aware sorting — it's much faster than \`localeCompare\` when sorting many strings:

\`\`\`typescript
const collator = new Intl.Collator("de", { sensitivity: "base" })

const germanWords = ["Apfel", "apfel", "Birne", "banane"]
germanWords.sort(collator.compare)
// Treats uppercase and lowercase as equal

// For case-insensitive sorting in any locale:
const caseInsensitive = new Intl.Collator(undefined, { sensitivity: "base" })
words.sort(caseInsensitive.compare)

// Numeric sorting (file names, version strings):
const numericCollator = new Intl.Collator(undefined, { numeric: true })
const files = ["file10.txt", "file2.txt", "file1.txt"]
files.sort(numericCollator.compare)
// ["file1.txt", "file2.txt", "file10.txt"]
\`\`\``,
  },
]

// ============================================================================
// Components
// ============================================================================

function MessageView({ message }: { message: Message }) {
  const isUser = message.role === "user"
  return (
    <Box flexDirection="column" paddingX={1} marginBottom={1}>
      <Text bold color={isUser ? "$primary" : "$success"}>
        {isUser ? "You" : "Assistant"}
      </Text>
      <Box paddingLeft={2}>
        <Text>{message.content}</Text>
      </Box>
    </Box>
  )
}

function HelpBar() {
  return (
    <Box paddingX={1} gap={2}>
      <Text color="$muted">Ctrl+F search | Scroll to browse history | Drag to select | q quit</Text>
    </Box>
  )
}

function CodeAgent() {
  const { exit } = useApp()
  const [visibleCount, setVisibleCount] = useState(2) // Reveal messages progressively

  useInput((input: string, key: Key) => {
    if (input === "q" || key.escape) {
      exit()
    }
  })

  // Progressive reveal — simulates conversation loading
  useEffect(() => {
    if (visibleCount >= conversation.length) return
    const timer = setInterval(() => {
      setVisibleCount((c) => Math.min(c + 1, conversation.length))
    }, 800)
    return () => clearInterval(timer)
  }, [visibleCount])

  const messages = conversation.slice(0, visibleCount)

  return (
    <Box flexDirection="column" width="100%">
      <Box paddingX={1} marginBottom={1} borderStyle="round" borderColor="$border">
        <Text bold color="$primary">
          Code Agent
        </Text>
        <Text color="$muted">
          {" "}
          — {messages.length}/{conversation.length} messages
        </Text>
      </Box>

      <Box flexDirection="column">
        {messages.map((msg, i) => (
          <MessageView key={i} message={msg} />
        ))}
      </Box>

      {visibleCount < conversation.length && (
        <Box paddingX={1}>
          <Text color="$muted">Loading...</Text>
        </Box>
      )}

      <HelpBar />
    </Box>
  )
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  using term = createTerm()
  const { waitUntilExit } = await render(<CodeAgent />, term)
  await waitUntilExit()
}

if (import.meta.main) {
  main().catch(console.error)
}
