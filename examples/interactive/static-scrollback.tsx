/**
 * Static Scrollback — Coding Agent Showcase
 *
 * Demonstrates inkx's scrollback capabilities vs traditional terminal UIs:
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ Feature                          │ Claude Code │ inkx Showcase          │
 * ├──────────────────────────────────┼─────────────┼────────────────────────┤
 * │ Rich scrollback (colors/borders) │ ✗ plain     │ ✓ full JSX → ANSI     │
 * │ Clickable links in scrollback    │ partial     │ ✓ OSC 8 hyperlinks    │
 * │ Prompt navigation (Cmd+↑/↓)     │ ✗           │ ✓ OSC 133 markers     │
 * │ Streaming text                   │ ✓           │ ✓ word-by-word        │
 * │ Context visualization            │ ✗           │ ✓ live context bar    │
 * │ Token/cost tracking              │ ✓           │ ✓ per-exchange + sum  │
 * │ Thinking blocks                  │ ✓           │ ✓ with spinner        │
 * │ Tool call lifecycle              │ basic       │ ✓ spinner→output→✓    │
 * │ Auto-compact on resize           │ ✗           │ ✓                     │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * Controls:
 *   Enter - Advance to next step / skip streaming
 *   c     - Compact (clear dynamic area, scrollback remains)
 *   a     - Toggle auto-advance mode
 *   q     - Quit
 *
 * Flags:
 *   --auto    Start in auto-advance mode
 *   --fast    Skip streaming delays (instant reveal)
 *   --stress  Generate 200 exchanges instead of scripted content
 */

import React, { useState, useEffect, useCallback, useRef } from "react"
import { render, renderStringSync, Box, Text, Link, Spinner, useInput, useApp, createTerm, type Key } from "../../src/index.js"
import { useScrollback } from "../../src/hooks/useScrollback.js"
import type { ExampleMeta } from "../_banner.js"

export const meta: ExampleMeta = {
  name: "Static Scrollback",
  description: "Coding agent showcase — rich scrollback, streaming, context tracking",
  features: ["useScrollback()", "inline mode", "streaming", "OSC 8 links", "OSC 133 markers", "context tracking"],
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
  thinking?: string
  toolCalls?: ToolCall[]
  tokens?: { input: number; output: number }
  frozen: boolean
}

/** Script entry — exchange data before id/frozen are assigned. */
type ScriptEntry = Omit<Exchange, "id" | "frozen">

// ============================================================================
// Constants
// ============================================================================

const MODEL_NAME = "claude-opus-4-6"
const INPUT_COST_PER_M = 15 // $/M input tokens
const OUTPUT_COST_PER_M = 75 // $/M output tokens
const CONTEXT_WINDOW = 200_000

const TOOL_COLORS: Record<string, string> = {
  Read: "blue",
  Edit: "yellow",
  Bash: "red",
  Write: "magenta",
  Glob: "cyan",
  Grep: "green",
}

const TOOL_ICONS: Record<string, string> = {
  Read: "📖",
  Edit: "✏️",
  Bash: "⚡",
  Write: "📝",
  Glob: "🔍",
  Grep: "🔎",
}

/** Regex matching https/http URLs in output text. */
const URL_RE = /https?:\/\/[^\s)]+/g

// ============================================================================
// Script — Realistic coding agent story with thinking + tokens
// ============================================================================

