/**
 * AI Chat UI Demo
 *
 * A scrollable chat interface demonstrating:
 * - VirtualList for efficient rendering of variable-height messages
 * - useContentRect() for responsive layout that adapts to terminal width
 * - TextInput for text entry with full readline shortcuts
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

import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  render,
  Box,
  Text,
  VirtualList,
  TextInput,
  useContentRect,
  useInput,
  useApp,
  createTerm,
  type Key,
} from "../../src/index.js";
import { ExampleBanner, type ExampleMeta } from "../_banner.js";

export const meta: ExampleMeta = {
  name: "AI Chat",
  description: "VirtualList chat with simulated streaming responses and TextInput",
  features: ["VirtualList", "useContentRect()", "TextInput", "variable-height items"],
};

// ============================================================================
// Types
// ============================================================================

interface Message {
  id: number;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: Date;
  streaming?: boolean;
}

// ============================================================================
// Mock AI Responses
// ============================================================================

const AI_RESPONSES = [
  "That's a great question! Let me think about it...\n\nThe key insight here is that terminal UIs can be just as rich and responsive as graphical interfaces. With proper layout feedback and virtual scrolling, we can handle thousands of items smoothly.",
  "I'd be happy to help with that. Here are a few things to consider:\n\n1. Layout feedback means components know their size during render\n2. Virtual scrolling only renders visible items\n3. Flexbox layouts adapt to terminal width automatically\n\nThis makes building complex UIs much more natural.",
  "Absolutely! silvery provides several key advantages over traditional terminal UI approaches:\n\n- Components know their dimensions via useContentRect()\n- VirtualList handles 10,000+ items efficiently\n- TextInput gives you full editing capabilities\n- React's component model makes composition easy\n\nThe result is a developer experience very close to web development.",
  "That's an interesting perspective. Terminal UIs have a certain elegance — they're fast, lightweight, and accessible over SSH.\n\nWith modern frameworks, we can bring the best of both worlds: rich interaction and visual design in a text-based environment.",
  "Here's a concrete example of what makes this special:\n\n```tsx\nfunction Chat() {\n  const { width } = useContentRect()\n  // width is available during render!\n  // No useEffect, no layout thrashing\n  const cols = width > 100 ? 3 : width > 60 ? 2 : 1\n  return <Grid columns={cols}>...</Grid>\n}\n```\n\nThe component adapts instantly to size changes.",
  "Great observation! The streaming effect you see in this chat is just setTimeout with progressive string slicing. But the underlying VirtualList handles the variable-height messages efficiently — each message can be any height and the viewport calculation adapts.",
];

// ============================================================================
// Components
// ============================================================================

function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function MessageBubble({ message, width }: { message: Message; width: number }): JSX.Element {
  const isUser = message.role === "user";
  const isSystem = message.role === "system";
  const maxContentWidth = Math.max(20, width - 4);

  if (isSystem) {
    return (
      <Box justifyContent="center" paddingX={2}>
        <Text dim italic>
          {message.content}
        </Text>
      </Box>
    );
  }

  return (
    <Box
      flexDirection="column"
      paddingX={1}
      marginBottom={1}
      alignItems={isUser ? "flex-end" : "flex-start"}
    >
      <Box gap={1}>
        <Text bold color={isUser ? "$primary" : "$success"}>
          {isUser ? "You" : "Assistant"}
        </Text>
        <Text color="$muted">{formatTime(message.timestamp)}</Text>
      </Box>
      <Box
        borderStyle="round"
        borderColor={isUser ? "$primary" : "$success"}
        paddingX={1}
        maxWidth={Math.min(maxContentWidth, 72)}
        flexDirection="column"
      >
        <Text wrap="wrap">
          {message.content}
          {message.streaming ? (
            <Text color="$warning" bold>
              {" "}
              _
            </Text>
          ) : (
            ""
          )}
        </Text>
      </Box>
    </Box>
  );
}

function Header(): JSX.Element {
  return (
    <Box borderStyle="single" borderColor="$primary" paddingX={2} justifyContent="space-between">
      <Text bold color="$primary">
        silvery AI Chat
      </Text>
      <Text color="$muted">Powered by VirtualList + useContentRect</Text>
    </Box>
  );
}

function StatusBar({ messageCount }: { messageCount: number }): JSX.Element {
  return (
    <Box paddingX={1} justifyContent="space-between">
      <Text color="$muted">{messageCount} messages</Text>
      <Text dim>
        <Text bold dim>
          Enter
        </Text>{" "}
        send{" "}
        <Text bold dim>
          Esc
        </Text>{" "}
        quit
      </Text>
    </Box>
  );
}

/** Separate component so useContentRect() reads the flexGrow container's actual height */
function MessageArea({
  messages,
  scrollIndex,
  width,
}: {
  messages: Message[];
  scrollIndex: number;
  width: number;
}): JSX.Element {
  const { height } = useContentRect();

  const estimateHeight = useCallback(
    (msg: Message) => {
      const contentWidth = Math.min(68, Math.max(16, width - 8));
      const lines = msg.content.split("\n");
      let totalLines = 0;
      for (const line of lines) {
        totalLines += Math.max(1, Math.ceil((line.length + 1) / contentWidth));
      }
      return totalLines + 4;
    },
    [width],
  );

  return (
    <VirtualList
      items={messages}
      height={height}
      itemHeight={estimateHeight}
      scrollTo={scrollIndex}
      overscan={3}
      renderItem={(msg) => <MessageBubble key={msg.id} message={msg} width={width} />}
    />
  );
}

