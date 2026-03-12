/**
 * CodingAgentShowcase — interactive coding agent demo
 *
 * Simulates a Claude Code-style multi-turn conversation with streaming text,
 * thinking blocks, tool calls (Read/Edit/Bash/Grep), and token/cost tracking.
 */

import React, { useState, useEffect, useRef } from "react"
import { Box, Text, TextInput, Spinner, useInput } from "@silvery/term/xterm/index.ts"
import { useTermFocused } from "./shared.js"

// --- Types ---

interface AgentToolCall {
  tool: string
  args: string
  output: string[]
}

interface AgentExchange {
  id: number
  role: "user" | "agent"
  content: string
  thinking?: string
  toolCalls?: AgentToolCall[]
  tokens?: { input: number; output: number }
}

type AgentScriptEntry = Omit<AgentExchange, "id">

// --- Constants ---

const AGENT_MODEL = "claude-opus-4-6"
const AGENT_INPUT_COST_PER_M = 15
const AGENT_OUTPUT_COST_PER_M = 75
const AGENT_CONTEXT_WINDOW = 200_000

const AGENT_TOOL_COLORS: Record<string, string> = {
  Read: "$info",
  Edit: "$warning",
  Bash: "$error",
  Write: "$accent",
  Glob: "$muted",
  Grep: "$success",
}

// --- Script: realistic multi-turn coding conversation ---

const AGENT_SCRIPT: AgentScriptEntry[] = [
  {
    role: "user",
    content: "Fix the login bug in auth.ts — expired tokens throw instead of refreshing.",
    tokens: { input: 84, output: 0 },
  },
  {
    role: "agent",
    thinking:
      "The user reports expired tokens throw instead of refreshing. This is likely in the token validation flow. I should read auth.ts to see the current expiry check logic.",
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
    tokens: { input: 3694, output: 624 },
  },
  {
    role: "agent",
    thinking:
      "Found it — decoded.exp is in seconds (Unix timestamp) but Date.now() returns milliseconds. Every token appears expired. I need to divide Date.now() by 1000.",
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
    tokens: { input: 4312, output: 574 },
  },
  {
    role: "agent",
    content: "Running tests to verify the fix.",
    toolCalls: [
      {
        tool: "Bash",
        args: "bun test src/auth.test.ts",
        output: [
          "auth.test.ts",
          "  ✓ login with valid token (2ms)",
          "  ✓ login with expired token refreshes (3ms)",
          "  ✓ login with invalid token rejects (1ms)",
          "",
          "3 passed | 0 failed",
        ],
      },
    ],
    tokens: { input: 4978, output: 312 },
  },
  {
    role: "agent",
    content:
      "Fixed! The bug was comparing jwt.exp (seconds) with Date.now() (milliseconds). Expired tokens now refresh instead of throwing.",
    tokens: { input: 5202, output: 178 },
  },
  {
    role: "user",
    content: "Nice. Can you also add rate limiting to the login endpoint?",
    tokens: { input: 116, output: 0 },
  },
  {
    role: "agent",
    thinking:
      "The user wants rate limiting on login. Let me check if there's existing rate limiting infrastructure before building from scratch.",
    content: "I'll check what rate limiting infrastructure exists.",
    toolCalls: [
      {
        tool: "Grep",
        args: "rateLimit|rate-limit",
        output: ["src/middleware/rate-limit.ts", "src/config.ts"],
      },
      {
        tool: "Read",
        args: "src/middleware/rate-limit.ts",
        output: [
          "import { RateLimiter } from '@lib/rate-limit'",
          "",
          "export function createLimiter(opts: { window: number; max: number }) {",
          "  return new RateLimiter(opts)",
          "}",
        ],
      },
    ],
    tokens: { input: 6490, output: 846 },
  },
  {
    role: "agent",
    thinking:
      "Good — there's already a RateLimiter abstraction. I just need to create an instance with appropriate settings and wire it into the auth route.",
    content: "Good, there's already a rate limiter. I'll wire it into the auth route.",
    toolCalls: [
      {
        tool: "Edit",
        args: "src/routes/auth.ts",
        output: [
          "+ import { createLimiter } from '../middleware/rate-limit'",
          "+",
          "+ const loginLimiter = createLimiter({ window: 60_000, max: 5 })",
          "+",
          "  router.post('/login', async (req, res) => {",
          "+   const limited = await loginLimiter.check(req.ip)",
          "+   if (limited) return res.status(429).json({ error: 'Too many attempts' })",
          "    const { token } = req.body",
        ],
      },
    ],
    tokens: { input: 7782, output: 756 },
  },
  {
    role: "agent",
    content: "Running the full test suite.",
    toolCalls: [
      {
        tool: "Bash",
        args: "bun test",
        output: [
          "auth.test.ts ........... 3 passed",
          "rate-limit.test.ts ..... 5 passed",
          "routes/auth.test.ts .... 7 passed",
          "",
          "15 passed | 0 failed | 3 files",
        ],
      },
    ],
    tokens: { input: 8204, output: 334 },
  },
  {
    role: "agent",
    content:
      "Rate limiting added: 5 attempts per minute per IP on the login endpoint. All 15 tests pass.",
    tokens: { input: 8468, output: 156 },
  },
  {
    role: "user",
    content: "Add a health check endpoint at /health that returns the service version.",
    tokens: { input: 104, output: 0 },
  },
  {
    role: "agent",
    thinking:
      "Simple task — read the version from package.json and expose it on GET /health alongside uptime.",
    content: "Simple addition — reading package.json for the version, then adding the route.",
    toolCalls: [
      {
        tool: "Read",
        args: "package.json",
        output: ["{", '  "name": "auth-service",', '  "version": "2.4.1",', "  ...", "}"],
      },
      {
        tool: "Edit",
        args: "src/routes/health.ts",
        output: [
          "+ import { version } from '../../package.json'",
          "+",
          "+ router.get('/health', (req, res) => {",
          "+   res.json({ status: 'ok', version, uptime: process.uptime() })",
          "+ })",
        ],
      },
    ],
    tokens: { input: 21578, output: 468 },
  },
  {
    role: "agent",
    content: "Running final tests.",
    toolCalls: [
      {
        tool: "Bash",
        args: "bun test",
        output: [
          "auth.test.ts ........... 3 passed",
          "rate-limit.test.ts ..... 5 passed",
          "routes/auth.test.ts .... 7 passed",
          "routes/health.test.ts .. 2 passed",
          "",
          "17 passed | 0 failed | 4 files",
        ],
      },
    ],
    tokens: { input: 22046, output: 290 },
  },
  {
    role: "agent",
    content:
      "All done! Summary:\n• Fixed token expiry bug (seconds vs milliseconds)\n• Added rate limiting (5 req/min per IP)\n• Added /health endpoint (v2.4.1)\n\nAll 17 tests pass.",
    tokens: { input: 22468, output: 224 },
  },
]

