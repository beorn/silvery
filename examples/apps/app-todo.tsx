/**
 * App Todo - Layer 3 Example
 *
 * Demonstrates pipe() composition with createApp(), withReact(), and
 * withTerminal() — the canonical pattern for building full apps.
 *
 * The plugin system separates concerns:
 * - createApp()      — store + event handlers (what the app does)
 * - withReact()      — element binding (what the app renders)
 * - withTerminal()   — I/O binding (where the app runs)
 *
 * pipe() composes them left-to-right: each plugin enhances the
 * app object, wrapping run() so the final call needs no arguments.
 *
 * Usage: bun examples/apps/app-todo.tsx
 *
 * Controls:
 *   j/k - Move cursor down/up
 *   a   - Add new todo
 *   x   - Toggle completed
 *   d   - Delete todo
 *   Esc/q - Quit
 */

import React from "react"
import { Box, Text, Muted, Kbd } from "silvery"
import { createApp, useApp, type AppHandle } from "@silvery/create/create-app"
import { pipe, withReact, withTerminal } from "@silvery/create/plugins"
import { ExampleBanner, type ExampleMeta } from "../_banner.js"

export const meta: ExampleMeta = {
  name: "Todo App",
  description: "Layer 3: pipe() + createApp() + withReact() + withTerminal()",
  features: ["pipe()", "createApp()", "withReact()", "withTerminal()"],
}

// ============================================================================
// Types
// ============================================================================

type Todo = {
  id: number
  text: string
  completed: boolean
}

type State = {
  todos: Todo[]
  cursor: number
  nextId: number
  addTodo: (text: string) => void
  toggleTodo: () => void
  deleteTodo: () => void
  moveCursor: (delta: number) => void
}

// ============================================================================
// Components
// ============================================================================

function TodoItem({ todo, isCursor }: { todo: Todo; isCursor: boolean }) {
  return (
    <Box>
      <Text color={isCursor ? "$primary" : undefined}>{isCursor ? "› " : "  "}</Text>
      <Text color={todo.completed ? "$success" : undefined} strikethrough={todo.completed}>
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
      {todos.length === 0 && <Muted>No todos. Press 'a' to add one.</Muted>}
    </Box>
  )
}

function TodoApp() {
  return (
    <Box flexDirection="column" padding={1}>
      <TodoList />
      <Text> </Text>
      <Muted>
        <Kbd>j/k</Kbd> move <Kbd>x</Kbd> toggle <Kbd>a</Kbd> add <Kbd>d</Kbd> delete <Kbd>Esc/q</Kbd> quit
      </Muted>
    </Box>
  )
}

// ============================================================================
// App — pipe() composition
// ============================================================================

// 1. createApp() defines the store and event handlers
const baseApp = createApp<Record<string, unknown>, State>(
  () => (set, get) => ({
    todos: [
      { id: 1, text: "Learn silvery plugin composition", completed: true },
      { id: 2, text: "Build an app with pipe()", completed: false },
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
        todos: s.todos.map((t, i) => (i === s.cursor ? { ...t, completed: !t.completed } : t)),
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

  {
    "term:key": (data, ctx) => {
      const { input: k, key } = data as {
        input: string
        key: { escape: boolean }
      }
      const state = ctx.get() as State
      if (key.escape) return "exit"
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

// 2. pipe() composes plugins left-to-right:
//    - withReact() binds the element, so run() needs no JSX argument
//    - withTerminal() binds stdin/stdout, so run() needs no options
// Note: pipe() type composition requires casts at plugin boundaries
// because AppDefinition's typed run() doesn't structurally match
// the generic RunnableApp constraint used by plugins.
const app = pipe(
  baseApp as any,
  withReact(
    <ExampleBanner meta={meta} controls="j/k move  x toggle  a add  d delete  Esc/q quit">
      <TodoApp />
    </ExampleBanner>,
  ),
  withTerminal(process as any),
)

// ============================================================================
// Main
// ============================================================================

export async function main() {
  // 3. run() needs no arguments — element and terminal are already bound
  const handle = (await app.run()) as AppHandle<State>

  await handle.waitUntilExit()

  console.log("\nFinal state:", handle.store.getState().todos.length, "todos")
}

if (import.meta.main) {
  await main()
}
