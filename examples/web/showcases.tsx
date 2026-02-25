/**
 * Browser-Ready Showcase Components for inkx Live Demos
 *
 * Interactive components rendered via renderToXterm() in xterm.js iframes
 * on the VitePress docs site. Keyboard input via emitInput() event bus.
 */

import React, { useState, useEffect, useRef } from "react"
import { Box, Text, useContentRect } from "../../src/xterm/index.js"

// ============================================================================
// Input Event Bus
// ============================================================================

interface KeyInfo {
  upArrow: boolean
  downArrow: boolean
  leftArrow: boolean
  rightArrow: boolean
  return: boolean
  escape: boolean
  tab: boolean
  backspace: boolean
}

type InputHandler = (input: string, key: KeyInfo) => void

const inputListeners = new Set<InputHandler>()

/** Called from showcase-app.tsx via term.onData() */
export function emitInput(data: string): void {
  const key: KeyInfo = {
    upArrow: data === "\x1b[A",
    downArrow: data === "\x1b[B",
    rightArrow: data === "\x1b[C",
    leftArrow: data === "\x1b[D",
    return: data === "\r",
    escape: data === "\x1b",
    tab: data === "\t",
    backspace: data === "\x7f" || data === "\b",
  }
  const input = data.length === 1 && data >= " " ? data : ""
  for (const cb of inputListeners) cb(input, key)
}

/** Subscribe to keyboard input */
function useInput(handler: InputHandler): void {
  const ref = useRef(handler)
  ref.current = handler
  useEffect(() => {
    const cb: InputHandler = (i, k) => ref.current(i, k)
    inputListeners.add(cb)
    return () => {
      inputListeners.delete(cb)
    }
  }, [])
}

// ============================================================================
// Focus State — tracks whether the xterm terminal has focus
// ============================================================================

let _termFocused = false
const focusListeners = new Set<(focused: boolean) => void>()

/** Called from viewer-app.tsx when xterm gains/loses focus */
export function setTermFocused(focused: boolean): void {
  _termFocused = focused
  for (const cb of focusListeners) cb(focused)
}

/** Hook: subscribe to terminal focus state */
function useTermFocused(): boolean {
  const [focused, setFocused] = useState(_termFocused)
  useEffect(() => {
    const cb = (f: boolean) => setFocused(f)
    focusListeners.add(cb)
    return () => {
      focusListeners.delete(cb)
    }
  }, [])
  return focused
}

// ============================================================================
// KeyHints — bottom bar showing available keys
// ============================================================================

function KeyHints({ hints }: { hints: string }): JSX.Element {
  return (
    <Box marginTop={1}>
      <Text color="#555">{hints}</Text>
    </Box>
  )
}

// ============================================================================
// 1. DashboardShowcase — btop-inspired system monitor
// ============================================================================

const SPARKLINE = "▁▂▃▄▅▆▇█"
const sparkChar = (v: number) => SPARKLINE[Math.min(7, Math.round((v / 100) * 7))]!
const gaugeColor = (v: number) => (v > 70 ? "#f38ba8" : v > 40 ? "#f9e2af" : "#a6e3a1")

