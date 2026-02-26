/**
 * Static Scrollback — Coding Agent Showcase
 *
 * Demonstrates inkx's ScrollbackList component for building apps where
 * completed items freeze into real terminal scrollback:
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
 * Key APIs demonstrated:
 *   - ScrollbackList — declarative list with automatic scrollback management
 *   - useScrollbackItem — imperative freeze() from within list items
 *   - isFrozen prop — data-driven freezing for items marked as complete
 *   - OSC 133 markers — terminal prompt navigation via markers prop
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
import {
  render,
  Box,
  Text,
  Link,
  Spinner,
  ScrollbackList,
  useScrollbackItem,
  useInput,
  useApp,
  createTerm,
  type Key,
} from "../../src/index.js"
import type { ExampleMeta } from "../_banner.js"

export const meta: ExampleMeta = {
  name: "Static Scrollback",
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
  Read: "\u{1F4D6}",
  Edit: "\u270F\uFE0F",
  Bash: "\u26A1",
  Write: "\u{1F4DD}",
  Glob: "\u{1F50D}",
  Grep: "\u{1F50E}",
}

/** Regex matching https/http URLs in output text. */
const URL_RE = /https?:\/\/[^\s)]+/g

// ============================================================================
// Script — Realistic coding agent story with thinking + tokens
// ============================================================================

