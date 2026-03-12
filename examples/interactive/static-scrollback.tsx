/**
 * Static Scrollback — Coding Agent Showcase
 *
 * Demonstrates silvery's ScrollbackList component for building apps where
 * completed items freeze into real terminal scrollback:
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ Feature                          │ Claude Code │ silvery Showcase          │
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
 * Key APIs demonstrated:
 *   - ScrollbackList — declarative list with automatic scrollback management
 *   - useScrollbackItem — imperative freeze() from within list items
 *   - isFrozen prop — data-driven freezing for items marked as complete
 *   - OSC 133 markers — terminal prompt navigation via markers prop
 *
 * Controls:
 *   Enter - Fast-complete agent action / submit user message
 *   Tab   - Toggle auto-advance mode
 *   Esc   - Quit
 *   ^L    - Clear + scroll (compact)
 *
 * Flags:
 *   --auto    Start in auto-advance mode
 *   --fast    Skip streaming delays (instant reveal)
 *   --stress  Generate 200 exchanges instead of scripted content
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react"
import {
  Box,
  Text,
  Link,
  Spinner,
  ScrollbackList,
  useScrollbackItem,
  TextInput,
  useTerminalFocused,
  useTea,
  fx,
} from "silvery"
import type { TeaResult, TimerEffect } from "silvery"
import { run, useInput, useExit, type Key } from "@silvery/term/runtime"
import type { ExampleMeta } from "../_banner.js"

export const meta: ExampleMeta = {
  name: "AI Coding Agent",
  description: "Coding agent showcase — ScrollbackList, streaming, context tracking",
  features: [
    "ScrollbackList",
    "useScrollbackItem()",
    "isFrozen",
    "inline mode",
    "streaming",
    "OSC 8 links",
    "OSC 133 markers",
    "context tracking",
  ],
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
export type ScriptEntry = Omit<Exchange, "id" | "frozen">

// ============================================================================
// Constants
// ============================================================================

const MODEL_NAME = "claude-opus-4-6"
const INPUT_COST_PER_M = 15 // $/M input tokens
const OUTPUT_COST_PER_M = 75 // $/M output tokens
const CONTEXT_WINDOW = 200_000

const TOOL_COLORS: Record<string, string> = {
  Read: "$info",
  Edit: "$warning",
  Bash: "$error",
  Write: "$accent",
  Glob: "$muted",
  Grep: "$success",
}

const TOOL_ICONS: Record<string, string> = {
  Read: "📖",
  Edit: "✏️",
  Bash: "⚡",
  Write: "📝",
  Glob: "🔍",
  Grep: "🔎",
}

/** Random user commands for Tab-to-inject feature. */
const RANDOM_USER_COMMANDS = [
  "Can you add unit tests for the auth module?",
  "Refactor the database queries to use prepared statements.",
  "Add TypeScript strict mode and fix any errors.",
  "Set up CI/CD with GitHub Actions.",
  "The search feature is slow — can you optimize it?",
  "Add dark mode support to the UI.",
  "We need input validation on the registration form.",
  "Create a migration script for the new schema.",
  "Add WebSocket support for real-time updates.",
  "The CSV export is broken — dates are wrong.",
]

/** Random agent responses for Tab-injected turns. */
const RANDOM_AGENT_RESPONSES: ScriptEntry[] = [
  {
    role: "agent",
    thinking: "Let me analyze the codebase to understand the current structure.",
    content: "I'll look at the relevant files and make the changes.",
    toolCalls: [
      { tool: "Read", args: "src/index.ts", output: ["export function main() { /* ... */ }"] },
      { tool: "Edit", args: "src/index.ts", output: ["+  // Updated implementation"] },
    ],
    tokens: { input: 12400, output: 890 },
  },
  {
    role: "agent",
    content: "Done! I've made the changes and verified everything works.",
    tokens: { input: 15200, output: 340 },
  },
]

/** Regex matching https/http URLs in output text. */
const URL_RE = /https?:\/\/[^\s)]+/g

// ============================================================================
// Script — Realistic coding agent story with thinking + tokens
// ============================================================================