// --- Token helpers ---

function agentFormatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

function agentFormatCost(inputTokens: number, outputTokens: number): string {
  const cost =
    (inputTokens * AGENT_INPUT_COST_PER_M + outputTokens * AGENT_OUTPUT_COST_PER_M) / 1_000_000
  if (cost < 0.01) return `$${cost.toFixed(4)}`
  return `$${cost.toFixed(2)}`
}

function agentComputeTokens(exchanges: AgentExchange[]): {
  input: number
  output: number
  currentContext: number
} {
  let input = 0
  let output = 0
  let currentContext = 0
  for (const ex of exchanges) {
    if (ex.tokens) {
      input += ex.tokens.input
      output += ex.tokens.output
      if (ex.tokens.input > currentContext) currentContext = ex.tokens.input
    }
  }
  return { input, output, currentContext }
}

// --- Streaming phases ---

type AgentStreamPhase = "thinking" | "streaming" | "tools" | "done"

// --- Spinner — uses @silvery/ui Spinner component ---

// --- Thinking block ---

function AgentThinkingBlock({ text, done }: { text: string; done: boolean }): JSX.Element {
  return (
    <Box flexDirection="column" paddingLeft={2}>
      <Text color="$muted" italic>
        {done ? (
          "▸ "
        ) : (
          <>
            <Spinner type="dots" />{" "}
          </>
        )}
        thinking...
      </Text>
      {!done && (
        <Text color="$muted" wrap="truncate">
          {"    "}
          {text}
        </Text>
      )}
    </Box>
  )
}

// --- Tool call block ---