const SCRIPT: ScriptEntry[] = [
  {
    role: "user",
    content: "Fix the login bug in auth.ts — expired tokens throw instead of refreshing.",
    tokens: { input: 42, output: 0 },
  },
  {
    role: "agent",
    thinking: "The user reports expired tokens throw instead of refreshing. This is likely in the token validation flow. I should read auth.ts to see the current expiry check logic. The bug is probably comparing jwt.exp (seconds) with Date.now() (milliseconds).",
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
    tokens: { input: 1847, output: 312 },
  },
  {
    role: "agent",
    thinking: "Found it — decoded.exp is in seconds (Unix timestamp) but Date.now() returns milliseconds. Every token appears expired because exp (e.g. 1700000000) is always less than Date.now() (e.g. 1700000000000). I need to divide Date.now() by 1000, and change the throw to a refresh call.",
    content: "Found it. The expiry check compares seconds (jwt.exp) to milliseconds (Date.now()). Fixing now.",
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
    tokens: { input: 2156, output: 287 },
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
    tokens: { input: 2489, output: 156 },
  },
  {
    role: "agent",
    content: "Fixed! The bug was comparing jwt.exp (seconds since epoch) with Date.now() (milliseconds). Expired tokens now trigger a refresh instead of throwing.",
    tokens: { input: 2601, output: 89 },
  },
  {
    role: "user",
    content: "Nice. Can you also add rate limiting to the login endpoint?",
    tokens: { input: 58, output: 0 },
  },
  {
    role: "agent",
    thinking: "The user wants rate limiting on login. I should check if there's existing rate limiting infrastructure before building from scratch. Let me search for rate-limit patterns in the codebase.",
    content: "I'll check what rate limiting infrastructure exists.",
    toolCalls: [
      {
        tool: "Grep",
        args: "rateLimit|rate-limit",
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
    tokens: { input: 3245, output: 423 },
  },
  {
    role: "agent",
    thinking: "Good — there's already a RateLimiter abstraction. I just need to create an instance with appropriate settings (5 attempts per 60s window seems reasonable for login) and wire it into the auth route as middleware.",
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
    tokens: { input: 3891, output: 378 },
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
    tokens: { input: 4102, output: 167 },
  },
  {
    role: "agent",
    content: "Rate limiting added: 5 attempts per minute per IP on the login endpoint. All 15 tests pass.",
    tokens: { input: 4234, output: 78 },
  },
  {
    role: "system",
    content: "📦 Compaction: clearing dynamic area. Scrollback preserved above — scroll up to review previous exchanges.",
  },
  {
    role: "agent",
    content: "Context recovered after compaction. I have the full conversation history. What would you like to work on next?",
    tokens: { input: 8012, output: 54 },
  },
  {
    role: "user",
    content: "Now add i18n support for error messages. We need 日本語 (Japanese) and Deutsch (German). 🌍",
    tokens: { input: 73, output: 0 },
  },
  {
    role: "agent",
    thinking: "i18n for error messages — I need to create translation JSON files for ja and de, then build a simple t() function that resolves message keys by locale. I'll also need to update the error responses in auth.ts to use t() with the request's locale.",
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
          '  "rate_limited": "Zu viele Anfragen. Bitte versuchen Sie es später",',
          '  "invalid_token": "Ungültiges Token",',
          '  "login_success": "Anmeldung erfolgreich"',
          "}",
        ],
      },
    ],
    tokens: { input: 8934, output: 567 },
  },
  {
    role: "agent",
    thinking: "Now I need the i18n loader module that imports the locale files and exports a t() function. The function should look up the key in the requested locale, falling back to English defaults. Then I'll wire it into the auth error responses.",
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
    tokens: { input: 9876, output: 445 },
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
          "  ✓ English fallback for unknown key",
          "  ✓ Japanese: トークンの有効期限が切れました 🔧",
          "  ✓ German: Token abgelaufen",
          "  ✓ Emoji preserved in translations 🐛✅",
          "",
          "4 passed | 0 failed",
        ],
      },
    ],
    tokens: { input: 10234, output: 178 },
  },
  {
    role: "agent",
    content: "i18n support added with Japanese (日本語) and German (Deutsch) translations. Error messages are now locale-aware. 🌍✅",
    tokens: { input: 10401, output: 67 },
  },
  {
    role: "user",
    content: "Add a health check endpoint at /health that returns the service version.",
    tokens: { input: 52, output: 0 },
  },
  {
    role: "agent",
    thinking: "Simple task — read the version from package.json and expose it on GET /health alongside uptime. Quick implementation.",
    content: "Simple addition — reading package.json for the version, then adding the route.",
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
    tokens: { input: 10789, output: 234 },
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
    tokens: { input: 11023, output: 145 },
  },
  {
    role: "agent",
    content:
      "All done! Summary of changes:\n• Fixed token expiry bug (seconds vs milliseconds)\n• Added rate limiting (5 req/min per IP)\n• Added i18n support (日本語 + Deutsch) 🌍\n• Added /health endpoint (v2.4.1)\n\nAll 21 tests pass. Ready to commit?",
    tokens: { input: 11234, output: 112 },
  },
]

