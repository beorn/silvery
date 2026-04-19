/**
 * createAppContext<T>() tests — typed React context + provider + hook factory.
 *
 * Uses @silvery/test's createRenderer to exercise the context through the
 * real silvery reconciler (not react-dom). This matches how apps actually
 * consume createAppContext at runtime.
 *
 * Covers:
 *   - Provider + hook work together (value round-trips to rendered output)
 *   - Hook throws when used outside the provider
 *   - Error message includes the configured name
 *   - DevTools displayName is set on context and provider
 *   - Default name is "App" when no options passed
 *   - Nested providers isolate their values
 *   - Independent contexts don't alias
 */

import React from "react"
import { describe, expect, test } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, Text } from "silvery"
import { createAppContext } from "../src/create-app-context"

interface ChatModel {
  readonly messages: string[]
}

describe("createAppContext", () => {
  test("provider + useApp() round-trip the value into rendered output", () => {
    const { AppProvider, useApp } = createAppContext<ChatModel>({ name: "Chat" })

    function Consumer() {
      const chat = useApp()
      return <Text>{chat.messages.join(",")}</Text>
    }

    const chat: ChatModel = { messages: ["hi", "there"] }
    const render = createRenderer({ cols: 40, rows: 4 })
    const app = render(
      <AppProvider value={chat}>
        <Consumer />
      </AppProvider>,
    )
    expect(app.text).toContain("hi,there")
  })

  test("useApp() throws when called outside the provider", () => {
    const { useApp } = createAppContext<ChatModel>({ name: "Chat" })

    function Consumer() {
      useApp()
      return <Text>unreachable</Text>
    }

    const render = createRenderer({ cols: 40, rows: 4 })
    // The render swallows and re-throws through React's error boundary —
    // the thrown message is surfaced via the rendered output or a sync throw.
    // Either way, the error message must match. createRenderer bubbles
    // thrown errors out synchronously.
    expect(() => render(<Consumer />)).toThrowError(/useChat\(\) called outside <ChatProvider>/)
  })

  test("default name is 'App' when no options passed", () => {
    const { AppContext, AppProvider, useApp } = createAppContext<{ x: number }>()

    expect(AppContext.displayName).toBe("AppContext")
    expect(AppProvider.displayName).toBe("AppProvider")

    function Consumer() {
      useApp()
      return null
    }
    const render = createRenderer({ cols: 40, rows: 4 })
    expect(() => render(<Consumer />)).toThrowError(/useApp\(\) called outside <AppProvider>/)
  })

  test("custom name propagates to context + provider displayName", () => {
    const { AppContext, AppProvider } = createAppContext<{ x: number }>({ name: "Board" })
    expect(AppContext.displayName).toBe("BoardContext")
    expect(AppProvider.displayName).toBe("BoardProvider")
  })

  test("error message suggests the correct provider tag", () => {
    const { useApp } = createAppContext<{ x: number }>({ name: "Todo" })

    function Consumer() {
      useApp()
      return null
    }
    const render = createRenderer({ cols: 40, rows: 4 })
    expect(() => render(<Consumer />)).toThrowError(
      /Wrap the component tree in <TodoProvider value={\.\.\.}>/,
    )
  })

  test("nested providers isolate their values (inner wins inside)", () => {
    const { AppProvider, useApp } = createAppContext<ChatModel>({ name: "Chat" })

    function Consumer({ id }: { id: string }) {
      const chat = useApp()
      return <Text>{`${id}:${chat.messages[0]}`}</Text>
    }

    const outer: ChatModel = { messages: ["outer"] }
    const inner: ChatModel = { messages: ["inner"] }

    const render = createRenderer({ cols: 40, rows: 4 })
    const app = render(
      <AppProvider value={outer}>
        <Box flexDirection="column">
          <Consumer id="a" />
          <AppProvider value={inner}>
            <Consumer id="b" />
          </AppProvider>
        </Box>
      </AppProvider>,
    )
    expect(app.text).toContain("a:outer")
    expect(app.text).toContain("b:inner")
  })

  test("AppContext is a real React.Context (consumable via useContext)", () => {
    const { AppContext, AppProvider } = createAppContext<{ id: number }>({ name: "Thing" })

    function Consumer() {
      const v = React.useContext(AppContext)
      return <Text>{v ? String(v.id) : "null"}</Text>
    }

    const render = createRenderer({ cols: 40, rows: 4 })
    const app = render(
      <AppProvider value={{ id: 7 }}>
        <Consumer />
      </AppProvider>,
    )
    expect(app.text).toContain("7")
  })

  test("two independent app contexts do not alias", () => {
    const chatCtx = createAppContext<ChatModel>({ name: "Chat" })
    const todoCtx = createAppContext<{ todos: string[] }>({ name: "Todo" })

    function Consumer() {
      const chat = chatCtx.useApp()
      const todo = todoCtx.useApp()
      return <Text>{`${chat.messages.length}/${todo.todos.length}`}</Text>
    }

    const render = createRenderer({ cols: 40, rows: 4 })
    const app = render(
      <chatCtx.AppProvider value={{ messages: ["a", "b"] }}>
        <todoCtx.AppProvider value={{ todos: ["x"] }}>
          <Consumer />
        </todoCtx.AppProvider>
      </chatCtx.AppProvider>,
    )
    expect(app.text).toContain("2/1")
  })

  test("TypeScript infers the generic T correctly", () => {
    // Compile-time check: the return type's useApp() should be ChatModel, not unknown.
    // This test passes if it type-checks; the runtime assertion is trivial.
    const { AppProvider, useApp } = createAppContext<ChatModel>({ name: "Chat" })

    function Consumer() {
      const chat = useApp()
      // Accessing .messages would be a type error if T was inferred as unknown.
      const count: number = chat.messages.length
      return <Text>{String(count)}</Text>
    }

    const render = createRenderer({ cols: 40, rows: 4 })
    const app = render(
      <AppProvider value={{ messages: ["x", "y", "z"] }}>
        <Consumer />
      </AppProvider>,
    )
    expect(app.text).toContain("3")
  })
})