function DashboardShowcase(): JSX.Element {
  const [tick, setTick] = useState(0)
  const [activePanel, setActivePanel] = useState(0)
  const [cpuHistory] = useState(() => Array.from({ length: 20 }, () => 20 + Math.floor(Math.random() * 40)))
  const [memHistory] = useState(() => Array.from({ length: 20 }, () => 40 + Math.floor(Math.random() * 30)))

  useEffect(() => {
    const id = setInterval(() => {
      setTick((t) => {
        const newT = t + 1
        cpuHistory.push(
          Math.max(5, Math.min(95, cpuHistory[cpuHistory.length - 1]! + Math.floor(Math.random() * 21) - 10)),
        )
        cpuHistory.shift()
        memHistory.push(
          Math.max(20, Math.min(90, memHistory[memHistory.length - 1]! + Math.floor(Math.random() * 11) - 5)),
        )
        memHistory.shift()
        return newT
      })
    }, 1200)
    return () => clearInterval(id)
  }, [])

  useInput((_input, key) => {
    if (key.leftArrow) setActivePanel((p) => Math.max(0, p - 1))
    if (key.rightArrow) setActivePanel((p) => Math.min(2, p + 1))
  })

  const cpu = cpuHistory[cpuHistory.length - 1]!
  const mem = memHistory[memHistory.length - 1]!

  const cores = [
    { label: "C0", value: Math.max(5, cpu + ((tick * 3) % 15) - 7) },
    { label: "C1", value: Math.max(5, cpu - ((tick * 5) % 20) + 5) },
    { label: "C2", value: Math.max(5, cpu + ((tick * 2) % 18) - 3) },
    { label: "C3", value: Math.max(5, cpu - ((tick * 4) % 12) + 2) },
  ].map((c) => ({ ...c, value: Math.min(99, c.value) }))

  const services = [
    { name: "api-gateway", status: "up" as const, uptime: "14d 6h", latency: "12ms" },
    { name: "auth-service", status: "up" as const, uptime: "14d 6h", latency: "8ms" },
    { name: "worker-pool", status: "warn" as const, uptime: "2h 15m", latency: "245ms" },
    { name: "cache-redis", status: "up" as const, uptime: "7d 3h", latency: "2ms" },
    { name: "mail-service", status: "down" as const, uptime: "0m", latency: "—" },
  ]

  const statusIcon = (s: "up" | "warn" | "down") => (s === "up" ? "●" : s === "warn" ? "▲" : "✕")
  const statusColor = (s: "up" | "warn" | "down") => (s === "up" ? "#a6e3a1" : s === "warn" ? "#f9e2af" : "#f38ba8")

  const allEvents = [
    { tag: "DEPLOY", color: "#a6e3a1", time: "14:23:01", msg: "v2.4.1 completed" },
    { tag: "ALERT", color: "#f9e2af", time: "14:23:15", msg: "Auth service restarted" },
    { tag: "BACKUP", color: "#89b4fa", time: "14:23:30", msg: "Finished (12.4 GB)" },
    { tag: "CERT", color: "#94e2d5", time: "14:23:45", msg: "SSL renewed (90d)" },
    { tag: "CACHE", color: "#cba6f7", time: "14:24:01", msg: "Purged successfully" },
    { tag: "DB", color: "#89b4fa", time: "14:24:12", msg: "Migration v38 applied" },
    { tag: "SCALE", color: "#a6e3a1", time: "14:24:30", msg: "Workers → 8" },
    { tag: "HEALTH", color: "#a6e3a1", time: "14:24:45", msg: "All services green" },
  ]
  const eventOffset = tick % 4
  const visibleEvents = allEvents.slice(eventOffset, eventOffset + 4)

  return (
    <Box flexDirection="column" padding={1}>
      {/* Header */}
      <Box marginBottom={1}>
        <Text color="#a6e3a1">● </Text>
        <Text bold color="#cdd6f4">
          System Monitor
        </Text>
        <Text color="#6c7086">
          {" "}
          — {cores.length} cores, {services.length} services
        </Text>
      </Box>

      {/* Top row: Metrics + Services */}
      <Box flexDirection="row" gap={1}>
        {/* Metrics panel */}
        <Box
          flexDirection="column"
          flexGrow={1}
          borderStyle="round"
          borderColor={activePanel === 0 ? "#89b4fa" : "#45475a"}
          paddingX={1}
        >
          <Box marginBottom={1}>
            <Text bold color={activePanel === 0 ? "#89b4fa" : "#a6adc8"}>
              CPU / Memory
            </Text>
          </Box>
          {/* Sparkline graphs */}
          <Box flexDirection="row" gap={1} marginBottom={1}>
            <Box width={5}>
              <Text color="#6c7086">CPU</Text>
            </Box>
            <Text>
              {cpuHistory.map((v, i) => (
                <Text key={i} color={gaugeColor(v)}>
                  {sparkChar(v)}
                </Text>
              ))}
            </Text>
            <Text bold color={gaugeColor(cpu)}>
              {" "}
              {String(cpu).padStart(2)}%
            </Text>
          </Box>
          <Box flexDirection="row" gap={1} marginBottom={1}>
            <Box width={5}>
              <Text color="#6c7086">MEM</Text>
            </Box>
            <Text>
              {memHistory.map((v, i) => (
                <Text key={i} color={gaugeColor(v)}>
                  {sparkChar(v)}
                </Text>
              ))}
            </Text>
            <Text bold color={gaugeColor(mem)}>
              {" "}
              {String(mem).padStart(2)}%
            </Text>
          </Box>
          {/* Per-core mini bars */}
          {cores.map((c) => {
            const blocks = Math.round((c.value / 100) * 12)
            return (
              <Box key={c.label} flexDirection="row" gap={1}>
                <Box width={5}>
                  <Text color="#6c7086">{c.label}</Text>
                </Box>
                <Text>
                  <Text color={gaugeColor(c.value)}>{"█".repeat(blocks)}</Text>
                  <Text color="#313244">{"░".repeat(12 - blocks)}</Text>
                </Text>
                <Text bold color={gaugeColor(c.value)}>
                  {" "}
                  {String(c.value).padStart(2)}%
                </Text>
              </Box>
            )
          })}
        </Box>

        {/* Services panel */}
        <Box
          flexDirection="column"
          flexGrow={1}
          borderStyle="round"
          borderColor={activePanel === 1 ? "#89b4fa" : "#45475a"}
          paddingX={1}
        >
          <Box marginBottom={1}>
            <Text bold color={activePanel === 1 ? "#89b4fa" : "#a6adc8"}>
              Services
            </Text>
          </Box>
          {services.map((s) => (
            <Box key={s.name} flexDirection="row" justifyContent="space-between" marginBottom={0}>
              <Text>
                <Text color={statusColor(s.status)}>{statusIcon(s.status)} </Text>
                <Text color={s.status === "down" ? "#6c7086" : "#cdd6f4"}>{s.name}</Text>
              </Text>
              <Text>
                <Text color="#6c7086">{s.latency} </Text>
                <Text dim color="#585b70">
                  {s.uptime}
                </Text>
              </Text>
            </Box>
          ))}
        </Box>
      </Box>

      {/* Bottom row: Events */}
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={activePanel === 2 ? "#89b4fa" : "#45475a"}
        paddingX={1}
        marginTop={1}
      >
        <Box marginBottom={1}>
          <Text bold color={activePanel === 2 ? "#89b4fa" : "#a6adc8"}>
            Events
          </Text>
        </Box>
        {visibleEvents.map((e, i) => (
          <Box key={i} flexDirection="row" gap={1}>
            <Text dim color="#585b70">
              {e.time}
            </Text>
            <Box width={8}>
              <Text color={e.color} bold>
                [{e.tag}]
              </Text>
            </Box>
            <Text color={i === 0 ? "#cdd6f4" : "#a6adc8"}>{e.msg}</Text>
          </Box>
        ))}
      </Box>

      <KeyHints hints="←→ panels" />
    </Box>
  )
}

// ============================================================================
// 2. CodingAgentShowcase — interactive coding agent demo
// ============================================================================

interface ToolCall {
  tool: string
  label: string
  lines?: string[]
  diff?: { del: string; add: string }[]
}

interface Exchange {
  prompt: string
  text: string
  tools: ToolCall[]
}

