/**
 * Async Data Example
 *
 * Demonstrates React Suspense for async data loading:
 * - Suspense boundaries with fallback UI
 * - Multiple independent suspending components
 * - Error handling with ErrorBoundary
 */

import React, { Suspense, useState, use } from "react"
import {
  render,
  Box,
  Text,
  useInput,
  useApp,
  createTerm,
  ErrorBoundary,
  type Key,
} from "../../src/index.js"

// ============================================================================
// Data Fetching (simulated)
// ============================================================================

// Cache for promises (React's use() requires stable promise references)
const cache = new Map<string, Promise<unknown>>()

function fetchData<T>(key: string, ms: number, data: T): Promise<T> {
  if (!cache.has(key)) {
    cache.set(
      key,
      new Promise<T>((resolve) => setTimeout(() => resolve(data), ms)),
    )
  }
  return cache.get(key) as Promise<T>
}

function clearCache() {
  cache.clear()
}

// ============================================================================
// Async Components
// ============================================================================

interface UserData {
  name: string
  email: string
  role: string
}

function UserProfile() {
  const user = use(
    fetchData<UserData>("user", 1500, {
      name: "Alice Chen",
      email: "alice@example.com",
      role: "Developer",
    }),
  )

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="green"
      padding={1}
    >
      <Text bold color="green">
        User Profile
      </Text>
      <Text>Name: {user.name}</Text>
      <Text>Email: {user.email}</Text>
      <Text>Role: {user.role}</Text>
    </Box>
  )
}

interface StatsData {
  projects: number
  commits: number
  reviews: number
}

function Statistics() {
  const stats = use(
    fetchData<StatsData>("stats", 2500, {
      projects: 12,
      commits: 847,
      reviews: 156,
    }),
  )

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="blue"
      padding={1}
    >
      <Text bold color="blue">
        Statistics
      </Text>
      <Text>Projects: {stats.projects}</Text>
      <Text>Commits: {stats.commits}</Text>
      <Text>Reviews: {stats.reviews}</Text>
    </Box>
  )
}

interface Activity {
  id: number
  action: string
  time: string
}

function RecentActivity() {
  const activities = use(
    fetchData<Activity[]>("activity", 3500, [
      { id: 1, action: "Merged PR #423", time: "2h ago" },
      { id: 2, action: "Reviewed PR #421", time: "4h ago" },
      { id: 3, action: "Created issue #89", time: "1d ago" },
    ]),
  )

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="yellow"
      padding={1}
    >
      <Text bold color="yellow">
        Recent Activity
      </Text>
      {activities.map((a) => (
        <Text key={a.id}>
          <Text dim>{a.time}</Text> {a.action}
        </Text>
      ))}
    </Box>
  )
}

// Loading fallbacks
function LoadingBox({ label, color }: { label: string; color: string }) {
  return (
    <Box borderStyle="round" borderColor="gray" padding={1}>
      <Text dim>Loading {label}...</Text>
    </Box>
  )
}

// ============================================================================
// Main App
// ============================================================================

export function AsyncDataApp(): JSX.Element {
  const { exit } = useApp()
  const [refreshKey, setRefreshKey] = useState(0)

  useInput((input: string, key: Key) => {
    if (key.escape || (key.ctrl && input === "c")) {
      exit()
      return
    }
    if (input === "r") {
      // Refresh: clear cache and force re-render
      clearCache()
      setRefreshKey((k) => k + 1)
    }
  })

  return (
    <Box flexDirection="column" padding={1} key={refreshKey}>
      <Box marginBottom={1}>
        <Text bold color="yellow">
          Async Data Demo
        </Text>
      </Box>

      <Box flexGrow={1} flexDirection="row" gap={1}>
        {/* Each Suspense boundary loads independently */}
        <ErrorBoundary fallback={<Text color="red">User error</Text>}>
          <Suspense fallback={<LoadingBox label="user" color="green" />}>
            <UserProfile />
          </Suspense>
        </ErrorBoundary>

        <ErrorBoundary fallback={<Text color="red">Stats error</Text>}>
          <Suspense fallback={<LoadingBox label="stats" color="blue" />}>
            <Statistics />
          </Suspense>
        </ErrorBoundary>

        <ErrorBoundary fallback={<Text color="red">Activity error</Text>}>
          <Suspense fallback={<LoadingBox label="activity" color="yellow" />}>
            <RecentActivity />
          </Suspense>
        </ErrorBoundary>
      </Box>

      <Text dim>
        {" "}
        <Text bold dim>
          r
        </Text>{" "}
        refresh{" "}
        <Text bold dim>
          Esc
        </Text>{" "}
        quit
      </Text>
    </Box>
  )
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  using term = createTerm()
  const { waitUntilExit } = await render(<AsyncDataApp />, term)
  await waitUntilExit()
}

if (import.meta.main) {
  main().catch(console.error)
}
