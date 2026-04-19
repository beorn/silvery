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
  H1,
  Kbd,
  Muted,
  useInput,
  useApp,
  createTerm,
  ErrorBoundary,
  type Key,
} from "silvery"
import { ExampleBanner, type ExampleMeta } from "../_banner.js"

export const meta: ExampleMeta = {
  name: "Async Data",
  description: "React Suspense with independent data sources and error boundaries",
  features: ["React Suspense", "use() hook", "ErrorBoundary"],
}

// ============================================================================
// Data Fetching (simulated)
// ============================================================================

// Cache for promises (React's use() requires stable promise references)
const cache = new Map<string, Promise<unknown>>()

function fetchData<T>(key: string, ms: number, data: T): Promise<T> {
  if (!cache.has(key)) {
    cache.set(key, new Promise<T>((resolve) => setTimeout(() => resolve(data), ms)))
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
    <Box flexDirection="column" borderStyle="round" borderColor="$success" padding={1}>
      <H1 color="$success">User Profile</H1>
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
    <Box flexDirection="column" borderStyle="round" borderColor="$primary" padding={1}>
      <H1>Statistics</H1>
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
    <Box flexDirection="column" borderStyle="round" borderColor="$warning" padding={1}>
      <H1 color="$warning">Recent Activity</H1>
      {activities.map((a) => (
        <Text key={a.id}>
          <Text dim>{a.time}</Text> {a.action}
        </Text>
      ))}
    </Box>
  )
}

// Loading fallbacks
function LoadingBox({ label }: { label: string }) {
  return (
    <Box borderStyle="round" borderColor="$border" padding={1}>
      <Text color="$muted">Loading {label}...</Text>
    </Box>
  )
}

// ============================================================================
// Main App
// ============================================================================

export function AsyncDataApp() {
  const { exit } = useApp()
  const [refreshKey, setRefreshKey] = useState(0)

  useInput((input: string, key: Key) => {
    if (input === "q" || key.escape) {
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
      <Box flexGrow={1} flexDirection="row" gap={1}>
        {/* Each Suspense boundary loads independently */}
        <ErrorBoundary fallback={<Text color="$error">User error</Text>}>
          <Suspense fallback={<LoadingBox label="user" />}>
            <UserProfile />
          </Suspense>
        </ErrorBoundary>

        <ErrorBoundary fallback={<Text color="$error">Stats error</Text>}>
          <Suspense fallback={<LoadingBox label="stats" />}>
            <Statistics />
          </Suspense>
        </ErrorBoundary>

        <ErrorBoundary fallback={<Text color="$error">Activity error</Text>}>
          <Suspense fallback={<LoadingBox label="activity" />}>
            <RecentActivity />
          </Suspense>
        </ErrorBoundary>
      </Box>

      <Muted>
        {" "}
        <Kbd>r</Kbd> refresh <Kbd>Esc/q</Kbd> quit
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
    <ExampleBanner meta={meta} controls="r refresh  Esc/q quit">
      <AsyncDataApp />
    </ExampleBanner>,
    term,
  )
  await waitUntilExit()
}
