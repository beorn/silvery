/**
 * Static Scrollback — Coding Agent Simulation
 *
 * Demonstrates the Static component for terminal scrollback preservation.
 * Completed exchanges (user prompt + agent response) are committed to
 * terminal scrollback via <Static>, while only the current/active exchange
 * stays in the dynamic render area.
 *
 * This mirrors how tools like Claude Code work: finished output scrolls up
 * into the terminal buffer and the live area shows only what's in progress.
 *
 * Controls:
 *   Enter - Advance to next step
 *   q     - Quit
 */

import React, { useState, useEffect, useCallback } from "react"
import { Box, Text, Static } from "../../src/index.js"
import { run, useInput, type Key } from "../../src/runtime/index.js"
import { ExampleBanner, type ExampleMeta } from "../_banner.js"

export const meta: ExampleMeta = {
  name: "Static Scrollback",
  description: "Coding agent with Static scrollback preservation",
  features: ["Static", "useInput", "streaming"],
}

// ============================================================================
// Types
// ============================================================================

interface ToolCall {
  tool: string
  args: string
  output: string[]
}

interface Exchange {
  id: number
  role: "user" | "agent"
  content: string
  toolCalls?: ToolCall[]
}

// ============================================================================
// Script
// ============================================================================

const SCRIPT: Exchange[] = [
  {
    id: 1,
    role: "user",
    content: "Fix the login bug in auth.ts",
  },
  {
    id: 2,
    role: "agent",
    content: "Let me look at the auth module.",
    toolCalls: [
      {
        tool: "Read",
        args: "src/auth.ts",
        output: [
          "export async function login(token: string) {",
          "  const decoded = jwt.decode(token)",
          "  if (decoded.exp < Date.now()) {",
          '    throw new Error("Token expired")',
          "  }",
          "  return decoded.user",
          "}",
        ],
      },
    ],
  },
  {
    id: 3,
    role: "agent",
    content: "Found it. The expiry check compares seconds to milliseconds. Fixing now.",
    toolCalls: [
      {
        tool: "Edit",
        args: "src/auth.ts",
        output: [
          "  const decoded = jwt.decode(token)",
          "- if (decoded.exp < Date.now()) {",
          '-   throw new Error("Token expired")',
          "+ if (decoded.exp < Date.now() / 1000) {",
          "+   return refreshToken(token)",
          "  }",
        ],
      },
    ],
  },
  {
    id: 4,
    role: "agent",
    content: "Running tests to verify the fix.",
    toolCalls: [
      {
        tool: "Bash",
        args: "bun test",
        output: [
          "auth.test.ts",
          "  \u2713 login with valid token",
          "  \u2713 login with expired token refreshes",
          "  \u2713 login with invalid token rejects",
          "",
          "3 passed",
        ],
      },
    ],
  },
  {
    id: 5,
    role: "agent",
    content:
      "Fixed! The bug was comparing jwt.exp (seconds since epoch) with Date.now() (milliseconds). Expired tokens now trigger a refresh instead of throwing.",
  },
]

// ============================================================================
// Components
// ============================================================================

function ToolCallBlock({ call }: { call: ToolCall }): JSX.Element {
  const isEdit = call.tool === "Edit"
  return (
    <Box flexDirection="column" marginLeft={2} marginTop={0} marginBottom={0}>
      <Text>
        <Text color="magenta" bold>
          {"  "}
          {call.tool}
        </Text>
        <Text dim>{" \u2014 "}</Text>
        <Text color="white">{call.args}</Text>
      </Text>
      <Box flexDirection="column" marginLeft={4} borderStyle="single" borderColor="gray" paddingX={1}>
        {call.output.map((line, i) => {
          if (isEdit && line.startsWith("+")) {
            return (
              <Text key={i} color="green">
                {line}
              </Text>
            )
          }
          if (isEdit && line.startsWith("-")) {
            return (
              <Text key={i} color="red">
                {line}
              </Text>
            )
          }
          return (
            <Text key={i} dim>
              {line}
            </Text>
          )
        })}
      </Box>
    </Box>
  )
}