// ============================================================================
// Stress test script — 200 programmatically generated exchanges
// ============================================================================

function generateStressScript(): ScriptEntry[] {
  const exchanges: ScriptEntry[] = []
  const tools = ["Read", "Edit", "Bash", "Write", "Grep", "Glob"]
  const files = [
    "src/auth.ts",
    "src/db.ts",
    "src/routes/api.ts",
    "src/middleware/cors.ts",
    "src/utils/crypto.ts",
    "src/config.ts",
    "tests/integration.test.ts",
    "src/i18n/日本語.json",
  ]

  let cumulativeInput = 4000

  for (let i = 0; i < 200; i++) {
    if (i % 5 === 0) {
      const prompts = [
        `Fix bug #${100 + i} in ${files[i % files.length]}`,
        `Add feature: ${["caching", "logging", "retry", "batching", "バリデーション"][i % 5]}`,
        `Refactor ${files[i % files.length]} — it's too complex 🔧`,
        `Why is test #${i} failing? 🐛`,
        `Add 日本語 translations for module ${i}`,
      ]
      exchanges.push({
        role: "user",
        content: prompts[Math.floor(i / 5) % prompts.length]!,
        tokens: { input: 40 + (i % 30), output: 0 },
      })
    } else if (i % 5 === 4) {
      exchanges.push({
        role: "agent",
        content: `Done with batch ${Math.floor(i / 5) + 1}. ${3 + (i % 7)} tests pass. ✅`,
        tokens: { input: cumulativeInput, output: 45 + (i % 60) },
      })
    } else {
      const tool = tools[i % tools.length]!
      const file = files[i % files.length]!
      cumulativeInput += 200 + (i % 300)
      exchanges.push({
        role: "agent",
        thinking: i % 3 === 0 ? `Analyzing ${file} for the reported issue...` : undefined,
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
              i % 10 === 0 ? `✓ テスト合格 🎉` : `✓ done`,
            ],
          },
        ],
        tokens: { input: cumulativeInput, output: 120 + (i % 200) },
      })
    }

    if (i === 80 || i === 160) {
      exchanges.push({
        role: "system",
        content: `📦 Compaction #${i === 80 ? 1 : 2}: context cleared. Scrollback preserved above.`,
      })
    }
  }

  return exchanges
}