// ============================================================================
// Main App
// ============================================================================

let nextId = 1;

function Chat(): JSX.Element {
  const { exit } = useApp();
  const { width } = useContentRect();
  const [messages, setMessages] = useState<Message[]>([
    {
      id: nextId++,
      role: "system",
      content: "Welcome to silvery AI Chat! Type a message and press Enter to chat.",
      timestamp: new Date(),
    },
  ]);
  const [inputValue, setInputValue] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [scrollIndex, setScrollIndex] = useState(0);
  const [inputActive, setInputActive] = useState(true);
  const streamingRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-scroll to latest message
  useEffect(() => {
    if (messages.length > 0) {
      setScrollIndex(messages.length - 1);
    }
  }, [messages.length]);

  // Simulate AI streaming response
  const simulateResponse = useCallback(
    (userMessage: string) => {
      const fullResponse = AI_RESPONSES[Math.floor(Math.random() * AI_RESPONSES.length)]!;
      const assistantId = nextId++;

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
      ]);
      setIsStreaming(true);

      // Stream characters progressively
      let charIndex = 0;
      const streamInterval = setInterval(() => {
        charIndex += 2 + Math.floor(Math.random() * 3);
        if (charIndex >= fullResponse.length) {
          charIndex = fullResponse.length;
          clearInterval(streamInterval);
          setIsStreaming(false);
          setInputActive(true);
        }
        const partial = fullResponse.slice(0, charIndex);
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
        );
      }, 30);

      streamingRef.current = streamInterval;
    },
    [setMessages],
  );

  const handleSubmit = useCallback(
    (value: string) => {
      const trimmed = value.trim();
      if (!trimmed || isStreaming) return;

      // Add user message
      setMessages((prev) => [
        ...prev,
        {
          id: nextId++,
          role: "user",
          content: trimmed,
          timestamp: new Date(),
        },
      ]);
      setInputValue("");
      setInputActive(false);

      // Simulate AI response after a brief delay
      setTimeout(() => simulateResponse(trimmed), 500);
    },
    [isStreaming, simulateResponse],
  );

  useInput((input: string, key: Key) => {
    if (
      key.escape ||
      (key.ctrl && input === "c") ||
      (input === "q" && inputActive && !inputValue)
    ) {
      if (streamingRef.current) clearInterval(streamingRef.current);
      exit();
    }
  });

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Box flexGrow={1} flexDirection="column">
        <MessageArea messages={messages} scrollIndex={scrollIndex} width={width} />
      </Box>

      <Box borderStyle="single" borderColor={isStreaming ? "$warning" : "$primary"} paddingX={1}>
        {isStreaming ? (
          <Text color="$warning" italic>
            Assistant is typing...
          </Text>
        ) : (
          <TextInput
            value={inputValue}
            onChange={setInputValue}
            onSubmit={handleSubmit}
            prompt={"> "}
            isActive={inputActive}
          />
        )}
      </Box>

      <StatusBar messageCount={messages.length} />
    </Box>
  );
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  using term = createTerm();
  const { waitUntilExit } = await render(
    <ExampleBanner meta={meta} controls="Type + Enter send  Esc quit">
      <Chat />
    </ExampleBanner>,
    term,
  );
  await waitUntilExit();
}

if (import.meta.main) {
  main().catch(console.error);
}
