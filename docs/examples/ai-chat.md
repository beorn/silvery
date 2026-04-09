---
title: AI Coding Agent — Streaming, Tool Calls, Real-time Updates
description: Build terminal-based AI coding agents with scrollable output, streaming responses, tool call rendering, and Playwright-style testing using Silvery.
prev:
  text: Terminal Protocols
  link: /examples/terminal
next:
  text: Testing
  link: /examples/testing
---

# AI Coding Agent

::: code-group

```bash [npm]
npx silvery examples aichat
```

```bash [bun]
bunx silvery examples aichat
```

```bash [pnpm]
pnpm dlx silvery examples aichat
```

```bash [vp]
vp silvery examples aichat
```

:::

Terminal-based AI coding agents have unique UI requirements: streaming output that grows unpredictably, tool call rendering with diff-style output, long conversation history that must scroll, and the ability for AI agents to discover and invoke actions programmatically. Silvery handles all of these out of the box.

## Key Benefits

**Scrollable containers for variable-length output.** LLM responses range from one line to hundreds. With `overflow="scroll"` on a Box, Silvery measures all children, determines which are visible, and renders only those — no manual height estimation or virtualization config.

**Command introspection for AI agents.** The `withCommands` plugin exposes every action with an ID, name, description, and keybindings. An AI agent can read `cmd.all()` to decide which actions to invoke, turning the TUI into a programmable interface.

**Streaming-friendly incremental rendering.** When an LLM streams tokens, only the message being appended changes. Silvery tracks dirty flags per node and re-renders only what changed — 169us per update versus 20.7ms for a full-screen repaint. At 50 tokens per second, that's the difference between smooth scrolling and visible flicker.

**Bracketed paste for code snippets.** The `usePaste` hook receives multi-line pasted text as a single event instead of individual keystrokes.

**Kitty keyboard protocol for rich shortcuts.** Silvery can distinguish Cmd+K from Ctrl+K, detect key release events, and parse macOS modifier symbols.

## Source Code

A minimal working chat interface in under 50 lines:

::: code-group

```tsx [chat.tsx]
import { Box, Text, TextInput } from "silvery"
import { run, useInput } from "@silvery/ag-term/runtime"
import { useState } from "react"

interface Message {
  role: "user" | "assistant"
  content: string
}

function Chat() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")

  async function send(text: string) {
    if (!text.trim()) return
    setInput("")
    const userMsg: Message = { role: "user", content: text }
    setMessages((prev) => [...prev, userMsg])

    // Replace with your LLM call
    const reply: Message = { role: "assistant", content: `Echo: ${text}` }
    setMessages((prev) => [...prev, reply])
  }

  return (
    <Box flexDirection="column" width="100%" height="100%">
      <Box flexDirection="column" flexGrow={1} overflow="scroll" scrollTo={messages.length - 1} paddingX={1}>
        {messages.map((msg, i) => (
          <Text key={i} color={msg.role === "user" ? "cyan" : "white"}>
            {msg.role === "user" ? "> " : "  "}
            {msg.content}
          </Text>
        ))}
      </Box>
      <Box borderStyle="round" borderColor="gray" paddingX={1}>
        <TextInput
          value={input}
          onChange={setInput}
          onSubmit={send}
          placeholder="Ask anything..."
          prompt="you: "
          promptColor="cyan"
        />
      </Box>
    </Box>
  )
}

await run(<Chat />)
```

:::

This gives you:

- A scrollable message history that grows as the conversation progresses
- Automatic scroll-to-bottom when new messages arrive (`scrollTo={messages.length - 1}`)
- A bordered input area with a prompt prefix and placeholder text
- Flex layout — `flexGrow={1}` makes the message area fill all available height

To add streaming, replace the echo stub with an async generator that appends tokens to the latest message. Silvery will re-render only the changed text node on each token.

::: warning Coming Soon
The command introspection API below (`withCommands`, command registries) is part of the Silvertea app architecture, which is currently in development. The APIs shown below will ship in a future release.
:::

## Adding Command Introspection

For AI-driven applications where an agent needs to discover and execute actions:

```tsx
import { withCommands } from "silvery"

const app = withCommands(render(<Chat />), {
  registry: commandRegistry,
  getContext: () => appContext,
  handleAction: (action) => dispatch(action),
})

// An AI agent can enumerate all available actions
const commands = app.cmd.all()

// And invoke them directly
await app.cmd.send_message()
```

## Key Patterns

### VirtualList for Long Conversations

For conversations with hundreds of messages, use VirtualList:

```tsx
<VirtualList
  items={messages}
  height={height}
  itemHeight={(msg) => estimateHeight(msg, width)}
  scrollTo={messages.length - 1}
  overscan={3}
  renderItem={(msg) => <MessageBubble message={msg} />}
/>
```

### Streaming Responses

Update a message in-place as tokens arrive:

```tsx
const streamTokens = async (messageId: number, generator: AsyncGenerator<string>) => {
  for await (const token of generator) {
    setMessages((prev) =>
      prev.map((m) => (m.id === messageId ? { ...m, content: m.content + token, streaming: true } : m)),
    )
  }
}
```

## Features Used

| Feature               | Usage                                     |
| --------------------- | ----------------------------------------- |
| `overflow="scroll"`   | Scrollable message history                |
| `scrollTo`            | Auto-scroll to latest message             |
| `VirtualList`         | Efficient rendering of long conversations |
| `TextInput`           | Message input with readline shortcuts     |
| `usePaste`            | Multi-line code pasting                   |
| `withCommands`        | AI agent command introspection            |
| Incremental rendering | 169us per streaming token update          |

## What Silvery Adds

Most TUI frameworks leave you to build chat infrastructure from scratch. Silvery provides the primitives: scroll containers handle variable-length LLM output, responsive layout via `useBoxRect()` sizes message bubbles, and the command system gives AI agents a programmatic API.

## Exercises

1. **Add streaming** — Reveal tokens word-by-word with a typing indicator
2. **Add code blocks** — Syntax-highlight fenced code blocks in responses
3. **Add model switching** — Press Ctrl+M to cycle between models
4. **Add conversation export** — Press Ctrl+S to save chat history to a file