function AgentToolCallBlock({
  call,
  phase,
}: {
  call: AgentToolCall
  phase: "pending" | "running" | "done"
}): JSX.Element {
  const color = AGENT_TOOL_COLORS[call.tool] ?? "$muted"

  return (
    <Box flexDirection="column">
      <Text>
        {phase === "running" ? (
          <>
            <Spinner type="dots" />{" "}
          </>
        ) : phase === "done" ? (
          <Text color="$success">{"✓ "}</Text>
        ) : (
          <Text color="$muted">{"○ "}</Text>
        )}
        <Text color={color} bold>
          ▸ {call.tool}
        </Text>{" "}
        <Text color="$accent">{call.args}</Text>
      </Text>
      {phase === "done" && (
        <Box
          flexDirection="column"
          borderStyle="single"
          borderColor={color}
          borderLeft
          borderRight={false}
          borderTop={false}
          borderBottom={false}
          paddingLeft={1}
          marginLeft={1}
        >
          {call.output.map((line, i) => {
            if (line.startsWith("+"))
              return (
                <Text key={i} color="$success">
                  {line}
                </Text>
              )
            if (line.startsWith("-"))
              return (
                <Text key={i} color="$error">
                  {line}
                </Text>
              )
            if (line.includes("✓"))
              return (
                <Text key={i} color="$success">
                  {line}
                </Text>
              )
            if (line.includes("passed"))
              return (
                <Text key={i} bold color="$success">
                  {line}
                </Text>
              )
            return (
              <Text key={i} color="$muted">
                {line}
              </Text>
            )
          })}
        </Box>
      )}
    </Box>
  )
}

// --- Streaming text (word-by-word) ---

function AgentStreamingText({
  fullText,
  revealFraction,
  showCursor,
}: {
  fullText: string
  revealFraction: number
  showCursor: boolean
}): JSX.Element {
  let text = fullText
  if (revealFraction < 1) {
    const words = fullText.split(/(\s+)/)
    const totalWords = words.filter((w) => w.trim()).length
    const revealWords = Math.ceil(totalWords * revealFraction)

    let wordCount = 0
    text = ""
    for (const word of words) {
      if (word.trim()) {
        wordCount++
        if (wordCount > revealWords) break
      }
      text += word
    }
  }

  // Split on newlines to render as separate lines (Text doesn't handle \n as line breaks)
  const lines = text.split("\n")
  return (
    <Box flexDirection="column">
      {lines.map((line, i) => (
        <Text key={i} wrap="wrap">
          {line}
          {showCursor && i === lines.length - 1 && <Text color="$info">{"▌"}</Text>}
        </Text>
      ))}
    </Box>
  )
}

// --- Context bar ---

function AgentContextBar({ currentContext }: { currentContext: number }): JSX.Element {
  const CTX_W = 12
  const ctxFrac = currentContext / AGENT_CONTEXT_WINDOW
  const ctxFilled = Math.round(Math.min(ctxFrac, 1) * CTX_W)
  const ctxPct = Math.round(ctxFrac * 100)
  const ctxColor = ctxPct > 80 ? "$error" : ctxPct > 50 ? "$warning" : "$info"
  return (
    <Text color="$muted">
      <Text color={ctxColor}>{"█".repeat(ctxFilled)}</Text>
      <Text color="$border">{"░".repeat(CTX_W - ctxFilled)}</Text>
      {"  "}
      {ctxPct}%
    </Text>
  )
}

// --- Exchange rendering ---

function AgentExchangeView({
  exchange,
  streamPhase,
  revealFraction,
  isLatest,
  cumTokens,
}: {
  exchange: AgentExchange
  streamPhase: AgentStreamPhase
  revealFraction: number
  isLatest: boolean
  cumTokens?: { input: number; output: number }
}): JSX.Element {
  const phase = isLatest ? streamPhase : "done"
  const fraction = isLatest ? revealFraction : 1
  const isUser = exchange.role === "user"

  if (isUser) {
    return (
      <Box paddingX={1}>
        <Text>
          <Text bold color="$primary">
            {"❯"}{" "}
          </Text>
          <Text wrap="wrap">{exchange.content}</Text>
        </Text>
      </Box>
    )
  }

  // Agent exchange
  const toolCalls = exchange.toolCalls ?? []
  const toolRevealCount = phase === "tools" || phase === "done" ? toolCalls.length : 0

  return (
    <Box flexDirection="column" paddingX={1}>
      {/* Thinking block */}
      {exchange.thinking && (phase === "thinking" || phase === "streaming") && (
        <AgentThinkingBlock text={exchange.thinking} done={phase !== "thinking"} />
      )}

      {/* Agent content */}
      {(phase === "streaming" || phase === "tools" || phase === "done") && (
        <Box flexDirection="column">
          <AgentStreamingText
            fullText={exchange.content}
            revealFraction={phase === "streaming" ? fraction : 1}
            showCursor={phase === "streaming" && fraction < 1}
          />
        </Box>
      )}

      {/* Tool calls */}
      {toolRevealCount > 0 && (
        <Box flexDirection="column" marginTop={0}>
          {toolCalls.map((call, i) => (
            <AgentToolCallBlock
              key={i}
              call={call}
              phase={phase === "done" ? "done" : i < toolRevealCount - 1 ? "done" : "running"}
            />
          ))}
        </Box>
      )}

      {/* Completion indicator + token stats (only for final summary exchanges) */}
      {phase === "done" && !exchange.toolCalls?.length && cumTokens && (
        <Box marginTop={0}>
          <Text color="$muted">
            {"  "}
            {agentFormatTokens(cumTokens.input)} in {"·"} {agentFormatTokens(cumTokens.output)} out{" "}
            {"·"} {agentFormatCost(cumTokens.input, cumTokens.output)}
          </Text>
        </Box>
      )}
    </Box>
  )
}

