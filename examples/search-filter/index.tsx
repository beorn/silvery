/**
 * Search Filter Example
 *
 * Demonstrates React concurrent features for responsive typing:
 * - useTransition for low-priority state updates
 * - useDeferredValue for deferred filtering
 * - Typing remains responsive even with heavy filtering
 */

import React, { useState, useDeferredValue, useTransition } from "react"
import {
  render,
  Box,
  Text,
  useInput,
  useApp,
  createTerm,
  type Key,
} from "../../src/index.js"

// ============================================================================
// Types
// ============================================================================

interface Item {
  id: number
  name: string
  category: string
  tags: string[]
}

// ============================================================================
// Data
// ============================================================================

const items: Item[] = [
  {
    id: 1,
    name: "React Hooks Guide",
    category: "docs",
    tags: ["react", "hooks", "tutorial"],
  },
  {
    id: 2,
    name: "TypeScript Patterns",
    category: "docs",
    tags: ["typescript", "patterns"],
  },
  {
    id: 3,
    name: "Build Configuration",
    category: "config",
    tags: ["webpack", "vite", "build"],
  },
  {
    id: 4,
    name: "Testing Best Practices",
    category: "docs",
    tags: ["testing", "jest", "vitest"],
  },
  {
    id: 5,
    name: "API Documentation",
    category: "docs",
    tags: ["api", "rest", "graphql"],
  },
  {
    id: 6,
    name: "Database Schema",
    category: "config",
    tags: ["database", "sql", "migration"],
  },
  {
    id: 7,
    name: "Authentication Flow",
    category: "docs",
    tags: ["auth", "security", "jwt"],
  },
  {
    id: 8,
    name: "CI/CD Pipeline",
    category: "config",
    tags: ["ci", "deployment", "github"],
  },
  {
    id: 9,
    name: "Performance Tuning",
    category: "docs",
    tags: ["performance", "optimization"],
  },
  {
    id: 10,
    name: "Error Handling",
    category: "docs",
    tags: ["errors", "debugging", "logging"],
  },
  {
    id: 11,
    name: "State Management",
    category: "docs",
    tags: ["state", "redux", "zustand"],
  },
  {
    id: 12,
    name: "CSS Architecture",
    category: "docs",
    tags: ["css", "tailwind", "styled"],
  },
  {
    id: 13,
    name: "Security Guidelines",
    category: "docs",
    tags: ["security", "owasp", "audit"],
  },
  {
    id: 14,
    name: "Deployment Scripts",
    category: "config",
    tags: ["deploy", "docker", "k8s"],
  },
  {
    id: 15,
    name: "Monitoring Setup",
    category: "config",
    tags: ["monitoring", "metrics", "logs"],
  },
]

// ============================================================================
// Components
// ============================================================================

function SearchInput({
  value,
  onChange,
}: {
  value: string
  onChange: (v: string) => void
}) {
  return (
    <Box>
      <Text bold color="cyan">
        Search:{" "}
      </Text>
      <Text>{value}</Text>
      <Text dim>|</Text>
    </Box>
  )
}

function FilteredList({
  query,
  isPending,
}: {
  query: string
  isPending: boolean
}) {
  // Simulate expensive filtering (in real app this might be fuzzy search)
  const filtered = items.filter((item) => {
    const searchLower = query.toLowerCase()
    return (
      item.name.toLowerCase().includes(searchLower) ||
      item.category.toLowerCase().includes(searchLower) ||
      item.tags.some((tag) => tag.toLowerCase().includes(searchLower))
    )
  })

  return (
    <Box flexDirection="column" marginTop={1}>
      <Box marginBottom={1}>
        <Text dim>
          {filtered.length} results
          {isPending && " (filtering...)"}
        </Text>
      </Box>
      {filtered.map((item) => (
        <Box key={item.id} marginBottom={1}>
          <Text bold>{item.name}</Text>
          <Text dim> [{item.category}]</Text>
          <Text color="gray"> {item.tags.join(", ")}</Text>
        </Box>
      ))}
      {filtered.length === 0 && (
        <Text dim italic>
          No matches found
        </Text>
      )}
    </Box>
  )
}

function SearchApp(): JSX.Element {
  const { exit } = useApp()
  const [query, setQuery] = useState("")

  // useDeferredValue: The filtered list uses a deferred version of the query
  // This keeps typing responsive while the list catches up
  const deferredQuery = useDeferredValue(query)

  // useTransition: Mark filtering as low-priority (optional, shows pending state)
  const [isPending, startTransition] = useTransition()

  useInput((input: string, key: Key) => {
    if (key.escape || (key.ctrl && input === "c")) {
      exit()
      return
    }

    if (key.backspace || key.delete) {
      // Backspace: remove last character
      startTransition(() => {
        setQuery((prev) => prev.slice(0, -1))
      })
      return
    }

    // Add printable characters
    if (input && !key.ctrl && !key.meta) {
      startTransition(() => {
        setQuery((prev) => prev + input)
      })
    }
  })

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="yellow">
          Search Filter Demo
        </Text>
        <Text dim> | useTransition + useDeferredValue | Esc to quit</Text>
      </Box>

      <SearchInput value={query} onChange={setQuery} />

      {/* List uses deferredQuery so typing stays responsive */}
      <FilteredList query={deferredQuery} isPending={isPending} />

      <Box marginTop={1} borderStyle="single" borderColor="gray" padding={1}>
        <Box flexDirection="column">
          <Text dim>This example demonstrates:</Text>
          <Text dim>- useDeferredValue: query filtering is deferred</Text>
          <Text dim>- useTransition: shows "filtering..." during updates</Text>
          <Text dim>- Typing stays responsive even with many items</Text>
        </Box>
      </Box>
    </Box>
  )
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  using term = createTerm()
  const { waitUntilExit } = await render(<SearchApp />, term)
  await waitUntilExit()
}

main().catch(console.error)