/** Pool of random exchanges the agent can produce */
const EXCHANGE_POOL: Exchange[] = [
  {
    prompt: "Fix the login bug — expired tokens return null",
    text: "Fixed! Expired tokens now refresh instead of returning null. All 3 auth tests pass.",
    tools: [
      {
        tool: "Read",
        label: "src/auth.ts",
        lines: [
          "47│ export async function validateToken(token: Token) {",
          "48│   if (token.expired) return null  // ← bug",
          "49│   return token",
          "50│ }",
        ],
      },
      {
        tool: "Edit",
        label: "src/auth.ts",
        diff: [{ del: "  if (token.expired) return null", add: "  if (token.expired) return refreshToken(token)" }],
      },
      {
        tool: "Bash",
        label: "bun test auth",
        lines: ["✓ validates active tokens", "✓ refreshes expired tokens", "✓ rejects revoked tokens", "3 passed"],
      },
    ],
  },
  {
    prompt: "Add rate limiting to the API endpoints",
    text: "Done. Added sliding window rate limiter — 100 req/min per IP with Redis backing.",
    tools: [
      {
        tool: "Read",
        label: "src/middleware/index.ts",
        lines: [
          " 1│ import express from 'express'",
          " 2│ import cors from 'cors'",
          " 3│ // No rate limiting configured",
          " 4│ export const app = express()",
        ],
      },
      {
        tool: "Write",
        label: "src/middleware/rate-limit.ts",
        lines: [
          " 1│ import { RateLimiterRedis } from 'rate-limiter-flexible'",
          " 2│ import { redis } from '../db/redis.js'",
          " 3│",
          " 4│ const limiter = new RateLimiterRedis({",
          " 5│   storeClient: redis,",
          " 6│   keyPrefix: 'rl',",
          " 7│   points: 100,       // requests",
          " 8│   duration: 60,      // per 60 seconds",
          " 9│   blockDuration: 60, // block for 60s when exceeded",
          "10│ })",
          "11│",
          "12│ export async function rateLimit(req, res, next) {",
          "13│   try {",
          "14│     await limiter.consume(req.ip)",
          "15│     next()",
          "16│   } catch {",
          "17│     res.status(429).json({ error: 'Too many requests' })",
          "18│   }",
          "19│ }",
        ],
      },
      {
        tool: "Edit",
        label: "src/middleware/index.ts",
        diff: [
          { del: "// No rate limiting configured", add: "import { rateLimit } from './rate-limit.js'" },
          { del: "export const app = express()", add: "export const app = express()\napp.use(rateLimit)" },
        ],
      },
      {
        tool: "Bash",
        label: "bun test middleware",
        lines: [
          "✓ allows requests under limit",
          "✓ blocks after 100 req/min",
          "✓ resets after window expires",
          "✓ returns 429 with JSON body",
          "4 passed",
        ],
      },
    ],
  },
  {
    prompt: "Refactor the user service to use dependency injection",
    text: "Refactored. UserService now accepts dependencies via constructor — easy to test with mocks.",
    tools: [
      {
        tool: "Read",
        label: "src/services/user.ts",
        lines: [
          " 1│ import { db } from '../db/connection.js'",
          " 2│ import { mailer } from '../email/mailer.js'",
          " 3│ import { logger } from '../utils/logger.js'",
          " 4│",
          " 5│ export async function createUser(data: UserInput) {",
          " 6│   const user = await db.users.create(data)",
          " 7│   await mailer.sendWelcome(user.email)",
          " 8│   logger.info('User created', { id: user.id })",
          " 9│   return user",
          "10│ }",
          "11│",
          "12│ export async function getUser(id: string) {",
          "13│   return db.users.findById(id)",
          "14│ }",
        ],
      },
      {
        tool: "Edit",
        label: "src/services/user.ts",
        diff: [
          { del: "import { db } from '../db/connection.js'", add: "interface UserServiceDeps {" },
          { del: "import { mailer } from '../email/mailer.js'", add: "  db: Database; mailer: Mailer; logger: Logger" },
          {
            del: "export async function createUser(data: UserInput) {",
            add: "export function createUserService(deps: UserServiceDeps) {",
          },
        ],
      },
      {
        tool: "Bash",
        label: "bun test services/user",
        lines: [
          "✓ creates user with valid data",
          "✓ sends welcome email",
          "✓ logs user creation",
          "✓ updates user email",
          "✓ returns null for missing user",
          "5 passed",
        ],
      },
    ],
  },
  {
    prompt: "What's causing the memory leak in the WebSocket handler?",
    text: "Found it — event listeners weren't being cleaned up on disconnect. Fixed with proper cleanup.",
    tools: [
      {
        tool: "Bash",
        label: "node --inspect src/ws.ts",
        lines: [
          "Heap snapshot: 142 MB (growing)",
          "Detached listeners: 847",
          "Top retainer: WSHandler → EventEmitter → Array(847)",
        ],
      },
      {
        tool: "Read",
        label: "src/ws/handler.ts",
        lines: [
          "23│ ws.on('message', (data) => {",
          "24│   events.on('broadcast', (msg) => ws.send(msg)) // ← leak!",
          "25│   processMessage(data)",
          "26│ })",
        ],
      },
      {
        tool: "Edit",
        label: "src/ws/handler.ts",
        diff: [
          { del: "ws.on('message', (data) => {", add: "const onBroadcast = (msg) => ws.send(msg)" },
          {
            del: "  events.on('broadcast', (msg) => ws.send(msg)) // ← leak!",
            add: "events.on('broadcast', onBroadcast)\nws.on('message', (data) => {",
          },
          { del: "})", add: "})\nws.on('close', () => events.off('broadcast', onBroadcast))" },
        ],
      },
      {
        tool: "Bash",
        label: "bun test ws --coverage",
        lines: [
          "✓ cleans up listeners on disconnect",
          "✓ heap stable after 1000 connections",
          "✓ broadcasts reach all clients",
          "3 passed  |  coverage: 94%",
        ],
      },
    ],
  },
]

let exchangeIdx = 0

function ToolCallBlock({ tc }: { tc: ToolCall }): JSX.Element {
  const iconColor =
    tc.tool === "Read" ? "#89b4fa" : tc.tool === "Edit" ? "#f9e2af" : tc.tool === "Write" ? "#cba6f7" : "#a6e3a1"
  return (
    <Box flexDirection="column" marginLeft={2}>
      <Box borderStyle="round" borderColor="#45475a" flexDirection="column" paddingX={1}>
        <Text>
          <Text bold color={iconColor}>
            {tc.tool}
          </Text>
          <Text dim color="#6c7086">
            {" "}
            {tc.label}
          </Text>
        </Text>
        {tc.lines &&
          tc.lines.map((line, i) => (
            <Text key={i} color={line.startsWith("✓") ? "#a6e3a1" : "#a6adc8"}>
              {line}
            </Text>
          ))}
        {tc.diff &&
          tc.diff.map((d, i) => (
            <Box key={i} flexDirection="column">
              <Text color="#f38ba8">
                {"- "}
                {d.del}
              </Text>
              <Text color="#a6e3a1">
                {"+ "}
                {d.add}
              </Text>
            </Box>
          ))}
      </Box>
    </Box>
  )
}

