/**
 * Static Scrollback — Coding Agent Simulation
 *
 * Demonstrates useScrollback + inline render mode for real terminal scrollback.
 * Completed exchanges are committed to stdout (real scrollback you can scroll
 * through after the app exits), while only the current/active exchange stays
 * in the dynamic render area.
 *
 * This mirrors how tools like Claude Code work: finished output scrolls up
 * into the terminal buffer and the live area shows only what's in progress.
 *
 * Controls:
 *   Enter - Advance to next step
 *   c     - Compact (clear dynamic area, scrollback remains)
 *   a     - Toggle auto-advance mode
 *   q     - Quit
 *
 * Flags:
 *   --auto    Start in auto-advance mode
 *   --stress  Generate 200 exchanges instead of scripted content
 */

import React, { useState, useEffect, useCallback, useRef } from "react"
import { render, renderStringSync, Box, Text, Link, useInput, useApp, createTerm, type Key } from "../../src/index.js"
import { useScrollback } from "../../src/hooks/useScrollback.js"
import type { ExampleMeta } from "../_banner.js"

export const meta: ExampleMeta = {
  name: "Static Scrollback",
  description: "Coding agent with useScrollback for real terminal scrollback",
  features: ["useScrollback()", "inline mode", "compaction"],
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
  role: "user" | "agent" | "system"
  content: string
  toolCalls?: ToolCall[]
  frozen: boolean
}

// ============================================================================
// Script — 20 exchanges telling a realistic coding agent story
// ============================================================================