// ============================================================================
// Token & Cost Tracking
// ============================================================================

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`
  return String(n)
}

function formatCost(inputTokens: number, outputTokens: number): string {
  const cost = (inputTokens * INPUT_COST_PER_M + outputTokens * OUTPUT_COST_PER_M) / 1_000_000
  if (cost < 0.01) return `$${cost.toFixed(4)}`
  return `$${cost.toFixed(2)}`
}

function computeCumulativeTokens(exchanges: Exchange[]): { input: number; output: number } {
  let input = 0
  let output = 0
  for (const ex of exchanges) {
    if (ex.tokens) {
      input += ex.tokens.input
      output += ex.tokens.output
    }
  }
  return { input, output }
}

// ============================================================================
// Scrollback Rendering — JSX → styled ANSI for terminal scrollback
// ============================================================================

/** Render a line with auto-linked URLs. */
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
  if (parts.length === 0) {
    return <Text dim={dim} color={color}>{text}</Text>
  }
  return <Text>{parts}</Text>
}

/** Scrollback version — dimmed, compact, with token badge. Rendered via renderStringSync. */
function ScrollbackExchange({ exchange }: { exchange: Exchange }): JSX.Element {
  const tokenBadge = exchange.tokens
    ? ` [${formatTokens(exchange.tokens.input + exchange.tokens.output)} tokens]`
    : ""

  if (exchange.role === "system") {
    return (
      <Box paddingX={1}>
        <Text dim italic color="$warning">{exchange.content}</Text>
      </Box>
    )
  }

  const isUser = exchange.role === "user"
  const outlineColor = isUser ? "$primary" : "$success"

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={outlineColor} paddingX={1} dimColor>
      <Text dim>
        <Text bold color={outlineColor}>
          {isUser ? "❯" : "◆"} {isUser ? "You" : "Agent"}
        </Text>
        {tokenBadge && <Text color="$muted">{tokenBadge}</Text>}
      </Text>
      <Text> </Text>
      <Text dim>{exchange.content}</Text>
      <Text> </Text>
      {exchange.toolCalls?.map((call, i) => (
        <Box key={i} flexDirection="column">
          <Text dim>
            <Text color={TOOL_COLORS[call.tool] ?? "gray"} bold>{"✓ "}{call.tool}</Text>
            {" "}
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
// Live Components — what the user sees in the dynamic render area
// ============================================================================

/** Thinking block — shows with spinner before agent response. */
function ThinkingBlock({ text, done }: { text: string; done: boolean }): JSX.Element {
  return (
    <Box flexDirection="column" paddingLeft={2}>
      <Text color="$muted" dim italic>
        {done ? "▸ " : <><Spinner type="dots" /> </>}
        thinking
      </Text>
      {!done && (
        <Text color="$muted" dim wrap="truncate">{"    "}{text}</Text>
      )}
    </Box>
  )
}

/** Tool call with lifecycle: spinner → output → checkmark. */
function ToolCallBlock({ call, phase }: { call: ToolCall; phase: "pending" | "running" | "done" }): JSX.Element {
  const color = TOOL_COLORS[call.tool] ?? "gray"
  const icon = TOOL_ICONS[call.tool] ?? "▸"

  return (
    <Box flexDirection="column" marginTop={0}>
      <Text>
        {phase === "running" ? (
          <><Spinner type="dots" /> </>
        ) : phase === "done" ? (
          <Text color="$success">{"✓ "}</Text>
        ) : (
          <Text color="$muted" dim>{"○ "}</Text>
        )}
        <Text color={color} bold>{call.tool}</Text>
        {" "}
        {call.tool === "Bash" || call.tool === "Grep" || call.tool === "Glob" ? (
          <Text color="$muted">{call.args}</Text>
        ) : (
          <Link href={`file://${call.args}`}>{call.args}</Link>
        )}
      </Text>
      {phase === "done" && (
        <Box
          flexDirection="column"
          borderStyle="bold"
          borderColor={color}
          borderLeft
          borderRight={false}
          borderTop={false}
          borderBottom={false}
          paddingLeft={1}
        >
          {call.output.map((line, i) => {
            if (line.startsWith("+")) return <LinkifiedLine key={i} text={line} color="$success" />
            if (line.startsWith("-")) return <LinkifiedLine key={i} text={line} color="$error" />
            return <LinkifiedLine key={i} text={line} />
          })}
        </Box>
      )}
    </Box>
  )
}

/** Streaming text — reveals content word by word. */
function StreamingText({ fullText, revealFraction, showCursor }: {
  fullText: string
  revealFraction: number
  showCursor: boolean
}): JSX.Element {
  if (revealFraction >= 1) {
    return <Text>{fullText}</Text>
  }

  const words = fullText.split(/(\s+)/)
  const totalWords = words.filter((w) => w.trim()).length
  const revealWords = Math.ceil(totalWords * revealFraction)

  let wordCount = 0
  let revealedText = ""
  for (const word of words) {
    if (word.trim()) {
      wordCount++
      if (wordCount > revealWords) break
    }
    revealedText += word
  }

  return (
    <Text>
      {revealedText}
      {showCursor && <Text color="$primary">▌</Text>}
    </Text>
  )
}