/** One completed exchange (prompt + tools + summary) */
function ExchangeBlock({ ex, animatedTools }: { ex: Exchange; animatedTools: number }): JSX.Element {
  return (
    <Box flexDirection="column">
      <Box paddingX={1}>
        <Text color="#cba6f7" bold>
          {"❯ "}
        </Text>
        <Text color="#cdd6f4" wrap="wrap">
          {ex.prompt}
        </Text>
      </Box>
      {ex.tools.slice(0, animatedTools).map((tc, j) => (
        <ToolCallBlock key={j} tc={tc} />
      ))}
      {animatedTools > ex.tools.length && (
        <Box paddingX={1}>
          <Text color="#a6adc8" wrap="wrap">
            {ex.text}
          </Text>
        </Box>
      )}
    </Box>
  )
}

function CodingAgentShowcase(): JSX.Element {
  // Start with first exchange already complete
  const [exchanges, setExchanges] = useState<Exchange[]>([EXCHANGE_POOL[0]!])
  const [activeExchange, setActiveExchange] = useState<Exchange | null>(null)
  const [animatedTools, setAnimatedTools] = useState(0)
  const [cursorVisible, setCursorVisible] = useState(true)
  const [inputText, setInputText] = useState("")
  const termFocused = useTermFocused()

  // Blink cursor
  useEffect(() => {
    const id = setInterval(() => setCursorVisible((v) => !v), 530)
    return () => clearInterval(id)
  }, [])

  // Animate tool calls for active exchange
  useEffect(() => {
    if (!activeExchange) return
    const totalSteps = activeExchange.tools.length + 1 // tools + summary
    if (animatedTools >= totalSteps) {
      // Animation done — commit to history
      const done = activeExchange
      const timer = setTimeout(() => {
        setExchanges((prev) => [...prev, done])
        setActiveExchange(null)
        setAnimatedTools(0)
      }, 800)
      return () => clearTimeout(timer)
    }
    const delay = animatedTools === 0 ? 600 : 900
    const timer = setTimeout(() => setAnimatedTools((c) => c + 1), delay)
    return () => clearTimeout(timer)
  }, [activeExchange, animatedTools])

  // User types + Enter → start next exchange
  useInput((input, key) => {
    if (activeExchange) return // busy
    if (key.return && inputText.length > 0) {
      exchangeIdx = (exchangeIdx + 1) % EXCHANGE_POOL.length
      const next = EXCHANGE_POOL[exchangeIdx]!
      // Use user's typed text as prompt override
      setActiveExchange({ ...next, prompt: inputText })
      setAnimatedTools(0)
      setInputText("")
    } else if (key.backspace) {
      setInputText((t) => t.slice(0, -1))
    } else if (input && input >= " ") {
      setInputText((t) => t + input)
    }
  })

  const isAnimating = activeExchange !== null
  const spinChar = cursorVisible ? "⠋" : "⠙"

  // Show only the most recent exchanges — older ones "scroll off"
  // When animating, hide completed to make room for the active exchange
  const maxVisible = activeExchange ? 0 : 1
  const visibleExchanges = exchanges.slice(-maxVisible || undefined).slice(-1)
  const hiddenCount = exchanges.length - visibleExchanges.length

  return (
    <Box flexDirection="column" padding={1} overflow="hidden">
      {/* Header */}
      <Box flexDirection="row" gap={1}>
        <Text bold color="#cba6f7">
          ●
        </Text>
        <Text dim color="#585b70">
          ~/project
        </Text>
        {hiddenCount > 0 && (
          <Text dim color="#45475a">
            ↑ {hiddenCount} more
          </Text>
        )}
      </Box>

      {/* Visible exchange history */}
      <Box flexDirection="column" flexGrow={1} overflow="hidden">
        {visibleExchanges.map((ex, i) => (
          <ExchangeBlock
            key={exchanges.length - visibleExchanges.length + i}
            ex={ex}
            animatedTools={ex.tools.length + 1}
          />
        ))}

        {/* Active exchange (animating) */}
        {activeExchange && (
          <Box flexDirection="column">
            {visibleExchanges.length > 0 && (
              <Text dim color="#313244">
                {"─".repeat(60)}
              </Text>
            )}
            <ExchangeBlock ex={activeExchange} animatedTools={animatedTools} />
            {animatedTools <= activeExchange.tools.length && (
              <Box paddingX={1}>
                <Text color="#585b70">{spinChar} working...</Text>
              </Box>
            )}
          </Box>
        )}
      </Box>

      {/* Input */}
      <Box
        borderStyle="round"
        borderColor={isAnimating ? "#313244" : termFocused ? "#45475a" : "#313244"}
        paddingX={1}
        flexDirection="row"
      >
        <Text color="#cba6f7" bold>
          {"❯ "}
        </Text>
        <Text color={inputText ? "#cdd6f4" : "#585b70"} wrap="truncate">
          {inputText || (isAnimating ? "" : termFocused ? "type a prompt, then Enter..." : "click to focus")}
        </Text>
        <Text color="#89b4fa">{!isAnimating && termFocused && cursorVisible ? "▋" : " "}</Text>
      </Box>

      <KeyHints hints="type a prompt  Enter run" />
    </Box>
  )
}

// ============================================================================
// 3. KanbanShowcase — polished kanban board
// ============================================================================

interface KanbanCard {
  title: string
  tag: { name: string; color: string; bg: string }
}

interface KanbanColumn {
  title: string
  headerBg: string
  headerColor: string
  cards: KanbanCard[]
}

const KANBAN_DATA: KanbanColumn[] = [
  {
    title: "Todo",
    headerBg: "#302030",
    headerColor: "#f38ba8",
    cards: [
      { title: "Design landing page", tag: { name: "design", color: "#f9e2af", bg: "#303020" } },
      { title: "Write API docs", tag: { name: "docs", color: "#89b4fa", bg: "#1e2030" } },
      { title: "Set up monitoring", tag: { name: "devops", color: "#a6e3a1", bg: "#1e3020" } },
    ],
  },
  {
    title: "In Progress",
    headerBg: "#303020",
    headerColor: "#f9e2af",
    cards: [
      { title: "User authentication", tag: { name: "backend", color: "#cba6f7", bg: "#251e30" } },
      { title: "Dashboard redesign", tag: { name: "frontend", color: "#89dceb", bg: "#1e2530" } },
      { title: "Rate limiting", tag: { name: "backend", color: "#cba6f7", bg: "#251e30" } },
    ],
  },
  {
    title: "Done",
    headerBg: "#203020",
    headerColor: "#a6e3a1",
    cards: [
      { title: "Project setup", tag: { name: "devops", color: "#a6e3a1", bg: "#1e3020" } },
      { title: "CI/CD pipeline", tag: { name: "devops", color: "#a6e3a1", bg: "#1e3020" } },
      { title: "Initial wireframes", tag: { name: "design", color: "#f9e2af", bg: "#303020" } },
    ],
  },
]