const SCRIPT: Omit<Exchange, "id" | "frozen">[] = [
  {
    role: "user",
    content: "Fix the login bug in auth.ts — expired tokens throw instead of refreshing.",
  },
  {
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
    role: "agent",
    content:
      "Found it. The expiry check compares seconds (jwt.exp) to milliseconds (Date.now()). Fixing now.",
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
    role: "agent",
    content: "Running tests to verify the fix.",
    toolCalls: [
      {
        tool: "Bash",
        args: "bun test src/auth.test.ts",
        output: [
          "auth.test.ts",
          "  \u2713 login with valid token (2ms)",
          "  \u2713 login with expired token refreshes (3ms)",
          "  \u2713 login with invalid token rejects (1ms)",
          "",
          "3 passed | 0 failed",
        ],
      },
    ],
  },
  {
    role: "agent",
    content:
      "Fixed! The bug was comparing jwt.exp (seconds since epoch) with Date.now() (milliseconds). Expired tokens now trigger a refresh instead of throwing.",
  },
  {
    role: "user",
    content: "Nice. Can you also add rate limiting to the login endpoint?",
  },
  {
    role: "agent",
    content: "I'll check what rate limiting infrastructure exists.",
    toolCalls: [
      {
        tool: "Bash",
        args: "rg 'rateLimit|rate-limit' src/ --files-with-matches",
        output: ["src/middleware/rate-limit.ts", "src/config.ts", "See https://docs.example.com/api/rate-limiting for API docs"],
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
  },
  {
    role: "agent",
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
  },
  {
    role: "agent",
    content: "Rate limiting added: 5 attempts per minute per IP on the login endpoint. All 15 tests pass.",
  },
  {
    role: "system",
    content:
      "\ud83d\udce6 Compaction: clearing dynamic area. Scrollback preserved above \u2014 scroll up to review previous exchanges.",
  },
  {
    role: "agent",
    content:
      "Context recovered after compaction. I have the full conversation history. What would you like to work on next?",
  },
  {
    role: "user",
    content:
      "Now add i18n support for error messages. We need 日本語 (Japanese) and Deutsch (German). 🌍",
  },
  {
    role: "agent",
    content: "I'll create the translation files and update the error handling.",
    toolCalls: [
      {
        tool: "Write",
        args: "src/i18n/ja.json",
        output: [
          "{",
          '  "token_expired": "トークンの有効期限が切れました 🔧",',
          '  "rate_limited": "リクエストが多すぎます。後でもう一度お試しください",',
          '  "invalid_token": "無効なトークンです 🐛",',
          '  "login_success": "ログイン成功 ✅"',
          "}",
        ],
      },
      {
        tool: "Write",
        args: "src/i18n/de.json",
        output: [
          "{",
          '  "token_expired": "Token abgelaufen",',
          '  "rate_limited": "Zu viele Anfragen. Bitte versuchen Sie es sp\u00e4ter",',
          '  "invalid_token": "Ung\u00fcltiges Token",',
          '  "login_success": "Anmeldung erfolgreich"',
          "}",
        ],
      },
    ],
  },
  {
    role: "agent",
    content: "Now I'll create the i18n loader and wire it into the error responses.",
    toolCalls: [
      {
        tool: "Write",
        args: "src/i18n/index.ts",
        output: [
          "import ja from './ja.json'",
          "import de from './de.json'",
          "",
          "const locales = { ja, de, en: { /* defaults */ } }",
          "",
          "export function t(key: string, lang = 'en'): string {",
          "  return locales[lang]?.[key] ?? locales.en[key] ?? key",
          "}",
        ],
      },
      {
        tool: "Edit",
        args: "src/auth.ts",
        output: [
          "+ import { t } from './i18n'",
          "",
          "- return res.status(429).json({ error: 'Too many attempts' })",
          "+ return res.status(429).json({ error: t('rate_limited', req.lang) })",
        ],
      },
    ],
  },
  {
    role: "agent",
    content: "Running tests with locale coverage.",
    toolCalls: [
      {
        tool: "Bash",
        args: "bun test src/i18n/",
        output: [
          "i18n.test.ts",
          "  \u2713 English fallback for unknown key",
          "  \u2713 Japanese: \u30c8\u30fc\u30af\u30f3\u306e\u6709\u52b9\u671f\u9650\u304c\u5207\u308c\u307e\u3057\u305f \ud83d\udd27",
          "  \u2713 German: Token abgelaufen",
          "  \u2713 Emoji preserved in translations \ud83d\udc1b\u2705",
          "",
          "4 passed | 0 failed",
        ],
      },
    ],
  },
  {
    role: "agent",
    content:
      "i18n support added with Japanese (\u65e5\u672c\u8a9e) and German (Deutsch) translations. Error messages are now locale-aware. \ud83c\udf0d\u2705",
  },
  {
    role: "user",
    content: "Add a health check endpoint at /health that returns the service version.",
  },
  {
    role: "agent",
    content: "Simple addition \u2014 reading package.json for the version, then adding the route.",
    toolCalls: [
      {
        tool: "Read",
        args: "package.json",
        output: [
          "{",
          '  "name": "auth-service",',
          '  "version": "2.4.1",',
          "  ...",
          "}",
        ],
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
          "i18n.test.ts ........... 4 passed",
          "",
          "21 passed | 0 failed | 5 files",
        ],
      },
    ],
  },
  {
    role: "agent",
    content:
      "All done! Summary of changes:\n\u2022 Fixed token expiry bug (seconds vs milliseconds)\n\u2022 Added rate limiting (5 req/min per IP)\n\u2022 Added i18n support (\u65e5\u672c\u8a9e + Deutsch) \ud83c\udf0d\n\u2022 Added /health endpoint (v2.4.1)\n\nAll 21 tests pass. Ready to commit?",
  },
]

// ============================================================================
// Stress test script — 200 programmatically generated exchanges
// ============================================================================

function generateStressScript(): Omit<Exchange, "id" | "frozen">[] {
  const exchanges: Omit<Exchange, "id" | "frozen">[] = []
  const tools = ["Read", "Edit", "Bash", "Write"]
  const files = [
    "src/auth.ts",
    "src/db.ts",
    "src/routes/api.ts",
    "src/middleware/cors.ts",
    "src/utils/crypto.ts",
    "src/config.ts",
    "tests/integration.test.ts",
    "src/i18n/\u65e5\u672c\u8a9e.json",
  ]

  for (let i = 0; i < 200; i++) {
    if (i % 5 === 0) {
      // User message every 5th exchange
      const prompts = [
        `Fix bug #${100 + i} in ${files[i % files.length]}`,
        `Add feature: ${["caching", "logging", "retry", "batching", "\u30d0\u30ea\u30c7\u30fc\u30b7\u30e7\u30f3"][i % 5]}`,
        `Refactor ${files[i % files.length]} \u2014 it's too complex \ud83d\udd27`,
        `Why is test #${i} failing? \ud83d\udc1b`,
        `Add \u65e5\u672c\u8a9e translations for module ${i}`,
      ]
      exchanges.push({
        role: "user",
        content: prompts[Math.floor(i / 5) % prompts.length]!,
      })
    } else if (i % 5 === 4) {
      // Summary every 5th
      exchanges.push({
        role: "agent",
        content: `Done with batch ${Math.floor(i / 5) + 1}. ${3 + (i % 7)} tests pass. \u2705`,
      })
    } else {
      // Agent with tool calls
      const tool = tools[i % tools.length]!
      const file = files[i % files.length]!
      exchanges.push({
        role: "agent",
        content: `Working on ${file}...`,
        toolCalls: [
          {
            tool,
            args: tool === "Bash" ? `bun test ${file.replace("src/", "tests/")}` : file,
            output: [
              `// ${tool} output for ${file}`,
              `line ${i * 10 + 1}: processing...`,
              tool === "Edit" ? `- old code at line ${i}` : `  existing line ${i}`,
              tool === "Edit" ? `+ new code at line ${i}` : `  result: ok`,
              i % 10 === 0 ? `\u2713 \u30c6\u30b9\u30c8\u5408\u683c \ud83c\udf89` : `\u2713 done`,
            ],
          },
        ],
      })
    }

    // Insert compaction events at intervals
    if (i === 80 || i === 160) {
      exchanges.push({
        role: "system",
        content: `\ud83d\udce6 Compaction #${i === 80 ? 1 : 2}: context cleared. Scrollback preserved above.`,
      })
    }
  }

  return exchanges
}

// ============================================================================
// Scrollback rendering — uses renderStringSync for styled JSX output
// ============================================================================

const TOOL_COLORS: Record<string, string> = {
  Read: "blue",
  Edit: "yellow",
  Bash: "red",
  Write: "magenta",
}

/** Regex matching https/http URLs in output text. */
const URL_RE = /https?:\/\/[^\s)]+/g