export const SCRIPT: ScriptEntry[] = [
  {
    role: "user",
    content: "Fix the login bug in auth.ts — expired tokens throw instead of refreshing.",
    tokens: { input: 84, output: 0 },
  },
  {
    role: "agent",
    thinking:
      "The user reports expired tokens throw instead of refreshing. This is likely in the token validation flow. I should read auth.ts to see the current expiry check logic. The bug is probably comparing jwt.exp (seconds) with Date.now() (milliseconds).",
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
      "Found it — decoded.exp is in seconds (Unix timestamp) but Date.now() returns milliseconds. Every token appears expired because exp (e.g. 1700000000) is always less than Date.now() (e.g. 1700000000000). I need to divide Date.now() by 1000, and change the throw to a refresh call.",
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
      "Fixed! The bug was comparing jwt.exp (seconds since epoch) with Date.now() (milliseconds). Expired tokens now trigger a refresh instead of throwing.",
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
      "The user wants rate limiting on login. I should check if there's existing rate limiting infrastructure before building from scratch. Let me search for rate-limit patterns in the codebase.",
    content: "I'll check what rate limiting infrastructure exists.",
    toolCalls: [
      {
        tool: "Grep",
        args: "rateLimit|rate-limit",
        output: [
          "src/middleware/rate-limit.ts",
          "src/config.ts",
          "See https://docs.example.com/api/rate-limiting for API docs",
        ],
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
      "Good — there's already a RateLimiter abstraction. I just need to create an instance with appropriate settings (5 attempts per 60s window seems reasonable for login) and wire it into the auth route as middleware.",
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
    content: "Rate limiting added: 5 attempts per minute per IP on the login endpoint. All 15 tests pass.",
    tokens: { input: 8468, output: 156 },
  },
  {
    role: "user",
    content: "Now add i18n support for error messages. We need 日本語 (Japanese) and Deutsch (German). 🌍",
    tokens: { input: 146, output: 0 },
  },
  {
    role: "agent",
    thinking:
      "i18n for error messages — I need to create translation JSON files for ja and de, then build a simple t() function that resolves message keys by locale. I'll also need to update the error responses in auth.ts to use t() with the request's locale.",
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
    tokens: { input: 17868, output: 1134 },
  },
  {
    role: "agent",
    thinking:
      "Now I need the i18n loader module that imports the locale files and exports a t() function. The function should look up the key in the requested locale, falling back to English defaults. Then I'll wire it into the auth error responses.",
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
    tokens: { input: 19752, output: 890 },
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
    tokens: { input: 20468, output: 356 },
  },
  {
    role: "agent",
    content:
      "i18n support added with Japanese (日本語) and German (Deutsch) translations. Error messages are now locale-aware. 🌍✅",
    tokens: { input: 20802, output: 134 },
  },
  {
    role: "user",
    content: "Add a health check endpoint at /health that returns the service version.",
    tokens: { input: 104, output: 0 },
  },
  {
    role: "agent",
    thinking:
      "Simple task — read the version from package.json and expose it on GET /health alongside uptime. Quick implementation.",
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
          "i18n.test.ts ........... 4 passed",
          "",
          "21 passed | 0 failed | 5 files",
        ],
      },
    ],
    tokens: { input: 22046, output: 290 },
  },
  {
    role: "agent",
    content:
      "All done! Summary of changes:\n• Fixed token expiry bug (seconds vs milliseconds)\n• Added rate limiting (5 req/min per IP)\n• Added i18n support (日本語 + Deutsch) 🌍\n• Added /health endpoint (v2.4.1)\n\nAll 21 tests pass. Ready to commit?",
    tokens: { input: 22468, output: 224 },
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

/**
 * Compute token stats for display and compaction.
 *
 * Token values in the script are CUMULATIVE — each exchange's `input` represents
 * the total context consumed at that point. So:
 * - `currentContext`: the LAST exchange's input tokens (= current context window usage)
 * - `totalCost`: sum of all (input + output) for cost calculation (each API call costs)
 */
function computeCumulativeTokens(exchanges: Exchange[]): {
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
      // Context = last exchange's cumulative input (not the sum)
      if (ex.tokens.input > currentContext) currentContext = ex.tokens.input
    }
  }
  return { input, output, currentContext }
}

// ============================================================================
// Shared UI Components
// ============================================================================