const SCRIPT: ScriptEntry[] = [
  {
    role: "user",
    content: "Fix the login bug in auth.ts \u2014 expired tokens throw instead of refreshing.",
    tokens: { input: 42, output: 0 },
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
    tokens: { input: 1847, output: 312 },
  },
  {
    role: "agent",
    thinking:
      "Found it \u2014 decoded.exp is in seconds (Unix timestamp) but Date.now() returns milliseconds. Every token appears expired because exp (e.g. 1700000000) is always less than Date.now() (e.g. 1700000000000). I need to divide Date.now() by 1000, and change the throw to a refresh call.",
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
          "  \u2713 login with valid token (2ms)",
          "  \u2713 login with expired token refreshes (3ms)",
          "  \u2713 login with invalid token rejects (1ms)",
          "",
          "3 passed | 0 failed",
        ],
      },
    ],
    tokens: { input: 2489, output: 156 },
  },
  {
    role: "agent",
    content:
      "Fixed! The bug was comparing jwt.exp (seconds since epoch) with Date.now() (milliseconds). Expired tokens now trigger a refresh instead of throwing.",
    tokens: { input: 2601, output: 89 },
  },
  {
    role: "user",
    content: "Nice. Can you also add rate limiting to the login endpoint?",
    tokens: { input: 58, output: 0 },
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
    tokens: { input: 3245, output: 423 },
  },
  {
    role: "agent",
    thinking:
      "Good \u2014 there's already a RateLimiter abstraction. I just need to create an instance with appropriate settings (5 attempts per 60s window seems reasonable for login) and wire it into the auth route as middleware.",
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
    content:
      "\u{1F4E6} Compaction: clearing dynamic area. Scrollback preserved above \u2014 scroll up to review previous exchanges.",
  },
  {
    role: "agent",
    content:
      "Context recovered after compaction. I have the full conversation history. What would you like to work on next?",
    tokens: { input: 8012, output: 54 },
  },
  {
    role: "user",
    content:
      "Now add i18n support for error messages. We need \u65E5\u672C\u8A9E (Japanese) and Deutsch (German). \u{1F30D}",
    tokens: { input: 73, output: 0 },
  },
  {
    role: "agent",
    thinking:
      "i18n for error messages \u2014 I need to create translation JSON files for ja and de, then build a simple t() function that resolves message keys by locale. I'll also need to update the error responses in auth.ts to use t() with the request's locale.",
    content: "I'll create the translation files and update the error handling.",
    toolCalls: [
      {
        tool: "Write",
        args: "src/i18n/ja.json",
        output: [
          "{",
          '  "token_expired": "\u30C8\u30FC\u30AF\u30F3\u306E\u6709\u52B9\u671F\u9650\u304C\u5207\u308C\u307E\u3057\u305F \u{1F527}",',
          '  "rate_limited": "\u30EA\u30AF\u30A8\u30B9\u30C8\u304C\u591A\u3059\u304E\u307E\u3059\u3002\u5F8C\u3067\u3082\u3046\u4E00\u5EA6\u304A\u8A66\u3057\u304F\u3060\u3055\u3044",',
          '  "invalid_token": "\u7121\u52B9\u306A\u30C8\u30FC\u30AF\u30F3\u3067\u3059 \u{1F41B}",',
          '  "login_success": "\u30ED\u30B0\u30A4\u30F3\u6210\u529F \u2705"',
          "}",
        ],
      },
      {
        tool: "Write",
        args: "src/i18n/de.json",
        output: [
          "{",
          '  "token_expired": "Token abgelaufen",',
          '  "rate_limited": "Zu viele Anfragen. Bitte versuchen Sie es sp\u00E4ter",',
          '  "invalid_token": "Ung\u00FCltiges Token",',
          '  "login_success": "Anmeldung erfolgreich"',
          "}",
        ],
      },
    ],
    tokens: { input: 8934, output: 567 },
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
          "  \u2713 English fallback for unknown key",
          "  \u2713 Japanese: \u30C8\u30FC\u30AF\u30F3\u306E\u6709\u52B9\u671F\u9650\u304C\u5207\u308C\u307E\u3057\u305F \u{1F527}",
          "  \u2713 German: Token abgelaufen",
          "  \u2713 Emoji preserved in translations \u{1F41B}\u2705",
          "",
          "4 passed | 0 failed",
        ],
      },
    ],
    tokens: { input: 10234, output: 178 },
  },
  {
    role: "agent",
    content:
      "i18n support added with Japanese (\u65E5\u672C\u8A9E) and German (Deutsch) translations. Error messages are now locale-aware. \u{1F30D}\u2705",
    tokens: { input: 10401, output: 67 },
  },
  {
    role: "user",
    content: "Add a health check endpoint at /health that returns the service version.",
    tokens: { input: 52, output: 0 },
  },
  {
    role: "agent",
    thinking:
      "Simple task \u2014 read the version from package.json and expose it on GET /health alongside uptime. Quick implementation.",
    content: "Simple addition \u2014 reading package.json for the version, then adding the route.",
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
      "All done! Summary of changes:\n\u2022 Fixed token expiry bug (seconds vs milliseconds)\n\u2022 Added rate limiting (5 req/min per IP)\n\u2022 Added i18n support (\u65E5\u672C\u8A9E + Deutsch) \u{1F30D}\n\u2022 Added /health endpoint (v2.4.1)\n\nAll 21 tests pass. Ready to commit?",
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
    "src/i18n/\u65E5\u672C\u8A9E.json",
  ]

  let cumulativeInput = 4000

  for (let i = 0; i < 200; i++) {
    if (i % 5 === 0) {
      const prompts = [
        `Fix bug #${100 + i} in ${files[i % files.length]}`,
        `Add feature: ${["caching", "logging", "retry", "batching", "\u30D0\u30EA\u30C7\u30FC\u30B7\u30E7\u30F3"][i % 5]}`,
        `Refactor ${files[i % files.length]} \u2014 it's too complex \u{1F527}`,
        `Why is test #${i} failing? \u{1F41B}`,
        `Add \u65E5\u672C\u8A9E translations for module ${i}`,
      ]
      exchanges.push({
        role: "user",
        content: prompts[Math.floor(i / 5) % prompts.length]!,
        tokens: { input: 40 + (i % 30), output: 0 },
      })
    } else if (i % 5 === 4) {
      exchanges.push({
        role: "agent",
        content: `Done with batch ${Math.floor(i / 5) + 1}. ${3 + (i % 7)} tests pass. \u2705`,
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
              i % 10 === 0 ? `\u2713 \u30C6\u30B9\u30C8\u5408\u683C \u{1F389}` : `\u2713 done`,
            ],
          },
        ],
        tokens: { input: cumulativeInput, output: 120 + (i % 200) },
      })
    }

    if (i === 80 || i === 160) {
      exchanges.push({
        role: "system",
        content: `\u{1F4E6} Compaction #${i === 80 ? 1 : 2}: context cleared. Scrollback preserved above.`,
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
      <Text color="$muted" dim italic>
        {done ? (
          "\u25B8 "
        ) : (
          <>
            <Spinner type="dots" />{" "}
          </>
        )}
        thinking
      </Text>
      {!done && (
        <Text color="$muted" dim wrap="truncate">
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
  const icon = TOOL_ICONS[call.tool] ?? "\u25B8"

  return (
    <Box flexDirection="column" marginTop={0}>
      <Text>
        {phase === "running" ? (
          <>
            <Spinner type="dots" />{" "}
          </>
        ) : phase === "done" ? (
          <Text color="$success">{"\u2713 "}</Text>
        ) : (
          <Text color="$muted" dim>
            {"\u25CB "}
          </Text>
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
      {showCursor && <Text color="$primary">{"\u258C"}</Text>}
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
}: {
  exchange: Exchange
  streamPhase: "thinking" | "streaming" | "tools" | "done"
  revealFraction: number
  pulse: boolean
  isLatest: boolean
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
  const outlineColor = isUser ? "$primary" : "$success"
  const icon = isUser ? "\u276F" : "\u25C6"
  const name = isUser ? "You" : "Agent"
  const phase = isLatest ? streamPhase : "done"
  const fraction = isLatest ? revealFraction : 1

  // Token badge for agent exchanges
  const tokenBadge =
    exchange.tokens && !isUser && phase === "done" ? ` ${formatTokens(exchange.tokens.output)} tokens` : ""

  // Tool call phases
  const toolCalls = exchange.toolCalls ?? []
  const toolRevealCount = phase === "tools" || phase === "done" ? toolCalls.length : 0

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={outlineColor} paddingX={1}>
      {/* Header: icon + name + token badge */}
      <Text>
        <Text bold color={outlineColor}>
          <Text dimColor={!isUser && !pulse && phase !== "done"}>{icon}</Text> {name}
        </Text>
        {tokenBadge && (
          <Text color="$muted" dim>
            {tokenBadge}
          </Text>
        )}
      </Text>

      {/* Blank line before content */}
      <Text> </Text>

      {/* User content */}
      {isUser && <Text>{exchange.content}</Text>}

      {/* Thinking block */}
      {!isUser && exchange.thinking && (phase === "thinking" || phase === "streaming") && (
        <ThinkingBlock text={exchange.thinking} done={phase !== "thinking"} />
      )}

      {/* Agent content */}
      {!isUser && (phase === "streaming" || phase === "tools" || phase === "done") && (
        <StreamingText
          fullText={exchange.content}
          revealFraction={phase === "streaming" ? fraction : 1}
          showCursor={phase === "streaming" && fraction < 1}
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
              phase={phase === "done" ? "done" : i < toolRevealCount - 1 ? "done" : "running"}
            />
          ))}
        </Box>
      )}
    </Box>
  )
}

/** Status bar — single compact row. */
function StatusBar({
  exchanges,
  autoMode,
  compacting,
  done,
  elapsed,
}: {
  exchanges: Exchange[]
  autoMode: boolean
  compacting: boolean
  done: boolean
  elapsed: number
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
  const ctxBar = "\u2588".repeat(ctxFilled) + "\u2591".repeat(CTX_W - ctxFilled)

  // Build left and right as plain strings, pad with spaces to fill terminal width
  let keys: string
  if (compacting) keys = "compacting"
  else if (done) keys = "q quit"
  else if (autoMode) keys = `a stop  c compact  q quit${" auto"}`
  else keys = "\u23CE next  a auto  c compact  q quit"

  const left = `${elapsedStr}  ${keys}`
  const right = `ctx ${ctxBar} ${ctxPct}% \u00B7 ${cost}`
  const cols = process.stdout.columns ?? 120
  const pad = Math.max(1, cols - 2 - left.length - right.length) // -2 for paddingX

  return (
    <Text color="$muted" dim>
      {" "}
      <Text color="$primary">{elapsedStr}</Text>
      {"  "}
      {keys}
      {" ".repeat(pad)}
      {right}{" "}
    </Text>
  )
}

// ============================================================================
// Main App — uses ScrollbackList for declarative scrollback management
// ============================================================================

/** How many live turns to keep in the dynamic area before freezing to scrollback. */
const MAX_LIVE_TURNS = 4

/** Streaming phases: thinking -> streaming text -> tool calls -> done */
type StreamPhase = "thinking" | "streaming" | "tools" | "done"

function CodingAgent({
  script,
  autoStart,
  fastMode,
}: {
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
  const setCompacting = useCallback((v: boolean) => {
    compactingRef.current = v
    _setCompacting(v)
  }, [])
  const [pendingAdvance, setPendingAdvance] = useState(false)

  // Streaming state
  const [streamPhase, setStreamPhase] = useState<StreamPhase>("done")
  const [revealFraction, setRevealFraction] = useState(1)
  const phaseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const revealTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const autoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const nextIdRef = useRef(0)

  /** Cancel all streaming timers. */
  const cancelStreaming = useCallback(() => {
    if (phaseTimerRef.current) {
      clearTimeout(phaseTimerRef.current)
      phaseTimerRef.current = null
    }
    if (revealTimerRef.current) {
      clearInterval(revealTimerRef.current)
      revealTimerRef.current = null
    }
  }, [])

  /** Start streaming an exchange through its phases. */
  const startStreaming = useCallback(
    (entry: ScriptEntry, id: number) => {
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

      // Agent message: thinking -> streaming -> tools -> done
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
                phaseTimerRef.current = setTimeout(
                  () => {
                    setStreamPhase("done")
                  },
                  600 * (entry.toolCalls?.length ?? 1),
                )
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
              phaseTimerRef.current = setTimeout(
                () => {
                  setStreamPhase("done")
                },
                600 * (entry.toolCalls?.length ?? 1),
              )
            } else {
              setStreamPhase("done")
            }
          }
          setRevealFraction(frac)
        }, 50)
      }
    },
    [fastMode, cancelStreaming],
  )

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

      setTimeout(
        () => {
          setExchanges((prev) => prev.map((ex) => ({ ...ex, frozen: true })))
          setCompacting(false)
          setPendingAdvance(true)
        },
        fastMode ? 300 : 3000,
      )
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

    setTimeout(
      () => {
        setCompacting(false)
        setPendingAdvance(true)
      },
      fastMode ? 300 : 3000,
    )
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
    return () => {
      if (autoTimerRef.current) clearTimeout(autoTimerRef.current)
    }
  }, [autoMode, done, compacting, streamPhase, scriptIdx, advance])

  // Auto-compact on terminal resize
  useEffect(() => {
    const onResize = () => {
      if (!compactingRef.current && !done) compact()
    }
    process.stdout.on("resize", onResize)
    return () => {
      process.stdout.off("resize", onResize)
    }
  }, [compact, done])

  useInput((input: string, key: Key) => {
    if (input === "q" || key.escape) {
      exit()
      return
    }
    if (key.return && !autoMode) {
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

  // Count frozen for header display
  const frozenCount = exchanges.filter((ex) => ex.frozen).length

  return (
    <ScrollbackList
      items={exchanges}
      keyExtractor={(ex) => ex.id}
      isFrozen={(ex) => ex.frozen}
      markers={true}
      footer={
        <StatusBar exchanges={exchanges} autoMode={autoMode} compacting={compacting} done={done} elapsed={elapsed} />
      }
      footerHeight={1}
    >
      {(exchange, index) => {
        const isLatest = index === exchanges.length - 1

        // Header — shown as a pseudo-item before exchanges
        // (We handle this by checking if we should show info above the exchange)

        return (
          <Box flexDirection="column">
            {/* Show header info above first live exchange */}
            {index === 0 && (
              <Box flexDirection="column" paddingX={1}>
                <Text bold>Static Scrollback</Text>
                {frozenCount > 0 ? (
                  <Text color="$muted" dim>
                    {"\u2191"} {frozenCount} in scrollback (Cmd+{"\u2191"}/{"\u2193"} to navigate)
                  </Text>
                ) : (
                  <>
                    <Text> </Text>
                    <Text>Coding agent simulation showcasing ScrollbackList:</Text>
                    <Text> {"\u2022"} ScrollbackList \u2014 declarative list with automatic scrollback</Text>
                    <Text> {"\u2022"} useScrollbackItem() \u2014 imperative freeze() from within items</Text>
                    <Text> {"\u2022"} isFrozen prop \u2014 data-driven freezing for completed items</Text>
                    <Text> {"\u2022"} OSC 8 hyperlinks \u2014 clickable file paths and URLs</Text>
                    <Text>
                      {" "}
                      {"\u2022"} OSC 133 markers \u2014 Cmd+{"\u2191"}/{"\u2193"} to jump between exchanges
                    </Text>
                    <Text> {"\u2022"} $token theme colors \u2014 semantic color tokens</Text>
                  </>
                )}
              </Box>
            )}

            {/* Compaction overlay */}
            {compacting && isLatest && (
              <Box borderStyle="round" borderColor="$warning" paddingX={1}>
                <Text color="$warning">
                  <Spinner type="arc" /> Compacting context... freezing all turns to scrollback.
                </Text>
              </Box>
            )}

            {/* Done message */}
            {done && isLatest && (
              <Box flexDirection="column" borderStyle="round" borderColor="$success" paddingX={1}>
                <Text color="$success" bold>
                  {"\u2713"} Session complete
                </Text>
                <Text color="$muted">
                  Scroll up to review \u2014 colors, borders, and hyperlinks preserved in scrollback.
                </Text>
                <Text color="$muted" dim>
                  Try{" "}
                  <Text bold color="$primary">
                    Cmd+{"\u2191"}
                  </Text>
                  /
                  <Text bold color="$primary">
                    Cmd+{"\u2193"}
                  </Text>{" "}
                  to jump between exchanges.
                </Text>
              </Box>
            )}

            {/* The exchange itself */}
            {!compacting && (
              <ExchangeItem
                exchange={exchange}
                streamPhase={streamPhase}
                revealFraction={revealFraction}
                pulse={pulse}
                isLatest={isLatest}
              />
            )}
          </Box>
        )
      }}
    </ScrollbackList>
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
  using app = await render(<CodingAgent script={script} autoStart={isAuto} fastMode={isFast} />, term, {
    mode: "inline",
  })
  await app.waitUntilExit()
  // Explicit exit — inkx's unmount doesn't fully release all event loop references yet
  process.exit(0)
}

if (import.meta.main) {
  main().catch(console.error)
}