// --- Status bar ---

function AgentStatusBar({ exchanges }: { exchanges: AgentExchange[] }): JSX.Element {
  const cumulative = agentComputeTokens(exchanges)
  const cost = agentFormatCost(cumulative.input, cumulative.output)

  return (
    <Box flexDirection="row" justifyContent="space-between">
      <Text color="$muted">
        <Text color="$primary">{AGENT_MODEL}</Text>
        {"  "}
        {agentFormatTokens(cumulative.input)}/{agentFormatTokens(cumulative.output)} {"·"} {cost}
      </Text>
      <Text color="$muted">
        <AgentContextBar currentContext={cumulative.currentContext} />
      </Text>
    </Box>
  )
}

// --- Pre-populate initial exchanges (first bug fix turn) ---

function createInitialExchanges(): {
  exchanges: AgentExchange[]
  nextId: number
  scriptIdx: number
} {
  // Show the first complete turn: user request + agent reads + agent edits + agent tests + summary
  // That's AGENT_SCRIPT[0..4] (indices 0-4)
  const INITIAL_COUNT = 5
  const exchanges: AgentExchange[] = []
  for (let i = 0; i < INITIAL_COUNT && i < AGENT_SCRIPT.length; i++) {
    exchanges.push({ ...AGENT_SCRIPT[i]!, id: i })
  }
  return { exchanges, nextId: INITIAL_COUNT, scriptIdx: INITIAL_COUNT }
}