function KanbanShowcase(): JSX.Element {
  const [col, setCol] = useState(1)
  const [card, setCard] = useState(0)

  useInput((_input, key) => {
    if (key.leftArrow) {
      setCol((c) => Math.max(0, c - 1))
      setCard(0)
    }
    if (key.rightArrow) {
      setCol((c) => Math.min(2, c + 1))
      setCard(0)
    }
    if (key.upArrow) setCard((c) => Math.max(0, c - 1))
    if (key.downArrow) {
      const maxCards = KANBAN_DATA[col]?.cards.length ?? 3
      setCard((c) => Math.min(maxCards - 1, c + 1))
    }
  })

  return (
    <Box flexDirection="column" padding={1}>
      <Box flexDirection="row" gap={1} flexGrow={1}>
        {KANBAN_DATA.map((column, colIdx) => {
          const isFocused = colIdx === col
          return (
            <Box
              key={column.title}
              flexDirection="column"
              flexGrow={1}
              borderStyle="round"
              borderColor={isFocused ? "#89b4fa" : "#313244"}
            >
              {/* Column header */}
              <Box paddingX={1} backgroundColor={column.headerBg}>
                <Text bold color={column.headerColor}>
                  {column.title}
                </Text>
                <Text color="#6c7086"> {column.cards.length}</Text>
              </Box>

              {/* Cards */}
              <Box flexDirection="column" paddingX={1} marginTop={1}>
                {column.cards.map((c, cardIdx) => {
                  const isSelected = colIdx === col && cardIdx === card
                  return (
                    <Box
                      key={c.title}
                      flexDirection="column"
                      marginBottom={1}
                      borderStyle="round"
                      borderColor={isSelected ? "#89dceb" : isFocused ? "#45475a" : "#313244"}
                      paddingX={1}
                    >
                      <Text color={isSelected ? "#cdd6f4" : isFocused ? "#a6adc8" : "#6c7086"} bold={isSelected}>
                        {isSelected && <Text color="#89dceb">▸ </Text>}
                        {c.title}
                      </Text>
                      <Box>
                        <Box backgroundColor={c.tag.bg} paddingX={0}>
                          <Text color={c.tag.color}> {c.tag.name} </Text>
                        </Box>
                      </Box>
                    </Box>
                  )
                })}
              </Box>
            </Box>
          )
        })}
      </Box>

      <KeyHints hints="←→ columns  ↑↓ cards" />
    </Box>
  )
}

// ============================================================================
// 4. CLIWizardShowcase — Clack-style wizard
// ============================================================================

interface WizardState {
  step: number
  cursor: number
  answers: string[]
}

const WIZARD_STEPS = [
  { label: "Project name", type: "text" as const, answer: "my-app" },
  {
    label: "Framework",
    type: "select" as const,
    options: ["Vanilla", "React", "Vue", "Svelte"],
    answer: "React",
    defaultCursor: 1,
  },
  {
    label: "TypeScript?",
    type: "select" as const,
    options: ["Yes", "No"],
    answer: "Yes",
    defaultCursor: 0,
  },
  {
    label: "Package manager",
    type: "select" as const,
    options: ["bun", "npm", "yarn", "pnpm"],
    answer: "bun",
    defaultCursor: 0,
  },
]