function ExchangeView({ exchange }: { exchange: Exchange }): JSX.Element {
  const isUser = exchange.role === "user"

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box gap={1}>
        <Text bold color={isUser ? "cyan" : "green"}>
          {isUser ? "\u276f" : "\u2022"}
        </Text>
        <Text bold color={isUser ? "cyan" : "green"}>
          {isUser ? "User" : "Agent"}
        </Text>
      </Box>
      <Box marginLeft={2}>
        <Text wrap="wrap">{exchange.content}</Text>
      </Box>
      {exchange.toolCalls?.map((call, i) => (
        <ToolCallBlock key={i} call={call} />
      ))}
    </Box>
  )
}

function StreamingIndicator(): JSX.Element {
  const [dots, setDots] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => {
      setDots((d) => (d + 1) % 4)
    }, 300)
    return () => clearInterval(timer)
  }, [])

  return (
    <Box marginLeft={2} marginTop={0}>
      <Text color="yellow" italic>
        {"thinking" + ".".repeat(dots)}
      </Text>
    </Box>
  )
}

// ============================================================================
// Main App
// ============================================================================

function CodingAgent(): JSX.Element {
  const [completedItems, setCompletedItems] = useState<Exchange[]>([])
  const [currentStep, setCurrentStep] = useState(0)
  const [streaming, setStreaming] = useState(false)
  const [done, setDone] = useState(false)

  const advance = useCallback(() => {
    if (done) return
    if (streaming) return

    if (currentStep > 0) {
      // Move current exchange to completed (Static scrollback)
      const exchange = SCRIPT[currentStep - 1]
      if (exchange) {
        setCompletedItems((prev) => [...prev, exchange])
      }
    }

    if (currentStep < SCRIPT.length) {
      setStreaming(true)
      // Simulate a brief "thinking" delay before showing the step
      setTimeout(() => {
        setStreaming(false)
        setCurrentStep((s) => s + 1)
      }, 800)
    } else {
      setDone(true)
    }
  }, [currentStep, streaming, done])

  // Auto-advance on first mount
  useEffect(() => {
    advance()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useInput(
    useCallback(
      (input: string, key: Key) => {
        if (input === "q" || key.escape) return "exit"
        if (key.return) advance()
      },
      [advance],
    ),
  )

  const currentExchange = currentStep > 0 ? SCRIPT[currentStep - 1] : null

  return (
    <Box flexDirection="column" flexGrow={1}>
      {/* Completed exchanges — committed to terminal scrollback */}
      <Static items={completedItems}>
        {(item, index) => (
          <Box key={item.id} flexDirection="column">
            {index === 0 && <Text dim>{"─".repeat(60)}</Text>}
            <ExchangeView exchange={item} />
            <Text dim>{"─".repeat(60)}</Text>
          </Box>
        )}
      </Static>

      {/* Dynamic area — only the current/active exchange */}
      <Box flexDirection="column" flexGrow={1}>
        {streaming && <StreamingIndicator />}
        {!streaming && currentExchange && (
          <Box flexDirection="column">
            <ExchangeView exchange={currentExchange} />
          </Box>
        )}
        {done && (
          <Box flexDirection="column" marginTop={1}>
            <Text color="green" bold>
              Session complete.
            </Text>
          </Box>
        )}

        {/* Status bar */}
        <Box marginTop={1} paddingX={1} justifyContent="space-between">
          <Text dim>
            Step {Math.min(currentStep, SCRIPT.length)}/{SCRIPT.length}
          </Text>
          <Text dim>
            {done ? (
              <Text>
                <Text bold dim>
                  q
                </Text>
                {" quit"}
              </Text>
            ) : (
              <Text>
                <Text bold dim>
                  Enter
                </Text>
                {" next step  "}
                <Text bold dim>
                  q
                </Text>
                {" quit"}
              </Text>
            )}
          </Text>
        </Box>
      </Box>
    </Box>
  )
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  const handle = await run(
    <ExampleBanner meta={meta} controls="Enter next step  q quit">
      <CodingAgent />
    </ExampleBanner>,
  )
  await handle.waitUntilExit()
}

if (import.meta.main) {
  main().catch(console.error)
}