/** Render a line with auto-linked URLs. */
function LinkifiedLine({ text, dim, color }: { text: string; dim?: boolean; color?: string }): JSX.Element {
  const parts: JSX.Element[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  URL_RE.lastIndex = 0
  while ((match = URL_RE.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(
        <Text key={`t${lastIndex}`} dim={dim} color={color}>
          {text.slice(lastIndex, match.index)}
        </Text>,
      )
    }
    const url = match[0]
    parts.push(
      <Link key={`l${match.index}`} href={url} dim={dim}>
        {url}
      </Link>,
    )
    lastIndex = match.index + url.length
  }
  if (lastIndex < text.length) {
    parts.push(
      <Text key={`t${lastIndex}`} dim={dim} color={color}>
        {text.slice(lastIndex)}
      </Text>,
    )
  }
  if (parts.length === 0) {
    return (
      <Text dim={dim} color={color}>
        {text}
      </Text>
    )
  }
  return <Text>{parts}</Text>
}

/** Thinking block — shows with spinner before agent response. */
function ThinkingBlock({ text, done }: { text: string; done: boolean }): JSX.Element {
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
        thinking
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

/** Tool call with lifecycle: spinner -> output -> checkmark. */
function ToolCallBlock({ call, phase }: { call: ToolCall; phase: "pending" | "running" | "done" }): JSX.Element {
  const color = TOOL_COLORS[call.tool] ?? "gray"
  const icon = TOOL_ICONS[call.tool] ?? "▸"

  return (
    <Box flexDirection="column" marginTop={0}>
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
          {call.tool}
        </Text>{" "}
        {call.tool === "Bash" || call.tool === "Grep" || call.tool === "Glob" ? (
          <Text color="$muted">{call.args}</Text>
        ) : (
          <Link href={`file://${call.args}`}>{call.args}</Link>
        )}
      </Text>
      {phase === "done" && (
        <Box flexDirection="column" paddingLeft={2}>
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
function StreamingText({
  fullText,
  revealFraction,
  showCursor,
}: {
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
      {showCursor && <Text color="$primary">{"▌"}</Text>}
    </Text>
  )
}

// ============================================================================
// Exchange Views — live (interactive) and scrollback (frozen)
// ============================================================================

/**
 * Live exchange view — rich rendering with streaming, spinners, and
 * useScrollbackItem integration. When this item's exchange becomes frozen,
 * it calls freeze() to push itself into terminal scrollback.
 */
function ExchangeItem({
  exchange,
  streamPhase,
  revealFraction,
  pulse,
  isLatest,
  isFirstInGroup,
  isLastInGroup,
}: {
  exchange: Exchange
  streamPhase: "thinking" | "streaming" | "tools" | "done"
  revealFraction: number
  pulse: boolean
  isLatest: boolean
  isFirstInGroup: boolean
  isLastInGroup: boolean
}): JSX.Element {
  const { freeze } = useScrollbackItem()

  // When the exchange is marked frozen in data, call freeze() imperatively.
  // This triggers ScrollbackList to render us as a string and push to scrollback.
  useEffect(() => {
    if (exchange.frozen) {
      freeze()
    }
  }, [exchange.frozen, freeze])

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

  // User messages: blue ❯ marker, content left-aligned to it
  if (isUser) {
    return (
      <Box paddingX={1} flexDirection="row">
        <Text bold color="$focusring">
          {"❯"}{" "}
        </Text>
        <Box flexShrink={1}>
          <Text>{exchange.content}</Text>
        </Box>
      </Box>
    )
  }

  const outlineColor = "$border"
  const icon = "◆"
  const name = "Agent"
  const phase = isLatest ? streamPhase : "done"
  const fraction = isLatest ? revealFraction : 1

  // Token badge for agent exchanges
  const tokenBadge = exchange.tokens && phase === "done" ? `${formatTokens(exchange.tokens.output)} tokens` : ""

  // Tool call phases
  const toolCalls = exchange.toolCalls ?? []
  const toolRevealCount = phase === "tools" || phase === "done" ? toolCalls.length : 0

  return (
    <Box flexDirection="column">
      {/* Agent label */}
      <Text>
        <Text bold color="$success" dimColor={!pulse && phase !== "done"}>
          {icon}
        </Text>
        <Text bold color="$success">
          {" "}
          {name}
          {tokenBadge ? ` · ${tokenBadge}` : ""}
        </Text>
      </Text>

      <Box
        flexDirection="column"
        borderStyle="bold"
        borderColor={outlineColor}
        borderLeft
        borderRight={false}
        borderTop={false}
        borderBottom={false}
        paddingLeft={1}
      >
        {/* Thinking block */}
        {exchange.thinking && (phase === "thinking" || phase === "streaming") && (
          <ThinkingBlock text={exchange.thinking} done={phase !== "thinking"} />
        )}

        {/* Agent content */}
        {(phase === "streaming" || phase === "tools" || phase === "done") && (
          <StreamingText
            fullText={exchange.content}
            revealFraction={phase === "streaming" ? fraction : 1}
            showCursor={phase === "streaming" && fraction < 1}
          />
        )}

        {/* Tool calls */}
        {toolRevealCount > 0 && (
          <Box flexDirection="column">
            {toolCalls.map((call, i) => (
              <ToolCallBlock
                key={i}
                call={call}
                phase={phase === "done" ? "done" : i < toolRevealCount - 1 ? "done" : "running"}
              />
            ))}
          </Box>
        )}
      </Box>
    </Box>
  )
}

/** Status bar — single compact row. */
function StatusBar({
  exchanges,
  compacting,
  done,
  elapsed,
  frozenCount = 0,
  contextBaseline = 0,
  ctrlDPending = false,
}: {
  exchanges: Exchange[]
  compacting: boolean
  done: boolean
  elapsed: number
  frozenCount?: number
  contextBaseline?: number
  ctrlDPending?: boolean
}): JSX.Element {
  const cumulative = computeCumulativeTokens(exchanges)
  const cost = formatCost(cumulative.input, cumulative.output)
  const minutes = Math.floor(elapsed / 60)
  const seconds = elapsed % 60
  const elapsedStr = `${minutes}:${seconds.toString().padStart(2, "0")}`

  // Context bar — subtract baseline so bar resets after compaction
  const CTX_W = 20
  const effectiveContext = Math.max(0, cumulative.currentContext - contextBaseline)
  const ctxFrac = effectiveContext / CONTEXT_WINDOW
  const ctxFilled = Math.round(Math.min(ctxFrac, 1) * CTX_W)
  const ctxPct = Math.round(ctxFrac * 100)
  const ctxColor = ctxPct > 100 ? "$error" : ctxPct > 80 ? "$warning" : "$primary"
  const ctxBar = "█".repeat(ctxFilled) + "░".repeat(CTX_W - ctxFilled)

  // Build key hints — minimal, obvious keys omitted
  let keys: string
  if (ctrlDPending) keys = "Ctrl-D again to exit"
  else if (compacting) keys = "compacting..."
  else if (done) keys = "esc quit"
  else keys = "esc quit"

  return (
    <Box flexDirection="row" justifyContent="space-between" width="100%">
      <Text color="$muted" wrap="truncate">
        {elapsedStr}
        {"  "}
        {keys}
      </Text>
      <Text color="$muted" wrap="truncate">
        {frozenCount > 0 && (
          <>
            {"↑"}
            {frozenCount} in scrollback{"  "}
          </>
        )}
        ctx {ctxBar} {ctxPct}%{"  "}
        {cost}
      </Text>
    </Box>
  )
}

// ============================================================================
// TEA State Machine — pure (state, msg) → [state, effects]
// ============================================================================

/** How many live turns to keep in the dynamic area before freezing to scrollback. */
const MAX_LIVE_TURNS = 3

/** Streaming phases: thinking -> streaming text -> tool calls -> done */
type StreamPhase = "thinking" | "streaming" | "tools" | "done"

type DemoState = {
  exchanges: Exchange[]
  scriptIdx: number
  streamPhase: StreamPhase
  revealFraction: number
  done: boolean
  compacting: boolean
  pulse: boolean
  ctrlDPending: boolean
  contextBaseline: number
  offScript: boolean
  nextId: number
  autoTyping: { full: string; revealed: number } | null
}

type DemoMsg =
  | { type: "mount" }
  | { type: "advance" }
  | { type: "endThinking" }
  | { type: "streamTick" }
  | { type: "endTools" }
  | { type: "submit"; text: string }
  | { type: "compact" }
  | { type: "compactDone" }
  | { type: "pulse" }
  | { type: "autoAdvance" }
  | { type: "typingTick" }
  | { type: "autoTypingDone" }
  | { type: "respondRandom" }
  | { type: "setCtrlDPending"; pending: boolean }

type DemoEffect = TimerEffect<DemoMsg>
type DemoResult = TeaResult<DemoState, DemoEffect>

const INIT_STATE: DemoState = {
  exchanges: [],
  scriptIdx: 0,
  streamPhase: "done",
  revealFraction: 1,
  done: false,
  compacting: false,
  pulse: false,
  ctrlDPending: false,
  contextBaseline: 0,
  offScript: false,
  nextId: 0,
  autoTyping: null,
}

function createDemoUpdate(script: ScriptEntry[], fastMode: boolean, autoMode: boolean) {
  function addExchange(state: DemoState, entry: ScriptEntry): DemoState {
    const exchange: Exchange = { ...entry, id: state.nextId, frozen: false }
    return { ...state, exchanges: [...state.exchanges, exchange], nextId: state.nextId + 1 }
  }

  function startStreaming(state: DemoState, entry: ScriptEntry): [DemoState, DemoEffect[]] {
    const s = addExchange(state, entry)
    if (entry.role !== "agent" || fastMode) {
      return [{ ...s, streamPhase: "done", revealFraction: 1 }, []]
    }
    if (entry.thinking) {
      return [{ ...s, streamPhase: "thinking", revealFraction: 0 }, [fx.delay(1200, { type: "endThinking" })]]
    }
    return [{ ...s, streamPhase: "streaming", revealFraction: 0 }, [fx.interval(50, { type: "streamTick" }, "reveal")]]
  }

  function freezeOld(exchanges: Exchange[]): Exchange[] {
    const cutoff = Math.max(0, exchanges.length - MAX_LIVE_TURNS + 1)
    return exchanges.map((ex, i) => (i < cutoff ? { ...ex, frozen: true } : ex))
  }

  /** Return auto-advance timer effects when streamPhase becomes "done". */
  function autoAdvanceEffects(state: DemoState): DemoEffect[] {
    if (state.done || state.compacting || state.streamPhase !== "done") return []
    const next = script[state.scriptIdx]
    if (!next) return autoMode ? [fx.delay(0, { type: "autoAdvance" })] : []
    if (autoMode || next.role !== "user") return [fx.delay(fastMode ? 100 : 400, { type: "autoAdvance" })]
    return []
  }

  /** Core advance: freeze old exchanges, stream next script entry, chain agent turns. */
  function doAdvance(state: DemoState, extraEffects: DemoEffect[] = []): DemoResult {
    if (state.done || state.compacting || state.streamPhase !== "done") return state
    if (state.scriptIdx >= script.length) {
      return autoMode ? { ...state, done: true } : state
    }

    const entry = script[state.scriptIdx]!
    let s: DemoState = {
      ...state,
      exchanges: freezeOld(state.exchanges),
      scriptIdx: state.scriptIdx + 1,
    }
    let effects = [...extraEffects]
    let streamFx: DemoEffect[]

    ;[s, streamFx] = startStreaming(s, entry)
    effects.push(...streamFx)

    if (fastMode) {
      // Chain all consecutive non-user entries
      while (s.scriptIdx < script.length && script[s.scriptIdx]!.role !== "user") {
        ;[s, streamFx] = startStreaming({ ...s, scriptIdx: s.scriptIdx + 1 }, script[s.scriptIdx]!)
        effects.push(...streamFx)
      }
      effects.push(...autoAdvanceEffects(s))
    } else if (entry.role === "user") {
      // Auto-chain user → first agent entry (one Enter = user msg + agent response)
      if (s.scriptIdx < script.length && script[s.scriptIdx]!.role === "agent") {
        ;[s, streamFx] = startStreaming({ ...s, scriptIdx: s.scriptIdx + 1 }, script[s.scriptIdx]!)
        effects.push(...streamFx)
      }
    }

    return [s, effects]
  }

  return function update(state: DemoState, msg: DemoMsg): DemoResult {
    switch (msg.type) {
      case "mount":
        return doAdvance(state, [fx.interval(400, { type: "pulse" }, "pulse")])

      case "advance":
      case "autoAdvance": {
        // Auto mode with user entry: start typing animation
        if (autoMode && !fastMode && state.streamPhase === "done" && !state.done && !state.compacting) {
          const next = script[state.scriptIdx]
          if (next?.role === "user") {
            return [
              { ...state, autoTyping: { full: next.content, revealed: 0 } },
              [fx.interval(30, { type: "typingTick" }, "typing")],
            ]
          }
        }
        if (autoMode && state.scriptIdx >= script.length && state.streamPhase === "done") {
          return { ...state, done: true }
        }
        return doAdvance(state)
      }

      case "typingTick": {
        if (!state.autoTyping) return state
        const next = state.autoTyping.revealed + 1
        if (next >= state.autoTyping.full.length) {
          return [
            {
              ...state,
              autoTyping: { ...state.autoTyping, revealed: state.autoTyping.full.length },
            },
            [fx.cancel("typing"), fx.delay(300, { type: "autoTypingDone" })],
          ]
        }
        return { ...state, autoTyping: { ...state.autoTyping, revealed: next } }
      }

      case "autoTypingDone":
        return doAdvance({ ...state, autoTyping: null })

      case "endThinking":
        return [
          { ...state, streamPhase: "streaming", revealFraction: 0 },
          [fx.interval(50, { type: "streamTick" }, "reveal")],
        ]

      case "streamTick": {
        const last = state.exchanges[state.exchanges.length - 1]
        const rate = last?.thinking ? 0.08 : 0.12
        const frac = Math.min(state.revealFraction + rate, 1)
        if (frac < 1) return { ...state, revealFraction: frac }

        const tools = last?.toolCalls ?? []
        if (tools.length > 0) {
          const s = { ...state, streamPhase: "tools" as StreamPhase, revealFraction: 1 }
          return [s, [fx.cancel("reveal"), fx.delay(600 * tools.length, { type: "endTools" })]]
        }
        const s = { ...state, streamPhase: "done" as StreamPhase, revealFraction: 1 }
        return [s, [fx.cancel("reveal"), ...autoAdvanceEffects(s)]]
      }

      case "endTools": {
        const s = { ...state, streamPhase: "done" as StreamPhase }
        return [s, autoAdvanceEffects(s)]
      }

      case "submit": {
        if (state.streamPhase !== "done") {
          return [
            { ...state, streamPhase: "done", revealFraction: 1, autoTyping: null },
            [fx.cancel("reveal"), fx.cancel("typing")],
          ]
        }
        if (state.done || !msg.text.trim()) return state

        const cleared = state.autoTyping ? { ...state, autoTyping: null } : state
        const s = addExchange(cleared, {
          role: "user",
          content: msg.text,
          tokens: { input: msg.text.length * 4, output: 0 },
        })

        if (s.scriptIdx < script.length) {
          let nextIdx = s.scriptIdx
          while (nextIdx < script.length && script[nextIdx]!.role === "user") nextIdx++
          return [{ ...s, scriptIdx: nextIdx }, [fx.cancel("typing"), fx.delay(150, { type: "autoAdvance" })]]
        }

        return [{ ...s, offScript: true }, [fx.cancel("typing"), fx.delay(150, { type: "respondRandom" })]]
      }

      case "respondRandom": {
        const resp = RANDOM_AGENT_RESPONSES[Math.floor(Math.random() * RANDOM_AGENT_RESPONSES.length)]!
        const [s, effects] = startStreaming(state, resp)
        return [{ ...s, offScript: true }, effects]
      }

      case "compact": {
        if (state.done || state.compacting) return state
        const cumulative = computeCumulativeTokens(state.exchanges)
        return [
          {
            ...state,
            streamPhase: "done",
            revealFraction: 1,
            compacting: true,
            contextBaseline: cumulative.currentContext,
            exchanges: state.exchanges.map((ex) => ({ ...ex, frozen: true })),
            autoTyping: null,
          },
          [fx.cancel("reveal"), fx.cancel("typing"), fx.delay(fastMode ? 300 : 3000, { type: "compactDone" })],
        ]
      }

      case "compactDone":
        return doAdvance({ ...state, compacting: false })

      case "pulse":
        return { ...state, pulse: !state.pulse }

      case "setCtrlDPending":
        return { ...state, ctrlDPending: msg.pending }

      default:
        return state
    }
  }
}

// ============================================================================
// Footer — owns inputText state so typing doesn't re-render the parent
// ============================================================================

interface FooterControl {
  setText: (text: string) => void
  getText: () => string
  getPlaceholder: () => string
}

const AUTO_SUBMIT_DELAY = 10_000

function DemoFooter({
  controlRef,
  onSubmit,
  streamPhase,
  done,
  compacting,
  exchanges,
  frozenCount = 0,
  contextBaseline = 0,
  ctrlDPending = false,
  nextMessage = "",
  autoTypingText = null,
}: {
  controlRef: React.RefObject<FooterControl>
  onSubmit: (text: string) => void
  streamPhase: StreamPhase
  done: boolean
  compacting: boolean
  exchanges: Exchange[]
  frozenCount?: number
  contextBaseline?: number
  ctrlDPending?: boolean
  nextMessage?: string
  autoTypingText?: string | null
}): JSX.Element {
  const terminalFocused = useTerminalFocused()
  const [inputText, setInputText] = useState("")
  const inputTextRef = useRef(inputText)
  inputTextRef.current = inputText

  // Elapsed time — lives here since it only affects the status bar
  const startRef = useRef(Date.now())
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - startRef.current) / 1000)), 1000)
    return () => clearInterval(timer)
  }, [])

  const [randomIdx, setRandomIdx] = useState(() => Math.floor(Math.random() * RANDOM_USER_COMMANDS.length))
  const randomPlaceholder = RANDOM_USER_COMMANDS[randomIdx % RANDOM_USER_COMMANDS.length]!
  const effectiveMessage = nextMessage || randomPlaceholder
  const placeholder = !terminalFocused
    ? "Click to focus"
    : ctrlDPending
      ? "Press Ctrl-D again to exit"
      : effectiveMessage

  const placeholderRef = useRef(placeholder)
  placeholderRef.current = placeholder

  controlRef.current = {
    setText: setInputText,
    getText: () => inputTextRef.current,
    getPlaceholder: () => placeholderRef.current,
  }

  // Auto-submit: if idle for AUTO_SUBMIT_DELAY, submit the placeholder message
  const autoSubmitRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (autoSubmitRef.current) clearTimeout(autoSubmitRef.current)
    if (
      done ||
      compacting ||
      streamPhase !== "done" ||
      !effectiveMessage ||
      inputText ||
      autoTypingText ||
      !terminalFocused
    )
      return
    autoSubmitRef.current = setTimeout(() => onSubmit(effectiveMessage), AUTO_SUBMIT_DELAY)
    return () => {
      if (autoSubmitRef.current) clearTimeout(autoSubmitRef.current)
    }
  }, [done, compacting, streamPhase, effectiveMessage, inputText, autoTypingText, onSubmit])

  const handleSubmit = useCallback(
    (text: string) => {
      if (!text.trim() && effectiveMessage) {
        onSubmit(effectiveMessage)
      } else {
        onSubmit(text)
      }
      setInputText("")
      setRandomIdx((i) => i + 1)
    },
    [onSubmit, effectiveMessage],
  )

  const displayText = autoTypingText ?? inputText

  return (
    <Box flexDirection="column" width="100%">
      <Text> </Text>
      <Box
        flexDirection="row"
        borderStyle="round"
        borderColor={!done && terminalFocused ? "$focusborder" : "$inputborder"}
        paddingX={1}
      >
        <Text bold color="$focusring">
          {"❯"}{" "}
        </Text>
        <Box flexShrink={1} flexGrow={1}>
          <TextInput
            value={displayText}
            onChange={autoTypingText ? () => {} : setInputText}
            onSubmit={handleSubmit}
            placeholder={placeholder}
            isActive={!done && !autoTypingText && terminalFocused}
          />
        </Box>
      </Box>
      <Box paddingX={2} width="100%">
        <StatusBar
          exchanges={exchanges}
          compacting={compacting}
          done={done}
          elapsed={elapsed}
          frozenCount={frozenCount}
          contextBaseline={contextBaseline}
          ctrlDPending={ctrlDPending}
        />
      </Box>
    </Box>
  )
}

