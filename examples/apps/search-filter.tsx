/**
 * Search Filter Example
 *
 * Demonstrates React concurrent features for responsive typing:
 * - useTransition for low-priority state updates
 * - useDeferredValue for deferred filtering
 * - Typing remains responsive even with heavy filtering
 */

import React, { useState, useDeferredValue, useTransition } from "react"
import { render, Box, Text, Kbd, Muted, Strong, Lead, useInput, useApp, createTerm, type Key } from "silvery"
import { ExampleBanner, type ExampleMeta } from "../_banner.js"

export const meta: ExampleMeta = {
  name: "Search Filter",
  description: "useTransition + useDeferredValue for responsive concurrent search",
  features: ["useDeferredValue", "useTransition", "useInput"],
}

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

function SearchInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Box>
      <Strong color="$primary">Search: </Strong>
      <Text>{value}</Text>
      <Text dim>|</Text>
    </Box>
  )
}

function FilteredList({ query, isPending }: { query: string; isPending: boolean }) {
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
        <Muted>
          {filtered.length} results
          {isPending && " (filtering...)"}
        </Muted>
      </Box>
      {filtered.map((item) => (
        <Box key={item.id} marginBottom={1}>
          <Text bold>{item.name}</Text>
          <Text dim> [{item.category}]</Text>
          <Text color="$muted"> {item.tags.join(", ")}</Text>
        </Box>
      ))}
      {filtered.length === 0 && <Lead>No matches found</Lead>}
    </Box>
  )
}

export function SearchApp() {
  const { exit } = useApp()
  const [query, setQuery] = useState("")

  // useDeferredValue: The filtered list uses a deferred version of the query
  // This keeps typing responsive while the list catches up
  const deferredQuery = useDeferredValue(query)

  // useTransition: Mark filtering as low-priority (optional, shows pending state)
  const [isPending, startTransition] = useTransition()

  useInput((input: string, key: Key) => {
    if (key.escape) {
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
      <SearchInput value={query} onChange={setQuery} />

      {/* List uses deferredQuery so typing stays responsive */}
      <Box flexGrow={1}>
        <FilteredList query={deferredQuery} isPending={isPending} />
      </Box>

      <Muted>
        {" "}
        <Kbd>type</Kbd> to search <Kbd>Esc/q</Kbd> quit
      </Muted>
    </Box>
  )
}

// ============================================================================
// Main
// ============================================================================

export async function main() {
  using term = createTerm()
  const { waitUntilExit } = await render(
    <ExampleBanner meta={meta} controls="type to search  Esc quit">
      <SearchApp />
    </ExampleBanner>,
    term,
  )
  await waitUntilExit()
}

if (import.meta.main) {
  await main()
}
