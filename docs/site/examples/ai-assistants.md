---
title: Building AI Assistants & Chat Apps with Silvery
description: Build terminal-based AI assistants with scrollable output, command palettes, and streaming-friendly rendering using Silvery.
prev:
  text: Kanban Board
  link: /examples/kanban
next:
  text: CLI Wizards
  link: /examples/cli-wizards
---

<script setup>
import LiveDemo from '../.vitepress/components/LiveDemo.vue'
</script>

# AI Assistants & Chat Interfaces

Terminal-based AI assistants have unique UI requirements: streaming output that grows unpredictably, long conversation history that must scroll, multi-line code pasting, and the ability for AI agents to discover and invoke actions programmatically. Silvery handles all of these out of the box.

<LiveDemo xtermSrc="/examples/showcase.html?demo=coding-agent" :height="500" />

## Key Benefits

**Scrollable containers for variable-length output.** LLM responses range from one line to hundreds. With `overflow="scroll"` on a Box, Silvery measures all children, determines which are visible, and renders only those -- no manual height estimation or virtualization config. Just render your messages and let Silvery handle the rest.

**Command introspection for AI agents.** The `withCommands` plugin exposes every action with an ID, name, description, and keybindings. Calling `cmd.all()` returns a structured list of everything the app can do. An AI agent can read this to decide which actions to invoke, turning the TUI into a programmable interface rather than a purely visual one.

**Streaming-friendly incremental rendering.** When an LLM streams tokens, only the message being appended changes. Silvery tracks dirty flags per node and re-renders only what changed — 169us per update versus 20.7ms for a full-screen repaint ([benchmarks](/guide/why-Silvery#performance)). At 50 tokens per second, that is the difference between smooth scrolling and visible flicker.

**Bracketed paste for code snippets.** The `usePaste` hook receives multi-line pasted text as a single event instead of individual keystrokes. Users can paste code blocks, stack traces, or configuration files directly into the input area without the app interpreting each line as a separate command.

**Scrollback buffer support.** Long conversations need scrollback — users expect to scroll up through conversation history just like in a web chat. Silvery's `overflow="scroll"` containers handle this natively: content grows downward, the viewport follows the latest message, and users can scroll back through the full history with keyboard or mouse. No manual viewport management, no height estimation, no virtualization config.

**Kitty keyboard protocol for rich shortcuts.** Modern terminals support unambiguous key identification. Silvery can distinguish Cmd+K from Ctrl+K, detect key release events, and parse macOS modifier symbols. Build command palettes, chord sequences, and modal interfaces with confidence that key bindings will not collide.

## Example: Minimal AI Chat

A complete working chat interface in under 50 lines. Messages scroll automatically, the input field stays pinned at the bottom, and the user can send messages with Enter.

```tsx
import { Box, Text, TextInput, useContentRect } from "@silvery/term"
import { run, useInput } from "@silvery/term/runtime"
import { useState } from "react"

interface Message {
  role: "user" | "assistant"
  content: string
}

function Chat() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const { height } = useContentRect()

  async function send(text: string) {
    if (!text.trim()) return
    setInput("")
    const userMsg: Message = { role: "user", content: text }
    setMessages((prev) => [...prev, userMsg])

    // Replace with your LLM call — response streams in via setMessages
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

This gives you:

- A scrollable message history that grows as the conversation progresses
- Automatic scroll-to-bottom when new messages arrive (`scrollTo={messages.length - 1}`)
- A bordered input area with a prompt prefix and placeholder text
- Layout feedback via `useContentRect()` -- the message area fills all available height

To add streaming, replace the echo stub with an async generator that appends tokens to the latest message. Silvery will re-render only the changed text node on each token, keeping the update cost constant regardless of conversation length.

## Adding Command Introspection

For AI-driven applications where an agent needs to discover and execute actions, wrap the app with `withCommands`:

```tsx
import { withCommands } from "@silvery/term"

const app = withCommands(render(<Chat />), {
  registry: commandRegistry,
  getContext: () => appContext,
  handleAction: (action) => dispatch(action),
  getKeybindings: () => keybindings,
})

// An AI agent can enumerate all available actions
const commands = app.cmd.all()
// [{ id: "send_message", name: "Send", keys: ["Enter"], ... },
//  { id: "clear_history", name: "Clear", keys: ["Ctrl+L"], ... },
//  { id: "toggle_model", name: "Switch Model", keys: ["Ctrl+M"], ... }]

// And invoke them directly
await app.cmd.send_message()
```

This turns the TUI from a visual interface into a structured API. The agent does not need to simulate keystrokes -- it calls commands by name and reads the screen state through `app.text` or `app.getState()`.

## What Silvery Adds

Most TUI frameworks leave you to build chat infrastructure from scratch. Silvery provides the primitives out of the box: scroll containers (`overflow="scroll"`) handle variable-length LLM output without manual viewport tracking, layout feedback via `useContentRect()` sizes message bubbles without threading width props, and the command system gives AI agents a programmatic API to discover and invoke actions.

## Get Started

Install Silvery and build your first AI assistant:

```bash
bun add @silvery/term react flexily
```

See the [Getting Started guide](/guide/getting-started) for a full walkthrough, or explore the [component reference](/guide/components) for Box, Text, TextInput, VirtualList, and other building blocks.