// ============================================================================
// Main App — TEA-driven with ScrollbackList
// ============================================================================

/** Next scripted user message for footer placeholder. */
function getNextMessage(state: DemoState, script: ScriptEntry[], autoMode: boolean): string {
  if (autoMode || state.done || state.offScript || state.streamPhase !== "done" || state.exchanges.length === 0)
    return ""
  const entry = script[state.scriptIdx]
  return entry?.role === "user" ? entry.content : ""
}

export function CodingAgent({
  script,
  autoStart,
  fastMode,
}: {
  script: ScriptEntry[]
  autoStart: boolean
  fastMode: boolean
}): JSX.Element {
  const exit = useExit()
  const update = useMemo(() => createDemoUpdate(script, fastMode, autoStart), [script, fastMode, autoStart])
  const [state, send] = useTea(INIT_STATE, update)

  // Start on mount
  useEffect(() => {
    send({ type: "mount" })
  }, [send])

  // Auto-compact when context reaches 95%
  useEffect(() => {
    if (state.done || state.compacting) return
    const active = state.exchanges.filter((ex) => !ex.frozen)
    const cumulative = computeCumulativeTokens(active)
    const effective = Math.max(0, cumulative.currentContext - state.contextBaseline)
    if (effective >= CONTEXT_WINDOW * 0.95) send({ type: "compact" })
  }, [state.exchanges, state.done, state.compacting, state.contextBaseline, send])

  // Auto-exit in auto mode
  useEffect(() => {
    if (!autoStart || !state.done) return
    const timer = setTimeout(exit, 1000)
    return () => clearTimeout(timer)
  }, [autoStart, state.done, exit])

  const lastCtrlDRef = useRef(0)
  const footerControlRef = useRef<FooterControl>({ setText: () => {}, getText: () => "", getPlaceholder: () => "" })

  useInput((input: string, key: Key) => {
    if (key.escape) return "exit"
    if (key.ctrl && input === "d") {
      const now = Date.now()
      if (now - lastCtrlDRef.current < 500) return "exit"
      lastCtrlDRef.current = now
      send({ type: "setCtrlDPending", pending: true })
      return
    }
    if (lastCtrlDRef.current > 0) {
      lastCtrlDRef.current = 0
      send({ type: "setCtrlDPending", pending: false })
    }
    if (key.tab) {
      if (state.done || state.compacting) return
      const text = footerControlRef.current.getText()
      const placeholder = footerControlRef.current.getPlaceholder()
      send({ type: "submit", text: text.trim() ? text : placeholder })
      footerControlRef.current.setText("")
      return
    }
    if (key.ctrl && input === "l") {
      send({ type: "compact" })
      return
    }
  })

  const frozenCount = state.exchanges.filter((ex) => ex.frozen).length
  const nextMessage = getNextMessage(state, script, autoStart)

  return (
    <Box flexDirection="column" paddingX={1}>
      {frozenCount === 0 && (
        <Box flexDirection="column">
          <Text> </Text>
          <Text bold>Static Scrollback</Text>
          <Text> </Text>
          <Text>Coding agent simulation showcasing ScrollbackList:</Text>
          <Text> {"•"} ScrollbackList — declarative list with automatic scrollback</Text>
          <Text> {"•"} useScrollbackItem() — imperative freeze() from within items</Text>
          <Text> {"•"} isFrozen prop — data-driven freezing for completed items</Text>
          <Text> {"•"} OSC 8 hyperlinks — clickable file paths and URLs</Text>
          <Text>
            {" "}
            {"•"} OSC 133 markers — Cmd+{"↑"}/{"↓"} to jump between exchanges
          </Text>
          <Text> {"•"} $token theme colors — semantic color tokens</Text>
          <Text> </Text>
        </Box>
      )}

      <ScrollbackList
        items={state.exchanges}
        keyExtractor={(ex) => ex.id}
        isFrozen={(ex) => ex.frozen}
        markers={true}
        footer={
          <DemoFooter
            controlRef={footerControlRef}
            onSubmit={(text) => send({ type: "submit", text })}
            streamPhase={state.streamPhase}
            done={state.done}
            compacting={state.compacting}
            exchanges={state.exchanges}
            frozenCount={frozenCount}
            contextBaseline={state.contextBaseline}
            ctrlDPending={state.ctrlDPending}
            nextMessage={nextMessage}
            autoTypingText={state.autoTyping ? state.autoTyping.full.slice(0, state.autoTyping.revealed) : null}
          />
        }
      >
        {(exchange, index) => {
          const isLatest = index === state.exchanges.length - 1
          const prevRole = index > 0 ? state.exchanges[index - 1]!.role : null
          const nextRole = index < state.exchanges.length - 1 ? state.exchanges[index + 1]!.role : null

          return (
            <Box flexDirection="column">
              {index > 0 && <Text> </Text>}

              {state.compacting && isLatest && (
                <Box flexDirection="column" borderStyle="round" borderColor="$warning" paddingX={1} overflow="hidden">
                  <Text color="$warning" bold>
                    <Spinner type="arc" /> Compacting context
                  </Text>
                  <Text> </Text>
                  <Text color="$muted">Freezing exchanges into terminal scrollback. Scroll up to review.</Text>
                </Box>
              )}

              {state.done && autoStart && isLatest && (
                <Box flexDirection="column" borderStyle="round" borderColor="$success" paddingX={1}>
                  <Text color="$success" bold>
                    {"✓"} Session complete
                  </Text>
                  <Text color="$muted">
                    Scroll up to review — colors, borders, and hyperlinks preserved in scrollback.
                  </Text>
                </Box>
              )}

              <ExchangeItem
                exchange={exchange}
                streamPhase={state.streamPhase}
                revealFraction={state.revealFraction}
                pulse={state.pulse}
                isLatest={isLatest}
                isFirstInGroup={exchange.role !== prevRole}
                isLastInGroup={exchange.role !== nextRole}
              />
            </Box>
          )
        }}
      </ScrollbackList>
    </Box>
  )
}

// ============================================================================
// Main
// ============================================================================

export async function main() {
  const args = process.argv.slice(2)
  const isStress = args.includes("--stress")
  const isAuto = args.includes("--auto")
  const isFast = args.includes("--fast")

  const script = isStress ? generateStressScript() : SCRIPT

  // NOTE: Inline mode may exhibit a "jump up" during frame transitions due to
  // cursor offset calculation in the output phase. The main fix was applied in
  // prior commits (simplify inline mode, fix cursor offset). If content still
  // jumps, investigate inlineFullRender() scrollbackOffset tracking.
  const mode = args.includes("--fullscreen") ? "fullscreen" : "inline"
  using handle = await run(<CodingAgent script={script} autoStart={isAuto} fastMode={isFast} />, {
    mode: mode as "inline" | "fullscreen",
    focusReporting: true,
  })
  await handle.waitUntilExit()
}

if (import.meta.main) {
  main().catch(console.error)
}
