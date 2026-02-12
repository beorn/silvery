/**
 * AI Chat UI Demo
 *
 * A scrollable chat interface demonstrating:
 * - VirtualList for efficient rendering of variable-height messages
 * - useContentRect() for responsive layout that adapts to terminal width
 * - ReadlineInput for text entry with full readline shortcuts
 * - Simulated AI streaming responses (no actual API)
 * - Word-wrapped messages with usernames and timestamps
 *
 * Usage: bun run examples/ai-chat/index.tsx
 *
 * Controls:
 *   Type a message and press Enter to send
 *   j/k or Up/Down - Scroll through chat history
 *   q or Ctrl+C - Quit
 */

import React, { useState, useCallback, useEffect, useRef } from "react"
import {
  Box,
  Text,
  VirtualList,
  ReadlineInput,
  useContentRect,
} from "../../src/index.js"
import { run, useInput, type Key } from "../../src/runtime/index.js"

// ============================================================================
// Types
// ============================================================================

interface Message {
  id: number
  role: "user" | "assistant" | "system"
  content: string
  timestamp: Date
  streaming?: boolean
}

// ============================================================================
// Mock AI Responses
// ============================================================================

const AI_RESPONSES = [
  "That's a great question! Let me think about it...\n\nThe key insight here is that terminal UIs can be just as rich and responsive as graphical interfaces. With proper layout feedback and virtual scrolling, we can handle thousands of items smoothly.",
  "I'd be happy to help with that. Here are a few things to consider:\n\n1. Layout feedback means components know their size during render\n2. Virtual scrolling only renders visible items\n3. Flexbox layouts adapt to terminal width automatically\n\nThis makes building complex UIs much more natural.",
  "Absolutely! inkx provides several key advantages over traditional terminal UI approaches:\n\n- Components know their dimensions via useContentRect()\n- VirtualList handles 10,000+ items efficiently\n- ReadlineInput gives you full editing capabilities\n- React's component model makes composition easy\n\nThe result is a developer experience very close to web development.",
  "That's an interesting perspective. Terminal UIs have a certain elegance — they're fast, lightweight, and accessible over SSH.\n\nWith modern frameworks, we can bring the best of both worlds: rich interaction and visual design in a text-based environment.",
  "Here's a concrete example of what makes this special:\n\n```tsx\nfunction Chat() {\n  const { width } = useContentRect()\n  // width is available during render!\n  // No useEffect, no layout thrashing\n  const cols = width > 100 ? 3 : width > 60 ? 2 : 1\n  return <Grid columns={cols}>...</Grid>\n}\n```\n\nThe component adapts instantly to size changes.",
  "Great observation! The streaming effect you see in this chat is just setTimeout with progressive string slicing. But the underlying VirtualList handles the variable-height messages efficiently — each message can be any height and the viewport calculation adapts.",
]

// ============================================================================
// Components
// ============================================================================

function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
}

function MessageBubble({
  message,
  width,
}: {
  message: Message
  width: number
}): JSX.Element {
  const isUser = message.role === "user"
  const isSystem = message.role === "system"
  const maxContentWidth = Math.max(20, width - 4)

  if (isSystem) {
    return (
      <Box justifyContent="center" paddingX={2}>
        <Text dim italic>
          {message.content}
        </Text>
      </Box>
    )
  }

  return (
    <Box
      flexDirection="column"
      paddingX={1}
      marginBottom={1}
      alignItems={isUser ? "flex-end" : "flex-start"}
    >
      <Box gap={1}>
        <Text bold color={isUser ? "cyan" : "green"}>
          {isUser ? "You" : "Assistant"}
        </Text>
        <Text dim>{formatTime(message.timestamp)}</Text>
      </Box>
      <Box
        borderStyle="round"
        borderColor={isUser ? "cyan" : "green"}
        paddingX={1}
        maxWidth={Math.min(maxContentWidth, 72)}
        flexDirection="column"
      >
        <Text wrap="wrap">
          {message.content}
          {message.streaming ? (
            <Text color="yellow" bold>
              {" "}
              _
            </Text>
          ) : (
            ""
          )}
        </Text>
      </Box>
    </Box>
  )
}

function Header(): JSX.Element {
  return (
    <Box
      borderStyle="single"
      borderColor="magenta"
      paddingX={2}
      justifyContent="space-between"
    >
      <Text bold color="magenta">
        inkx AI Chat
      </Text>
      <Text dim>Powered by VirtualList + useContentRect</Text>
    </Box>
  )
}