function CLIWizardShowcase(): JSX.Element {
  const [state, setState] = useState<WizardState>({
    step: 0,
    cursor: 0,
    answers: [],
  })
  const [done, setDone] = useState(false)

  useInput((_input, key) => {
    if (done) return
    const currentStep = WIZARD_STEPS[state.step]
    if (!currentStep) return

    if (currentStep.type === "select") {
      const opts = currentStep.options!
      if (key.upArrow) setState((s) => ({ ...s, cursor: Math.max(0, s.cursor - 1) }))
      if (key.downArrow) setState((s) => ({ ...s, cursor: Math.min(opts.length - 1, s.cursor + 1) }))
    }

    if (key.return) {
      const answer = currentStep.type === "select" ? currentStep.options![state.cursor]! : currentStep.answer
      const newAnswers = [...state.answers, answer]
      if (state.step + 1 >= WIZARD_STEPS.length) {
        setDone(true)
        setState({ step: state.step + 1, cursor: 0, answers: newAnswers })
      } else {
        const nextStep = WIZARD_STEPS[state.step + 1]!
        const nextCursor = nextStep.type === "select" ? (nextStep.defaultCursor ?? 0) : 0
        setState({ step: state.step + 1, cursor: nextCursor, answers: newAnswers })
      }
    }
  })

  return (
    <Box flexDirection="column" padding={1} paddingLeft={2}>
      <Text>
        <Text bold color="#cba6f7">
          ┌{" "}
        </Text>
        <Text bold color="#cdd6f4">
          create-app
        </Text>
      </Text>
      <Text color="#45475a">│</Text>

      {WIZARD_STEPS.map((ws, i) => {
        const isDone = i < state.step
        const isActive = i === state.step && !done
        const isPending = i > state.step

        if (isDone) {
          return (
            <React.Fragment key={ws.label}>
              <Text>
                <Text color="#a6e3a1">◆</Text>
                <Text color="#cdd6f4"> {ws.label}</Text>
                <Text color="#a6e3a1"> ✓</Text>
              </Text>
              <Text>
                <Text color="#45475a">│</Text>
                <Text color="#89b4fa"> {state.answers[i]}</Text>
              </Text>
              <Text color="#45475a">│</Text>
            </React.Fragment>
          )
        }

        if (isActive && ws.type === "text") {
          return (
            <React.Fragment key={ws.label}>
              <Text>
                <Text color="#89dceb">◆</Text>
                <Text bold color="#cdd6f4">
                  {" "}
                  {ws.label}
                </Text>
              </Text>
              <Text>
                <Text color="#45475a">│</Text>
                <Text color="#89dceb"> {ws.answer}</Text>
                <Text color="#89dceb">▋</Text>
              </Text>
              <Text color="#45475a">│</Text>
            </React.Fragment>
          )
        }

        if (isActive && ws.type === "select") {
          return (
            <React.Fragment key={ws.label}>
              <Text>
                <Text color="#89dceb">◆</Text>
                <Text bold color="#cdd6f4">
                  {" "}
                  {ws.label}
                </Text>
              </Text>
              {ws.options!.map((opt, oi) => (
                <Text key={opt}>
                  <Text color="#45475a">│</Text>
                  {"  "}
                  {oi === state.cursor ? <Text color="#89dceb">● {opt}</Text> : <Text color="#6c7086">○ {opt}</Text>}
                </Text>
              ))}
              <Text color="#45475a">│</Text>
            </React.Fragment>
          )
        }

        if (isPending) {
          return (
            <React.Fragment key={ws.label}>
              <Text>
                <Text color="#585b70">○</Text>
                <Text color="#585b70"> {ws.label}</Text>
              </Text>
              <Text color="#45475a">│</Text>
            </React.Fragment>
          )
        }

        return null
      })}

      {done ? (
        <>
          <Text>
            <Text color="#a6e3a1">◆</Text>
            <Text color="#a6e3a1" bold>
              {" "}
              Done!
            </Text>
          </Text>
          <Text color="#45475a">│</Text>
          {/* Summary box */}
          <Box flexDirection="column" marginLeft={1} borderStyle="round" borderColor="#313244" paddingX={1}>
            <Text color="#6c7086">
              Project: <Text color="#cdd6f4">my-app</Text>
            </Text>
            <Text color="#6c7086">
              Framework: <Text color="#cdd6f4">React</Text>
            </Text>
            <Text color="#6c7086">
              TypeScript:<Text color="#cdd6f4"> Yes</Text>
            </Text>
            <Text color="#6c7086">
              Manager: <Text color="#cdd6f4">bun</Text>
            </Text>
          </Box>
          <Text color="#45475a">│</Text>
          <Text>
            <Text color="#a6e3a1">└ </Text>
            <Text color="#cdd6f4">cd my-app && bun dev</Text>
          </Text>
        </>
      ) : (
        <Text color="#45475a">└</Text>
      )}

      <KeyHints hints="↑↓ select  Enter confirm" />
    </Box>
  )
}

// ============================================================================
// 5. DataExplorerShowcase — lazygit-inspired table
// ============================================================================

interface ProcessRow {
  id: string
  name: string
  status: "running" | "idle" | "stopped"
  cpu: number
  mem: string
}

const PROCESS_DATA: ProcessRow[] = [
  { id: "1024", name: "web-server", status: "running", cpu: 67, mem: "128 MB" },
  { id: "1025", name: "db-primary", status: "running", cpu: 54, mem: "512 MB" },
  { id: "1026", name: "api-gateway", status: "running", cpu: 48, mem: "192 MB" },
  { id: "1027", name: "worker-pool", status: "running", cpu: 35, mem: "96 MB" },
  { id: "1028", name: "cache-redis", status: "running", cpu: 22, mem: "256 MB" },
  { id: "1029", name: "metrics", status: "running", cpu: 18, mem: "64 MB" },
  { id: "1030", name: "log-shipper", status: "idle", cpu: 4, mem: "32 MB" },
  { id: "1031", name: "cron-sched", status: "idle", cpu: 1, mem: "16 MB" },
  { id: "1032", name: "backup-agent", status: "stopped", cpu: 0, mem: "0 MB" },
  { id: "1033", name: "mail-service", status: "stopped", cpu: 0, mem: "0 MB" },
]

function DataExplorerShowcase(): JSX.Element {
  const [tick, setTick] = useState(0)
  const [selectedRow, setSelectedRow] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 2000)
    return () => clearInterval(id)
  }, [])

  useInput((_input, key) => {
    if (key.upArrow) setSelectedRow((r) => Math.max(0, r - 1))
    if (key.downArrow) setSelectedRow((r) => Math.min(PROCESS_DATA.length - 1, r + 1))
  })

  const rows = PROCESS_DATA.map((row) => ({
    ...row,
    cpu: row.status === "running" ? Math.max(1, Math.min(99, row.cpu + ((tick * 7 + row.cpu) % 13) - 6)) : row.cpu,
  })).sort((a, b) => b.cpu - a.cpu)

  const statusIcon = (s: string) => (s === "running" ? "●" : s === "idle" ? "◐" : "○")
  const statusColor = (s: string) => (s === "running" ? "#a6e3a1" : s === "idle" ? "#f9e2af" : "#f38ba8")
  const cpuColor = (v: number) => (v > 50 ? "#f38ba8" : v > 20 ? "#f9e2af" : "#a6e3a1")

  const colW = { id: 6, name: 14, status: 3, cpu: 14, mem: 8 }

  return (
    <Box flexDirection="column" padding={1}>
      <Box flexDirection="row" justifyContent="space-between" marginBottom={1}>
        <Text>
          <Text bold color="#cdd6f4">
            Process Explorer
          </Text>
          <Text color="#6c7086"> — {rows.length} processes</Text>
        </Text>
        <Text color="#6c7086">
          sorted by{" "}
          <Text bold color="#89dceb">
            CPU ▼
          </Text>
        </Text>
      </Box>

      {/* Header */}
      <Box flexDirection="row" backgroundColor="#313244">
        <Box width={colW.id} paddingX={1}>
          <Text bold color="#a6adc8">
            PID
          </Text>
        </Box>
        <Box width={colW.name} paddingX={1}>
          <Text bold color="#a6adc8">
            Name
          </Text>
        </Box>
        <Box width={colW.status} paddingX={1}>
          <Text bold color="#a6adc8">
            S
          </Text>
        </Box>
        <Box width={colW.cpu} paddingX={1}>
          <Text bold color="#a6adc8">
            CPU%
          </Text>
        </Box>
        <Box width={colW.mem} paddingX={1}>
          <Text bold color="#a6adc8">
            Mem
          </Text>
        </Box>
      </Box>

      {/* Rows */}
      {rows.map((row, i) => {
        const isSelected = i === selectedRow
        const bgColor = isSelected ? "#2a2a5e" : i % 2 === 0 ? "#1a1a2e" : "#1e1e3e"
        const cpuBars = Math.round((row.cpu / 100) * 8)
        return (
          <Box key={row.id} flexDirection="row" backgroundColor={bgColor}>
            <Box width={colW.id} paddingX={1}>
              <Text color="#585b70">{row.id}</Text>
            </Box>
            <Box width={colW.name} paddingX={1}>
              <Text bold={isSelected} color={isSelected ? "#cdd6f4" : "#a6adc8"}>
                {row.name}
              </Text>
            </Box>
            <Box width={colW.status} paddingX={1}>
              <Text color={statusColor(row.status)}>{statusIcon(row.status)}</Text>
            </Box>
            <Box width={colW.cpu} paddingX={1}>
              <Text>
                <Text color={cpuColor(row.cpu)}>{"█".repeat(cpuBars)}</Text>
                <Text color="#313244">{"░".repeat(8 - cpuBars)}</Text>
                <Text bold color={cpuColor(row.cpu)}>
                  {" "}
                  {String(row.cpu).padStart(2)}
                </Text>
              </Text>
            </Box>
            <Box width={colW.mem} paddingX={1}>
              <Text color={isSelected ? "#cdd6f4" : "#6c7086"}>{row.mem}</Text>
            </Box>
          </Box>
        )
      })}

      <KeyHints hints="↑↓ select row" />
    </Box>
  )
}