/** Live exchange — rich rendering with streaming support. */
function ExchangeView({ exchange, streamPhase, revealFraction, pulse }: {
  exchange: Exchange
  streamPhase: "thinking" | "streaming" | "tools" | "done"
  revealFraction: number
  pulse: boolean
}): JSX.Element {
  if (exchange.role === "system") {
    return (
      <Box borderStyle="round" borderColor="$warning" paddingX={1}>
        <Text color="$warning" italic>{exchange.content}</Text>
      </Box>
    )
  }

  const isUser = exchange.role === "user"
  const outlineColor = isUser ? "$primary" : "$success"
  const icon = isUser ? "❯" : "◆"
  const name = isUser ? "You" : "Agent"

  // Token badge for agent exchanges
  const tokenBadge = exchange.tokens && !isUser && streamPhase === "done"
    ? ` ${formatTokens(exchange.tokens.output)} tokens`
    : ""

  // Tool call phases
  const toolCalls = exchange.toolCalls ?? []
  const toolRevealCount = streamPhase === "tools" || streamPhase === "done"
    ? toolCalls.length
    : 0

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={outlineColor} paddingX={1}>
      {/* Header: icon + name + token badge */}
      <Text>
        <Text bold color={outlineColor}>
          <Text dimColor={!isUser && !pulse && streamPhase !== "done"}>{icon}</Text> {name}
        </Text>
        {tokenBadge && <Text color="$muted" dim>{tokenBadge}</Text>}
      </Text>

      {/* Blank line before content */}
      <Text> </Text>

      {/* User content */}
      {isUser && <Text>{exchange.content}</Text>}

      {/* Thinking block */}
      {!isUser && exchange.thinking && (streamPhase === "thinking" || streamPhase === "streaming") && (
        <ThinkingBlock text={exchange.thinking} done={streamPhase !== "thinking"} />
      )}

      {/* Agent content */}
      {!isUser && (streamPhase === "streaming" || streamPhase === "tools" || streamPhase === "done") && (
        <StreamingText
          fullText={exchange.content}
          revealFraction={streamPhase === "streaming" ? revealFraction : 1}
          showCursor={streamPhase === "streaming" && revealFraction < 1}
        />
      )}

      {/* Blank line after content (before tool calls or end) */}
      <Text> </Text>

      {/* Tool calls */}
      {toolRevealCount > 0 && (
        <Box flexDirection="column">
          {toolCalls.map((call, i) => (
            <ToolCallBlock
              key={i}
              call={call}
              phase={
                streamPhase === "done"
                  ? "done"
                  : i < toolRevealCount - 1
                    ? "done"
                    : "running"
              }
            />
          ))}
        </Box>
      )}
    </Box>
  )
}

/** Status bar — single compact row. */
function StatusBar({ exchanges, scriptLength, scriptIdx, autoMode, compacting, done, elapsed, pulse }: {
  exchanges: Exchange[]
  scriptLength: number
  scriptIdx: number
  autoMode: boolean
  compacting: boolean
  done: boolean
  elapsed: number
  pulse: boolean
}): JSX.Element {
  const cumulative = computeCumulativeTokens(exchanges)
  const totalTokens = cumulative.input + cumulative.output
  const cost = formatCost(cumulative.input, cumulative.output)
  const minutes = Math.floor(elapsed / 60)
  const seconds = elapsed % 60
  const elapsedStr = `${minutes}:${seconds.toString().padStart(2, "0")}`

  // Context bar
  const CTX_W = 20
  const ctxFrac = Math.min(totalTokens / CONTEXT_WINDOW, 1)
  const ctxFilled = Math.round(ctxFrac * CTX_W)
  const ctxPct = Math.round(ctxFrac * 100)
  const ctxColor = ctxPct > 80 ? "$error" : ctxPct > 50 ? "$warning" : "$primary"
  const ctxBar = "█".repeat(ctxFilled) + "░".repeat(CTX_W - ctxFilled)

  return (
    <Box paddingX={1}>
      <Text>
        <Text color="$muted" dim>ctx </Text>
        <Text color={ctxColor}>{ctxBar}</Text>
        <Text color="$muted" dim> {ctxPct}%</Text>
        {"  "}
        <Text color="$primary">{elapsedStr}</Text>
        <Text color="$muted" dim> · {cost}</Text>
        {autoMode && <Text bold color="$warning"> auto</Text>}
        {"  "}
        {compacting ? (
          <Text color="$warning" bold dimColor={!pulse}>compacting</Text>
        ) : done ? (
          <Text color="$muted"><Text bold>q</Text> quit</Text>
        ) : autoMode ? (
          <Text color="$muted"><Text bold>a</Text> stop <Text bold>c</Text> compact <Text bold>q</Text> quit</Text>
        ) : (
          <Text color="$muted"><Text bold>⏎</Text> next <Text bold>a</Text> auto <Text bold>c</Text> compact <Text bold>q</Text> quit</Text>
        )}
      </Text>
    </Box>
  )
}