function StatusBar({
  messageCount,
  width,
}: {
  messageCount: number
  width: number
}): JSX.Element {
  return (
    <Box paddingX={1} justifyContent="space-between">
      <Text dim>
        {messageCount} messages | Terminal width: {width}
      </Text>
      <Text dim>
        <Text bold dim>
          Enter
        </Text>{" "}
        send{" "}
        <Text bold dim>
          Ctrl+C
        </Text>{" "}
        quit
      </Text>
    </Box>
  )
}

// ============================================================================
// Main App
// ============================================================================

let nextId = 1

function Chat(): JSX.Element {
  const { width, height } = useContentRect()
  const [messages, setMessages] = useState<Message[]>([
    {
      id: nextId++,
      role: "system",
      content:
        "Welcome to inkx AI Chat! Type a message and press Enter to chat.",
      timestamp: new Date(),
    },
  ])
  const [inputValue, setInputValue] = useState("")
  const [isStreaming, setIsStreaming] = useState(false)
  const [scrollIndex, setScrollIndex] = useState(0)
  const [inputActive, setInputActive] = useState(true)
  const streamingRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Calculate available height for chat messages
  // Header (3) + input area (3) + status bar (1) + padding
  const chatHeight = Math.max(5, height - 8)

  // Estimate message heights for VirtualList
  const estimateHeight = useCallback(
    (msg: Message) => {
      const contentWidth = Math.min(68, Math.max(16, width - 8))
      const lines = msg.content.split("\n")
      let totalLines = 0
      for (const line of lines) {
        totalLines += Math.max(1, Math.ceil((line.length + 1) / contentWidth))
      }
      // +2 for username/timestamp line and border, +1 for marginBottom
      return totalLines + 4
    },
    [width],
  )

  // Auto-scroll to latest message
  useEffect(() => {
    if (messages.length > 0) {
      setScrollIndex(messages.length - 1)
    }
  }, [messages.length])

  // Simulate AI streaming response
  const simulateResponse = useCallback(
    (userMessage: string) => {
      const fullResponse =
        AI_RESPONSES[Math.floor(Math.random() * AI_RESPONSES.length)]!
      const assistantId = nextId++

      // Add empty assistant message
      setMessages((prev) => [
        ...prev,
        {
          id: assistantId,
          role: "assistant",
          content: "",
          timestamp: new Date(),
          streaming: true,
        },
      ])
      setIsStreaming(true)

      // Stream characters progressively
      let charIndex = 0
      const streamInterval = setInterval(() => {
        charIndex += 2 + Math.floor(Math.random() * 3)
        if (charIndex >= fullResponse.length) {
          charIndex = fullResponse.length
          clearInterval(streamInterval)
          setIsStreaming(false)
          setInputActive(true)
        }
        const partial = fullResponse.slice(0, charIndex)
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  content: partial,
                  streaming: charIndex < fullResponse.length,
                }
              : m,
          ),
        )
      }, 30)

      streamingRef.current = streamInterval
    },
    [setMessages],
  )

  const handleSubmit = useCallback(
    (value: string) => {
      const trimmed = value.trim()
      if (!trimmed || isStreaming) return

      // Add user message
      setMessages((prev) => [
        ...prev,
        {
          id: nextId++,
          role: "user",
          content: trimmed,
          timestamp: new Date(),
        },
      ])
      setInputValue("")
      setInputActive(false)

      // Simulate AI response after a brief delay
      setTimeout(() => simulateResponse(trimmed), 500)
    },
    [isStreaming, simulateResponse],
  )

  useInput(
    useCallback(
      (input: string, key: Key) => {
        if ((key.ctrl && input === "c") || (input === "q" && inputActive && !inputValue)) {
          if (streamingRef.current) clearInterval(streamingRef.current)
          return "exit"
        }
      },
      [inputActive, inputValue],
    ),
  )

  return (
    <Box flexDirection="column" width="100%" height="100%">
      <Header />

      <Box flexGrow={1} flexDirection="column">
        <VirtualList
          items={messages}
          height={chatHeight}
          itemHeight={estimateHeight}
          scrollTo={scrollIndex}
          overscan={3}
          renderItem={(msg, index) => (
            <MessageBubble key={msg.id} message={msg} width={width} />
          )}
        />
      </Box>

      <Box
        borderStyle="single"
        borderColor={isStreaming ? "yellow" : "cyan"}
        paddingX={1}
      >
        {isStreaming ? (
          <Text color="yellow" italic>
            Assistant is typing...
          </Text>
        ) : (
          <ReadlineInput
            value={inputValue}
            onChange={setInputValue}
            onSubmit={handleSubmit}
            prompt={"> "}
            isActive={inputActive}
          />
        )}
      </Box>

      <StatusBar messageCount={messages.length} width={width} />
    </Box>
  )
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  const handle = await run(<Chat />)
  await handle.waitUntilExit()
}

main().catch(console.error)