// ============================================================================
// 6. DevToolsShowcase — tailspin-inspired log viewer
// ============================================================================

interface LogEntry {
  time: string
  level: "INFO" | "WARN" | "ERROR" | "DEBUG"
  message: string
}

const ALL_LOGS: LogEntry[] = [
  { time: "14:23:01", level: "INFO", message: "Server started on port 3000" },
  { time: "14:23:02", level: "INFO", message: 'Database connection to "primary" established' },
  { time: "14:23:05", level: "DEBUG", message: "Loading config from /etc/app/config.toml" },
  { time: "14:23:08", level: "WARN", message: "Cache miss ratio above threshold (42%)" },
  { time: "14:23:12", level: "ERROR", message: "Failed to connect to Redis: ECONNREFUSED at /var/run/redis.sock" },
  { time: "14:23:15", level: "INFO", message: 'Retry succeeded: Redis "default" connected' },
  { time: "14:23:18", level: "INFO", message: "Worker pool initialized (4 threads)" },
  { time: "14:23:22", level: "WARN", message: 'Deprecated API "v1" endpoint called by client' },
  { time: "14:23:25", level: "DEBUG", message: "GC pause: 12ms (minor collection)" },
  { time: "14:23:30", level: "ERROR", message: "Timeout: /api/analytics took 5200ms" },
  { time: "14:23:33", level: "INFO", message: "Health check: all services green" },
  { time: "14:23:38", level: "INFO", message: 'Request processed: 200 OK (23ms) for "/api/users"' },
]

const levelColors: Record<string, string> = {
  INFO: "#a6e3a1",
  WARN: "#f9e2af",
  ERROR: "#f38ba8",
  DEBUG: "#89b4fa",
}

const levelBg: Record<string, string> = {
  ERROR: "#302020",
  WARN: "#302a1a",
}

/** Render message with colored quoted strings and underlined paths */
function LogMessage({ text, query }: { text: string; query: string }): JSX.Element {
  // Split on quoted strings and paths
  const parts: JSX.Element[] = []
  const regex = /("(?:[^"\\]|\\.)*")|(\/([\w./-]+))/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = regex.exec(text)) !== null) {
    // Text before match
    if (match.index > lastIndex) {
      parts.push(
        <Text key={`t${lastIndex}`} color="#cdd6f4">
          {text.slice(lastIndex, match.index)}
        </Text>,
      )
    }
    if (match[1]) {
      // Quoted string — green
      parts.push(
        <Text key={`q${match.index}`} color="#a6e3a1">
          {match[1]}
        </Text>,
      )
    } else if (match[2]) {
      // Path — underline
      parts.push(
        <Text key={`p${match.index}`} color="#94e2d5" underline>
          {match[2]}
        </Text>,
      )
    }
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < text.length) {
    parts.push(
      <Text key={`e${lastIndex}`} color="#cdd6f4">
        {text.slice(lastIndex)}
      </Text>,
    )
  }

  // If there's an active query, we wrap matching segments with inverse
  if (query) {
    // Simple approach: highlight in the plain text segments
    const highlighted: JSX.Element[] = []
    for (const part of parts) {
      const props = part.props as { color?: string; underline?: boolean; children: string }
      const content = props.children
      if (typeof content !== "string") {
        highlighted.push(part)
        continue
      }
      const lc = content.toLowerCase()
      const qi = lc.indexOf(query)
      if (qi === -1) {
        highlighted.push(part)
      } else {
        const key = part.key as string
        highlighted.push(
          <Text key={key}>
            <Text color={props.color}>{content.slice(0, qi)}</Text>
            <Text inverse color="#f9e2af">
              {content.slice(qi, qi + query.length)}
            </Text>
            <Text color={props.color}>{content.slice(qi + query.length)}</Text>
          </Text>,
        )
      }
    }
    return <Text wrap="truncate">{highlighted}</Text>
  }

  return <Text wrap="truncate">{parts}</Text>
}