export function CodingAgentShowcase(): JSX.Element {
  const initial = createInitialExchanges()
  const [exchanges, setExchanges] = useState<AgentExchange[]>(initial.exchanges)
  const [inputText, setInputText] = useState("")
  const termFocused = useTermFocused()

  // Streaming state
  const [streamPhase, setStreamPhase] = useState<AgentStreamPhase>("done")
  const [revealFraction, setRevealFraction] = useState(1)
  const phaseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const revealTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const nextIdRef = useRef(initial.nextId)
  const scriptIdxRef = useRef(initial.scriptIdx)

  /** Cancel all streaming timers. */
  const cancelStreaming = () => {
    if (phaseTimerRef.current) {
      clearTimeout(phaseTimerRef.current)
      phaseTimerRef.current = null
    }
    if (revealTimerRef.current) {
      clearInterval(revealTimerRef.current)
      revealTimerRef.current = null
    }
  }

  /** Start streaming an exchange through its phases. */
  const startStreaming = (entry: AgentScriptEntry, id: number) => {
    cancelStreaming()
    const newExchange: AgentExchange = { ...entry, id }

    // User messages: instant
    if (entry.role === "user") {
      setExchanges((prev) => [...prev, newExchange])
      setStreamPhase("done")
      setRevealFraction(1)
      return
    }

    // Agent message: thinking -> streaming -> tools -> done
    setExchanges((prev) => [...prev, newExchange])

    if (entry.thinking) {
      setStreamPhase("thinking")
      setRevealFraction(0)
      phaseTimerRef.current = setTimeout(() => {
        setStreamPhase("streaming")
        let frac = 0
        revealTimerRef.current = setInterval(() => {
          frac += 0.06
          if (frac >= 1) {
            frac = 1
            if (revealTimerRef.current) clearInterval(revealTimerRef.current)
            if (entry.toolCalls?.length) {
              setStreamPhase("tools")
              phaseTimerRef.current = setTimeout(
                () => setStreamPhase("done"),
                800 * (entry.toolCalls?.length ?? 1),
              )
            } else {
              setStreamPhase("done")
            }
          }
          setRevealFraction(frac)
        }, 60)
      }, 1500)
    } else {
      setStreamPhase("streaming")
      let frac = 0
      revealTimerRef.current = setInterval(() => {
        frac += 0.08
        if (frac >= 1) {
          frac = 1
          if (revealTimerRef.current) clearInterval(revealTimerRef.current)
          if (entry.toolCalls?.length) {
            setStreamPhase("tools")
            phaseTimerRef.current = setTimeout(
              () => setStreamPhase("done"),
              800 * (entry.toolCalls?.length ?? 1),
            )
          } else {
            setStreamPhase("done")
          }
        }
        setRevealFraction(frac)
      }, 60)
    }
  }

  /** Advance to the next script entry. Returns true if there was something to advance. */
  const advance = () => {
    if (streamPhase !== "done") return false
    if (scriptIdxRef.current >= AGENT_SCRIPT.length) return false

    const entry = AGENT_SCRIPT[scriptIdxRef.current]!
    const id = nextIdRef.current++
    scriptIdxRef.current++
    startStreaming(entry, id)

    // Auto-chain: user entry -> immediately start following agent entry
    if (entry.role === "user" && scriptIdxRef.current < AGENT_SCRIPT.length) {
      const next = AGENT_SCRIPT[scriptIdxRef.current]!
      if (next.role === "agent") {
        const nextId = nextIdRef.current++
        scriptIdxRef.current++
        startStreaming(next, nextId)
      }
    }
    return true
  }

  // No auto-start — wait for user interaction (Enter or typed input)

  // Cleanup on unmount
  useEffect(() => {
    return () => cancelStreaming()
  }, [])

  // Handle submit from TextInput
  const handleSubmit = (text: string) => {
    if (streamPhase !== "done") {
      // Skip current streaming
      cancelStreaming()
      setStreamPhase("done")
      setRevealFraction(1)
      return
    }
    if (text.trim()) {
      // Submit user text as custom exchange, then advance to next agent response
      const id = nextIdRef.current++
      const userExchange: AgentExchange = {
        id,
        role: "user",
        content: text,
        tokens: { input: text.length * 4, output: 0 },
      }
      setExchanges((prev) => [...prev, userExchange])
      setInputText("")

      // Skip past user entries in script to find next agent entry
      while (
        scriptIdxRef.current < AGENT_SCRIPT.length &&
        AGENT_SCRIPT[scriptIdxRef.current]!.role === "user"
      ) {
        scriptIdxRef.current++
      }
      // Start the next agent entry
      setTimeout(() => advance(), 150)
    } else {
      advance()
    }
  }

  const isAnimating = streamPhase !== "done"

  // Cumulative token stats for the last agent exchange
  const cumTokens = agentComputeTokens(exchanges)

  return (
    <Box flexDirection="column" padding={1} overflow="hidden">
      {/* Exchange history — anchored to bottom, older content scrolls off top */}
      <Box flexDirection="column" flexGrow={1} overflow="hidden" justifyContent="flex-end">
        {/* Welcome text when no exchanges yet */}
        {exchanges.length === 0 && !isAnimating && (
          <Box flexDirection="column" paddingX={1} marginTop={1}>
            <Text color="$muted">Click to focus, then type a prompt and press Enter.</Text>
          </Box>
        )}

        {exchanges.map((ex, i) => {
          const isLatest = i === exchanges.length - 1

          return (
            <Box key={ex.id} flexDirection="column" marginTop={i > 0 ? 1 : 0}>
              <AgentExchangeView
                exchange={ex}
                streamPhase={streamPhase}
                revealFraction={revealFraction}
                isLatest={isLatest}
                cumTokens={
                  isLatest && streamPhase === "done"
                    ? { input: cumTokens.input, output: cumTokens.output }
                    : undefined
                }
              />
            </Box>
          )
        })}

        {/* Done indicator */}
        {scriptIdxRef.current >= AGENT_SCRIPT.length &&
          streamPhase === "done" &&
          exchanges.length > 0 && (
            <Box paddingX={1} marginTop={0}>
              <Text color="$success" bold>
                {"✔"} Session complete
              </Text>
            </Box>
          )}
      </Box>

      {/* Input — uses @silvery/ui TextInput with full readline support */}
      <TextInput
        value={inputText}
        onChange={setInputText}
        onSubmit={handleSubmit}
        prompt="❯ "
        promptColor="$primary"
        placeholder={termFocused ? "What should I work on next?" : "Click to focus"}
        isActive={termFocused && !isAnimating}
        borderStyle="round"
      />

      {/* Status bar */}
      <AgentStatusBar exchanges={exchanges} />
    </Box>
  )
}
