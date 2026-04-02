---
title: "Building an AI Coding Agent in the Terminal"
description: "The hard parts of building a terminal-based AI agent — streaming, scrollback, tool calls, and input handling."
date: 2026-04-02
---

# Building an AI Coding Agent in the Terminal

Claude Code, Aider, Goose, Codex CLI -- AI coding agents are converging on the terminal as their primary interface. After building agent UIs in Silvery, I've found that the hard parts aren't the basic chat loop (that's 40 lines of code). The hard parts are streaming token rendering, the scrollback decision, tool call display, and input handling.

## The Streaming Problem

The naive approach to streaming tokens is to update state on every token:

```tsx
// Don't do this
for await (const token of stream) {
  setMessages((prev) => prev.map((m) => (m.id === activeId ? { ...m, content: m.content + token } : m)))
}
```

This works at low token rates, but modern LLMs emit 50-150 tokens per second. Each `setMessages` triggers a React reconciliation pass. Even with Silvery's incremental renderer (which updates only the changed text node in ~169 microseconds), the overhead of scheduling 100+ React updates per second adds up. React batches state updates within the same synchronous tick, but async iteration creates a new tick per token.

The fix is to batch tokens on a timer:

```tsx
const pending = { current: "" }
const BATCH_MS = 16 // one frame at 60fps

function startBatching(messageId: number) {
  const interval = setInterval(() => {
    if (pending.current) {
      const chunk = pending.current
      pending.current = ""
      setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, content: m.content + chunk } : m)))
    }
  }, BATCH_MS)
  return () => clearInterval(interval)
}

// In the streaming loop:
for await (const token of stream) {
  pending.current += token
}
```

At 16ms intervals, you get at most 62 renders per second regardless of token rate. Each render handles whatever tokens accumulated since the last batch. The visual result is indistinguishable from per-token updates -- humans can't perceive text changes faster than about 15 updates per second anyway.

There's a subtlety here: you also need to flush the buffer when the stream ends, or the last batch of tokens might sit in the pending buffer until the next interval fires.

## The Scrollback Decision

Every TUI framework faces a choice: alternate screen or native scrollback?

**Alternate screen** (`\x1b[?1049h`) is what vim, htop, and most fullscreen TUIs use. The terminal switches to a separate buffer, your app draws everything, and when the app exits, the original terminal content is restored. The advantage: you control every pixel on screen. The disadvantage: the user loses access to their terminal's native scrolling, text selection, and search (Cmd+F).

**Native scrollback** means the app writes to the normal terminal buffer. Content scrolls up naturally. The user can scroll back with their mouse wheel, select text normally, and search with Cmd+F. The disadvantage: the app can't redraw content that has scrolled off screen. Once it's in scrollback, it belongs to the terminal.

For an AI agent, the choice matters more than for most applications. Agent conversations get long -- hundreds of messages, tool call outputs, code blocks. Users frequently need to scroll back to reference earlier output, copy code snippets, or search for something the agent said ten minutes ago.

Claude Code uses native scrollback (inline mode). Completed exchanges scroll up into the terminal's history. You can scroll back to the beginning of the conversation with your terminal's native scroll mechanism. This feels natural, but it means Claude Code can't go back and update earlier output -- no collapsing tool call results after the fact, no updating a progress bar in a previous message.

The approach I've landed on in Silvery is a three-zone model:

1. **Live screen**: The bottom of the terminal. React components render here normally. This is where the current streaming response and input prompt live.
2. **Dynamic scrollback**: Content above the screen that the app still tracks. Pre-rendered as strings, cheaply re-emittable. The app can update this zone by clearing and rewriting it.
3. **Static scrollback**: Content the app has released. The terminal owns it. The user can scroll to it, but the app can't modify it.

```tsx
import { ScrollbackView } from "silvery"

interface Exchange {
  id: string
  messages: Message[]
  status: "streaming" | "done"
}

function AgentUI({ exchanges }: { exchanges: Exchange[] }) {
  return (
    <ScrollbackView
      items={exchanges}
      keyExtractor={(e) => e.id}
      isFrozen={(e) => e.status === "done"}
      footer={<InputPrompt />}
    >
      {(exchange) => <ExchangeView exchange={exchange} />}
    </ScrollbackView>
  )
}
```

When an exchange finishes (`isFrozen` returns true), its React component unmounts and the rendered output becomes a static string in scrollback. The user scrolls through it with their terminal's native mechanism. Active exchanges stay mounted as live React components.

The tradeoff is real: rewriting dynamic scrollback requires clearing the terminal's scrollback buffer (`\x1b[3J`) and re-emitting everything the app still tracks. If you do this on every token while streaming, the user's scroll position jumps. In practice, batching these redraws to happen only when items transition (new exchange starts, tool call completes) avoids the problem.

## Tool Call Rendering

An AI agent's tool calls present a UI challenge: they start as a name and input, transition through a running state with potentially large output, and end with a result. Each phase needs different display treatment.

```tsx
import { Box, Text, Spinner, Badge, useContentRect } from "silvery"

interface ToolCall {
  name: string
  input: Record<string, unknown>
  output: string
  status: "running" | "done" | "error"
}

function ToolCallView({ tool }: { tool: ToolCall }) {
  const { width } = useContentRect()
  const maxOutputLines = 10
  const outputLines = tool.output.split("\n")
  const truncated = outputLines.length > maxOutputLines
  const displayed = truncated ? outputLines.slice(-maxOutputLines).join("\n") : tool.output

  return (
    <Box flexDirection="column" borderStyle="single" borderColor="$muted" paddingX={1}>
      <Box>
        <Text bold color="$accent">
          {tool.name}
        </Text>
        <Text> </Text>
        {tool.status === "running" && <Spinner />}
        {tool.status === "done" && <Text color="$success">done</Text>}
        {tool.status === "error" && <Text color="$error">error</Text>}
      </Box>

      {tool.input.command && <Text color="$muted">$ {String(tool.input.command)}</Text>}

      {displayed && (
        <Box flexDirection="column">
          {truncated && <Text color="$muted">... {outputLines.length - maxOutputLines} lines above</Text>}
          <Text wrap="wrap">{displayed}</Text>
        </Box>
      )}
    </Box>
  )
}
```

The key decisions:

**Capping visible output.** Shell commands can produce megabytes of output. Showing the last N lines with a "lines above" indicator keeps the layout manageable. The full output is in the data model; only the display is truncated.

**Streaming output into a bounded region.** While a tool is running, its output grows. Keeping the display region bounded (last 10 lines) means the layout stays stable. The user sees a tail-like view of the running command. Once the tool completes and the exchange freezes into scrollback, the full output is preserved in the terminal's history.

**Status transitions.** A spinner while running, a status label when done. The Spinner component handles animation internally -- no manual frame counting or interval management.

## Multi-line Input and Paste

Most agent UIs need to handle pasted code blocks. The user copies a function from their editor and pastes it into the agent. Without proper handling, each line of the paste looks like a separate command.

Modern terminals solve this with bracketed paste mode (`\x1b[?2004h`). When active, pasted text is wrapped in special escape sequences that tell the application "this is a paste, not individual keystrokes." Silvery's `TextArea` handles this automatically:

```tsx
import { useState } from "react"
import { Box, TextArea } from "silvery"

function InputArea({ onSubmit }: { onSubmit: (text: string) => void }) {
  const [value, setValue] = useState("")

  return (
    <Box borderStyle="round" borderColor="$muted" paddingX={1}>
      <TextArea
        value={value}
        onChange={setValue}
        onSubmit={() => {
          if (value.trim()) {
            onSubmit(value)
            setValue("")
          }
        }}
        placeholder="Type a message... (Ctrl+Enter to send)"
        height={3}
      />
    </Box>
  )
}
```

The submit keybinding is a design choice: Enter-to-submit (Claude Code's approach) works well when most input is short natural language, while Ctrl+Enter-to-submit is more ergonomic when users frequently type multi-line code.

## Backpressure

This is the problem that doesn't show up in demos. A tool emits 50,000 lines of output. A recursive file search returns 10,000 results.

Three rules: don't block the event loop (chunk processing with `setTimeout` yields), don't allocate unboundedly (cap the buffer, drop old lines), and don't re-render on every line (batch updates on a timer, same as streaming tokens).

## What's Still Hard

**Knowing when the user has scrolled up.** No terminal protocol tells the application "the user is reading earlier output." The app can't pause auto-scroll or show a "new content below" indicator.

**Rich content in scrollback.** Once content enters terminal scrollback, it's plain text with ANSI codes. No collapsible sections, no expandable code blocks. OSC 8 hyperlinks work, but that's about it.

**Copy-paste fidelity.** Copying a code block from an agent response includes box-drawing characters and indentation whitespace. The terminal has no concept of "this region is a code block."

These are terminal-level constraints, not framework-level ones -- things to design around rather than problems to solve.