// ============================================================================
// Main App
// ============================================================================

/** How many live turns to keep in the dynamic area before freezing to scrollback. */
const MAX_LIVE_TURNS = 4

/** Streaming phases: thinking → streaming text → tool calls → done */
type StreamPhase = "thinking" | "streaming" | "tools" | "done"

function CodingAgent({ script, autoStart, fastMode }: {
  script: ScriptEntry[]
  autoStart: boolean
  fastMode: boolean
}): JSX.Element {
  const { exit } = useApp()
  const [exchanges, setExchanges] = useState<Exchange[]>([])
  const [scriptIdx, setScriptIdx] = useState(0)
  const [done, setDone] = useState(false)
  const [autoMode, setAutoMode] = useState(autoStart)
  const [compacting, _setCompacting] = useState(false)
  const compactingRef = useRef(false)
  const setCompacting = useCallback((v: boolean) => { compactingRef.current = v; _setCompacting(v) }, [])
  const [pendingAdvance, setPendingAdvance] = useState(false)

  // Streaming state
  const [streamPhase, setStreamPhase] = useState<StreamPhase>("done")
  const [revealFraction, setRevealFraction] = useState(1)
  const phaseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const revealTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const autoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const nextIdRef = useRef(0)

  // Scrollback with OSC 133 semantic markers
  const frozenCount = useScrollback(exchanges, {
    frozen: (ex) => ex.frozen,
    render: (ex) => renderExchangeToJSX(ex),
    markers: true,
  })

  /** Cancel all streaming timers. */
  const cancelStreaming = useCallback(() => {
    if (phaseTimerRef.current) { clearTimeout(phaseTimerRef.current); phaseTimerRef.current = null }
    if (revealTimerRef.current) { clearInterval(revealTimerRef.current); revealTimerRef.current = null }
  }, [])

  /** Start streaming an exchange through its phases. */
  const startStreaming = useCallback((entry: ScriptEntry, id: number) => {
    cancelStreaming()
    const newExchange: Exchange = { ...entry, id, frozen: false }

    // User messages and system messages: instant
    if (entry.role === "user" || entry.role === "system") {
      setExchanges((prev) => [...prev, newExchange])
      setStreamPhase("done")
      setRevealFraction(1)
      return
    }

    // Fast mode: skip all animation
    if (fastMode) {
      setExchanges((prev) => [...prev, newExchange])
      setStreamPhase("done")
      setRevealFraction(1)
      return
    }

    // Agent message: thinking → streaming → tools → done
    setExchanges((prev) => [...prev, newExchange])

    if (entry.thinking) {
      // Phase 1: Thinking
      setStreamPhase("thinking")
      setRevealFraction(0)
      phaseTimerRef.current = setTimeout(() => {
        // Phase 2: Streaming text
        setStreamPhase("streaming")
        let frac = 0
        revealTimerRef.current = setInterval(() => {
          frac += 0.08
          if (frac >= 1) {
            frac = 1
            if (revealTimerRef.current) clearInterval(revealTimerRef.current)
            // Phase 3: Tool calls (if any)
            if (entry.toolCalls?.length) {
              setStreamPhase("tools")
              phaseTimerRef.current = setTimeout(() => {
                setStreamPhase("done")
              }, 600 * (entry.toolCalls?.length ?? 1))
            } else {
              setStreamPhase("done")
            }
          }
          setRevealFraction(frac)
        }, 50)
      }, 1200)
    } else {
      // No thinking — go straight to streaming
      setStreamPhase("streaming")
      let frac = 0
      revealTimerRef.current = setInterval(() => {
        frac += 0.12
        if (frac >= 1) {
          frac = 1
          if (revealTimerRef.current) clearInterval(revealTimerRef.current)
          if (entry.toolCalls?.length) {
            setStreamPhase("tools")
            phaseTimerRef.current = setTimeout(() => {
              setStreamPhase("done")
            }, 600 * (entry.toolCalls?.length ?? 1))
          } else {
            setStreamPhase("done")
          }
        }
        setRevealFraction(frac)
      }, 50)
    }
  }, [fastMode, cancelStreaming])

  /** Advance to the next script entry. */
  const advance = useCallback(() => {
    if (done || compactingRef.current) return
    if (streamPhase !== "done") return // Still streaming

    if (scriptIdx >= script.length) {
      setDone(true)
      return
    }

    // Freeze exchanges beyond the live window
    setExchanges((prev) => {
      const cutoff = Math.max(0, prev.length - MAX_LIVE_TURNS + 1)
      return prev.map((ex, i) => (i < cutoff ? { ...ex, frozen: true } : ex))
    })

    const entry = script[scriptIdx]!

    // System messages (compaction) — freeze everything
    if (entry.role === "system") {
      setCompacting(true)
      setExchanges((prev) => prev.map((ex) => ({ ...ex, frozen: true })))
      const id = nextIdRef.current++
      const newExchange: Exchange = { ...entry, id, frozen: false }
      setExchanges((prev) => [...prev, newExchange])
      setScriptIdx((i) => i + 1)
      setStreamPhase("done")
      setRevealFraction(1)

      setTimeout(() => {
        setExchanges((prev) => prev.map((ex) => ({ ...ex, frozen: true })))
        setCompacting(false)
        setPendingAdvance(true)
      }, fastMode ? 300 : 3000)
      return
    }

    const id = nextIdRef.current++
    setScriptIdx((i) => i + 1)
    startStreaming(entry, id)
  }, [scriptIdx, done, streamPhase, script, startStreaming, setCompacting, fastMode])

  /** Skip current streaming — jump to done. */
  const skipStreaming = useCallback(() => {
    if (streamPhase === "done") return false
    cancelStreaming()
    setStreamPhase("done")
    setRevealFraction(1)
    return true
  }, [streamPhase, cancelStreaming])

  const compact = useCallback(() => {
    if (done || compactingRef.current) return
    cancelStreaming()
    setStreamPhase("done")
    setRevealFraction(1)
    setCompacting(true)
    setExchanges((prev) => prev.map((ex) => ({ ...ex, frozen: true })))

    setTimeout(() => {
      setCompacting(false)
      setPendingAdvance(true)
    }, fastMode ? 300 : 3000)
  }, [done, cancelStreaming, setCompacting, fastMode])

  // Auto-continue after compaction
  useEffect(() => {
    if (!pendingAdvance) return
    setPendingAdvance(false)
    advance()
  }, [pendingAdvance, advance])

  // Auto-advance on mount
  useEffect(() => {
    advance()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Auto-advance when streaming finishes
  useEffect(() => {
    if (!autoMode || done || compacting) return
    if (streamPhase !== "done") return

    autoTimerRef.current = setTimeout(advance, 400)
    return () => { if (autoTimerRef.current) clearTimeout(autoTimerRef.current) }
  }, [autoMode, done, compacting, streamPhase, scriptIdx, advance])

  // Auto-compact on terminal resize
  useEffect(() => {
    const onResize = () => { if (!compactingRef.current && !done) compact() }
    process.stdout.on("resize", onResize)
    return () => { process.stdout.off("resize", onResize) }
  }, [compact, done])

  useInput((input: string, key: Key) => {
    if (input === "q" || key.escape) { exit(); return }
    if (key.return && !autoMode) {
      if (skipStreaming()) return
      advance()
      return
    }
    if (input === "c") { compact(); return }
    if (input === "a") { setAutoMode((m) => !m); return }
  })

  // Pulse animation for live icons
  const [pulse, setPulse] = useState(false)
  useEffect(() => {
    const timer = setInterval(() => setPulse((p) => !p), 800)
    return () => clearInterval(timer)
  }, [])

  // Elapsed time
  const startRef = useRef(Date.now())
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - startRef.current) / 1000)), 1000)
    return () => clearInterval(timer)
  }, [])

  const activeExchanges = exchanges.slice(frozenCount)

  return (
    <Box flexDirection="column" gap={1}>
      {/* Header — title + feature bullets */}
      <Box flexDirection="column" paddingX={1}>
        <Text bold>Static Scrollback</Text>
        <Text> </Text>
        <Text>Coding agent simulation showcasing inkx rendering features:</Text>
        <Text> {"\u2022"} useScrollback() — frozen turns become real terminal scrollback</Text>
        <Text> {"\u2022"} renderStringSync() — JSX rendered to styled ANSI strings</Text>
        <Text> {"\u2022"} mode: "inline" — no alt screen, content flows with terminal</Text>
        <Text> {"\u2022"} OSC 8 hyperlinks — clickable file paths and URLs in scrollback</Text>
        <Text> {"\u2022"} OSC 133 markers — Cmd+{"\u2191"}/{"\u2193"} to jump between exchanges</Text>
        <Text> {"\u2022"} $token theme colors — semantic color tokens resolved at render</Text>
      </Box>

      {/* Scrollback marker */}
      {frozenCount > 0 && (
        <Box paddingX={1}>
          <Text color="$muted" dim>
            {"\u2191"} {frozenCount} exchanges in scrollback (Cmd+{"\u2191"}/{"\u2193"} to navigate)
          </Text>
        </Box>
      )}

      {/* Active exchanges */}
      {!compacting &&
        activeExchanges.map((ex, i) => {
          const isLatest = i === activeExchanges.length - 1
          return (
            <ExchangeView
              key={ex.id}
              exchange={ex}
              streamPhase={isLatest ? streamPhase : "done"}
              revealFraction={isLatest ? revealFraction : 1}
              pulse={pulse}
            />
          )
        })}

      {/* Compaction in progress */}
      {compacting && (
        <Box borderStyle="round" borderColor="$warning" paddingX={1}>
          <Text color="$warning">
            <Spinner type="arc" /> Compacting context... freezing all turns to scrollback.
          </Text>
        </Box>
      )}

      {/* Done message */}
      {done && (
        <Box flexDirection="column" borderStyle="round" borderColor="$success" paddingX={1}>
          <Text color="$success" bold>✓ Session complete</Text>
          <Text color="$muted">
            Scroll up to review — colors, borders, and hyperlinks preserved in scrollback.
          </Text>
          <Text color="$muted" dim>
            Try <Text bold color="$primary">Cmd+↑</Text>/<Text bold color="$primary">Cmd+↓</Text> to jump between exchanges.
          </Text>
        </Box>
      )}

      {/* Status bar */}
      <StatusBar
        exchanges={exchanges}
        scriptLength={script.length}
        scriptIdx={scriptIdx}
        autoMode={autoMode}
        compacting={compacting}
        done={done}
        elapsed={elapsed}
        pulse={pulse}
      />
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
  const isFast = args.includes("--fast")

  const script = isStress ? generateStressScript() : SCRIPT

  using term = createTerm()
  using app = await render(
    <CodingAgent script={script} autoStart={isAuto} fastMode={isFast} />,
    term,
    { mode: "inline" },
  )
  await app.waitUntilExit()
  // Explicit exit — inkx's unmount doesn't fully release all event loop references yet
  process.exit(0)
}

if (import.meta.main) {
  main().catch(console.error)
}