/** Render a line of tool output, auto-linking any URLs found in the text. */
function LinkifiedLine({ text, dim, color }: { text: string; dim?: boolean; color?: string }): JSX.Element {
  const parts: JSX.Element[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  URL_RE.lastIndex = 0
  while ((match = URL_RE.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(<Text key={`t${lastIndex}`} dim={dim} color={color}>{text.slice(lastIndex, match.index)}</Text>)
    }
    const url = match[0]
    parts.push(<Link key={`l${match.index}`} href={url} dim={dim}>{url}</Link>)
    lastIndex = match.index + url.length
  }
  if (lastIndex < text.length) {
    parts.push(<Text key={`t${lastIndex}`} dim={dim} color={color}>{text.slice(lastIndex)}</Text>)
  }
  // No URLs found — return plain text
  if (parts.length === 0) {
    return <Text dim={dim} color={color}>{text}</Text>
  }
  return <Text>{parts}</Text>
}

/** Scrollback version of an exchange — always dimmed since it's frozen history. */
function ScrollbackExchange({ exchange }: { exchange: Exchange }): JSX.Element {
  if (exchange.role === "system") {
    return (
      <Box paddingX={1}>
        <Text dim italic color="$warning">
          {exchange.content}
        </Text>
      </Box>
    )
  }

  if (exchange.role === "user") {
    return (
      <Box paddingX={1}>
        <Text dim bold color="$primary">
          {"❯ "}
        </Text>
        <Text dim>{exchange.content}</Text>
      </Box>
    )
  }

  // Agent — dimmed tool output for scrollback
  return (
    <Box flexDirection="column" paddingLeft={2}>
      <Text dim>{exchange.content}</Text>
      {exchange.toolCalls?.map((call, i) => (
        <Box key={i} flexDirection="column">
          <Text dim>
            <Text color={TOOL_COLORS[call.tool] ?? "gray"} bold>
              {"▸ "}
              {call.tool}
            </Text>
            <Text> </Text>
            <Link href={`file://${call.args}`} dim>{call.args}</Link>
          </Text>
          <Box flexDirection="column" paddingLeft={4}>
            {call.output.map((line, j) => {
              if (line.startsWith("+")) return <LinkifiedLine key={j} text={line} dim color="$success" />
              if (line.startsWith("-")) return <LinkifiedLine key={j} text={line} dim color="$error" />
              return <LinkifiedLine key={j} text={line} dim />
            })}
          </Box>
        </Box>
      ))}
    </Box>
  )
}

function renderExchangeToJSX(ex: Exchange): string {
  const cols = process.stdout.columns || 80
  return renderStringSync(<ScrollbackExchange exchange={ex} />, { width: cols })
}

// ============================================================================
// Components
// ============================================================================

function ToolCallBlock({ call }: { call: ToolCall }): JSX.Element {
  const isEdit = call.tool === "Edit"
  const color = TOOL_COLORS[call.tool] ?? "gray"

  return (
    <Box flexDirection="column" marginTop={0}>
      <Text>
        <Text color={color} bold>
          {call.tool}
        </Text>
        <Text> </Text>
        <Link href={`file://${call.args}`}>{call.args}</Link>
      </Text>
      <Box flexDirection="column" borderStyle="bold" borderColor={color} borderLeft borderRight={false} borderTop={false} borderBottom={false} paddingLeft={1}>
        {call.output.map((line, i) => {
          if (isEdit && line.startsWith("+")) {
            return <LinkifiedLine key={i} text={line} color="$success" />
          }
          if (isEdit && line.startsWith("-")) {
            return <LinkifiedLine key={i} text={line} color="$error" />
          }
          return <LinkifiedLine key={i} text={line} />
        })}
      </Box>
    </Box>
  )
}

/** Live exchange — outlined box with pulsing icon to show it's live. */
function ExchangeView({ exchange, pulse }: { exchange: Exchange; pulse: boolean }): JSX.Element {
  if (exchange.role === "system") {
    return (
      <Box borderStyle="round" borderColor="$warning" paddingX={1}>
        <Text color="$warning" italic>
          {exchange.content}
        </Text>
      </Box>
    )
  }

  const isUser = exchange.role === "user"
  const outlineColor = isUser ? "$primary" : "$success"
  const icon = isUser ? "❯" : "◆"
  const name = isUser ? "You" : "Agent"
  const labelColor = isUser ? "$primary" : "$success"

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={outlineColor} paddingX={1}>
      <Text bold color={labelColor}>
        <Text dimColor={!pulse}>{icon}</Text> {name}
      </Text>
      <Text> </Text>
      <Text>{exchange.content}</Text>
      {exchange.toolCalls && (
        <Box flexDirection="column" marginTop={1}>
          {exchange.toolCalls.map((call, i) => (
            <ToolCallBlock key={i} call={call} />
          ))}
        </Box>
      )}
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
    <Box marginLeft={2}>
      <Text color="$warning" italic>
        {"thinking" + ".".repeat(dots)}
      </Text>
    </Box>
  )
}

