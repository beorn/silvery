/**
 * App Todo - Layer 3 Example
 *
 * Demonstrates createApp() with Zustand store for
 * shared state and fine-grained subscriptions.
 *
 * This shows how to build apps with complex state
 * using the full power of Zustand.
 *
 * Usage: bun examples/app-todo.tsx
 *
 * Controls:
 *   j/k - Move cursor down/up
 *   a   - Add new todo
 *   x   - Toggle completed
 *   d   - Delete todo
 *   q   - Quit
 */

import React from "react"
import { Box, Text } from "../src/index.js"
import { createApp, useApp } from "../src/runtime/index.js"

// ============================================================================
// Types
// ============================================================================

interface Todo {
  id: number
  text: string
  completed: boolean
}

interface State {
  todos: Todo[]
  cursor: number
  nextId: number
  addTodo: (text: string) => void
  toggleTodo: () => void
  deleteTodo: () => void
  moveCursor: (delta: number) => void
}

// ============================================================================
// Store
// ============================================================================

const app = createApp<Record<string, unknown>, State>(
  // Store factory
  () => (set, get) => ({
    todos: [
      { id: 1, text: "Learn inkx-loop architecture", completed: true },
      { id: 2, text: "Build an app with createApp()", completed: false },
      { id: 3, text: "Ship to production", completed: false },
    ],
    cursor: 0,
    nextId: 4,

    addTodo: (text: string) =>
      set((s) => ({
        todos: [...s.todos, { id: s.nextId, text, completed: false }],
        nextId: s.nextId + 1,
      })),

    toggleTodo: () =>
      set((s) => ({
        todos: s.todos.map((t, i) =>
          i === s.cursor ? { ...t, completed: !t.completed } : t,
        ),
      })),

    deleteTodo: () =>
      set((s) => {
        const newTodos = s.todos.filter((_, i) => i !== s.cursor)
        return {
          todos: newTodos,
          cursor: Math.min(s.cursor, newTodos.length - 1),
        }
      }),

    moveCursor: (delta: number) =>
      set((s) => ({
        cursor: Math.max(0, Math.min(s.cursor + delta, s.todos.length - 1)),
      })),
  }),

  // Event handlers
  {
    "term:key": (data: unknown, { get }: { get: () => State }) => {
      const { input: k } = data as { input: string }
      const state = get()
      switch (k) {
        case "j":
          state.moveCursor(1)
          break
        case "k":
          state.moveCursor(-1)
          break
        case "x":
          state.toggleTodo()
          break
        case "d":
          if (state.todos.length > 0) state.deleteTodo()
          break
        case "a":
          state.addTodo(`New todo ${state.nextId}`)
          break
        case "q":
          return "exit"
      }
    },
  },
)

// ============================================================================
// Components
// ============================================================================

function TodoItem({ todo, isCursor }: { todo: Todo; isCursor: boolean }) {
  return (
    <Box>
      <Text color={isCursor ? "cyan" : undefined}>
        {isCursor ? "› " : "  "}
      </Text>
      <Text
        color={todo.completed ? "green" : undefined}
        strikethrough={todo.completed}
      >
        {todo.completed ? "✓" : "○"} {todo.text}
      </Text>
    </Box>
  )
}

function TodoList() {
  const todos = useApp((s: State) => s.todos)
  const cursor = useApp((s: State) => s.cursor)

  return (
    <Box flexDirection="column">
      {todos.map((todo, i) => (
        <TodoItem key={todo.id} todo={todo} isCursor={i === cursor} />
      ))}
      {todos.length === 0 && (
        <Text dimColor>No todos. Press 'a' to add one.</Text>
      )}
    </Box>
  )
}

function App() {
  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color="magenta">
        Layer 3 Todo (createApp + Zustand)
      </Text>
      <Text> </Text>
      <TodoList />
      <Text> </Text>
      <Text dimColor>j/k: move • x: toggle • a: add • d: delete • q: quit</Text>
    </Box>
  )
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  const handle = await app.run(<App />, {
    cols: 60,
    rows: 20,
  })

  await handle.waitUntilExit()

  console.log("\nFinal state:", handle.store.getState().todos.length, "todos")
}

main().catch(console.error)