function DevToolsShowcase(): JSX.Element {
  const [typedQuery, setTypedQuery] = useState("")
  const [scrollOffset, setScrollOffset] = useState(0)

  useInput((input, key) => {
    if (input) {
      setTypedQuery((q) => q + input)
      setScrollOffset(0)
    }
    if (key.backspace) {
      setTypedQuery((q) => q.slice(0, -1))
      setScrollOffset(0)
    }
    if (key.escape) {
      setTypedQuery("")
      setScrollOffset(0)
    }
    if (key.upArrow) setScrollOffset((o) => Math.max(0, o - 1))
    if (key.downArrow) setScrollOffset((o) => o + 1)
  })

  const query = typedQuery.toLowerCase()
  const filtered = query
    ? ALL_LOGS.filter((l) => l.message.toLowerCase().includes(query) || l.level.toLowerCase().includes(query))
    : ALL_LOGS

  const maxVisible = 10
  const maxOffset = Math.max(0, filtered.length - maxVisible)
  const clampedOffset = Math.min(scrollOffset, maxOffset)
  const visibleLogs = filtered.slice(clampedOffset, clampedOffset + maxVisible)

  return (
    <Box flexDirection="column" padding={1}>
      <Box flexDirection="row" justifyContent="space-between" marginBottom={1}>
        <Text>
          <Text bold color="#cdd6f4">
            Log Viewer
          </Text>
          <Text color="#6c7086"> — {filtered.length} entries</Text>
        </Text>
      </Box>

      {/* Search box */}
      <Box
        flexDirection="row"
        borderStyle="round"
        borderColor={typedQuery ? "#f9e2af" : "#45475a"}
        paddingX={1}
        marginBottom={1}
      >
        <Text color="#89dceb">/ </Text>
        <Text color="#cdd6f4">{typedQuery}</Text>
        <Text color="#89dceb">▋</Text>
      </Box>

      {/* Log entries */}
      <Box flexDirection="column" flexGrow={1}>
        {visibleLogs.map((log, i) => (
          <Box key={clampedOffset + i} flexDirection="row" gap={1} backgroundColor={levelBg[log.level]}>
            <Text color="#94e2d5">{log.time}</Text>
            <Box width={7} backgroundColor={levelBg[log.level]}>
              <Text bold color={levelColors[log.level]}>
                {log.level.padEnd(5)}
              </Text>
            </Box>
            <LogMessage text={log.message} query={query} />
          </Box>
        ))}
      </Box>

      <KeyHints hints="type to filter  Esc clear  ↑↓ scroll" />
    </Box>
  )
}

// ============================================================================
// 7. ScrollShowcase
// ============================================================================

function ScrollShowcase(): JSX.Element {
  const [scrollPos, setScrollPos] = useState(0)

  useInput((_input, key) => {
    if (key.upArrow) setScrollPos((p) => Math.max(0, p - 1))
    if (key.downArrow) setScrollPos((p) => Math.min(20, p + 1))
  })

  const items = Array.from({ length: 30 }, (_, i) => `Item ${i + 1}`)
  const visible = items.slice(scrollPos, scrollPos + 10)

  return (
    <Box flexDirection="column" padding={1}>
      <Box flexDirection="column" borderStyle="single" borderColor="#444">
        {visible.map((item, i) => {
          const isHighlighted = i === 0
          return (
            <Box key={scrollPos + i} paddingX={1}>
              <Text bold={isHighlighted} color={isHighlighted ? "cyan" : "white"}>
                {item}
              </Text>
            </Box>
          )
        })}
      </Box>

      <KeyHints hints="↑↓ scroll" />
    </Box>
  )
}

// ============================================================================
// 8. LayoutFeedbackShowcase
// ============================================================================

function LayoutFeedbackShowcase(): JSX.Element {
  const { width, height } = useContentRect()

  return (
    <Box flexDirection="column" padding={1}>
      <Box
        flexDirection="column"
        borderStyle="single"
        borderColor="cyan"
        flexGrow={1}
        justifyContent="center"
        alignItems="center"
      >
        <Text>
          Width: {width} Height: {height}
        </Text>
      </Box>

      <KeyHints hints="resize browser to see dimensions change" />
    </Box>
  )
}

// ============================================================================
// 9. FocusShowcase
// ============================================================================

function FocusShowcase(): JSX.Element {
  const [focusedPanel, setFocusedPanel] = useState(0)

  useInput((_input, key) => {
    if (key.tab) {
      setFocusedPanel((p) => (p + 1) % 3)
    }
  })

  const labels = ["Panel A", "Panel B", "Panel C"]

  return (
    <Box flexDirection="column" padding={1}>
      <Box flexDirection="row" gap={1}>
        {labels.map((label, i) => {
          const isFocused = i === focusedPanel
          return (
            <Box
              key={label}
              flexDirection="column"
              flexGrow={1}
              borderStyle="single"
              borderColor={isFocused ? "cyan" : "#444"}
              paddingX={1}
              paddingY={1}
            >
              <Text bold color={isFocused ? "cyan" : "white"}>
                {label}
              </Text>
              <Text color={isFocused ? "cyan" : "#666"}>{isFocused ? "● focused" : "○"}</Text>
            </Box>
          )
        })}
      </Box>

      <KeyHints hints="Tab / Shift+Tab cycle panels" />
    </Box>
  )
}

// ============================================================================
// 10. TextInputShowcase
// ============================================================================

function TextInputShowcase(): JSX.Element {
  const [text, setText] = useState("")
  const termFocused = useTermFocused()

  useInput((input, key) => {
    if (input) {
      setText((t) => t + input)
    }
    if (key.backspace) {
      setText((t) => t.slice(0, -1))
    }
    if (key.escape) {
      setText("")
    }
  })

  return (
    <Box flexDirection="column" padding={1}>
      <Box flexDirection="row" borderStyle="single" borderColor={termFocused ? "#444" : "#313244"} paddingX={1}>
        <Text>&gt; </Text>
        <Text>{text}</Text>
        <Text color="cyan">{termFocused ? "▋" : " "}</Text>
      </Box>

      <Box marginTop={1} paddingX={1}>
        <Text color="#999">Echo: {text || "(empty)"}</Text>
      </Box>

      <KeyHints hints={termFocused ? "type text  Backspace delete  Esc clear" : "click to focus"} />
    </Box>
  )
}

// ============================================================================
// Exports
// ============================================================================

export const SHOWCASES: Record<string, () => JSX.Element> = {
  dashboard: DashboardShowcase,
  "coding-agent": CodingAgentShowcase,
  kanban: KanbanShowcase,
  "cli-wizard": CLIWizardShowcase,
  "dev-tools": DevToolsShowcase,
  "data-explorer": DataExplorerShowcase,
  scroll: ScrollShowcase,
  "layout-feedback": LayoutFeedbackShowcase,
  focus: FocusShowcase,
  "text-input": TextInputShowcase,
}