// ============================================================================
// Main App
// ============================================================================

/** How many live turns to keep in the dynamic area before freezing to scrollback. */
const MAX_LIVE_TURNS = 10

function CodingAgent({ script, autoStart }: { script: Omit<Exchange, "id" | "frozen">[]; autoStart: boolean }): JSX.Element {
  const { exit } = useApp()
  const [exchanges, setExchanges] = useState<Exchange[]>([])
  const [scriptIdx, setScriptIdx] = useState(0)
  const [streaming, setStreaming] = useState(false)
  const [compacting, setCompacting] = useState(false)
  const [done, setDone] = useState(false)
  const [autoMode, setAutoMode] = useState(autoStart)
  const [pendingAdvance, setPendingAdvance] = useState(false)
  const autoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const streamTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const nextIdRef = useRef(0)

  // Commit frozen exchanges to real terminal scrollback (dimmed JSX → styled ANSI)
  // markers: true emits OSC 133 semantic prompts so terminals like iTerm2, Kitty,
  // and WezTerm support Cmd+Up/Cmd+Down to jump between exchanges.
  const frozenCount = useScrollback(exchanges, {
    frozen: (ex) => ex.frozen,
    render: (ex) => renderExchangeToJSX(ex),
    markers: true,
  })

  const advance = useCallback(() => {
    if (done || streaming || compacting) return

    if (scriptIdx >= script.length) {
      setDone(true)
      return
    }

    // Freeze exchanges beyond the live window (keep last MAX_LIVE_TURNS - 1 live, new one makes MAX_LIVE_TURNS)
    setExchanges((prev) => {
      const cutoff = Math.max(0, prev.length - MAX_LIVE_TURNS + 1)
      return prev.map((ex, i) => (i < cutoff ? { ...ex, frozen: true } : ex))
    })

    const entry = script[scriptIdx]!

    // System messages (compaction) — freeze everything, show compaction for 3s, then auto-continue
    if (entry.role === "system") {
      setCompacting(true)
      setExchanges((prev) => prev.map((ex) => ({ ...ex, frozen: true })))
      const newExchange: Exchange = { ...entry, id: nextIdRef.current++, frozen: false }
      setExchanges((prev) => [...prev, newExchange])
      setScriptIdx((i) => i + 1)

      setTimeout(() => {
        // Freeze the compaction message and clear compacting — the pendingAdvance
        // effect will auto-continue to the next exchange
        setExchanges((prev) => prev.map((ex) => ({ ...ex, frozen: true })))
        setCompacting(false)
        setPendingAdvance(true)
      }, 3000)
      return
    }

    setStreaming(true)

    // Simulate thinking delay then show next exchange
    const delay = entry.role === "user" ? 500 : 1200
    const id = nextIdRef.current++
    streamTimerRef.current = setTimeout(() => {
      const newExchange: Exchange = { ...entry, id, frozen: false }
      setExchanges((prev) => [...prev, newExchange])
      setStreaming(false)
      setScriptIdx((i) => i + 1)
      streamTimerRef.current = null
    }, delay)
  }, [scriptIdx, streaming, compacting, done, script])

  const compact = useCallback(() => {
    if (done || compacting) return
    // Freeze everything, show compaction for 3s, then auto-continue
    setCompacting(true)
    setExchanges((prev) => prev.map((ex) => ({ ...ex, frozen: true })))

    setTimeout(() => {
      setCompacting(false)
      setPendingAdvance(true)
    }, 3000)
  }, [done, compacting])

  // Auto-continue after compaction ends (regardless of auto mode)
  useEffect(() => {
    if (!pendingAdvance) return
    setPendingAdvance(false)
    advance()
  }, [pendingAdvance, advance])

  // Auto-advance on first mount
  useEffect(() => {
    advance()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Auto-advance mode — continue after compaction too
  useEffect(() => {
    if (!autoMode || done || streaming || compacting) return

    autoTimerRef.current = setTimeout(() => {
      advance()
    }, 800)

    return () => {
      if (autoTimerRef.current) clearTimeout(autoTimerRef.current)
    }
  }, [autoMode, done, streaming, compacting, scriptIdx, advance])

  // Auto-compact on terminal resize — scrollback is already at the old width,
  // so we freeze everything and continue fresh at the new width
  useEffect(() => {
    const onResize = () => {
      if (!compacting && !done) compact()
    }
    process.stdout.on("resize", onResize)
    return () => { process.stdout.off("resize", onResize) }
  }, [compact, compacting, done])

  // Skip current streaming delay on Enter (immediate advance)
  const skipStreaming = useCallback(() => {
    if (!streaming) return false
    // Cancel the pending timeout so it doesn't fire after we complete
    if (streamTimerRef.current) {
      clearTimeout(streamTimerRef.current)
      streamTimerRef.current = null
    }
    // Force-complete the current exchange immediately
    const entry = script[scriptIdx]!
    const newExchange: Exchange = { ...entry, id: nextIdRef.current++, frozen: false }
    setExchanges((prev) => [...prev, newExchange])
    setStreaming(false)
    setScriptIdx((i) => i + 1)
    return true
  }, [streaming, scriptIdx, script])

  useInput((input: string, key: Key) => {
    if (input === "q" || key.escape) {
      exit()
      return
    }
    if (key.return && !autoMode) {
      // If currently streaming, skip the delay and show immediately
      if (skipStreaming()) return
      advance()
      return
    }
    if (input === "c") {
      compact()
      return
    }
    if (input === "a") {
      setAutoMode((m) => !m)
      return
    }
  })

  const activeExchanges = exchanges.slice(frozenCount)

  // Pulse animation for live icons — alternates every 800ms
  const [pulse, setPulse] = useState(false)
  useEffect(() => {
    const timer = setInterval(() => setPulse((p) => !p), 800)
    return () => clearInterval(timer)
  }, [])

  // Elapsed time counter
  const startRef = useRef(Date.now())
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - startRef.current) / 1000)), 1000)
    return () => clearInterval(timer)
  }, [])

  const minutes = Math.floor(elapsed / 60)
  const seconds = elapsed % 60
  const elapsedStr = `${minutes}:${seconds.toString().padStart(2, "0")}`

  // Progress bar
  const progress = Math.min(scriptIdx, script.length)
  const progressPct = script.length > 0 ? progress / script.length : 0
  const BAR_WIDTH = 20
  const filled = Math.round(progressPct * BAR_WIDTH)
  const barStr = "\u2588".repeat(filled) + "\u2591".repeat(BAR_WIDTH - filled)

  return (
    <Box flexDirection="column" gap={1} overflow="hidden">
      {/* Header — title + feature bullets */}
      <Box flexDirection="column" paddingX={1}>
        <Text bold>Static Scrollback</Text>
        <Text> </Text>
        <Text>Coding agent simulation showcasing inkx rendering features:</Text>
        <Text> • useScrollback() — frozen turns become real terminal scrollback</Text>
        <Text> • renderStringSync() — JSX rendered to styled ANSI strings</Text>
        <Text> • mode: "inline" — no alt screen, content flows with terminal</Text>
        <Text> • $token theme colors — semantic color tokens resolved at render</Text>
        <Text> • auto-compact on resize — freezes live turns on terminal resize</Text>
      </Box>

      {/* Scrollback marker — shown after compaction freezes everything */}
      {frozenCount > 0 && (
        <Text color="$muted" dim>
          {"  \u2191 Scrollback \u2014 frozen to terminal buffer. \u2193 Live \u2014 still in the render area."}
        </Text>
      )}

      {/* Active (non-frozen) exchanges — each in a pulsing outlined box */}
      {!compacting &&
        activeExchanges.map((ex) => (
          <ExchangeView key={ex.id} exchange={ex} pulse={pulse} />
        ))}

      {/* Streaming indicator */}
      {streaming && <StreamingIndicator />}

      {/* Compaction in progress */}
      {compacting && (
        <Box borderStyle="round" borderColor="$warning" paddingX={1}>
          <Text color="$warning" italic>
            Compacting context... freezing all turns to scrollback.
          </Text>
        </Box>
      )}

      {/* Done message */}
      {done && (
        <Box borderStyle="round" borderColor="$success" paddingX={1}>
          <Text color="$success" bold>
            Session complete.
          </Text>
        </Box>
      )}

      {/* Bottom status bar — elapsed | help | progress */}
      <Box flexDirection="row" paddingX={1}>
        <Text color="cyan">{elapsedStr}</Text>
        {autoMode && (
          <>
            <Text color="gray">{" \u00b7 "}</Text>
            <Text bold color="yellow">auto</Text>
          </>
        )}
        <Box flexGrow={1} />
        {done ? (
          <Text color="gray"><Text bold>q</Text> quit</Text>
        ) : autoMode ? (
          <Text color="gray"><Text bold>a</Text> stop  <Text bold>c</Text> compact  <Text bold>q</Text> quit</Text>
        ) : (
          <Text color="gray"><Text bold>Enter</Text> next  <Text bold>a</Text> auto  <Text bold>c</Text> compact  <Text bold>q</Text> quit</Text>
        )}
        <Box flexGrow={1} />
        {compacting ? (
          <Text color="yellow" bold dimColor={!pulse}>Compacting</Text>
        ) : done ? (
          <Text color="green" bold>Done</Text>
        ) : (
          <>
            <Text color={progressPct >= 1 ? "green" : "cyan"}>{barStr}</Text>
            <Text color="gray"> {progress}/{script.length}</Text>
          </>
        )}
      </Box>
    </Box>
  )
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  const args = process.argv.slice(2)
  const isStress = args.includes("--stress")
  const isAuto = args.includes("--auto")

  const script = isStress ? generateStressScript() : SCRIPT

  using term = createTerm()
  using app = await render(
    <CodingAgent script={script} autoStart={isAuto} />,
    term,
    { mode: "inline" },
  )
  await app.waitUntilExit()
}

if (import.meta.main) {
  main().catch(console.error)
}
